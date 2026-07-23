/** Bilangan "rapi" ala D3 — 1/2/5 × 10^n — supaya label sumbu tidak aneh
 *  seperti "Rp 2.991.333". Standar di semua pustaka chart. */
export function niceNumber(value: number, round: boolean): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const frac = value / 10 ** exp;
  let niceFrac: number;
  if (round) {
    niceFrac = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  } else {
    niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  }
  return niceFrac * 10 ** exp;
}

export function niceScale(max: number, tickCount = 4): { max: number; ticks: number[] } {
  const safeMax = max > 0 ? max : 1;
  const step = niceNumber(safeMax / (tickCount - 1), true);
  const niceMax = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step * 0.5; v += step) ticks.push(v);
  return { max: niceMax, ticks };
}

/** Format ringkas untuk label sumbu — "0", "5jt", "10jt". */
export function tickLabel(v: number): string {
  if (v === 0) return '0';
  if (v >= 1_000_000) return `${Number((v / 1_000_000).toFixed(1))}jt`;
  if (v >= 1_000) return `${Number((v / 1_000).toFixed(1))}rb`;
  return String(v);
}

/** Catmull-Rom → Bezier kubik, tension standar 1/6. Kurva halus yang tetap
 *  melewati setiap titik data asli persis — bukan hiasan, cuma interpolasi
 *  visual antar titik yang sudah nyata. */
export function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length < 2) return '';
  if (coords.length === 2) return `M ${coords[0].x} ${coords[0].y} L ${coords[1].x} ${coords[1].y}`;

  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function monthLabel(ym: string): string {
  const m = Number(ym.split('-')[1]);
  return MONTH_SHORT[m - 1] ?? ym;
}
