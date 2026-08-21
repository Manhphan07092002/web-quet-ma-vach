# ==========================================
# DOCKERFILE CHO HỆ THỐNG QUÉT MÃ VẠCH KHO
# ==========================================
FROM node:20-bookworm-slim

WORKDIR /app

# Cài đặt các thư viện hệ thống cần thiết để biên dịch native C++ addons (better-sqlite3 & canvas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy file định nghĩa package
COPY server/package*.json ./server/

# Cài đặt dependencies trong thư mục server
WORKDIR /app/server
RUN npm install --production

# Copy toàn bộ mã nguồn server vào container
WORKDIR /app
COPY server ./server

# Tạo thư mục lưu trữ uploads nếu chưa có
RUN mkdir -p /app/server/uploads

# Thiết lập biến môi trường
ENV NODE_ENV=production
ENV PORT=3800
ENV HTTPS_PORT=3831

# Expose 2 cổng dịch vụ:
# - 3800: Admin Web Dashboard & Backend API
# - 3831: Mobile Client HTTPS Camera Scanner
EXPOSE 3800 3831

# Khởi chạy hệ thống bằng lệnh npm start (chạy song song app.js và frontend.js)
WORKDIR /app/server
CMD ["npm", "start"]
