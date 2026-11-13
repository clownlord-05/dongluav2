# 🔥 HƯỚNG DẪN DEPLOY ĐỐNG LỬA V2 — MIỄN PHÍ 100% & CHẠY 24/24 ỔN ĐỊNH

> Tài liệu này hướng dẫn bạn đưa web **ĐỐNG LỬA V2** lên Internet, có **tên miền HTTPS miễn phí**, hỗ trợ **WebSocket âm thanh + chat thời gian thực** và **hoạt động 24/24 không bị ngủ**.

---

## 🏆 CÁCH 1: RENDER.COM + UPTIMEROBOT (KHUYÊN DÙNG NHẤT — 5 PHÚT LÀ XONG)

Render là dịch vụ đám mây số 1 cho các ứng dụng Node.js/Docker có WebSocket.

### Ưu điểm:
- **Tên miền miễn phí**: `https://ten-ung-dung-cua-ban.onrender.com` (Đã tích hợp sẵn HTTPS và WSS an toàn).
- **Cả Web + API + Socket chạy chung 1 link**: Không bị lỗi CORS, không cần cấu hình phức tạp.
- **Chi phí**: **0 đồng** (Không cần nhập thẻ ngân hàng).

---

### BƯỚC 1: Đưa Code Lên GitHub

Mở PowerShell tại thư mục dự án `d:\haynghetaohat` và chạy các lệnh sau:

```powershell
# 1. Khởi tạo Git
git init

# 2. Thêm tất cả file
git add .

# 3. Commit
git commit -m "Deploy Dong Lua V2"

# 4. Tạo 1 repository mới trên GitHub (ví dụ: dong-lua-v2) rồi liên kết và push:
git branch -M main
git remote add origin https://github.com/TÊN_GITHUB_CỦA_BẠN/dong-lua-v2.git
git push -u origin main
```

---

### BƯỚC 2: Tạo Web Service Trên Render.com

1. Truy cập [https://render.com](https://render.com) và bấm **Sign Up** (đăng nhập bằng tài khoản GitHub).
2. Ở trang điều khiển (Dashboard), bấm **New +** ➔ Chọn **Web Service**.
3. Chọn **Build and deploy from a Git repository** ➔ Chọn repository `dong-lua-v2` bạn vừa tải lên.
4. Điền các thông tin:
   - **Name**: `dong-lua-v2` (hoặc tên bất kỳ bạn thích, tên này sẽ là link: `https://dong-lua-v2.onrender.com`).
   - **Region**: Chọn **Singapore** (gần Việt Nam nhất, ping thấp nhất).
   - **Language / Environment**: Chọn **Docker** (Hệ thống sẽ tự nhận file `Dockerfile` đã tạo sẵn trong repo).
   - **Instance Type**: Chọn **Free** (0$/tháng).
5. Kéo xuống phần **Advanced** ➔ Bấm **Add Environment Variable**:
   - Key: `NODE_ENV` | Value: `production`
   - Key: `CORS_ORIGIN` | Value: `*`
6. Bấm nút **Create Web Service**.
7. Chờ 3-4 phút để Render build xong. Khi thấy báo `Live` màu xanh, bạn bấm vào đường link `https://xxx.onrender.com` là web hoạt động ngay!

---

### BƯỚC 3: Giữ Web Chạy 24/24 Không Bao Giờ Ngủ (Keep-Alive)

Mặc định gói miễn phí của Render sẽ tạm dừng (sleep) sau 15 phút nếu không có ai truy cập. Ta dùng dịch vụ giám sát miễn phí để ping tự động, giúp **web thức 24/24**:

1. Đăng ký tài khoản miễn phí tại [https://uptimerobot.com](https://uptimerobot.com) (hoặc [https://cron-job.org](https://cron-job.org)).
2. Bấm **Add New Monitor**:
   - **Monitor Type**: Chọn **HTTP(s)**
   - **Friendly Name**: `Dong Lua V2 Keep Alive`
   - **URL (or IP)**: Điền link health check của bạn:
     `https://ten-ung-dung-cua-ban.onrender.com/api/health`
   - **Monitoring Interval**: Chọn **10 minutes** (mỗi 10 phút ping 1 lần)
3. Bấm **Create Monitor**.
🎉 **Xong!** UptimeRobot sẽ tự động gõ cửa web của bạn mỗi 10 phút, server sẽ luôn trong trạng thái thức và sẵn sàng hoạt động 24/24!

---

## 🚀 CÁCH 2: HUGGING FACE SPACES (16GB RAM FREE — KHÔNG CẦN PING KEEP-ALIVE)

Hugging Face cho phép chạy Docker Container hoàn toàn miễn phí với cấu hình cực mạnh (16GB RAM, 2 CPU) và **không bao giờ ngủ đối với các Space công khai**.

### Các bước:
1. Đăng ký tài khoản tại [https://huggingface.co](https://huggingface.co).
2. Vào [https://huggingface.co/new-space](https://huggingface.co/new-space).
3. Điền thông tin:
   - **Space name**: `dong-lua-v2`
   - **Space SDK**: Chọn **Docker** ➔ Chọn **Blank**
   - **Space hardware**: Chọn **CPU basic • 2 vCPU • 16GB RAM • Free**
   - **Visibility**: Chọn **Public** (Public mới được chạy 24/24 free)
4. Bấm **Create Space**.
5. Sau khi tạo xong, đẩy code từ máy lên kho Git của Hugging Face theo hướng dẫn hiển thị trên màn hình:
   ```powershell
   git remote add hf https://huggingface.co/spaces/TÊN_BẠN/dong-lua-v2
   git push -f hf main
   ```
6. Hugging Face sẽ tự động build từ `Dockerfile`.
   Link web của bạn sẽ là: `https://TÊN_BẠN-dong-lua-v2.hf.space`.

---

## 🌐 CÁCH 3: CLOUDFLARE TUNNEL (CHẠY TRỰC TIẾP TỪ MÁY BẠN 24/24)

Nếu bạn có máy tính/laptop cắm điện liên tục hoặc máy mini PC ở nhà:
- **Tên miền**: Miễn phí với HTTPS bảo mật cực cao của Cloudflare.
- **Không cần mở port router (No Port Forwarding)**, không sợ lộ IP mạng nhà.

### Các bước:
1. Tải công cụ `cloudflared` từ Cloudflare: [https://github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases) (bản Windows `cloudflared-windows-amd64.exe`).
2. Khởi động server backend trên máy:
   ```powershell
   cd d:\haynghetaohat\apps\api
   node dist/index.js
   ```
3. Mở thêm 1 cửa sổ PowerShell và chạy:
   ```powershell
   cloudflared tunnel --url http://localhost:3001
   ```
4. Cloudflare sẽ tạo cho bạn 1 đường link công khai dạng:
   `https://random-words.trycloudflare.com`
   Bất kỳ ai trên thế giới cũng có thể bấm vào link này để vào phòng karaoke của bạn!

---

## 📋 BẢNG SO SÁNH CÁC GIẢI PHÁP

| Tiêu chí | Cách 1: Render + UptimeRobot | Cách 2: Hugging Face Spaces | Cách 3: Cloudflare Tunnel |
| :--- | :--- | :--- | :--- |
| **Chi phí** | 0 VNĐ | 0 VNĐ | 0 VNĐ |
| **Yêu cầu thẻ ngân hàng** | ❌ Không cần | ❌ Không cần | ❌ Không cần |
| **Tên miền miễn phí** | `*.onrender.com` | `*.hf.space` | `*.trycloudflare.com` |
| **Độ ổn định 24/24** | ⭐️⭐️⭐️⭐️⭐️ (với UptimeRobot) | ⭐️⭐️⭐️⭐️⭐️ (Mặc định) | Phụ thuộc máy tính của bạn |
| **RAM** | 512 MB | 16 GB | RAM máy tính bạn |
| **Độ dễ cài đặt** | Dễ nhất (Khuyên dùng) | Rất dễ | Nhanh nhất |
