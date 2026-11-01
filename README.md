# Broker Point

Broker Point adalah sistem manajemen operasional dan produksi untuk bisnis broker konveksi hijab. Platform ini dirancang untuk mengelola hubungan dengan pabrik, penjahit, bahan baku, pesanan, produksi, pengiriman, inspeksi kualitas, repair, penggajian, bon, serta pembayaran dan pengeluaran usaha.

## Tujuan

Broker Point dibuat untuk membantu bisnis menjalankan proses produksi secara terstruktur dan terdokumentasi:

- mengelola data pabrik dan penjahit
- mengelola pesanan dan bahan masuk
- mendistribusikan pekerjaan ke penjahit
- mencatat hasil produksi dan pengiriman
- memantau inspeksi kualitas dan kasus perbaikan
- menghitung upah pekerja dan bon
- mencatat pembayaran pabrik serta pengeluaran operasional
- menjaga riwayat perubahan melalui audit log

## Fokus Bisnis

Sistem ini fokus pada aliran kerja produksi konveksi hijab:

1. Pabrik membuat pesanan
2. Bahan diterima dan dicatat
3. Pekerjaan didistribusikan ke penjahit
4. Hasil jahitan disetor dan dicatat
5. Barang dikirim ke pabrik
6. Pabrik melakukan inspeksi
7. Barang yang rusak masuk ke proses repair
8. Upah, bon, dan pembayaran dihitung secara terpisah
9. Laporan dibuat untuk monitoring operasional dan keuangan

## Struktur Repo

```bash
broker-point/
├── README.md
├── docs/
│   ├── BLUEPRINT.md
│   ├── DATABASE_DESIGN.md
│   ├── ROADMAP.md
│   └── API.md
├── database/
│   ├── schema.sql
│   └── seed.sql
└── .gitignore
```

## Dokumentasi

- `docs/BLUEPRINT.md` — arsitektur dan cakupan bisnis
- `docs/DATABASE_DESIGN.md` — desain database dan aturan bisnis
- `docs/ROADMAP.md` — roadmap pengembangan
- `docs/API.md` — blueprint API utama

## Teknologi yang Dipakai

- Cloudflare D1 / SQLite
- SQL schema terstruktur
- Arsitektur modular untuk backend dan aplikasi
- Bahasa/stack backend dapat dikembangkan sesuai kebutuhan (Node.js, TypeScript, atau framework yang sesuai)

## Prinsip Data

- setiap transaksi utama memiliki dokumen unik
- data lama tidak diubah saat tarif berubah
- semua saldo dihitung dari transaksi, bukan dari data yang dimodifikasi
- seluruh perubahan penting disimpan di audit log
- penghapusan data master dibatasi, bukan dilakukan untuk data produksi yang sudah masuk alur kerja

## Status

Project ini masih dalam tahapan awal struktur data dan arsitektur dasar.

## Lisensi

Belum ditentukan. Silakan tambahkan lisensi bila proyek akan dipublikasikan atau digunakan untuk distribusi resmi.
