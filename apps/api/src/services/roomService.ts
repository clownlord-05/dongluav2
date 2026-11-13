import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Room, RoomView } from '@dongluav2/shared-types';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateUniqueCode(): string {
  const db = getDb();
  let code: string;
  let attempts = 0;
  do {
    code = generateRoomCode();
    attempts++;
    if (attempts > 50) throw new Error('Failed to generate unique room code');
  } while (db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code));
  return code;
}

export interface CreateRoomInput {
  name: string;
  owner_id: string;
  visibility?: 'public' | 'private';
  password?: string;
  max_participants?: number;
}

export function createRoom(input: CreateRoomInput): Room {
  const db = getDb();
  const id = uuidv4();
  const code = generateUniqueCode();
  const password_hash = input.password ? bcrypt.hashSync(input.password, 10) : null;

  db.prepare(`
    INSERT INTO rooms (id, code, name, owner_id, visibility, password_hash, max_participants, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(id, code, input.name, input.owner_id, input.visibility || 'public', password_hash, input.max_participants || 50);

  // Add owner as OWNER member
  db.prepare(`
    INSERT INTO room_members (id, room_id, user_id, role, connection_state)
    VALUES (?, ?, ?, 'OWNER', 'connected')
  `).run(uuidv4(), id, input.owner_id);

  // Initialize playback state
  db.prepare(`
    INSERT INTO room_playback (room_id, state, position_seconds, anchor_time, playback_rate)
    VALUES (?, 'paused', 0, datetime('now'), 1.0)
  `).run(id);

  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as Room;
}

export function getRoomByCode(code: string): Room | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM rooms WHERE code = ? AND status = ?').get(code, 'active') as Room | undefined;
}

export function getRoomById(id: string): Room | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as Room | undefined;
}

export function getRoomView(room: Room): RoomView {
  const db = getDb();
  const memberRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM room_members
    WHERE room_id = ? AND left_at IS NULL AND connection_state = 'connected'
  `).get(room.id) as { cnt: number };

  const speakerRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM room_members
    WHERE room_id = ? AND role = 'SPEAKER' AND left_at IS NULL
  `).get(room.id) as { cnt: number };

  return {
    id: room.id,
    code: room.code,
    name: room.name,
    owner_id: room.owner_id,
    visibility: room.visibility,
    has_password: !!room.password_hash,
    max_participants: room.max_participants,
    status: room.status,
    created_at: room.created_at,
    member_count: memberRow?.cnt || 0,
    speaker_count: speakerRow?.cnt || 0,
  };
}

export function listPublicRooms(): RoomView[] {
  const db = getDb();
  const rooms = db.prepare(`
    SELECT * FROM rooms WHERE visibility = 'public' AND status = 'active'
    ORDER BY created_at DESC LIMIT 50
  `).all() as Room[];
  return rooms.map(getRoomView);
}

export function closeRoom(roomId: string, userId: string): void {
  const db = getDb();
  const room = getRoomById(roomId);
  if (!room) throw new Error('Room not found');
  if (room.owner_id !== userId) throw new Error('Only owner can close room');
  db.prepare(`UPDATE rooms SET status = 'closed', closed_at = datetime('now') WHERE id = ?`).run(roomId);
}

export function validateRoomPassword(room: Room, password?: string): boolean {
  if (!room.password_hash) return true;
  if (!password) return false;
  return bcrypt.compareSync(password, room.password_hash);
}
