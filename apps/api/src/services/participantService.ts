import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { MemberView, UserRole } from '@dongluav2/shared-types';

export interface RawMember {
  id: string;
  room_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
  left_at: string | null;
  connection_state: 'connected' | 'disconnected';
  muted: number;
  gain: number;
}

export interface RawUser {
  id: string;
  username: string;
  display_name: string;
  avatar_seed: string;
  created_at: string;
}

export function getActiveMember(roomId: string, userId: string): RawMember | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM room_members WHERE room_id = ? AND user_id = ? AND left_at IS NULL
  `).get(roomId, userId) as RawMember | undefined;
}

export function getRoomMemberCount(roomId: string): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM room_members WHERE room_id = ? AND left_at IS NULL
  `).get(roomId) as { count: number } | undefined;
  return row?.count || 0;
}

export function getRoomMembers(roomId: string, limit: number = 100): MemberView[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT rm.user_id, rm.role, rm.connection_state, rm.muted, rm.gain,
           u.display_name, u.avatar_seed
    FROM room_members rm
    JOIN users u ON u.id = rm.user_id
    WHERE rm.room_id = ? AND rm.left_at IS NULL
    ORDER BY 
      CASE rm.role 
        WHEN 'OWNER' THEN 1 
        WHEN 'MODERATOR' THEN 2 
        WHEN 'SPEAKER' THEN 3 
        ELSE 4 
      END ASC,
      rm.joined_at ASC
    LIMIT ?
  `).all(roomId, limit) as Array<{
    user_id: string; role: UserRole; connection_state: 'connected' | 'disconnected';
    muted: number; gain: number; display_name: string; avatar_seed: string;
  }>;

  return rows.map(r => ({
    user_id: r.user_id,
    display_name: r.display_name,
    avatar_seed: r.avatar_seed,
    role: r.role,
    connection_state: r.connection_state,
    muted: r.muted === 1,
    gain: r.gain,
  }));
}

export function joinRoom(
  roomId: string,
  userId: string,
  role: UserRole = 'AUDIENCE'
): RawMember {
  const db = getDb();
  const existing = db.prepare(`
    SELECT * FROM room_members WHERE room_id = ? AND user_id = ?
  `).get(roomId, userId) as RawMember | undefined;

  if (existing) {
    // Re-join: clear left_at and restore connection
    db.prepare(`
      UPDATE room_members
      SET left_at = NULL, connection_state = 'connected', joined_at = datetime('now')
      WHERE room_id = ? AND user_id = ?
    `).run(roomId, userId);
    return db.prepare('SELECT * FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId) as RawMember;
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO room_members (id, room_id, user_id, role, connection_state)
    VALUES (?, ?, ?, ?, 'connected')
  `).run(id, roomId, userId, role);

  return db.prepare('SELECT * FROM room_members WHERE id = ?').get(id) as RawMember;
}

export function leaveRoom(roomId: string, userId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE room_members SET left_at = datetime('now'), connection_state = 'disconnected'
    WHERE room_id = ? AND user_id = ? AND left_at IS NULL
  `).run(roomId, userId);
}

export function setMemberRole(roomId: string, userId: string, role: UserRole): void {
  const db = getDb();
  db.prepare(`
    UPDATE room_members SET role = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL
  `).run(role, roomId, userId);
}

export function setMemberMuted(roomId: string, userId: string, muted: boolean): void {
  const db = getDb();
  db.prepare(`
    UPDATE room_members SET muted = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL
  `).run(muted ? 1 : 0, roomId, userId);
}

export function setMemberGain(roomId: string, userId: string, gain: number): void {
  const db = getDb();
  const clamped = Math.max(0, Math.min(2.0, gain));
  db.prepare(`
    UPDATE room_members SET gain = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL
  `).run(clamped, roomId, userId);
}

export function isBanned(roomId: string, userId: string): boolean {
  const db = getDb();
  const ban = db.prepare('SELECT 1 FROM bans WHERE room_id = ? AND user_id = ?').get(roomId, userId);
  return !!ban;
}

export function banUser(
  roomId: string,
  targetUserId: string,
  bannedBy: string,
  reason?: string
): void {
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT OR REPLACE INTO bans (id, room_id, user_id, banned_by, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, roomId, targetUserId, bannedBy, reason || null);
  // Also force-leave
  leaveRoom(roomId, targetUserId);
}

export function logModeration(
  roomId: string,
  actorId: string,
  targetUserId: string,
  action: string,
  reason?: string
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO room_moderation (id, room_id, actor_id, target_user_id, action, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), roomId, actorId, targetUserId, action, reason || null);
}

export function getUserById(userId: string): RawUser | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as RawUser | undefined;
}
