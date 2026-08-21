const express = require("express");
const path = require("path");
const https = require("https");
const { createProxyMiddleware } = require('http-proxy-middleware');
const getCerts = require("./generate-cert");

(async () => {
  const certs = await getCerts();
  const app = express();

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Static uploads directory (cho ảnh chụp lúc quét)
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // Reverse proxy toàn diện cho mọi API (GET /api/scans, POST /api/scans, PUT /api/scans/:id, GET /api/products, v.v.)
  app.use('/api', async (req, res) => {
    try {
      const backendUrl = `http://127.0.0.1:3500${req.originalUrl}`;
      const headers = { ...req.headers };
      delete headers.host;

      const options = {
        method: req.method,
        headers: headers
      };

      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
        options.body = JSON.stringify(req.body);
        headers['content-type'] = 'application/json';
      }

      const response = await fetch(backendUrl, options);
      const contentType = response.headers.get('content-type') || '';

      res.status(response.status);
      if (contentType.includes('application/json')) {
        const data = await response.json();
        res.json(data);
      } else {
        const buffer = await response.arrayBuffer();
        res.set('content-type', contentType);
        res.send(Buffer.from(buffer));
      }
    } catch (err) {
      console.error("Proxy error:", err);
      res.status(500).json({ success: false, message: "Không thể kết nối tới máy chủ backend (Port 3500)" });
    }
  });

  // Serve frontend static files
  app.use(express.static(path.join(__dirname, "public")));

  const PORT = 3031;
  https.createServer(certs, app).listen(PORT, '0.0.0.0', () => {
    console.log(`Frontend Web Client chạy tại https://localhost:${PORT}`);
  });
})();
