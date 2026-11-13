import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoomStore } from '../store/roomStore';
import { useAuthStore } from '../store/authStore';
import { useAudioStore } from '../store/audioStore';
import { useSocket } from '../hooks/useSocket';
import { useAudio } from '../hooks/useAudio';
import { useWebRTCAudio } from '../hooks/useWebRTCAudio';
import { getRoom, getSongQueue, getHandRequests, closeRoomApi } from '../lib/api';
import YouTubePlayer from '../components/room/YouTubePlayer';
import StagePodium from '../components/room/StagePodium';
import RoomSidebar from '../components/room/RoomSidebar';
import BottomBar from '../components/room/BottomBar';
import AudioSettingsModal from '../components/audio/AudioSettingsModal';
import YouTubeSearchModal from '../components/room/YouTubeSearchModal';
import NicknameModal from '../components/common/NicknameModal';
import Avatar from '../components/common/Avatar';
import UserContextMenu from '../components/common/UserContextMenu';
import { useUserContextMenu } from '../hooks/useUserContextMenu';
import { Flame, Copy, Check, LogOut, Share2, ShieldAlert, MessageSquare, Power, AlertTriangle, Sliders } from 'lucide-react';

export const KaraokeRoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  // Granular Zustand selectors so KaraokeRoomPage NEVER re-renders on chat, song queue, or audience list updates
  const roomName = useRoomStore((s) => s.room?.name);
  const roomCode = useRoomStore((s) => s.room?.code);
  const totalMemberCount = useRoomStore((s) => s.totalMemberCount);
  const myRole = useRoomStore((s) => s.members.find((m) => m.user_id === user?.id)?.role);
  const pendingHandCount = useRoomStore(
    (s) => s.handQueue.filter((h) => h.status === 'pending').length
  );

  const socket = useSocket();
  const { captureRaw, stopCapture } = useAudio();
  const setMuted = useAudioStore((s) => s.setMuted);

  const [copied, setCopied] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [, setLoading] = useState(true);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });
  const isSidebarOpenRef = useRef(isSidebarOpen);
  useEffect(() => {
    isSidebarOpenRef.current = isSidebarOpen;
  }, [isSidebarOpen]);

  const [mobileViewMode, setMobileViewMode] = useState<'compact' | 'expanded'>('compact');
  const [latestToast, setLatestToast] = useState<{
    id: string;
    sender: string;
    text: string;
    type?: string;
  } | null>(null);

  const userContextMenu = useUserContextMenu();

  // Ultra-low latency Hybrid P2P + AudioWorklet mesh for singer & 200+ audience
  useWebRTCAudio(socket, roomId);

  // Auto-activate microphone when user is OWNER or SPEAKER in the room
  useEffect(() => {
    if (myRole === 'OWNER' || myRole === 'SPEAKER') {
      const { stream, isMuted, selectedDeviceId } = useAudioStore.getState();
      if (!stream && !isMuted) {
        captureRaw(selectedDeviceId);
      }
    }
  }, [myRole, captureRaw]);

  // Expose socket globally for components needing direct emits
  useEffect(() => {
    (window as any).__SOCKET__ = socket;
  }, [socket]);

  // Load room details, song queue, and hand requests on mount
  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    const store = useRoomStore.getState();

    getRoom(roomId)
      .then(({ data }) => {
        const s = useRoomStore.getState();
        s.setRoom(data.room);
        s.setMembers(data.members || []);
        if ((data as any).memberCount || (data as any).totalMembers) {
          s.setTotalMemberCount((data as any).memberCount || (data as any).totalMembers);
        }
        if ((data as any).playback) {
          const pb = (data as any).playback;
          s.setPlayback({
            video_id: pb.video_id,
            title: pb.title || 'Karaoke Beat',
            state: pb.state || 'paused',
            position_seconds: pb.current_position ?? pb.position_seconds ?? 0,
            playback_rate: pb.playback_rate || 1,
            anchor_time: new Date().toISOString(),
          });
        }
      })
      .catch((err) => {
        setRoomError(err.response?.data?.error || 'Không tìm thấy phòng!');
      })
      .finally(() => {
        setLoading(false);
      });

    // Load song queue
    getSongQueue(roomId)
      .then(({ data }) => {
        store.setSongQueue(data.songs || []);
      })
      .catch(() => {});

    // Load hand queue
    getHandRequests(roomId)
      .then(({ data }) => {
        store.setHandQueue(data.requests || []);
      })
      .catch(() => {});
  }, [roomId]);

  // Join room on Socket.IO when connected & handle all realtime events
  useEffect(() => {
    if (!socket || !roomId || !token) return;

    socket.emit('room:join', { roomId });

    const handleJoined = (data: any) => {
      useRoomStore.getState().addMember(data);
    };

    const handleLeft = (data: { user_id: string }) => {
      useRoomStore.getState().removeMember(data.user_id);
    };

    const handleMuteChanged = (data: { user_id: string; muted: boolean }) => {
      useRoomStore.getState().updateMember(data.user_id, { muted: data.muted });
      if (data.user_id === useAuthStore.getState().user?.id) {
        setMuted(data.muted);
        if (data.muted) {
          stopCapture();
        }
      }
    };

    const handleGainChanged = (data: { user_id: string; gain: number }) => {
      useRoomStore.getState().updateMember(data.user_id, { gain: data.gain });
      if (data.user_id === useAuthStore.getState().user?.id) {
        useAudioStore.getState().setGain(data.gain);
      }
    };

    const handleStageParticipantAdded = (data: { user_id: string; role: string; muted?: boolean }) => {
      const s = useRoomStore.getState();
      s.updateMember(data.user_id, { role: 'SPEAKER' as any, muted: data.muted ?? false });
      if (data.user_id === useAuthStore.getState().user?.id) {
        setMuted(false);
        captureRaw(useAudioStore.getState().selectedDeviceId);
        // Prompt banner on BottomBar so 1-tap grant works if browser blocked async getUserMedia
        s.setStageInvite({
          invite_id: 'stage_active',
          invited_by_name: 'Chủ phòng',
        });
      }
    };

    const handleStageParticipantRemoved = (data: { user_id: string; new_role: string }) => {
      useRoomStore.getState().updateMember(data.user_id, { role: data.new_role as any });
      if (data.user_id === useAuthStore.getState().user?.id) {
        stopCapture();
      }
    };

    // YouTube playback realtime sync
    const handleYoutubeLoad = (data: { video_id?: string; videoId?: string; title?: string }) => {
      const vid = data.video_id || data.videoId;
      if (!vid) return;
      useRoomStore.getState().setPlayback({
        video_id: vid,
        title: data.title || 'Karaoke Beat',
        state: 'paused',
        position_seconds: 0,
        anchor_time: new Date().toISOString(),
        playback_rate: 1,
      });
    };

    const handleYoutubePlayAt = (data: { position?: number; position_seconds?: number; playback_rate?: number }) => {
      const s = useRoomStore.getState();
      const cur = s.playback;
      const pos = data.position ?? data.position_seconds ?? 0;
      if (cur?.video_id) {
        s.setPlayback({
          ...cur,
          state: 'playing',
          position_seconds: pos,
          playback_rate: data.playback_rate ?? 1,
          anchor_time: new Date().toISOString(),
        });
      }
    };

    const handleYoutubePause = (data: { position?: number; position_seconds?: number }) => {
      const s = useRoomStore.getState();
      const cur = s.playback;
      const pos = data.position ?? data.position_seconds ?? 0;
      if (cur?.video_id) {
        s.setPlayback({
          ...cur,
          state: 'paused',
          position_seconds: pos,
        });
      }
    };

    const handleYoutubeSeek = (data: { position?: number; position_seconds?: number }) => {
      const s = useRoomStore.getState();
      const cur = s.playback;
      const pos = data.position ?? data.position_seconds ?? 0;
      if (cur?.video_id) {
        s.setPlayback({
          ...cur,
          position_seconds: pos,
          anchor_time: new Date().toISOString(),
        });
      }
    };

    const handleYoutubeSync = (data: any) => {
      const vid = data?.video_id || data?.videoId;
      if (vid) {
        useRoomStore.getState().setPlayback({
          video_id: vid,
          title: data.title || 'Karaoke Beat',
          state: data.state || 'paused',
          position_seconds: data.current_position ?? data.position_seconds ?? 0,
          playback_rate: data.playback_rate || 1,
          anchor_time: new Date().toISOString(),
        });
      }
    };

    // Realtime song queue
    const handleSongAdd = (newSong: any) => {
      if (newSong && newSong.id) {
        useRoomStore.getState().addSongToQueue(newSong);
      }
    };

    const handleSongRemove = (data: { song_id?: string; songId?: string }) => {
      const id = data.song_id || data.songId;
      if (id) {
        useRoomStore.getState().removeSongFromQueue(id);
      }
    };

    // Realtime chat
    const handleChatMessage = (msg: any) => {
      if (msg) {
        useRoomStore.getState().addChatMessage(msg);
        // Only trigger toast state if sidebar is closed (prevents full-page re-renders during active chat!)
        if (!isSidebarOpenRef.current) {
          const sender = msg.displayName || msg.display_name || 'Khách';
          const text = msg.text || msg.message || '';
          if (text) {
            setLatestToast({
              id: String(Date.now()),
              sender,
              text,
              type: msg.type,
            });
            setTimeout(() => {
              setLatestToast((curr) => (curr?.text === text ? null : curr));
            }, 3500);
          }
        }
      }
    };

    // Realtime hand queue
    const handleHandUpdated = (req: any) => {
      if (req) {
        const s = useRoomStore.getState();
        const cur = s.handQueue;
        const reqId = req.id || req.request_id;
        const exists = cur.some((h) => h.id === reqId);
        if (exists) {
          s.updateHandRequest(reqId, req);
        } else if (req.status === 'pending') {
          s.setHandQueue([...cur, req]);
        }
      }
    };

    const handleStageInvite = (invite: any) => {
      if (!invite?.user_id || invite.user_id === useAuthStore.getState().user?.id) {
        useRoomStore.getState().setStageInvite(invite);
      }
    };

    const handleKicked = (data: { user_id?: string; reason?: string }) => {
      if (!data?.user_id || data.user_id === useAuthStore.getState().user?.id) {
        alert(`Bạn đã bị mời ra khỏi phòng! ${data.reason ? `Lý do: ${data.reason}` : ''}`);
        navigate('/');
      }
    };

    const handleBanned = (data: { user_id?: string; reason?: string }) => {
      if (!data?.user_id || data.user_id === useAuthStore.getState().user?.id) {
        alert(`Bạn đã bị cấm vào phòng này! ${data.reason ? `Lý do: ${data.reason}` : ''}`);
        navigate('/');
      }
    };

    const handleRoomClosed = (data: { room_id?: string; closed_by_name?: string }) => {
      alert(`Chủ phòng (${data?.closed_by_name || 'Host'}) đã đóng phòng hát! Buổi karaoke đã kết thúc. Cảm ơn bạn đã tham gia!`);
      stopCapture();
      useRoomStore.getState().clearRoom();
      navigate('/');
    };

    const handleMemberUpdated = (data: { user_id: string; display_name?: string; avatar_seed?: string }) => {
      useRoomStore.getState().updateMember(data.user_id, {
        display_name: data.display_name,
        avatar_seed: data.avatar_seed,
      });
      if (data.user_id === useAuthStore.getState().user?.id) {
        useAuthStore.getState().updateUser({
          display_name: data.display_name,
          avatar_seed: data.avatar_seed,
        });
      }
    };

    const handleMemberCount = (data: { count?: number }) => {
      if (typeof data?.count === 'number') {
        useRoomStore.getState().setTotalMemberCount(data.count);
      }
    };

    socket.on('room:member_joined', handleJoined);
    socket.on('room:member_left', handleLeft);
    socket.on('room:member_updated', handleMemberUpdated);
    socket.on('room:member_count', handleMemberCount);
    socket.on('audio:mute_changed', handleMuteChanged);
    socket.on('audio:gain_changed', handleGainChanged);
    socket.on('stage:participant_added', handleStageParticipantAdded);
    socket.on('stage:participant_removed', handleStageParticipantRemoved);
    socket.on('youtube:load', handleYoutubeLoad);
    socket.on('youtube:play_at', handleYoutubePlayAt);
    socket.on('youtube:pause', handleYoutubePause);
    socket.on('youtube:seek', handleYoutubeSeek);
    socket.on('youtube:sync', handleYoutubeSync);
    socket.on('room:song_add', handleSongAdd);
    socket.on('room:song_remove', handleSongRemove);
    socket.on('room:chat_message', handleChatMessage);
    socket.on('hand:request_updated', handleHandUpdated);
    socket.on('stage:invite', handleStageInvite);
    socket.on('room:kicked', handleKicked);
    socket.on('room:banned', handleBanned);
    socket.on('room:closed', handleRoomClosed);

    return () => {
      socket.off('room:member_joined', handleJoined);
      socket.off('room:member_left', handleLeft);
      socket.off('room:member_updated', handleMemberUpdated);
      socket.off('room:member_count', handleMemberCount);
      socket.off('audio:mute_changed', handleMuteChanged);
      socket.off('audio:gain_changed', handleGainChanged);
      socket.off('stage:participant_added', handleStageParticipantAdded);
      socket.off('stage:participant_removed', handleStageParticipantRemoved);
      socket.off('youtube:load', handleYoutubeLoad);
      socket.off('youtube:play_at', handleYoutubePlayAt);
      socket.off('youtube:pause', handleYoutubePause);
      socket.off('youtube:seek', handleYoutubeSeek);
      socket.off('youtube:sync', handleYoutubeSync);
      socket.off('room:song_add', handleSongAdd);
      socket.off('room:song_remove', handleSongRemove);
      socket.off('room:chat_message', handleChatMessage);
      socket.off('hand:request_updated', handleHandUpdated);
      socket.off('stage:invite', handleStageInvite);
      socket.off('room:kicked', handleKicked);
      socket.off('room:banned', handleBanned);
      socket.off('room:closed', handleRoomClosed);
    };
  }, [socket, roomId, token]);

  // Hand raise actions (all memoized with useCallback so React.memo children never re-render needlessly)
  const handleRaiseHand = useCallback(() => {
    if (!roomId || !socket) return;
    socket.emit('hand:raise', { roomId, room_id: roomId });
  }, [roomId, socket]);

  const handleCancelHand = useCallback(() => {
    if (!roomId || !socket) return;
    const uid = useAuthStore.getState().user?.id;
    const req = useRoomStore.getState().handQueue.find((h) => h.user_id === uid && h.status === 'pending');
    if (req) {
      socket.emit('hand:cancel', { roomId, room_id: roomId, requestId: req.id, request_id: req.id });
    }
  }, [roomId, socket]);

  const handleApproveHand = useCallback(
    (requestId: string) => {
      if (!roomId || !socket) return;
      socket.emit('hand:approve', { roomId, room_id: roomId, requestId, request_id: requestId });
    },
    [roomId, socket]
  );

  const handleRejectHand = useCallback(
    (requestId: string) => {
      if (!roomId || !socket) return;
      socket.emit('hand:reject', { roomId, room_id: roomId, requestId, request_id: requestId });
    },
    [roomId, socket]
  );

  const handleAcceptStageInvite = useCallback(async () => {
    useRoomStore.getState().setStageInvite(null);
    setMuted(false);
    if (socket && roomId) {
      socket.emit('stage:accept', { roomId, room_id: roomId });
    }
    await captureRaw(useAudioStore.getState().selectedDeviceId);
  }, [roomId, socket, captureRaw, setMuted]);

  const handleDeclineStageInvite = useCallback(() => {
    useRoomStore.getState().setStageInvite(null);
    if (!roomId || !socket) return;
    socket.emit('stage:decline', { roomId, room_id: roomId });
  }, [roomId, socket]);

  const handleToggleMic = useCallback(async () => {
    const audioState = useAudioStore.getState();
    const uid = useAuthStore.getState().user?.id;
    const isCurrentlyLive = !audioState.isMuted && !!audioState.stream;

    if (!isCurrentlyLive) {
      // Turn Mic ON: capture hardware mic in Media Mode (Loudspeaker) & unmute
      setMuted(false);
      await captureRaw(audioState.selectedDeviceId);
      if (roomId && socket && uid) {
        socket.emit('audio:unmute', {
          roomId,
          room_id: roomId,
          targetUserId: uid,
        });
      }
    } else {
      // Turn Mic OFF: completely release hardware mic track so OS immediately frees audio session!
      setMuted(true);
      stopCapture();
      if (roomId && socket && uid) {
        socket.emit('audio:mute', {
          roomId,
          room_id: roomId,
          targetUserId: uid,
        });
      }
    }
  }, [roomId, socket, captureRaw, stopCapture, setMuted]);

  const handleLeaveStage = useCallback(() => {
    const uid = useAuthStore.getState().user?.id;
    if (!roomId || !socket || !uid) return;
    stopCapture();
    socket.emit('stage:remove_self', { roomId, room_id: roomId, targetUserId: uid });
  }, [roomId, socket, stopCapture]);

  const handleLeaveRoom = useCallback(() => {
    stopCapture();
    if (roomId && socket) {
      socket.emit('room:leave', { roomId });
    }
    useRoomStore.getState().clearRoom();
    navigate('/');
  }, [roomId, socket, stopCapture, navigate]);

  const handleConfirmCloseRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      if (socket) {
        socket.emit('room:close', { roomId });
      }
      await closeRoomApi(roomId).catch(() => {});
      stopCapture();
      useRoomStore.getState().clearRoom();
      setShowCloseModal(false);
      navigate('/');
    } catch (err: any) {
      console.error('Close room error:', err);
    }
  }, [roomId, socket, stopCapture, navigate]);

  const handleHostMute = useCallback(
    (targetUserId: string, mute: boolean) => {
      if (!roomId || !socket) return;
      socket.emit(mute ? 'audio:mute' : 'audio:unmute', {
        roomId,
        targetUserId,
      });
    },
    [roomId, socket]
  );

  const handleHostGain = useCallback(
    (targetUserId: string, gain: number) => {
      if (!roomId || !socket) return;
      socket.emit('audio:gain_change', {
        roomId,
        targetUserId,
        gain,
      });
    },
    [roomId, socket]
  );

  const handleHostRemoveSpeaker = useCallback(
    (targetUserId: string) => {
      if (!roomId || !socket) return;
      socket.emit('stage:remove_speaker', { roomId, targetUserId });
    },
    [roomId, socket]
  );

  const handleHostKick = useCallback(
    (targetUserId: string) => {
      if (!roomId || !socket) return;
      if (confirm('Bạn có chắc chắn muốn kick người này khỏi phòng?')) {
        socket.emit('room:kick', { roomId, targetUserId });
      }
    },
    [roomId, socket]
  );

  const handleHostBan = useCallback(
    (targetUserId: string) => {
      if (!roomId || !socket) return;
      if (confirm('CẢNH BÁO: Bạn có chắc chắn muốn cấm (BAN) người này vào phòng?')) {
        socket.emit('room:ban', { roomId, targetUserId });
      }
    },
    [roomId, socket]
  );

  const handleHostInviteToStage = useCallback(
    (targetUserId: string) => {
      if (!roomId || !socket) return;
      socket.emit('stage:invite_member', { roomId, targetUserId });
    },
    [roomId, socket]
  );

  const handleSendMessage = useCallback(
    (text: string, type: 'text' | 'sticker' = 'text') => {
      if (!roomId || !socket) return;
      socket.emit('room:chat_message', { roomId, text, message: text, type });
    },
    [roomId, socket]
  );

  const handleAddSong = useCallback(
    (videoId: string, title?: string) => {
      if (!roomId || !socket) return;
      socket.emit('room:song_add', {
        roomId,
        videoId,
        title: title || 'Karaoke Beat',
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        channelName: 'YouTube',
      });
    },
    [roomId, socket]
  );

  const handlePlaySongNow = useCallback(
    (songId: string) => {
      const song = useRoomStore.getState().songQueue.find((s) => s.id === songId);
      if (!song || !socket || !roomId) return;
      socket.emit('youtube:load', { roomId, videoId: song.video_id, title: song.title });
      socket.emit('youtube:play_at', { roomId, position: 0 });
      socket.emit('room:song_remove', { roomId, songId });
    },
    [roomId, socket]
  );

  const handleRemoveSong = useCallback(
    (songId: string) => {
      if (!roomId || !socket) return;
      socket.emit('room:song_remove', { roomId, songId });
    },
    [roomId, socket]
  );

  const handleSearchPlayNow = useCallback(
    (videoId: string, title?: string) => {
      if (!roomId || !socket) return;
      const songTitle = title || 'Karaoke Beat';
      socket.emit('youtube:load', { roomId, videoId, title: songTitle });
      socket.emit('youtube:play_at', { roomId, position: 0 });
    },
    [roomId, socket]
  );

  const handleSearchAddToQueue = useCallback(
    (videoId: string, title: string, thumbnail: string) => {
      if (!roomId || !socket) return;
      socket.emit('room:song_add', {
        roomId,
        videoId,
        title: title || 'Karaoke Beat',
        thumbnail: thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        channelName: 'YouTube',
      });
    },
    [roomId, socket]
  );

  const handlePlayNextSong = useCallback(() => {
    const nextSong = useRoomStore.getState().songQueue.find((s) => s.status === 'queued');
    if (nextSong) {
      handlePlaySongNow(nextSong.id);
    }
  }, [handlePlaySongNow]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, []);

  const handleOpenSearch = useCallback(() => setShowSearchModal(true), []);
  const handleOpenAudioSettings = useCallback(() => setShowAudioSettings(true), []);
  const handleCloseSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const handleToggleSidebar = useCallback(() => setIsSidebarOpen((prev) => !prev), []);
  const handleToggleMobileViewMode = useCallback(
    () => setMobileViewMode((m) => (m === 'compact' ? 'expanded' : 'compact')),
    []
  );

  const isHost = myRole === 'OWNER' || myRole === 'MODERATOR';

  if (!user) {
    return <NicknameModal isOpen={true} onClose={() => {}} required={true} />;
  }

  if (roomError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-bg-base text-white p-6 space-y-4">
        <ShieldAlert className="w-12 h-12 text-danger" />
        <h2 className="text-xl font-bold">Không Thể Vào Phòng</h2>
        <p className="text-xs text-text-secondary">{roomError}</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 rounded-xl bg-primary text-white font-bold text-xs"
        >
          Quay lại Trang Chủ
        </button>
    </div>
    );
  }

  return (
    <div className="fixed inset-0 h-[100dvh] w-full flex flex-col bg-bg-base text-text-primary overflow-hidden select-none">
      {/* Room Top Bar */}
      <header className="h-14 bg-bg-panel border-b border-white/10 px-3 sm:px-4 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <a href="/" className="flex items-center space-x-1.5 sm:space-x-2 text-primary font-black text-sm shrink-0">
            <Flame className="w-5 h-5 text-primary" />
            <span className="hidden sm:inline">ĐỐNG LỬA V2</span>
          </a>

          <div className="h-4 w-px bg-white/10 hidden sm:block" />

          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <h1 className="text-xs md:text-sm font-extrabold text-white truncate max-w-[130px] sm:max-w-xs">
                {roomName || 'Phòng Karaoke'}
              </h1>
              <button
                onClick={handleCopyLink}
                className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-mono text-accent font-bold transition shrink-0"
                title="Sao chép link mời phòng"
              >
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                <span>#{roomCode}</span>
              </button>

              <div className="hidden sm:flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-bold" title="Số lượng người tham gia trong phòng">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span>{(totalMemberCount || 1).toLocaleString()} người</span>
              </div>
          </div>
        </div>
      </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          {/* Quick Audio Settings Button in Top Header */}
          <button
            onClick={() => setShowAudioSettings(true)}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent font-extrabold text-xs transition cursor-pointer shadow-sm"
            title="Mở Cài đặt Mic & Âm thanh"
          >
            <Sliders className="w-3.5 h-3.5 text-accent" />
            <span className="text-[11px] hidden sm:inline">Âm Thanh</span>
          </button>

          {/* User Profile / Avatar Pill */}
          {user && (
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center space-x-1.5 pl-1 pr-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer group"
              title="Đổi Avatar & Nickname của bạn"
            >
              <Avatar name={user.display_name} seed={user.avatar_seed} size="sm" />
              <span className="text-xs font-bold text-white max-w-[70px] sm:max-w-[90px] truncate hidden sm:inline group-hover:text-primary transition-colors">
                {user.display_name}
              </span>
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-text-secondary hover:text-white transition"
          >
            <Share2 className="w-3.5 h-3.5 text-accent" />
            <span>{copied ? 'Đã chép link!' : 'Mời bạn'}</span>
          </button>

          {/* Host only: Đóng phòng button */}
          {isHost && (
            <button
              onClick={() => setShowCloseModal(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-danger hover:bg-red-700 text-white text-xs font-extrabold flex items-center space-x-1 transition shadow-md shadow-danger/20"
              title="Đóng phòng & Giải tán buổi hát"
            >
              <Power className="w-3.5 h-3.5" />
              <span className="text-[11px]">Đóng Phòng</span>
            </button>
          )}

          <button
            onClick={handleLeaveRoom}
            className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white text-xs font-bold flex items-center space-x-1.5 transition"
            title="Thoát ra trang chủ"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Thoát</span>
          </button>
      </div>
      </header>

      {/* Main Spacious 2-Area Discord-Stage Layout */}
      <main className="flex-1 p-2.5 sm:p-3 md:p-4 flex flex-col lg:flex-row gap-2.5 sm:gap-3 md:gap-4 overflow-hidden min-h-0">
        {/* Left Area: Sân Khấu Chính (YouTube + Podium) chiếm trọn bên trái */}
        <section className="flex-1 flex flex-col space-y-2.5 sm:space-y-3 overflow-y-auto min-w-0 pr-0.5">
          {/* YouTube Player */}
          <div className="shrink-0">
            <YouTubePlayer
              roomId={roomId!}
              isHost={isHost}
              onPlayNext={handlePlayNextSong}
              onLoadSong={handleAddSong}
              onOpenSearch={isHost ? handleOpenSearch : undefined}
              onSelectPlayNow={handleSearchPlayNow}
            />
          </div>

          {/* Active Singers Podium */}
          <div className="shrink-0">
            <StagePodium
              roomId={roomId!}
              isHost={isHost}
              onMuteSpeaker={handleHostMute}
              onGainChange={handleHostGain}
              onRemoveSpeaker={handleHostRemoveSpeaker}
              getTriggerProps={userContextMenu.getTriggerProps}
              onOpenContextMenu={userContextMenu.openMenu}
              onOpenAudioSettings={handleOpenAudioSettings}
            />
          </div>
        </section>

        {/* Right Area: Sidebar (Desktop side panel OR Mobile slide-over drawer) */}
        {isSidebarOpen && (
          <>
            {/* Mobile Backdrop overlay: ONLY visible when EXPANDED on mobile so COMPACT mode never shades the video! */}
            {mobileViewMode === 'expanded' && (
              <div
                onClick={() => setMobileViewMode('compact')}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 lg:hidden animate-fadeIn"
              />
            )}

            <aside
              className={`
                z-40 transition-all duration-300 ease-in-out shrink-0 overflow-hidden shadow-2xl lg:shadow-none
                ${/* Desktop Layout */ ''}
                lg:static lg:inset-auto lg:top-auto lg:bottom-auto lg:w-[390px] xl:w-[420px] lg:h-full
                ${/* Mobile Layout */ ''}
                ${
                  mobileViewMode === 'compact'
                    ? 'fixed bottom-16 inset-x-0 h-[45vh] max-h-[380px] rounded-t-3xl border-t border-white/20 bg-bg-card/95 backdrop-blur-xl lg:rounded-2xl lg:border lg:bg-bg-card'
                    : 'fixed inset-x-2 top-16 bottom-16 rounded-2xl border border-white/20 bg-bg-card/98 backdrop-blur-xl lg:rounded-2xl lg:border lg:bg-bg-card'
                }
              `}
            >
              <RoomSidebar
                roomId={roomId!}
                isHost={isHost}
                onSendMessage={handleSendMessage}
                onAddSong={handleAddSong}
                onPlaySongNow={handlePlaySongNow}
                onPlayDirect={handleSearchPlayNow}
                onRemoveSong={handleRemoveSong}
                onApproveHand={handleApproveHand}
                onRejectHand={handleRejectHand}
                onMuteSpeaker={handleHostMute}
                onGainChange={handleHostGain}
                onRemoveSpeaker={handleHostRemoveSpeaker}
                onKickMember={handleHostKick}
                onBanMember={handleHostBan}
                onOpenSearch={isHost ? handleOpenSearch : undefined}
                onClose={handleCloseSidebar}
                mobileViewMode={mobileViewMode}
                onToggleMobileViewMode={handleToggleMobileViewMode}
                getTriggerProps={userContextMenu.getTriggerProps}
                onOpenContextMenu={userContextMenu.openMenu}
              />
            </aside>
          </>
        )}

        {/* Floating Mini Icon & Quick Reaction Strip (When collapsed on mobile or desktop) */}
        {!isSidebarOpen && (
          <div className="fixed bottom-20 right-3 z-40 flex flex-col items-end space-y-2 select-none animate-fadeIn">
            {/* Live Reaction Speech Bubble (Pops up when a cheer or chat arrives) */}
            {latestToast && (
              <div className="mr-1 max-w-[220px] sm:max-w-xs p-2 rounded-2xl bg-gradient-to-r from-bg-card to-bg-panel border border-primary/40 text-white shadow-2xl flex items-center space-x-2 animate-bounce">
                <span className="text-xl shrink-0">
                  {latestToast.type === 'sticker' ? latestToast.text.slice(0, 2) : '💬'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold text-accent truncate">
                    {latestToast.sender}
                </div>
                  <div className="text-[11px] font-semibold text-white truncate">
                    {latestToast.type === 'sticker'
                      ? latestToast.text.slice(2).trim()
                      : latestToast.text}
                </div>
              </div>
            </div>
            )}

            {/* Quick 1-Tap Cheer Strip right above the floating icon for instant reactions on phone! */}
            <div className="flex items-center space-x-1.5 p-1 rounded-full bg-black/80 backdrop-blur-md border border-white/20 shadow-xl">
              {[
                { emoji: '👏', text: '👏 Tuyệt vời! Vỗ tay cho ca sĩ nào!' },
                { emoji: '💐', text: '💐 Tặng ca sĩ một bó hoa tươi thắm!' },
                { emoji: '🔥', text: '🔥 Hát cháy quá anh em ơi!' },
                { emoji: '💖', text: '💖 Thả tim nồng nhiệt cho bài hát!' },
              ].map((c) => (
                <button
                  key={c.emoji}
                  type="button"
                  onClick={() => handleSendMessage(c.text, 'sticker')}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 active:scale-90 flex items-center justify-center text-base transition shadow hover:scale-110"
                  title={c.text}
                >
                  {c.emoji}
                </button>
              ))}
          </div>

            {/* Main Floating Chat Icon (Thu phóng button) */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="relative px-3.5 py-2.5 rounded-full bg-gradient-to-tr from-primary to-accent hover:from-primary-dark hover:to-yellow-500 text-white shadow-2xl flex items-center space-x-2 hover:scale-105 active:scale-95 transition-all border border-white/25 group font-extrabold text-xs"
              title="Mở khung Chat & Sân khấu (Nhấn để phóng to)"
            >
              <MessageSquare className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:inline">Chat & Sân Khấu</span>
              <span className="sm:hidden">Chat</span>

              {/* Hand queue or unread badge */}
              {pendingHandCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-danger text-white text-[9px] font-black animate-pulse shadow-md">
                  {pendingHandCount}
                </span>
              )}
            </button>
        </div>
        )}
      </main>

      {/* Bottom Bar: Giơ tay, Mic RAW status, Cài đặt */}
      <BottomBar
        roomId={roomId!}
        isHost={isHost}
        isChatOpen={isSidebarOpen}
        onToggleChat={handleToggleSidebar}
        onRaiseHand={handleRaiseHand}
        onCancelHand={handleCancelHand}
        onAcceptStageInvite={handleAcceptStageInvite}
        onDeclineStageInvite={handleDeclineStageInvite}
        onToggleMic={handleToggleMic}
        onLeaveStage={handleLeaveStage}
        onLeaveRoom={handleLeaveRoom}
        onOpenAudioSettings={handleOpenAudioSettings}
      />

      {/* Audio Settings Modal */}
      <AudioSettingsModal isOpen={showAudioSettings} onClose={() => setShowAudioSettings(false)} />

      {/* YouTube Direct Search Modal (Chủ phòng độc quyền) */}
      {isHost && (
        <YouTubeSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          isHost={true}
          onSelectPlayNow={handleSearchPlayNow}
          onSelectAddToQueue={handleSearchAddToQueue}
        />
      )}

      {/* Discord Style User Context Menu (Chuột phải hoặc hold trên bất kỳ ai) */}
      <UserContextMenu
        isOpen={userContextMenu.menuState.isOpen}
        x={userContextMenu.menuState.x}
        y={userContextMenu.menuState.y}
        target={userContextMenu.menuState.target}
        isHost={isHost}
        onClose={userContextMenu.closeMenu}
        onOpenProfile={() => setShowProfileModal(true)}
        onMuteSpeaker={handleHostMute}
        onGainChange={handleHostGain}
        onRemoveSpeaker={handleHostRemoveSpeaker}
        onInviteToStage={handleHostInviteToStage}
        onKickMember={handleHostKick}
        onBanMember={handleHostBan}
      />
      {/* Host Confirm Close Room Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-bg-card border border-danger/40 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-danger">
              <div className="p-3 bg-danger/20 rounded-2xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">Đóng Phòng Karaoke?</h3>
                <p className="text-[11px] text-text-secondary">Chỉ dành cho Chủ Phòng</p>
              </div>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Bạn có chắc chắn muốn <span className="text-danger font-bold">ĐÓNG PHÒNG</span> và kết thúc buổi hát? Toàn bộ ca sĩ và khán giả sẽ được đưa về Trang Chủ.
            </p>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmCloseRoom}
                className="flex-1 py-2.5 rounded-xl bg-danger hover:bg-red-700 text-white font-extrabold text-xs shadow-lg shadow-danger/30 transition flex items-center justify-center space-x-1.5"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Xác Nhận Đóng</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile & Avatar Modal */}
      <NicknameModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </div>
  );
};

export default KaraokeRoomPage;
