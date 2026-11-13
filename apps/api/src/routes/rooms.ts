import { Router, Response, Request } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createRoomLimiter } from '../middleware/rateLimiter';
import {
  createRoom, getRoomByCode, getRoomById, getRoomView, listPublicRooms, closeRoom, validateRoomPassword
} from '../services/roomService';
import { joinRoom, leaveRoom, getRoomMembers, getRoomMemberCount, isBanned } from '../services/participantService';
import { getPlayback, computeCurrentPosition } from '../services/youtubeService';
import { getIo } from '../socket';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

const router = Router();

// GET /api/rooms  — list public rooms
router.get('/', (req: Request, res: Response): void => {
  const rooms = listPublicRooms();
  res.json({ rooms });
});

// POST /api/rooms  — create room
router.post('/', requireAuth, createRoomLimiter, (req: AuthRequest, res: Response): void => {
  const { name, visibility, password, max_participants } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Room name must be at least 2 characters' });
    return;
  }
  const room = createRoom({
    name: name.trim().slice(0, 100),
    owner_id: req.userId!,
    visibility: visibility === 'private' ? 'private' : 'public',
    password: password || undefined,
    max_participants: typeof max_participants === 'number' ? max_participants : 50,
  });
  res.status(201).json({ room: getRoomView(room) });
});

// GET /api/rooms/:roomId  — get room details
router.get('/:roomId', (req: Request, res: Response): void => {
  const room = getRoomById(req.params.roomId);
  if (!room || room.status === 'closed') {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  const members = getRoomMembers(room.id, 100);
  const memberCount = getRoomMemberCount(room.id);
  const playback = getPlayback(room.id);
  res.json({
    room: getRoomView(room),
    members,
    memberCount,
    totalMembers: memberCount,
    playback: playback ? { ...playback, current_position: computeCurrentPosition(playback) } : null,
  });
});

// GET /api/rooms/code/:code  — find room by invite code
router.get('/code/:code', (req: Request, res: Response): void => {
  const room = getRoomByCode(req.params.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  res.json({ room: getRoomView(room) });
});

// DELETE /api/rooms/:roomId  — close room (owner only)
router.delete('/:roomId', requireAuth, (req: AuthRequest, res: Response): void => {
  try {
    closeRoom(req.params.roomId, req.userId!);
    try {
      const io = getIo();
      io.to(req.params.roomId).emit('room:closed', {
        room_id: req.params.roomId,
        closed_by_name: 'Chủ phòng',
      });
    } catch (_) {}
    res.status(204).send();
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

export default router;
