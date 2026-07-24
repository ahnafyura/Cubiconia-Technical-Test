'use client';

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { rp, bp, date } from './format';

/**
 * Template PDF resi (distribusi bagi hasil).
 *
 * @react-pdf/renderer merender lewat mesin layout sendiri, bukan DOM/CSS asli
 * — ia tidak bisa membaca var(--token) dari tokens.css. Nilai warna di bawah
 * SENGAJA diduplikasi sebagai hex, disalin persis dari tokens.css saat ini.
 * Kalau tokens.css berubah, sinkronkan manual di sini juga.
 *
 * Font memakai Helvetica bawaan (bukan Montserrat/JetBrains Mono seperti UI
 * web) — bawaan berarti tanpa fetch file font eksternal saat PDF dibuat di
 * browser pengguna, jadi tidak bisa gagal karena jaringan. PDF adalah
 * artefak ekspor yang berdiri sendiri, bukan bagian dari plafon 3-font UI.
 */
const COLOR = {
  paper: '#eef4fc',
  paper2: '#f9fcff',
  paper3: '#dde7f4',
  rule: '#c9d4e1',
  muted: '#505f71',
  ink2: '#27394f',
  ink: '#061221',
  accent: '#006cd8',
  accentWash: '#c9e4ff',
  good: '#17810d',
  goodWash: '#dcf3da',
  warning: '#a45d00',
  warningWash: '#f3e3cf',
  serious: '#c73e1a',
  seriousWash: '#f6ddd3',
  critical: '#ce3537',
  criticalWash: '#f8dcdc',
};

const STATUS_TONE: Record<string, { fg: string; bg: string; label: string }> = {
  SETTLED: { fg: COLOR.good, bg: COLOR.goodWash, label: 'Final' },
  PENDING_APPROVAL: { fg: COLOR.warning, bg: COLOR.warningWash, label: 'Menunggu persetujuan' },
  REJECTED: { fg: COLOR.critical, bg: COLOR.criticalWash, label: 'Ditolak' },
  REVERSED: { fg: COLOR.critical, bg: COLOR.criticalWash, label: 'Dikembalikan' },
};

export const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9.5,
    color: COLOR.ink2,
    fontFamily: 'Helvetica',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 20, height: 20, borderRadius: 6, backgroundColor: COLOR.accent },
  brandName: { fontSize: 12, fontWeight: 700, color: COLOR.ink },
  brandCaption: { fontSize: 8, color: COLOR.muted, marginTop: 1 },
  docTitleBlock: { alignItems: 'flex-end' },
  docTitle: { fontSize: 9, fontWeight: 700, color: COLOR.muted, letterSpacing: 0.6 },
  docDate: { fontSize: 8, color: COLOR.muted, marginTop: 2 },

  hr: { borderBottomWidth: 1, borderBottomColor: COLOR.rule, marginTop: 16, marginBottom: 16 },

  codeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontSize: 20, fontWeight: 700, color: COLOR.ink },
  statusPill: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, fontSize: 8.5, fontWeight: 700 },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 0 },
  metaCell: { width: '50%', marginBottom: 10 },
  metaLabel: { fontSize: 7.5, color: COLOR.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  metaValue: { fontSize: 10, color: COLOR.ink, marginTop: 2, fontWeight: 700 },

  section: { marginTop: 18 },
  sectionTitle: { fontSize: 10.5, fontWeight: 700, color: COLOR.ink, marginBottom: 8 },

  card: { backgroundColor: COLOR.paper2, borderWidth: 1, borderColor: COLOR.rule, borderRadius: 8, padding: 12 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  kvRowStrong: {
    flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4,
    borderTopWidth: 1, borderTopColor: COLOR.rule,
  },
  kvLabel: { color: COLOR.muted },
  kvValue: { color: COLOR.ink, fontWeight: 700 },
  kvValueStrong: { color: COLOR.ink, fontWeight: 700, fontSize: 11 },

  table: { borderWidth: 1, borderColor: COLOR.rule, borderRadius: 8, overflow: 'hidden' },
  thead: { flexDirection: 'row', backgroundColor: COLOR.paper3 },
  th: { padding: 7, fontSize: 7.5, fontWeight: 700, color: COLOR.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLOR.rule },
  td: { padding: 7, fontSize: 9, color: COLOR.ink2 },
  tdStrong: { padding: 7, fontSize: 9, color: COLOR.ink, fontWeight: 700 },
  right: { textAlign: 'right' },

  hero: { alignItems: 'flex-start' },
  heroLabel: { fontSize: 8, color: COLOR.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroValue: { fontSize: 24, fontWeight: 700, color: COLOR.ink, marginTop: 4 },
  heroNote: { fontSize: 8.5, color: COLOR.muted, marginTop: 4 },

  noteBox: {
    marginTop: 14, backgroundColor: COLOR.paper3, borderRadius: 8, padding: 10,
    fontSize: 8, color: COLOR.muted, lineHeight: 1.5,
  },
  alertBox: {
    marginTop: 14, borderRadius: 8, padding: 10, fontSize: 8.5, lineHeight: 1.5,
  },

  footer: {
    position: 'absolute', left: 40, right: 40, bottom: 28,
    borderTopWidth: 1, borderTopColor: COLOR.rule, paddingTop: 8,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: COLOR.muted },
});

export function ReceiptHeader({ title }: { title: string }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark} />
        <View>
          <Text style={styles.brandName}>Bagi Hasil</Text>
          <Text style={styles.brandCaption}>Sistem Bagi Hasil</Text>
        </View>
      </View>
      <View style={styles.docTitleBlock}>
        <Text style={styles.docTitle}>{title}</Text>
        <Text style={styles.docDate}>Dibuat {date(new Date())}</Text>
      </View>
    </View>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? { fg: COLOR.muted, bg: COLOR.paper3, label: status };
  return (
    <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
      <Text style={{ color: tone.fg }}>{tone.label}</Text>
    </View>
  );
}

export function ReceiptFooter({ code }: { code: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        Dibuat otomatis oleh sistem · ID dokumen {code}-{Date.now().toString(36).toUpperCase()}
      </Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Hal. ${pageNumber}/${totalPages}`} />
    </View>
  );
}

export { Document, Page, View, Text, COLOR, rp, bp, date };
