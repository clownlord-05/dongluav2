import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  raiseHand, cancelHandRequest, reviewHandRequest, getPendingRequests, getUserPendingRequest
} from '../services/handRequestService';
import { getActiveMember, setMemberRole, logModeration } from '../services/participantService';
import { getIo } from '../socket';

const router = Router();

// GET /api/rooms/:roomId/hand-requests
router.get('/:roomId/hand-requests', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId } = req.params;
  const requests = getPendingRequests(roomId);
  res.json({ requests });
});

// POST /api/rooms/:roomId/hand-requests  (raise hand)
router.post('/:roomId/hand-requests', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId } = req.params;
  const member = getActiveMember(roomId, req.userId!);
  if (!member) {
    res.status(403).json({ error: 'You are not in this room' });
    return;
  }
  if (member.role === 'SPEAKER' || member.role === 'OWNER') {
    res.status(400).json({ error: 'You are already on stage' });
    return;
  }

  const request = raiseHand(roomId, req.userId!);
  const io = getIo();
  io.to(roomId).emit('hand:request_updated', {
    request_id: request.id,
    user_id: req.userId,
    status: 'pending',
    position: request.position,
  });

  res.status(201).json({ request });
});

// DELETE /api/rooms/:roomId/hand-requests/:requestId  (cancel request)
router.delete('/:roomId/hand-requests/:requestId', requireAuth, (req: AuthRequest, res: Response): void => {
  const { requestId, roomId } = req.params;
  const request = cancelHandRequest(requestId, req.userId!);
  if (!request) {
    res.status(404).json({ error: 'Hand request not found or cannot be cancelled' });
    return;
  }

  const io = getIo();
  io.to(roomId).emit('hand:request_updated', {
    request_id: requestId,
    user_id: req.userId,
    status: 'cancelled',
  });

  res.json({ success: true, request });
});

// POST /api/rooms/:roomId/hand-requests/:requestId/approve
router.post('/:roomId/hand-requests/:requestId/approve', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId, requestId } = req.params;
  const actor = getActiveMember(roomId, req.userId!);
  if (!actor || !['OWNER', 'MODERATOR'].includes(actor.role)) {
    res.status(403).json({ error: 'Only Host/Moderator can approve requests' });
    return;
  }

  const reviewed = reviewHandRequest(requestId, req.userId!, true);
  if (!reviewed) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }

  // Promote target user to SPEAKER role
  setMemberRole(roomId, reviewed.user_id, 'SPEAKER');
  logModeration(roomId, req.userId!, reviewed.user_id, 'approve_stage');

  const io = getIo();
  // Send invite/promoted event
  io.to(roomId).emit('stage:participant_added', {
    user_id: reviewed.user_id,
    role: 'SPEAKER',
  });
  io.to(roomId).emit('hand:request_updated', {
    request_id: requestId,
    user_id: reviewed.user_id,
    status: 'approved',
  });

  res.json({ success: true, request: reviewed });
});

// POST /api/rooms/:roomId/hand-requests/:requestId/reject
router.post('/:roomId/hand-requests/:requestId/reject', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId, requestId } = req.params;
  const actor = getActiveMember(roomId, req.userId!);
  if (!actor || !['OWNER', 'MODERATOR'].includes(actor.role)) {
    res.status(403).json({ error: 'Only Host/Moderator can reject requests' });
    return;
  }

  const reviewed = reviewHandRequest(requestId, req.userId!, false);
  if (!reviewed) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }

  logModeration(roomId, req.userId!, reviewed.user_id, 'reject_stage');

  const io = getIo();
  io.to(roomId).emit('hand:request_updated', {
    request_id: requestId,
    user_id: reviewed.user_id,
    status: 'rejected',
  });

  res.json({ success: true, request: reviewed });
});

// POST /api/rooms/:roomId/stage/leave  (speaker leaves stage back to audience)
router.post('/:roomId/stage/leave', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId } = req.params;
  const member = getActiveMember(roomId, req.userId!);
  if (!member) {
    res.status(403).json({ error: 'Not in room' });
    return;
  }

  if (member.role === 'OWNER') {
    res.status(400).json({ error: 'Room owner cannot leave stage' });
    return;
  }

  setMemberRole(roomId, req.userId!, 'AUDIENCE');
  const io = getIo();
  io.to(roomId).emit('stage:participant_removed', {
    user_id: req.userId,
    new_role: 'AUDIENCE',
  });

  res.json({ success: true });
});

// POST /api/rooms/:roomId/stage/:targetUserId/remove  (host removes speaker from stage)
router.post('/:roomId/stage/:targetUserId/remove', requireAuth, (req: AuthRequest, res: Response): void => {
  const { roomId, targetUserId } = req.params;
  const actor = getActiveMember(roomId, req.userId!);
  if (!actor || !['OWNER', 'MODERATOR'].includes(actor.role)) {
    res.status(403).json({ error: 'Only Host/Moderator can remove speakers' });
    return;
  }

  const target = getActiveMember(roomId, targetUserId);
  if (!target) {
    res.status(404).json({ error: 'Target not found' });
    return;
  }
  if (target.role === 'OWNER') {
    res.status(400).json({ error: 'Cannot remove owner from stage' });
    return;
  }

  setMemberRole(roomId, targetUserId, 'AUDIENCE');
  logModeration(roomId, req.userId!, targetUserId, 'remove_from_stage');

  const io = getIo();
  io.to(roomId).emit('stage:participant_removed', {
    user_id: targetUserId,
    new_role: 'AUDIENCE',
  });

  res.json({ success: true });
});

export default router;
