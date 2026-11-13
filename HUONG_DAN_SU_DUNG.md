# 🔥 ĐỐNG LỬA V2 – HÃY NGHE TAO HÉT
### Nền tảng Karaoke Sân Khấu Trực Tuyến • Discord-Style Stage • YouTube Sync • RAW Audio 48kHz

---

## 🎯 1. TỔNG QUAN HỆ THỐNG ĐÃ HOÀN THIỆN

Dựa trên tài liệu đặc tả `DONG_LUA_V2_HAY_NGHE_TAO_HET_Dac_ta_du_an.docx`, hệ thống đã được xây dựng hoàn chỉnh với các công nghệ:

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Zustand State Store.
- **Backend**: Node.js, Express, Socket.IO Real-time, SQLite WebAssembly (không phụ thuộc C++ build tools, chạy mượt trên mọi máy Windows/Linux/Mac).
- **Âm thanh RAW Studio**: Thu âm trực tiếp bằng Web Audio API với ràng buộc `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`, `sampleRate: 48000Hz`. Có VU meter đo mức âm lượng thời gian thực.
- **Player YouTube**: Nhúng chính thức qua **YouTube IFrame Player API**, đồng bộ `play`, `pause`, `seek`, hàng chờ bài hát tập trung từ Chủ phòng (Host) tới tất cả người nghe.
- **Sân khấu Discord-Stage**: 
  - Khán giả (Audience) vào phòng chỉ nghe, không phát mic bừa bãi.
  - Khán giả muốn hát bấm **"Giơ tay xin hát"**.
  - Chủ phòng (Host) kiểm tra hàng chờ và duyệt **"Đồng ý"** hoặc **"Từ chối"**.
  - Khi được duyệt, người hát nhận thông báo, xác nhận cấp mic RAW và lên sân khấu hát.
  - Chủ phòng có fader điều chỉnh volume từng người (0-150%), nút Mute từng người, Remove khỏi sân khấu, Kick hoặc Ban.

---

## 🚀 2. HƯỚNG DẪN KHỞI CHẠY NHANH

### Cách 1: Chạy toàn bộ ứng dụng (Đơn giản nhất - Đang chạy sẵn)
Hệ thống frontend đã được build sẵn vào backend. Bạn chỉ cần chạy:
```bash
cd d:\haynghetaohat\apps\api
node dist/index.js
```
👉 Mở trình duyệt truy cập: **`http://localhost:3001`**

### Cách 2: Chế độ phát triển (Hot-Reload)
Nếu muốn chỉnh sửa code và thấy thay đổi ngay lập tức:
- **Terminal 1 (Backend)**:
  ```bash
  cd d:\haynghetaohat\apps\api
  npm run dev
  ```
- **Terminal 2 (Frontend)**:
  ```bash
  cd d:\haynghetaohat\apps\web
  npm run dev
  ```
👉 Mở trình duyệt truy cập: **`http://localhost:5173`**

---

## 🎤 3. CHI TIẾT CÁC TÍNH NĂNG ĐẶC BIỆT

### A. Âm thanh Micro RAW (Không Lọc Âm)
- **Ràng buộc phần cứng**:
  ```javascript
  const rawConstraints = {
    echoCancellation: false, // TẮT chống vọng để không bóp méo dải âm ca hát
    noiseSuppression: false, // TẮT khử ồn để giữ nguyên âm ngân, hơi thở ca sĩ
    autoGainControl: false,  // TẮT bù âm lượng tự động để giữ trọn dynamic range
    channelCount: 1,
    sampleRate: 48000        // Tần số mẫu 48kHz chuẩn phòng thu
  };
  ```
- ⚠️ **LƯU Ý BẮT BUỘC**: Vì tính năng chống vọng (Echo Cancellation) được tắt theo yêu cầu âm thanh RAW, người hát **bắt buộc phải đeo tai nghe** khi lên sân khấu để tiếng nhạc từ loa ngoài không bị thu ngược lại vào mic gây hú/vọng.

### B. Cơ chế Quản lý Sân Khấu (Discord Stage)
1. **Khán giả**: Khi vào phòng chỉ ở trạng thái nghe. Dưới góc dưới màn hình có nút màu cam **"✋ Giơ Tay Xin Hát"**.
2. **Hàng chờ xin hát**: Chủ phòng thấy danh sách giơ tay ở cột giữa **"Xin hát"** với badge số lượng đỏ nhấp nháy.
3. **Duyệt lên sân khấu**: Chủ phòng bấm dấu tích xanh **`✓`** để duyệt.
4. **Xác nhận**: Người được duyệt sẽ thấy banner nổi màu vàng kim rực rỡ: *"Chủ phòng đã duyệt bạn lên sân khấu hát! Nhấn Lên hát ngay"*.
5. **Điều khiển âm lượng Host**:
   - Ở mục **"Sân Khấu Trực Tiếp"**, Chủ phòng có thanh trượt Fader âm lượng cho từng ca sĩ (0% đến 150%).
   - Nút **Mute / Unmute** tắt mic tức thì.
   - Nút **Đưa xuống khán giả** khi ca sĩ hát xong bài.
   - Nút **Kick** (Đuổi) và **Ban** (Cấm vào phòng).

### C. Đồng bộ Video YouTube Karaoke
- Hỗ trợ dán bất kỳ đường link YouTube nào (ví dụ: `https://www.youtube.com/watch?v=...`, `https://youtu.be/...` hoặc mã video 11 ký tự).
- **Hàng chờ bài hát**: Mọi người đều có thể dán link đề xuất bài hát vào danh sách chờ.
- **Chủ phòng điều khiển**:
  - Bấm **"Phát bài này"** trong hàng chờ.
  - Thanh tua thời gian (Seek bar), Tạm dừng (Pause), Phát tiếp (Play), Chuyển bài (Next).
  - Tự động đồng bộ mốc thời gian `currentTime` đến mọi người trong phòng qua WebSocket.

---

## 📁 4. CẤU TRÚC MÃ NGUỒN

```
d:\haynghetaohat\
├── apps/
│   ├── api/                  # Backend Node.js + Express + Socket.IO
│   │   ├── src/
│   │   │   ├── db/           # SQLite WebAssembly adapter & Schema SQL
│   │   │   ├── routes/       # REST API (Auth, Rooms, Participants, Songs, Hands)
│   │   │   ├── services/     # Nghiệp vụ Room, YouTube Sync, Hand Queue, LiveKit
│   │   │   ├── socket/       # Socket.IO Real-time Event Handlers
│   │   │   └── index.ts      # Server bootstrap + Static SPA serving
│   │   └── package.json
│   │
│   └── web/                  # Frontend React 18 + Vite + Tailwind CSS
│       ├── src/
│       │   ├── components/
│       │   │   ├── audio/    # Modal kiểm tra Mic RAW & đo VU Meter
│       │   │   ├── common/   # Header, Avatar động, Modal Nickname
│       │   │   └── room/     # YouTube Player, Sân khấu Podium, Quản trị, Chat & Hàng chờ bài
│       │   ├── hooks/        # useAudio (RAW), useYouTube, useRoom, useSocket, useHandRaise
│       │   ├── pages/        # HomePage, KaraokeRoomPage, CreateRoomModal, JoinRoomModal
│       │   ├── store/        # Zustand State Stores (Auth, Room, Audio, YouTube)
│       │   └── index.css     # Dark Fire Theme (#FF4500, #FFD700, #0D0D0D)
│       └── package.json
│
└── packages/
    └── shared-types/         # Các kiểu dữ liệu TypeScript dùng chung
```

---
*Chúc bạn có những giây phút ca hát bùng cháy cùng ĐỐNG LỬA V2 – HÃY NGHE TAO HÉT!* 🔥🎤
