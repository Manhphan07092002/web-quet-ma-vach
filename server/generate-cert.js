const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

const keyPath = path.join(__dirname, 'key.pem');
const certPath = path.join(__dirname, 'cert.pem');

async function getCerts() {
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log("Đang tạo chứng chỉ SSL tự ký cho mạng LAN...");
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    // selfsigned.generate trả về Promise ở các phiên bản mới
    const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });
    
    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
    console.log("Đã tạo xong chứng chỉ SSL.");
  }

  return {
    key: fs.readFileSync(keyPath, 'utf8'),
    cert: fs.readFileSync(certPath, 'utf8')
  };
}

module.exports = getCerts;
