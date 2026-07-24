'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui';
import { DistributionWaterfall, WaterfallData } from '@/components/waterfall';

const CATEGORIES = ['Elektronik', 'Aksesori', 'Infrastruktur'];

/**
 * Uji coba mandiri — TANPA membuat rule apa pun. Beda dari panel simulasi
 * di editor Aturan (yang menjawab "apa yang akan terjadi kalau rule BARU
 * ini saya aktifkan"), halaman ini menjawab pertanyaan yang lebih sederhana:
 * "kalau ada transaksi seperti ini HARI INI, bagaimana rantai aturan yang
 * SUDAH aktif akan membaginya?" — dipakai untuk mengecek dampak sebelum
 * membuat rule sama sekali, atau sekadar menjelaskan kebijakan ke pihak lain.
 */
export default function SimulatorPage() {
  const [category, setCategory] = useState('Elektronik');
  const [profit, setProfit] = useState('10000000');
  const [sim, setSim] = useState<WaterfallData | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSim(null);
      api<WaterfallData>('/profit-rules/simulate', {
        method: 'POST',
        body: JSON.stringify({ productCategory: category, netProfit: profit || '0' }),
      }).then(setSim).catch(() => setSim(null));
    }, 250);
    return () => clearTimeout(t);
  }, [category, profit]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Simulator</h1>
          <p className="page-sub">Uji coba mandiri — lihat rantai aturan yang sudah aktif tanpa membuat aturan baru</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="row" style={{ marginBottom: 'var(--space-md)' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="simcat">Kategori produk</label>
            <select id="simcat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="simprofit">Laba bersih (Rp)</label>
            <input id="simprofit" className="input num right" inputMode="numeric" value={profit}
              onChange={(e) => setProfit(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>

        {!sim ? (
          <Skeleton rows={4} />
        ) : sim.isFallback ? (
          <div className="alert s-warning" style={{ marginBottom: 0 }}>
            Tidak ada aturan aktif yang cocok untuk kombinasi ini, seluruh laba akan ditahan perusahaan.
          </div>
        ) : (
          <DistributionWaterfall data={sim} />
        )}
      </div>
    </>
  );
}
