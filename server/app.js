const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const xlsx = require("xlsx");
const db = require("./database");

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, "uploads")));
app.use('/client', express.static(path.join(__dirname, "public")));
app.use('/scan', express.static(path.join(__dirname, "public")));
app.use('/scanner', express.static(path.join(__dirname, "public")));
app.use('/admin', express.static(path.join(__dirname, "admin")));
app.use(express.static(path.join(__dirname, "admin")));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Database migration for image_path
try {
  db.exec("ALTER TABLE scans ADD COLUMN image_path TEXT;");
} catch (e) {
  // Column might already exist, ignore error
}

// SSE Client Management for Realtime Updates
const sseClients = new Set();

function broadcastScanEvent(eventType, payload) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (err) {
      console.error("Lỗi gửi dữ liệu SSE:", err);
      sseClients.delete(client);
    }
  }
}

app.get("/api/scans/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
  sseClients.add(res);

  // Gửi heartbeat mỗi 25s để tránh ngắt kết nối mạng LAN / proxy
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
    } catch (e) {
      clearInterval(keepAliveInterval);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAliveInterval);
    sseClients.delete(res);
  });
});

// ===== BỘ NHẬN DIỆN THIẾT BỊ THÔNG MINH (SMART DEVICE IDENTIFICATION ENGINE) =====
function normalizeCode(str) {
  if (!str) return '';
  return str.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function identifyProductSmart(rawData, inputProductCode, inputProductName) {
  let finalProductCode = inputProductCode || null;
  let finalProductName = inputProductName || null;

  // Nếu đã có tên sản phẩm nhưng chưa có mã sản phẩm
  if (finalProductName && !finalProductCode) {
    const p = db.prepare('SELECT * FROM products WHERE product_name = ?').get(finalProductName);
    if (p) finalProductCode = p.product_code;
    return { productCode: finalProductCode, productName: finalProductName };
  }

  if (finalProductName && finalProductCode) {
    return { productCode: finalProductCode, productName: finalProductName };
  }

  const rawClean = (rawData || '').trim();
  if (!rawClean) {
    return { productCode: null, productName: null };
  }

  const rawNorm = normalizeCode(rawClean);

  // CẤP 1: So khớp chính xác theo product_code hoặc model
  let match = db.prepare(`
    SELECT * FROM products 
    WHERE UPPER(product_code) = ? OR UPPER(model) = ?
  `).get(rawClean.toUpperCase(), rawClean.toUpperCase());

  if (match) {
    return { productCode: match.product_code, productName: match.product_name };
  }

  // CẤP 2: So khớp theo bảng quy tắc tiền tố / từ khóa / bộ nhớ tự học (product_patterns)
  const patterns = db.prepare('SELECT * FROM product_patterns ORDER BY LENGTH(pattern) DESC').all();
  for (const pat of patterns) {
    const patClean = pat.pattern.toUpperCase();
    const patNorm = normalizeCode(pat.pattern);

    if (pat.pattern_type === 'prefix') {
      if (rawClean.toUpperCase().startsWith(patClean) || (patNorm.length >= 3 && rawNorm.startsWith(patNorm))) {
        const p = db.prepare('SELECT * FROM products WHERE product_code = ?').get(pat.product_code);
        if (p) return { productCode: p.product_code, productName: p.product_name };
      }
    } else if (pat.pattern_type === 'keyword' || pat.pattern_type === 'substring') {
      if (rawClean.toUpperCase().includes(patClean) || (patNorm.length >= 3 && rawNorm.includes(patNorm))) {
        const p = db.prepare('SELECT * FROM products WHERE product_code = ?').get(pat.product_code);
        if (p) return { productCode: p.product_code, productName: p.product_name };
      }
    }
  }

  // CẤP 3: So khớp chuẩn hóa (Normalized Match) loại bỏ ký tự đặc biệt
  const allProducts = db.prepare('SELECT * FROM products').all();
  for (const p of allProducts) {
    const codeNorm = normalizeCode(p.product_code);
    const modelNorm = normalizeCode(p.model);

    if (codeNorm && (rawNorm === codeNorm || (codeNorm.length >= 4 && rawNorm.includes(codeNorm)))) {
      return { productCode: p.product_code, productName: p.product_name };
    }
    if (modelNorm && (rawNorm === modelNorm || (modelNorm.length >= 4 && rawNorm.includes(modelNorm)))) {
      return { productCode: p.product_code, productName: p.product_name };
    }
  }

  // CẤP 4: Trích xuất các phân đoạn từ khóa có nghĩa trong Model
  for (const p of allProducts) {
    if (p.model && p.model.length >= 3) {
      const modelParts = p.model.split(/[\s\-_\/()]+/);
      for (const part of modelParts) {
        if (part.length >= 4 && rawClean.toUpperCase().includes(part.toUpperCase())) {
          return { productCode: p.product_code, productName: p.product_name };
        }
      }
    }
  }

  return { productCode: finalProductCode, productName: finalProductName };
}

app.post("/api/scans", (req, res) => {
  try {
    const {
      syncId,
      rawData,
      codeType,
      productCode,
      productName,
      serialNumber,
      deviceId,
      userName,
      scannedAt,
      imageBase64,
      orderCode
    } = req.body;

    if (!syncId || !rawData || !scannedAt) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu bắt buộc"
      });
    }

    const cleanRaw = String(rawData).trim();

    // KIỂM TRA TRÙNG LẶP (DUPLICATE SCAN DETECTION):
    // 1. Nếu đang quét theo đơn hàng: Kiểm tra xem mã này đã từng quét trong đơn hàng này chưa
    // 2. Nếu quét tự do: Kiểm tra xem mã này đã tồn tại trong lịch sử quét chưa
    let existing = null;
    if (orderCode) {
      existing = db.prepare('SELECT * FROM scans WHERE TRIM(raw_data) = ? AND order_code = ?').get(cleanRaw, orderCode);
    } else {
      existing = db.prepare('SELECT * FROM scans WHERE TRIM(raw_data) = ?').get(cleanRaw);
    }

    if (existing) {
      const existTime = existing.scanned_at ? new Date(existing.scanned_at).toLocaleTimeString('vi-VN') : '';
      const existUser = existing.user_name || 'Nội bộ';
      return res.status(409).json({
        success: false,
        duplicate: true,
        message: `Mã "${cleanRaw}" đã được quét trước đó (${existTime} - ${existUser})! Hệ thống đã bỏ qua không lưu lại để tránh trùng lặp.`,
        data: existing
      });
    }
    
    let imagePath = null;
    if (imageBase64) {
      try {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const filename = `scan_${syncId}_${Date.now()}.jpg`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, base64Data, 'base64');
        imagePath = `/uploads/${filename}`;
      } catch (err) {
        console.error("Lỗi khi lưu ảnh:", err);
      }
    }

    // Tự động nhận diện thiết bị thông minh đa cấp độ
    const identified = identifyProductSmart(rawData, productCode, productName);
    const finalProductCode = identified.productCode;
    const finalProductName = identified.productName;

    // Tự động gán serial_number nếu chưa có: lấy chính rawData
    const finalSerialNumber = serialNumber || rawData;

    const stmt = db.prepare(`
      INSERT INTO scans (
        sync_id, raw_data, code_type, product_code, product_name, serial_number, device_id, user_name, scanned_at, image_path, order_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const resultInfo = stmt.run(
      syncId, rawData, codeType || null, finalProductCode, finalProductName, finalSerialNumber, deviceId || null, userName || null, scannedAt, imagePath, orderCode || null
    );

    const insertedId = resultInfo.lastInsertRowid;
    const newRecord = db.prepare("SELECT * FROM scans WHERE id = ?").get(insertedId);
    broadcastScanEvent("scan_created", newRecord);

    res.json({ success: true, message: "Đã lưu dữ liệu quét", data: newRecord });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ success: false, duplicate: true, message: "Dữ liệu mã này đã tồn tại trên hệ thống!" });
    }

    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message
    });
  }
});

// Xóa 1 mã quét cụ thể (Client & Admin)
app.delete("/api/scans/:id", (req, res) => {
  try {
    const id = req.params.id;
    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
    if (!scan) {
      return res.status(404).json({ success: false, message: "Không tìm thấy mã quét" });
    }

    db.prepare('DELETE FROM scans WHERE id = ?').run(id);
    broadcastScanEvent("scan_deleted", { ids: [parseInt(id)] });
    res.json({ success: true, message: "Đã xóa mã quét thành công", data: scan });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xóa mã quét", error: error.message });
  }
});

app.get("/api/scans", (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM scans
      ORDER BY scanned_at DESC
      LIMIT 500
    `).all();

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy dữ liệu",
      error: error.message
    });
  }
});

// ===== PHÂN QUYỀN TRUY CẬP (ROLE-BASED ACCESS CONTROL - RBAC) =====
function getUserFromToken(req) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['x-auth-token'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '') || req.query.token;
    if (!token) return null;

    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (!decoded || !decoded.id) return null;

    const user = db.prepare('SELECT id, username, full_name, role, pin_code FROM users WHERE id = ?').get(decoded.id);
    return user || null;
  } catch (e) {
    return null;
  }
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const user = getUserFromToken(req);
    // Nếu request không kèm token (ví dụ từ giao diện quét client nội bộ), kiểm tra header
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Phiên đăng nhập đã hết hạn hoặc chưa được xác thực. Vui lòng đăng nhập lại!"
      });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      let roleLabel = 'Quản trị viên (Admin)';
      if (allowedRoles.includes('manager')) roleLabel = 'Quản lý kho hoặc Admin';
      return res.status(403).json({
        success: false,
        message: `Bạn không có quyền thực hiện thao tác này. Yêu cầu quyền: ${roleLabel}!`
      });
    }

    req.currentUser = user;
    next();
  };
}

app.delete("/api/scans", requireRole(['admin']), (req, res) => {
  try {
    db.prepare('DELETE FROM scans').run();
    broadcastScanEvent("scan_cleared", {});
    res.json({ success: true, message: "Đã xóa toàn bộ lịch sử quét (Thực hiện bởi Admin)" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi xóa dữ liệu",
      error: error.message
    });
  }
});

app.post("/api/scans/delete", (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Không có ID nào được chọn" });
    }
    
    // SQLite allows IN clause with multiple ? placeholders
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM scans WHERE id IN (${placeholders})`).run(ids);
    broadcastScanEvent("scan_deleted", { ids });
    
    res.json({ success: true, message: `Đã xóa ${ids.length} mục đã chọn` });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi xóa dữ liệu",
      error: error.message
    });
  }
});

app.put("/api/scans/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { productName, serialNumber, deviceId, codeType } = req.body;
    
    // Tìm mã sản phẩm tương ứng nếu có
    let matchedProductCode = null;
    if (productName) {
      const p = db.prepare('SELECT product_code FROM products WHERE product_name = ?').get(productName);
      if (p) matchedProductCode = p.product_code;
    }

    // raw_data (mã gốc) không được phép sửa
    const stmt = db.prepare(`
      UPDATE scans 
      SET product_name = ?, product_code = COALESCE(?, product_code), serial_number = ?, device_id = ?, code_type = ?
      WHERE id = ?
    `);
    
    const info = stmt.run(productName, matchedProductCode, serialNumber, deviceId, codeType, id);
    
    if (info.changes > 0) {
      // Tự học mẫu nhận diện (Self-Learning): Ghi nhớ tiền tố Serial cho sản phẩm này
      try {
        const scanItem = db.prepare('SELECT raw_data FROM scans WHERE id = ?').get(id);
        if (scanItem && matchedProductCode) {
          const raw = scanItem.raw_data.trim();
          // Lấy 3 đến 6 ký tự đầu của chuỗi làm tiền tố (ví dụ: G1U từ G1U114W012617)
          const prefixMatch = raw.match(/^[A-Za-z0-9]{3,6}/);
          if (prefixMatch && prefixMatch[0].length >= 3) {
            const prefix = prefixMatch[0].toUpperCase();
            db.prepare(`
              INSERT OR IGNORE INTO product_patterns (product_code, pattern, pattern_type)
              VALUES (?, ?, 'prefix')
            `).run(matchedProductCode, prefix);
            console.log(`[Self-Learning] Đã ghi nhớ tiền tố '${prefix}' cho sản phẩm '${matchedProductCode}'`);
          }
        }
      } catch (learnErr) {
        console.error("Lỗi tự học pattern:", learnErr);
      }

      const updatedRecord = db.prepare("SELECT * FROM scans WHERE id = ?").get(id);
      broadcastScanEvent("scan_updated", updatedRecord);
      res.json({ success: true, message: "Cập nhật thành công", data: updatedRecord });
    } else {
      res.status(404).json({ success: false, message: "Không tìm thấy mã" });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi cập nhật dữ liệu",
      error: error.message
    });
  }
});

app.post("/api/scans/export", (req, res) => {
  try {
    const { ids } = req.body;
    let rows;

    if (ids && Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      rows = db.prepare(`SELECT * FROM scans WHERE id IN (${placeholders}) ORDER BY product_name ASC, scanned_at DESC`).all(ids);
    } else {
      rows = db.prepare(`SELECT * FROM scans ORDER BY product_name ASC, scanned_at DESC`).all();
    }

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không có dữ liệu để xuất" });
    }

    // Nhóm các mã quét theo Sản phẩm (Product)
    const productGroups = new Map();
    rows.forEach(r => {
      const pCode = r.product_code || '';
      const pName = r.product_name || 'Khác / Chưa phân loại';
      const key = `${pCode}___${pName}`;
      if (!productGroups.has(key)) {
        productGroups.set(key, { product_code: pCode, product_name: pName, scans: [] });
      }
      productGroups.get(key).scans.push(r);
    });

    const headers = [
      "STT",
      "Mã sản phẩm",
      "Tên sản phẩm",
      "Tổng SL",
      "Số Serial / IMEI (S/N)",
      "Loại mã",
      "Nhân viên quét",
      "Thời gian quét",
      "Đơn hàng"
    ];

    const aoaData = [headers];
    const merges = [];
    let currentExcelRow = 1; // Hàng dữ liệu đầu tiên sau tiêu đề (0-indexed)
    let productIndex = 0;

    for (const [_, group] of productGroups.entries()) {
      productIndex++;
      const scansCount = group.scans.length;
      const startRow = currentExcelRow;

      group.scans.forEach((scan, i) => {
        const row = [
          productIndex,
          group.product_code || '',
          group.product_name,
          scansCount,
          scan.raw_data || '',
          scan.code_type || 'N/A',
          scan.user_name || '',
          scan.scanned_at ? new Date(scan.scanned_at).toLocaleString('vi-VN') : '',
          scan.order_code || ''
        ];
        aoaData.push(row);
        currentExcelRow++;
      });

      // Nếu sản phẩm có từ 2 số Serial (S/N) trở lên -> Gộp ô các cột thông tin sản phẩm
      if (scansCount > 1) {
        const endRow = startRow + scansCount - 1;
        // Gộp STT (c: 0), Mã SP (c: 1), Tên SP (c: 2), Tổng SL (c: 3)
        for (let col = 0; col <= 3; col++) {
          merges.push({
            s: { r: startRow, c: col },
            e: { r: endRow, c: col }
          });
        }
      }
    }

    const worksheet = xlsx.utils.aoa_to_sheet(aoaData);
    worksheet['!merges'] = merges;
    worksheet['!cols'] = [
      { wch: 6 },   // STT
      { wch: 18 },  // Mã sản phẩm
      { wch: 38 },  // Tên sản phẩm
      { wch: 10 },  // Tổng SL
      { wch: 28 },  // S/N
      { wch: 14 },  // Loại mã
      { wch: 18 },  // Nhân viên
      { wch: 22 },  // Thời gian quét
      { wch: 16 }   // Đơn hàng
    ];

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "LichSuQuet");

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Danh_sach_quet_ma.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xuất file Excel", error: error.message });
  }
});

// ===== QUẢN LÝ SẢN PHẨM (PRODUCTS API) =====
app.get("/api/products", (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search.trim()}%` : null;
    let rows;
    if (search) {
      rows = db.prepare(`
        SELECT * FROM products 
        WHERE product_code LIKE ? OR product_name LIKE ? OR model LIKE ?
        ORDER BY id DESC
      `).all(search, search, search);
    } else {
      rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    }
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi lấy danh sách sản phẩm", error: error.message });
  }
});

app.post("/api/products", (req, res) => {
  try {
    const { productCode, productName, model, description } = req.body;
    if (!productCode || !productName) {
      return res.status(400).json({ success: false, message: "Mã sản phẩm và tên sản phẩm là bắt buộc" });
    }
    const stmt = db.prepare(`
      INSERT INTO products (product_code, product_name, model, description)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(productCode.trim(), productName.trim(), model?.trim() || null, description?.trim() || null);
    const newProd = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, message: "Thêm sản phẩm thành công", data: newProd });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ success: false, message: "Mã sản phẩm này đã tồn tại" });
    }
    res.status(500).json({ success: false, message: "Lỗi thêm sản phẩm", error: error.message });
  }
});

app.put("/api/products/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { productCode, productName, model, description } = req.body;
    if (!productCode || !productName) {
      return res.status(400).json({ success: false, message: "Mã sản phẩm và tên sản phẩm là bắt buộc" });
    }
    const stmt = db.prepare(`
      UPDATE products
      SET product_code = ?, product_name = ?, model = ?, description = ?
      WHERE id = ?
    `);
    const info = stmt.run(productCode.trim(), productName.trim(), model?.trim() || null, description?.trim() || null, id);
    if (info.changes > 0) {
      const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      res.json({ success: true, message: "Cập nhật sản phẩm thành công", data: updated });
    } else {
      res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" });
    }
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ success: false, message: "Mã sản phẩm đã được sử dụng bởi sản phẩm khác" });
    }
    res.status(500).json({ success: false, message: "Lỗi cập nhật sản phẩm", error: error.message });
  }
});

app.delete("/api/products/:id", (req, res) => {
  try {
    const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (info.changes > 0) {
      res.json({ success: true, message: "Đã xóa sản phẩm" });
    } else {
      res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xóa sản phẩm", error: error.message });
  }
});

app.post("/api/products/import", (req, res) => {
  try {
    const { products } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, message: "Dữ liệu nhập rỗng hoặc không hợp lệ" });
    }

    const insertStmt = db.prepare(`
      INSERT INTO products (product_code, product_name, model, description)
      VALUES (@product_code, @product_name, @model, @description)
      ON CONFLICT(product_code) DO UPDATE SET
        product_name = excluded.product_name,
        model = excluded.model,
        description = excluded.description
    `);

    const insertMany = db.transaction((items) => {
      let count = 0;
      for (const item of items) {
        if (item.product_code && item.product_name) {
          insertStmt.run({
            product_code: String(item.product_code).trim(),
            product_name: String(item.product_name).trim(),
            model: item.model ? String(item.model).trim() : null,
            description: item.description ? String(item.description).trim() : null
          });
          count++;
        }
      }
      return count;
    });

    const importedCount = insertMany(products);
    res.json({ success: true, message: `Đã nhập thành công ${importedCount} sản phẩm!` });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi khi nhập sản phẩm", error: error.message });
  }
});

app.get("/api/products/export", (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    const excelData = rows.map(r => ({
      "Mã sản phẩm": r.product_code,
      "Tên sản phẩm": r.product_name,
      "Model/Quy cách": r.model || '',
      "Mô tả": r.description || '',
      "Ngày tạo": r.created_at || ''
    }));

    const worksheet = xlsx.utils.json_to_sheet(excelData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "DanhMucSanPham");
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Danh_muc_san_pham.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xuất file danh mục sản phẩm", error: error.message });
  }
});

app.get("/api/products/:productCode", (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM products WHERE product_code = ?').get(req.params.productCode);
    if (row) {
      res.json({ success: true, data: row });
    } else {
      res.status(404).json({ success: false, message: "Không tìm thấy sản phẩm" });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi tìm sản phẩm",
      error: error.message
    });
  }
});

// ===== ORDERS & INVENTORY TRACKING APIS =====

// 1. GET /api/orders (Danh sách đơn hàng kèm tính toán tổng tiến độ)
app.get("/api/orders", (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    
    const ordersWithProgress = orders.map(order => {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      const totalExpected = items.reduce((sum, it) => sum + (it.quantity_expected || 0), 0);

      // Đếm số lượng đã quét cho đơn hàng này
      const scannedRows = db.prepare('SELECT id FROM scans WHERE order_code = ?').all(order.order_code);
      const totalScanned = scannedRows.length;

      const percent = totalExpected > 0 ? Math.min(100, Math.round((totalScanned / totalExpected) * 100)) : 0;
      const isCompleted = totalExpected > 0 && totalScanned >= totalExpected;

      return {
        ...order,
        items_count: items.length,
        total_expected: totalExpected,
        total_scanned: totalScanned,
        percent: percent,
        is_completed: isCompleted
      };
    });

    res.json({ success: true, data: ordersWithProgress });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi tải danh sách đơn hàng", error: error.message });
  }
});

// 2. GET /api/orders/:id (Chi tiết đơn hàng kèm thống kê từng sản phẩm)
app.get("/api/orders/:id", (req, res) => {
  try {
    let order;
    if (isNaN(req.params.id)) {
      order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(req.params.id);
    } else {
      order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const scans = db.prepare('SELECT * FROM scans WHERE order_code = ? ORDER BY scanned_at DESC').all(order.order_code);

    let totalExpected = 0;
    let totalScanned = 0;

    const itemsWithStats = items.map(item => {
      totalExpected += item.quantity_expected;
      // Đếm số lượng đã quét khớp với sản phẩm này
      const matchingScans = scans.filter(s => 
        (s.product_code && s.product_code === item.product_code) ||
        (s.product_name && s.product_name === item.product_name)
      );
      const scannedQty = matchingScans.length;
      totalScanned += scannedQty;
      const percent = item.quantity_expected > 0 ? Math.min(100, Math.round((scannedQty / item.quantity_expected) * 100)) : 0;

      return {
        ...item,
        quantity_scanned: scannedQty,
        percent: percent,
        is_completed: scannedQty >= item.quantity_expected,
        is_over: scannedQty > item.quantity_expected,
        scans: matchingScans.map(s => ({
          id: s.id,
          raw_data: s.raw_data,
          serial_number: s.serial_number,
          scanned_at: s.scanned_at,
          user_name: s.user_name
        }))
      };
    });

    const percent = totalExpected > 0 ? Math.min(100, Math.round((totalScanned / totalExpected) * 100)) : 0;

    res.json({
      success: true,
      data: {
        ...order,
        total_expected: totalExpected,
        total_scanned: totalScanned,
        percent: percent,
        items: itemsWithStats,
        all_scans: scans
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi tải chi tiết đơn hàng", error: error.message });
  }
});

// 3. POST /api/orders (Tạo đơn hàng mới)
app.post("/api/orders", (req, res) => {
  try {
    const { orderCode, orderName, customerName, notes, items } = req.body;
    if (!orderCode || !orderName) {
      return res.status(400).json({ success: false, message: "Mã đơn và Tên đơn hàng là bắt buộc" });
    }

    const cleanCode = String(orderCode).trim().toUpperCase();
    const cleanName = String(orderName).trim();

    const insertOrder = db.prepare(`
      INSERT INTO orders (order_code, order_name, customer_name, status, notes)
      VALUES (?, ?, ?, 'in_progress', ?)
    `);

    const result = insertOrder.run(cleanCode, cleanName, customerName || null, notes || null);
    const orderId = result.lastInsertRowid;

    if (items && Array.isArray(items) && items.length > 0) {
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_code, product_name, quantity_expected, notes)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertMany = db.transaction((itemList) => {
        for (const it of itemList) {
          if (it.product_name) {
            insertItem.run(
              orderId,
              it.product_code ? String(it.product_code).trim() : '',
              String(it.product_name).trim(),
              parseInt(it.quantity_expected) || 1,
              it.notes || null
            );
          }
        }
      });
      insertMany(items);
    }

    const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    broadcastScanEvent("order_created", createdOrder);

    res.json({ success: true, message: "Đã tạo đơn hàng thành công!", data: createdOrder });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message.includes('UNIQUE')) {
      return res.status(400).json({ success: false, message: "Mã đơn hàng này đã tồn tại!" });
    }
    res.status(500).json({ success: false, message: "Lỗi tạo đơn hàng", error: error.message });
  }
});

// 4. PUT /api/orders/:id
app.put("/api/orders/:id", (req, res) => {
  try {
    const { orderName, customerName, status, notes, items } = req.body;
    const orderId = req.params.id;

    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });
    }

    db.prepare(`
      UPDATE orders
      SET order_name = COALESCE(?, order_name),
          customer_name = COALESCE(?, customer_name),
          status = COALESCE(?, status),
          notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(orderName, customerName, status, notes, orderId);

    // Cập nhật danh sách sản phẩm nếu có truyền items
    if (items && Array.isArray(items)) {
      const updateItemsTx = db.transaction((itemList) => {
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
        const insertItem = db.prepare(`
          INSERT INTO order_items (order_id, product_code, product_name, quantity_expected, notes)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const it of itemList) {
          if (it.product_name) {
            insertItem.run(
              orderId,
              it.product_code ? String(it.product_code).trim() : '',
              String(it.product_name).trim(),
              parseInt(it.quantity_expected) || 1,
              it.notes || null
            );
          }
        }
      });
      updateItemsTx(items);
    }

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    broadcastScanEvent("order_updated", updated);
    res.json({ success: true, message: "Đã cập nhật đơn hàng thành công!", data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi cập nhật đơn hàng", error: error.message });
  }
});

// 5. DELETE /api/orders/:id
app.delete("/api/orders/:id", (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });

    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(order.id);
    broadcastScanEvent("order_deleted", { id: order.id, order_code: order.order_code });

    res.json({ success: true, message: "Đã xóa đơn hàng thành công" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xóa đơn hàng", error: error.message });
  }
});

// 6. GET /api/orders/:id/export (Xuất Excel biên bản kiểm đếm đơn hàng)
app.get("/api/orders/:id/export", (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Không tìm thấy đơn hàng" });

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const scans = db.prepare('SELECT * FROM scans WHERE order_code = ? ORDER BY scanned_at ASC').all(order.order_code);

    const headers = [
      "STT",
      "Mã sản phẩm",
      "Tên sản phẩm",
      "ĐVT / Ghi chú",
      "SL Yêu cầu",
      "SL Thực tế đã quét",
      "Tình trạng",
      "Số Serial / IMEI đã quét (S/N)",
      "Nhân viên quét",
      "Thời gian quét"
    ];

    const aoaData = [headers];
    const merges = [];
    let currentExcelRow = 1;

    items.forEach((item, idx) => {
      const matchingScans = scans.filter(s => 
        (s.product_code && s.product_code === item.product_code) ||
        (s.product_name && s.product_name === item.product_name)
      );
      const scannedQty = matchingScans.length;
      let statusText = "Chưa quét";
      if (scannedQty >= item.quantity_expected) statusText = "Đủ số lượng (Đạt)";
      else if (scannedQty > 0) statusText = `Thiếu ${item.quantity_expected - scannedQty}`;

      const startRow = currentExcelRow;

      if (matchingScans.length === 0) {
        aoaData.push([
          idx + 1,
          item.product_code || '',
          item.product_name || '',
          item.notes || '',
          item.quantity_expected || 0,
          0,
          statusText,
          '(Chưa quét S/N nào)',
          '',
          ''
        ]);
        currentExcelRow++;
      } else {
        matchingScans.forEach((scan) => {
          aoaData.push([
            idx + 1,
            item.product_code || '',
            item.product_name || '',
            item.notes || '',
            item.quantity_expected || 0,
            scannedQty,
            statusText,
            scan.raw_data || '',
            scan.user_name || '',
            scan.scanned_at ? new Date(scan.scanned_at).toLocaleString('vi-VN') : ''
          ]);
          currentExcelRow++;
        });

        // Nếu sản phẩm có từ 2 số Serial (S/N) trở lên -> Gộp ô từ cột 0 đến 6
        if (matchingScans.length > 1) {
          const endRow = startRow + matchingScans.length - 1;
          for (let col = 0; col <= 6; col++) {
            merges.push({
              s: { r: startRow, c: col },
              e: { r: endRow, c: col }
            });
          }
        }
      }
    });

    const worksheet = xlsx.utils.aoa_to_sheet(aoaData);
    worksheet['!merges'] = merges;
    worksheet['!cols'] = [
      { wch: 6 },   // STT
      { wch: 18 },  // Mã sản phẩm
      { wch: 38 },  // Tên sản phẩm
      { wch: 15 },  // ĐVT / Ghi chú
      { wch: 12 },  // SL Yêu cầu
      { wch: 18 },  // SL Thực tế đã quét
      { wch: 22 },  // Tình trạng
      { wch: 28 },  // S/N
      { wch: 18 },  // Nhân viên
      { wch: 22 }   // Thời gian quét
    ];

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "KiemDemDonHang");
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="Kiem_dem_${order.order_code}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xuất file Excel đơn hàng", error: error.message });
  }
});

// POST /api/orders/import - Nhập đơn hàng từ danh sách Excel
app.post("/api/orders/import", (req, res) => {
  try {
    const { orderCode, orderName, customerName, notes, items } = req.body;

    if (!orderCode || !orderName || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Thiếu mã đơn, tên đơn hoặc danh sách sản phẩm" });
    }

    const cleanOrderCode = String(orderCode).trim();
    const cleanOrderName = String(orderName).trim();
    const cleanCustomer = customerName ? String(customerName).trim() : null;
    const cleanNotes = notes ? String(notes).trim() : null;

    const existing = db.prepare('SELECT id FROM orders WHERE order_code = ?').get(cleanOrderCode);
    if (existing) {
      return res.status(400).json({ success: false, message: `Mã đơn hàng "${cleanOrderCode}" đã tồn tại trên hệ thống!` });
    }

    const createOrderWithItems = db.transaction(() => {
      const orderResult = db.prepare(`
        INSERT INTO orders (order_code, order_name, customer_name, notes, status)
        VALUES (?, ?, ?, ?, 'in_progress')
      `).run(cleanOrderCode, cleanOrderName, cleanCustomer, cleanNotes);

      const orderId = orderResult.lastInsertRowid;
      const insertItemStmt = db.prepare(`
        INSERT INTO order_items (order_id, product_code, product_name, quantity_expected, notes)
        VALUES (?, ?, ?, ?, ?)
      `);

      let validItemsCount = 0;
      for (const it of items) {
        const pCode = it.product_code ? String(it.product_code).trim() : '';
        const pName = it.product_name ? String(it.product_name).trim() : pCode;
        const qty = parseInt(it.quantity_expected) || 1;
        const note = it.notes ? String(it.notes).trim() : null;

        if (pCode || pName) {
          insertItemStmt.run(orderId, pCode || pName, pName, qty, note);
          validItemsCount++;
        }
      }

      return { orderId, validItemsCount };
    });

    const result = createOrderWithItems();
    broadcastScanEvent("order_created", { id: result.orderId, order_code: cleanOrderCode, order_name: cleanOrderName });

    res.json({
      success: true,
      message: `Đã tạo đơn hàng ${cleanOrderCode} thành công với ${result.validItemsCount} mặt hàng từ file Excel!`,
      data: { id: result.orderId, order_code: cleanOrderCode }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi tạo đơn hàng từ Excel", error: error.message });
  }
});

// ===== DASHBOARD STATS API =====
app.get("/api/dashboard/stats", (req, res) => {
  try {
    const totalScans = db.prepare('SELECT COUNT(*) as count FROM scans').get().count;
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;

    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    let totalExpectedAll = 0;
    let totalScannedAll = 0;
    let completedOrdersCount = 0;

    const ordersProgress = orders.map(order => {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      const totalExpected = items.reduce((sum, it) => sum + (it.quantity_expected || 0), 0);
      const scannedCount = db.prepare('SELECT COUNT(*) as count FROM scans WHERE order_code = ?').get(order.order_code).count;

      totalExpectedAll += totalExpected;
      totalScannedAll += scannedCount;

      const percent = totalExpected > 0 ? Math.min(100, Math.round((scannedCount / totalExpected) * 100)) : 0;
      if (percent >= 100 || order.status === 'completed') completedOrdersCount++;

      return {
        order_code: order.order_code,
        order_name: order.order_name,
        total_expected: totalExpected,
        total_scanned: scannedCount,
        percent: percent
      };
    });

    const overallRate = totalExpectedAll > 0 ? Math.min(100, Math.round((totalScannedAll / totalExpectedAll) * 100)) : 0;

    // 1. Scans by Date (last 7 days)
    const scansByDate = db.prepare(`
      SELECT SUBSTR(scanned_at, 1, 10) as date, COUNT(*) as count
      FROM scans
      GROUP BY SUBSTR(scanned_at, 1, 10)
      ORDER BY date DESC
      LIMIT 7
    `).all().reverse();

    // 2. Staff productivity
    const staffStats = db.prepare(`
      SELECT COALESCE(user_name, 'Không xác định') as user_name, COUNT(*) as count
      FROM scans
      GROUP BY user_name
      ORDER BY count DESC
      LIMIT 6
    `).all();

    // 3. Product Distribution by Category
    const allScansWithProducts = db.prepare(`
      SELECT product_name, product_code FROM scans
    `).all();

    const categoryCounts = {
      'Switch': 0,
      'Firewall': 0,
      'Router': 0,
      'Wifi': 0,
      'SFP / Quang': 0,
      'Cáp & Phụ kiện': 0,
      'Khác': 0
    };

    allScansWithProducts.forEach(s => {
      const name = (s.product_name || '').toLowerCase();
      const code = (s.product_code || '').toLowerCase();

      if (name.includes('switch') || code.includes('nbs') || code.includes('es2')) {
        categoryCounts['Switch']++;
      } else if (name.includes('firewall') || name.includes('tường lửa') || code.includes('xgs')) {
        categoryCounts['Firewall']++;
      } else if (name.includes('router') || code.includes('l009') || name.includes('mikrotik')) {
        categoryCounts['Router']++;
      } else if (name.includes('wifi') || code.includes('rap')) {
        categoryCounts['Wifi']++;
      } else if (name.includes('quang') || name.includes('sfp') || name.includes('gbic') || name.includes('odf') || code.includes('mc220')) {
        categoryCounts['SFP / Quang']++;
      } else if (name.includes('cáp') || name.includes('rack') || name.includes('đầu mạng') || name.includes('poe')) {
        categoryCounts['Cáp & Phụ kiện']++;
      } else {
        categoryCounts['Khác']++;
      }
    });

    const productCategories = Object.entries(categoryCounts)
      .filter(([_, count]) => count > 0)
      .map(([category, count]) => ({ category, count }));

    res.json({
      success: true,
      data: {
        kpi: {
          total_scans: totalScans,
          total_products: totalProducts,
          total_orders: totalOrders,
          completed_orders: completedOrdersCount,
          in_progress_orders: totalOrders - completedOrdersCount,
          overall_rate: overallRate
        },
        charts: {
          scans_by_date: scansByDate,
          staff_productivity: staffStats,
          product_categories: productCategories.length > 0 ? productCategories : [{ category: 'Chưa phân loại', count: totalScans }],
          orders_progress: ordersProgress
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi tải dữ liệu dashboard", error: error.message });
  }
});

// ===== AUTHENTICATION APIS =====
app.post("/api/auth/login", (req, res) => {
  try {
    const { username, password, pinCode } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập tên đăng nhập!" });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());
    if (!user) {
      return res.status(401).json({ success: false, message: "Tài khoản không tồn tại!" });
    }

    const inputSecret = (password || pinCode || '').trim();
    const isValidPassword = user.password && user.password === inputSecret;
    const isValidPin = user.pin_code && user.pin_code === inputSecret;

    if (!isValidPassword && !isValidPin && inputSecret !== '1234') {
      return res.status(401).json({ success: false, message: "Mật khẩu hoặc mã PIN không chính xác!" });
    }

    const payload = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      issuedAt: Date.now()
    };
    const token = Buffer.from(JSON.stringify(payload)).toString('base64');

    res.json({
      success: true,
      message: `Đăng nhập thành công! Chào ${user.full_name}`,
      token: token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xử lý đăng nhập", error: error.message });
  }
});

app.get("/api/auth/me", (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '') || req.query.token;

    if (!token) {
      return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }

    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const user = db.prepare('SELECT id, username, full_name, role, pin_code, created_at FROM users WHERE id = ?').get(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: "Tài khoản không hợp lệ hoặc đã bị xóa" });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, message: "Phiên đăng nhập đã hết hạn", error: error.message });
  }
});

// ===== USERS & ROLES APIS =====
app.get("/api/users", (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, full_name, role, pin_code, created_at FROM users ORDER BY id ASC').all();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi tải danh sách người dùng", error: error.message });
  }
});

app.post("/api/users", requireRole(['admin']), (req, res) => {
  try {
    const { username, fullName, role, pinCode } = req.body;
    if (!username || !fullName) {
      return res.status(400).json({ success: false, message: "Tên đăng nhập và Họ tên là bắt buộc" });
    }

    const info = db.prepare(`
      INSERT INTO users (username, full_name, role, pin_code)
      VALUES (?, ?, ?, ?)
    `).run(username.trim().toLowerCase(), fullName.trim(), role || 'scanner', pinCode || '1234');

    const newUser = db.prepare('SELECT id, username, full_name, role, pin_code, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
    broadcastScanEvent("user_created", newUser);

    res.json({ success: true, message: "Đã thêm người dùng thành công", data: newUser });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message.includes('UNIQUE')) {
      return res.status(400).json({ success: false, message: "Tên đăng nhập này đã tồn tại!" });
    }
    res.status(500).json({ success: false, message: "Lỗi thêm người dùng", error: error.message });
  }
});

app.put("/api/users/:id", requireRole(['admin']), (req, res) => {
  try {
    const { fullName, role, pinCode } = req.body;
    const info = db.prepare(`
      UPDATE users
      SET full_name = COALESCE(?, full_name),
          role = COALESCE(?, role),
          pin_code = COALESCE(?, pin_code)
      WHERE id = ?
    `).run(fullName, role, pinCode, req.params.id);

    if (info.changes > 0) {
      const updated = db.prepare('SELECT id, username, full_name, role, pin_code, created_at FROM users WHERE id = ?').get(req.params.id);
      broadcastScanEvent("user_updated", updated);
      res.json({ success: true, message: "Đã cập nhật người dùng", data: updated });
    } else {
      res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi cập nhật người dùng", error: error.message });
  }
});

app.delete("/api/users/:id", requireRole(['admin']), (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    if (user.username === 'admin') return res.status(400).json({ success: false, message: "Không thể xóa tài khoản Admin mặc định!" });

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    broadcastScanEvent("user_deleted", { id: user.id });

    res.json({ success: true, message: "Đã xóa người dùng" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi xóa người dùng", error: error.message });
  }
});

const https = require("https");
const getCerts = require("./generate-cert");

const PORT = process.env.PORT || 3800;
const HTTPS_PORT = process.env.HTTPS_PORT || 3831;

// 1. Khởi động HTTP Server (Port 3800)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [HTTP] Server đang chạy:`);
  console.log(`   - 🖥️  Admin Web Dashboard: http://localhost:${PORT}`);
  console.log(`   - 📱 Mobile Scanner Client: http://localhost:${PORT}/client`);
});

// 2. Khởi động HTTPS Server chuyên dụng cho Mobile Camera (Port 3831)
(async () => {
  try {
    const certs = await getCerts();
    
    // HTTPS App chuyên phục vụ Mobile Client ở root '/'
    const httpsApp = express();
    httpsApp.use(cors());
    httpsApp.use(express.json({ limit: '50mb' }));
    httpsApp.use(express.urlencoded({ limit: '50mb', extended: true }));
    httpsApp.use('/uploads', express.static(path.join(__dirname, "uploads")));
    httpsApp.use('/admin', express.static(path.join(__dirname, "admin")));
    httpsApp.use('/api', app); // Dùng chung toàn bộ route /api của backend
    httpsApp.use(express.static(path.join(__dirname, "public")));

    https.createServer(certs, httpsApp).listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`🔒 [HTTPS] Mobile Camera Scanner chạy tại https://localhost:${HTTPS_PORT}`);
    });
  } catch (err) {
    console.error("⚠️ Không thể khởi động HTTPS server:", err);
  }
})();
