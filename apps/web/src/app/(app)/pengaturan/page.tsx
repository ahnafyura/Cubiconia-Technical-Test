'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Money, Skeleton } from '@/components/ui';

export default function PengaturanPage() {
  const [threshold, setThreshold] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ thresholdIdr: string }>('/settings/approval-threshold')
      .then((d) => { setThreshold(d.thresholdIdr); setInput(d.thresholdIdr); })
      .catch(() => setThreshold('0'));
  }, []);

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const digits = input.replace(/\D/g, '') || '0';
      await api('/settings/approval-threshold', { method: 'PUT', body: JSON.stringify({ thresholdIdr: digits }) });
      setThreshold(digits);
      setSaved(true);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pengaturan</h1>
          <p className="page-sub">Kebijakan sistem yang bisa diubah tanpa deploy ulang</p>
        </div>
      </div>

      {threshold === null ? (
        <Skeleton rows={3} />
      ) : (
        <div className="card" style={{ maxWidth: 480 }}>
          <h2 style={{ fontSize: 'var(--text-md)', marginBottom: 4 }}>Ambang batas persetujuan</h2>
          <p className="muted" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-md)' }}>
            Distribusi dengan total dibagikan sama atau lebih dari nominal ini wajib disetujui admin
            keuangan sebelum ledger-nya tercatat. Di bawah ambang, distribusi final otomatis.
          </p>

          <div className="field">
            <label htmlFor="threshold">Nominal ambang (Rp)</label>
            <input id="threshold" className="input num" inputMode="numeric" value={input}
              onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))} />
          </div>
          <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: -4, marginBottom: 'var(--space-md)' }}>
            Nilai saat ini: <Money value={threshold} />
          </p>

          {error && <div className="alert s-critical" role="alert">{error}</div>}
          {saved && <div className="alert s-good" role="status">Tersimpan — berlaku untuk distribusi berikutnya.</div>}

          <button className="btn btn-primary" disabled={saving || input === threshold} onClick={save}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      )}
    </>
  );
}
