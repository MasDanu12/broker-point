# Broker Point API Blueprint

## Base URL

- Development: `http://localhost:3000/api`
- Production: `${BASE_URL}/api`

## Format Respon

### Sukses

```json
{
  "success": true,
  "data": {},
  "message": "Operasi berhasil"
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input tidak valid"
  }
}
```

## Autentikasi

Semua endpoint yang dilindungi memerlukan token JWT pada header:

```http
Authorization: Bearer <token>
```

## Modul Utama

### 1. Auth
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

### 2. User Management
- `GET /users`
- `GET /users/:id`
- `POST /users`
- `PUT /users/:id`
- `DELETE /users/:id`

### 3. Factories
- `GET /factories`
- `GET /factories/:id`
- `POST /factories`
- `PUT /factories/:id`
- `DELETE /factories/:id`

### 4. Workers
- `GET /workers`
- `GET /workers/:id`
- `POST /workers`
- `PUT /workers/:id`
- `DELETE /workers/:id`

### 5. Product Catalog
- `GET /product-models`
- `GET /product-colors`
- `POST /product-models`
- `POST /product-colors`

### 6. Rate Cards
- `GET /rate-cards`
- `POST /rate-cards`
- `PUT /rate-cards/:id`

### 7. Factory Orders
- `GET /factory-orders`
- `GET /factory-orders/:id`
- `POST /factory-orders`
- `PUT /factory-orders/:id`
- `DELETE /factory-orders/:id`

### 8. Material Receipts
- `GET /material-receipts`
- `GET /material-receipts/:id`
- `POST /material-receipts`
- `PUT /material-receipts/:id`

### 9. Work Allocation
- `GET /work-allocations`
- `GET /work-allocations/:id`
- `POST /work-allocations`
- `PUT /work-allocations/:id`

### 10. Sewing Outputs
- `GET /sewing-outputs`
- `GET /sewing-outputs/:id`
- `POST /sewing-outputs`
- `PUT /sewing-outputs/:id`

### 11. Factory Deliveries
- `GET /factory-deliveries`
- `GET /factory-deliveries/:id`
- `POST /factory-deliveries`
- `PUT /factory-deliveries/:id`

### 12. Factory Inspections
- `GET /factory-inspections`
- `GET /factory-inspections/:id`
- `POST /factory-inspections`
- `PUT /factory-inspections/:id`

### 13. Repair Cases
- `GET /repair-cases`
- `GET /repair-cases/:id`
- `POST /repair-cases`
- `PUT /repair-cases/:id`

### 14. Factory Payments
- `GET /factory-payments`
- `POST /factory-payments`

### 15. Payroll
- `GET /payroll-periods`
- `POST /payroll-periods`
- `GET /payroll-items`
- `POST /payroll-items`
- `GET /worker-payments`
- `POST /worker-payments`

### 16. Worker Bon
- `GET /worker-bon`
- `POST /worker-bon`
- `GET /worker-bon-payments`
- `POST /worker-bon-payments`

### 17. Business Expenses
- `GET /business-expenses`
- `POST /business-expenses`

## Catatan Implementasi Penting

- seluruh nominal uang memakai INTEGER dalam satuan rupiah
- kuantitas barang memakai INTEGER
- data produksi tidak boleh dilakukan double count
- pengiriman, inspection, repair, dan pembayaran harus diproses dengan validasi backend
- transaksi keuangan dan transaksi produksi harus dipisahkan secara jelas
- perubahan tarif lama tidak boleh mengubah dokumen yang sudah diproses

## Status API

API ini masih dalam tahap blueprint awal. Implementasi backend harus ditambahkan setelah struktur data database selesai dibuat dan diuji.
