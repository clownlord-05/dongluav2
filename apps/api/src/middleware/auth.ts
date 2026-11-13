import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface AuthRequest extends Request {
  userId?: string;
  sessionId?: string;
}

export interface SessionInfo {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_seed: string;
}

export function extractUserHints(req: Request): {
  userId?: string;
  displayName?: string;
  avatarSeed?: string;
} {
  const rawId = req.headers['x-user-id'];
  const rawName = req.headers['x-user-name'];
  const rawAvatar = req.headers['x-user-avatar'];

  let displayName: string | undefined;
  let avatarSeed: string | undefined;
  try {
    if (typeof rawName === 'string' && rawName) displayName = decodeURIComponent(rawName);
  } catch {
    displayName = typeof rawName === 'string' ? rawName : undefined;
  }
  try {
    if (typeof rawAvatar === 'string' && rawAvatar) avatarSeed = decodeURIComponent(rawAvatar);
  } catch {
    avatarSeed = typeof rawAvatar === 'string' ? rawAvatar : undefined;
  }

  return {
    userId: typeof rawId === 'string' && rawId.trim() ? rawId.trim() : undefined,
    displayName,
    avatarSeed,
  };
}

/**
 * Looks up a session token in SQLite. If the container restarted or redeployed
 * (wiping in-memory SQLite), automatically re-provisions the guest user & session
 * so active browsers never see "Invalid or expired session".
 */
export function getOrRestoreSession(
  token: string,
  hints?: { userId?: string; displayName?: string; avatarSeed?: string }
): SessionInfo | undefined {
  const cleanToken = token?.trim();
  if (!cleanToken) return undefined;

  const db = getDb();
  const existing = db.prepare(`
    SELECT s.id, s.user_id, u.username, u.display_name, u.avatar_seed
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(cleanToken) as SessionInfo | undefined;

  if (existing) {
    return existing;
  }

  // Auto-restore guest session on the fly after server restart/redeploy
  const userId = hints?.userId && hints.userId.length >= 8 ? hints.userId.slice(0, 64) : uuidv4();
  const displayName = (hints?.displayName?.trim() || `Ca Sĩ #${Math.floor(1000 + Math.random() * 9000)}`).slice(0, 64);
  const baseUsername = `user_${userId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12)}_${Math.random().toString(36).slice(2, 5)}`;
  const avatarSeed = (hints?.avatarSeed?.trim() || baseUsername).slice(0, 100000);

  let user = db.prepare('SELECT id, username, display_name, avatar_seed FROM users WHERE id = ?').get(userId) as
    | { id: string; username: string; display_name: string; avatar_seed: string }
    | undefined;

  if (!user) {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, username, display_name, avatar_seed)
      VALUES (?, ?, ?, ?)
    `).run(userId, baseUsername, displayName, avatarSeed);
    user = db.prepare('SELECT id, username, display_name, avatar_seed FROM users WHERE id = ?').get(userId) as any;
  }

  if (!user) return undefined;

  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, user.id, cleanToken, expiresAt);

  return {
    id: sessionId,
    user_id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_seed: user.avatar_seed,
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing auth token' });
    return;
  }

  const session = getOrRestoreSession(token, extractUserHints(req));
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  req.userId = session.user_id;
  req.sessionId = session.id;
  next();
}

export function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const q = req.query['token'];
  if (typeof q === 'string') return q;
  return null;
}

export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const { roomId } = req.params;
    if (!req.userId || !roomId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const db = getDb();
    const member = db.prepare(`
      SELECT role FROM room_members
      WHERE room_id = ? AND user_id = ? AND left_at IS NULL
    `).get(roomId, req.userId) as { role: string } | undefined;

    if (!member || !roles.includes(member.role)) {
      res.status(403).json({ error: 'Insufficient role' });
      return;
    }
    next();
  };
}
