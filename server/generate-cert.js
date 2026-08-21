const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, 'certs');
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');

// Cũng hỗ trợ file cũ ở thư mục gốc server
const legacyKeyPath = path.join(__dirname, 'key.pem');
const legacyCertPath = path.join(__dirname, 'cert.pem');

async function getCerts() {
  try {
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }

    // Dọn dẹp nếu Docker mount nhầm key.pem/cert.pem thành folder
    [keyPath, certPath, legacyKeyPath, legacyCertPath].forEach(p => {
      try {
        if (fs.existsSync(p) && fs.lstatSync(p).isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true });
        }
      } catch (e) {}
    });

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return {
        key: fs.readFileSync(keyPath, 'utf8'),
        cert: fs.readFileSync(certPath, 'utf8')
      };
    }

    if (fs.existsSync(legacyKeyPath) && fs.existsSync(legacyCertPath)) {
      return {
        key: fs.readFileSync(legacyKeyPath, 'utf8'),
        cert: fs.readFileSync(legacyCertPath, 'utf8')
      };
    }

    console.log("🔒 Đang tạo chứng chỉ SSL tự ký cho Camera Mobile...");
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });
    
    try {
      fs.writeFileSync(keyPath, pems.private, 'utf8');
      fs.writeFileSync(certPath, pems.cert, 'utf8');
      console.log("✅ Đã lưu chứng chỉ SSL vào server/certs/");
    } catch(writeErr) {
      console.warn("⚠️ Không ghi được file certs ra đĩa, dùng trực tiếp từ RAM:", writeErr.message);
    }

    return { key: pems.private, cert: pems.cert };
  } catch (err) {
    console.warn("⚠️ Khởi tạo SSL fallback bộ nhớ RAM:", err.message);
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });
    return { key: pems.private, cert: pems.cert };
  }
}

module.exports = getCerts;

