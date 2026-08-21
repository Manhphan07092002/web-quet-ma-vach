# 📦 Hệ Thống Quét Mã Vạch & Kiểm Kê Kho Thông Minh (Barcode Scanner & Warehouse Inventory System)

Ứng dụng Web Quét mã vạch (1D), QR Code (2D) và Nhận diện AI OCR Serial/IMEI chuyên dụng cho hoạt động kiểm kê kho hàng, quản lý đơn hàng xuất nhập kho và theo dõi tiến độ Real-time.

---

## 🌟 Tính Năng Nổi Bật

### 📱 1. Mobile Scanner Client (`https://[IP]:3031`)
* ⚡ **Đa chế độ quét**:
  * **1D Barcode**: Hỗ trợ Code 128, Code 39, EAN-13, UPC...
  * **2D QR Code**: Hỗ trợ QR Code, Data Matrix.
  * **AI OCR (Tesseract.js)**: Nhận diện chữ in Serial Number / IMEI khi mã vạch mờ, trầy xước.
* 📱 **Tối ưu Mobile Pixel-Perfect (iPhone 13 Pro Max / iOS Safari / Android)**:
  * Camera nằm trọn trong 1 màn hình, chống tràn hình 100%.
  * Tùy chọn Quét liên tục (Continuous mode) & Bật đèn Flash.
* 🔊 **Âm thanh & Rung phản hồi (Haptic & Audio)**:
  * Tiếng "BÍP" sắc nét chuẩn máy quét chuyên dụng Zebra/Honeywell (2400Hz).
  * Rung xúc giác chân thực ngay khi bắt được mã.
* 📶 **Chế độ Offline First**:
  * Tự động lưu tạm các mã quét vào hàng đợi khi mất mạng và tự động đồng bộ lên server khi có mạng lại.
* 📦 **Chọn Đơn Hàng & Đổi Tên Sản Phẩm**:
  * Chọn đơn hàng cần kiểm đếm và xem Checklist tiến độ trực tiếp trên điện thoại.
  * Đổi / Tìm kiếm sản phẩm thông minh kèm nút Lưu và hỗ trợ phím Enter.

---

### 🖥️ 2. Admin Dashboard Quản Trị (`http://localhost:3500`)
* 📊 **Thống kê & KPI Real-time (Server-Sent Events - SSE)**:
  * Biểu đồ xu hướng quét theo ngày, phân bố danh mục thiết bị, tiến độ đơn hàng và năng suất từng nhân viên.
* 📋 **Lịch sử quét mã Real-time**:
  * Xem ảnh chụp bằng chứng khi quét.
  * Hiển thị rõ cột **Nhân viên**, Đơn hàng, Thiết bị, Thời gian.
  * Chỉnh sửa, xóa và xuất dữ liệu ra file Excel (.xlsx).
* 📑 **Quản lý Đơn hàng & Tiến độ**:
  * Tạo, chỉnh sửa đơn hàng, thiết lập danh sách sản phẩm yêu cầu, theo dõi thanh tiến độ % hoàn thành và xuất biên bản bàn giao Excel.
* 🏷️ **Danh mục 18 Sản phẩm thiết bị mạng & Tự học (Self-Learning)**:
  * Switch, Router, Firewall, Wifi, SFP Quang...
  * Nhập / Xuất Excel danh mục sản phẩm.
  * Tự động ghi nhớ quy tắc tiền tố / Serial để tự động nhận diện chính xác.
* 🛡️ **Phân quyền truy cập 3 cấp (Role-Based Access Control - RBAC)**:
  * 👑 **Admin**: Toàn quyền hệ thống, quản lý nhân sự, xóa lịch sử.
  * 🏢 **Manager (Quản lý kho)**: Tạo/sửa đơn hàng, xem báo cáo, xem danh mục (khóa xóa lịch sử và sửa user).
  * 📱 **Scanner (Nhân viên)**: Chỉ sử dụng trên ứng dụng Mobile Client.

---

## 🛠️ Cài Đặt & Chạy Ứng Dụng

### Cách 1: Chạy bằng Docker Compose (Khuyên dùng)
```bash
docker compose up -d --build
```
* **Admin Web**: `http://localhost:3500`
* **Mobile Client**: `https://localhost:3031` (hoặc `https://[IP-LAN]:3031`)

### Cách 2: Chạy trực tiếp với Node.js
```bash
cd server
npm install
npm start
```

---

## 🔑 Tài Khoản Đăng Nhập Mẫu

| Tài khoản | Username | Password / PIN | Vai trò |
|---|---|---|---|
| 👑 Admin | `admin` | `1234` | Quản trị viên tối cao |
| 🏢 Quản lý kho | `qlkho` | `1234` | Quản lý kiểm kê & Đơn hàng |
| 📱 Nhân viên ca 1 | `nvkho1` | `1234` | Nhân viên quét kho |
| 📱 Nhân viên ca 2 | `nvkho2` | `1234` | Nhân viên quét kho |

---

## 📜 Giấy Phép
Dự án phát triển mã nguồn mở phục vụ quản lý kho thông minh.
