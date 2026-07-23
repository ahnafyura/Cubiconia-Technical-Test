import { RuleSpec, TransactionContext } from './types';

/**
 * Menentukan rule mana saja yang kondisinya terpenuhi untuk sebuah transaksi,
 * lalu mengurutkannya menjadi rantai eksekusi yang deterministik.
 *
 * Catatan penting: dengan rule composable, beberapa rule cocok bersamaan BUKAN
 * konflik yang harus diselesaikan — itu justru perilaku yang diminta. Urutan
 * tetap harus deterministik, tapi tujuannya bukan memilih satu pemenang.
 */

export function matches(rule: RuleSpec, ctx: TransactionContext): boolean {
  if (rule.productCategory !== null && rule.productCategory !== ctx.productCategory) {
    return false;
  }
  if (rule.minProfit !== null && ctx.netProfit < rule.minProfit) return false;
  if (rule.maxProfit !== null && ctx.netProfit > rule.maxProfit) return false;

  const at = ctx.occurredAt.getTime();
  if (at < rule.validFrom.getTime()) return false;
  if (rule.validTo !== null && at > rule.validTo.getTime()) return false;

  return true;
}

/**
 * Urutan rantai: executionOrder → priority → specificity → createdAt.
 *
 * `executionOrder` mendahului yang lain karena pada rule berlapis, *urutan* adalah
 * bagian dari maksud bisnisnya — bukan sekadar pemecah seri. Rule "potong biaya
 * platform dulu" harus jalan sebelum rule bagi hasil, terlepas dari seberapa
 * spesifik masing-masing.
 */
export function orderChain(rules: readonly RuleSpec[]): RuleSpec[] {
  return [...rules].sort(
    (a, b) =>
      a.executionOrder - b.executionOrder ||
      b.priority - a.priority ||
      b.specificity - a.specificity ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      a.id.localeCompare(b.id), // pemecah seri terakhir: total order, selalu
  );
}

export function buildChain(rules: readonly RuleSpec[], ctx: TransactionContext): RuleSpec[] {
  return orderChain(rules.filter((r) => !r.isSystemDefault && matches(r, ctx)));
}

/**
 * Skor spesifisitas, dihitung sekali saat rule dibuat lalu disimpan.
 *
 * Bobot bertingkat (4/2/1) membuat urutan kepentingan kriteria tidak pernah
 * ambigu — mirip cara CSS menentukan selector mana yang menang.
 */
export function computeSpecificity(rule: {
  productCategory: string | null;
  minProfit: bigint | null;
  maxProfit: bigint | null;
  validTo: Date | null;
}): number {
  return (
    (rule.productCategory !== null ? 4 : 0) +
    (rule.minProfit !== null || rule.maxProfit !== null ? 2 : 0) +
    (rule.validTo !== null ? 1 : 0)
  );
}
