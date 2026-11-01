# BROKER POINT — DATABASE DESIGN

Versi: 1.0

## 1. TUJUAN DATABASE

Database Broker Point menggunakan Cloudflare D1 dengan SQLite.

Database dirancang untuk menyimpan seluruh aktivitas usaha broker produksi konveksi hijab.

Prinsip utama:

- Setiap transaksi memiliki ID unik.
- Data transaksi saling terhubung.
- Riwayat transaksi harus dapat ditelusuri.
- Data lama tidak berubah ketika tarif diperbarui.
- Penghapusan data penting harus dibatasi.
- Jumlah barang harus dapat direkonsiliasi.

## 2. KELOMPOK TABEL

Database dibagi menjadi beberapa kelompok.

### A. Akun dan Pengaturan

| Tabel | Fungsi |
|---|---|
| users | Akun administrator |
| settings | Pengaturan aplikasi |
| audit_logs | Riwayat perubahan data |

### B. Data Utama

| Tabel | Fungsi |
|---|---|
| factories | Data pabrik |
| workers | Data penjahit |
| product_models | Data model hijab |
| product_colors | Data warna |
| rate_cards | Riwayat tarif produksi |

### C. Pesanan dan Bahan

| Tabel | Fungsi |
|---|---|
| factory_orders | Pesanan dari pabrik |
| factory_order_items | Rincian model dalam pesanan |
| material_receipts | Penerimaan potongan |
| material_receipt_items | Rincian bahan yang diterima |

### D. Distribusi dan Produksi

| Tabel | Fungsi |
|---|---|
| work_allocations | Distribusi pekerjaan |
| work_allocation_items | Rincian distribusi |
| sewing_outputs | Setoran hasil jahitan |
| sewing_output_items | Rincian hasil setoran |

### E. Pengiriman dan Pemeriksaan

| Tabel | Fungsi |
|---|---|
| factory_deliveries | Pengiriman ke pabrik |
| factory_delivery_items | Rincian pengiriman |
| factory_inspections | Pemeriksaan pabrik |
| factory_inspection_items | Hasil pemeriksaan per barang |
| repair_cases | Kasus perbaikan |
| repair_history | Riwayat perbaikan |

### F. Keuangan

| Tabel | Fungsi |
|---|---|
| factory_payments | Pembayaran dari pabrik |
| payroll_periods | Periode penggajian |
| payroll_items | Rincian upah penjahit |
| worker_payments | Pembayaran kepada penjahit |
| worker_bon | Bon atau tanggungan |
| worker_bon_payments | Pembayaran cicilan bon |
| business_expenses | Pengeluaran usaha |

## 3. HUBUNGAN DATA

### Pabrik

Satu pabrik dapat memiliki banyak pesanan.

factory
  └── factory_orders
        └── factory_order_items

### Penjahit

Satu penjahit dapat memiliki banyak distribusi pekerjaan.

worker
  └── work_allocations
        └── work_allocation_items

### Produksi

Distribusi pekerjaan menjadi dasar setoran hasil jahitan.

work_allocation_items
  └── sewing_output_items

### Pengiriman

Hasil jahitan dapat digabungkan ke dalam satu pengiriman pabrik.

sewing_output_items
  └── factory_delivery_items
        └── factory_deliveries

### Pemeriksaan

Setiap pengiriman dapat diperiksa dan memiliki beberapa hasil pemeriksaan.

factory_deliveries
  └── factory_inspections
        └── factory_inspection_items

### Perbaikan

Barang yang perlu diperbaiki memiliki kasus dan riwayat tersendiri.

factory_inspection_items
  └── repair_cases
        └── repair_history

### Penggajian

Upah dihitung berdasarkan hasil yang memenuhi syarat pembayaran.

payroll_periods
  └── payroll_items
        └── worker_payments

### Bon

Satu penjahit dapat memiliki banyak bon.

worker
  └── worker_bon
        └── worker_bon_payments

## 4. ATURAN JUMLAH PRODUKSI

Sistem harus membedakan jumlah berikut:

1. Jumlah bahan diterima.
2. Jumlah bahan didistribusikan.
3. Jumlah hasil disetor penjahit.
4. Jumlah hasil dikirim ke pabrik.
5. Jumlah hasil diterima pabrik.
6. Jumlah hasil ditolak.
7. Jumlah hasil perlu perbaikan.
8. Jumlah hasil yang telah lolos pemeriksaan.

Semua jumlah harus disimpan sebagai transaksi terpisah.

Jangan menggunakan satu kolom jumlah untuk mewakili seluruh tahapan produksi.

## 5. ATURAN PENGHITUNGAN UPAH

Tarif upah harus disalin sebagai nilai tarif transaksi ketika pekerjaan dibuat atau dialokasikan.

Perubahan tarif berikutnya tidak boleh mengubah upah pekerjaan lama.

Setiap unit produksi yang dibayar harus memiliki referensi asal dan status kelayakan pembayaran.

Barang perbaikan tidak boleh menghasilkan pembayaran upah produksi kedua untuk unit yang sama.

## 6. ATURAN PEMBAYARAN

Pembayaran pabrik dan penjahit harus mendukung pembayaran sebagian.

Setiap pembayaran merupakan transaksi tersendiri.

Sistem menghitung:

Sisa tagihan = Total tagihan - Total pembayaran yang tercatat.

Sisa bon = Total bon - Total cicilan yang tercatat.

Sisa upah = Upah bersih - Total pembayaran upah.

## 7. ATURAN PENGHAPUSAN

Data master yang sudah digunakan transaksi sebaiknya dinonaktifkan, bukan dihapus.

Transaksi keuangan dan produksi yang telah diproses tidak boleh dihapus langsung.

Koreksi transaksi harus meninggalkan jejak audit.

## 8. IDENTITAS TRANSAKSI

Setiap transaksi utama harus mempunyai nomor dokumen yang mudah dibaca.

Contoh:

- PO-2026-0001: Pesanan pabrik.
- MR-2026-0001: Penerimaan bahan.
- AL-2026-0001: Distribusi pekerjaan.
- SO-2026-0001: Setoran hasil.
- FD-2026-0001: Pengiriman pabrik.
- IN-2026-0001: Pemeriksaan.
- RP-2026-0001: Perbaikan.
- PAY-2026-0001: Pembayaran.
- BON-2026-0001: Bon penjahit.

Nomor dokumen harus unik dan tidak digunakan ulang.

## 9. KETENTUAN TEKNIS SQLITE

- Gunakan foreign key.
- Aktifkan foreign key pada setiap koneksi database.
- Gunakan transaksi database untuk operasi yang mengubah beberapa tabel sekaligus.
- Gunakan indeks pada kolom pencarian dan foreign key.
- Gunakan tanggal dalam format ISO 8601.
- Simpan nominal uang sebagai INTEGER dalam rupiah.
- Simpan jumlah barang sebagai INTEGER.
- Gunakan status yang konsisten.
- Hindari penghitungan saldo dengan mengubah nilai transaksi lama.

## 10. PENGEMBANGAN SELANJUTNYA

Setelah rancangan ini selesai, database akan dibuat dalam:

database/schema.sql

Data awal dan contoh pengujian akan ditempatkan dalam:

database/seed.sql

Struktur tabel harus mengikuti rancangan bisnis dan mendukung pengembangan seluruh modul Broker Point.
