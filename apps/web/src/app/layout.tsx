import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bagi Hasil · Panel Admin',
  description: 'Sistem transaksi dengan skema pembagian keuntungan dinamis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* JetBrains Mono dicabut — mono untuk angka/label sistem diputuskan
            terlalu "teknis" untuk audiens lintas generasi (lihat design.md
            § Typography). Satu famili, satu unduhan font, lebih ringan. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
