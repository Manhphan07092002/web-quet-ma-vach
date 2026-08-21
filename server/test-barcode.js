const bwipjs = require('bwip-js');
const { createCanvas, loadImage } = require('canvas');
const { BrowserMultiFormatReader, HTMLCanvasElementLuminanceSource, BinaryBitmap, HybridBinarizer } = require('@zxing/library');
const fs = require('fs');

async function runTest() {
  const code = "i2407W01481B012600956";
  console.log(`Bắt đầu test mã vạch: ${code}`);

  try {
    // 1. Tạo hình ảnh mã Code 128 (Độ phân giải và mật độ tương tự ảnh gốc)
    const buffer = await bwipjs.toBuffer({
      bcid: 'code128',
      text: code,
      scale: 2, // Scale nhỏ gọn giống chụp từ điện thoại
      height: 15,
      includetext: true,
      textxalign: 'center',
      backgroundcolor: 'FFFFFF',
      padding: 10
    });
    
    fs.writeFileSync('test-barcode.png', buffer);
    console.log('✅ Đã tạo ảnh test-barcode.png');

    // 2. Load ảnh vào Node Canvas
    const img = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // 3. Test với ZXing JS (Cốt lõi của html5-qrcode đang dùng)
    console.log('⏳ Đang chạy thử ZXing JS (html5-qrcode)...');
    try {
      const reader = new BrowserMultiFormatReader();
      const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas);
      const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
      const result = reader.decodeBitmap(bitmap);
      console.log(`✅ [ZXing JS] KẾT QUẢ ĐỌC ĐƯỢC: ${result.getText()}`);
    } catch (err) {
      console.log(`❌ [ZXing JS] THẤT BẠI TỨC TƯỞI: Không thể nhận diện mã này! (Lý do: Thuật toán yếu)`);
    }

  } catch(e) {
    console.error("Lỗi tạo test:", e);
  }
}

runTest();
