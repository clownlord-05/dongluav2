import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { getActiveMember } from '../services/participantService';
import { loadVideo, playAt } from '../services/youtubeService';
import { getIo } from '../socket';
import { SongQueueItem } from '@dongluav2/shared-types';

const router = Router();

// GET /api/rooms/:roomId/songs
router.get('/:roomId/songs', (req: any, res: Response): void => {
  const { roomId } = req.params;
  const db = getDb();
  const songs = db.prepare(`
    SELECT sq.*, u.display_name as requested_by_name
    FROM song_queue sq
    JOIN users u ON u.id = sq.requested_by
    WHERE sq.room_id = ? AND sq.status = 'queued'
    ORDER BY sq.queue_position ASC, sq.created_at ASC
  `).all(roomId);
  res.json({ songs });
});

// POST /api/rooms/:roomId/songs
router.post('/:roomId/songs', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId } = req.params;
  const { video_id, title, thumbnail } = req.body;

  if (!video_id || typeof video_id !== 'string') {
    res.status(400).json({ error: 'video_id is required' });
    return;
  }

  const db = getDb();
  const maxPosRow = db.prepare(`
    SELECT COALESCE(MAX(queue_position), 0) + 1 as next_pos
    FROM song_queue WHERE room_id = ? AND status = 'queued'
  `).get(roomId) as { next_pos: number };

  const id = uuidv4();
  const cleanTitle = (title || 'Karaoke Song').slice(0, 200);
  const cleanThumb = (thumbnail || `https://img.youtube.com/vi/${video_id}/mqdefault.jpg`).slice(0, 500);

  db.prepare(`
    INSERT INTO song_queue (id, room_id, video_id, title, thumbnail, requested_by, queue_position, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')
  `).run(id, roomId, video_id, cleanTitle, cleanThumb, req.userId!, maxPosRow.next_pos);

  const newSong = db.prepare(`
    SELECT sq.*, u.display_name as requested_by_name
    FROM song_queue sq
    JOIN users u ON u.id = sq.requested_by
    WHERE sq.id = ?
  `).get(id);

  const io = getIo();
  io.to(roomId).emit('room:song_add', newSong);

  res.status(201).json({ song: newSong });
});

// DELETE /api/rooms/:roomId/songs/:songId
router.delete('/:roomId/songs/:songId', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId, songId } = req.params;
  const db = getDb();

  const song = db.prepare('SELECT * FROM song_queue WHERE id = ? AND room_id = ?').get(songId, roomId) as any;
  if (!song) {
    res.status(404).json({ error: 'Song not found' });
    return;
  }

  const member = getActiveMember(roomId, req.userId!);
  const isHost = member && ['OWNER', 'MODERATOR'].includes(member.role);
  const isRequester = song.requested_by === req.userId;

  if (!isHost && !isRequester) {
    res.status(403).json({ error: 'Not authorized to remove this song' });
    return;
  }

  db.prepare(`UPDATE song_queue SET status = 'removed' WHERE id = ?`).run(songId);

  const io = getIo();
  io.to(roomId).emit('room:song_remove', { song_id: songId });

  res.json({ success: true });
});

// POST /api/rooms/:roomId/songs/:songId/play (host plays this song directly)
router.post('/:roomId/songs/:songId/play', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId, songId } = req.params;
  const member = getActiveMember(roomId, req.userId!);
  if (!member || !['OWNER', 'MODERATOR'].includes(member.role)) {
    res.status(403).json({ error: 'Only Host/Moderator can control playback' });
    return;
  }

  const db = getDb();
  const song = db.prepare('SELECT * FROM song_queue WHERE id = ? AND room_id = ?').get(songId, roomId) as any;
  if (!song) {
    res.status(404).json({ error: 'Song not found' });
    return;
  }

  db.prepare(`UPDATE song_queue SET status = 'playing' WHERE id = ?`).run(songId);
  const pb = loadVideo(roomId, song.video_id, req.userId!);
  const playingPb = playAt(roomId, 0, req.userId!);

  const io = getIo();
  io.to(roomId).emit('youtube:load', {
    video_id: song.video_id,
    title: song.title,
  });
  io.to(roomId).emit('youtube:play_at', {
    position: 0,
    server_time: Date.now(),
  });

  res.json({ playback: playingPb });
});

export default router;
