# Broker Point Blueprint

## 1. Ringkasan Proyek
Broker Point adalah sistem manajemen operasional untuk bisnis broker produksi konveksi hijab. Fokus utama sistem ini adalah mengelola hubungan antara broker, pabrik, penjahit, bahan baku, pesanan, dan pembayaran produksi.

Sistem ini dirancang untuk menangani alur kerja dari awal pesanan sampai pembayaran akhir, termasuk inspeksi kualitas, repair, penggajian, bon pekerja, dan pencatatan pengeluaran usaha.

## 2. Tujuan Bisnis

- Menghubungkan pabrik, penjahit, dan admin dalam satu alur produksi yang terdokumentasi
- Menjaga data pesanan, bahan, output, dan pengiriman tetap konsisten
- Memudahkan tracking status produksi dari awal sampai selesai
- Menghindari kebingungan data akibat perubahan tarif atau revisi transaksi
- Menyediakan basis data yang siap dikembangkan ke dashboard, laporan, dan aplikasi web/mobile

## 3. User Utama

### Admin
- mengelola user dan konfigurasi
- melihat seluruh data operasional
- meninjau laporan dan transaksi
- mengatur sistem dan data master

### Manager / Koordinator
- melihat progress produksi
- memantau alokasi pekerjaan
- mengontrol jadwal dan kualitas output
- menilai kesiapan pengiriman

### Penjahit
- menerima alokasi pekerjaan
- mencatat hasil output
- memantau status pekerjaan dan hasil kerja

### Pabrik
- menerima data pesanan dan pengiriman
- memeriksa kualitas barang
- mengikuti status produksi dan hasil akhir

## 4. Cakupan Fungsional

### A. Data Master
- pabrik
- pekerja
- model produk
- warna produk
- tarif produksi

### B. Pesanan dan Material
- pesanan dari pabrik
- rincian item pesanan
- penerimaan bahan dan penggunaan bahan

### C. Produksi
- alokasi kerja ke penjahit
- setoran hasil jahitan
- pengiriman hasil ke pabrik
- inspeksi kualitas
- repair dan riwayat perbaikan

### D. Keuangan
- pembayaran pabrik
- periode penggajian
- pembayaran pekerja
- bon pekerja
- pengeluaran usaha

### E. Monitoring dan Audit
- log perubahan data
- riwayat transaksi
- status dokumen dan tahapan kerja
- rekonsiliasi data produksi dan finansial

## 5. Prinsip Operasional

- Tiap dokumen dan transaksi harus memiliki identitas unik
- Jumlah bahan dan hasil produksi disimpan sebagai transaksi terpisah, bukan satu nilai agregat
- Tarif upah yang sudah berlaku tidak boleh berubah secara otomatis untuk pekerjaan lama
- Pengiriman dan hasil produksi harus memiliki pengecekan kualitas sebelum finalisasi
- Pembayaran pabrik, upah pekerja, dan bon dipisahkan agar rekonsiliasi jelas
- Semua perubahan signifikan dicatat di audit log

## 6. Arsitektur Sistem

### Layer 1: Presentation Layer
- dashboard admin
- dashboard produksi
- dashboard keuangan
- modul laporan

### Layer 2: Application Layer
- API untuk autentikasi
- service untuk produksi, produksi, inspeksi, dan keuangan
- validasi aturan bisnis
- pengolahan transaksi multi-tabel

### Layer 3: Data Layer
- database D1 / SQLite
- tabel master
- tabel transaksi
- tabel log audit

## 7. Flow Produksi Inti

1. Pabrik mengirim pesanan
2. Bahan masuk dicatat ke material_receipts
3. Pekerjaan dialokasikan ke penjahit
4. Penjahit menyetor hasil jahitan
5. Hasil dikirim ke pabrik
6. Pabrik memeriksa kualitas
7. Barang rusak masuk ke repair_cases
8. Hasil yang layak masuk ke pembayaran dan penggajian

## 8. Aturan Bisnis Kunci

- satu order bisa mempunyai banyak item
- satu material receipt bisa memuat banyak item bahan
- satu allocation bisa terhubung ke banyak pekerjaan output
- satu delivery bisa punya banyak item pengiriman
- satu inspection bisa memuat banyak item yang diterima, ditolak, atau perlu repair
- satu worker bisa punya banyak bon dan pembayaran
- pembayaran dilakukan per dokumen, bukan hanya satu total akhir

## 9. Target MVP

Minimum viable product yang sebaiknya dibangun pertama:

- data master pabrik, pekerja, produk, warna
- pesanan pabrik
- penerimaan material
- alokasi kerja
- setoran hasil jahitan
- pengiriman dan inspeksi
- repair cases
- payroll dan bon
- laporan dasar

## 10. Roadmap

### Phase 1: Fondasi
- setup repo dan struktur project
- desain database dan skema awal
- master data pabrik, pekerja, model, warna

### Phase 2: Produksi
- factory orders
- material receipts
- work allocation
- sewing outputs
- factory deliveries

### Phase 3: Quality & Repair
- inspection
- repair management
- exception handling
- reconciliation

### Phase 4: Finance
- payroll
- worker payments
- factory payments
- worker bon
- business expenses

### Phase 5: Monitoring
- dashboard
- laporan harian dan bulanan
- export data
- audit dan keamanan

## 11. Risiko dan Catatan

- perubahan tarif harus disimpan sebagai historis, bukan mengganti data lama secara otomatis
- validasi kuantitas harus dilakukan sebelum transaksi final
- pengiriman dan repair harus dipisahkan agar tidak terjadi double count
- semua perubahan finansial harus diaudit

## 12. Kesimpulan

Broker Point perlu dibangun sebagai sistem produksi yang terstruktur, transparan, dan terdokumentasi dengan baik. Fungsi utama sistem bukan sekadar catalog atau daftar, tetapi aliran produksi yang lengkap dari pesanan hingga pembayaran.

Infrastruktur data harus dibuat agar dapat mendukung operasional nyata, bukan hanya demo statis.
