'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Empty, Money, Skeleton, StatusBadge } from '@/components/ui';
import { bp, date } from '@/lib/format';
import { DownloadPdfButton } from '@/components/download-pdf-button';

interface MyLayer {
  layerIndex: number;
  ruleName: string;
  basisType: 'GROSS' | 'RESIDUAL';
  basisAmount: string;
  myAmount: string;
  myBasisPoints: number;
}
interface MyExplain {
  code: string;
  status: string;
  distributedAt: string;
  transactionCode: string;
  productName: string;
  productCategory: string;
  netProfit: string;
  myTotal: string;
  layers: MyLayer[];
}

const BASIS_LABEL: Record<string, string> = { GROSS: 'laba awal', RESIDUAL: 'sisa berjalan' };

/**
 * Versi investor dari halaman explain admin — dengan satu perbedaan yang
 * penting: setiap angka di sini datang dari `investors/me/distributions/:id`,
 * yang sudah menyaring porsi investor lain DI SERVER. Halaman ini tidak perlu
 * (dan tidak bisa) menyembunyikan data siapa pun — data itu memang tidak
 * pernah sampai ke browser ini.
 */
export default function PortalDistributionExplain() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<MyExplain | null | undefined>(undefined);
  const [investorName, setInvestorName] = useState('');

  useEffect(() => {
    api<MyExplain>(`/investors/me/distributions/${id}`)
      .then(setD)
      .catch(() => setD(null));
    // Nama investor dipakai di resi PDF — portal tidak berbagi PermissionsContext
    // dengan shell admin, jadi diambil di sini, bukan lewat usePermissions().
    api<{ name: string }>('/investors/me').then((me) => setInvestorName(me.name)).catch(() => {});
  }, [id]);

  if (d === undefined) return <Skeleton rows={6} />;

  if (d === null) {
    return (
      <Empty
        title="Distribusi tidak ditemukan"
        hint="Bisa jadi bukan milik Anda, atau tautannya salah."
        action={<Link className="btn btn-sm" href="/portal">← Kembali ke portal</Link>}
      />
    );
  }

  return (
    <>
      <Link href="/portal" className="muted" style={{ fontSize: 'var(--text-sm)' }}>← Portal</Link>
      <div className="page-head" style={{ marginTop: 4 }}>
        <div>
          <h1 className="num">{d.code}</h1>
          <p className="page-sub">
            {d.transactionCode} · {d.productName} · {date(d.distributedAt)}
          </p>
        </div>
        <div className="row">
          <StatusBadge status={d.status} />
          <DownloadPdfButton
            buildDoc={async () => {
              const { InvestorDistributionReceipt } = await import('@/components/receipt-investor');
              return <InvestorDistributionReceipt d={d} investorName={investorName} />;
            }}
            filename={`resi-${d.code}.pdf`}
            label="Unduh resi PDF"
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="kpi-label">Porsi Anda dari transaksi ini</div>
        <Money value={d.myTotal} size="hero" />
        <div className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-xs)' }}>
          dari laba bersih transaksi <Money value={d.netProfit} />
        </div>
      </div>

      <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-sm)' }}>
        Bagaimana angka ini dihitung
      </h2>
      <p className="muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-md)' }}>
        Porsi Anda datang dari {d.layers.length} lapisan aturan. "Dasar hitung" menunjukkan
        apakah persentase dihitung dari laba awal transaksi atau dari sisa yang belum
        dialokasikan pada saat itu.
      </p>

      <div className="stack">
        {d.layers.map((l) => (
          <div className="wf-layer" key={l.layerIndex}>
            <div className="wf-layer-head">
              <span className="wf-rule">Lapisan {l.layerIndex + 1} · {l.ruleName}</span>
              <Money value={l.myAmount} direction="in" />
            </div>
            <div className="wf-meta">
              dasar hitung {BASIS_LABEL[l.basisType]} (<Money value={l.basisAmount} />) · porsi Anda {bp(l.myBasisPoints)}
            </div>
          </div>
        ))}
      </div>

      <div className="card card-2" style={{ marginTop: 'var(--space-lg)' }}>
        <p className="muted" style={{ fontSize: 'var(--text-xs)', margin: 0 }}>
          Halaman ini hanya menampilkan porsi Anda. Investor lain yang mungkin
          juga menerima bagi hasil dari transaksi ini tidak ditampilkan di sini.
          Rincian mereka bukan bagian dari data yang dikirim ke akun Anda.
        </p>
      </div>
    </>
  );
}
