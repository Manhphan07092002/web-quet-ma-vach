const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "scanner.db");
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_code TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  model TEXT,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_id TEXT UNIQUE NOT NULL,
  raw_data TEXT NOT NULL,
  code_type TEXT,
  product_code TEXT,
  product_name TEXT,
  serial_number TEXT,
  device_id TEXT,
  user_name TEXT,
  scanned_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_code TEXT NOT NULL,
  pattern TEXT UNIQUE NOT NULL,
  pattern_type TEXT DEFAULT 'prefix',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT UNIQUE NOT NULL,
  order_name TEXT NOT NULL,
  customer_name TEXT,
  status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed'
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_expected INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT DEFAULT '1234',
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'scanner', -- 'admin', 'manager', 'scanner'
  pin_code TEXT DEFAULT '1234',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Thêm cột order_code vào bảng scans nếu chưa có
try {
  db.exec("ALTER TABLE scans ADD COLUMN order_code TEXT;");
} catch (e) {
  // Đã có cột order_code
}

// Thêm cột password vào bảng users nếu chưa có
try {
  db.exec("ALTER TABLE users ADD COLUMN password TEXT DEFAULT '1234';");
} catch (e) {
  // Đã có cột password
}

// Nạp các pattern tiền tố ban đầu cho các thiết bị mạng phổ biến
try {
  const insertPattern = db.prepare(`
    INSERT OR IGNORE INTO product_patterns (product_code, pattern, pattern_type)
    VALUES (?, ?, ?)
  `);
  
  insertPattern.run('XGS-118', 'XGS118', 'prefix');
  insertPattern.run('XGS-118', 'XGS-118', 'prefix');
  insertPattern.run('L009UiGS-RM', 'L009', 'prefix');
  insertPattern.run('RG-NBS3100-24GT4SFP-V2', 'NBS3100', 'keyword');
  insertPattern.run('RG-ES216GC-V2', 'ES216GC', 'keyword');
  insertPattern.run('RG-ES208GC', 'ES208GC', 'keyword');
  insertPattern.run('RG-RAP2260(G)', 'RAP2260', 'keyword');
  insertPattern.run('MINI-GBIC-LX-SM1310', 'GBIC-LX', 'keyword');
  insertPattern.run('MC220L', 'MC220L', 'prefix');
  insertPattern.run('1427071-6', '1427071', 'prefix');
  insertPattern.run('RACK-20U-D600', '20U-D600', 'keyword');
  insertPattern.run('RACK-4U-D400', '4U-D400', 'keyword');
  insertPattern.run('RG-POE-AT30', 'POE-AT30', 'keyword');
} catch (e) {
  // Bỏ qua nếu đã tồn tại
}

// Nạp danh mục 18 sản phẩm thiết bị mạng ban đầu nếu bảng products trống
try {
  const countProd = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (countProd === 0) {
    const insertProd = db.prepare(`
      INSERT OR IGNORE INTO products (product_code, product_name, model, description)
      VALUES (@product_code, @product_name, @model, @description)
    `);

    const defaultProducts = [
      { product_code: 'XGS-118', product_name: 'Thiết bị tường lửa Firewall Sophos XGS 118', model: 'Sophos XGS Series', description: 'Tường lửa bảo mật doanh nghiệp 8 Port GbE' },
      { product_code: 'XGS-118-LIC-12M', product_name: 'XGS 118 Standard Protection - 12 MOS', model: 'Bản quyền 12 tháng', description: 'Gói bảo vệ Network + Web Protection + Enhanced' },
      { product_code: 'L009UiGS-RM', product_name: 'Router Mikrotik L009UiGS-RM', model: 'L009 Series', description: 'Router định tuyến hiệu năng cao 8 cổng Gigabit' },
      { product_code: 'RG-NBS3100-24GT4SFP-V2', product_name: 'Switch RUIJIE REYEE RG-NBS3100-24GT4SFP-V2', model: '24 Port GbE + 4 SFP', description: 'Switch quản lý đám mây Layer 2 hiệu suất cao' },
      { product_code: 'RG-ES216GC-V2', product_name: 'Switch RUIJIE REYEE RG-ES216GC-V2', model: '16 Port Gigabit', description: 'Switch chia mạng thông minh Ruijie' },
      { product_code: 'RG-ES208GC', product_name: 'Switch RUIJIE REYEE RG-ES208GC', model: '8 Port Gigabit', description: 'Switch để bàn 8 cổng Gigabit' },
      { product_code: 'RG-RAP2260(G)', product_name: 'Thiết bị phát Wifi Ruijie REEYE RG-RAP2260(G)', model: 'Wi-Fi 6 AX1800', description: 'Access Point gắn trần chuẩn Wi-Fi 6 tốc độ cao' },
      { product_code: 'MINI-GBIC-LX-SM1310', product_name: 'Module quang SFP RUIJIE MINI-GBIC-LX-SM1310', model: '1.25G 1310nm 10km', description: 'Module quang SFP Single-mode 1.25Gbps' },
      { product_code: 'MC220L', product_name: 'TP-Link MC220L Gigabit SFP Media Converter', model: 'Gigabit SFP', description: 'Bộ chuyển đổi quang điện Gigabit TP-Link' },
      { product_code: 'CAP-QUANG-4FO', product_name: 'Cáp quang Single-mode 4FO Outdoor /Indoor', model: '4 Core Single-mode', description: 'Cáp quang bọc giáp kim loại chống gặm nhấm' },
      { product_code: 'SC-LC-3M-DUPLEX', product_name: 'Dây nhảy quang SC-LC-3m Duplex', model: 'SC/UPC - LC/UPC 3M', description: 'Dây nhảy quang Single-mode sợi đôi' },
      { product_code: 'ODF-24FO', product_name: 'Hộp phối quang 24FO', model: '24 Port Rackmount 19"', description: 'Hộp phối quang gắn tủ rack đầy đủ phụ kiện' },
      { product_code: 'ODF-4FO', product_name: 'Hộp phối quang 4FO', model: '4 Port Wallmount', description: 'Hộp phối quang treo tường nhỏ gọn' },
      { product_code: '1427071-6', product_name: 'Cáp mạng AMP CAT6 UTP (1427071-6)', model: 'Cat.6 UTP 305m', description: 'Thùng cáp mạng CommScope AMP chính hãng' },
      { product_code: 'RJ45-CAT6', product_name: 'Đầu mạng RJ45 Cat.6', model: 'Cat6 Modular Plug', description: 'Bịch 100 hạt mạng RJ45 chân mạ vàng' },
      { product_code: 'RACK-20U-D600', product_name: 'TỦ RACK 20U-D600 TMC', model: '20U Sâu 600mm', description: 'Tủ mạng rack server cửa lưới thông thoáng' },
      { product_code: 'RACK-4U-D400', product_name: 'TỦ RACK 4U-D400 TMC', model: '4U Sâu 400mm', description: 'Tủ mạng treo tường mini 4U' },
      { product_code: 'RG-POE-AT30', product_name: 'Nguồn PoE Ruijie RG-POE-AT30', model: '30W Gigabit PoE+', description: 'Adapter cấp nguồn PoE cho Wifi và Camera' }
    ];

    for (const p of defaultProducts) {
      insertProd.run(p);
    }
  }
} catch(err) {
  console.error("Lỗi nạp danh mục sản phẩm mẫu:", err);
}

// Nạp đơn hàng mẫu DH-DUAN-01 nếu chưa có
try {
  const checkOrder = db.prepare('SELECT id FROM orders WHERE order_code = ?').get('DH-DUAN-01');
  if (!checkOrder) {
    const orderRes = db.prepare(`
      INSERT INTO orders (order_code, order_name, customer_name, status, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run('DH-DUAN-01', 'Xuất kho thiết bị mạng dự án 2024', 'Dự án Tòa nhà Viễn thông', 'in_progress', 'Đơn hàng 18 thiết bị theo hợp đồng');

    const orderId = orderRes.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_code, product_name, quantity_expected, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const sampleItems = [
      { code: 'XGS-118', name: 'Thiết bị tường lửa Firewall Sophos XGS 118', qty: 1, unit: 'Cái' },
      { code: 'XGS-118-LIC-12M', name: 'XGS 118 Standard Protection - 12 MOS (bao gồm Network Protection + Web Protection + Enhanced)', qty: 1, unit: 'Bản quyền' },
      { code: 'L009UiGS-RM', name: 'Router Mikrotik L009UiGS-RM', qty: 1, unit: 'Cái' },
      { code: 'RG-NBS3100-24GT4SFP-V2', name: 'Switch RUIJIE REYEE RG-NBS3100-24GT4SFP-V2', qty: 2, unit: 'Cái' },
      { code: 'RG-ES216GC-V2', name: 'Switch RUIJIE REYEE RG-ES216GC-V2', qty: 4, unit: 'Cái' },
      { code: 'RG-ES208GC', name: 'Switch RUIJIE REYEE RG-ES208GC', qty: 1, unit: 'Cái' },
      { code: 'RG-RAP2260(G)', name: 'Thiết bị phát Wifi Ruijie REEYE RG-RAP2260(G)', qty: 7, unit: 'Cái' },
      { code: 'MINI-GBIC-LX-SM1310', name: 'Module quang SFP RUIJIE MINI-GBIC-LX-SM1310', qty: 8, unit: 'Cái' },
      { code: 'MC220L', name: 'TP-Link MC220L Gigabit SFP Media Converter', qty: 3, unit: 'Cái' },
      { code: 'CAP-QUANG-4FO', name: 'Cáp quang Single-mode 4FO Outdoor /Indoor', qty: 500, unit: 'Mét' },
      { code: 'SC-LC-3M-DUPLEX', name: 'Dây nhảy quang SC-LC-3m Duplex', qty: 10, unit: 'Cái' },
      { code: 'ODF-24FO', name: 'Hộp phối quang 24FO', qty: 1, unit: 'Cái' },
      { code: 'ODF-4FO', name: 'Hộp phối quang 4FO', qty: 4, unit: 'Cái' },
      { code: '1427071-6', name: 'Cáp mạng AMP CAT6 UTP (1427071-6)', qty: 2, unit: 'Thùng' },
      { code: 'RJ45-CAT6', name: 'Đầu mạng RJ45 Cat.6', qty: 1, unit: 'Bịch' },
      { code: 'RACK-20U-D600', name: 'TỦ RACK 20U-D600 TMC', qty: 1, unit: 'Cái' },
      { code: 'RACK-4U-D400', name: 'TỦ RACK 4U-D400 TMC', qty: 4, unit: 'Cái' },
      { code: 'RG-POE-AT30', name: 'Nguồn PoE Ruijie RG-POE-AT30', qty: 7, unit: 'Cái' }
    ];

    for (const it of sampleItems) {
      insertItem.run(orderId, it.code, it.name, it.qty, it.unit);
    }
  }
} catch (err) {
  console.error("Lỗi tạo đơn hàng mẫu:", err);
}

// Nạp danh sách tài khoản người dùng mẫu
try {
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, full_name, role, pin_code)
    VALUES (?, ?, ?, ?)
  `);

  insertUser.run('admin', 'Nguyễn Quản Trị (Admin)', 'admin', '1234');
  insertUser.run('qlkho', 'Trần Quản Lý (Kho)', 'manager', '1234');
  insertUser.run('nvkho1', 'Lê Văn Kho (Ca 1)', 'scanner', '1234');
  insertUser.run('nvkho2', 'Phạm Thị Kho (Ca 2)', 'scanner', '1234');
} catch (e) {
  // Bỏ qua nếu đã tồn tại
}

module.exports = db;
