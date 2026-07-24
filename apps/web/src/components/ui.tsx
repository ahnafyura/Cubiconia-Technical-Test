'use client';

import { rp, rpShort } from '@/lib/format';

/**
 * <Money> — satu-satunya tempat nominal dirender.
 *
 * Mono + tabular direservasi untuk konteks TABEL/inline (baris transaksi,
 * mutasi ledger) di mana angka perlu sejajar vertikal antar-baris. Angka
 * besar yang berdiri sendiri (hero — saldo, KPI) TIDAK memakai mono; tidak
 * ada apa pun untuk disejajarkan di sana, dan mono di ukuran besar terlihat
 * kaku/typewriter alih-alih percaya diri. Font display + bobot tebal dipakai
 * sebagai gantinya. Arah mutasi selalu ikon + tanda + warna, tidak pernah
 * warna sendirian.
 */
export function Money({
  value,
  abbreviate = false,
  direction,
  size,
}: {
  value: string | bigint | number | null | undefined;
  abbreviate?: boolean;
  direction?: 'in' | 'out' | 'reversal';
  size?: 'hero';
}) {
  const full = rp(value);
  const text = abbreviate ? rpShort(value) : full;
  const icon = direction === 'in' ? '↑' : direction === 'out' ? '↓' : direction === 'reversal' ? '↺' : null;
  const cls =
    direction === 'in' ? 's-good' : direction === 'reversal' ? 's-critical' : direction === 'out' ? 'muted' : '';

  return (
    <span
      className={size === 'hero' ? `money-hero ${cls}` : `num ${cls}`}
      title={abbreviate ? full : undefined}
    >
      {icon && <span aria-hidden="true">{icon} </span>}
      {text}
    </span>
  );
}

export const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draf', cls: 's-muted' },
  COMPLETED: { label: 'Selesai', cls: 's-good' },
  REFUNDED: { label: 'Refund', cls: 's-critical' },
  CALCULATED: { label: 'Dihitung', cls: 's-muted' },
  PENDING_APPROVAL: { label: 'Menunggu persetujuan', cls: 's-warning' },
  SETTLED: { label: 'Final', cls: 's-good' },
  REJECTED: { label: 'Ditolak', cls: 's-critical' },
  REVERSED: { label: 'Dikembalikan', cls: 's-critical' },
  ACTIVE: { label: 'Aktif', cls: 's-good' },
  SUPERSEDED: { label: 'Digantikan', cls: 's-muted' },
  INACTIVE: { label: 'Nonaktif', cls: 's-critical' },
};

/** Warna status TIDAK PERNAH sendirian — selalu berpasangan titik + label teks. */
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: 's-muted' };
  return (
    <span className={`badge ${s.cls}`}>
      <span className="badge-dot" aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function Flag({ kind }: { kind: 'fallback' | 'over' }) {
  return kind === 'fallback' ? (
    <span className="badge s-warning">
      <span className="badge-dot" aria-hidden="true" />
      Aturan cadangan
    </span>
  ) : (
    <span className="badge s-serious">
      <span className="badge-dot" aria-hidden="true" />
      Kelebihan alokasi
    </span>
  );
}

/** Dua jenis kosong dibedakan: belum ada data mengajak membuat, filter mengajak reset. */
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div style={{ fontWeight: 500, color: 'var(--color-ink-2)' }}>{title}</div>
      {hint && <div style={{ marginTop: 4, fontSize: 'var(--text-sm)' }}>{hint}</div>}
      {action && <div style={{ marginTop: 'var(--space-md)' }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Memuat">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 40,
            borderRadius: 'var(--radius-control)',
            background: 'var(--color-paper-3)',
            opacity: 1 - i * 0.12,
          }}
        />
      ))}
    </div>
  );
}
