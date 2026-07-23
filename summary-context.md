# Summary Context — Bagi Hasil (Profit Sharing Platform)

> **Apa ini:** dokumen rujukan lengkap untuk menyusun `README.md` GitHub dan pitch deck.
> Bukan dokumen yang dibaca sistem (bukan seperti `design.md`/`ux-spec.md`) — ini bahan
> mentah, disusun sebagai **pohon masalah**: dari akar (kenapa produk ini perlu ada) turun
> ke cabang (kategori tantangan teknis) turun ke daun (keputusan/bug/kasus spesifik).
> Setiap klaim disertai sitasi `file:baris` supaya bisa diverifikasi ulang — dokumen ini
> akan jadi rujukan tertulis, jadi kutipan salah lebih mahal daripada di UI.
>
> Panduan pemakaian ada di bagian paling bawah (§10).

---

## 0. Ringkasan eksekutif

Proyek ini menjawab satu studi kasus: perusahaan yang menjual produk lalu membagi
keuntungan bersihnya ke sejumlah investor — tapi skema pembagiannya **dinamis**, bisa
diatur ulang admin kapan saja (per kategori produk, per rentang laba, per periode, per
investor), dan perubahan skema **tidak boleh** mengubah hasil transaksi yang sudah selesai.
Satu kalimat itu saja sudah menyingkirkan kemungkinan solusi "kolom persentase tetap di
tabel Investor" — dan dari situlah seluruh kompleksitas produk ini lahir.

Yang dibangun bukan cuma backend rule-engine. Dalam satu rentang pengerjaan yang sama,
produk ini melewati siklus penuh: dari studi kasus 1 paragraf → dekomposisi kebutuhan →
keputusan arsitektur (dengan anggaran keras 40 jam) → implementasi domain logic yang
diuji sampai ke perilaku pembulatan uang → lalu **berkali-kali** diuji ulang lewat mata
pengguna asli, yang menghasilkan penemuan bug RBAC nyata di tengah jalan, dan tiga
putaran overhaul desain (termasuk migrasi tema gelap→terang secara total, pencabutan
font monospace, dan tujuh iterasi perbaikan satu komponen visual — bagan organisasi —
sampai akhirnya benar).

Dokumen ini merangkai semuanya: bukan cuma "fitur apa yang ada", tapi **kenapa tiap
keputusan diambil**, konstrain apa yang memaksanya, dan bottleneck tak terduga apa yang
ditemukan di sepanjang jalan — termasuk beberapa gotcha CSS/browser yang jarang diketahui
bahkan oleh developer berpengalaman.

---

## 1. AKAR — Studi kasus asli & kenapa produk ini perlu ada

### 1.1 Paragraf asli, verbatim (`study-case.md:5`)

> "Studi kasus yang digunakan adalah sebuah aplikasi transaksi di mana perusahaan
> menjual produk kepada pelanggan. Setiap transaksi menghasilkan pendapatan yang
> kemudian dikurangi dengan biaya produksi untuk mendapatkan keuntungan bersih.
> Keuntungan tersebut tidak langsung dibagikan dengan persentase tetap, melainkan
> menggunakan skema pembagian keuntungan yang bersifat dinamis. Administrator dapat
> mengatur aturan pembagian keuntungan, misalnya berdasarkan jenis produk, besar
> keuntungan, periode tertentu, atau persentase yang berbeda untuk setiap investor.
> Setelah transaksi selesai dan keuntungan bersih dihitung, sistem secara otomatis
> mendistribusikan keuntungan kepada seluruh investor sesuai aturan yang sedang
> berlaku. Dengan mekanisme ini, perubahan skema pembagian keuntungan dapat dilakukan
> kapan saja tanpa memengaruhi proses transaksi yang telah berjalan, sehingga sistem
> menjadi lebih fleksibel dan mudah disesuaikan dengan kebutuhan bisnis."

Satu kalimat di paragraf itu yang paling menentukan seluruh desain sistem, dan
ditandai eksplisit sebagai "poin paling krusial dari studi kasus" (`study-case.md:50`):

> **"perubahan skema pembagian keuntungan dapat dilakukan kapan saja tanpa
> memengaruhi proses transaksi yang telah berjalan"**

Ini bukan sekadar "buat CRUD untuk aturan bagi hasil" — ini janji **immutability di
atas skema yang mutable**: aturan boleh berubah, tapi jejak sejarah tidak boleh
tergores. Seluruh Cabang 3 (§3, kepercayaan & auditability) di dokumen ini adalah
jawaban atas satu kalimat ini.

### 1.2 Dekomposisi — dari narasi ke kebutuhan atomik (`study-case.md:15-22`)

| # | Pernyataan dalam studi kasus | Kebutuhan sistem |
|---|---|---|
| 1 | "menjual produk kepada pelanggan" | Entitas `Product`, `Customer`, `Transaction` |
| 2 | "pendapatan... dikurangi biaya produksi... keuntungan bersih" | `net_profit = revenue - production_cost` per transaksi |
| 3 | "tidak langsung dibagikan dengan persentase tetap... skema dinamis" | Aturan **tidak boleh hardcode** — data-driven |
| 4 | "aturan... jenis produk, besar keuntungan, periode tertentu, persentase berbeda per investor" | Rule Engine multi-kriteria: `product_type`, `profit_range`, `date_period`, `investor_percentage` |
| 5 | "sistem secara otomatis mendistribusikan keuntungan" | Proses **otomatis** (event-driven), bukan tombol manual |
| 6 | "perubahan skema... tanpa memengaruhi proses transaksi yang telah berjalan" | Rule **immutable/versioned** — perubahan baru tidak boleh mengubah distribusi lama (snapshot) |

Lima kalimat singkat itu ternyata **tidak menjawab** lima pertanyaan yang justru paling
menentukan desain (`study-case.md:24-29`) — dan justru di titik inilah pekerjaan
rekayasa yang sesungguhnya dimulai:

- Apa yang terjadi kalau **lebih dari satu rule cocok** untuk satu transaksi?
- Apa yang terjadi kalau **tidak ada rule yang cocok**?
- Bagaimana memastikan total persentase antar investor **tidak melebihi 100%**?
- Bagaimana menangani **rounding** uang supaya total distribusi = net profit persis?
- Bagaimana audit trail-nya — kenapa investor X dapat Rp Y dari transaksi Z?

Jawaban atas lima pertanyaan ini ada di Cabang 2-4 (§2-4) di bawah.

### 1.3 Konstrain nyata dari pemberi tugas — bukan asumsi

Ini bagian yang sering hilang dari cerita produk: batasan-batasan berikut bukan
pilihan gaya, melainkan **jawaban langsung** dari pemberi tugas terhadap pertanyaan
klarifikasi terstruktur (`open-q.md`, bagian D — "Ruang Lingkup & Teknologi"):

| Pertanyaan | Jawaban literal | Dampak |
|---|---|---|
| **D1** — Scope deliverable? | *"opsi 4"* = Fullstack + deployment | Bukan cuma dokumen arsitektur, bukan cuma backend — harus jalan end-to-end |
| **D2** — Stack ditentukan? | *"bebas, sesuai rekomendasi anda yang paling bagus dan efisien"* | Stack (NestJS + PostgreSQL + Prisma + Next.js) adalah rekomendasi penulis sendiri, dipertanggungjawabkan lewat perbandingan 4 kandidat di `architecture.md:70-91`, bukan diktean |
| **D3** — Deadline? | **"deadlinennya 40 jam dari sekarang"** | Batas waktu keras, bukan estimasi sendiri — semua keputusan pemangkasan scope (§1.4) berakar dari angka ini |
| **D4** — Skala sistem? | *"<200rb"* transaksi/hari | Membenarkan pilihan "modular monolith cukup, tidak perlu microservices/CQRS fisik dari awal" |

Tidak ditemukan rubrik penilaian eksplisit di mana pun dalam dokumen proyek (sudah
digrep menyeluruh untuk kata "evaluasi/kriteria/dinilai/penilaian"). Yang paling
mendekati "kriteria sukses" adalah daftar self-imposed di §1.4 di bawah.

### 1.4 Scoping yang jujur di depan, bukan ditemukan di ujung tenggat

Dengan 0 jam slack dari anggaran 40 jam, `architecture.md` §15 membuat keputusan
pemangkasan secara eksplisit dan tertulis **sebelum** coding dimulai, bukan
ditemukan mepet tenggat (`architecture.md:1363`):

> "Dengan deadline 40 jam untuk fullstack + deployment, ruang lingkup harus dipotong
> dengan jujur di depan, bukan ditemukan mepet tenggat."

**Alokasi 40 jam** (`architecture.md:1367-1378`):

| Fase | Cakupan | Jam | Status |
|---|---|---|---|
| 0. Fondasi | Monorepo, Docker Compose, Prisma, `Money` value object, `Result`, seed | 3 | Wajib |
| 1. Identity | User + RBAC + JWT, guard, seed role | 3 | Wajib |
| 2. Catalog & Sales | Produk, pelanggan, transaksi, net profit | 4 | Wajib |
| 3. Rule Engine | Rule + versioning, matcher, pipeline composable, simulator | 8 | **Inti — jangan dipotong** |
| 4. Distribusi & Ledger | Outbox, handler, layer, ledger append-only, explain | 7 | **Inti — jangan dipotong** |
| 5. Approval & Payout | Ambang batas, antrean approval, batch payout | 3 | Wajib |
| 6. Directory | Employee CRUD, OrgUnit + closure, org chart sederhana | 3 | Diringkas |
| 7. Frontend | 8 layar inti | 7 | Wajib |
| 8. Deploy & dokumentasi | Vercel + Railway + Neon, README, seed demo | 2 | Wajib |
| **Total** | | **40** | |

**Yang sengaja dipangkas, dan kenapa aman** (`architecture.md:1380-1391`):

| Dipangkas | Perlakuan | Kenapa aman |
|---|---|---|
| SSO / OIDC | Strategi disiapkan, tidak diaktifkan | MVP cukup JWT lokal (jawaban B2) |
| Connector SCIM & IdP | Antarmuka + satu implementasi dummy | Menunjukkan desain tanpa habiskan waktu integrasi |
| Otorisasi sadar-hierarki | Tidak ada | RBAC global dipilih (jawaban B4) |
| CQRS fisik, Redis, OpenTelemetry | Tidak ada | Belum ada pemicu (lihat jalur scaling §14.1) |
| Partisi tabel ledger | Didokumentasikan, tidak diterapkan | 200rb/hari baru menuntutnya setelah beberapa bulan |
| Portal investor | Layar ringkas: saldo + mutasi | Nilai demonstrasi tertinggi ada di sisi admin |

> Catatan status terkini: baris terakhir ("portal investor: layar ringkas") sudah
> **dilampaui** — portal investor sekarang penuh (dashboard, tren, ledger, *explain*
> per distribusi, resi PDF), dibangun dalam iterasi lanjutan setelah README asli
> ditulis. Lihat §10.1 untuk detail status yang sudah diperbarui.

**Yang TIDAK BOLEH dipangkas apa pun alasannya** (`architecture.md:1393`):

> "pipeline composable, snapshot per lapisan, ledger append-only, simulator rule,
> dan layar *explain*. Kelimanya adalah bukti bahwa sistem benar-benar menjawab
> studi kasus — sisanya adalah pelengkap yang bisa dijelaskan lewat dokumen."

Ini adalah kriteria sukses de facto proyek — bukan checklist fitur, tapi lima bukti
konkret bahwa janji utama studi kasus (§1.1) benar-benar ditepati.

**Urutan pengerjaan** (`architecture.md:1395-1399`): vertikal per fitur (satu alur
utuh API→data→UI untuk transaksi dulu, baru rule engine), bukan horizontal per
lapisan — karena "menumpuk seluruh backend dulu baru menyentuh frontend adalah cara
paling umum kehabisan waktu dengan sistem yang tidak bisa didemokan sama sekali."
Deploy dimulai dari jam ke-4, bukan di akhir.

---

## 2. CABANG — Kebenaran uang (money correctness)

Ini jawaban langsung atas 5 pertanyaan implisit di §1.2.

**Satu mekanisme, tiga mode sekaligus** (`distribution-pipeline.ts:14-24`,
`study-case.md:112`): rule bisa ditandai `stackable`. Satu rule `stackable=false` =
*winner-takes-all*; beberapa rule `stackable=true` = komposisi berlapis; campuran
keduanya = mode hybrid. "Naik ke skema yang lebih fleksibel nanti tidak butuh
migrasi; cukup ubah data."

**GROSS vs RESIDUAL** (`distribution-pipeline.ts:61-66`): tanpa pembeda ini, "20%"
jadi ambigu begitu ada lebih dari satu lapisan — 20% dari laba awal (`GROSS`) beda
nilainya dengan 20% dari sisa yang belum dialokasikan (`RESIDUAL`). "Ambiguitas
semacam itu... tidak boleh hidup di kepala masing-masing admin."

**Resolusi konflik, deterministik — analog CSS specificity**
(`rule-matcher.ts:26-66`, `architecture.md:1139`): beberapa rule cocok bersamaan
**bukan** konflik yang harus diselesaikan — itu perilaku yang diminta. Urutan
eksekusi: `executionOrder → priority → specificity → createdAt → id` (total order,
tidak pernah ambigu). Skor spesifisitas dihitung sekali saat rule dibuat (bobot
bertingkat 4/2/1 untuk kategori produk/rentang laba/tanggal berlaku) — "mirip cara
CSS menentukan selector mana yang menang." Batas keras 10 lapisan per distribusi
(`MAX_DISTRIBUTION_LAYERS`, dapat dikonfigurasi via env).

**Uang: BigInt, bukan float** (`money.ts:89-116`, `design.md:156-158`): "`0.1 + 0.2
!== 0.3`... di sistem bagi hasil itu selisih yang harus dipertanggungjawabkan ke
investor." Nominal dari API selalu **string**, di-parse ke `BigInt`, tidak pernah
menyentuh `Number`. `portion()` selalu membulatkan ke **bawah** — sisa pembulatan
(dust) tidak pernah melebihi basis, dan tidak pernah "menciptakan" uang dari
kekosongan. Seluruh sisa (termasuk dust pembulatan) jatuh ke perusahaan
(`distribution-pipeline.ts:111`). Diuji lewat *property-based test*: untuk
sembarang net profit dan kombinasi persentase, `SUM(alokasi) === netProfit` **selalu**
benar (`architecture.md:1277-1307`) — teknik ini menangkap bug pembulatan yang
tidak akan pernah muncul di test dengan angka bulat biasa.

**Over-allocation, tidak digagalkan** (`distribution-pipeline.ts:74-80`,
`money.ts:118-134`): kalau rantai rule yang salah konfigurasi akan mengalokasikan
lebih dari yang tersisa, nominal di-*clamp* proporsional dan ditandai
`overAllocated`, tapi distribusi **tetap jalan**. "Menggagalkan distribusi hanya
akan menyandera profit karena kesalahan yang bisa dikoreksi belakangan."

**Fallback, bukan diam-diam hilang** (`distribution-pipeline.ts:50-51, 118-132`):
kalau tidak ada rule aktif yang cocok, seluruh net profit ditahan ke perusahaan dan
ditandai `isFallback: true`, muncul di dashboard admin sebagai "perlu ditinjau."
"Profit tidak pernah hilang dan tidak pernah terbagi diam-diam tanpa aturan yang
disengaja."

---

## 3. CABANG — Kepercayaan & auditability

Jawaban langsung atas kalimat paling krusial di §1.1: rule boleh berubah, hasil
lama tidak boleh berubah.

**Snapshot, bukan referensi hidup** (`distribution-pipeline.ts:146-176`): setiap
lapisan distribusi menyimpan salinan **utuh** aturan (id, versi, kategori, batas
laba, jendela berlaku, urutan/stackable/basis/prioritas/spesifisitas, dan setiap
porsi investor) pada detik eksekusi terjadi. "Bahkan bila rule kelak dihapus,
pertanyaan 'kenapa investor A menerima Rp 3.150.000 dari transaksi ini?' tetap bisa
dijawab lengkap."

**"Edit" rule = versi baru, bukan mutasi** (`rule.service.ts:93-153`): rule lama
di-set `status: SUPERSEDED`, `validTo: now`; rule baru mulai dari `version + 1`.
Rule lama tetap utuh di database sebagai catatan sejarah, tidak pernah ditimpa.

**Immutability ditegakkan di level DATABASE, bukan cuma disiplin aplikasi**
(migrasi `20260722160000_append_only_and_partial_indexes`): "Disiplin developer
tidak cukup untuk sesuatu yang menyangkut uang... termasuk oleh kode aplikasi yang
salah tulis, migrasi yang ceroboh, atau seseorang di psql jam 2 pagi." Trigger
PostgreSQL menolak `UPDATE`/`DELETE` pada `investor_ledger_entries`,
`distribution_entries`, `distribution_layers` — melempar *exception*, bukan no-op
senyap ("no-op yang senyap akan menyembunyikan bug"). Trigger terpisah memblokir
perubahan nominal pada `profit_distributions` dan isi pada `profit_sharing_rules`
setelah dibuat.

**Koreksi = reversal, bukan edit** (`distribution.service.ts`, skema
`entryType: REVERSAL`): transaksi dibatalkan/refund setelah distribusi jalan →
dibuat distribusi baru bertipe `REVERSAL` yang menegasikan entry sebelumnya, tidak
pernah men-*delete*. Saldo investor dihitung ulang dari jumlah ledger, **bukan**
dari kolom saldo tersimpan — "selisih berarti alarm, bukan misteri."

**Reliabilitas — pola outbox** (`outbox.processor.ts`, `transaction.service.ts:79-107`):
saat transaksi ditandai selesai, event `TransactionCompleted` ditulis **dalam
transaksi database yang sama** dengan perubahan statusnya — bukan dipanggil
langsung sesudahnya. "Kalau proses mati tepat setelah commit, event tetap
menunggu di tabel outbox dan diproses saat hidup lagi." Poller berjalan dengan
`FOR UPDATE SKIP LOCKED` supaya beberapa instance bisa berbagi satu antrean **tanpa
broker terpisah** — "inilah yang membuat MVP ini cukup dilayani satu database."
Idempotensi ditegakkan lewat *unique constraint* pada `transactionId`: kalau event
terkirim dua kali, baris kedua ditolak dengan log "Distribusi untuk X sudah ada —
dilewati (idempoten)", bukan membuat distribusi duplikat.

---

## 4. CABANG — Privasi multi-investor (zero-trust di server)

Sistem ini punya banyak investor yang **tidak boleh** saling melihat data satu sama
lain — desainnya sengaja tidak mempercayai UI untuk menjaga batas itu.

**Filter di level query database, bukan sembunyikan kolom di klien**
(`distribution.service.ts:366-379`): "Menyembunyikan data sensitif di frontend saja
tidak pernah cukup; siapa pun yang membuka devtools bisa melihat response mentahnya."
Query `entries: { where: { investorId } }` berarti data investor lain **tidak
pernah ditarik dari database sama sekali** — "data yang tidak pernah meninggalkan
database tidak bisa bocor lewat cara apa pun."

**404, bukan array kosong**: kalau investor meminta distribusi yang bukan miliknya,
respons adalah `NotFoundException`, bukan array kosong. Array kosong pun sudah
membocorkan informasi ("distribusi ini ada, cuma bukan punya Anda") — "investor
tidak bisa memastikan sebuah distribusi ada hanya karena responsnya bukan error."

**Identitas dari token, bukan dari URL** (`profit-sharing.controller.ts:214-228`):
rute `investors/me/*` sengaja **tidak** dipagari `@RequirePermission` sama sekali —
"keamanannya bukan dari daftar izin, tapi dari struktur: investorId SELALU
diturunkan dari `user.sub` di token, tidak pernah dari parameter URL yang bisa
ditebak pengguna."

**Gotcha urutan rute NestJS** — bottleneck tak terduga kelas infrastruktur: rute
statis (`investors/me/...`) harus terdaftar **sebelum** rute dinamis
(`investors/:id/...`), karena NestJS mencocokkan rute sesuai **urutan pendaftaran**,
bukan spesifisitas. Kalau dibalik, permintaan ke `/investors/me/ledger` tertangkap
oleh handler `:id/ledger` dengan `id = "me"`, dan setiap investor mendapat 404
"profil tidak ditemukan" karena "me" bukan UUID yang valid.

Warisan privasi ini menembus sampai ke fitur turunan seperti resi PDF — lihat §8.

---

## 5. CABANG — Struktur organisasi & akses (closure table + RBAC)

**Closure table, bukan adjacency-list + rekursi** (`org-unit.service.ts:23-40,
59-61`): dua representasi sengaja dipakai berdampingan — pohon organisasi untuk
render UI dibangun dari `parentId` secara langsung (lebih murah untuk N kecil),
sementara closure table dipakai khusus untuk kueri "semua bawahan X". Alasannya
eksplisit: "inilah yang membuat 'semua bawahan Divisi X' jadi satu JOIN, bukan
rekursi berulang." Setiap unit punya baris self-reference
`(ancestorId=id, descendantId=id, depth=0)` — wajib ada supaya kueri "semua bawahan
termasuk diri sendiri" konsisten.

**Algoritma re-parenting** (`org-unit.service.ts:75-119`) — memindahkan satu unit
(dan seluruh bawahannya) ke induk baru tanpa merusak closure table:
1. *Cycle guard* sebelum mutasi apa pun: tolak kalau induk baru ternyata adalah
   salah satu bawahan unit yang dipindah (akan membentuk lingkaran).
2. Putuskan seluruh tautan leluhur **lama** untuk subtree ini (kecuali baris
   self-reference tiap node).
3. Sambung ulang: **setiap leluhur baru × setiap node dalam subtree lama**
   (cross-join), depth dihitung ulang sebagai `depth_leluhur_baru + depth_lama + 1`.

Semua di dalam satu transaksi database.

**RBAC berbasis permission string, bukan `role === 'admin'` tersebar**
(`jwt-auth.guard.ts:41-49`): "Menambah role cukup mengubah data." Sepuluh string
permission ditemukan lewat audit `@RequirePermission(...)`: `transaction:create`,
`transaction:read`, `profit_rule:create`, `profit_rule:read`, `distribution:read:all`,
`distribution:approve`, `investor:read:any`, `payout:manage`, `employee:manage`,
`org_unit:manage`. Peran `investor` sengaja mendapat **nol** permission admin —
aksesnya murni dari struktur token (§4), bukan daftar izin.

**Bug nyata yang ditemukan pengguna di tengah sesi, bukan lewat test otomatis:**
pertanyaan sederhana *"emang benar ya sales langsung ke dashboard admin?"*
membongkar bahwa peran `ops_penjualan` sempat over-privileged. Akar masalahnya:
logika "kemana user diarahkan setelah login" dan "halaman mana yang boleh dibuka"
**diduplikasi** di dua tempat (halaman login + guard shell admin) yang bisa
berdivergen kapan saja begitu ada peran baru. Perbaikan: `lib/nav.ts` dan
`lib/permissions.tsx` dibuat sebagai **satu-satunya sumber kebenaran**, dipakai
kedua tempat sekaligus (`nav.ts:15-22`: "Sebelumnya kedua tempat itu menyalin aturan
ini sendiri-sendiri — begitu ada peran baru, gampang salah satu ketinggalan
diperbarui — persis yang nyaris terjadi waktu ops_penjualan diperketat"). Ini bug
class klasik (logic terduplikasi yang berdivergen diam-diam) yang justru ditemukan
dari cara paling murah: pertanyaan naif dari pengguna asli yang membaca layar,
bukan dari test suite.

---

## 6. CABANG — UX lintas generasi (bukan cuma "kelihatan modern")

Audiens produk ini eksplisit lintas generasi — investor maupun karyawan internal,
dari Gen Z sampai boomer. Serangkaian keputusan desain di bawah ini didorong
langsung oleh feedback pengguna asli yang berulang, bukan asumsi "best practice"
yang diterapkan top-down.

**Migrasi tema total, bukan mode tambahan** (`design.md:18-37`, tiga "Catatan
kejujuran", dikutip penuh):

> "Tema gelap-atmosferik ('Ember') sebelumnya **diganti total** atas permintaan
> eksplisit pengguna: audiens lintas generasi (Gen Z, milenial, boomer — investor
> maupun karyawan internal) menilai kanvas gelap terlalu suram/niche. Ini bukan
> mode terang tambahan di samping mode gelap — satu-satunya tema sekarang adalah
> terang. Setiap token warna dihitung ulang dari nol terhadap kanvas terang (bukan
> dibalik dari nilai gelap), termasuk warna status yang sebelumnya nyaris tak
> terlihat kalau sekadar dipakai ulang di kanvas baru."

Bukti konkret: warna *warning* pada tema gelap lama, kalau sekadar dipindah ke
kanvas terang tanpa dihitung ulang, kontrasnya jatuh sampai ±1,66:1 — nyaris tak
terlihat. Setiap token divalidasi ulang ke ambang WCAG AA (≥4,5:1 teks, ≥3:1
elemen antarmuka) dari nol, bukan diasumsikan tetap valid.

> "Arah biru-cerah ini datang dari referensi visual fintech yang dikirim
> pengguna... Referensi itu kemungkinan **produk/template yang dijual**, jadi yang
> diambil hanya arah gayanya — biru cerah, kartu terangkat, navbar kaca — bukan
> salinan strukturnya atau brandingnya." — kejujuran soal provenance referensi
> visual, bukan diam-diam meniru total.

**Font monospace untuk angka dicabut total** — kasus lain "textbook practice vs
preferensi pengguna nyata": `design.md` (masih, per saat dokumen ini ditulis)
mendokumentasikan JetBrains Mono sebagai *outlier* font yang disengaja untuk
"register numerik" (nominal, kode transaksi, ID) dengan alasan teknis yang valid
(`design.md:127,134-135`: "menjamin perataan tabular *by construction*"). Tapi
pengguna berulang kali menyatakan tampilan itu "kelihatan teknis/kaku" untuk
audiens non-teknis. Keputusan akhir: `--font-mono` di token disamakan ke
`--font-body` (satu titik perubahan, menjangkau **semua** pemakaian — label,
kode transaksi, nominal, sumbu grafik — tanpa risiko ada yang terlewat), dan
import Google Font JetBrains Mono dicabut dari `layout.tsx`. Perataan tabular
tetap dipertahankan lewat `font-variant-numeric: tabular-nums`, yang bekerja di
font apa pun, bukan cuma monospace.

> ⚠️ **Utang dokumentasi diketahui:** `design.md` §Typography (baris 74-76, 127)
> belum diperbarui untuk mencerminkan keputusan ini — masih menyebut JetBrains
> Mono sebagai token & outlier aktif. Kode sumber (`tokens.css`) sudah benar;
> dokumennya yang tertinggal. Perlu disinkronkan terpisah dari pekerjaan ini.

**Audit tanda baca dash** — pengguna secara eksplisit meminta penghapusan seluruh
em-dash (`—`) dari teks yang benar-benar tampil ke pengguna. Diaudit menyeluruh:
bukan cuma UI React (alert, subjudul halaman, teks PDF resi), tapi juga pesan
*error* yang dilempar dari backend dan berakhir di alert (`BadRequestException` di
`org-unit.service.ts`) — kelas kesalahan yang gampang terlewat kalau audit cuma
menyisir frontend.

**Glassmorphism sebagai pengecualian sadar** (`design.md:108-119`): navbar kaca
adalah "pengecualian sadar dari kebiasaan Hallmark yang biasanya menghindari
glassmorphism (rawan jadi dekorasi tanpa fungsi kalau dipasang sembarangan)" —
dibatasi ketat hanya pada elemen navigasi tetap yang selalu duduk di atas wash
warna latar, tidak pernah di atas kartu konten yang isinya berubah-ubah.

---

## 7. CABANG — Visualisasi data yang bisa dipercaya

**Chart dibangun tangan dari SVG polos, bukan library** — keputusan sadar, bukan
kekurangan waktu. Alasan eksplisit di `trend-chart.tsx:37-47` untuk chart hero
portal investor: referensi gaya datang dari aplikasi portofolio multi-aset (saham,
kripto — beberapa seri yang genuinely berbeda), tapi sistem ini melacak **satu**
aliran pendapatan per investor — jadi warna batang memakai aksen produk (bukan
warna kategorikal netral), analog dengan tombol primer yang juga berisi penuh
warna aksen. `chart-utils.ts` mengimplementasikan sendiri algoritma "nice number"
ala D3 (1/2/5 × 10ⁿ) untuk skala sumbu, dan interpolasi Catmull-Rom→Bezier untuk
smoothing kurva — eksplisit ditandai "bukan hiasan, cuma interpolasi visual antar
titik yang sudah nyata" (tidak mengarang data).

**Palet CVD-validated dengan "relief rule" wajib** (`design.md:163-176`): palet
kategorikal (`--viz-1..5`) divalidasi ulang setelah migrasi tema — di kanvas terang
baru, **4 dari 5 slot warna jatuh di bawah kontras 3:1** (hanya `--viz-1` yang
lolos). Ini secara eksplisit didokumentasikan sebagai **bukan opsional**: "setiap
grafik yang memakai slot-slot ini wajib label langsung atau padanan tabel, tidak
boleh mengandalkan warna area saja untuk dibaca." Ketegangan lain yang dicatat
terbuka: `--color-accent` sekarang bertetangga hue dengan `--viz-1` (dulu aksen
oranye vs `--viz-2` oranye; sekarang aksen biru vs `--viz-1` biru) — mitigasinya
mengikat: aksen tidak pernah muncul di dalam area plot, cincin fokus pada elemen
grafik memakai `--color-ink`, bukan `--color-focus`.

**Saga bagan organisasi** — studi kasus paling instruktif soal bottleneck tak
terduga. Lihat Lampiran §9.1 untuk kronologi penuh tujuh iterasi.

---

## 8. CABANG — Bukti transaksi (resi PDF)

**Kenapa `@react-pdf/renderer`, bukan screenshot HTML**: menghasilkan PDF vektor
asli (teks bisa di-*select*/dicari), bukan raster hasil `html2canvas`. Trade-off
yang datang bersamanya: mesin ini punya *layout engine* sendiri, tidak bisa
membaca `var(--token)` dari `tokens.css` — jadi nilai warna **sengaja
diduplikasi** sebagai hex literal di `receipt-pdf.tsx`, dengan catatan eksplisit
"kalau tokens.css berubah, sinkronkan manual di sini juga."

**Font Helvetica bawaan, bukan Montserrat web**: supaya proses generate PDF di
browser pengguna **tidak bisa gagal karena jaringan** (tidak perlu fetch file font
eksternal). PDF diperlakukan sebagai artefak ekspor yang berdiri sendiri, sengaja
dikecualikan dari "plafon 3-font" yang berlaku di UI web.

**Bug halus — glyph encoding**: karakter minus asli (U+2212, yang dipakai `rp()`
di web) **hilang tanpa jejak** di PDF, karena `WinAnsiEncoding` bawaan Helvetica
standar PDF tidak punya glyph itu. Ditemukan lewat pemeriksaan visual PDF hasil
generate (bukan dari tipe data atau linter), diperbaiki dengan mengganti ke
hyphen-minus ASCII biasa di konteks PDF saja.

**Privasi terwarisi sampai ke dokumen final**: resi admin memuat seluruh
investor (wewenang `distribution:read:all`); resi investor **hanya** memuat porsi
milik pengunduh, karena datanya berasal dari endpoint yang sudah difilter di
server (§4) — komponennya secara struktural tidak pernah menerima data investor
lain, jadi tidak mungkin membocorkannya. Catatan ini bahkan dituliskan eksplisit di
footer dokumen yang dilihat investor.

**Performa — lazy-load ~500KB**: `@react-pdf/renderer` di-*dynamic import* di
dalam handler klik tombol, bukan diimpor statis di level modul halaman — supaya
library seberat itu baru diunduh browser saat tombol benar-benar ditekan, tidak
membebani *first-load JS* setiap kali halaman detail distribusi dibuka.

---

## 9. LAMPIRAN — Bottleneck tak terduga (studi kasus mendalam)

Bagian ini paling berguna untuk pitch deck sebagai **bukti kedalaman rekayasa** —
bukan cerita "semua berjalan mulus", tapi jejak nyata menemukan dan memperbaiki
kegagalan yang tidak jelas dari awal.

### 9.1 Saga bagan organisasi — tujuh putaran

Komponen visual paling kecil di aplikasi ini (satu halaman, pohon organisasi)
justru butuh iterasi paling banyak, karena setiap perbaikan diuji langsung oleh
mata pengguna, bukan dianggap selesai begitu kode jalan.

1. **v1 — list bertingkat sederhana.** Fungsional, tidak visual. Diminta diganti
   jadi diagram pohon sungguhan.
2. **v2 — CSS `table-cell` classic technique.** Kartu dengan badge level, garis
   penghubung lewat pseudo-element. Bug: `<li>` tidak diberi `text-align: center`,
   jadi kartu yang selnya melebar (karena punya anak) bergeser kiri sementara garis
   dihitung dari tengah sel — terlihat miring/tidak presisi.
3. **v3 — fix `text-align: center`.** Garis jadi lurus. Tapi badge level yang
   menggantung di atas tepi kartu justru **tertembus** garis horizontal — ternyata
   badge dan garis berada di ketinggian piksel yang sama.
4. **v4 — fix `z-index`.** Kartu (dan badge-nya) dipaksa menggambar di depan garis.
   Bekerja di pengujian, tapi pengguna melaporkan "masih sama" — investigasi
   membuktikan CSS yang dikirim server sudah benar (diverifikasi langsung dari
   payload HTTP), sehingga kemungkinan besar itu **cache browser**, bukan bug kode.
5. **v5 — reposisi garis secara geometris** (menjauhkan koordinat garis dari zona
   badge sama sekali, tidak bergantung urutan render/`z-index`). Menghilangkan
   kemungkinan tembus di semua kondisi cache/browser — tapi menciptakan masalah
   baru: garis jadi terlihat **mengambang di tengah celah kosong**, tidak terlihat
   menyambung ke kartu di bawahnya.
6. **v6 — revert posisi + tetap pakai `z-index`.** Garis menempel kontekstual lagi
   ke barisan kartu, sekaligus tidak tembus badge. Tapi kualitas visual masih
   dikeluhkan: "jelek amat garisnya" — tipis, abu-abu polos, sudut siku tajam.
7. **v7 — penulisan ulang total: konektor SVG.** Bukan tambal CSS lagi. Posisi
   setiap kartu diukur presisi lewat `getBoundingClientRect()` pada elemen DOM
   sungguhan (bukan dihitung dari asumsi *layout*), lalu digambar sebagai kurva
   siku membulat (`elbowPath()`, quadratic bezier di sudut) yang diwarnai sesuai
   cabang divisi masing-masing. Desain ini otomatis menghilangkan risiko tembus
   badge dari akarnya, karena garis secara struktural hanya pernah berhenti tepat
   di batas atas kartu — tidak pernah masuk ke zona di atasnya tempat badge
   mengambang.

Rewrite di langkah 7 memunculkan **dua bug baru** yang jarang diketahui:

- **CSS overflow-axis coupling.** `overflow-x: auto` tanpa `overflow-y` yang
  eksplisit diam-diam memaksa browser membuat sumbu-Y **ikut** *scrollable*
  (aturan spesifikasi CSS: satu sumbu tidak boleh *scroll* sementara sumbu lain
  tetap "visible" begitu saja). Dikombinasikan dengan *scroll anchoring* browser
  (penyesuaian otomatis posisi *scroll* setelah ukuran konten berubah — dalam
  kasus ini, setelah font Montserrat async selesai dimuat dan lebar kartu sedikit
  bergeser), kartu paling atas jadi terpotong dari pandangan tanpa alasan yang
  jelas dari kode. Perbaikan: `overflow-y: hidden` eksplisit (aman karena kanvas
  sudah otomatis setinggi kontennya, tidak pernah overflow vertikal).
- **`display: inline-block` tidak center otomatis.** Wrapper baru untuk kanvas SVG
  dibuat `inline-block` supaya menyusut sesuai lebar konten — tapi `inline-block`
  tidak ikut ter-*center* oleh `margin: auto` di sekitarnya tanpa `text-align:
  center` eksplisit di elemen induk (satu lapis tak-langsung yang gampang lolos
  audit visual biasa). Diganti `width: fit-content; margin: 0 auto`, yang lebih
  langsung menyatakan maksud "selebar konten, lalu ditengahkan".

### 9.2 Font-load race condition

Google Font Montserrat dimuat dengan `display: swap`, artinya browser merender
dulu dengan font fallback lalu **menukarnya** begitu font asli selesai diunduh —
dan pertukaran itu bisa menggeser lebar kartu beberapa piksel. Karena posisi garis
SVG di §9.1 diukur langsung dari DOM (bukan dihitung dari nilai statis), pergeseran
itu membuat garis sedikit meleset dari kartu kalau tidak diantisipasi. Perbaikan:
`document.fonts.ready.then(measure)` — ukur ulang sekali lagi begitu semua font
selesai dimuat, bukan cuma sekali saat mount.

### 9.3 Ringkasan pola bottleneck

Ketiga kasus di atas (§9.1, §9.2, dan glyph encoding PDF di §8) punya benang merah
yang sama: **kegagalan yang tidak muncul dari membaca kode, hanya muncul dari
menjalankannya dan melihat hasilnya** — cache browser yang menyamarkan fix yang
sebenarnya sudah benar, *spec quirk* CSS yang jarang didokumentasikan, dan
*race condition* antara jaringan (font/PDF font) dan *layout*. Ini bagian dari
argumen kenapa proses berulang kali "screenshot lewat browser sungguhan, lalu
verifikasi lewat computed style/response payload asli" dipakai konsisten
sepanjang proyek — bukan cuma percaya kode terlihat benar.

---

## 10. PENUTUP — Cara pakai dokumen ini

### 10.1 Untuk `README.md`

Ambil **§1** (akar masalah, kenapa produk ini rumit) sebagai pembuka narasi
pengganti tagline generik, lalu **§2-5** (backend-heavy: kebenaran uang,
auditability, privasi, RBAC) sebagai bukti kedalaman rekayasa untuk pembaca
teknis/reviewer kode. `README.md` proyek ini sudah diperbarui berdampingan dengan
dokumen ini — lihat file tersebut untuk status fitur terkini (portal investor dan
modul direktori yang sebelumnya "belum" kini sudah "sudah").

### 10.2 Untuk pitch deck

Struktur yang disarankan (bukan wajib, sesuaikan dengan durasi presentasi):

1. **Buka dengan §1.1** — satu paragraf studi kasus asli, tekankan kalimat
   "tanpa memengaruhi transaksi yang telah berjalan" sebagai janji inti.
2. **Tabel ketakutan per-peran** (`ux-spec.md` §2, dikutip di §6 dokumen ini secara
   tidak langsung — ambil langsung dari sumber) — cara tercepat membuat audiens
   non-teknis paham *kenapa* tiap layar didesain seperti itu.
3. **2-3 war story dari Lampiran §9** — bukti kedalaman rekayasa yang jauh lebih
   meyakinkan daripada daftar fitur; pilih yang paling relevan dengan audiens
   (saga bagan organisasi untuk audiens teknis, font/tema untuk audiens
   produk/desain).
4. **§6** (UX lintas generasi) sebagai bukti proses mendengarkan pengguna asli
   secara berulang — bukan "kami menerapkan best practice", tapi "kami mengubah
   keputusan yang sudah textbook-benar karena pengguna nyata bilang itu tidak
   cocok untuk mereka."
5. **Tutup dengan §1.4** — bukti scoping yang jujur dan disiplin anggaran waktu,
   relevan untuk audiens yang menilai proses kerja, bukan cuma hasil akhir.
