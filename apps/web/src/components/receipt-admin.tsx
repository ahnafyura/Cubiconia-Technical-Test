'use client';

import { Document, Page, View, Text, styles, COLOR, ReceiptHeader, StatusPill, ReceiptFooter, rp, date } from '@/lib/receipt-pdf';

interface AdminReceiptData {
  id: string; code: string; status: string; netProfit: string; totalDistributed: string;
  retainedByCompany: string; isFallback: boolean; overAllocated: boolean; distributedAt: string;
  transaction: {
    code: string; revenue: string; productionCostTotal: string; quantity: number;
    product: { name: string; category: string }; customer: { name: string };
  };
  layers: {
    layerIndex: number; basisType: 'GROSS' | 'RESIDUAL'; basisAmount: string;
    allocatedAmount: string; clamped: boolean;
    rule: { id: string; name: string; version: number };
  }[];
  summary: { investorId: string; investorName: string; total: string; parts: { layer: number; amount: string }[] }[];
}

const BASIS_LABEL: Record<string, string> = { GROSS: 'laba awal', RESIDUAL: 'sisa berjalan' };

/** Resi lengkap untuk panel admin — memuat seluruh investor, karena admin
 *  memang berwenang melihat rantai distribusi secara penuh (distribution:read:all). */
export function AdminDistributionReceipt({ d }: { d: AdminReceiptData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ReceiptHeader title="BUKTI DISTRIBUSI BAGI HASIL" />
        <View style={styles.hr} />

        <View style={styles.codeRow}>
          <Text style={styles.code}>{d.code}</Text>
          <StatusPill status={d.status} />
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Kode transaksi</Text>
            <Text style={styles.metaValue}>{d.transaction.code}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Tanggal distribusi</Text>
            <Text style={styles.metaValue}>{date(d.distributedAt)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Produk</Text>
            <Text style={styles.metaValue}>{d.transaction.product.name} · {d.transaction.quantity} unit</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Pelanggan</Text>
            <Text style={styles.metaValue}>{d.transaction.customer.name}</Text>
          </View>
        </View>

        {d.isFallback && (
          <View style={[styles.alertBox, { backgroundColor: COLOR.warningWash }]}>
            <Text style={{ color: COLOR.warning }}>
              Tidak ada aturan bagi hasil yang cocok saat transaksi ini diproses, seluruh laba ditahan perusahaan.
            </Text>
          </View>
        )}
        {d.overAllocated && (
          <View style={[styles.alertBox, { backgroundColor: COLOR.seriousWash }]}>
            <Text style={{ color: COLOR.serious }}>
              Rantai aturan mengalokasikan lebih dari laba yang tersedia, porsi di bawah ini sudah dipotong proporsional.
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ringkasan keuangan</Text>
          <View style={styles.card}>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Pendapatan</Text>
              <Text style={styles.kvValue}>{rp(d.transaction.revenue)}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Biaya produksi</Text>
              {/* Hyphen-minus biasa, BUKAN U+2212 seperti rp() pakai untuk web —
                  font Helvetica standar PDF (WinAnsiEncoding) tidak punya
                  glyph U+2212, jadi tandanya hilang tak terlihat kalau dipakai. */}
              <Text style={styles.kvValue}>-{rp(d.transaction.productionCostTotal)}</Text>
            </View>
            <View style={styles.kvRowStrong}>
              <Text style={styles.kvLabel}>Laba bersih</Text>
              <Text style={styles.kvValueStrong}>{rp(d.netProfit)}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Dibagikan ke investor</Text>
              <Text style={styles.kvValue}>{rp(d.totalDistributed)}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Ditahan perusahaan</Text>
              <Text style={styles.kvValue}>{rp(d.retainedByCompany)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rincian lapisan aturan</Text>
          <View style={styles.table}>
            <View style={styles.thead}>
              <Text style={[styles.th, { width: '8%' }]}>#</Text>
              <Text style={[styles.th, { width: '34%' }]}>Aturan</Text>
              <Text style={[styles.th, { width: '24%' }]}>Dasar hitung</Text>
              <Text style={[styles.th, { width: '34%' }, styles.right]}>Dialokasikan</Text>
            </View>
            {d.layers.map((l) => (
              <View style={styles.tr} key={l.layerIndex}>
                <Text style={[styles.td, { width: '8%' }]}>{l.layerIndex + 1}</Text>
                <Text style={[styles.td, { width: '34%' }]}>{l.rule.name} v{l.rule.version}</Text>
                <Text style={[styles.td, { width: '24%' }]}>{BASIS_LABEL[l.basisType]}</Text>
                <Text style={[styles.tdStrong, { width: '34%' }, styles.right]}>{rp(l.allocatedAmount)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ringkasan per investor</Text>
          {d.summary.length === 0 ? (
            <Text style={{ fontSize: 9, color: COLOR.muted }}>Tidak ada porsi investor pada distribusi ini.</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.thead}>
                <Text style={[styles.th, { width: '38%' }]}>Investor</Text>
                <Text style={[styles.th, { width: '38%' }]}>Rincian lapisan</Text>
                <Text style={[styles.th, { width: '24%' }, styles.right]}>Total</Text>
              </View>
              {d.summary.map((s) => (
                <View style={styles.tr} key={s.investorId}>
                  <Text style={[styles.td, { width: '38%' }]}>{s.investorName}</Text>
                  <Text style={[styles.td, { width: '38%', fontSize: 8 }]}>
                    {s.parts.map((p) => `L${p.layer} ${rp(p.amount)}`).join('  +  ')}
                  </Text>
                  <Text style={[styles.tdStrong, { width: '24%' }, styles.right]}>{rp(s.total)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.noteBox}>
          <Text>
            Setiap lapisan menyimpan salinan utuh aturan bagi hasil pada detik distribusi ini terjadi.
            Perubahan aturan setelahnya tidak mengubah angka di dokumen ini. Dokumen dibuat otomatis dari
            sistem dan sah sebagai bukti internal tanpa tanda tangan basah.
          </Text>
        </View>

        <ReceiptFooter code={d.code} />
      </Page>
    </Document>
  );
}
