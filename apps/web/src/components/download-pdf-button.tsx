'use client';

import { useState, type ReactElement } from 'react';

/**
 * Tombol ini SENGAJA tidak mengimpor @react-pdf/renderer di level modul —
 * pustaka itu ~500KB dan cuma dibutuhkan kalau tombolnya benar-benar
 * diklik. `buildDoc` men-dynamic-import template resi (yang mengimpor
 * react-pdf) hanya di dalam handler klik, jadi beban itu tidak pernah
 * masuk ke first-load JS halaman detail — hanya diunduh browser
 * saat pengguna memang mau mengunduh PDF.
 */
export function DownloadPdfButton({
  buildDoc, filename, label = 'Unduh PDF',
}: { buildDoc: () => Promise<ReactElement<any>>; filename: string; label?: string }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const [{ pdf }, doc] = await Promise.all([
        import('@react-pdf/renderer'),
        buildDoc(),
      ]);
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-sm" onClick={handleClick} disabled={busy}>
      {busy ? 'Menyiapkan…' : label}
    </button>
  );
}
