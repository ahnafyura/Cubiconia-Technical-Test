# Profit Sharing Platform

Sistem transaksi dengan **skema pembagian keuntungan dinamis**: administrator mengatur aturan bagi hasil, dan setiap transaksi yang selesai langsung didistribusikan otomatis ke investor sesuai aturan yang berlaku saat itu — tanpa memengaruhi transaksi yang sudah berjalan.

## Menjalankan

```bash
pnpm install
docker compose up -d postgres

cd apps/api
pnpm exec prisma migrate deploy
pnpm exec tsx prisma/seed.ts
pnpm dev                      # API  → http://localhost:4000/api

cd ../web
pnpm dev                      # Web  → http://localhost:3100
```

Buka **http://localhost:3100** — kolom login sudah terisi.

| Akun | Kata sandi | Peran |
|---|---|---|
| `admin@contoh.id` | `demo1234` | Admin keuangan — semua izin |
| `sales@contoh.id` | `demo1234` | Ops penjualan — **tanpa** izin menyetujui |
| `hr@contoh.id` | `demo1234` | Admin direktori — kelola karyawan & unit organisasi |
| `investor1@contoh.id` | `demo1234` | Investor — diarahkan otomatis ke portalnya sendiri |

## Alur demo, 5 menit

1. **Transaksi** → pilih transaksi berstatus *Draf*, klik **Selesaikan**.
   Distribusi tidak dihitung langsung di sana — event masuk *outbox*, poller mengambilnya beberapa detik kemudian. Refresh, kolom "Bagi hasil" terisi.

2. **Distribusi** → buka salah satunya. Ini layar intinya: **air terjun** yang menunjukkan laba mengalir turun lewat lapisan aturan, lengkap dengan dasar hitung tiap lapisan dan sisa setelahnya. Blok penutup selalu membuktikan `dibagikan + ditahan = laba bersih`. Tombol **Unduh resi PDF** menghasilkan bukti distribusi bervektor asli (bukan screenshot).

3. **Aturan → + Aturan baru** → panel simulasi di sebelah kanan menampilkan rantai aturan yang **sudah aktif** untuk kondisi yang Anda pilih. Ubah kategori atau nominal laba; pratinjau ikut berubah seketika.

4. **Uji izin** → keluar, masuk sebagai `sales@contoh.id`, coba setujui distribusi. Ditolak dengan `Butuh izin: distribution:approve`.

5. **Portal investor** → keluar, masuk sebagai `investor1@contoh.id`. Diarahkan otomatis ke `/portal` (bukan shell admin) — saldo, tren, dan mutasi yang tampil **hanya** milik investor ini; klik "kenapa segini?" pada satu mutasi untuk lihat rincian lapisan perhitungannya, lalu unduh resi PDF versi investor (cuma memuat porsinya sendiri, tidak ada data investor lain di dalamnya).

6. **Direktori & Bagan** → dari akun admin/HR, buka **Direktori → Bagan**. Struktur organisasi digambar sebagai pohon dengan garis penghubung melengkung berwarna per cabang divisi; klik kartu mana pun untuk melihat karyawan sungguhan di unit itu.

### Tiga perilaku yang layak diperhatikan

- **`TRX` Elektronik** → 2 lapisan. Aturan "Dasar Semua Produk" (20% dari *sisa berjalan*) lalu "Kategori Elektronik" (30% dari *laba awal*). Dasar hitungnya berbeda — itulah kenapa setiap lapisan menuliskannya eksplisit.
- **`TRX` Server Rack** (laba > Rp 50 jt) → **1 lapisan**. Aturan "Laba Besar" bertanda `stackable = false`, sehingga menutup rantai. Perilaku *winner-takes-all* muncul dari mekanisme yang sama, bukan cabang kode terpisah.
- **Distribusi ≥ Rp 5 jt** masuk `PENDING_APPROVAL`; di bawah itu langsung `SETTLED`. Ledger baru ditulis setelah disetujui.

## Dokumen

| File | Isi |
|---|---|
| [`study-case.md`](./study-case.md) | Pembedahan studi kasus & keputusan desain |
| [`architecture.md`](./architecture.md) | Arsitektur, struktur folder, skema, API |
| [`open-q.md`](./open-q.md) | Pertanyaan terbuka + jawaban yang menentukan desain |
| [`design.md`](./design.md) | Sistem desain terkunci (token, tipografi, aturan uang) |
| [`ux-spec.md`](./ux-spec.md) | Wireframe & rasional per layar |
| [`summary-context.md`](./summary-context.md) | Rangkuman pohon-masalah lengkap — bahan mentah untuk pitch deck |

## Yang membuat sistem ini bisa dipercaya

**Aturan berlapis (composable).** Beberapa aturan bisa berlaku bersamaan; laba mengalir melewati rantai terurut. Satu mekanisme (`stackable` + `basis`) melayani tiga kebutuhan: aturan tunggal, komposisi berlapis, dan mode hybrid.

**Snapshot saat eksekusi.** Setiap lapisan menyimpan salinan utuh aturan pada detik distribusi terjadi. Mengubah aturan hari ini tidak menggeser sepeser pun angka transaksi kemarin — inilah janji utama studi kasus, dan ada tes regresi yang menjaganya.

**Uang tidak pernah menyentuh `float`.** Seluruh nominal `BigInt` dalam satuan terkecil, persentase dalam *basis point*. Dijamin invarian `dibagikan + ditahan = laba bersih` — diuji terhadap 2.000 kombinasi acak nominal & persentase, tempat bug pembulatan benar-benar bersembunyi.

**Append-only ditegakkan database.** Trigger PostgreSQL menolak `UPDATE`/`DELETE` pada ledger dan lapisan distribusi, serta melarang nominal distribusi maupun isi aturan diubah. Bukan no-op senyap — melempar exception, karena kalau ada yang mencoba mengubah ledger, sistem harus berteriak.

**Outbox, bukan panggilan langsung.** Event distribusi ditulis dalam transaksi database yang sama dengan perubahan datanya. Kalau proses mati tepat setelah commit, event tetap menunggu dan diproses saat hidup lagi — tidak ada transaksi tercatat yang profitnya hilang.

**Privasi investor ditegakkan di server, bukan disembunyikan di UI.** Endpoint `investors/me/*` menyaring data investor lain di level query database — datanya tidak pernah meninggalkan database, jadi tidak bisa bocor lewat devtools sekalipun. Meminta distribusi milik investor lain mengembalikan `404`, bukan array kosong (array kosong pun sudah membocorkan bahwa distribusinya ada). Identitas investor selalu diturunkan dari `sub` di JWT, tidak pernah dari parameter URL.

**Satu sumber kebenaran untuk navigasi & izin.** `lib/nav.ts` dan `lib/permissions.tsx` di frontend adalah satu-satunya tempat aturan "siapa boleh lihat apa" didefinisikan, dipakai baik oleh halaman login (menentukan tujuan pertama) maupun shell admin (render sidebar + jaga halaman). Ini perbaikan langsung dari bug nyata yang ditemukan mid-pengembangan: logika itu sebelumnya diduplikasi di dua tempat dan sempat membuat peran `ops_penjualan` over-privileged sebelum ketahuan.

## Tes

```bash
cd apps/api && pnpm exec vitest run
```

15 tes pada logika domain — berjalan tanpa database, tanpa framework.

## Status

Sudah jalan: fondasi, skema, pipeline bagi hasil, outbox, auth + RBAC, approval, ledger, layar admin lengkap (dashboard, transaksi, aturan, distribusi, direktori karyawan + bagan organisasi interaktif), portal investor penuh (ringkasan, tren, mutasi, *explain* per distribusi), resi PDF (versi admin & investor, privasi terjaga per peran), dan tema visual "Skyline" (redesign penuh dari draf tema gelap awal, disesuaikan lewat putaran umpan balik pengguna asli — lihat [`summary-context.md`](./summary-context.md) untuk kronologinya).

Belum: pencairan periodik (`PayoutBatch` sudah ada di skema), sinkronisasi IdP, dan deployment.

## Konteks lebih dalam

[`summary-context.md`](./summary-context.md) merangkai seluruh dokumen di atas jadi satu narasi pohon-masalah: dari kalimat studi kasus asli, konstrain 40 jam yang sebenarnya, sampai bottleneck teknis tak terduga yang ditemukan sepanjang pengembangan (termasuk beberapa gotcha CSS/browser yang jarang diketahui). Ditulis sebagai bahan mentah untuk pitch deck atau onboarding kontributor baru, bukan dokumentasi yang dibaca sistem.
