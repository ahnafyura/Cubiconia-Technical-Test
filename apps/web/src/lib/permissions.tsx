'use client';

import { createContext, useContext } from 'react';

export interface Me {
  email: string;
  displayName?: string;
  roles: string[];
  permissions: string[];
}

/**
 * Konteks permission bersama — diisi SEKALI oleh `(app)/layout.tsx` (yang
 * memang sudah memanggil `/auth/me` untuk keperluan redirect), lalu dipakai
 * ulang oleh halaman-halaman di bawahnya. Tanpa ini, tiap halaman yang perlu
 * tahu "apakah saya boleh menekan tombol ini" akan memanggil /auth/me
 * sendiri-sendiri.
 */
export const PermissionsContext = createContext<Me | null>(null);

export function usePermissions() {
  const me = useContext(PermissionsContext);
  return {
    me,
    has: (permission: string) => me?.permissions.includes(permission) ?? false,
  };
}
