import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// Avatar limit: 100KB base64 (~75KB actual image) to prevent DB bloat
const MAX_AVATAR_BYTES = 100_000;

function sanitizeAvatar(raw: any): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  // Allow emoji: prefix, http(s):// URLs, and data:image/ base64
  if (trimmed.startsWith('emoji:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.slice(0, 2048); // URLs are short
  }
  if (trimmed.startsWith('data:image/')) {
    return trimmed.slice(0, MAX_AVATAR_BYTES); // limit base64 size
  }
  return trimmed.slice(0, 128); // gradient seed
}
// Creates or restores a user session. Body: { username, display_name, avatar_seed }
router.post('/session', authLimiter, (req: Request, res: Response): void => {
  const { username, display_name, avatar_seed } = req.body || {};

  const cleanDisplayName = (display_name || username || `Ca Sĩ #${Math.floor(1000 + Math.random() * 9000)}`).trim().slice(0, 64);
  const rawUsername = username && typeof username === 'string' && username.trim().length >= 2
    ? username.trim()
    : `user_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const cleanUsername = rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);
  const cleanAvatarSeed = typeof avatar_seed === 'string' && avatar_seed.trim()
    ? sanitizeAvatar(avatar_seed)
    : cleanUsername;

  const db = getDb();

  // Find or create user
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername) as
    { id: string; username: string; display_name: string; avatar_seed: string; created_at: string } | undefined;

  if (!user) {
    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, username, display_name, avatar_seed)
      VALUES (?, ?, ?, ?)
    `).run(userId, cleanUsername, cleanDisplayName, cleanAvatarSeed);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as typeof user;
  } else {
    // Update display_name and avatar_seed if provided
    if (display_name || avatar_seed) {
      db.prepare(`
        UPDATE users SET display_name = ?, avatar_seed = ? WHERE id = ?
      `).run(cleanDisplayName, cleanAvatarSeed, user!.id);
    }
  }

  if (!user) {
    res.status(500).json({ error: 'Failed to create user' });
    return;
  }

  // Create session token
  const token = uuidv4() + '-' + uuidv4();
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  db.prepare(`
    INSERT INTO sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, user.id, token, expiresAt);

  // Refresh user data
  const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as typeof user;

  res.status(201).json({
    token,
    expires_at: expiresAt,
    user: {
      id: freshUser!.id,
      username: freshUser!.username,
      display_name: freshUser!.display_name,
      avatar_seed: freshUser!.avatar_seed,
    },
  });
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response): void => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  const token = auth.slice(7);
  const db = getDb();
  const session = db.prepare(`
    SELECT s.user_id FROM sessions s
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as { user_id: string } | undefined;

  if (!session) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  const user = db.prepare('SELECT id, username, display_name, avatar_seed, created_at FROM users WHERE id = ?')
    .get(session.user_id) as { id: string; username: string; display_name: string; avatar_seed: string; created_at: string } | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user });
});

// PATCH /api/auth/profile  (update nickname or avatar)
router.patch('/profile', (req: Request, res: Response): void => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  const token = auth.slice(7);
  const db = getDb();
  const session = db.prepare(`
    SELECT s.user_id FROM sessions s
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as { user_id: string } | undefined;

  if (!session) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  const { display_name, avatar_seed } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const newDisplayName = typeof display_name === 'string' && display_name.trim()
    ? display_name.trim().slice(0, 64)
    : user.display_name;
  const newAvatarSeed = typeof avatar_seed === 'string'
    ? sanitizeAvatar(avatar_seed)
    : user.avatar_seed;

  db.prepare(`
    UPDATE users SET display_name = ?, avatar_seed = ? WHERE id = ?
  `).run(newDisplayName, newAvatarSeed, user.id);

  const updatedUser = db.prepare('SELECT id, username, display_name, avatar_seed, created_at FROM users WHERE id = ?').get(user.id);
  res.json({ user: updatedUser });
});

// POST alias for profile update
router.post('/profile', (req: Request, res: Response): void => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  const token = auth.slice(7);
  const db = getDb();
  const session = db.prepare(`
    SELECT s.user_id FROM sessions s
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as { user_id: string } | undefined;

  if (!session) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }

  const { display_name, avatar_seed } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const newDisplayName = typeof display_name === 'string' && display_name.trim()
    ? display_name.trim().slice(0, 64)
    : user.display_name;
  const newAvatarSeed = typeof avatar_seed === 'string'
    ? sanitizeAvatar(avatar_seed)
    : user.avatar_seed;

  db.prepare(`
    UPDATE users SET display_name = ?, avatar_seed = ? WHERE id = ?
  `).run(newDisplayName, newAvatarSeed, user.id);

  const updatedUser = db.prepare('SELECT id, username, display_name, avatar_seed, created_at FROM users WHERE id = ?').get(user.id);
  res.json({ user: updatedUser });
});

// DELETE /api/auth/session  (logout)
router.delete('/session', (req: Request, res: Response): void => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(204).send();
    return;
  }
  const token = auth.slice(7);
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.status(204).send();
});

export default router;
