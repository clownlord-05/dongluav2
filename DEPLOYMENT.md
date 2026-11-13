# 🔥 ĐỐNG LỬA V2 — Deployment Guide

> Hướng dẫn triển khai production cho 5,000+ người dùng đồng thời.

---

## Yêu cầu tối thiểu

| Thành phần | Yêu cầu tối thiểu |
|-----------|-------------------|
| **CPU** | 4 cores (8 khuyến nghị) |
| **RAM** | 2 GB (4 GB khuyến nghị) |
| **Node.js** | v18+ (v20 LTS khuyến nghị) |
| **OS** | Ubuntu 22.04 / Debian 12 |
| **Mạng** | 100 Mbps upload tối thiểu |

---

## 1. Cài đặt OS-level limits (Linux Production)

Thêm vào `/etc/security/limits.conf`:
```
* soft nofile 65535
* hard nofile 65535
```

Thêm vào `/etc/sysctl.conf`:
```
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 60
```

Áp dụng:
```bash
sudo sysctl -p
```

---

## 2. Build

```bash
# Cài packages
npm install

# Build API + Web
npm --prefix apps/api run build
npm --prefix apps/web run build
```

---

## 3. Khởi động backend

```bash
# Với memory limit 512MB (đủ cho 5,000 connections)
node --max-old-space-size=512 apps/api/dist/index.js

# Hoặc dùng PM2 (khuyến nghị production):
pm2 start apps/api/dist/index.js \
  --name "dongluav2" \
  --node-args="--max-old-space-size=512" \
  --max-memory-restart 400M \
  --restart-delay=3000
```

---

## 4. Environment Variables

Tạo file `apps/api/.env`:
```env
PORT=3001
DATABASE_PATH=./data/dongluav2.db
JWT_SECRET=<your-long-random-secret>
CORS_ORIGIN=https://your-domain.com
LIVEKIT_API_KEY=your-lk-key
LIVEKIT_API_SECRET=your-lk-secret
LIVEKIT_HOST=wss://your-livekit-host
```

---

## 5. Nginx Reverse Proxy (khuyến nghị)

```nginx
upstream dongluav2_backend {
    server 127.0.0.1:3001;
    keepalive 128;
}

server {
    listen 80;
    server_name your-domain.com;

    # Serve static frontend
    root /path/to/haynghetaohat/apps/web/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://dongluav2_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
        proxy_buffering off;
    }

    # WebSocket proxy for Socket.IO
    location /socket.io/ {
        proxy_pass http://dongluav2_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
        proxy_buffering off;
    }
}
```

---

## 6. Giám sát hiệu năng

### PM2 monitoring
```bash
pm2 monit
pm2 logs dongluav2
```

### Kiểm tra số connections
```bash
ss -s
netstat -an | grep 3001 | wc -l
```

### Kiểm tra RAM & CPU
```bash
pm2 info dongluav2
```

---

## 7. Giới hạn kỹ thuật đã biết

| Giới hạn | Giá trị | Lý do |
|---------|---------|-------|
| **WebRTC P2P mesh** | Tối đa 8 ca sĩ sân khấu | N×N peer connections |
| **Audience relay** | 5,000+ | Binary PCM via Socket.IO |
| **Member list hiển thị** | 100 (API), 50 (UI) | Tránh render 5,000 DOM nodes |
| **Chat rate limit** | 4 tin/2.5 giây/user | Chống spam |
| **Audio level throttle** | 120ms/user | Giảm socket events |
| **DB save debounce** | 2 giây | Non-blocking async flush |
| **Session cache** | 5 phút TTL | Giảm DB query on auth |

---

## 8. Scale lên 10,000+ người dùng

Với > 5,000 users, cân nhắc:
- **Redis adapter** cho Socket.IO (multi-process cluster)
- **SFU thực sự** (LiveKit / Mediasoup) thay cho binary relay
- **PostgreSQL** thay cho sql.js (WASM SQLite)
- **Horizontal scaling** với PM2 cluster mode + Nginx upstream

```bash
# PM2 cluster (tận dụng tất cả CPU cores)
pm2 start apps/api/dist/index.js \
  --name "dongluav2" \
  --instances max \
  --node-args="--max-old-space-size=256"
# Lưu ý: Socket.IO cần Redis adapter khi dùng cluster mode
```
