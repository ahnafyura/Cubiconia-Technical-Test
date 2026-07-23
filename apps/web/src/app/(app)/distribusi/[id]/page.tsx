'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Flag, Money, Skeleton, StatusBadge } from '@/components/ui';
import { DistributionWaterfall, WaterfallData } from '@/components/waterfall';
import { date } from '@/lib/format';
import { usePermissions } from '@/lib/permissions';
import { DownloadPdfButton } from '@/components/download-pdf-button';

interface Detail {
  id: string; code: string; status: string; netProfit: string; totalDistributed: string;
  retainedByCompany: string; isFallback: boolean; overAllocated: boolean; distributedAt: string;
  transaction: {
    code: string; revenue: string; productionCostTotal: string; quantity: number;
    product: { name: string; category: string }; customer: { name: string };
  };
  layers: {
    layerIndex: number; basisType: 'GROSS' | 'RESIDUAL'; basisAmount: string;
    allocatedAmount: string; clamped: boolean;
    rule: { id: string; name: string; version: number };
    entries: { investorId: string; basisPoints: number; amount: string; investor: { name: string } }[];
  }[];
  summary: { investorId: string; investorName: string; total: string; parts: { layer: number; amount: string }[] }[];
}

export default function DistributionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { has } = usePermissions();
  const canApprove = has('distribution:approve');

  const load = useCallback(() => { api<Detail>(`/distributions/${id}`).then(setD).catch(() => {}); }, [id]);
  useEffect(load, [load]);

  if (!d) return <Skeleton rows={8} />;

  // Rekonstruksi sisa berjalan untuk air terjun — sengaja dihitung ulang di sini
  // supaya kalau angka dari server tidak konsisten, tampilannya yang ketahuan.
  let running = BigInt(d.netProfit);
  const waterfall: WaterfallData = {
    netProfit: d.netProfit,
    totalDistributed: d.totalDistributed,
    retainedByCompany: d.retainedByCompany,
    isFallback: d.isFallback,
    overAllocated: d.overAllocated,
    layers: d.layers.map((l) => {
      running -= BigInt(l.allocatedAmount);
      return {
        layerIndex: l.layerIndex,
        ruleId: l.rule.id,
        ruleName: l.rule.name,
        basisType: l.basisType,
        basisAmount: l.basisAmount,
        allocatedAmount: l.allocatedAmount,
        remainingAfter: running.toString(),
        clamped: l.clamped,
        entries: l.entries.map((e) => ({
          investorId: e.investorId,
          investorName: e.investor.name,
          basisPoints: e.basisPoints,
          amount: e.amount,
        })),
      };
    }),
  };

  async function act(kind: 'approve' | 'reject') {
    setBusy(true); setError(null);
    try {
      await api(`/distributions/${id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify(kind === 'reject' ? { reason: 'Ditolak dari panel admin' } : {}),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/distribusi" className="muted" style={{ fontSize: 'var(--text-sm)' }}>← Distribusi</Link>
          <h1 style={{ marginTop: 4 }} className="num">{d.code}</h1>
          <p className="page-sub">
            {d.transaction.code} · {d.transaction.product.name} · {d.transaction.customer.name} · {date(d.distributedAt)}
          </p>
        </div>
        <div className="row">
          <StatusBadge status={d.status} />
          {d.isFallback && <Flag kind="fallback" />}
          {d.overAllocated && <Flag kind="over" />}
          <DownloadPdfButton
            buildDoc={async () => {
              const { AdminDistributionReceipt } = await import('@/components/receipt-admin');
              return <AdminDistributionReceipt d={d} />;
            }}
            filename={`resi-${d.code}.pdf`}
            label="Unduh resi PDF"
          />
        </div>
      </div>

      {d.isFallback && (
        <div className="alert s-warning" role="status">
          <span>Tidak ada aturan yang cocok. Seluruh laba ditahan perusahaan dan perlu ditinjau.</span>
          <Link className="btn btn-sm" href="/aturan">Buat aturan untuk kasus ini →</Link>
        </div>
      )}
      {d.overAllocated && (
        <div className="alert s-serious" role="status">
          <span>Rantai mengalokasikan lebih dari laba yang tersedia, jadi porsi dipotong proporsional.</span>
          <Link className="btn btn-sm" href="/aturan">Periksa aturan bentrok →</Link>
        </div>
      )}

      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <div className="wf-row"><span className="muted">Pendapatan</span><Money value={d.transaction.revenue} /></div>
            <div className="wf-row"><span className="muted">Biaya produksi</span><Money value={`-${d.transaction.productionCostTotal}`} /></div>
            <div className="wf-row" style={{ borderTop: '1px solid var(--color-rule)', marginTop: 8, paddingTop: 8, fontWeight: 600 }}>
              <span>Laba bersih</span><Money value={d.netProfit} />
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-md)' }}>Rantai pembagian</h2>
            <DistributionWaterfall data={waterfall} />
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-sm)' }}>Ringkasan per investor</h2>
            {d.summary.length === 0 ? (
              <p className="muted">Tidak ada porsi investor pada distribusi ini.</p>
            ) : (
              <table>
                <thead><tr><th>Investor</th><th>Rincian lapisan</th><th className="right">Total</th></tr></thead>
                <tbody>
                  {d.summary.map((s) => (
                    <tr key={s.investorId}>
                      <td>{s.investorName}</td>
                      {/* Investor yang muncul di dua lapisan adalah kasus paling
                          membingungkan — cara terbaik menanganinya adalah
                          menunjukkan aritmatikanya, bukan menyembunyikannya. */}
                      <td className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                        {s.parts.map((p, i) => (
                          <span key={p.layer}>
                            {i > 0 && ' + '}L{p.layer} <Money value={p.amount} />
                          </span>
                        ))}
                      </td>
                      <td className="right"><Money value={s.total} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {d.status === 'PENDING_APPROVAL' && canApprove && (
            <div className="card">
              <h2 style={{ fontSize: 'var(--text-md)' }}>Persetujuan</h2>
              <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: 'var(--space-xs) 0 var(--space-md)' }}>
                Menyetujui akan mencatat <Money value={d.totalDistributed} /> ke ledger{' '}
                {d.summary.length} investor. Tindakan ini tidak dapat dibatalkan, koreksi
                hanya bisa lewat pembalikan.
              </p>
              {error && <div className="alert s-critical" role="alert">{error}</div>}
              <div className="row">
                <button className="btn btn-primary" disabled={busy} onClick={() => act('approve')}>
                  {busy ? 'Memproses…' : 'Setujui distribusi'}
                </button>
                <button className="btn btn-danger" disabled={busy} onClick={() => act('reject')}>Tolak</button>
              </div>
            </div>
          )}

          {/* Ops penjualan bisa MELIHAT distribusi (distribution:read:all)
              tapi tidak boleh menyetujui — beri konteks, bukan tombol yang
              pasti gagal. */}
          {d.status === 'PENDING_APPROVAL' && !canApprove && (
            <div className="alert s-warning" role="status" style={{ marginBottom: 0 }}>
              <span>Menunggu persetujuan admin keuangan.</span>
            </div>
          )}

          <div className="card card-2">
            <h2 style={{ fontSize: 'var(--text-sm)' }}>Snapshot aturan</h2>
            <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
              Setiap lapisan menyimpan salinan utuh aturan pada detik distribusi terjadi.
              Mengubah aturan sekarang tidak mengubah angka di halaman ini.
            </p>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 'var(--text-sm)' }}>
              {d.layers.map((l) => (
                <li key={l.layerIndex}>
                  {l.rule.name} <span className="num muted">v{l.rule.version}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
