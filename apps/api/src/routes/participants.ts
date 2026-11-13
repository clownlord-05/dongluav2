import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getRoomById } from '../services/roomService';
import {
  getRoomMembers, getActiveMember, setMemberMuted, setMemberGain,
  banUser, leaveRoom, logModeration, isBanned
} from '../services/participantService';
import { generateLiveKitToken, revokeParticipant } from '../services/livekitService';
import { getIo } from '../socket';

const router = Router();

// GET /api/rooms/:roomId/participants
router.get('/:roomId/participants', requireAuth, (req: AuthRequest, res: Response): void => {
  const room = getRoomById(req.params.roomId);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
  const members = getRoomMembers(room.id);
  res.json({ members });
});

// GET /api/rooms/:roomId/livekit-token  — get LiveKit token for joining
router.get('/:roomId/livekit-token', requireAuth, (req: AuthRequest, res: Response): void => {
  const room = getRoomById(req.params.roomId);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }

  const member = getActiveMember(room.id, req.userId!);
  if (!member) { res.status(403).json({ error: 'You are not a member of this room' }); return; }

  const livekitRole = (member.role === 'SPEAKER') ? 'speaker' : 'audience';
  const token = generateLiveKitToken(room.id, req.userId!, livekitRole, member.role);

  res.json({
    token,
    url: process.env.LIVEKIT_URL || '',
    identity: req.userId,
    room_name: room.id,
    can_publish: livekitRole === 'speaker',
  });
});

// POST /api/rooms/:roomId/participants/:targetUserId/mute
router.post('/:roomId/participants/:targetUserId/mute', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId, targetUserId } = req.params;
  const actor = getActiveMember(roomId, req.userId!);
  if (!actor || !['OWNER', 'MODERATOR'].includes(actor.role)) {
    res.status(403).json({ error: 'Insufficient role' }); return;
  }
  const target = getActiveMember(roomId, targetUserId);
  if (!target) { res.status(404).json({ error: 'Member not found' }); return; }

  setMemberMuted(roomId, targetUserId, true);
  logModeration(roomId, req.userId!, targetUserId, 'mute');

  const io = getIo();
  io.to(roomId).emit('audio:mute_changed', { user_id: targetUserId, muted: true });
  res.json({ success: true });
});

// POST /api/rooms/:roomId/participants/:targetUserId/unmute
router.post('/:roomId/participants/:targetUserId/unmute', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId, targetUserId } = req.params;
  const actor = getActiveMember(roomId, req.userId!);
  if (!actor || !['OWNER', 'MODERATOR'].includes(actor.role)) {
    res.status(403).json({ error: 'Insufficient role' }); return;
  }
  const target = getActiveMember(roomId, targetUserId);
  if (!target) { res.status(404).json({ error: 'Member not found' }); return; }

  setMemberMuted(roomId, targetUserId, false);
  logModeration(roomId, req.userId!, targetUserId, 'unmute');

  const io = getIo();
  io.to(roomId).emit('audio:mute_changed', { user_id: targetUserId, muted: false });
  res.json({ success: true });
});

// POST /api/rooms/:roomId/participants/:targetUserId/gain
router.post('/:roomId/participants/:targetUserId/gain', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId, targetUserId } = req.params;
  const { gain } = req.body;
  if (typeof gain !== 'number') { res.status(400).json({ error: 'gain must be a number' }); return; }

  const actor = getActiveMember(roomId, req.userId!);
  if (!actor || !['OWNER', 'MODERATOR'].includes(actor.role)) {
    res.status(403).json({ error: 'Insufficient role' }); return;
  }
  setMemberGain(roomId, targetUserId, gain);
  logModeration(roomId, req.userId!, targetUserId, 'gain_change', `gain=${gain}`);

  const io = getIo();
  io.to(roomId).emit('audio:gain_changed', { user_id: targetUserId, gain });
  res.json({ success: true });
});

// POST /api/rooms/:roomId/participants/:targetUserId/kick
router.post('/:roomId/participants/:targetUserId/kick', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId, targetUserId } = req.params;
  const { reason } = req.body;

  const actor = getActiveMember(roomId, req.userId!);
  if (!actor || !['OWNER', 'MODERATOR'].includes(actor.role)) {
    res.status(403).json({ error: 'Insufficient role' }); return;
  }
  const target = getActiveMember(roomId, targetUserId);
  if (!target) { res.status(404).json({ error: 'Member not found' }); return; }
  if (target.role === 'OWNER') { res.status(403).json({ error: 'Cannot kick owner' }); return; }

  leaveRoom(roomId, targetUserId);
  logModeration(roomId, req.userId!, targetUserId, 'kick', reason);
  revokeParticipant(roomId, targetUserId).catch(() => {});

  const io = getIo();
  io.to(roomId).emit('room:member_left', { user_id: targetUserId, reason: 'kicked' });
  const targetSocket = [...(io.sockets.sockets.values())].find(s => (s as any).userId === targetUserId && (s as any).currentRoom === roomId);
  if (targetSocket) {
    targetSocket.emit('room:kicked', { reason });
    targetSocket.leave(roomId);
  }
  res.json({ success: true });
});

// POST /api/rooms/:roomId/participants/:targetUserId/ban
router.post('/:roomId/participants/:targetUserId/ban', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId, targetUserId } = req.params;
  const { reason } = req.body;

  const actor = getActiveMember(roomId, req.userId!);
  if (!actor || !['OWNER', 'MODERATOR'].includes(actor.role)) {
    res.status(403).json({ error: 'Insufficient role' }); return;
  }
  const target = getActiveMember(roomId, targetUserId);
  if (target?.role === 'OWNER') { res.status(403).json({ error: 'Cannot ban owner' }); return; }

  banUser(roomId, targetUserId, req.userId!, reason);
  logModeration(roomId, req.userId!, targetUserId, 'ban', reason);
  revokeParticipant(roomId, targetUserId).catch(() => {});

  const io = getIo();
  io.to(roomId).emit('room:member_left', { user_id: targetUserId, reason: 'banned' });
  const targetSocket = [...(io.sockets.sockets.values())].find(s => (s as any).userId === targetUserId && (s as any).currentRoom === roomId);
  if (targetSocket) {
    targetSocket.emit('room:banned', { reason });
    targetSocket.leave(roomId);
  }
  res.json({ success: true });
});

export default router;
