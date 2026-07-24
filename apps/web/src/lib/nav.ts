import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Receipt, Layers, Share2, Users, Network,
  Package, FlaskConical, Landmark, ScrollText, SlidersHorizontal,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** `undefined` = boleh dilihat siapa pun yang masuk shell admin. */
  permission?: string;
  /** Item dengan rute detail bertingkat (mis. /distribusi/[id]) yang harus
   *  tetap membuat nav induknya aktif saat sub-halaman dibuka. */
  matchPrefix?: boolean;
}

/**
 * Satu-satunya sumber kebenaran "siapa boleh lihat apa" di shell admin —
 * dipakai baik oleh `(app)/layout.tsx` (render sidebar + tab bar + jaga
 * halaman mana yang boleh dibuka) MAUPUN `login/page.tsx` (tentukan tujuan
 * pertama setelah masuk). Sebelumnya kedua tempat itu menyalin aturan ini
 * sendiri-sendiri — begitu ada peran baru, gampang salah satu ketinggalan
 * diperbarui (persis yang nyaris terjadi waktu ops_penjualan diperketat).
 */
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Operasional', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'distribution:read:all' },
    { href: '/transaksi', label: 'Transaksi', icon: Receipt, permission: 'transaction:read' },
    { href: '/katalog', label: 'Katalog', icon: Package, permission: 'catalog:manage' },
  ]},
  { group: 'Bagi Hasil', items: [
    { href: '/aturan', label: 'Aturan', icon: Layers, permission: 'profit_rule:read' },
    { href: '/distribusi', label: 'Distribusi', icon: Share2, permission: 'distribution:read:all', matchPrefix: true },
    { href: '/simulator', label: 'Simulator', icon: FlaskConical, permission: 'profit_rule:read' },
    { href: '/investor', label: 'Investor', icon: Landmark, permission: 'investor:read:any' },
  ]},
  { group: 'Direktori', items: [
    { href: '/direktori', label: 'Karyawan', icon: Users, permission: 'employee:manage' },
    { href: '/direktori/bagan', label: 'Bagan', icon: Network, permission: 'employee:manage' },
  ]},
  { group: 'Sistem', items: [
    { href: '/audit', label: 'Audit Log', icon: ScrollText, permission: 'audit:read' },
    { href: '/pengaturan', label: 'Pengaturan', icon: SlidersHorizontal, permission: 'settings:manage' },
  ]},
];

export function allowedNavItems(permissions: string[]): NavItem[] {
  return NAV.flatMap((g) => g.items).filter((i) => !i.permission || permissions.includes(i.permission));
}

/** Pencocokan EKSAK secara default — lihat matchPrefix di atas untuk kenapa. */
export function isNavActive(pathname: string, item: Pick<NavItem, 'href' | 'matchPrefix'>): boolean {
  if (pathname === item.href) return true;
  return Boolean(item.matchPrefix) && pathname.startsWith(`${item.href}/`);
}
