# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG VỚI DOCKER

Hệ thống Quét mã vạch Kho thông minh đã được đóng gói hoàn chỉnh bằng **Docker** & **Docker Compose**.

---

## 🚀 1. Khởi chạy nhanh bằng Docker Compose (Khuyên dùng)

### Bước 1: Khởi động hệ thống
Mở terminal tại thư mục gốc của dự án (`web_quet_ma_vach`) và chạy:

```bash
docker compose up -d --build
```

### Bước 2: Kiểm tra trạng thái Container
```bash
docker compose ps
```

### Bước 3: Xem Logs hoạt động Real-time
```bash
docker compose logs -f
```

### Bước 4: Dừng hệ thống
```bash
docker compose down
```

---

## 🌐 2. Địa chỉ truy cập các cổng dịch vụ

* 🖥️ **Trang Quản trị Admin Dashboard**: `http://[IP-MÁY-CHỦ]:3500`
* 📱 **Ứng dụng Quét mã Mobile Client**: `https://[IP-MÁY-CHỦ]:3031`

---

## 💾 3. Dữ liệu lưu trữ bền vững (Persistent Storage Volumes)

Toàn bộ dữ liệu được gắn kết (mount) trực tiếp từ máy chủ vào container để không bị mất khi khởi động lại:
* `./server/sqlite.db`: Cơ sở dữ liệu SQLite (Lịch sử quét, 18 danh mục sản phẩm, đơn hàng, tài khoản nhân viên).
* `./server/uploads/`: Thư mục lưu ảnh chụp tem nhãn lúc quét.
* `./server/key.pem & cert.pem`: Chứng chỉ SSL bảo mật HTTPS cho Camera Mobile.
