import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from './useSocket';
import { useRoomStore } from '../store/roomStore';
import { useAuthStore } from '../store/authStore';
import { getRoom } from '../lib/api';
import type { MemberView, HandRequest, SongQueueItem, ChatMessage, PlaybackInfo, StageInviteEvent } from '../types';

export function useRoom(roomId?: string) {
  const socket = useSocket();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const store = useRoomStore();

  // Load initial room state
  useEffect(() => {
    if (!roomId) return;
    getRoom(roomId)
      .then(({ data }) => {
        store.setRoom(data.room);
        store.setMembers(data.members);
      })
      .catch(() => navigate('/'));
  }, [roomId]);

  // Socket event handlers
  useEffect(() => {
    if (!socket || !roomId) return;

    const handleMemberJoined = (member: MemberView) => {
      store.addMember(member);
    };
    const handleMemberLeft = (data: { user_id: string }) => {
      store.removeMember(data.user_id);
      store.removeSpeaker(data.user_id);
    };
    const handleHandRequestUpdated = (request: HandRequest) => {
      const existing = useRoomStore.getState().handQueue.find((h) => h.id === request.id);
      if (existing) {
        store.updateHandRequest(request.id, request);
      } else {
        store.setHandQueue([...useRoomStore.getState().handQueue, request]);
      }
    };
    const handleStageInvite = (data: StageInviteEvent) => {
      if (data.room_id === roomId) {
        store.setStageInvite({ invite_id: data.invite_id, invited_by_name: data.invited_by_name });
      }
    };
    const handleSpeakerAdded = (member: MemberView) => {
      store.addSpeaker(member);
      store.updateMember(member.user_id, { role: 'SPEAKER' });
    };
    const handleSpeakerRemoved = (data: { user_id: string }) => {
      store.removeSpeaker(data.user_id);
    };
    const handleAudioMuteChanged = (data: { user_id: string; muted: boolean }) => {
      store.updateMember(data.user_id, { muted: data.muted });
    };
    const handleAudioGainChanged = (data: { user_id: string; gain: number }) => {
      store.updateMember(data.user_id, { gain: data.gain });
    };
    const handleYoutubeLoad = (data: { video_id: string; title?: string }) => {
      const playback: PlaybackInfo = {
        video_id: data.video_id,
        state: 'paused',
        position_seconds: 0,
        anchor_time: new Date().toISOString(),
        playback_rate: 1,
      };
      store.setPlayback(playback);
    };
    const handleYoutubePlayAt = (data: { position_seconds: number; playback_rate?: number }) => {
      const cur = useRoomStore.getState().playback;
      if (cur?.video_id) {
        store.setPlayback({
          ...cur,
          state: 'playing',
          position_seconds: data.position_seconds,
          playback_rate: data.playback_rate ?? 1,
          anchor_time: new Date().toISOString(),
        });
      }
    };
    const handleYoutubePause = (data: { position_seconds: number }) => {
      const cur = useRoomStore.getState().playback;
      if (cur?.video_id) {
        store.setPlayback({ ...cur, state: 'paused', position_seconds: data.position_seconds });
      }
    };
    const handleYoutubeResync = (data: PlaybackInfo) => {
      store.setPlayback(data);
    };
    const handleChatMessage = (msg: ChatMessage) => {
      store.addChatMessage(msg);
    };
    const handleSongAdd = (song: SongQueueItem) => {
      store.addSongToQueue(song);
    };
    const handleSongRemove = (data: { song_id: string }) => {
      store.removeSongFromQueue(data.song_id);
    };
    const handleKick = (data: { user_id: string }) => {
      if (user && data.user_id === user.id) {
        store.clearRoom();
        navigate('/', { state: { kicked: true } });
      }
    };

    socket.on('room:member_joined', handleMemberJoined);
    socket.on('room:member_left', handleMemberLeft);
    socket.on('hand:request_updated', handleHandRequestUpdated);
    socket.on('stage:invite', handleStageInvite);
    socket.on('stage:participant_added', handleSpeakerAdded);
    socket.on('stage:participant_removed', handleSpeakerRemoved);
    socket.on('audio:mute_changed', handleAudioMuteChanged);
    socket.on('audio:gain_changed', handleAudioGainChanged);
    socket.on('youtube:load', handleYoutubeLoad);
    socket.on('youtube:play_at', handleYoutubePlayAt);
    socket.on('youtube:pause', handleYoutubePause);
    socket.on('youtube:resync', handleYoutubeResync);
    socket.on('room:chat_message', handleChatMessage);
    socket.on('room:song_add', handleSongAdd);
    socket.on('room:song_remove', handleSongRemove);
    socket.on('room:kick', handleKick);

    return () => {
      socket.off('room:member_joined', handleMemberJoined);
      socket.off('room:member_left', handleMemberLeft);
      socket.off('hand:request_updated', handleHandRequestUpdated);
      socket.off('stage:invite', handleStageInvite);
      socket.off('stage:participant_added', handleSpeakerAdded);
      socket.off('stage:participant_removed', handleSpeakerRemoved);
      socket.off('audio:mute_changed', handleAudioMuteChanged);
      socket.off('audio:gain_changed', handleAudioGainChanged);
      socket.off('youtube:load', handleYoutubeLoad);
      socket.off('youtube:play_at', handleYoutubePlayAt);
      socket.off('youtube:pause', handleYoutubePause);
      socket.off('youtube:resync', handleYoutubeResync);
      socket.off('room:chat_message', handleChatMessage);
      socket.off('room:song_add', handleSongAdd);
      socket.off('room:song_remove', handleSongRemove);
      socket.off('room:kick', handleKick);
    };
  }, [socket, roomId, user]);

  const joinRoom = useCallback(
    (roomCode: string, password?: string, inviteCode?: string) => {
      socket.emit('room:join', { room_code: roomCode, password, invite_code: inviteCode });
    },
    [socket]
  );

  const leaveRoom = useCallback(() => {
    if (roomId) {
      socket.emit('room:leave', { room_id: roomId });
      store.clearRoom();
    }
  }, [socket, roomId]);

  const sendChat = useCallback(
    (message: string) => {
      if (roomId) socket.emit('room:chat_message', { room_id: roomId, message });
    },
    [socket, roomId]
  );

  return { joinRoom, leaveRoom, sendChat };
}
