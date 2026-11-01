# Broker Point — Database Design

Versi: 1.0

## 1. Tujuan Database

Database Broker Point menggunakan Cloudflare D1 / SQLite. Database ini dirancang untuk menjalankan seluruh aktivitas bisnis produksi konveksi hijab, mulai dari pabrik, bahan, penjahit, produksi, inspeksi, repair, hingga penggajian dan pembayaran.

Prinsip utama:

- setiap transaksi memiliki ID unik
- data transaksi saling terhubung secara jelas
- riwayat transaksi dapat ditelusuri
- perubahan tarif tidak mengubah transaksi lama
- penghapusan data penting dibatasi
- kuantitas produk harus dapat direkonsiliasi di setiap tahap

## 2. Kelompok Tabel

### A. Akun dan Pengaturan

| Tabel | Fungsi |
| --- | --- |
| users | akun admin dan pengguna sistem |
| settings | pengaturan aplikasi |
| audit_logs | riwayat perubahan data |

### B. Data Master

| Tabel | Fungsi |
| --- | --- |
| factories | data pabrik |
| workers | data penjahit |
| product_models | data model hijab |
| product_colors | data warna |
| rate_cards | riwayat tarif produksi |

### C. Pesanan dan Bahan

| Tabel | Fungsi |
| --- | --- |
| factory_orders | pesanan dari pabrik |
| factory_order_items | item pesanan per model dan warna |
| material_receipts | penerimaan bahan |
| material_receipt_items | rincian bahan yang diterima |

### D. Distribusi dan Produksi

| Tabel | Fungsi |
| --- | --- |
| work_allocations | alokasi kerja ke penjahit |
| work_allocation_items | detail alokasi tiap item |
| sewing_outputs | setoran hasil jahitan |
| sewing_output_items | detail hasil jahitan |

### E. Pengiriman dan Pemeriksaan

| Tabel | Fungsi |
| --- | --- |
| factory_deliveries | pengiriman hasil ke pabrik |
| factory_delivery_items | item yang dikirim |
| factory_inspections | inspeksi kualitas |
| factory_inspection_items | hasil inspeksi per item |
| repair_cases | kasus perbaikan |
| repair_history | riwayat perbaikan |

### F. Keuangan

| Tabel | Fungsi |
| --- | --- |
| factory_payments | pembayaran dari pabrik |
| payroll_periods | periode penggajian |
| payroll_items | item komponen upah |
| worker_payments | pembayaran ke penjahit |
| worker_bon | bon pekerja |
| worker_bon_payments | pembayaran bon |
| business_expenses | pengeluaran usaha |

## 3. Hubungan Data Inti

### Pabrik dan Order

factory -> factory_orders -> factory_order_items

### Material dan Distribusi

material_receipts -> material_receipt_items -> work_allocation_items -> sewing_output_items

### Produksi dan Pengiriman

sewing_output_items -> factory_delivery_items -> factory_deliveries

### Inspeksi dan Perbaikan

factory_delivery_items -> factory_inspection_items -> repair_cases -> repair_history

### Penggajian dan Bon

payroll_periods -> payroll_items -> worker_payments
worker -> worker_bon -> worker_bon_payments

## 4. Aturan Produksi

Sistem harus membedakan tahap-tahap berikut dengan jelas:

1. bahan diterima
2. bahan didistribusikan
3. hasil disetor penjahit
4. hasil dikirim ke pabrik
5. hasil diterima pabrik
6. hasil ditolak
7. hasil masuk repair
8. hasil yang lolos inspeksi

Semua jumlah ini harus disimpan sebagai data transaksi yang terpisah. Tidak diperbolehkan satu kolom kuantitas saja yang berfungsi untuk semua tahapan produksi.

## 5. Aturan Tarif dan Upah

- tarif upah harus disimpan saat pekerjaan dibuat atau dialokasikan
- perubahan tarif berikutnya tidak boleh mengubah data upah pekerjaan lama
- setiap transaksi pembayaran harus berhubungan dengan dokumen asal
- barang yang masuk repair tidak boleh dihitung sebagai output yang siap dibayar dua kali

## 6. Aturan Pembayaran

- pembayaran pabrik dan pekerja harus ditangani secara terpisah
- setiap pembayaran harus menjadi transaksi sendiri
- saldo tagihan, bon, dan upah dihitung dari total yang tercatat

Rumus dasar:

- sisa tagihan = total tagihan - total pembayaran
- sisa bon = total bon - total cicilan
- sisa upah = upah bersih - total pembayaran pekerja

## 7. Aturan Penghapusan

- data master yang sudah dipakai sebaiknya dinonaktifkan, bukan dihapus mentah-mentah
- transaksi produksi dan finansial tidak boleh dihapus langsung jika sudah diproses
- koreksi harus meninggalkan jejak audit

## 8. Identitas Dokumen

Dokumen utama harus memiliki nomor unik yang mudah dibaca, misalnya:

- PO-2026-0001 = Pesanan pabrik
- MR-2026-0001 = Penerimaan bahan
- AL-2026-0001 = Alokasi kerja
- SO-2026-0001 = Setoran hasil jahitan
- FD-2026-0001 = Pengiriman pabrik
- IN-2026-0001 = Inspeksi pabrik
- RP-2026-0001 = Repair
- PAY-2026-0001 = Pembayaran pabrik
- WPAY-2026-0001 = Pembayaran pekerja
- BON-2026-0001 = Bon pekerja

## 9. Teknik SQLite / D1

- gunakan foreign key
- aktifkan foreign key untuk setiap koneksi database
- gunakan transaksi untuk operasi multi-tabel
- tentukan indeks pada kolom pencarian dan foreign key
- gunakan format ISO 8601 untuk tanggal
- simpan nominal uang sebagai INTEGER dalam rupiah
- simpan kuantitas sebagai INTEGER
- gunakan status yang konsisten di seluruh database

## 10. Catatan Implementasi

Database ini dibuat agar bisa digunakan sebagai fondasi untuk:

- aplikasi backend
- dashboard admin
- API produksi
- laporan keuangan
- monitoring kualitas dan repair

Semua validasi kuantitatif, pengendalian double count, dan rekonsiliasi pembayaran harus dijalankan di layer backend sebelum sistem dipakai untuk operasional nyata.
