'use client';

const TOKEN_KEY = 'psp.token';

export function getToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string): void { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken(): void { localStorage.removeItem(TOKEN_KEY); }

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Sesi berakhir');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.message ?? body?.error?.message ?? `Gagal (${res.status})`);
  }
  return body?.data as T;
}

/**
 * Sama seperti api(), tapi menempelkan header Idempotency-Key — dipakai
 * untuk aksi yang mengubah uang/data sensitif (buat transaksi, buat aturan)
 * supaya klik ganda atau retry jaringan tidak membuat efek dua kali. Kuncinya
 * dibuat baru SETIAP PANGGILAN (bukan sekali per form) — itu cukup untuk
 * kasus paling umum (klik ganda saat tombol belum sempat disabled), karena
 * backend menolak permintaan kedua dengan key IN_PROGRESS yang sama sebelum
 * yang pertama selesai.
 */
export async function apiIdempotent<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return api<T>(path, { ...init, headers: { ...init.headers, 'Idempotency-Key': key } });
}
