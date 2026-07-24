import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infra/database/prisma.service';
import { Money } from '@shared/domain/money';
import { SettingsService } from '@shared/settings/settings.service';
import { AuditService } from '@shared/audit/audit.service';
import { DistributionPipeline, snapshotRule } from '../domain/distribution-pipeline';
import { DistributionResult, RuleBasis, TransactionContext } from '../domain/types';
import { RuleRepository } from '../infrastructure/rule.repository';
import { loadEnv } from '@/config/env';

const env = loadEnv();

@Injectable()
export class DistributionService {
  private readonly logger = new Logger(DistributionService.name);
  private readonly pipeline = new DistributionPipeline(env.MAX_DISTRIBUTION_LAYERS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RuleRepository,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Hitung distribusi tanpa menyimpan apa pun.
   *
   * Dipakai simulator dan pratinjau rantai di editor aturan. Dengan rule
   * composable, ini naik dari fitur nyaman jadi pengaman wajib: dampak sebuah
   * rule bergantung pada rule lain yang kebetulan cocok, dan itu mustahil
   * diprediksi di kepala.
   */
  async simulate(ctx: TransactionContext): Promise<DistributionResult> {
    const candidates = await this.rules.findCandidates({
      productCategory: ctx.productCategory,
      at: ctx.occurredAt,
    });
    return this.pipeline.execute(ctx, candidates);
  }

  /**
   * Jalankan dan CATAT distribusi untuk sebuah transaksi.
   *
   * Idempoten: unique constraint pada `transaction_id` menjamin satu transaksi
   * hanya pernah punya satu distribusi, bahkan bila event terkirim ganda.
   */
  async distribute(transactionId: string): Promise<{ id: string; code: string; created: boolean }> {
    // findFirst, bukan findUnique — transactionId sendiri bukan lagi unique
    // penuh di skema Prisma (unique-nya PARTIAL, cuma utk baris reversalOfId
    // IS NULL, lihat migrasi 20260724000000). reversalOfId: null persis
    // menangkap "distribusi ASLI transaksi ini", yang tetap dijamin tunggal
    // oleh partial unique index itu.
    const existing = await this.prisma.profitDistribution.findFirst({
      where: { transactionId, reversalOfId: null },
      select: { id: true, code: true },
    });
    if (existing) {
      this.logger.log(`Distribusi untuk ${transactionId} sudah ada, dilewati (idempoten)`);
      return { ...existing, created: false };
    }

    const trx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { product: { select: { category: true } } },
    });
    if (!trx) throw new NotFoundException(`Transaksi ${transactionId} tidak ditemukan`);
    if (trx.status !== 'COMPLETED') {
      throw new BadRequestException('Hanya transaksi COMPLETED yang bisa didistribusikan');
    }

    const ctx: TransactionContext = {
      transactionId: trx.id,
      productCategory: trx.product.category,
      netProfit: trx.netProfit,
      occurredAt: trx.completedAt ?? trx.createdAt,
    };

    const candidates = await this.rules.findCandidates({
      productCategory: ctx.productCategory,
      at: ctx.occurredAt,
    });
    const result = this.pipeline.execute(ctx, candidates);

    // Ambang batas approval (A5): nominal kecil final otomatis, nominal besar
    // wajib ditinjau. Distribusi bermasalah selalu masuk tinjauan apa pun nilainya.
    // Ambangnya sendiri dapat diubah admin lewat /settings, env cuma nilai awal.
    const threshold = await this.settings.getApprovalThresholdIdr();
    const needsReview = result.totalDistributed.value >= threshold || result.isFallback || result.overAllocated;

    const code = await this.nextCode();

    // Satu transaksi database: distribusi + lapisan + entry + ledger + outbox.
    // Kalau salah satunya gagal, tidak ada yang tercatat setengah jalan.
    const created = await this.prisma.$transaction(async (tx) => {
      const dist = await tx.profitDistribution.create({
        data: {
          code,
          transactionId: trx.id,
          netProfit: result.netProfit.value,
          totalDistributed: result.totalDistributed.value,
          retainedByCompany: result.retainedByCompany.value,
          isFallback: result.isFallback,
          overAllocated: result.overAllocated,
          status: needsReview ? 'PENDING_APPROVAL' : 'SETTLED',
          layers: {
            create: result.layers.map((layer) => ({
              layerIndex: layer.layerIndex,
              ruleId: layer.rule.id,
              ruleSnapshot: snapshotRule(layer.rule) as object,
              basisType: layer.basisType as RuleBasis,
              basisAmount: layer.basisAmount.value,
              allocatedAmount: layer.allocatedAmount.value,
              clamped: layer.clamped,
              entries: {
                create: layer.entries
                  .filter((e) => e.amount.isPositive())
                  .map((e) => ({
                    investorId: e.investorId,
                    basisPoints: e.basisPoints,
                    amount: e.amount.value,
                  })),
              },
            })),
          },
        },
        select: { id: true, code: true },
      });

      // Ledger dicatat real-time per transaksi (A6). Pencairan aktualnya
      // dijadwalkan periodik lewat PayoutBatch — SETTLED bukan berarti cair.
      if (!needsReview) {
        await this.writeLedgerEntries(tx, dist.id, result, ctx.occurredAt);
      }

      await tx.outboxEvent.create({
        data: {
          eventType: 'ProfitDistributed',
          aggregateType: 'ProfitDistribution',
          aggregateId: dist.id,
          payload: { distributionId: dist.id, transactionId: trx.id, status: needsReview ? 'PENDING_APPROVAL' : 'SETTLED' },
        },
      });

      return dist;
    });

    this.logger.log(
      `${code}: ${result.layers.length} lapisan · dibagikan ${result.totalDistributed.value} · ditahan ${result.retainedByCompany.value}${result.isFallback ? ' · FALLBACK' : ''}${result.overAllocated ? ' · OVER-ALLOCATED' : ''}`,
    );
    return { ...created, created: true };
  }

  /** Setujui distribusi yang menunggu, lalu catat ledger-nya. */
  async approve(distributionId: string, actorId: string): Promise<void> {
    const dist = await this.prisma.profitDistribution.findUnique({
      where: { id: distributionId },
      include: { layers: { include: { entries: true } } },
    });
    if (!dist) throw new NotFoundException('Distribusi tidak ditemukan');
    if (dist.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Distribusi berstatus ${dist.status}, bukan PENDING_APPROVAL`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.profitDistribution.update({
        where: { id: distributionId },
        data: { status: 'SETTLED', approvedBy: actorId, approvedAt: new Date() },
      });

      for (const layer of dist.layers) {
        for (const entry of layer.entries) {
          await this.appendLedger(tx, {
            investorId: entry.investorId,
            amount: entry.amount,
            entryType: 'PROFIT_SHARE',
            distributionId: dist.id,
            occurredAt: dist.distributedAt,
            description: `Bagi hasil ${dist.code}`,
          });
        }
      }
    });
  }

  async reject(distributionId: string, actorId: string, reason: string): Promise<void> {
    const dist = await this.prisma.profitDistribution.findUnique({ where: { id: distributionId } });
    if (!dist) throw new NotFoundException('Distribusi tidak ditemukan');
    if (dist.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Distribusi berstatus ${dist.status}, bukan PENDING_APPROVAL`);
    }
    await this.prisma.profitDistribution.update({
      where: { id: distributionId },
      data: { status: 'REJECTED', approvedBy: actorId, approvedAt: new Date(), rejectedReason: reason },
    });
  }

  /**
   * Batalkan sebuah distribusi yang SUDAH cair (SETTLED) — jawaban langsung
   * atas edge case studi kasus "transaksi dibatalkan/refund setelah distribusi
   * jalan". TIDAK menghapus atau mengedit entry lama (trigger database
   * melarangnya juga) — membuat distribusi REVERSAL baru yang menegasikan
   * setiap baris ledger asli, ditautkan lewat `reversalOfId`. Investor melihat
   * dua mutasi yang saling meniadakan di riwayatnya, bukan angka yang
   * tiba-tiba hilang.
   */
  async reverse(distributionId: string, actorId: string, reason: string): Promise<{ id: string; code: string }> {
    const original = await this.prisma.profitDistribution.findUnique({
      where: { id: distributionId },
      include: { ledgerEntries: true, transaction: { select: { id: true } }, reversedBy: { select: { id: true } } },
    });
    if (!original) throw new NotFoundException('Distribusi tidak ditemukan');
    if (original.status !== 'SETTLED') {
      throw new BadRequestException('Hanya distribusi SETTLED yang bisa dikembalikan dananya, karena belum cair tidak ada yang perlu dinegasikan');
    }
    if (original.reversedBy) {
      throw new BadRequestException('Distribusi ini sudah pernah dikembalikan dananya sebelumnya');
    }
    if (!reason.trim()) throw new BadRequestException('Alasan pengembalian dana wajib diisi');

    const code = await this.nextCode();

    const created = await this.prisma.$transaction(async (tx) => {
      const reversal = await tx.profitDistribution.create({
        data: {
          code,
          // Distribusi reversal tidak terikat unique-per-transaction seperti
          // distribusi biasa — satu transaksi bisa punya banyak koreksi
          // sepanjang waktu kalau perlu, makanya TIDAK memakai transactionId
          // yang sama sebagai constraint utama di sini; tautannya lewat
          // reversalOfId, bukan transactionId.
          transactionId: original.transactionId,
          netProfit: -original.netProfit,
          totalDistributed: -original.totalDistributed,
          retainedByCompany: -original.retainedByCompany,
          status: 'REVERSED',
          reversalOfId: original.id,
          approvedBy: actorId,
          approvedAt: new Date(),
          rejectedReason: reason,
        },
        select: { id: true, code: true },
      });

      for (const entry of original.ledgerEntries) {
        if (entry.entryType !== 'PROFIT_SHARE') continue;
        await this.appendLedger(tx, {
          investorId: entry.investorId,
          amount: -entry.amount,
          entryType: 'REVERSAL',
          distributionId: reversal.id,
          occurredAt: new Date(),
          description: `Pengembalian dana ${original.code}: ${reason}`,
        });
      }

      await tx.profitDistribution.update({ where: { id: original.id }, data: { status: 'REVERSED' } });
      await tx.transaction.update({ where: { id: original.transactionId }, data: { status: 'REFUNDED' } });

      await this.audit.log(
        {
          actorId,
          action: 'distribution.reverse',
          aggregateType: 'ProfitDistribution',
          aggregateId: original.id,
          metadata: { reason, reversalId: reversal.id, reversalCode: reversal.code },
        },
        tx,
      );

      return reversal;
    });

    this.logger.log(`${original.code} dikembalikan dananya lewat ${created.code}, alasan ${reason}`);
    return created;
  }

  private async writeLedgerEntries(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    distributionId: string,
    result: DistributionResult,
    occurredAt: Date,
  ): Promise<void> {
    // Gabungkan porsi investor yang muncul di lebih dari satu lapisan menjadi
    // satu mutasi — investor melihat "bagi hasil dari transaksi X", bukan dua
    // baris misterius yang harus mereka jumlahkan sendiri.
    const totals = new Map<string, bigint>();
    for (const layer of result.layers) {
      for (const e of layer.entries) {
        if (!e.amount.isPositive()) continue;
        totals.set(e.investorId, (totals.get(e.investorId) ?? 0n) + e.amount.value);
      }
    }
    for (const [investorId, amount] of totals) {
      await this.appendLedger(tx, {
        investorId,
        amount,
        entryType: 'PROFIT_SHARE',
        distributionId,
        occurredAt,
        description: 'Bagi hasil',
      });
    }
  }

  /**
   * Tambah satu baris ledger dengan saldo berjalan.
   *
   * `balanceAfter` bukan duplikasi ceroboh — ia checksum berjalan. Job
   * rekonsiliasi memverifikasi kolom ini terhadap SUM(amount) seluruh baris
   * sebelumnya; selisih berarti alarm, bukan misteri.
   */
  private async appendLedger(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    input: {
      investorId: string;
      amount: bigint;
      entryType: 'PROFIT_SHARE' | 'PAYOUT' | 'REVERSAL' | 'ADJUSTMENT';
      distributionId?: string;
      payoutItemId?: string;
      occurredAt: Date;
      description?: string;
    },
  ): Promise<void> {
    const last = await tx.investorLedgerEntry.findFirst({
      where: { investorId: input.investorId },
      orderBy: { sequenceNo: 'desc' },
      select: { balanceAfter: true },
    });
    const balanceAfter = (last?.balanceAfter ?? 0n) + input.amount;

    await tx.investorLedgerEntry.create({
      data: {
        investorId: input.investorId,
        entryType: input.entryType,
        amount: input.amount,
        balanceAfter,
        distributionId: input.distributionId,
        payoutItemId: input.payoutItemId,
        occurredAt: input.occurredAt,
        description: input.description,
      },
    });
  }

  private async nextCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.profitDistribution.count();
    return `DST-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  /** Saldo investor dihitung dari ledger, bukan dari kolom saldo. */
  async balanceOf(investorId: string): Promise<Money> {
    const last = await this.prisma.investorLedgerEntry.findFirst({
      where: { investorId },
      orderBy: { sequenceNo: 'desc' },
      select: { balanceAfter: true },
    });
    return Money.from(last?.balanceAfter ?? 0n);
  }

  /**
   * Tren bagi hasil 6 bulan kalender terakhir, diagregasi dari ledger.
   *
   * Selalu mengembalikan tepat 6 baris (via generate_series) — bulan tanpa
   * mutasi tampil sebagai Rp 0 yang NYATA, bukan disembunyikan atau dikarang
   * supaya grafiknya terlihat lebih ramai daripada kenyataannya.
   */
  async monthlyTrend(investorId: string): Promise<{ month: string; total: string }[]> {
    const rows = await this.prisma.$queryRaw<{ month: string; total: string }[]>`
      WITH months AS (
        SELECT to_char(gs, 'YYYY-MM') AS month
        FROM generate_series(
          date_trunc('month', now()) - interval '5 months',
          date_trunc('month', now()),
          interval '1 month'
        ) AS gs
      )
      SELECT m.month, COALESCE(SUM(e.amount), 0)::text AS total
      FROM months m
      LEFT JOIN investor_ledger_entries e
        ON to_char(date_trunc('month', e.occurred_at), 'YYYY-MM') = m.month
        AND e.investor_id = ${investorId}
        AND e.entry_type = 'PROFIT_SHARE'
      GROUP BY m.month
      ORDER BY m.month ASC
    `;
    return rows;
  }

  /**
   * Tren bulanan PERUSAHAAN (bukan per investor) untuk dashboard admin —
   * "Laba Bersih & Dibagikan" di ux-spec.md §7.1. Dua garis nyata dari data
   * yang sudah ada: laba bersih dari transaksi selesai, dibagikan dari
   * distribusi yang tercatat. Bulan tanpa aktivitas tampil nol yang nyata.
   */
  async companyMonthlyTrend(): Promise<{ month: string; netProfit: string; distributed: string }[]> {
    const rows = await this.prisma.$queryRaw<{ month: string; net_profit: string; distributed: string }[]>`
      WITH months AS (
        SELECT to_char(gs, 'YYYY-MM') AS month
        FROM generate_series(
          date_trunc('month', now()) - interval '5 months',
          date_trunc('month', now()),
          interval '1 month'
        ) AS gs
      ),
      profit AS (
        SELECT to_char(date_trunc('month', completed_at), 'YYYY-MM') AS month, SUM(net_profit) AS net_profit
        FROM transactions WHERE status = 'COMPLETED'
        GROUP BY 1
      ),
      dist AS (
        SELECT to_char(date_trunc('month', distributed_at), 'YYYY-MM') AS month, SUM(total_distributed) AS distributed
        FROM profit_distributions
        GROUP BY 1
      )
      SELECT m.month,
        COALESCE(p.net_profit, 0)::text AS net_profit,
        COALESCE(d.distributed, 0)::text AS distributed
      FROM months m
      LEFT JOIN profit p ON p.month = m.month
      LEFT JOIN dist d ON d.month = m.month
      ORDER BY m.month ASC
    `;
    return rows.map((r) => ({ month: r.month, netProfit: r.net_profit, distributed: r.distributed }));
  }

  /**
   * Distribusi per investor untuk dashboard admin — "Distribusi per
   * Investor" di ux-spec.md §7.1. Dibatasi 5 + "Lainnya" DENGAN SENGAJA:
   * menambah warna untuk investor ke-9 menghasilkan warna yang tak
   * terbedakan di bawah CVD (lihat design.md § Data-viz contract).
   */
  async distributionByInvestor(): Promise<{ investorId: string | null; name: string; total: string }[]> {
    const rows = await this.prisma.$queryRaw<{ investor_id: string; name: string; total: string }[]>`
      SELECT i.id AS investor_id, i.name, SUM(e.amount)::text AS total
      FROM investor_ledger_entries e
      JOIN investors i ON i.id = e.investor_id
      WHERE e.entry_type = 'PROFIT_SHARE'
      GROUP BY i.id, i.name
      ORDER BY SUM(e.amount) DESC
    `;

    const top: { investorId: string | null; name: string; total: string }[] = rows
      .slice(0, 5)
      .map((r) => ({ investorId: r.investor_id, name: r.name, total: r.total }));
    const rest = rows.slice(5);
    if (rest.length > 0) {
      const restTotal = rest.reduce((acc, r) => acc + BigInt(r.total), 0n);
      top.push({ investorId: null, name: `Lainnya (${rest.length})`, total: restTotal.toString() });
    }
    return top;
  }

  /**
   * Versi "explain" khusus untuk investor — disaring DI SERVER, bukan dengan
   * menyembunyikan kolom di klien.
   *
   * Menyembunyikan data sensitif di frontend saja tidak pernah cukup; siapa pun
   * yang membuka devtools bisa melihat response mentahnya. Query ini tidak
   * pernah mengambil `entries` milik investor lain sama sekali — data yang
   * tidak pernah meninggalkan database tidak bisa bocor lewat cara apa pun.
   *
   * Mengembalikan `null` (bukan objek kosong) kalau investor ini tidak punya
   * porsi di distribusi tersebut — pemanggil mengubahnya jadi 404, sehingga
   * investor tidak bisa memastikan sebuah distribusi ada hanya karena
   * responsnya bukan error.
   */
  async explainForInvestor(distributionId: string, investorId: string) {
    const dist = await this.prisma.profitDistribution.findUnique({
      where: { id: distributionId },
      include: {
        transaction: { select: { code: true, product: { select: { name: true, category: true } } } },
        layers: {
          orderBy: { layerIndex: 'asc' },
          include: {
            rule: { select: { id: true, name: true } },
            // Hanya entry milik investor ini yang pernah diambil dari database.
            entries: { where: { investorId }, select: { basisPoints: true, amount: true } },
          },
        },
      },
    });
    if (!dist) return null;

    const layersWithMyEntry = dist.layers.filter((l) => l.entries.length > 0);
    if (layersWithMyEntry.length === 0) return null; // tidak punya porsi di sini

    const myTotal = layersWithMyEntry.reduce(
      (acc, l) => acc + l.entries.reduce((a, e) => a + e.amount, 0n),
      0n,
    );

    return {
      code: dist.code,
      status: dist.status,
      distributedAt: dist.distributedAt,
      transactionCode: dist.transaction.code,
      productName: dist.transaction.product.name,
      productCategory: dist.transaction.product.category,
      netProfit: dist.netProfit.toString(),
      myTotal: myTotal.toString(),
      // "Dasar hitung" per lapisan tetap ditampilkan (angka publik terhadap
      // laba transaksi), tapi porsi investor LAIN pada lapisan yang sama
      // tidak pernah ikut terkirim.
      layers: layersWithMyEntry.map((l) => ({
        layerIndex: l.layerIndex,
        ruleName: l.rule.name,
        basisType: l.basisType,
        basisAmount: l.basisAmount.toString(),
        myAmount: l.entries.reduce((a, e) => a + e.amount, 0n).toString(),
        myBasisPoints: l.entries[0]?.basisPoints ?? 0,
      })),
    };
  }
}
