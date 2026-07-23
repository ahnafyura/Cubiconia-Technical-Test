'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';
import { allowedNavItems } from '@/lib/nav';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@contoh.id');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ accessToken: string; user: { roles: string[]; permissions: string[] } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(res.accessToken);
      // Tujuan pertama dihitung dari SATU sumber kebenaran yang sama dipakai
      // shell admin (lib/nav.ts) — bukan disalin ulang di sini. Kalau nanti
      // ada peran baru atau izin suatu halaman berubah, cukup diperbarui di
      // satu tempat; login otomatis ikut benar, tidak ada risiko dua tempat
      // saling tidak sinkron.
      const { roles, permissions } = res.user;
      const isInvestorOnly = roles.includes('investor') && !roles.some((r) => r !== 'investor');
      const firstAllowed = allowedNavItems(permissions)[0]?.href;
      router.push(isInvestorOnly ? '/portal' : (firstAllowed ?? '/dashboard'));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-visual">
          <Image src="/img/auth2.png" alt="" fill sizes="(max-width: 860px) 0px, 500px" priority />
          <div className="auth-visual-scrim" aria-hidden="true" />
          <div className="auth-visual-content">
            <span className="auth-visual-kicker">Sistem Bagi Hasil</span>
            <p className="auth-visual-caption">
              Setiap distribusi tercatat lengkap. Aturan bisa berubah kapan saja
              tanpa memengaruhi transaksi yang sudah berjalan.
            </p>
          </div>
        </div>

        {/* Panel kanan: formulir. Hanya elemen yang benar benar berfungsi. */}
        <div className="auth-form-panel">
          <div className="row" style={{ marginBottom: 'var(--space-xl)' }}>
            <span className="rail-mark" aria-hidden="true" />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Bagi Hasil</span>
          </div>

          <h1 className="auth-heading">Masuk</h1>
          <p className="auth-subtitle">Satu akun untuk admin dan investor.</p>

          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            </div>
            <div className="field">
              <label htmlFor="password">Kata sandi</label>
              <input id="password" className="input" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>

            {error && (
              <div className="alert s-critical" role="alert" style={{ marginBottom: 'var(--space-sm)' }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-xs)' }}
              disabled={busy}
            >
              {busy ? 'Memeriksa…' : 'Masuk'}
            </button>
          </form>

          <p className="page-sub" style={{ marginTop: 'var(--space-lg)' }}>
            Akun demo sudah terisi. Investor login dengan{' '}
            <strong style={{ fontWeight: 600, color: 'var(--color-ink)' }}>investor1@contoh.id</strong> memakai kata sandi yang
            sama, lalu diarahkan ke portalnya sendiri yang hanya memuat porsinya.
          </p>
        </div>
      </div>
    </div>
  );
}
