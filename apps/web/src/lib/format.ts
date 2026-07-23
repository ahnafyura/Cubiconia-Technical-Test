/**
 * Seluruh aturan penyajian uang ditegakkan DI SINI, satu tempat.
 * Membiarkan toLocaleString() tersebar di puluhan berkas menjamin
 * ketidakkonsistenan dalam hitungan minggu.
 */

/** Rp 10.500.000 — tanpa singkatan. Dipakai di tabel dan detail. */
export function rp(value: string | bigint | number | null | undefined): string {
  if (value === null || value === undefined) return 'Rp 0';
  const v = BigInt(value);            // string → BigInt, tidak pernah lewat Number
  const negative = v < 0n;
  const digits = (negative ? -v : v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : ''}Rp ${digits}`;
}

/** Rp 10,5 jt — HANYA untuk KPI tile, nilai penuh wajib tersedia saat hover. */
export function rpShort(value: string | bigint | number | null | undefined): string {
  if (value === null || value === undefined) return 'Rp 0';
  const v = BigInt(value);
  const abs = v < 0n ? -v : v;
  const sign = v < 0n ? '−' : '';
  const fmt = (n: bigint, div: bigint, unit: string) => {
    const whole = n / div;
    const frac = ((n % div) * 10n) / div;
    return `${sign}Rp ${whole}${frac > 0n ? ',' + frac : ''} ${unit}`;
  };
  if (abs >= 1_000_000_000n) return fmt(abs, 1_000_000_000n, 'm');
  if (abs >= 1_000_000n) return fmt(abs, 1_000_000n, 'jt');
  if (abs >= 1_000n) return fmt(abs, 1_000n, 'rb');
  return rp(v);
}

/** 2550 bp → "25,5%" */
export function bp(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}%`;
}

export function pct(part: string | bigint, whole: string | bigint): string {
  const w = BigInt(whole);
  if (w === 0n) return '0%';
  return `${((Number(BigInt(part)) / Number(w)) * 100).toFixed(1).replace('.', ',')}%`;
}

export function date(iso: string | Date | null | undefined): string {
  if (!iso) return 'Belum ada';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
