'use client';

import type { DistributionLayerDto, DistributionResultDto } from '@psp/contracts';
import { Money } from './ui';
import { bp } from '@/lib/format';

// Tipe datang dari @psp/contracts — satu sumber kebenaran bersama API.
// Kalau bentuk response berubah, berkas ini gagal build, bukan menampilkan NaN.
export type WaterfallEntry = DistributionLayerDto['entries'][number];
export type WaterfallLayer = DistributionLayerDto;
export type WaterfallData = DistributionResultDto;

const BASIS_LABEL: Record<string, string> = {
  GROSS: 'laba awal',
  RESIDUAL: 'sisa berjalan',
};

function width(part: string, whole: string): string {
  const w = BigInt(whole);
  if (w === 0n) return '0%';
  const p = (Number(BigInt(part)) / Number(w)) * 100;
  return `${Math.max(0.6, Math.min(100, p))}%`;
}

/**
 * Air terjun — uang mengalir turun lewat lapisan.
 *
 * Arah vertikal dipilih, bukan bagan air terjun horizontal: "uang mengalir
 * turun" langsung dipahami tanpa penjelasan, dan lapisan berikutnya secara
 * alami dibaca setelah lapisan sebelumnya.
 *
 * "Dasar hitung" ditulis eksplisit di setiap lapisan — inilah satu-satunya cara
 * pembaca memahami kenapa 20% di satu lapisan menghasilkan angka yang tidak
 * sebanding dengan 30% di lapisan lain: dasarnya memang berbeda.
 *
 * Ditandai role="table" agar pembaca layar mendapat struktur yang sama. Tampilan
 * ini memuat informasi terpenting di aplikasi; kalau hanya bisa dipahami secara
 * visual, ia gagal justru di bagian yang paling menentukan.
 */
export function DistributionWaterfall({ data }: { data: WaterfallData }) {
  const { netProfit, layers, retainedByCompany } = data;

  return (
    <div className="wf" role="table" aria-label="Rantai pembagian keuntungan">
      <div role="row">
        <div className="wf-row">
          <span className="wf-total" role="rowheader">Laba bersih</span>
          <Money value={netProfit} size="hero" />
        </div>
        <div className="wf-bar" style={{ width: '100%' }} aria-hidden="true" />
      </div>

      {layers.map((layer) => (
        <div className="wf-layer" key={layer.layerIndex} role="row">
          <div className="wf-layer-head">
            <span>
              <span className="wf-rule">
                Lapisan {layer.layerIndex + 1} · {layer.ruleName}
              </span>
              {layer.clamped && (
                <span className="badge s-serious" style={{ marginLeft: 8 }}>
                  <span className="badge-dot" aria-hidden="true" />
                  dipotong
                </span>
              )}
            </span>
            <Money value={`-${layer.allocatedAmount}`} />
          </div>

          <div className="wf-meta">
            dasar hitung {BASIS_LABEL[layer.basisType]} · <Money value={layer.basisAmount} />
          </div>

          <div
            className="wf-bar"
            style={{ width: width(layer.allocatedAmount, netProfit) }}
            aria-hidden="true"
          />

          {layer.entries.map((e) => (
            <div className="wf-entry" key={`${layer.layerIndex}-${e.investorId}`}>
              <span>{e.investorName}</span>
              <span className="num right">{bp(e.basisPoints)}</span>
              <span className="right">
                <Money value={e.amount} />
              </span>
            </div>
          ))}

          <div className="wf-remaining">
            <span>Sisa setelah lapisan ini</span>
            <Money value={layer.remainingAfter} />
          </div>
        </div>
      ))}

      <div role="row">
        <div className="wf-row">
          <span style={{ fontWeight: 500 }}>Ditahan perusahaan</span>
          <Money value={retainedByCompany} />
        </div>
        <div
          className="wf-bar wf-bar-muted"
          style={{ width: width(retainedByCompany, netProfit) }}
          aria-hidden="true"
        />
        <div className="wf-meta" style={{ marginTop: 4 }}>
          termasuk seluruh sisa pembulatan
        </div>
      </div>

      {/* Blok penutup selalu menutup angka. Kalau pernah tidak berjumlah pas,
          itu bug — dan tampilan ini yang menangkapnya lebih dulu daripada
          laporan bulanan. */}
      <div className="card card-2" style={{ marginTop: 'var(--space-xs)' }}>
        <div className="wf-row">
          <span className="muted">Total dibagikan</span>
          <Money value={data.totalDistributed} />
        </div>
        <div className="wf-row">
          <span className="muted">Ditahan perusahaan</span>
          <Money value={retainedByCompany} />
        </div>
        <div
          className="wf-row"
          style={{ borderTop: '1px solid var(--color-rule)', marginTop: 8, paddingTop: 8, fontWeight: 600 }}
        >
          <span>Laba bersih</span>
          <Money value={netProfit} />
        </div>
      </div>
    </div>
  );
}
