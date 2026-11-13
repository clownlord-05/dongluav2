import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { HandRequest, HandRequestStatus } from '@dongluav2/shared-types';

const REQUEST_TTL_MINUTES = 10;

export function raiseHand(roomId: string, userId: string): HandRequest {
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
  const expiresAt = new Date(Date.now() + REQUEST_TTL_MINUTES * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO hand_requests (id, room_id, user_id, status, position, expires_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(id, roomId, userId, posRow.next_pos, expiresAt);

  return db.prepare('SELECT * FROM hand_requests WHERE id = ?').get(id) as HandRequest;
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
): HandRequest | undefined {
  const db = getDb();
  const req = db.prepare(`
    SELECT * FROM hand_requests WHERE id = ? AND status = 'pending'
  `).get(requestId) as HandRequest | undefined;
  if (!req) return undefined;

  const newStatus: HandRequestStatus = approve ? 'approved' : 'rejected';
  db.prepare(`
    UPDATE hand_requests
    SET status = ?, reviewed_by = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).run(newStatus, reviewerId, requestId);

  return db.prepare('SELECT * FROM hand_requests WHERE id = ?').get(requestId) as HandRequest;
}

export function getPendingRequests(roomId: string): HandRequest[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM hand_requests
    WHERE room_id = ? AND status = 'pending'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY position ASC
  `).all(roomId) as HandRequest[];
}

export function getUserPendingRequest(roomId: string, userId: string): HandRequest | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM hand_requests
    WHERE room_id = ? AND user_id = ? AND status = 'pending'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(roomId, userId) as HandRequest | undefined;
}
