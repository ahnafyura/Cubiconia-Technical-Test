import { describe, expect, it } from 'vitest';
import { Money } from '../../src/shared/domain/money';
import { DistributionPipeline, snapshotRule } from '../../src/modules/profit-sharing/domain/distribution-pipeline';
import { RuleBasis, RuleSpec, TransactionContext } from '../../src/modules/profit-sharing/domain/types';
import { computeSpecificity, orderChain } from '../../src/modules/profit-sharing/domain/rule-matcher';

// ── helpers ────────────────────────────────────────────────────────────────

let seq = 0;
function rule(over: Partial<RuleSpec> = {}): RuleSpec {
  seq += 1;
  return {
    id: `rule-${String(seq).padStart(3, '0')}`,
    name: `Rule ${seq}`,
    version: 1,
    productCategory: null,
    minProfit: null,
    maxProfit: null,
    validFrom: new Date('2026-01-01'),
    validTo: null,
    executionOrder: 100,
    stackable: true,
    basis: RuleBasis.RESIDUAL,
    priority: 0,
    specificity: 0,
    isSystemDefault: false,
    createdAt: new Date('2026-01-01'),
    shares: [],
    ...over,
  };
}

function share(investorId: string, basisPoints: number) {
  return { investorId, investorName: investorId, basisPoints };
}

function ctx(over: Partial<TransactionContext> = {}): TransactionContext {
  return {
    transactionId: 'trx-1',
    productCategory: 'Elektronik',
    netProfit: 10_500_000n,
    occurredAt: new Date('2026-07-22'),
    ...over,
  };
}

const pipeline = new DistributionPipeline();

// ── invarian uang ──────────────────────────────────────────────────────────

describe('invarian: uang tidak pernah tercipta atau hilang', () => {
  it('totalDistributed + retainedByCompany selalu persis sama dengan netProfit', () => {
    const r = pipeline.execute(ctx(), [
      rule({ executionOrder: 10, basis: RuleBasis.RESIDUAL, shares: [share('A', 1200), share('B', 800)] }),
      rule({ executionOrder: 20, basis: RuleBasis.GROSS, shares: [share('A', 1800), share('C', 1200)] }),
    ]);

    expect(r.totalDistributed.plus(r.retainedByCompany).value).toBe(10_500_000n);
  });

  it('jumlah seluruh entry sama dengan totalDistributed', () => {
    const r = pipeline.execute(ctx(), [
      rule({ executionOrder: 10, shares: [share('A', 1234), share('B', 4321)] }),
      rule({ executionOrder: 20, shares: [share('C', 999)] }),
    ]);

    const sumEntries = Money.sum(r.layers.flatMap((l) => l.entries.map((e) => e.amount)));
    expect(sumEntries.value).toBe(r.totalDistributed.value);
  });

  // Pengujian acak — inilah yang menangkap bug pembulatan yang tidak akan pernah
  // muncul di test dengan angka bulat. Persentase ganjil pada nominal ganjil
  // adalah tempat kesalahan uang benar-benar bersembunyi.
  it('invarian bertahan untuk 2.000 kombinasi acak nominal & persentase', () => {
    let rng = 42;
    const next = (max: number) => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng % max;
    };

    for (let i = 0; i < 2000; i++) {
      const netProfit = BigInt(next(9_999_999_999)) + 1n;
      const layerCount = 1 + next(4);

      const rules = Array.from({ length: layerCount }, (_, k) => {
        const shareCount = 1 + next(4);
        return rule({
          executionOrder: k * 10,
          basis: next(2) === 0 ? RuleBasis.GROSS : RuleBasis.RESIDUAL,
          shares: Array.from({ length: shareCount }, (_, j) => share(`INV-${j}`, next(4000))),
        });
      });

      const r = pipeline.execute(ctx({ netProfit }), rules);
      const sumEntries = Money.sum(r.layers.flatMap((l) => l.entries.map((e) => e.amount)));

      expect(r.totalDistributed.plus(r.retainedByCompany).value).toBe(netProfit);
      expect(sumEntries.value).toBe(r.totalDistributed.value);
      expect(r.retainedByCompany.isNegative()).toBe(false);
      expect(r.totalDistributed.isNegative()).toBe(false);
    }
  });
});

// ── perilaku rantai composable ─────────────────────────────────────────────

describe('rantai composable', () => {
  it('GROSS menghitung dari laba awal, RESIDUAL dari sisa berjalan', () => {
    const r = pipeline.execute(ctx({ netProfit: 10_000_000n }), [
      rule({ executionOrder: 10, basis: RuleBasis.RESIDUAL, shares: [share('A', 2000)] }), // 20% × 10jt = 2jt
      rule({ executionOrder: 20, basis: RuleBasis.GROSS, shares: [share('B', 3000)] }),    // 30% × 10jt = 3jt
      rule({ executionOrder: 30, basis: RuleBasis.RESIDUAL, shares: [share('C', 2500)] }), // 25% × 5jt  = 1,25jt
    ]);

    expect(r.layers[0].allocatedAmount.value).toBe(2_000_000n);
    expect(r.layers[0].remainingAfter.value).toBe(8_000_000n);

    expect(r.layers[1].basisAmount.value).toBe(10_000_000n); // GROSS → laba awal
    expect(r.layers[1].allocatedAmount.value).toBe(3_000_000n);
    expect(r.layers[1].remainingAfter.value).toBe(5_000_000n);

    expect(r.layers[2].basisAmount.value).toBe(5_000_000n); // RESIDUAL → sisa
    expect(r.layers[2].allocatedAmount.value).toBe(1_250_000n);

    expect(r.retainedByCompany.value).toBe(3_750_000n);
  });

  it('stackable=false menutup rantai — persis perilaku winner-takes-all', () => {
    const r = pipeline.execute(ctx({ netProfit: 10_000_000n }), [
      rule({ executionOrder: 10, stackable: false, shares: [share('A', 3000)] }),
      rule({ executionOrder: 20, shares: [share('B', 5000)] }), // tidak pernah jalan
    ]);

    expect(r.layers).toHaveLength(1);
    expect(r.totalDistributed.value).toBe(3_000_000n);
    expect(r.retainedByCompany.value).toBe(7_000_000n);
  });

  it('rantai dipotong pada batas maksimum lapisan', () => {
    const many = Array.from({ length: 25 }, (_, k) =>
      rule({ executionOrder: k, shares: [share(`INV-${k}`, 100)] }),
    );
    const r = new DistributionPipeline(10).execute(ctx(), many);
    expect(r.layers.length).toBeLessThanOrEqual(10);
  });

  it('berhenti begitu sisa habis, tidak menjalankan lapisan sia-sia', () => {
    const r = pipeline.execute(ctx({ netProfit: 1_000_000n }), [
      rule({ executionOrder: 10, basis: RuleBasis.RESIDUAL, shares: [share('A', 10_000)] }), // 100%
      rule({ executionOrder: 20, shares: [share('B', 5000)] }),
    ]);

    expect(r.retainedByCompany.value).toBe(0n);
    expect(r.layers).toHaveLength(1);
  });
});

// ── pagar pengaman ─────────────────────────────────────────────────────────

describe('pagar over-allocation', () => {
  it('memotong proporsional, menandai, dan tetap menjalankan distribusi', () => {
    const r = pipeline.execute(ctx({ netProfit: 1_000_000n }), [
      rule({ executionOrder: 10, basis: RuleBasis.GROSS, shares: [share('A', 8000)] }),  // 800rb
      rule({ executionOrder: 20, basis: RuleBasis.GROSS, shares: [share('B', 8000)] }),  // minta 800rb, sisa 200rb
    ]);

    expect(r.overAllocated).toBe(true);
    expect(r.layers[1].clamped).toBe(true);
    expect(r.layers[1].allocatedAmount.value).toBe(200_000n);
    expect(r.totalDistributed.plus(r.retainedByCompany).value).toBe(1_000_000n);
    expect(r.retainedByCompany.isNegative()).toBe(false);
  });
});

describe('fallback saat tidak ada rule cocok', () => {
  it('menahan seluruh laba dan menandainya untuk ditinjau', () => {
    const r = pipeline.execute(ctx({ productCategory: 'Furnitur' }), [
      rule({ productCategory: 'Elektronik', shares: [share('A', 2000)] }),
    ]);

    expect(r.isFallback).toBe(true);
    expect(r.layers).toHaveLength(0);
    expect(r.retainedByCompany.value).toBe(10_500_000n);
    expect(r.totalDistributed.isZero()).toBe(true);
  });

  it('transaksi rugi tidak membagi apa pun dan tidak dianggap error', () => {
    const r = pipeline.execute(ctx({ netProfit: -500_000n }), [
      rule({ shares: [share('A', 2000)] }),
    ]);

    expect(r.totalDistributed.isZero()).toBe(true);
    expect(r.retainedByCompany.value).toBe(-500_000n);
  });
});

// ── matching & urutan ──────────────────────────────────────────────────────

describe('matching kondisi', () => {
  it('menghormati rentang laba dan periode berlaku', () => {
    const r = pipeline.execute(ctx({ netProfit: 10_000_000n }), [
      rule({ executionOrder: 10, minProfit: 50_000_000n, shares: [share('A', 5000)] }),   // di bawah ambang
      rule({ executionOrder: 20, validTo: new Date('2026-01-31'), shares: [share('B', 1000)] }), // kedaluwarsa
      rule({ executionOrder: 30, shares: [share('C', 2000)] }),                            // cocok
    ]);

    expect(r.layers).toHaveLength(1);
    expect(r.layers[0].entries[0].investorId).toBe('C');
  });

  it('urutan rantai deterministik dan total, tanpa bergantung urutan masukan', () => {
    const a = rule({ executionOrder: 10, priority: 5 });
    const b = rule({ executionOrder: 10, priority: 9 });
    const c = rule({ executionOrder: 5 });

    const one = orderChain([a, b, c]).map((r) => r.id);
    const two = orderChain([c, b, a]).map((r) => r.id);
    const three = orderChain([b, a, c]).map((r) => r.id);

    expect(one).toEqual([c.id, b.id, a.id]);
    expect(two).toEqual(one);
    expect(three).toEqual(one);
  });

  it('spesifisitas memakai bobot bertingkat 4/2/1', () => {
    expect(computeSpecificity({ productCategory: 'X', minProfit: 1n, maxProfit: null, validTo: new Date() })).toBe(7);
    expect(computeSpecificity({ productCategory: 'X', minProfit: null, maxProfit: null, validTo: null })).toBe(4);
    expect(computeSpecificity({ productCategory: null, minProfit: null, maxProfit: null, validTo: null })).toBe(0);
  });
});

// ── janji utama studi kasus ────────────────────────────────────────────────

describe('regresi temporal — janji inti studi kasus', () => {
  it('mengubah rule setelahnya tidak mengubah hasil distribusi yang sudah jalan', () => {
    const original = rule({ executionOrder: 10, shares: [share('A', 2000), share('B', 1000)] });

    const before = pipeline.execute(ctx({ netProfit: 10_000_000n }), [original]);
    const snapshot = snapshotRule(original);

    // Admin mengubah skema — di sistem nyata ini membuat versi baru, tapi di sini
    // kita mutasi objeknya langsung justru untuk membuktikan snapshot-nya kebal.
    original.shares = [share('A', 9000)];
    original.version = 2;

    expect(before.layers[0].entries[0].amount.value).toBe(2_000_000n);
    expect(before.totalDistributed.value).toBe(3_000_000n);
    expect((snapshot.shares as { basisPoints: number }[])[0].basisPoints).toBe(2000);
    expect(snapshot.version).toBe(1);
  });

  it('setiap lapisan bisa direkonstruksi: rule mana, dasar berapa, ambil berapa', () => {
    const r = pipeline.execute(ctx({ netProfit: 10_500_000n }), [
      rule({ name: 'Dasar Semua Produk', executionOrder: 10, shares: [share('A', 1200), share('B', 800)] }),
      rule({ name: 'Kategori Elektronik', executionOrder: 20, basis: RuleBasis.GROSS, productCategory: 'Elektronik', shares: [share('A', 1800), share('C', 1200)] }),
    ]);

    expect(r.layers[0].rule.name).toBe('Dasar Semua Produk');
    expect(r.layers[0].basisAmount.value).toBe(10_500_000n);
    expect(r.layers[0].allocatedAmount.value).toBe(2_100_000n);
    expect(r.layers[1].rule.name).toBe('Kategori Elektronik');
    expect(r.layers[1].basisAmount.value).toBe(10_500_000n); // GROSS
    expect(r.layers[1].allocatedAmount.value).toBe(3_150_000n);
    expect(r.retainedByCompany.value).toBe(5_250_000n);

    // Angka-angka ini persis yang ditampilkan wireframe air terjun di ux-spec.md
    expect(r.layers[1].entries.find((e) => e.investorId === 'A')!.amount.value).toBe(1_890_000n);
  });
});
