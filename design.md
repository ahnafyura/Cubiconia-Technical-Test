# Design — Profit Sharing Platform

Sistem desain terkunci. Hallmark membaca file ini lebih dulu di setiap run; semua
halaman tunduk padanya. Ubah dengan sengaja — file ini adalah aturannya.

Wireframe, persona, dan rasional per layar ada di [`ux-spec.md`](./ux-spec.md).
Kalau keduanya berbeda, **file ini yang menang.**

## System

- Genre · **modern-minimal** — kanvas biru cerah, kartu putih, aksen tunggal
- Macrostructure · **Workbench** — instrumen dalam pemakaian, bukan halaman pemasaran
- Theme · **custom (Skyline)** — vibe: *"fintech biru cerah, ramah lintas generasi"*
- Axes · paper light (L 96,5%) / display grotesk-sans / accent cool-vivid (hue 254)
- Enrichment · **E1 clipped-edge illustration + light wash** (Tier A, pure CSS — bukan aset generik, bukan library)
- Nav · **N3 side-rail (glass)** · Footer · **Ft2 inline** (hanya di halaman auth)

> **Catatan kejujuran (tiga hal).**
>
> Pertama, katalog macrostructure Hallmark adalah bentuk *landing page*. Aplikasi admin
> tidak punya padanan langsung. Workbench dipilih karena sidik jarinya paling dekat —
> "beginilah alat ini dipakai" — tapi urutan seksi ala SaaS marketing (hero → logo wall →
> testimonial) **tidak berlaku** dan tidak boleh diseret masuk.
>
> Kedua, tema gelap-atmosferik ("Ember") sebelumnya **diganti total** atas permintaan
> eksplisit pengguna: audiens lintas generasi (Gen Z, milenial, boomer — investor
> maupun karyawan internal) menilai kanvas gelap terlalu suram/niche. Ini bukan mode
> terang tambahan di samping mode gelap — satu-satunya tema sekarang adalah terang.
> Setiap token warna dihitung ulang dari nol terhadap kanvas terang (bukan dibalik
> dari nilai gelap), termasuk warna status yang sebelumnya nyaris tak terlihat kalau
> sekadar dipakai ulang di kanvas baru.
>
> Ketiga, arah biru-cerah ini datang dari referensi visual fintech yang dikirim
> pengguna (kanvas gradasi biru muda, kartu putih, tombol pil navy/biru). Referensi
> itu kemungkinan **produk/template yang dijual**, jadi yang diambil hanya arah
> gayanya — biru cerah, kartu terangkat, navbar kaca — bukan salinan strukturnya
> atau brandingnya.

## Tokens — canonical (`tokens.css` adalah sumber kebenaran)

Setiap warna dan setiap font di seluruh kode **wajib** lewat `var(--token)`.
Nilai hex atau OKLCH inline di luar blok token adalah pelanggaran; kalau butuh nilai
baru, angkat dulu jadi token bernama.

```css
:root {
  color-scheme: light;

  /* Kanvas — biru cerah. Tanpa putih murni, tanpa abu-abu nol kroma. */
  --color-paper:      oklch(96.5% 0.012 254); /* #eef4fc */
  --color-paper-2:    oklch(99.0% 0.006 254); /* #f9fcff  kartu */
  --color-paper-3:    oklch(92.5% 0.020 254); /* #dde7f4  hover */
  --color-rule:       oklch(86.5% 0.022 254); /* #c9d4e1 */
  --color-muted:      oklch(48.0% 0.035 254); /* AA 5,90:1 */
  --color-ink-2:      oklch(34.0% 0.045 254); /* AA 10,62:1 */
  --color-ink:        oklch(18.0% 0.035 254); /* #061221 — AA 17,00:1 */

  /* Aksen tunggal biru cerah — ≤3% viewport */
  --color-accent:      oklch(54.0% 0.190 254); /* #006cd8 — AA 4,60:1, aman sbg teks */
  --color-accent-hi:   oklch(48.0% 0.205 254);
  --color-accent-ink:  oklch(99.0% 0.005 254);
  --color-accent-wash: oklch(91.0% 0.055 254);
  --color-focus:       oklch(54.0% 0.190 254);
  --color-bloom:       oklch(82.0% 0.060 254);

  /* Status — dihitung ulang utk kanvas terang, tidak pernah dipinjam sbg warna seri */
  --color-good: #17810d;  --color-warning: #a45d00;
  --color-serious: #c73e1a;  --color-critical: #ce3537;

  /* Seri viz — urutan tetap, tervalidasi CVD terhadap --color-paper baru */
  --viz-1: #2a78d6;  --viz-2: #eb6834;  --viz-3: #1baf7a;
  --viz-4: #eda100;  --viz-5: #e87ba4;  --viz-other: var(--color-muted);

  --font-display: "Montserrat", ui-sans-serif, sans-serif;
  --font-body:    "Montserrat", ui-sans-serif, system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, monospace;

  --weight-body: 400;

  /* Skala tipe 1.25 · spasi 4pt · lihat tokens.css untuk daftar penuh */
  --radius-control: 8px;  --radius-card: 14px;  --radius-pill: 9999px;  --radius-hero: 28px;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms;  --dur-base: 180ms;  --dur-slow: 240ms;
}
```

**Tema ini berkomitmen pada satu tampilan: terang.** Tidak ada varian gelap.
Arah biru cerah ini menggantikan tema Ember sepenuhnya, bukan mode alternatif di
sampingnya.

Elevasi dibawa **lightness + bayangan tipis** — permukaan lebih tinggi lebih terang
dan bayangannya sedikit lebih terlihat. Di kanvas terang, bayangan pekat ala tema
gelap membuat kartu terlihat kotor, bukan terangkat — alpha-nya diturunkan jauh
dari versi Ember (lihat `--shadow-*` di `tokens.css`).

## Canvas treatment

Dua radial bloom biru lembut, `position: fixed`, **tanpa animasi**, ditambah grain
SVG di opasitas 0,035 untuk menahan banding.

Yang membedakannya dari *aurora-blob* yang dilarang: satu hue (bukan ungu→cyan→pink),
dua stop (bukan tiga), ditempel ke sudut sehingga konten dibaca **di atas** ground —
bukan tenggelam di dalam kabut. Bloom adalah ruangannya, bukan subjeknya. Alpha-nya
lebih rendah daripada versi gelap sebelumnya — bloom pekat di atas kanvas yang sudah
terang membuat kesan kotor, bukan atmosferik.

## Navbar kaca (glassmorphism)

`.rail` (sidebar admin) dan `.mobile-tabbar` (tab bar bawah, dipakai admin & portal)
memakai panel translusen + `backdrop-filter: blur(20px) saturate(160%)` alih-alih
kartu opak — ini pengecualian sadar dari kebiasaan Hallmark yang biasanya
menghindari glassmorphism (rawan jadi dekorasi tanpa fungsi kalau dipasang
sembarangan). Di sini dipasang HANYA pada elemen navigasi tetap yang selalu duduk
di atas `body::before` (bloom biru) — bukan di atas kartu konten yang isinya
berubah-ubah — sehingga efek kacanya konsisten dan tidak pernah bertabrakan dengan
warna konten yang tidak terduga. Border memakai `--color-paper-2` tercampur ke
transparan (bukan `--color-rule`) supaya tepinya terasa seperti sisi kaca yang
menangkap cahaya.

## Typography

| Peran | Famili | Dipakai untuk |
|---|---|---|
| Display | Montserrat 600–700, tracking −0.02em | Judul halaman, nilai KPI |
| Body | Montserrat 400–500 | Seluruh teks antarmuka, label, isi tabel |
| Mono *(outlier)* | JetBrains Mono 400–500 | **Satu peran saja: register numerik & identifier** — nominal uang, persentase, kode transaksi, ID distribusi, cap waktu |

Outlier memegang **satu** peran dan konsisten di setiap kemunculannya. Setiap angka
yang bisa dibandingkan secara vertikal memakai mono; setiap prosa memakai body. Tidak
ada pengecualian — begitu mono dipakai untuk label tombol, ia berhenti jadi outlier
dan berubah jadi font ketiga, dan itu slop.

Mono di sini bukan hiasan bergaya teknis: ia menjamin perataan tabular *by construction*,
persis kemampuan yang paling dibutuhkan saat membandingkan nominal antar-baris.

**Header selalu roman.** Tidak ada `font-style: italic` di judul mana pun, termasuk
satu kata yang dimiringkan untuk penekanan. Penekanan dibawa oleh bobot atau warna aksen.

## Money & numerals — aturan domain

Ini bagian yang paling mengikat. Kesalahan menyajikan angka di sistem bagi hasil bukan
cacat kosmetik.

| Aturan | Benar | Salah |
|---|---|---|
| Awalan `Rp`, spasi tunggal, pemisah titik | `Rp 10.500.000` | `10500000` · `Rp 10,500,000` |
| Mono + `tabular-nums` di **setiap** nominal | | proporsional |
| Tanpa singkatan di tabel & detail | `Rp 10.500.000` | `Rp 10,5 jt` |
| Singkatan hanya di KPI tile, nilai penuh saat hover | `Rp 10,5 jt` | singkatan di baris tabel |
| Nol eksplisit | `Rp 0` | `—` |
| Arah mutasi: **ikon + tanda + warna**, ketiganya | `↑ Rp 1.800.000` | merah saja |
| Persentase 2 desimal, nol tak berguna dibuang | `33,33%` · `20%` | `33.330000%` |
| Angka rata kanan, teks rata kiri | | |

Nominal datang dari API sebagai **string**, di-parse ke `BigInt`, tidak pernah menyentuh
`Number`. Seluruh aturan di atas ditegakkan di satu komponen `<Money>` — bukan
`toLocaleString()` yang tersebar di puluhan berkas.

Warna tidak pernah sendirian membawa makna. Tabel keuangan adalah tempat terakhir yang
boleh mengandalkan hijau-merah.

## Data-viz contract

Kontrak ini berasal dari palet tervalidasi CVD dan **menang atas preferensi estetis**.

- Seri melekat pada **entitas**, bukan peringkat. Filter tidak boleh mengecat ulang seri yang tersisa.
- Batas **5 seri**, sisanya `--viz-other`. Warna ke-9 tak terbedakan di bawah CVD.
- Urutan slot adalah mekanisme keamanan CVD — **jangan diacak**.
- Di kanvas terang ini **4 dari 5 slot berada di bawah kontras 3:1** (hanya `--viz-1` yang lolos) — validator ulang setelah pindah dari kanvas gelap. Ini BUKAN opsional: setiap grafik yang memakai slot-slot ini wajib label langsung atau padanan tabel, tidak boleh mengandalkan warna area saja untuk dibaca.
- Legenda selalu ada untuk ≥ 2 seri; seri tunggal tidak butuh legenda.
- Teks memakai token teks, **tidak pernah** warna seri.
- Garis 2px · penanda ≥ 8px · jarak 2px sewarna permukaan antar segmen · kisi resesif.
- **Tidak ada grafik dua sumbu, di mana pun.** Dua ukuran berbeda skala = dua grafik.
- Setiap grafik punya padanan tabel.

## CTA voice

- **Primary** · isi `--color-accent` · teks `--color-accent-ink` · `--radius-pill` · padding `9px 16px`
- **Secondary** · permukaan `--color-paper-2` + garis `--color-rule` · radius sama
- **Destructive** · garis `--color-critical` · teks `--color-critical` · isi hanya saat hover
- Label satu baris, **tidak pernah membungkus**. Pendekkan labelnya, jangan biarkan wrap.
- Pill, bukan sudut ketat. Isian aksen biru penuh — percaya diri, bukan pastel/outline lemah.

Aksen menempati **≤ 3%** viewport: nav aktif, cincin fokus, tombol primer, penanda kecil
di samping judul. Bukan blok warna, bukan latar seksi, bukan gradien.

## Motion stance

**Fade saja.** Atmospheric mengizinkan satu entrance terorkestrasi saat muat; setelah itu konten hanya *ada di sana*.

- Tanpa reveal saat scroll. Tanpa slide, tanpa stagger, tanpa bounce. Atmosfernya yang bekerja.
- Hanya `transform` dan `opacity` yang dianimasikan — tidak pernah properti layout.
- Maksimal 2 primitif: transisi warna pada hover kontrol, dan geser 180ms pada sheet/dialog.
- Cincin fokus muncul **seketika**. Tidak pernah ditransisikan.
- Sukses bersifat senyap. Toast hanya untuk kegagalan dan operasi asinkron yang efeknya tak terlihat.
- Operasi finansial dikonfirmasi lewat dialog yang menyebut **nominal dan pihak terdampak**, bukan toast.
- `prefers-reduced-motion: reduce` → crossfade opacity ≤ 150ms.

## State discipline

Setiap elemen interaktif mengirim **8 state**: default · hover · `:focus-visible` ·
active · disabled · loading · error · success. Tidak ada yang boleh dilewati.

Setiap tampilan daftar menangani 4 keadaan, dan **dua jenis kosong dibedakan**:
memuat (skeleton berbentuk konten akhir, bukan spinner) · kosong karena belum ada data
(ajak membuat) · kosong karena filter (ajak reset) · error (+ `requestId`).

## Accessibility floor

WCAG 2.1 AA. Teks ≥ 4,5:1 · elemen antarmuka ≥ 3:1 · cincin fokus 2px `--color-focus`
dengan offset 2px · seluruh alur bisa diselesaikan tanpa tetikus · air terjun distribusi
memakai `role="table"` agar pembaca layar mendapat struktur yang sama.

## Known tensions

Dicatat terbuka karena keduanya nyata dan keduanya sudah ditimbang:

1. **`--color-accent` bertetangga hue dengan `--viz-1`.** Sejak palet berpindah ke
   biru cerah, keduanya biru (aksen hue 254, `--viz-1` #2a78d6). Ini tensi yang
   sama persis dengan sebelumnya, cuma pemainnya bertukar — dulu aksen oranye
   bertetangga dengan `--viz-2` oranye, sekarang aksen biru bertetangga dengan
   `--viz-1` biru. Palet `--viz-*` sendiri tidak diubah (tetap tervalidasi CVD
   apa adanya), jadi mitigasinya tetap mengikat dan tidak berubah: aksen
   **tidak pernah muncul di dalam area plot**, dan cincin fokus pada elemen
   grafik memakai `--color-ink`, bukan `--color-focus`.
2. **Palet viz memakai hex, bukan OKLCH.** Disengaja. Nilai-nilai itu lolos gerbang CVD
   pada hex persis tersebut; mengonversinya demi kerapian format akan menggeser hasil
   validasi. Aksesibilitas menang atas konsistensi notasi.

## Exports

`tokens.css` di proyek ini adalah sumber kebenaran. Untuk Tailwind v4 `@theme`,
DTCG `tokens.json`, atau CSS variable shadcn/ui, minta *"extend design.md with Tailwind
exports"* — Hallmark akan menambahkannya.
