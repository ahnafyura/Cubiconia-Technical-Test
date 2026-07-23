'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Empty, Flag, Money, Skeleton, StatusBadge } from '@/components/ui';
import { date } from '@/lib/format';

interface Dist {
  id: string; code: string; status: string; netProfit: string; totalDistributed: string;
  retainedByCompany: string; isFallback: boolean; overAllocated: boolean; distributedAt: string;
  transaction: { code: string; product: { name: string; category: string }; customer: { name: string } };
  layers: { id: string }[];
}

export default function DistributionsPage() {
  const [items, setItems] = useState<Dist[] | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    api<Dist[]>(`/distributions${filter ? `?status=${filter}` : ''}`).then(setItems).catch(() => setItems([]));
  }, [filter]);
  useEffect(load, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Distribusi</h1>
          <p className="page-sub">Setiap distribusi menyimpan snapshot aturan yang dipakai saat itu</p>
        </div>
        <div className="row">
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}
            style={{ width: 'auto' }} aria-label="Saring status">
            <option value="">Semua status</option>
            <option value="PENDING_APPROVAL">Menunggu persetujuan</option>
            <option value="SETTLED">Final</option>
            <option value="REJECTED">Ditolak</option>
          </select>
        </div>
      </div>

      {!items ? (
        <Skeleton rows={6} />
      ) : items.length === 0 ? (
        <Empty
          title={filter ? 'Tidak ada distribusi pada status ini' : 'Belum ada distribusi'}
          hint={filter ? 'Coba ubah saringan status.' : 'Selesaikan sebuah transaksi untuk memicu pembagian.'}
          action={filter
            ? <button className="btn btn-sm" onClick={() => setFilter('')}>Reset saringan</button>
            : <Link className="btn btn-sm" href="/transaksi">Ke daftar transaksi</Link>}
        />
      ) : (
        <div className="stack">
          {items.map((d) => (
            <Link key={d.id} href={`/distribusi/${d.id}`} className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="row">
                    <StatusBadge status={d.status} />
                    <span className="num" style={{ fontWeight: 500 }}>{d.code}</span>
                    {d.isFallback && <Flag kind="fallback" />}
                    {d.overAllocated && <Flag kind="over" />}
                  </div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 'var(--text-sm)' }}>
                    {d.transaction.code} · {d.transaction.product.name} · {d.transaction.customer.name}
                  </div>
                  <div className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 2 }}>
                    {d.layers.length} lapisan · {date(d.distributedAt)}
                  </div>
                </div>
                <div className="right">
                  <Money value={d.totalDistributed} />
                  <div className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 2 }}>
                    dari laba <Money value={d.netProfit} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
