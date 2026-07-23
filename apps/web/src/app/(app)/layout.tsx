'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from '@/lib/api';
import { Me, PermissionsContext } from '@/lib/permissions';
import { allowedNavItems, isNavActive, NAV } from '@/lib/nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [pending, setPending] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    api<Me>('/auth/me').then((me) => {
      // Investor yang nyasar ke shell admin (tautan lama, ketik URL manual)
      // diarahkan ke portalnya sendiri — bukan dibiarkan memanggil endpoint
      // yang memang akan ditolak lalu terlempar balik ke /login karena 401.
      if (me.roles.includes('investor') && !me.roles.some((r) => r !== 'investor')) {
        router.replace('/portal');
        return;
      }

      const allowed = allowedNavItems(me.permissions);
      // Halaman yang sedang dibuka tidak ada di daftar yang diizinkan —
      // misalnya ops_penjualan yang default masuk ke /dashboard padahal
      // tidak lagi punya distribution:read:all. Lempar ke tujuan pertama
      // yang memang bisa mereka akses, bukan biarkan layar kosong/gagal.
      const canSeeCurrent = allowed.some((i) => isNavActive(pathname, i));
      if (!canSeeCurrent && allowed.length > 0) {
        router.replace(allowed[0].href);
        return;
      }

      setUser(me);
      setReady(true);
      if (me.permissions.includes('distribution:read:all')) {
        api<{ pendingApproval: number }>('/dashboard/summary')
          .then((s) => setPending(s.pendingApproval))
          .catch(() => {});
      }
    }).catch(() => {});
  }, [router, pathname]);

  const initial = (user?.email ?? '?').charAt(0).toUpperCase();
  const navGroups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.permission || user?.permissions.includes(i.permission)),
  })).filter((g) => g.items.length > 0);

  if (!ready) return null;

  return (
    <PermissionsContext.Provider value={user}>
      <div className="shell">
        {/* <aside> = landmark region; <nav> di dalamnya khusus untuk daftar tautan.
            Pembaca layar mengumumkan "complementary" lalu "navigation" terpisah —
            bukan satu <nav> yang membungkus profil pengguna dan tombol keluar. */}
        <aside className="rail">
          <div className="rail-brand">
            <span className="rail-mark" aria-hidden="true" />
            <span className="rail-brand-text">
              Bagi Hasil
              <small>panel admin</small>
            </span>
          </div>

          <nav aria-label="Navigasi utama">
            {navGroups.map((g) => (
              <div className="rail-group" key={g.group}>
                <div className="rail-label">{g.group}</div>
                {g.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rail-link"
                      aria-current={isNavActive(pathname, item) ? 'page' : undefined}
                    >
                      <Icon size={18} strokeWidth={2} aria-hidden="true" />
                      <span className="rail-link-label">{item.label}</span>
                      {item.href === '/distribusi' && pending > 0 && (
                        <span className="rail-count" title={`${pending} menunggu persetujuan`}>{pending}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="rail-footer">
            <div className="rail-profile">
              <span className="rail-avatar" aria-hidden="true">{initial}</span>
              <span className="rail-profile-email">{user?.email ?? '…'}</span>
            </div>
            <button
              className="btn btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => { clearToken(); router.push('/login'); }}
            >
              Keluar
            </button>
          </div>
        </aside>

        <main className="main">{children}</main>

        {/* Tab bar mobile — item sama persis dengan sidebar (sudah tersaring
            permission), cuma diratakan jadi satu baris. Dot aksen
            menggantikan badge angka — tetap penanda nyata, cuma
            disederhanakan buat ruang kecil. */}
        <nav className="mobile-tabbar" aria-label="Navigasi utama">
          {navGroups.flatMap((g) => g.items).map((item) => {
            const Icon = item.icon;
            const active = isNavActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="tabbar-item"
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
                {item.label}
                {item.href === '/distribusi' && pending > 0 && (
                  <span className="tabbar-badge" aria-label={`${pending} menunggu persetujuan`} />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </PermissionsContext.Provider>
  );
}
