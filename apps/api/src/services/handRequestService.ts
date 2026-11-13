import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { HandRequest, HandRequestStatus } from '../types/shared';

const REQUEST_TTL_MINUTES = 10;

export function raiseHand(roomId: string, userId: string): HandRequest & { display_name?: string; avatar_seed?: string } {
  const db = getDb();

  // Cancel any existing pending request
  db.prepare(`
    UPDATE hand_requests SET status = 'cancelled'
    WHERE room_id = ? AND user_id = ? AND status = 'pending'
  `).run(roomId, userId);

  // Determine position
  const posRow = db.prepare(`
    SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
    FROM hand_requests WHERE room_id = ? AND status = 'pending'
  `).get(roomId) as { next_pos: number };

  const id = uuidv4();
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + REQUEST_TTL_MINUTES * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO hand_requests (id, room_id, user_id, status, position, created_at, expires_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?)
  `).run(id, roomId, userId, posRow.next_pos, nowIso, expiresAt);

  return db.prepare(`
    SELECT hr.*, u.display_name, u.avatar_seed
    FROM hand_requests hr
    JOIN users u ON hr.user_id = u.id
    WHERE hr.id = ?
  `).get(id) as any;
}

export function cancelHandRequest(requestId: string, userId: string): HandRequest | undefined {
  const db = getDb();
  const req = db.prepare(`
    SELECT * FROM hand_requests WHERE id = ? AND user_id = ? AND status = 'pending'
  `).get(requestId, userId) as HandRequest | undefined;
  if (!req) return undefined;

  db.prepare(`UPDATE hand_requests SET status = 'cancelled' WHERE id = ?`).run(requestId);
  return db.prepare('SELECT * FROM hand_requests WHERE id = ?').get(requestId) as HandRequest;
}

export function reviewHandRequest(
  requestId: string,
  reviewerId: string,
  approve: boolean
): (HandRequest & { display_name?: string; avatar_seed?: string }) | undefined {
  const db = getDb();
  const req = db.prepare(`
    SELECT * FROM hand_requests WHERE id = ? AND status = 'pending'
  `).get(requestId) as HandRequest | undefined;
  if (!req) return undefined;

  const newStatus: HandRequestStatus = approve ? 'approved' : 'rejected';
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE hand_requests
    SET status = ?, reviewed_by = ?, reviewed_at = ?
    WHERE id = ?
  `).run(newStatus, reviewerId, nowIso, requestId);

  return db.prepare(`
    SELECT hr.*, u.display_name, u.avatar_seed
    FROM hand_requests hr
    JOIN users u ON hr.user_id = u.id
    WHERE hr.id = ?
  `).get(requestId) as any;
}

export function getPendingRequests(roomId: string): (HandRequest & { display_name: string; avatar_seed: string })[] {
  const db = getDb();
  const nowIso = new Date().toISOString();
  return db.prepare(`
    SELECT hr.*, u.display_name, u.avatar_seed
    FROM hand_requests hr
    JOIN users u ON hr.user_id = u.id
    WHERE hr.room_id = ? AND hr.status = 'pending'
      AND (hr.expires_at IS NULL OR hr.expires_at > ?)
    ORDER BY hr.position ASC
  `).all(roomId, nowIso) as any[];
}

export function getUserPendingRequest(roomId: string, userId: string): HandRequest | undefined {
  const db = getDb();
  const nowIso = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM hand_requests
    WHERE room_id = ? AND user_id = ? AND status = 'pending'
      AND (expires_at IS NULL OR expires_at > ?)
  `).get(roomId, userId, nowIso) as HandRequest | undefined;
}
