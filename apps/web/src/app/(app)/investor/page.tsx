'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Empty, Money, Skeleton } from '@/components/ui';

interface Investor { id: string; code: string; name: string }
interface LedgerEntry {
  id: string; entryType: string; amount: string; balanceAfter: string; occurredAt: string; description: string | null;
  distribution: { id: string; code: string; transaction: { code: string } } | null;
}

export default function InvestorAdminPage() {
  const [investors, setInvestors] = useState<Investor[] | null>(null);
  const [selected, setSelected] = useState<Investor | null>(null);

  useEffect(() => { api<Investor[]>('/investors').then(setInvestors).catch(() => setInvestors([])); }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Investor</h1>
          <p className="page-sub">Daftar investor dan mutasi ledger masing-masing</p>
        </div>
      </div>

      {!investors ? (
        <Skeleton rows={5} />
      ) : investors.length === 0 ? (
        <Empty title="Belum ada investor" />
      ) : (
        <div className="grid-2">
          <div className="card" style={{ padding: 0, overflow: 'hidden', alignSelf: 'start' }}>
            <table>
              <thead><tr><th>Kode</th><th>Nama</th><th></th></tr></thead>
              <tbody>
                {investors.map((inv) => (
                  <tr key={inv.id} style={{ cursor: 'pointer', background: selected?.id === inv.id ? 'var(--color-accent-wash)' : undefined }}
                    onClick={() => setSelected(inv)}>
                    <td className="num muted">{inv.code}</td>
                    <td>{inv.name}</td>
                    <td className="right"><button className="btn btn-sm">Lihat mutasi →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            {selected ? (
              <InvestorLedger investor={selected} />
            ) : (
              <div className="card card-2">
                <p className="muted" style={{ margin: 0 }}>Pilih investor di sebelah kiri untuk melihat mutasinya.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function InvestorLedger({ investor }: { investor: Investor }) {
  const [data, setData] = useState<{ balance: string; entries: LedgerEntry[] } | null>(null);

  useEffect(() => {
    setData(null);
    api<{ balance: string; entries: LedgerEntry[] }>(`/investors/${investor.id}/ledger`).then(setData).catch(() => setData({ balance: '0', entries: [] }));
  }, [investor.id]);

  return (
    <div className="stack">
      <div className="card">
        <div className="kpi-label">Saldo {investor.name}</div>
        <Money value={data?.balance} size="hero" />
      </div>

      <div className="card">
        <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-sm)' }}>Mutasi terakhir</h2>
        {!data ? (
          <Skeleton rows={4} />
        ) : data.entries.length === 0 ? (
          <Empty title="Belum ada mutasi" />
        ) : (
          <div className="stack" style={{ gap: 'var(--space-xs)' }}>
            {data.entries.map((e) => (
              <div key={e.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-rule)' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{e.description ?? e.entryType}</div>
                  <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                    {e.distribution?.transaction.code ?? e.distribution?.code ?? '-'} · {new Date(e.occurredAt).toLocaleDateString('id-ID')}
                  </div>
                </div>
                <Money value={e.amount} direction={BigInt(e.amount) < 0n ? 'reversal' : 'in'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
