'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Empty, Money, Skeleton } from '@/components/ui';
import { TrendChart, TrendPoint } from '@/components/trend-chart';
import { date } from '@/lib/format';

interface LedgerEntry {
  id: string;
  entryType: 'PROFIT_SHARE' | 'PAYOUT' | 'REVERSAL' | 'ADJUSTMENT';
  amount: string;
  balanceAfter: string;
  occurredAt: string;
  description: string | null;
  distribution: { id: string; code: string; transaction: { code: string } } | null;
}
interface LedgerResponse { balance: string; entries: LedgerEntry[] }

const ENTRY_LABEL: Record<LedgerEntry['entryType'], string> = {
  PROFIT_SHARE: 'Bagi hasil',
  PAYOUT: 'Pencairan',
  REVERSAL: 'Pengembalian dana',
  ADJUSTMENT: 'Penyesuaian',
};

export default function PortalHome() {
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);

  useEffect(() => {
    api<LedgerResponse>('/investors/me/ledger').then(setLedger).catch(() => setLedger({ balance: '0', entries: [] }));
    api<TrendPoint[]>('/investors/me/trend').then(setTrend).catch(() => setTrend([]));
  }, []);

  if (!ledger || !trend) return <Skeleton rows={6} />;

  // Titik terakhir tren SELALU bulan berjalan (query backend generate_series
  // sampai bulan ini) — dipakai langsung sebagai delta, tanpa panggilan API
  // terpisah atau angka yang dihitung ulang di dua tempat.
  const thisMonth = trend.at(-1);
  const thisMonthTotal = thisMonth ? BigInt(thisMonth.total) : 0n;
  const hasActivityThisMonth = thisMonthTotal > 0n;

  return (
    <>
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="kpi-label">Saldo tersedia</div>
        <div className="row" style={{ alignItems: 'baseline', gap: 'var(--space-sm)' }}>
          <Money value={ledger.balance} size="hero" />
          {hasActivityThisMonth && (
            <Money value={thisMonthTotal.toString()} direction="in" />
          )}
        </div>
        {hasActivityThisMonth && (
          <div className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 2 }}>bagi hasil bulan ini</div>
        )}
        <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-sm)' }}>
          Dicatat secara langsung setiap kali transaksi selesai. Pencairan aktual
          dijadwalkan periodik oleh admin, saldo ini boleh lebih tinggi dari yang
          sudah masuk rekening.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-md)' }}>Pendapatan Bagi Hasil</h2>
        <TrendChart points={trend} />
      </div>

      <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-sm)' }}>Mutasi terakhir</h2>

      {ledger.entries.length === 0 ? (
        <Empty title="Belum ada mutasi" hint="Mutasi muncul begitu transaksi yang melibatkan Anda selesai dibagikan." />
      ) : (
        <div className="stack">
          {ledger.entries.map((e) => {
            const dir = e.amount.startsWith('-') ? 'out' : e.entryType === 'REVERSAL' ? 'reversal' : 'in';
            return (
              <div key={e.id} className="card" style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div className="row">
                      <Money value={e.amount} direction={dir} />
                      <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                        {ENTRY_LABEL[e.entryType]}
                        {e.distribution && <> · {e.distribution.transaction.code}</>}
                      </span>
                    </div>
                    <div className="muted num" style={{ fontSize: 'var(--text-xs)', marginTop: 2 }}>
                      {date(e.occurredAt)}
                    </div>
                  </div>
                  {e.entryType === 'PROFIT_SHARE' && e.distribution && (
                    <Link href={`/portal/distribusi/${e.distribution.id}`} className="btn btn-sm">
                      kenapa segini? →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
