import { Money } from '@shared/domain/money';
import {
  AllocationEntry,
  DistributionLayerResult,
  DistributionResult,
  MAX_DISTRIBUTION_LAYERS,
  RuleBasis,
  RuleSpec,
  TransactionContext,
} from './types';
import { buildChain } from './rule-matcher';

/**
 * Pipeline pembagian keuntungan — inti studi kasus.
 *
 * Laba bersih mengalir melewati rantai rule terurut. Setiap rule mengambil
 * porsinya, sisanya diteruskan ke rule berikutnya. Yang membuat model ini layak
 * dipakai: SATU mekanisme melayani tiga kebutuhan sekaligus —
 *
 *   · rule tunggal `stackable = false`  → persis winner-takes-all
 *   · beberapa rule `stackable = true`  → komposisi berlapis
 *   · campuran keduanya                 → mode hybrid
 *
 * Naik ke skema yang lebih fleksibel nanti tidak butuh migrasi; cukup ubah data.
 *
 * Invarian yang dijamin fungsi ini, tanpa pengecualian:
 *
 *     totalDistributed + retainedByCompany === netProfit
 *
 * Kelas ini murni: tanpa NestJS, tanpa Prisma, tanpa I/O. Ia bisa diuji tanpa
 * menyalakan apa pun — dan justru bagian inilah yang paling wajib diuji.
 */
export class DistributionPipeline {
  constructor(private readonly maxLayers: number = MAX_DISTRIBUTION_LAYERS) {}

  execute(
    ctx: TransactionContext,
    activeRules: readonly RuleSpec[],
  ): DistributionResult {
    const netProfit = Money.from(ctx.netProfit);

    // Laba nol atau negatif tidak punya apa pun untuk dibagi. Bukan error —
    // transaksi rugi itu kenyataan bisnis, bukan kondisi luar dugaan.
    if (!netProfit.isPositive()) {
      return this.nothingToDistribute(netProfit);
    }

    const chain = buildChain(activeRules, ctx).slice(0, this.maxLayers);

    if (chain.length === 0) {
      return this.fallback(netProfit);
    }

    let remaining = netProfit;
    let overAllocated = false;
    const layers: DistributionLayerResult[] = [];

    for (const [layerIndex, rule] of chain.entries()) {
      if (!remaining.isPositive()) break;

      // GROSS  = persentase dari laba bersih awal
      // RESIDUAL = persentase dari sisa berjalan
      //
      // Tanpa pembeda ini, "20%" jadi ambigu begitu ada lebih dari satu lapisan.
      // Ambiguitas semacam itu pada sistem yang membagi uang tidak boleh hidup
      // di kepala masing-masing admin.
      const basisAmount = rule.basis === RuleBasis.GROSS ? netProfit : remaining;

      const { parts } = basisAmount.allocate(rule.shares);
      let amounts = parts;
      let consumed = Money.sum(amounts);
      let clamped = false;

      // Pagar: rantai salah konfigurasi tidak boleh menciptakan uang.
      if (consumed.greaterThan(remaining)) {
        amounts = Money.scaleDownTo(amounts, remaining);
        consumed = Money.sum(amounts);
        clamped = true;
        overAllocated = true;
      }

      const entries: AllocationEntry[] = rule.shares.map((share, i) => ({
        investorId: share.investorId,
        investorName: share.investorName,
        basisPoints: share.basisPoints,
        amount: amounts[i] ?? Money.ZERO,
      }));

      remaining = remaining.minus(consumed);

      layers.push({
        layerIndex,
        rule,
        basisType: rule.basis,
        basisAmount,
        allocatedAmount: consumed,
        remainingAfter: remaining,
        clamped,
        entries,
      });

      // Rule penutup rantai — inilah yang membuat winner-takes-all jadi kasus
      // khusus dari mekanisme yang sama, bukan cabang kode terpisah.
      if (!rule.stackable) break;
    }

    return {
      netProfit,
      layers,
      totalDistributed: netProfit.minus(remaining),
      // Seluruh sisa — termasuk sisa pembulatan — jatuh ke perusahaan (A2 + A7).
      retainedByCompany: remaining,
      isFallback: false,
      overAllocated,
    };
  }

  /**
   * Tidak ada rule yang cocok. Profit tidak pernah hilang dan tidak pernah
   * terbagi diam-diam tanpa aturan yang disengaja: seluruhnya ditahan, lalu
   * ditandai agar muncul di antrean tinjauan admin.
   */
  private fallback(netProfit: Money): DistributionResult {
    return {
      netProfit,
      layers: [],
      totalDistributed: Money.ZERO,
      retainedByCompany: netProfit,
      isFallback: true,
      overAllocated: false,
    };
  }

  private nothingToDistribute(netProfit: Money): DistributionResult {
    return {
      netProfit,
      layers: [],
      totalDistributed: Money.ZERO,
      retainedByCompany: netProfit,
      isFallback: false,
      overAllocated: false,
    };
  }
}

/**
 * Snapshot rule untuk disimpan bersama lapisannya.
 *
 * Wujud konkret dari prinsip "snapshot at execution time": salinan utuh rule
 * beserta seluruh persentase investor pada detik distribusi terjadi. Bahkan bila
 * rule kelak dihapus, pertanyaan "kenapa investor A menerima Rp 3.150.000 dari
 * transaksi ini?" tetap bisa dijawab lengkap.
 */
export function snapshotRule(rule: RuleSpec): Record<string, unknown> {
  return {
    id: rule.id,
    name: rule.name,
    version: rule.version,
    productCategory: rule.productCategory,
    minProfit: rule.minProfit?.toString() ?? null,
    maxProfit: rule.maxProfit?.toString() ?? null,
    validFrom: rule.validFrom.toISOString(),
    validTo: rule.validTo?.toISOString() ?? null,
    executionOrder: rule.executionOrder,
    stackable: rule.stackable,
    basis: rule.basis,
    priority: rule.priority,
    specificity: rule.specificity,
    shares: rule.shares.map((s) => ({
      investorId: s.investorId,
      investorName: s.investorName,
      basisPoints: s.basisPoints,
    })),
    snapshotAt: new Date().toISOString(),
  };
}
