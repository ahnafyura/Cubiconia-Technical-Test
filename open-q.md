# Open Questions — Klarifikasi Kebutuhan

> **Cara pakai:** setiap pertanyaan punya konteks (kenapa ini penting), opsi jawaban, dan rekomendasi saya. Silakan isi baris `**Jawaban:**`. Kalau setuju dengan rekomendasi, cukup tulis `rekomendasi` atau nomor opsinya.
>
> Pertanyaan ditandai prioritas:
> - 🔴 **Blocking** — desain database/arsitektur tidak bisa difinalisasi tanpa jawaban ini.
> - 🟡 **Penting** — mempengaruhi kompleksitas implementasi, tapi ada default yang aman.
> - 🟢 **Nice-to-have** — bisa diputuskan belakangan tanpa refactor besar.

---

## A. Rule Engine & Skema Pembagian Keuntungan

### 🔴 A1. Single-rule atau composable-rule?

Saat satu transaksi cocok dengan beberapa aturan sekaligus (misal ada rule "kategori Elektronik" DAN rule "periode Promo Desember"), apa yang terjadi?

| Opsi | Perilaku | Konsekuensi |
|---|---|---|
| **1. Winner-takes-all** | Hanya 1 rule menang (berdasarkan prioritas/spesifisitas) | Sederhana, deterministik, mudah dijelaskan ke admin |
| **2. Composable / berlapis** | Beberapa rule digabung bertingkat (rule A ambil 20% dulu, sisanya dibagi rule B) | Sangat fleksibel, tapi butuh konsep "urutan eksekusi" dan jauh lebih sulit di-debug |
| **3. Hybrid** | Default winner-takes-all, tapi rule bisa ditandai `stackable` | Kompleksitas menengah |

> **Rekomendasi:** Opsi 1 untuk MVP. Kalimat di studi kasus — *"sesuai aturan yang sedang berlaku"* (tunggal) — mengindikasikan satu skema aktif per transaksi. Struktur tabelnya tetap saya rancang agar bisa naik ke opsi 3 tanpa migrasi destruktif.

**Jawaban:**
saya ingin opsi 2 agar mudah nanti untuk dinaikkan di opsi ke 3 untuk pengembangan selanjutnya
---

### 🔴 A2. Total persentase investor wajib 100% atau boleh kurang?

| Opsi | Perilaku |
|---|---|
| **1. Wajib tepat 100%** | Seluruh net profit habis dibagi ke investor. Perusahaan tidak ambil porsi di layer ini. |
| **2. Boleh ≤ 100%** | Sisanya otomatis jadi *retained earnings* perusahaan (perlu entitas "company account") |
| **3. Boleh > 100%?** | Tidak masuk akal secara bisnis — saya asumsikan ini invalid dan diblok validasi |

> **Rekomendasi:** Opsi 2. Lebih realistis secara bisnis (perusahaan hampir selalu menahan sebagian), dan opsi 1 hanyalah kasus khusus dari opsi 2 di mana sisa = 0. Memilih opsi 2 sejak awal menghindari migrasi nanti.

**Jawaban:**
opsi 2
---

### 🔴 A3. Apa yang terjadi kalau TIDAK ADA rule yang cocok?

| Opsi | Perilaku |
|---|---|
| **1. Fallback ke default rule** | Ada 1 rule sistem yang selalu match (kondisi kosong = match semua) |
| **2. Status `PENDING_DISTRIBUTION`** | Transaksi tetap sukses, tapi profit "menggantung" menunggu admin bikin rule, lalu diproses ulang |
| **3. Tolak transaksi** | Transaksi gagal kalau tidak ada rule — **tidak saya sarankan**, karena mencampur urusan jual-beli dengan urusan bagi hasil |

> **Rekomendasi:** Opsi 1 + 2 digabung. Ada default rule (100% ke perusahaan) supaya tidak pernah ada profit yang hilang, TAPI distribusinya ditandai `is_fallback = true` agar muncul di dashboard admin sebagai "perlu ditinjau".

**Jawaban:**
sesuai rekomendasi anda
---

### 🟡 A4. Apakah daftar investor bisa berbeda antar rule?

Contoh: rule untuk kategori "Elektronik" melibatkan Investor A, B, C — sementara rule kategori "Fashion" hanya melibatkan Investor A dan D.

- **Opsi 1:** Ya, tiap rule punya daftar investornya sendiri (fleksibel penuh)
- **Opsi 2:** Tidak, daftar investor selalu sama, hanya persentase yang berubah

> **Rekomendasi:** Opsi 1. Secara skema database keduanya identik (tabel `rule_investor_share`), jadi memilih opsi 1 tidak menambah biaya apapun tapi memberi fleksibilitas gratis.

**Jawaban:**
opsi 1
---

### 🟡 A5. Perlu approval sebelum distribusi final?

Apakah hasil perhitungan distribusi langsung final, atau perlu di-approve admin/finance dulu?

- **Opsi 1:** Full otomatis, langsung final (sesuai kalimat *"sistem secara otomatis mendistribusikan"*)
- **Opsi 2:** Otomatis dihitung → status `DRAFT` → admin approve → status `SETTLED`
- **Opsi 3:** Otomatis final untuk nominal kecil, butuh approval di atas threshold tertentu

> **Rekomendasi:** Opsi 1 untuk MVP, tapi kolom `status` di tabel `profit_distribution` tetap saya siapkan (`CALCULATED | SETTLED | REVERSED`) supaya opsi 2 bisa diaktifkan kapan saja tanpa migrasi.

**Jawaban:**
opsi 2 + opsi 3
---

### 🟡 A6. Distribusi per transaksi atau per periode (batch)?

- **Opsi 1: Per transaksi** — setiap transaksi selesai → langsung hitung & catat distribusi (real-time)
- **Opsi 2: Per periode** — profit diakumulasi, lalu dibagi sekali di akhir bulan (batch payout)
- **Opsi 3:** Perhitungan per transaksi (real-time), tapi **pencairan** per periode

> **Rekomendasi:** Opsi 3. Ini yang paling umum di dunia nyata: *ledger* dicatat real-time per transaksi (audit trail rapi & granular), sedangkan *payout* aktual ke investor dijadwalkan periodik. Studi kasus menyebut "setelah transaksi selesai... secara otomatis mendistribusikan", yang cocok dengan pencatatan real-time.

**Jawaban:**
opsi 3
---

### 🟡 A7. Aturan pembulatan (rounding) uang

Net profit Rp 10.000 dibagi 3 investor @33,33% → ada sisa Rp 1 yang tidak habis dibagi. Kemana sisanya?

- **Opsi 1:** Ke investor dengan persentase terbesar
- **Opsi 2:** Ke akun perusahaan / retained earnings
- **Opsi 3:** *Round-robin* — bergiliran antar investor tiap distribusi supaya adil jangka panjang

> **Rekomendasi:** Opsi 2 (paling mudah dipertanggungjawabkan secara akuntansi dan tidak menimbulkan pertanyaan "kenapa investor A dapat lebih Rp 1"). Yang wajib dijamin: `SUM(semua entry) == net_profit` **persis**, tanpa selisih sepeser pun.

**Jawaban:**
opsi 2
---

### 🟢 A8. Satuan mata uang & presisi

- Apakah sistem single-currency (IDR saja) atau multi-currency?
- Presisi: bilangan bulat Rupiah, atau sampai 2 desimal?

> **Rekomendasi:** Single-currency IDR, disimpan sebagai **integer** dalam satuan terkecil (`BIGINT`), bukan `FLOAT`/`DOUBLE` — float pada nilai uang menyebabkan error pembulatan yang fatal di sistem finansial.

**Jawaban:**
single saja
---

### 🟢 A9. Bagaimana menangani refund / pembatalan transaksi?

Transaksi sudah selesai, profit sudah dibagi ke investor, lalu pelanggan minta refund.

- **Opsi 1:** Buat distribusi `REVERSAL` yang menegasikan entry sebelumnya (data lama tidak dihapus)
- **Opsi 2:** Tidak ada refund dalam scope sistem ini
- **Opsi 3:** Saldo negatif ditanggung investor pada distribusi berikutnya

> **Rekomendasi:** Opsi 1 kalau refund masuk scope; kalau tidak, opsi 2 dan saya catat sebagai *known limitation*. Yang penting: **jangan pernah DELETE atau UPDATE entry distribusi lama** — selalu buat baris penyeimbang baru (prinsip akuntansi *double-entry*).

**Jawaban:**
sesuai rekomendasi
---

## B. Directory Management / Identity

### 🔴 B1. Directory sebagai sumber data atau konsumen data?

Apakah sistem ini yang **memiliki** data karyawan, atau hanya **menerima sinkronisasi** dari sistem lain (Azure AD / Google Workspace)?

| Opsi | Perilaku |
|---|---|
| **1. System of Record** | Aplikasi ini yang jadi master data karyawan; CRUD karyawan penuh di sini |
| **2. Consumer / downstream** | Data karyawan disinkronkan dari Azure AD / Google Workspace via SCIM; aplikasi ini read-only terhadap data identitas |
| **3. Hybrid** | Identitas dasar (nama, email, foto) dari IdP eksternal; data spesifik aplikasi (jabatan di proyek, role investor) dikelola lokal |

> **Rekomendasi:** Opsi 3. Ini pola paling umum di korporat dan menjawab poin "Sinkronisasi Otomatis" di kebutuhan Anda: identitas ikut IdP (sehingga saat karyawan resign dan akunnya di-*disable* di AD, akses ke aplikasi ini ikut mati — memenuhi manfaat "Keamanan Data"), tapi atribut bisnis tetap milik aplikasi.

**Jawaban:**
opsi 3
---

### 🔴 B2. Metode autentikasi yang dipakai?

- **Opsi 1:** Email + password lokal (JWT) — paling sederhana, cukup untuk technical test
- **Opsi 2:** SSO via OIDC/SAML (Google Workspace, Azure AD, Okta)
- **Opsi 3:** Keduanya — SSO untuk karyawan internal, password lokal untuk investor eksternal

> **Rekomendasi:** Opsi 3 secara desain, **opsi 1 secara implementasi MVP**. Arsitekturnya saya rancang dengan *auth provider abstraction* (Passport strategy), jadi menambah OIDC nanti hanya berarti menambah satu strategy — bukan membongkar modul auth.

**Jawaban:**sesuai rekomendasi

---

### 🟡 B3. Model hierarki organisasi seperti apa?

Kebutuhan "Manajemen Hierarki" bisa berarti beberapa hal:

- **Opsi 1: Hierarki orang** — atasan-bawahan (`manager_id`), pohon reporting line
- **Opsi 2: Hierarki unit** — Perusahaan → Divisi → Departemen → Tim, karyawan menempel di unit
- **Opsi 3:** Keduanya (unit organisasi + reporting line yang bisa lintas unit)

> **Rekomendasi:** Opsi 3, disimpan dengan **closure table** (bukan sekadar `parent_id`). Alasannya: query "semua bawahan dari si A sampai level berapapun" atau "seluruh karyawan di bawah Divisi X" jadi satu query cepat, bukan rekursi berulang. Ini penting kalau hierarki dipakai untuk kontrol akses (misal manajer hanya boleh lihat transaksi timnya).

**Jawaban:**
opsi 3
---

### 🟡 B4. Apakah hierarki organisasi mempengaruhi hak akses?

Contoh: Manajer Divisi Sales hanya boleh melihat transaksi yang dibuat timnya sendiri, tidak semua transaksi.

- **Opsi 1:** Ya — RBAC + scoping berbasis posisi di hierarki
- **Opsi 2:** Tidak — hierarki hanya untuk ditampilkan (org chart), akses murni berbasis role global

> **Rekomendasi:** Opsi 2 untuk MVP. Opsi 1 (*hierarchy-aware authorization*) menambah kompleksitas signifikan pada setiap query dan sebaiknya jadi fase kedua — tapi saya siapkan kolom & closure table-nya sejak awal.

**Jawaban:**
opsi 2
---

### 🟡 B5. Apakah Investor = Karyawan, atau entitas terpisah?

Ini menentukan apakah `Investor` cukup jadi *role* pada tabel user, atau harus tabel sendiri.

- **Opsi 1:** Entitas terpisah — investor adalah pihak eksternal, tidak punya akun karyawan
- **Opsi 2:** Sama — investor adalah karyawan dengan role tambahan
- **Opsi 3:** Investor punya akun user (untuk login lihat dashboard), tapi profil investornya entitas terpisah

> **Rekomendasi:** Opsi 3. Pisahkan konsep **User** (identitas & kredensial login) dari **Investor** (entitas bisnis penerima bagi hasil). Investor bisa jadi perusahaan/badan hukum yang diwakili beberapa user — menggabungkan keduanya akan menyulitkan nanti.

**Jawaban:**
opsi 3
---

### 🟢 B6. Penyimpanan foto karyawan

- **Opsi 1:** Object storage (S3 / Vercel Blob / MinIO) + URL di database
- **Opsi 2:** Base64 di database — **tidak disarankan** (membengkakkan DB, memperlambat query)
- **Opsi 3:** Ambil dari IdP (Google/Microsoft profile picture)

> **Rekomendasi:** Opsi 1, dengan fallback opsi 3 saat sinkronisasi dari IdP.

**Jawaban:**
sesuai rekomendasi
---

## C. Pola Teknis & Persistensi

### 🔴 C1. Seberapa jauh Event Sourcing diterapkan?

- **Opsi 1: Full event sourcing** — semua entitas disimpan sebagai stream event
- **Opsi 2: Selektif** — hanya `ProfitDistribution` & `InvestorLedger` yang event-sourced (append-only); sisanya CRUD biasa
- **Opsi 3:** Tidak sama sekali, cukup audit log

> **Rekomendasi:** Opsi 2, dengan tegas. Full event sourcing pada modul directory/produk adalah *over-engineering* yang akan memperlambat pengembangan tanpa manfaat nyata. Tapi untuk **ledger keuangan**, sifat append-only itu bukan kemewahan melainkan keharusan — di sanalah nilainya benar-benar terasa (rekonsiliasi saldo, jejak audit anti-manipulasi).

**Jawaban:**
opsi 2
---

### 🟡 C2. CQRS — seberapa dalam?

- **Opsi 1:** Tidak sama sekali (satu model untuk read & write)
- **Opsi 2:** *Logical CQRS* — pemisahan command/query di level kode saja, database tetap satu
- **Opsi 3:** *Physical CQRS* — read model terpisah (Redis/Elasticsearch), dengan konsekuensi *eventual consistency*

> **Rekomendasi:** Opsi 2. Memberi 80% manfaat CQRS (kode rapi, terpisah, siap di-scale) dengan 10% kompleksitasnya, dan **tanpa** risiko *eventual consistency* yang berbahaya kalau salah tempat — bayangkan investor melihat saldo basi karena replikasi telat. Naik ke opsi 3 baru relevan kalau beban baca sudah terbukti jadi bottleneck.

**Jawaban:**
sesuai rekomendasi paling low risk dengan high efisiensi dan reward, tidak terbatas hanya di ops ini, anda bisa cari lainnya jika diperlukan
---

### 🟡 C3. Soft delete berlaku di mana saja?

- **Opsi 1:** Semua tabel
- **Opsi 2:** Hanya master data (produk, karyawan, investor, rule) — data transaksional & ledger memang tidak pernah dihapus sama sekali
- **Opsi 3:** Hanya di tabel yang bisa dihapus dari UI

> **Rekomendasi:** Opsi 2. Perlu ditegaskan: soft delete dan append-only itu **dua hal berbeda**. Master data pakai soft delete (bisa di-restore). Data finansial tidak punya operasi delete sama sekali — bahkan soft delete pun tidak — koreksi dilakukan lewat entri pembalik.

**Jawaban:**
opsi 2
---

### 🟢 C4. Idempotency key wajib di endpoint mana?

- **Opsi 1:** Semua endpoint `POST`
- **Opsi 2:** Hanya endpoint yang berdampak finansial (buat transaksi, trigger distribusi, payout)
- **Opsi 3:** Opsional — klien boleh kirim, server hormati kalau ada

> **Rekomendasi:** Opsi 2 sebagai **wajib** (server menolak request tanpa header `Idempotency-Key`), opsi 3 untuk endpoint lain. Mewajibkan di semua POST akan mengganggu *developer experience* tanpa manfaat sepadan.

**Jawaban:**
opsi 2
---

## D. Ruang Lingkup & Teknologi

### 🔴 D1. Scope deliverable technical test ini apa?

- **Opsi 1:** Dokumen arsitektur & desain saja (tanpa kode)
- **Opsi 2:** Backend API saja (+ dokumentasi + test)
- **Opsi 3:** Fullstack (backend + frontend admin dashboard)
- **Opsi 4:** Fullstack + deployment

**Jawaban:**
opsi 4
---

### 🔴 D2. Ada batasan teknologi dari pemberi test?

Apakah stack sudah ditentukan (misal "harus Laravel", "harus Node.js"), atau bebas memilih?

Kalau bebas, apakah ada preferensi Anda pribadi? (Ini mempengaruhi rekomendasi di `architecture.md` — saat ini saya merekomendasikan **NestJS + PostgreSQL + Prisma**, dengan alasan lengkap di dokumen tersebut.)

**Jawaban:**
bebas, sesuai rekomendasi anda yang paling bagus dan efisien
---

### 🟡 D3. Ada deadline / batas waktu pengerjaan?

Ini menentukan seberapa agresif *scope* MVP dipangkas dan pola mana yang layak diimplementasikan versus cukup didokumentasikan sebagai rencana.

**Jawaban:**
deadlinennya 40 jam dari sekarang
---

### 🟢 D4. Perkiraan skala sistem?

Berapa transaksi per hari, berapa investor, berapa karyawan? Ini menentukan apakah *physical CQRS*, *read replica*, atau *message queue* eksternal (RabbitMQ/Kafka) benar-benar dibutuhkan atau justru *premature optimization*.

> **Asumsi default saya:** skala menengah (< 100rb transaksi/hari), cukup dilayani modular monolith + PostgreSQL + in-process event bus.

**Jawaban:**
<200rb
---

## Ringkasan Prioritas

Kalau waktu Anda terbatas, **9 pertanyaan 🔴 ini saja** yang benar-benar memblokir desain final:

| ID | Inti Pertanyaan |
|---|---|
| A1 | Satu rule menang, atau beberapa rule digabung? |
| A2 | Total persentase wajib 100%? |
| A3 | Kalau tidak ada rule yang cocok, bagaimana? |
| B1 | Aplikasi ini master data karyawan, atau ikut IdP? |
| B2 | Login pakai apa? |
| C1 | Event sourcing seberapa jauh? |
| D1 | Deliverable-nya dokumen, backend, atau fullstack? |
| D2 | Stack-nya bebas atau sudah ditentukan? |

Sisanya sudah punya default yang aman dan bisa berjalan tanpa jawaban Anda.
