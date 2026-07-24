'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, apiIdempotent } from '@/lib/api';
import { Empty, Money, Skeleton, StatusBadge } from '@/components/ui';
import { usePermissions } from '@/lib/permissions';

interface Trx {
  id: string; code: string; status: string; netProfit: string; quantity: number;
  product: { name: string; category: string };
  customer: { name: string };
  distribution: { id: string; code: string; status: string; isFallback: boolean; overAllocated: boolean } | null;
}
interface Product { id: string; name: string; category: string; price: string; productionCost: string }
interface Customer { id: string; name: string }

export default function TransactionsPage() {
  const [items, setItems] = useState<Trx[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { has } = usePermissions();
  const canViewDistribution = has('distribution:read:all');
  const canCreate = has('transaction:create');

  const load = useCallback(() => {
    api<Trx[]>('/transactions?take=50').then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function complete(id: string) {
    setBusy(id);
    try {
      await apiIdempotent(`/transactions/${id}/complete`, { method: 'POST' });
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
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Tutup' : '+ Transaksi baru'}
          </button>
        )}
      </div>

      {creating && <NewTransactionForm onSaved={() => { setCreating(false); load(); }} />}

      {items.length === 0 ? (
        <Empty title="Belum ada transaksi" hint="Buat transaksi baru atau jalankan seed untuk mengisi data contoh." />
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

/** Form + pratinjau laba — jawab langsung kalimat pertama studi kasus
 *  ("perusahaan menjual produk kepada pelanggan"). Pratinjau dihitung di
 *  klien dari data produk yang sudah ada (harga, biaya produksi), TANPA
 *  panggilan server tambahan — angka final tetap dihitung ulang di backend
 *  saat submit, ini murni supaya admin tidak menebak sebelum menekan simpan. */
function NewTransactionForm({ onSaved }: { onSaved: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productId, setProductId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Product[]>('/products').then(setProducts).catch(() => {});
    api<Customer[]>('/customers').then(setCustomers).catch(() => {});
  }, []);

  const product = products.find((p) => p.id === productId);
  const qty = Math.max(0, parseInt(quantity || '0', 10));
  const revenue = product ? BigInt(product.price) * BigInt(qty) : 0n;
  const cost = product ? BigInt(product.productionCost) * BigInt(qty) : 0n;
  const netProfit = revenue - cost;
  const valid = productId !== '' && customerId !== '' && qty > 0;

  async function save() {
    setBusy(true); setError(null);
    try {
      await apiIdempotent('/transactions', {
        method: 'POST',
        body: JSON.stringify({ productId, customerId, quantity: qty }),
      });
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
      <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-md)' }}>Transaksi baru</h2>
      <div className="row" style={{ gap: 'var(--space-sm)' }}>
        <div className="field" style={{ flex: 2, minWidth: 200 }}>
          <label htmlFor="ntproduct">Produk</label>
          <select id="ntproduct" className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Pilih produk…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 2, minWidth: 200 }}>
          <label htmlFor="ntcustomer">Pelanggan</label>
          <select id="ntcustomer" className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Pilih pelanggan…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 100 }}>
          <label htmlFor="ntqty">Kuantitas</label>
          <input id="ntqty" className="input num" inputMode="numeric" value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>

      {product && qty > 0 && (
        <div className="card card-2" style={{ marginTop: 'var(--space-xs)' }}>
          <div className="wf-row"><span className="muted">Pendapatan</span><Money value={revenue.toString()} /></div>
          <div className="wf-row"><span className="muted">Biaya produksi</span><Money value={`-${cost}`} /></div>
          <div className="wf-row" style={{ borderTop: '1px solid var(--color-rule)', marginTop: 8, paddingTop: 8, fontWeight: 600 }}>
            <span>Laba bersih (pratinjau)</span><Money value={netProfit.toString()} />
          </div>
        </div>
      )}

      {error && <div className="alert s-critical" role="alert" style={{ marginTop: 'var(--space-sm)' }}>{error}</div>}

      <button className="btn btn-primary" style={{ marginTop: 'var(--space-md)' }} disabled={!valid || busy} onClick={save}>
        {busy ? 'Menyimpan…' : 'Buat transaksi (draf)'}
      </button>
    </div>
  );
}
