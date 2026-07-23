'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, LogOut } from 'lucide-react';
import { api, clearToken, getToken } from '@/lib/api';
import { Empty } from '@/components/ui';

/**
 * Shell portal investor — deliberately terpisah dari shell admin `(app)`.
 *
 * Tidak ada sidebar dengan menu Aturan/Transaksi/Approval di sini sama sekali,
 * bukan karena disembunyikan lewat CSS, tapi karena route group-nya sendiri
 * tidak pernah memuat komponen-komponen itu. Investor tidak bisa "melihat
 * tombolnya lalu ditolak izin" — tombolnya memang tidak pernah dikirim.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<'checking' | 'ok' | 'not-investor'>('checking');
  const [name, setName] = useState('');

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    api<{ name: string }>('/investors/me')
      .then((me) => { setName(me.name); setState('ok'); })
      .catch(() => setState('not-investor'));
  }, [router]);

  if (state === 'checking') return null;

  if (state === 'not-investor') {
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 'var(--space-lg)' }}>
        <div style={{ maxWidth: 420 }}>
          <Empty
            title="Akun ini tidak tertaut ke profil investor"
            hint="Kalau Anda admin atau ops, portal ini bukan untuk Anda. Kembali ke dashboard."
            action={
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn btn-sm" onClick={() => router.push('/dashboard')}>Ke dashboard</button>
                <button className="btn btn-sm" onClick={() => { clearToken(); router.push('/login'); }}>
                  Keluar
                </button>
              </div>
            }
          />
        </div>
      </main>
    );
  }

  return (
    <div className="portal-shell" style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-xl) var(--space-lg) var(--space-3xl)' }}>
      <header className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--space-xl)' }}>
        <div className="row">
          <span className="rail-mark" aria-hidden="true" />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{name}</div>
            <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>Portal Investor</div>
          </div>
        </div>
        {/* Disembunyikan di mobile — tab bar bawah sudah punya "Keluar",
            dua tombol identik di layar sempit cuma bikin berisik. */}
        <button
          className="btn btn-sm header-logout-desktop"
          onClick={() => { clearToken(); router.push('/login'); }}
        >
          Keluar
        </button>
      </header>
      {children}

      {/* Tab bar mobile — cuma 2 tujuan nyata yang portal ini punya. Tidak
          dikarang jadi 5 ikon seperti referensi supaya "penuh"; portal
          memang sesederhana ini. */}
      <nav className="mobile-tabbar" aria-label="Navigasi utama">
        <Link href="/portal" className="tabbar-item" aria-current={pathname === '/portal' ? 'page' : undefined}>
          <Home size={20} strokeWidth={2} aria-hidden="true" />
          Beranda
        </Link>
        <button
          type="button"
          className="tabbar-item"
          onClick={() => { clearToken(); router.push('/login'); }}
        >
          <LogOut size={20} strokeWidth={2} aria-hidden="true" />
          Keluar
        </button>
      </nav>
    </div>
  );
}
