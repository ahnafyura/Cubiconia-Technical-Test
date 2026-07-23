'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Empty, Money, Skeleton, StatusBadge } from '@/components/ui';
import { usePermissions } from '@/lib/permissions';

interface Trx {
  id: string; code: string; status: string; netProfit: string; quantity: number;
  product: { name: string; category: string };
  customer: { name: string };
  distribution: { id: string; code: string; status: string; isFallback: boolean; overAllocated: boolean } | null;
}

export default function TransactionsPage() {
  const [items, setItems] = useState<Trx[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { has } = usePermissions();
  const canViewDistribution = has('distribution:read:all');

  const load = useCallback(() => {
    api<Trx[]>('/transactions?take=50').then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function complete(id: string) {
    setBusy(id);
    try {
      await api(`/transactions/${id}/complete`, { method: 'POST' });
      // Distribusi diproses asinkron lewat outbox — beri poller waktu bekerja.
      setTimeout(() => { load(); setBusy(null); }, 2600);
    } catch {
      setBusy(null);
    }
  }

  if (!items) return <Skeleton rows={8} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transaksi</h1>
          <p className="page-sub">
            Menyelesaikan transaksi memicu pembagian keuntungan otomatis lewat outbox
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <Empty title="Belum ada transaksi" hint="Jalankan seed untuk mengisi data contoh." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Kode</th><th>Produk</th><th>Pelanggan</th>
                <th className="right">Laba bersih</th><th>Status</th><th>Bagi hasil</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td className="num">{t.code}</td>
                  <td>
                    {t.product.name}
                    <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                      {t.product.category} · {t.quantity} unit
                    </div>
                  </td>
                  <td className="muted">{t.customer.name}</td>
                  <td className="right"><Money value={t.netProfit} /></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>
                    {t.distribution ? (
                      // Badge jadi tautan HANYA kalau user memang boleh membuka
                      // detailnya — tanpa distribution:read:all, mengklik ini
                      // akan langsung dipantulkan balik ke sini oleh shell.
                      // Status tetap terlihat (itu ikut transaction:read),
                      // cuma tidak diklikkan.
                      canViewDistribution ? (
                        <Link href={`/distribusi/${t.distribution.id}`} className="row" style={{ gap: 6 }}>
                          <StatusBadge status={t.distribution.status} />
                        </Link>
                      ) : (
                        <StatusBadge status={t.distribution.status} />
                      )
                    ) : (
                      <span className="muted">Belum ada</span>
                    )}
                  </td>
                  <td className="right">
                    {t.status === 'DRAFT' && (
                      <button className="btn btn-sm" disabled={busy === t.id} onClick={() => complete(t.id)}>
                        {busy === t.id ? 'Memproses…' : 'Selesaikan'}
                      </button>
                    )}
                    {t.distribution && canViewDistribution && (
                      <Link className="btn btn-sm" href={`/distribusi/${t.distribution.id}`}>Lihat rantai →</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
