'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Empty, Money, Skeleton } from '@/components/ui';
import { usePermissions } from '@/lib/permissions';

interface Product {
  id: string; sku: string; name: string; category: string; price: string; productionCost: string;
}
interface Customer {
  id: string; name: string; email: string | null; phone: string | null;
}

export default function KatalogPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [tab, setTab] = useState<'produk' | 'pelanggan'>('produk');
  const [addingProduct, setAddingProduct] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const { has } = usePermissions();
  const canManage = has('catalog:manage');

  const load = useCallback(() => {
    api<Product[]>('/products').then(setProducts).catch(() => setProducts([]));
    api<Customer[]>('/customers').then(setCustomers).catch(() => setCustomers([]));
  }, []);
  useEffect(load, [load]);

  async function removeProduct(id: string) {
    if (!confirm('Hapus produk ini?')) return;
    await api(`/products/${id}`, { method: 'DELETE' });
    load();
  }
  async function removeCustomer(id: string) {
    if (!confirm('Hapus pelanggan ini?')) return;
    await api(`/customers/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Katalog</h1>
          <p className="page-sub">Produk dan pelanggan yang bisa dipakai saat membuat transaksi baru</p>
        </div>
        {canManage && tab === 'produk' && (
          <button className="btn btn-primary" onClick={() => setAddingProduct((v) => !v)}>
            {addingProduct ? 'Tutup' : '+ Produk'}
          </button>
        )}
        {canManage && tab === 'pelanggan' && (
          <button className="btn btn-primary" onClick={() => setAddingCustomer((v) => !v)}>
            {addingCustomer ? 'Tutup' : '+ Pelanggan'}
          </button>
        )}
      </div>

      <div className="row" style={{ marginBottom: 'var(--space-md)' }}>
        <button className={`btn btn-sm ${tab === 'produk' ? 'btn-primary' : ''}`} onClick={() => setTab('produk')}>Produk</button>
        <button className={`btn btn-sm ${tab === 'pelanggan' ? 'btn-primary' : ''}`} onClick={() => setTab('pelanggan')}>Pelanggan</button>
      </div>

      {tab === 'produk' ? (
        <>
          {addingProduct && <ProductForm onSaved={() => { setAddingProduct(false); load(); }} />}
          {!products ? (
            <Skeleton rows={5} />
          ) : products.length === 0 ? (
            <Empty title="Belum ada produk" hint="Tambah produk supaya bisa dipakai saat membuat transaksi." />
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr><th>SKU</th><th>Nama</th><th>Kategori</th><th className="right">Harga</th><th className="right">Biaya produksi</th><th></th></tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="num muted">{p.sku}</td>
                      <td>{p.name}</td>
                      <td className="muted">{p.category}</td>
                      <td className="right"><Money value={p.price} /></td>
                      <td className="right"><Money value={p.productionCost} /></td>
                      <td className="right">
                        {canManage && <button className="btn btn-sm" onClick={() => removeProduct(p.id)}>Hapus</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {addingCustomer && <CustomerForm onSaved={() => { setAddingCustomer(false); load(); }} />}
          {!customers ? (
            <Skeleton rows={5} />
          ) : customers.length === 0 ? (
            <Empty title="Belum ada pelanggan" hint="Tambah pelanggan supaya bisa dipakai saat membuat transaksi." />
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead><tr><th>Nama</th><th>Email</th><th>Telepon</th><th></th></tr></thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="muted">{c.email ?? 'Belum ada'}</td>
                      <td className="muted">{c.phone ?? 'Belum ada'}</td>
                      <td className="right">
                        {canManage && <button className="btn btn-sm" onClick={() => removeCustomer(c.id)}>Hapus</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ProductForm({ onSaved }: { onSaved: () => void }) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [productionCost, setProductionCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      await api('/products', { method: 'POST', body: JSON.stringify({ sku, name, category, price: price || '0', productionCost: productionCost || '0' }) });
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
      <div className="row" style={{ gap: 'var(--space-sm)' }}>
        <div className="field" style={{ flex: 1, minWidth: 120 }}>
          <label htmlFor="sku">SKU</label>
          <input id="sku" className="input" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 2, minWidth: 160 }}>
          <label htmlFor="pname">Nama</label>
          <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="pcat">Kategori</label>
          <input id="pcat" className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Elektronik" />
        </div>
      </div>
      <div className="row" style={{ gap: 'var(--space-sm)' }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="pprice">Harga jual</label>
          <input id="pprice" className="input num" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="pcost">Biaya produksi</label>
          <input id="pcost" className="input num" inputMode="numeric" value={productionCost} onChange={(e) => setProductionCost(e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>
      {error && <div className="alert s-critical" role="alert">{error}</div>}
      <button className="btn btn-primary" disabled={busy || !sku || !name || !category} onClick={save}>
        {busy ? 'Menyimpan…' : 'Simpan produk'}
      </button>
    </div>
  );
}

function CustomerForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      await api('/customers', { method: 'POST', body: JSON.stringify({ name, email: email || null, phone: phone || null }) });
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
      <div className="row" style={{ gap: 'var(--space-sm)' }}>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="cname">Nama</label>
          <input id="cname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label htmlFor="cemail">Email (opsional)</label>
          <input id="cemail" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label htmlFor="cphone">Telepon (opsional)</label>
          <input id="cphone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      {error && <div className="alert s-critical" role="alert">{error}</div>}
      <button className="btn btn-primary" disabled={busy || !name} onClick={save}>
        {busy ? 'Menyimpan…' : 'Simpan pelanggan'}
      </button>
    </div>
  );
}
