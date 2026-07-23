# UX Spec — Profit Sharing Platform

> Spesifikasi antarmuka: masalah desain, persona, peta layar, wireframe, dan rasional per layar.
>
> **Sistem visualnya tidak ada di sini.** Token, tipografi, aturan uang, kontrak visualisasi data, dan lantai aksesibilitas dikunci di [`design.md`](./design.md) — file itu yang dibaca Hallmark di setiap run dan yang menang kalau ada perbedaan.
>
> Konteks: [`study-case.md`](./study-case.md) · [`architecture.md`](./architecture.md)

## 1. Masalah Desain yang Sebenarnya

Sebelum menyentuh warna dan komponen, perlu jelas dulu: **apa yang sulit dari antarmuka ini?**

Ini bukan aplikasi CRUD biasa. Kesulitannya spesifik dan semuanya berakar dari satu keputusan — rule composable berlapis:

| # | Masalah | Kenapa sulit | Jawaban desain |
|---|---|---|---|
| 1 | **Admin harus paham rantai rule sebelum menyimpannya** | Dampak satu rule bergantung pada rule lain yang kebetulan cocok. Mustahil diprediksi di kepala. | Editor rule **selalu** berdampingan dengan panel simulasi langsung. Tidak ada tombol simpan tanpa pratinjau. |
| 2 | **Hasil distribusi harus bisa dijelaskan ke investor** | Uang lewat beberapa lapisan dengan basis berbeda. Daftar angka datar tidak menjelaskan apa pun. | Layar *explain* berbentuk **air terjun** — uang mengalir turun, tiap lapisan menunjukkan basis, potongan, dan sisa. |
| 3 | **Rule punya masa berlaku** | Tabel biasa hanya menunjukkan keadaan sekarang. Pertanyaan "rule apa yang aktif 3 bulan lalu?" tak terjawab. | Tampilan **linimasa** + penggeser tanggal. Riwayat versi jadi warga kelas satu, bukan menu tersembunyi. |
| 4 | **Angka uang tidak boleh ambigu sedetik pun** | Salah baca digit di sistem bagi hasil berujung sengketa. | Aturan ketat: tanpa singkatan di tabel, angka rata kanan *tabular*, arah mutasi selalu berpasangan ikon + label. |
| 5 | **Approval butuh konteks, bukan sekadar tombol** | Menyetujui angka tanpa tahu asalnya sama saja dengan stempel kosong. | Antrean approval menampilkan rantai lengkap **di tempat**, bukan di balik satu klik lagi. |

Lima layar yang menjawab masalah di atas adalah **inti produk**. Sisanya (CRUD produk, pelanggan, karyawan) adalah pelengkap yang boleh dikerjakan dengan pola standar.

---

## 2. Pengguna & Kebutuhannya

| Peran | Yang mereka kerjakan | Yang paling mereka takutkan |
|---|---|---|
| **Admin Keuangan** | Menyusun rule, meninjau distribusi, menyetujui, merakit pencairan | Salah konfigurasi rule lalu uang terbagi keliru tanpa disadari |
| **Operasional Penjualan** | Input transaksi, kelola produk & pelanggan | Transaksi tidak tercatat atau dobel |
| **Investor** | Melihat saldo, mutasi, dan laporan periodik | Tidak paham dari mana angka bagiannya berasal |
| **Admin Direktori/HR** | Kelola karyawan, unit organisasi, akses | Karyawan resign tapi aksesnya masih hidup |

Kolom terakhir yang paling menentukan desain. **Ketakutan mereka adalah kebutuhan sesungguhnya**, dan tiap layar inti dinilai dari apakah ia meredakan ketakutan itu:

- Takut salah konfigurasi → simulasi wajib sebelum simpan.
- Takut tidak paham angka → *explain* tersedia di setiap distribusi, termasuk di portal investor.
- Takut akses menggantung → status akun tampil menonjol di daftar karyawan, bukan tersembunyi di halaman detail.

---

## 3. Peta Layar

```
Admin (/)
├── Dashboard                        Ringkasan + antrean tindakan
│
├── Transaksi
│   ├── Daftar transaksi             Filter: status, periode, produk
│   ├── Detail transaksi             + tautan ke distribusinya
│   └── Transaksi baru               Form + pratinjau profit
│
├── Bagi Hasil                       ◀── INTI
│   ├── Aturan (Rules)
│   │   ├── Daftar · tampilan tabel
│   │   ├── Daftar · tampilan linimasa       ◀── masalah #3
│   │   ├── Editor aturan + simulasi         ◀── masalah #1
│   │   └── Riwayat versi
│   ├── Simulator                    Uji coba mandiri tanpa membuat rule
│   ├── Distribusi
│   │   ├── Daftar distribusi        Filter: status, ditandai, fallback
│   │   └── Detail + air terjun      ◀── masalah #2
│   ├── Antrean Persetujuan          ◀── masalah #5
│   └── Pencairan (Payout)
│       ├── Daftar batch
│       └── Detail batch
│
├── Katalog                          Produk & kategori
├── Investor                         Daftar · detail · mutasi
├── Direktori
│   ├── Karyawan                     Daftar · detail
│   └── Bagan Organisasi
├── Audit Log
└── Pengaturan                       Ambang approval, periode payout

Portal Investor (/portal)
├── Ringkasan                        Saldo + tren pendapatan
├── Mutasi                           Ledger + explain per baris
└── Laporan                          Unduh per periode
```

**Keputusan navigasi:** "Bagi Hasil" berdiri sendiri sebagai kelompok utama, tidak diselipkan di bawah "Transaksi". Ia adalah inti produk, dan struktur navigasi harus mencerminkan itu — bukan menyembunyikannya sebagai turunan fitur lain.

---

## 4. Inventaris Komponen

Berbasis shadcn/ui, ditambah komponen khusus domain:

### 6.1 Dari shadcn/ui (dipakai apa adanya)

`Button` · `Input` · `Select` · `Combobox` · `DatePicker` · `Dialog` · `Sheet` · `Popover` · `Tooltip` · `Tabs` · `Badge` · `Table` · `Card` · `Toast` · `Skeleton` · `DropdownMenu` · `Separator` · `Switch` · `Alert`

### 6.2 Komponen Khusus Domain

| Komponen | Fungsi | Kenapa harus khusus |
|---|---|---|
| `<Money>` | Menampilkan nominal | Menegakkan seluruh aturan bagian 5 di satu tempat |
| `<MoneyInput>` | Input nominal | Pemisah ribuan langsung saat mengetik, keluaran `BigInt` |
| `<PercentageInput>` | Input persentase | Batas 0–100, langkah 0,01, kunci *basis point* |
| `<StatusBadge>` | Lencana status | Menjamin pasangan ikon + label + warna |
| `<DistributionWaterfall>` | Air terjun rantai distribusi | ⭐ Komponen tanda tangan produk |
| `<RuleChainPreview>` | Pratinjau rantai saat menyusun rule | ⭐ Pengaman utama masalah #1 |
| `<RuleTimeline>` | Linimasa masa berlaku rule | Menjawab dimensi waktu |
| `<ShareAllocator>` | Baris investor + persentase | Sisa persentase dihitung langsung, validasi ≤100% |
| `<LedgerTable>` | Tabel mutasi | Kolom saldo berjalan + arah mutasi |
| `<OrgChart>` | Bagan organisasi | Pohon yang bisa dilipat |
| `<EmptyState>` | Keadaan kosong | Membedakan "belum ada data" dari "tidak ada hasil filter" |

### 6.3 Anatomi `<Money>`

```tsx
<Money value="10500000" />                    // Rp 10.500.000
<Money value="10500000" abbreviate />         // Rp 10,5 jt  (+ tooltip nilai penuh)
<Money value="-500000" direction="out" />     // ↓ −Rp 500.000
<Money value="0" />                           // Rp 0
<Money value="10500000" size="hero" />        // 48px, tebal
```

Menyatukan seluruh aturan uang ke satu komponen berarti perubahan kebijakan format cukup dilakukan sekali. Membiarkan `toLocaleString()` tersebar di 40 berkas menjamin ketidakkonsistenan dalam hitungan minggu.

---

## 5. Layar Kunci — Wireframe & Rasional

### 7.1 Dashboard Admin

```
┌────────────────────────────────────────────────────────────────────────┐
│  Dashboard                                    [ Juli 2026 ▾ ]  [+ Baru]│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ⚠ 3 distribusi menunggu persetujuan · 1 memakai aturan cadangan       │
│                                              [ Tinjau sekarang → ]     │
│                                                                        │
│  ┌─────────────┐┌─────────────┐┌─────────────┐┌─────────────┐         │
│  │ Pendapatan  ││ Laba Bersih ││ Dibagikan   ││ Ditahan     │         │
│  │ Rp 842,5 jt ││ Rp 213,4 jt ││ Rp 149,3 jt ││ Rp 64,1 jt  │         │
│  │ ↑ 12,4%     ││ ↑ 8,1%      ││ 70,0%       ││ 30,0%       │         │
│  │ ╱╲╱╲╱▁▂▃▅   ││ ╱╲▁▂▃▄▅     ││             ││             │         │
│  └─────────────┘└─────────────┘└─────────────┘└─────────────┘         │
│                                                                        │
│  ┌──────────────────────────────┐┌───────────────────────────────────┐│
│  │ Laba Bersih & Dibagikan      ││ Distribusi per Investor           ││
│  │                              ││                                   ││
│  │      ╱╲    ╱╲                ││ PT Maju Inv.  ████████ Rp 62,1 jt││
│  │  ╱╲╱  ╲╱╲╱  ╲                ││ Budi Santoso  █████    Rp 41,3 jt││
│  │ ╱            ╲               ││ CV Berkah     ███      Rp 28,7 jt││
│  │                              ││ Siti Aminah   ██       Rp 17,2 jt││
│  │ Jan  Mar  Mei  Jul           ││ Lainnya (3)   █        Rp  9,8 jt││
│  └──────────────────────────────┘└───────────────────────────────────┘│
│                                                                        │
│  Transaksi Terakhir                                     [ Lihat semua ]│
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ TRX-0912  Laptop Pro 14"   Rp 24.500.000  ● Selesai  22 Jul 14:32│ │
│  │ TRX-0911  Mouse Wireless   Rp  1.250.000  ● Selesai  22 Jul 13:10│ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

**Keputusan desain:**

- **Baris peringatan di paling atas, di atas KPI.** Dashboard yang membuka dengan angka bagus sementara ada 3 distribusi menggantung sudah gagal tugasnya. Yang butuh tindakan mendahului yang enak dilihat.
- **Empat KPI, tidak lebih.** Baris KPI kelima dan keenam tidak menambah informasi, hanya melarutkan perhatian.
- **"Dibagikan" dan "Ditahan" menampilkan persentase, bukan tren.** Yang penting dari keduanya adalah proporsinya terhadap laba, bukan naik-turunnya.
- **Grafik komposisi investor dibatasi 5 baris + "Lainnya".** Menambah warna untuk investor ke-9 menghasilkan warna yang tak terbedakan di bawah CVD. Batasnya nyata, bukan preferensi.

---

### 7.2 Daftar Aturan — Tampilan Linimasa ⭐

```
┌────────────────────────────────────────────────────────────────────────┐
│  Aturan Bagi Hasil          [ Tabel │ ●Linimasa ]   [ + Aturan Baru ]  │
├────────────────────────────────────────────────────────────────────────┤
│  Berlaku pada: [ 22 Jul 2026 ▾ ]  ◀━━━━━━━━●━━━━━━━━▶                 │
│                                                                        │
│         Apr        Mei        Jun        Jul        Ags        Sep     │
│         │          │          │          ┊          │          │       │
│  ┌──────┴──────────┴──────────┴──────────┼──────────┴──────────┴────┐ │
│  │ #10 Dasar Semua Produk                ┊                          │ │
│  │ ███████████████████████████████████████████████████████████▶     │ │
│  │ 20% · residual · dapat ditumpuk       ┊                          │ │
│  ├───────────────────────────────────────┼──────────────────────────┤ │
│  │ #20 Kategori Elektronik               ┊                          │ │
│  │      ████████████████████████████████████████████▶               │ │
│  │      30% · gross · dapat ditumpuk     ┊                          │ │
│  ├───────────────────────────────────────┼──────────────────────────┤ │
│  │ #30 Bonus Promo Juli                  ┊                          │ │
│  │                            ███████████████████                   │ │
│  │                            20% · residual · dapat ditumpuk       │ │
│  ├───────────────────────────────────────┼──────────────────────────┤ │
│  │ #40 Laba Besar (>Rp 50jt)  [v2]       ┊                          │ │
│  │ ██████████████▶│ v1 diganti           ┊                          │ │
│  │                └─ ███████████████████████████████▶  v2           │ │
│  └───────────────────────────────────────┼──────────────────────────┘ │
│                                          ┊ hari ini                    │
│                                                                        │
│  Pada 22 Jul 2026, 3 aturan aktif akan membentuk rantai:              │
│  #10 → #20 → #30    [ Lihat pratinjau rantai → ]                      │
└────────────────────────────────────────────────────────────────────────┘
```

**Kenapa linimasa, bukan tabel saja:**

Rule punya masa berlaku, dan tabel hanya mampu menunjukkan potret satu titik waktu. Linimasa membuat tiga hal yang sebelumnya tak terlihat jadi kasat mata sekaligus: **tumpang tindih antar-rule**, **celah waktu tanpa rule**, dan **jejak versi**. Ketiganya adalah sumber kesalahan konfigurasi yang paling sering.

Penggeser tanggal menjawab langsung pertanyaan audit *"aturan apa yang berlaku saat transaksi ini terjadi?"* — pertanyaan yang muncul setiap kali ada sengketa.

Baris ringkasan di bawah adalah jembatan ke masalah #1: dari sini admin sudah tahu rantai apa yang sedang aktif sebelum menyentuh editor.

---

### 7.3 Editor Aturan + Simulasi Langsung ⭐⭐

Ini layar terpenting di seluruh aplikasi.

```
┌────────────────────────────────────────────────────────────────────────┐
│  ← Aturan     Aturan Baru                          [Batal] [Simpan ▾]  │
├──────────────────────────────────┬─────────────────────────────────────┤
│  KONFIGURASI                     │  PRATINJAU LANGSUNG                 │
│                                  │                                     │
│  Nama                            │  Uji dengan transaksi:              │
│  ┌────────────────────────────┐  │  ┌───────────────────────────────┐  │
│  │ Bonus Promo Agustus        │  │  │ Kategori  [ Elektronik    ▾ ] │  │
│  └────────────────────────────┘  │  │ Laba      [ Rp 10.000.000   ] │  │
│                                  │  │ Tanggal   [ 01 Ags 2026     ] │  │
│  ── Kapan berlaku ─────────────  │  └───────────────────────────────┘  │
│  Kategori produk                 │                                     │
│  [ Elektronik              ▾ ]   │  Rantai yang akan berjalan:         │
│  Rentang laba                    │                                     │
│  [Rp 0      ] – [ tanpa batas ]  │  Laba bersih         Rp 10.000.000  │
│  Periode                         │  │                                  │
│  [01 Ags 26] – [31 Ags 26   ]    │  ├─ #10 Dasar Semua Produk          │
│                                  │  │  residual · 20%   −Rp 2.000.000  │
│  ── Perilaku rantai ───────────  │  │  sisa              Rp 8.000.000  │
│  Urutan eksekusi   [  35    ]    │  │                                  │
│  ☑ Dapat ditumpuk dengan lainnya │  ├─ #20 Kategori Elektronik         │
│  Dasar hitung                    │  │  gross · 30%      −Rp 3.000.000  │
│  ( ) Laba awal (gross)           │  │  sisa              Rp 5.000.000  │
│  (•) Sisa berjalan (residual)    │  │                                  │
│                                  │  ├─ ▸ ATURAN INI                    │
│  ── Pembagian ─────────────────  │  │  residual · 25%   −Rp 1.250.000  │
│  ┌────────────────────────────┐  │  │  sisa              Rp 3.750.000  │
│  │ PT Maju Inv.   [ 15,00 %] ✕│  │  │    PT Maju Inv.    Rp   750.000  │
│  │ Budi Santoso   [ 10,00 %] ✕│  │  │    Budi Santoso    Rp   500.000  │
│  │ + Tambah investor          │  │  │                                  │
│  ├────────────────────────────┤  │  └─ Ditahan perusahaan              │
│  │ Total          25,00 %     │  │                     Rp 3.750.000    │
│  │ Sisa ke persh. 75,00 %     │  │                                     │
│  └────────────────────────────┘  │  ⚠ Aturan ini akan berjalan         │
│                                  │    bersama 2 aturan lain            │
│                                  │                                     │
│                                  │  [ Uji dengan data historis → ]     │
└──────────────────────────────────┴─────────────────────────────────────┘
```

**Keputusan desain:**

1. **Panel simulasi bukan tab, bukan modal — selalu terlihat.** Menyembunyikannya di balik satu klik berarti sebagian besar admin tidak akan pernah membukanya, dan justru merekalah yang paling butuh. Tata letak berdampingan membuat konsekuensi setiap perubahan muncul seketika.
2. **Aturan yang sedang disusun ditandai `▸ ATURAN INI` di dalam rantai.** Admin melihat posisi rule-nya di antara rule lain, bukan sebagai objek terisolasi. Ini yang menghancurkan ilusi "rule saya berdiri sendiri".
3. **Perilaku rantai memakai bahasa manusia**, bukan istilah teknis: "Dapat ditumpuk dengan lainnya", bukan `stackable: true`. "Laba awal" dan "Sisa berjalan", bukan `GROSS`/`RESIDUAL`.
4. **Sisa persentase ditampilkan terus-menerus.** "Sisa ke perusahaan 75%" mencegah anggapan keliru bahwa yang tidak dialokasikan otomatis hilang.
5. **`[Simpan ▾]` adalah tombol bercabang** — "Simpan sebagai draf" dan "Simpan & aktifkan". Mengaktifkan rule bagi hasil tidak boleh setara dengan menyimpan draf catatan.

**Validasi ditampilkan langsung, bukan setelah submit:**

| Kondisi | Perlakuan |
|---|---|
| Total > 100% | Batas merah pada baris, tombol simpan nonaktif |
| Rantai total > 100% | Peringatan `serious`: "Rantai melebihi laba; porsi akan dipotong proporsional" |
| Periode tumpang tindih dengan rule berurutan sama | Peringatan `warning` + tautan ke rule yang bentrok |
| Tidak ada investor | Simpan nonaktif |

---

### 7.4 Detail Distribusi — Air Terjun ⭐⭐

Layar yang menjawab *"kenapa investor A menerima segini?"*.

```
┌────────────────────────────────────────────────────────────────────────┐
│  ← Distribusi    DST-2026-0912                    ● Menunggu Persetujuan│
├────────────────────────────────────────────────────────────────────────┤
│  Transaksi  TRX-0912 · Laptop Pro 14" · PT Sinar Jaya                  │
│  Selesai    22 Jul 2026, 14:32                                         │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Pendapatan            Rp 24.500.000                             │  │
│  │  Biaya produksi      − Rp 14.000.000                             │  │
│  │  ─────────────────────────────────────                           │  │
│  │  LABA BERSIH           Rp 10.500.000                             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  RANTAI PEMBAGIAN                                    [ Tabel ⇄ Visual ]│
│                                                                        │
│  Laba bersih                                        Rp 10.500.000      │
│  ████████████████████████████████████████████████████████████████      │
│  │                                                                     │
│  ├─▸ Lapisan 1 · #10 Dasar Semua Produk              sisa berjalan     │
│  │   Dasar hitung  Rp 10.500.000  ×  20%          − Rp 2.100.000      │
│  │   ████████████▏                                                    │
│  │      ├ PT Maju Investama      12%              Rp 1.260.000        │
│  │      └ Budi Santoso            8%              Rp   840.000        │
│  │   Sisa setelah lapisan ini                       Rp 8.400.000      │
│  │                                                                     │
│  ├─▸ Lapisan 2 · #20 Kategori Elektronik              laba awal        │
│  │   Dasar hitung  Rp 10.500.000  ×  30%          − Rp 3.150.000      │
│  │   ██████████████████▏                                              │
│  │      ├ PT Maju Investama      18%              Rp 1.890.000        │
│  │      └ CV Berkah Abadi        12%              Rp 1.260.000        │
│  │   Sisa setelah lapisan ini                       Rp 5.250.000      │
│  │                                                                     │
│  └─▸ Ditahan perusahaan                              Rp 5.250.000      │
│      ██████████████████████████████▏                                   │
│      termasuk sisa pembulatan Rp 0                                     │
│                                                                        │
│  RINGKASAN PER INVESTOR                                                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ PT Maju Investama    L1 Rp 1.260.000 + L2 Rp 1.890.000 = Rp 3.150.000│
│  │ Budi Santoso         L1 Rp   840.000                   = Rp   840.000│
│  │ CV Berkah Abadi                      L2 Rp 1.260.000   = Rp 1.260.000│
│  │ ──────────────────────────────────────────────────────────────────│  │
│  │ Total dibagikan                                        Rp 5.250.000│  │
│  │ Ditahan perusahaan                                     Rp 5.250.000│  │
│  │ Laba bersih                                            Rp 10.500.000│ │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  [ Tolak ]                                    [ Setujui distribusi → ] │
└────────────────────────────────────────────────────────────────────────┘
```

**Keputusan desain:**

1. **Arah vertikal ke bawah, bukan bagan air terjun horizontal.** Uang "mengalir turun" adalah metafora yang langsung dipahami tanpa penjelasan, dan lapisan berikutnya secara alami dibaca setelah lapisan sebelumnya. Bagan air terjun horizontal klasik memaksa mata melompat-lompat untuk merekonstruksi urutan yang sama.
2. **Batang panjang proporsional di setiap lapisan.** Angka memberi ketepatan; panjang batang memberi rasa proporsi seketika. Keduanya dibutuhkan, dan keduanya murah untuk ditampilkan bersamaan.
3. **"Dasar hitung" ditulis eksplisit di setiap lapisan.** Inilah satu-satunya cara pembaca memahami kenapa 20% dari satu lapisan menghasilkan angka yang tidak sebanding dengan 30% dari lapisan lain — karena dasarnya memang berbeda.
4. **Ringkasan per investor menampilkan penjumlahan antar-lapisan secara terbuka** (`L1 + L2 = total`). Investor yang muncul di dua lapisan adalah kasus yang paling membingungkan, dan cara terbaik menanganinya adalah menunjukkan aritmatikanya, bukan menyembunyikannya.
5. **Blok penutup selalu menutup angka.** `dibagikan + ditahan = laba bersih` ditampilkan utuh setiap kali. Kalau pernah tidak berjumlah pas, itu bug — dan tampilan ini yang akan menangkapnya lebih dulu daripada laporan bulanan.
6. **Sakelar `Tabel ⇄ Visual`.** Tampilan tabel adalah jalur aksesibilitas wajib sekaligus bahan salin-tempel ke spreadsheet, yang pasti diminta bagian keuangan.

---

### 7.5 Antrean Persetujuan

```
┌────────────────────────────────────────────────────────────────────────┐
│  Antrean Persetujuan                     3 menunggu · Rp 47,2 jt total │
├────────────────────────────────────────────────────────────────────────┤
│  Ambang persetujuan saat ini: Rp 5.000.000            [ Ubah ⚙ ]      │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ● Menunggu   DST-2026-0912          Rp 10.500.000                │  │
│  │   TRX-0912 · Laptop Pro 14" · 2 lapisan · 3 investor             │  │
│  │   #10 Dasar → #20 Elektronik                                     │  │
│  │   ▸ Lihat rantai lengkap                                         │  │
│  │                                    [ Tolak ]  [ Setujui ]        │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ ⚠ Cadangan  DST-2026-0908           Rp 32.100.000                │  │
│  │   TRX-0908 · Server Rack · tidak ada aturan cocok                │  │
│  │   Seluruh laba ditahan perusahaan — perlu ditinjau               │  │
│  │   ▸ Lihat rantai lengkap        [ Buat aturan untuk kasus ini → ]│  │
│  │                                    [ Tolak ]  [ Setujui ]        │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ ⚠ Kelebihan DST-2026-0905           Rp  4.600.000                │  │
│  │   Rantai mengalokasikan 115% — porsi dipotong proporsional       │  │
│  │   ▸ Lihat rantai lengkap        [ Periksa aturan bentrok → ]     │  │
│  │                                    [ Tolak ]  [ Setujui ]        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

**Keputusan desain:**

- **Setiap kartu membawa konteksnya sendiri** — rantai ringkas, jumlah lapisan, jumlah investor. Yang meninjau tidak perlu membuka halaman lain untuk keputusan yang jelas, dan tetap bisa membuka detail saat butuh.
- **Kasus bermasalah membawa jalan keluarnya.** Distribusi fallback langsung menawarkan "Buat aturan untuk kasus ini"; over-allocation langsung menawarkan "Periksa aturan bentrok". Antarmuka yang menunjukkan masalah tanpa menawarkan langkah berikutnya hanya memindahkan beban ke pengguna.
- **Tidak ada "Setujui semua".** Persetujuan borongan meniadakan seluruh guna adanya ambang batas. Kalau volumenya terasa memberatkan, yang perlu disetel adalah ambangnya — dan tombol pengaturannya ada di atas.

---

### 7.6 Portal Investor

```
┌────────────────────────────────────────────────────────────────────────┐
│  PT Maju Investama                                    [ Juli 2026 ▾ ]  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│         Saldo tersedia                                                 │
│         Rp 62.140.000                                                  │
│         ↑ Rp 8.200.000 bulan ini                                       │
│                                                                        │
│         Pencairan berikutnya · 31 Juli 2026                            │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Pendapatan Bagi Hasil                                            │  │
│  │                                              ╱╲                  │  │
│  │                                    ╱╲    ╱╲╱  ╲                 │  │
│  │                          ╱╲    ╱╲╱  ╲╱╲╱                        │  │
│  │                    ╱╲╱╲╱  ╲╱╲╱                                  │  │
│  │  Feb   Mar   Apr   Mei   Jun   Jul                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  Mutasi Terakhir                                       [ Lihat semua ] │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 22 Jul  ↑ Rp 3.150.000  Bagi hasil TRX-0912      ▸ kenapa segini?│  │
│  │ 21 Jul  ↑ Rp 1.240.000  Bagi hasil TRX-0908      ▸ kenapa segini?│  │
│  │ 30 Jun  ↓ Rp 45.000.000 Pencairan batch Juni                     │  │
│  │ 28 Jun  ↺ −Rp 820.000   Pembalikan TRX-0871 (refund)             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

**Keputusan desain:**

- **Tautan "kenapa segini?" di setiap baris bagi hasil** membuka air terjun yang sama seperti milik admin, disaring ke porsi investor tersebut. Transparansi penuh adalah keunggulan utama sistem ini — menyembunyikannya dari pihak yang paling berkepentingan akan menyia-nyiakannya.
- **"Saldo tersedia" dan "Pencairan berikutnya" berdampingan.** Konsekuensi langsung dari keputusan A6: ledger tercatat *real-time*, pencairan periodik. Tanpa penjelasan tanggal di sebelahnya, investor akan bertanya-tanya kenapa saldo belum masuk rekening.
- **Pembalikan (refund) tampil apa adanya**, tidak disembunyikan. Kepercayaan justru tumbuh dari koreksi yang ditampilkan terbuka.

---

### 7.7 Daftar Transaksi

```
┌────────────────────────────────────────────────────────────────────────┐
│  Transaksi                                          [ + Transaksi Baru]│
├────────────────────────────────────────────────────────────────────────┤
│  [ 🔍 Cari ]  [ Status ▾ ] [ Kategori ▾ ] [ 1–31 Jul 2026 ▾ ]  ⟳      │
├────────────────────────────────────────────────────────────────────────┤
│  Kode     Produk            Pelanggan      Laba Bersih  Status  Bagi   │
│  ────────────────────────────────────────────────────────────────────  │
│  TRX-0912 Laptop Pro 14"    PT Sinar Jaya  Rp 10.500.000 ●Selesai ⚠Tunggu│
│  TRX-0911 Mouse Wireless    Andi Wijaya    Rp    450.000 ●Selesai ●Final│
│  TRX-0910 Monitor 27"       CV Terang      Rp  2.100.000 ●Selesai ●Final│
│  TRX-0909 Keyboard Mekanik  PT Sinar Jaya  Rp    780.000 ○Draf    —    │
│  ────────────────────────────────────────────────────────────────────  │
│  Menampilkan 1–20 dari 1.284                        ‹ 1 2 3 … 65 ›     │
└────────────────────────────────────────────────────────────────────────┘
```

Kolom **"Bagi"** (status distribusi) berdiri terpisah dari kolom status transaksi. Keduanya berbeda dan bisa berbeda nasib: transaksi selesai tapi distribusinya masih menunggu persetujuan. Menggabungkannya jadi satu kolom akan menyembunyikan tepat keadaan yang paling butuh perhatian.

---

### 7.8 Direktori — Karyawan & Bagan Organisasi

```
┌────────────────────────────────────────────────────────────────────────┐
│  Direktori                        [ Daftar │ ●Bagan ]  [ + Karyawan ]  │
├────────────────────────────────────────────────────────────────────────┤
│  [ 🔍 Cari nama, email, jabatan ]     [ Unit ▾ ]  [ Status ▾ ]         │
│                                                                        │
│                        ┌─────────────────────┐                         │
│                        │ 👤 Dewi Kartika     │                         │
│                        │    CEO              │                         │
│                        └──────────┬──────────┘                         │
│                ┌──────────────────┼──────────────────┐                 │
│      ┌─────────┴────────┐ ┌───────┴────────┐ ┌───────┴────────┐        │
│      │ 👤 Rian Pratama  │ │ 👤 Sari Utami  │ │ 👤 Joko Hadi   │        │
│      │    Dir. Sales    │ │    Dir. Keu.   │ │    Dir. Ops    │        │
│      │    ▾ 12 anggota  │ │    ▾ 5 anggota │ │    ▾ 8 anggota │        │
│      └──────────────────┘ └────────────────┘ └────────────────┘        │
└────────────────────────────────────────────────────────────────────────┘
```

Tampilan daftar menempatkan **status akun sebagai kolom utama**, bukan detail sekunder. Manfaat yang dijanjikan directory management adalah kemampuan memutus akses saat karyawan keluar — dan itu hanya berguna kalau akun yang masih hidup padahal seharusnya mati bisa terlihat dalam sekali pandang.

---

## 6. Status Kosong, Muat, dan Error

Setiap tampilan daftar wajib menangani empat keadaan. Melewatkannya adalah sumber kesan "belum jadi" yang paling cepat terasa.

| Keadaan | Perlakuan |
|---|---|
| **Memuat** | Skeleton yang mengikuti bentuk konten akhir, bukan spinner di tengah layar |
| **Kosong (belum ada data)** | Ilustrasi + penjelasan + tombol tindakan utama — "Belum ada aturan bagi hasil. Buat aturan pertama untuk mulai membagi laba otomatis." |
| **Kosong (filter tidak cocok)** | **Pesan berbeda** + tombol reset filter — "Tidak ada transaksi pada rentang ini." |
| **Error** | Penjelasan + tombol coba lagi + `requestId` untuk pelaporan |

Membedakan dua jenis kosong itu penting: "belum ada data" mengundang membuat, "filter tidak cocok" mengundang mengubah filter. Menyamakan keduanya membuat pengguna baru mengira sistemnya rusak.

**Khusus operasi finansial**, `Toast` saja tidak cukup. Setiap tindakan yang menyentuh uang — menyetujui, mencairkan, membalik — dikonfirmasi lewat dialog yang menyebutkan **nominal dan pihak terdampak secara eksplisit**:

> Setujui distribusi DST-2026-0912?
> **Rp 5.250.000** akan dicatat ke ledger 3 investor.
> Tindakan ini tidak dapat dibatalkan — koreksi hanya bisa lewat pembalikan.

---

## 7. Responsif

```
Ponsel     < 640px    Satu kolom · tabel jadi kartu · navigasi laci
Tablet     640–1024   Dua kolom · sidebar menciut jadi ikon
Desktop    1024–1440  Tata letak penuh · sidebar terbuka
Lebar      > 1440     Lebar konten dibatasi 1440px, ditengahkan
```

Aplikasi ini **mengutamakan desktop** — dan itu keputusan sadar, bukan kelalaian. Menyusun rule bagi hasil dan meninjau distribusi adalah pekerjaan meja dengan data padat; memaksakan tata letak ponsel-dulu untuk layar-layar itu akan mengorbankan penggunanya yang sesungguhnya.

Namun tiga hal **wajib** nyaman di ponsel, karena memang dilakukan sambil bergerak:

1. Portal investor (saldo & mutasi)
2. Antrean persetujuan (menyetujui saat di perjalanan)
3. Pencarian direktori (mencari kontak rekan kerja)

Untuk ketiganya, tabel berubah menjadi kartu bertumpuk, bukan tabel yang digeser menyamping.

**Editor rule di ponsel** menampilkan konfigurasi dan simulasi sebagai tab bergantian, dengan pengingat tetap di bawah: *"Aturan ini akan berjalan bersama 2 aturan lain"* — sehingga kaidah "tidak pernah menyimpan tanpa melihat dampak" tetap berlaku meski panelnya tidak muat berdampingan.

---

## 8. Bahasa & Nada

Antarmuka berbahasa **Indonesia**, dengan istilah teknis yang sudah lazim dibiarkan apa adanya (dashboard, ledger, batch).

| Prinsip | Contoh benar | Contoh salah |
|---|---|---|
| Istilah domain, bukan istilah teknis | "Dasar hitung: laba awal" | "Basis: GROSS" |
| Error menjelaskan langkah berikutnya | "Total melebihi 100%. Kurangi salah satu porsi." | "Validasi gagal" |
| Angka disebut lengkap di konfirmasi | "Rp 5.250.000 ke 3 investor" | "Data akan disimpan" |
| Aktif, bukan pasif | "Anda menyetujui distribusi ini" | "Distribusi telah disetujui" |
| Tanpa jargon di teks pengguna | "Aturan ini menumpuk dengan aturan lain" | "Rule ini stackable" |

**Glosarium yang dipakai konsisten di seluruh antarmuka:**

| Istilah teknis | Istilah antarmuka |
|---|---|
| Rule | Aturan |
| Distribution | Distribusi / Pembagian |
| Layer | Lapisan |
| Basis GROSS | Laba awal |
| Basis RESIDUAL | Sisa berjalan |
| Stackable | Dapat ditumpuk |
| Retained | Ditahan perusahaan |
| Fallback | Aturan cadangan |
| Reversal | Pembalikan |
| Payout batch | Batch pencairan |

---

## 9. Prioritas Implementasi (7 Jam)

Anggaran frontend adalah 7 jam dari total 40 ([`architecture.md` §15](./architecture.md#15-roadmap-implementasi--anggaran-40-jam)). Itu berarti sekitar 8 layar, bukan 20.

| Prioritas | Layar | Jam | Alasan |
|---|---|---|---|
| **P0** | Editor aturan + simulasi | 1,5 | Bukti utama rule engine dinamis |
| **P0** | Detail distribusi (air terjun) | 1,5 | Bukti utama sistem bisa dipertanggungjawabkan |
| **P0** | Daftar transaksi + buat transaksi | 1,0 | Pemicu seluruh alur |
| **P1** | Dashboard | 0,8 | Kesan pertama |
| **P1** | Daftar aturan (tabel; linimasa menyusul) | 0,6 | Navigasi ke P0 |
| **P1** | Antrean persetujuan | 0,6 | Menunjukkan alur approval |
| **P2** | Portal investor | 0,6 | Menunjukkan sisi penerima |
| **P2** | Direktori (daftar + bagan sederhana) | 0,4 | Memenuhi kebutuhan directory |
| | **Total** | **7,0** | |

**Yang dikorbankan lebih dulu jika waktu menipis:** tampilan linimasa (tabel biasa dulu), bagan organisasi (daftar dulu), tampilan tabel pada grafik, dan mode gelap. Semuanya bisa ditambahkan setelahnya tanpa membongkar apa pun.

**Yang tidak boleh dikorbankan:** panel simulasi langsung di editor aturan, dan air terjun di detail distribusi. Keduanya bukan hiasan — keduanya adalah demonstrasi bahwa sistem ini benar-benar menyelesaikan studi kasusnya. Tanpa keduanya, yang tersisa hanyalah aplikasi CRUD dengan tabel yang rapi.

---
