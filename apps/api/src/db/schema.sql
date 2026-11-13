PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Users: anonymous session-based identity
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  username     TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_seed  TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  owner_id         TEXT NOT NULL REFERENCES users(id),
  visibility       TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private')),
  password_hash    TEXT,
  max_participants INTEGER NOT NULL DEFAULT 50,
  status           TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at        TEXT
);

-- Room members (current state)
CREATE TABLE IF NOT EXISTS room_members (
  id               TEXT PRIMARY KEY,
  room_id          TEXT NOT NULL REFERENCES rooms(id),
  user_id          TEXT NOT NULL REFERENCES users(id),
  role             TEXT NOT NULL DEFAULT 'AUDIENCE' CHECK(role IN ('OWNER','MODERATOR','SPEAKER','AUDIENCE')),
  joined_at        TEXT NOT NULL DEFAULT (datetime('now')),
  left_at          TEXT,
  connection_state TEXT NOT NULL DEFAULT 'connected' CHECK(connection_state IN ('connected','disconnected')),
  muted            INTEGER NOT NULL DEFAULT 0,
  gain             REAL NOT NULL DEFAULT 1.0,
  UNIQUE(room_id, user_id)
);

-- Per-user permissions within a room
CREATE TABLE IF NOT EXISTS room_permissions (
  id             TEXT PRIMARY KEY,
  room_id        TEXT NOT NULL REFERENCES rooms(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  permission_key TEXT NOT NULL,
  granted_by     TEXT NOT NULL REFERENCES users(id),
  expires_at     TEXT,
  UNIQUE(room_id, user_id, permission_key)
);

-- Hand raise requests
CREATE TABLE IF NOT EXISTS hand_requests (
  id          TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL REFERENCES rooms(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled','expired')),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  expires_at  TEXT
);

-- Room playback state (one row per room, upserted)
CREATE TABLE IF NOT EXISTS room_playback (
  room_id        TEXT PRIMARY KEY REFERENCES rooms(id),
  video_id       TEXT,
  title          TEXT,
  state          TEXT NOT NULL DEFAULT 'paused' CHECK(state IN ('playing','paused','buffering','ended')),
  position_seconds REAL NOT NULL DEFAULT 0,
  anchor_time    TEXT NOT NULL DEFAULT (datetime('now')),
  playback_rate  REAL NOT NULL DEFAULT 1.0,
  updated_by     TEXT REFERENCES users(id),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Song queue
CREATE TABLE IF NOT EXISTS song_queue (
  id             TEXT PRIMARY KEY,
  room_id        TEXT NOT NULL REFERENCES rooms(id),
  video_id       TEXT NOT NULL,
  title          TEXT NOT NULL,
  thumbnail      TEXT NOT NULL DEFAULT '',
  requested_by   TEXT NOT NULL REFERENCES users(id),
  queue_position INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','playing','played','removed')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Moderation log
CREATE TABLE IF NOT EXISTS room_moderation (
  id             TEXT PRIMARY KEY,
  room_id        TEXT NOT NULL REFERENCES rooms(id),
  actor_id       TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  action         TEXT NOT NULL,
  reason         TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Invite codes
CREATE TABLE IF NOT EXISTS invitations (
  id          TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL REFERENCES rooms(id),
  invite_code TEXT NOT NULL UNIQUE,
  created_by  TEXT NOT NULL REFERENCES users(id),
  expires_at  TEXT,
  max_uses    INTEGER,
  used_count  INTEGER NOT NULL DEFAULT 0
);

-- Bans
CREATE TABLE IF NOT EXISTS bans (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES rooms(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  banned_by  TEXT NOT NULL REFERENCES users(id),
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(room_id, user_id)
);

-- Sessions (token-based auth, no passwords for users)
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  token      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_hand_requests_room ON hand_requests(room_id, status);
CREATE INDEX IF NOT EXISTS idx_song_queue_room ON song_queue(room_id, status, queue_position);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(invite_code);
CREATE INDEX IF NOT EXISTS idx_bans_room_user ON bans(room_id, user_id);
