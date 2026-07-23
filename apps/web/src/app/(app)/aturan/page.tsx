'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Money, Skeleton, StatusBadge } from '@/components/ui';
import { DistributionWaterfall, WaterfallData } from '@/components/waterfall';
import { bp, date } from '@/lib/format';
import { usePermissions } from '@/lib/permissions';

interface Rule {
  id: string; name: string; description: string | null; status: string;
  productCategory: string | null; minProfit: string | null; maxProfit: string | null;
  validFrom: string; validTo: string | null; version: number;
  executionOrder: number; stackable: boolean; basis: 'GROSS' | 'RESIDUAL';
  shares: { investorId: string; basisPoints: number; investor: { id: string; name: string } }[];
}
interface Investor { id: string; name: string; code: string }

const CATEGORIES = ['Elektronik', 'Aksesori', 'Infrastruktur'];

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [creating, setCreating] = useState(false);
  const { has } = usePermissions();
  const canCreate = has('profit_rule:create');

  const load = useCallback(() => {
    api<Rule[]>('/profit-rules').then(setRules).catch(() => setRules([]));
  }, []);
  useEffect(() => {
    load();
    api<Investor[]>('/investors').then(setInvestors).catch(() => {});
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Aturan bagi hasil</h1>
          <p className="page-sub">
            Beberapa aturan bisa berlaku bersamaan dan dijalankan berlapis sesuai urutan eksekusi
          </p>
        </div>
        {/* Disembunyikan total untuk user tanpa profit_rule:create (mis. ops
            penjualan) — bukan cuma dinonaktifkan. Tombol yang kelihatan tapi
            pasti gagal setelah diklik itu sendiri sudah salah. */}
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Tutup editor' : '+ Aturan baru'}
          </button>
        )}
      </div>

      {creating && (
        <RuleEditor
          investors={investors}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}

      {!rules ? <Skeleton rows={5} /> : <RuleList rules={rules} />}
    </>
  );
}

function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <div className="stack" style={{ marginTop: 'var(--space-md)' }}>
      {rules.map((r) => {
        const total = r.shares.reduce((a, s) => a + s.basisPoints, 0);
        return (
          <div className="card" key={r.id}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="row">
                  <span className="num muted">#{r.executionOrder}</span>
                  <strong style={{ fontFamily: 'var(--font-display)' }}>{r.name}</strong>
                  <span className="num muted" style={{ fontSize: 'var(--text-xs)' }}>v{r.version}</span>
                  <StatusBadge status={r.status} />
                  {!r.stackable && (
                    <span className="badge s-serious">
                      <span className="badge-dot" aria-hidden="true" />
                      menutup rantai
                    </span>
                  )}
                </div>
                {r.description && (
                  <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: '6px 0 0' }}>{r.description}</p>
                )}
                <div className="muted num" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
                  {r.productCategory ?? 'semua kategori'} ·{' '}
                  dasar {r.basis === 'GROSS' ? 'laba awal' : 'sisa berjalan'} ·{' '}
                  {r.minProfit ? <>min <Money value={r.minProfit} /> · </> : null}
                  berlaku {date(r.validFrom)}{r.validTo ? ` s.d. ${date(r.validTo)}` : ' sampai seterusnya'}
                </div>
              </div>
              <div className="right">
                <span className="num" style={{ fontWeight: 500 }}>{bp(total)}</span>
                <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>total porsi</div>
              </div>
            </div>

            <div className="row" style={{ marginTop: 'var(--space-sm)', gap: 'var(--space-md)' }}>
              {r.shares.map((s) => (
                <span key={s.investorId} style={{ fontSize: 'var(--text-sm)' }}>
                  {s.investor.name} <span className="num muted">{bp(s.basisPoints)}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Editor aturan + simulasi berdampingan — layar terpenting di aplikasi ini.
 *
 * Panel simulasi bukan tab dan bukan modal: ia selalu terlihat. Dengan aturan
 * berlapis, dampak sebuah aturan bergantung pada aturan lain yang kebetulan
 * cocok — mustahil diprediksi di kepala. Menyembunyikan pratinjau di balik satu
 * klik berarti sebagian besar admin tidak akan pernah membukanya, dan justru
 * merekalah yang paling butuh.
 */
function RuleEditor({ investors, onSaved }: { investors: Investor[]; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [minProfit, setMinProfit] = useState('');
  const [order, setOrder] = useState(50);
  const [stackable, setStackable] = useState(true);
  const [basis, setBasis] = useState<'GROSS' | 'RESIDUAL'>('RESIDUAL');
  const [shares, setShares] = useState<{ investorId: string; percent: string }[]>([]);

  const [simCategory, setSimCategory] = useState('Elektronik');
  const [simProfit, setSimProfit] = useState('10000000');
  const [sim, setSim] = useState<WaterfallData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pratinjau rantai yang SUDAH aktif — memberi admin model mental atas apa yang
  // akan berjalan bersama aturan barunya.
  useEffect(() => {
    const t = setTimeout(() => {
      api<WaterfallData>('/profit-rules/simulate', {
        method: 'POST',
        body: JSON.stringify({ productCategory: simCategory, netProfit: simProfit || '0' }),
      }).then(setSim).catch(() => setSim(null));
    }, 250);
    return () => clearTimeout(t);
  }, [simCategory, simProfit]);

  const totalBp = useMemo(
    () => shares.reduce((a, s) => a + Math.round(parseFloat(s.percent || '0') * 100), 0),
    [shares],
  );
  const overLimit = totalBp > 10_000;
  const valid = name.trim() !== '' && shares.length > 0 && totalBp > 0 && !overLimit;

  async function save(activate: boolean) {
    setSaving(true); setError(null);
    try {
      await api('/profit-rules', {
        method: 'POST',
        body: JSON.stringify({
          name,
          productCategory: category || null,
          minProfit: minProfit || null,
          validFrom: new Date().toISOString(),
          executionOrder: order,
          stackable,
          basis,
          shares: shares.map((s) => ({
            investorId: s.investorId,
            basisPoints: Math.round(parseFloat(s.percent || '0') * 100),
          })),
          activate,
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <div className="grid-2" style={{ marginBottom: 'var(--space-lg)' }}>
      {/* ── Konfigurasi ── */}
      <div className="card">
        <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-md)' }}>Konfigurasi</h2>

        <div className="field">
          <label htmlFor="rn">Nama aturan</label>
          <input id="rn" className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Bonus Promo Agustus" />
        </div>

        <div className="row" style={{ gap: 'var(--space-sm)' }}>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label htmlFor="rc">Kategori produk</label>
            <select id="rc" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Semua kategori</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 150 }}>
            <label htmlFor="rm">Laba minimum (opsional)</label>
            <input id="rm" className="input num" value={minProfit} inputMode="numeric"
              onChange={(e) => setMinProfit(e.target.value.replace(/\D/g, ''))} placeholder="50000000" />
          </div>
        </div>

        <div className="row" style={{ gap: 'var(--space-sm)' }}>
          <div className="field" style={{ flex: 1, minWidth: 130 }}>
            <label htmlFor="ro">Urutan eksekusi</label>
            <input id="ro" className="input num" type="number" value={order}
              onChange={(e) => setOrder(Number(e.target.value))} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 170 }}>
            <label htmlFor="rb">Dasar hitung</label>
            <select id="rb" className="select" value={basis}
              onChange={(e) => setBasis(e.target.value as 'GROSS' | 'RESIDUAL')}>
              <option value="RESIDUAL">Sisa berjalan</option>
              <option value="GROSS">Laba awal</option>
            </select>
          </div>
        </div>

        <label className="row" style={{ margin: 'var(--space-xs) 0 var(--space-md)', cursor: 'pointer' }}>
          <input type="checkbox" checked={stackable} onChange={(e) => setStackable(e.target.checked)} />
          <span>Dapat ditumpuk dengan aturan lain</span>
        </label>
        {!stackable && (
          <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: -8, marginBottom: 'var(--space-md)' }}>
            Aturan ini akan menutup rantai. Aturan setelahnya tidak dijalankan.
          </p>
        )}

        <h3 style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-xs)' }}>Pembagian</h3>
        {shares.map((s, i) => (
          <div className="row" key={i} style={{ marginBottom: 6 }}>
            <select className="select" style={{ flex: 1 }} value={s.investorId}
              onChange={(e) => setShares(shares.map((x, j) => j === i ? { ...x, investorId: e.target.value } : x))}>
              <option value="">Pilih investor…</option>
              {investors.map((inv) => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
            </select>
            <input className="input num right" style={{ width: 92 }} value={s.percent} inputMode="decimal"
              onChange={(e) => setShares(shares.map((x, j) => j === i ? { ...x, percent: e.target.value } : x))}
              placeholder="0" aria-label="Persentase" />
            <span className="muted">%</span>
            <button className="btn btn-sm" onClick={() => setShares(shares.filter((_, j) => j !== i))}
              aria-label="Hapus baris">✕</button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => setShares([...shares, { investorId: '', percent: '' }])}>
          + Tambah investor
        </button>

        {/* Sisa persentase ditampilkan terus-menerus — mencegah anggapan keliru
            bahwa yang tidak dialokasikan otomatis hilang. */}
        <div className="card card-2" style={{ marginTop: 'var(--space-md)' }}>
          <div className="wf-row">
            <span className="muted">Total porsi investor</span>
            <span className={`num ${overLimit ? 's-critical' : ''}`}>{bp(totalBp)}</span>
          </div>
          <div className="wf-row">
            <span className="muted">Sisa ke perusahaan</span>
            <span className="num">{bp(Math.max(0, 10_000 - totalBp))}</span>
          </div>
        </div>

        {overLimit && (
          <div className="alert s-critical" role="alert" style={{ marginTop: 'var(--space-sm)' }}>
            Total melebihi 100%. Kurangi salah satu porsi.
          </div>
        )}
        {error && <div className="alert s-critical" role="alert" style={{ marginTop: 'var(--space-sm)' }}>{error}</div>}

        <div className="row" style={{ marginTop: 'var(--space-md)' }}>
          <button className="btn btn-primary" disabled={!valid || saving} onClick={() => save(true)}>
            {saving ? 'Menyimpan…' : 'Simpan & aktifkan'}
          </button>
          <button className="btn" disabled={!valid || saving} onClick={() => save(false)}>
            Simpan sebagai draf
          </button>
        </div>
      </div>

      {/* ── Pratinjau langsung ── */}
      <div className="card card-2">
        <h2 style={{ fontSize: 'var(--text-md)' }}>Pratinjau rantai aktif</h2>
        <p className="muted" style={{ fontSize: 'var(--text-xs)', margin: '4px 0 var(--space-md)' }}>
          Aturan apa saja yang akan berjalan untuk transaksi seperti ini hari ini
        </p>

        <div className="row" style={{ marginBottom: 'var(--space-md)' }}>
          <select className="select" style={{ flex: 1 }} value={simCategory}
            onChange={(e) => setSimCategory(e.target.value)} aria-label="Kategori simulasi">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="input num right" style={{ flex: 1 }} value={simProfit} inputMode="numeric"
            onChange={(e) => setSimProfit(e.target.value.replace(/\D/g, ''))} aria-label="Laba simulasi" />
        </div>

        {!sim ? (
          <Skeleton rows={4} />
        ) : sim.isFallback ? (
          <div className="alert s-warning" style={{ marginBottom: 0 }}>
            Tidak ada aturan aktif yang cocok, seluruh laba akan ditahan perusahaan.
          </div>
        ) : (
          <>
            {sim.layers.length > 1 && (
              <div className="alert s-warning" role="status">
                Aturan baru Anda akan berjalan bersama {sim.layers.length} aturan lain.
              </div>
            )}
            <DistributionWaterfall data={sim} />
          </>
        )}
      </div>
    </div>
  );
}
