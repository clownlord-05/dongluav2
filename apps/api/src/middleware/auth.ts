import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db';

export interface AuthRequest extends Request {
  userId?: string;
  sessionId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing auth token' });
    return;
  }

  const db = getDb();
  const session = db.prepare(`
    SELECT s.id, s.user_id FROM sessions s
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as { id: string; user_id: string } | undefined;

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
