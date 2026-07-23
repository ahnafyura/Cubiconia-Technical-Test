'use client';

import { useId, useState } from 'react';
import { rp } from '@/lib/format';
import { monthLabel, niceScale, tickLabel } from '@/lib/chart-utils';

export interface TrendPoint {
  month: string; // 'YYYY-MM'
  total: string;
}

/** Path persegi dengan HANYA dua sudut atas membulat, jangkar tetap di garis
 *  dasar — spesifikasi mark standar untuk bar chart (bukan sudut penuh yang
 *  membuat batang terlihat mengambang dari dasarnya). */
function roundedTopBarPath(x: number, yTop: number, width: number, yBase: number, radius: number): string {
  const r = Math.min(radius, width / 2, Math.max(0, yBase - yTop));
  if (r <= 0.5) return `M ${x} ${yBase} L ${x} ${yTop} L ${x + width} ${yTop} L ${x + width} ${yBase} Z`;
  return [
    `M ${x} ${yBase}`,
    `L ${x} ${yTop + r}`,
    `Q ${x} ${yTop} ${x + r} ${yTop}`,
    `L ${x + width - r} ${yTop}`,
    `Q ${x + width} ${yTop} ${x + width} ${yTop + r}`,
    `L ${x + width} ${yBase}`,
    'Z',
  ].join(' ');
}

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 46;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const BAR_RADIUS = 5;

/**
 * Grafik batang bulanan kelas laporan — sumbu-Y berskala rapi, garis kisi
 * resesif, batang berujung membulat anchored ke garis dasar. Dibangun
 * tangan dari SVG polos, bukan library chart.
 *
 * SATU seri, sengaja. Referensi yang menginspirasi gaya ini adalah aplikasi
 * portofolio multi-aset (saham, kripto — beberapa seri yang benar-benar
 * berbeda); sistem ini melacak SATU aliran pendapatan per investor. Warna
 * batang memakai aksen produk (bukan --viz-1 netral) karena ini SATU-SATUNYA
 * grafik hero di aplikasi yang investor lihat — analog dengan tombol primer
 * yang juga terisi penuh warna aksen, bukan latar section yang luas.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  if (points.length === 0) return null;

  const values = points.map((p) => Number(p.total));
  const rawMax = Math.max(...values, 0);
  const { max, ticks } = niceScale(rawMax);
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const baseline = PAD_TOP + plotH;

  const yFor = (v: number) => PAD_TOP + (1 - v / max) * plotH;

  const slot = plotW / points.length;
  const barW = Math.min(40, slot * 0.5);
  const coords = points.map((p, i) => {
    const cx = PAD_LEFT + slot * (i + 0.5);
    return { cx, x: cx - barW / 2, y: yFor(Number(p.total)), ...p };
  });

  const activeIdx = hover ?? coords.length - 1;
  const active = coords[activeIdx];
  const tooltipLeftPct = (active.cx / WIDTH) * 100;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Bagi hasil per bulan, ${points.length} bulan terakhir, bulan ${monthLabel(active.month)}: ${rp(active.total)}`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={WIDTH} height={baseline} />
          </clipPath>
        </defs>

        {/* Sumbu-Y & garis kisi — resesif, hanya penanda skala. */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(t)} y2={yFor(t)}
              stroke="var(--color-rule)" strokeWidth="1"
            />
            <text x={PAD_LEFT - 8} y={yFor(t)} textAnchor="end" dominantBaseline="middle"
              fontFamily="var(--font-mono)" fontSize="10" fill="var(--color-muted)">
              {tickLabel(t)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {coords.map((c, i) => (
            <path
              key={c.month}
              d={roundedTopBarPath(c.x, c.y, barW, baseline, BAR_RADIUS)}
              fill="var(--color-accent)"
              opacity={i === activeIdx ? 1 : 0.55}
              style={{ transition: 'opacity var(--dur-fast) var(--ease-out)' }}
            />
          ))}
        </g>

        {coords.map((c, i) => (
          <rect
            key={c.month}
            x={PAD_LEFT + slot * i} y={PAD_TOP} width={slot} height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            role="button"
            aria-label={`${monthLabel(c.month)}: ${rp(c.total)}`}
            className="chart-hit"
            style={{ cursor: 'pointer' }}
          />
        ))}

        {coords.map((c, i) => (
          <text
            key={c.month} x={c.cx} y={HEIGHT - 6} textAnchor="middle"
            fontFamily="var(--font-mono)" fontSize="10"
            fill="var(--color-muted)" opacity={i === activeIdx ? 1 : 0.55}
          >
            {monthLabel(c.month)}
          </text>
        ))}
      </svg>

      <div
        className="card card-2"
        style={{
          position: 'absolute', top: 0, left: `${tooltipLeftPct}%`, transform: 'translate(-50%, -8px)',
          padding: '4px 10px', pointerEvents: 'none', whiteSpace: 'nowrap',
          fontSize: 'var(--text-xs)', boxShadow: 'var(--shadow-popup)',
        }}
      >
        <span className="muted" style={{ marginRight: 6 }}>{monthLabel(active.month)}</span>
        <span className="num" style={{ fontWeight: 500 }}>{rp(active.total)}</span>
      </div>
    </div>
  );
}
