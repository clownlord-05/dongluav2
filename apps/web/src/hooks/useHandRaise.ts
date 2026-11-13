import { useCallback } from 'react';
import { useSocket } from './useSocket';
import { useRoomStore } from '../store/roomStore';
import { useAuthStore } from '../store/authStore';

export function useHandRaise(roomId?: string) {
  const socket = useSocket();
  const store = useRoomStore();
  const user = useAuthStore((s) => s.user);

  const myRequest = useRoomStore((s) =>
    s.handQueue.find((h) => h.user_id === user?.id && h.status === 'pending')
  );

  const raiseHand = useCallback(() => {
    if (!roomId) return;
    socket.emit('hand:raise', { roomId, room_id: roomId });
  }, [socket, roomId]);

  const cancelHand = useCallback(() => {
    if (!roomId || !myRequest) return;
    socket.emit('hand:cancel', { roomId, room_id: roomId, requestId: myRequest.id, request_id: myRequest.id });
  }, [socket, roomId, myRequest]);

  const approveHand = useCallback(
    (requestId: string) => {
      if (!roomId) return;
      socket.emit('hand:approve', { roomId, room_id: roomId, requestId, request_id: requestId });
    },
    [socket, roomId]
  );

  const rejectHand = useCallback(
    (requestId: string) => {
      if (!roomId) return;
      socket.emit('hand:reject', { roomId, room_id: roomId, requestId, request_id: requestId });
    },
    [socket, roomId]
  );

  const acceptStageInvite = useCallback(
    (inviteId: string) => {
      if (!roomId) return;
      socket.emit('stage:accept', { roomId, room_id: roomId, inviteId, invite_id: inviteId });
      store.setStageInvite(null);
    },
    [socket, roomId, store]
  );

  const declineStageInvite = useCallback(
    (inviteId: string) => {
      if (!roomId) return;
      socket.emit('stage:decline', { roomId, room_id: roomId, inviteId, invite_id: inviteId });
      store.setStageInvite(null);
    },
    [socket, roomId, store]
  );

  const leaveStage = useCallback(() => {
    if (!roomId || !user) return;
    socket.emit('stage:remove_self', { roomId, room_id: roomId, targetUserId: user.id });
  }, [socket, roomId, user]);

  return { raiseHand, cancelHand, approveHand, rejectHand, acceptStageInvite, declineStageInvite, leaveStage, myRequest };
}
