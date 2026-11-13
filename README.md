# 🔥 ĐỐNG LỬA V2 – Nền Tảng Karaoke Realtime

Ứng dụng karaoke realtime nhiều người dùng với âm thanh WebRTC qua LiveKit, đồng bộ YouTube và quản lý phòng nâng cao.

---

## 📋 Yêu Cầu Hệ Thống

- **Node.js** >= 20.x
- **npm** >= 10.x
- **LiveKit Server** (cloud hoặc self-hosted)

---

## 🚀 Cài Đặt & Chạy Nhanh

### 1. Clone & Cài Dependencies

```bash
git clone <repo-url>
cd haynghetaohat
npm install
```

### 2. Cấu Hình Biến Môi Trường

```bash
# Copy file env mẫu
cp apps/api/.env.example apps/api/.env
```

Chỉnh sửa `apps/api/.env`:

```env
PORT=3001
DATABASE_PATH=./data/dongluav2.db
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
SESSION_SECRET=change_this_in_production
CORS_ORIGIN=http://localhost:5173
```

### 3. Build Shared Types

```bash
npm run build --workspace=packages/shared-types
```

### 4. Chạy Development

```bash
# Chạy cả API và Web cùng lúc
npm run dev

# Hoặc chạy riêng lẻ
npm run dev --workspace=apps/api    # API tại http://localhost:3001
npm run dev --workspace=apps/web    # Web tại http://localhost:5173
```

---

## 🏗️ Cấu Trúc Dự Án

```
haynghetaohat/
├── apps/
│   ├── api/                    # Backend Node.js + Express + Socket.IO
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point
│   │   │   ├── db/             # SQLite (better-sqlite3)
│   │   │   ├── routes/         # REST API routes
│   │   │   ├── socket/         # Socket.IO event handlers
│   │   │   ├── services/       # Business logic
│   │   │   └── middleware/     # Auth, rate limiting
│   │   └── package.json
│   └── web/                    # Frontend React + Vite + TypeScript
│       ├── src/
│       │   ├── components/     # UI components
│       │   ├── pages/          # Route pages
│       │   ├── hooks/          # Custom React hooks
│       │   ├── stores/         # Zustand state stores
│       │   └── lib/            # Utilities & API client
│       └── package.json
└── packages/
    └── shared-types/           # TypeScript types dùng chung
        ├── src/index.ts
        └── package.json
```

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/auth/session` | Tạo/lấy session người dùng |

### Rooms
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/rooms` | Danh sách phòng công khai |
| POST | `/api/rooms` | Tạo phòng mới |
| GET | `/api/rooms/:id` | Thông tin phòng |
| DELETE | `/api/rooms/:id` | Đóng phòng (owner only) |

### Participants
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/rooms/:id/participants` | Danh sách thành viên |
| POST | `/api/rooms/:id/join` | Vào phòng |
| POST | `/api/rooms/:id/leave` | Rời phòng |

### Hand Requests (Giơ Tay)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/rooms/:id/hand-requests` | Danh sách yêu cầu |
| POST | `/api/rooms/:id/hand-requests` | Giơ tay xin hát |
| PATCH | `/api/rooms/:id/hand-requests/:reqId` | Duyệt/từ chối |

### Song Queue
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/rooms/:id/songs` | Hàng chờ bài hát |
| POST | `/api/rooms/:id/songs` | Thêm bài vào hàng |
| DELETE | `/api/rooms/:id/songs/:songId` | Xóa bài khỏi hàng |

---

## 🔌 Socket.IO Events

### Client → Server
| Event | Payload | Mô tả |
|-------|---------|-------|
| `room:join` | `{ roomId, password? }` | Vào phòng |
| `room:leave` | `{ roomId }` | Rời phòng |
| `hand:raise` | `{ roomId, suggestedSong? }` | Giơ tay |
| `hand:cancel` | `{ roomId, requestId }` | Hủy giơ tay |
| `stage:accept` | `{ roomId, inviteId }` | Chấp nhận lên sân khấu |
| `stage:decline` | `{ roomId, inviteId }` | Từ chối lên sân khấu |
| `room:chat_message` | `{ roomId, text }` | Gửi tin nhắn chat |
| `room:song_add` | `{ roomId, videoId, title, thumbnail, channelName }` | Thêm bài hát |

### Host/Mod → Server
| Event | Payload | Mô tả |
|-------|---------|-------|
| `hand:approve` | `{ roomId, requestId }` | Duyệt yêu cầu |
| `hand:reject` | `{ roomId, requestId }` | Từ chối yêu cầu |
| `audio:mute` | `{ roomId, targetUserId }` | Tắt mic người dùng |
| `audio:gain_change` | `{ roomId, targetUserId, gain }` | Điều chỉnh âm lượng |
| `youtube:load` | `{ roomId, videoId, title? }` | Phát video mới |
| `youtube:play_at` | `{ roomId, videoId, position }` | Phát tại vị trí |
| `youtube:pause` | `{ roomId, position }` | Tạm dừng |
| `room:kick` | `{ roomId, targetUserId, reason? }` | Kick thành viên |
| `room:ban` | `{ roomId, targetUserId, reason? }` | Ban thành viên |

---

## 🐳 Docker (LiveKit Local Dev)

Dùng LiveKit server cục bộ cho development:

```bash
docker-compose up -d
```

LiveKit server sẽ chạy tại `ws://localhost:7880`.

Cập nhật `apps/api/.env`:
```env
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret
```

---

## 🛠️ Build Production

```bash
# Build tất cả
npm run build

# Chạy API production
cd apps/api && node dist/index.js
```

---

## 🎯 Tính Năng Chính

- 🎤 **Karaoke Realtime** – Âm thanh WebRTC qua LiveKit, độ trễ thấp
- 📺 **Đồng Bộ YouTube** – Tất cả người dùng xem cùng vị trí video
- 🙋 **Hệ Thống Giơ Tay** – Queue thứ tự hát công bằng
- 💬 **Chat Realtime** – Tin nhắn trực tiếp trong phòng
- 🎵 **Song Queue** – Danh sách bài chờ hát
- 🔇 **Điều Khiển Âm Thanh** – Host có thể mute/điều chỉnh gain từng người
- 🔒 **Phòng Có Mật Khẩu** – Bảo mật phòng riêng tư
- 👑 **Phân Quyền** – OWNER / MODERATOR / SPEAKER / AUDIENCE
