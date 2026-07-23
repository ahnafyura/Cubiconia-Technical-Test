'use client';

import { Document, Page, View, Text, styles, COLOR, ReceiptHeader, StatusPill, ReceiptFooter, rp, bp, date } from '@/lib/receipt-pdf';

interface InvestorReceiptData {
  code: string;
  status: string;
  distributedAt: string;
  transactionCode: string;
  productName: string;
  productCategory: string;
  netProfit: string;
  myTotal: string;
  layers: {
    layerIndex: number; ruleName: string; basisType: 'GROSS' | 'RESIDUAL';
    basisAmount: string; myAmount: string; myBasisPoints: number;
  }[];
}

const BASIS_LABEL: Record<string, string> = { GROSS: 'laba awal', RESIDUAL: 'sisa berjalan' };

/** Resi untuk portal investor — HANYA memuat porsi investor yang mengunduh.
 *  `d` di sini datang dari /investors/me/distributions/:id, yang sudah
 *  menyaring data investor lain di server; komponen ini tidak menerima
 *  (dan karena itu tidak bisa membocorkan) data siapa pun selain pemiliknya. */
export function InvestorDistributionReceipt({ d, investorName }: { d: InvestorReceiptData; investorName: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ReceiptHeader title="BUKTI BAGI HASIL · PORTAL INVESTOR" />
        <View style={styles.hr} />

        <View style={styles.codeRow}>
          <Text style={styles.code}>{d.code}</Text>
          <StatusPill status={d.status} />
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Investor</Text>
            <Text style={styles.metaValue}>{investorName}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Tanggal distribusi</Text>
            <Text style={styles.metaValue}>{date(d.distributedAt)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Kode transaksi</Text>
            <Text style={styles.metaValue}>{d.transactionCode}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Produk</Text>
            <Text style={styles.metaValue}>{d.productName} · {d.productCategory}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={[styles.card, styles.hero]}>
            <Text style={styles.heroLabel}>Porsi Anda dari transaksi ini</Text>
            <Text style={styles.heroValue}>{rp(d.myTotal)}</Text>
            <Text style={styles.heroNote}>dari laba bersih transaksi {rp(d.netProfit)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bagaimana angka ini dihitung</Text>
          <View style={styles.table}>
            <View style={styles.thead}>
              <Text style={[styles.th, { width: '10%' }]}>#</Text>
              <Text style={[styles.th, { width: '32%' }]}>Aturan</Text>
              <Text style={[styles.th, { width: '24%' }]}>Dasar hitung</Text>
              <Text style={[styles.th, { width: '14%' }]}>Porsi</Text>
              <Text style={[styles.th, { width: '20%' }, styles.right]}>Nominal</Text>
            </View>
            {d.layers.map((l) => (
              <View style={styles.tr} key={l.layerIndex}>
                <Text style={[styles.td, { width: '10%' }]}>{l.layerIndex + 1}</Text>
                <Text style={[styles.td, { width: '32%' }]}>{l.ruleName}</Text>
                <Text style={[styles.td, { width: '24%', fontSize: 8 }]}>
                  {BASIS_LABEL[l.basisType]} ({rp(l.basisAmount)})
                </Text>
                <Text style={[styles.td, { width: '14%' }]}>{bp(l.myBasisPoints)}</Text>
                <Text style={[styles.tdStrong, { width: '20%' }, styles.right]}>{rp(l.myAmount)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.noteBox}>
          <Text>
            Dokumen ini hanya memuat porsi Anda. Investor lain yang mungkin juga menerima bagi hasil dari
            transaksi ini tidak ditampilkan. Rincian mereka bukan bagian dari data yang dikirim ke akun Anda.
            Dokumen dibuat otomatis dari sistem dan sah sebagai bukti internal tanpa tanda tangan basah.
          </Text>
        </View>

        <ReceiptFooter code={d.code} />
      </Page>
    </Document>
  );
}
