'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Money, Skeleton, StatusBadge } from '@/components/ui';
import { CompanyTrendChart, CompanyTrendPoint, InvestorBreakdownChart, InvestorShare } from '@/components/dashboard-charts';
import { pct } from '@/lib/format';

interface Summary {
  revenue: string; netProfit: string; distributed: string; retained: string;
  transactionCount: number; pendingApproval: number; flagged: number;
  recent: { id: string; code: string; netProfit: string; product: { name: string };
    customer: { name: string }; distribution: { status: string } | null }[];
  trend: CompanyTrendPoint[];
  byInvestor: InvestorShare[];
}

export default function DashboardPage() {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => { api<Summary>('/dashboard/summary').then(setData).catch(() => {}); }, []);
  if (!data) return <Skeleton rows={6} />;

  const needsAttention = data.pendingApproval + data.flagged;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">{data.transactionCount} transaksi selesai</p>
        </div>
      </div>

      {/* Yang butuh tindakan mendahului yang enak dilihat. Dashboard yang membuka
          dengan angka bagus sementara ada distribusi menggantung sudah gagal tugasnya. */}
      {needsAttention > 0 && (
        <div className="alert s-warning" role="status">
          <span>
            <strong>{data.pendingApproval} distribusi</strong> menunggu persetujuan
            {data.flagged > 0 && <> · <strong>{data.flagged}</strong> perlu ditinjau</>}
          </span>
          <Link className="btn btn-sm" href="/distribusi?status=PENDING_APPROVAL">Tinjau sekarang →</Link>
        </div>
      )}

      <div className="kpi-row">
        <div className="card">
          <div className="kpi-label">Pendapatan</div>
          <div className="kpi-value"><Money value={data.revenue} abbreviate size="hero" /></div>
          <div className="kpi-note">dari transaksi selesai</div>
        </div>
        <div className="card">
          <div className="kpi-label">Laba bersih</div>
          <div className="kpi-value"><Money value={data.netProfit} abbreviate size="hero" /></div>
          <div className="kpi-note">pendapatan − biaya produksi</div>
        </div>
        <div className="card">
          <div className="kpi-label">Dibagikan</div>
          <div className="kpi-value"><Money value={data.distributed} abbreviate size="hero" /></div>
          <div className="kpi-note">{pct(data.distributed, data.netProfit)} dari laba</div>
        </div>
        <div className="card">
          <div className="kpi-label">Ditahan</div>
          <div className="kpi-value"><Money value={data.retained} abbreviate size="hero" /></div>
          <div className="kpi-note">{pct(data.retained, data.netProfit)} dari laba</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 'var(--space-xl)' }}>
        <div className="card">
          <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-sm)' }}>Laba Bersih & Dibagikan</h2>
          <CompanyTrendChart points={data.trend} />
        </div>
        <div className="card">
          <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-md)' }}>Distribusi per Investor</h2>
          {data.byInvestor.length === 0 ? (
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>Belum ada distribusi tercatat.</p>
          ) : (
            <InvestorBreakdownChart items={data.byInvestor} />
          )}
        </div>
      </div>

      <h2 style={{ fontSize: 'var(--text-md)', margin: 'var(--space-xl) 0 var(--space-sm)' }}>
        Transaksi terakhir
      </h2>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Kode</th><th>Produk</th><th>Pelanggan</th>
              <th className="right">Laba bersih</th><th>Bagi hasil</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((t) => (
              <tr key={t.id}>
                <td className="num">{t.code}</td>
                <td>{t.product.name}</td>
                <td className="muted">{t.customer.name}</td>
                <td className="right"><Money value={t.netProfit} /></td>
                <td>{t.distribution ? <StatusBadge status={t.distribution.status} /> : <span className="muted">Belum ada</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
