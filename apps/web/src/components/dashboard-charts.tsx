'use client';

import { useId, useState } from 'react';
import { rp } from '@/lib/format';
import { monthLabel, niceScale, smoothPath, tickLabel } from '@/lib/chart-utils';
import { Money } from './ui';

export interface CompanyTrendPoint {
  month: string;
  netProfit: string;
  distributed: string;
}

const WIDTH = 640;
const HEIGHT = 200;
const PAD_LEFT = 46;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

/**
 * "Laba Bersih & Dibagikan" — ux-spec.md §7.1. Dua seri NYATA (bukan dua
 * warna untuk satu angka yang sama): laba bersih dari transaksi selesai,
 * dibagikan dari distribusi tercatat. Karena ≥2 seri, legenda WAJIB ada
 * per kontrak data-viz kita — bukan opsional seperti grafik satu-seri.
 */
export function CompanyTrendChart({ points }: { points: CompanyTrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  if (points.length === 0) return null;

  const allValues = points.flatMap((p) => [Number(p.netProfit), Number(p.distributed)]);
  const { max, ticks } = niceScale(Math.max(...allValues, 0));
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const baseline = PAD_TOP + plotH;
  const yFor = (v: number) => PAD_TOP + (1 - v / max) * plotH;
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
  const xFor = (i: number) => (points.length > 1 ? PAD_LEFT + i * stepX : PAD_LEFT + plotW / 2);

  const profitCoords = points.map((p, i) => ({ x: xFor(i), y: yFor(Number(p.netProfit)) }));
  const distCoords = points.map((p, i) => ({ x: xFor(i), y: yFor(Number(p.distributed)) }));

  const activeIdx = hover ?? points.length - 1;
  const activeX = xFor(activeIdx);

  return (
    <div style={{ position: 'relative' }}>
      <div className="row" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-xs)' }}>
        <span className="row" style={{ gap: 6, fontSize: 'var(--text-xs)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--viz-1)', display: 'inline-block' }} />
          Laba bersih
        </span>
        <span className="row" style={{ gap: 6, fontSize: 'var(--text-xs)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--viz-2)', display: 'inline-block' }} />
          Dibagikan
        </span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} role="img"
        aria-label={`Laba bersih dan dibagikan, ${points.length} bulan terakhir`}>
        <defs>
          <clipPath id={clipId}><rect x={0} y={0} width={WIDTH} height={baseline} /></clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(t)} y2={yFor(t)} stroke="var(--color-rule)" strokeWidth="1" />
            <text x={PAD_LEFT - 8} y={yFor(t)} textAnchor="end" dominantBaseline="middle"
              fontFamily="var(--font-mono)" fontSize="10" fill="var(--color-muted)">{tickLabel(t)}</text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          <path d={smoothPath(profitCoords)} fill="none" stroke="var(--viz-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={smoothPath(distCoords)} fill="none" stroke="var(--viz-2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {/* Garis bidik pada titik aktif — crosshair standar untuk chart interaktif. */}
        <line x1={activeX} x2={activeX} y1={PAD_TOP} y2={baseline} stroke="var(--color-rule)" strokeWidth="1" strokeDasharray="3 3" />
        {[profitCoords, distCoords].map((series, si) => (
          <circle key={si} cx={series[activeIdx].x} cy={series[activeIdx].y} r={4}
            fill="var(--color-paper-2)" stroke={si === 0 ? 'var(--viz-1)' : 'var(--viz-2)'} strokeWidth="2" />
        ))}

        {points.map((p, i) => (
          <rect key={p.month} x={PAD_LEFT + (i - 0.5) * stepX} y={PAD_TOP} width={stepX || plotW} height={plotH}
            fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} role="button"
            aria-label={`${monthLabel(p.month)}, laba bersih ${rp(p.netProfit)}, dibagikan ${rp(p.distributed)}`}
            className="chart-hit" style={{ cursor: 'pointer' }} />
        ))}

        {points.map((p, i) => (
          <text key={p.month} x={xFor(i)} y={HEIGHT - 6} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10"
            fill="var(--color-muted)" opacity={i === activeIdx ? 1 : 0.55}>{monthLabel(p.month)}</text>
        ))}
      </svg>

      <div className="card card-2" style={{ padding: '4px 10px', fontSize: 'var(--text-xs)', display: 'inline-block' }}>
        <span className="muted" style={{ marginRight: 8 }}>{monthLabel(points[activeIdx].month)}</span>
        <span className="num" style={{ color: 'var(--viz-1)', marginRight: 10 }}>{rp(points[activeIdx].netProfit)}</span>
        <span className="num" style={{ color: 'var(--viz-2)' }}>{rp(points[activeIdx].distributed)}</span>
      </div>
    </div>
  );
}

export interface InvestorShare {
  investorId: string | null;
  name: string;
  total: string;
}

const VIZ_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-other)'];

/**
 * "Distribusi per Investor" — ux-spec.md §7.1. Batang horizontal, urut
 * menurun. Dibatasi 5 + "Lainnya" DENGAN SENGAJA (bukan preferensi): warna
 * ke-9 tak terbedakan di bawah CVD, sudah tervalidasi di design.md.
 */
export function InvestorBreakdownChart({ items }: { items: InvestorShare[] }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => Number(i.total)), 1);

  return (
    <div className="stack" style={{ gap: 'var(--space-sm)' }}>
      {items.map((item, i) => {
        const pct = Math.max(2, (Number(item.total) / max) * 100);
        return (
          <div key={item.investorId ?? 'lainnya'}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>{item.name}</span>
              <Money value={item.total} abbreviate />
            </div>
            <div style={{ height: 8, borderRadius: 'var(--radius-pill)', background: 'var(--color-paper-3)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: VIZ_COLORS[i], borderRadius: 'var(--radius-pill)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
