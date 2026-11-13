import { useEffect, useRef, useCallback } from 'react';
import { loadYouTubeAPI, YTPlayer } from '../lib/youtube';
import { useYouTubeStore } from '../store/youtubeStore';
import { useSocket } from './useSocket';
import { useRoomStore } from '../store/roomStore';
import { useAuthStore } from '../store/authStore';

export function useYouTube(containerId: string, roomId?: string) {
  const playerRef = useRef<YTPlayer | null>(null);
  const store = useYouTubeStore();
  const socket = useSocket();
  const myRole = useRoomStore((s) => {
    const user = useAuthStore.getState().user;
    return s.members.find((m) => m.user_id === user?.id)?.role ?? 'AUDIENCE';
  });
  const isHost = myRole === 'OWNER' || myRole === 'MODERATOR';

  const initPlayer = useCallback(
    async (videoId?: string) => {
      await loadYouTubeAPI();
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      const container = document.getElementById(containerId);
      if (!container) return;

      playerRef.current = new window.YT.Player(containerId, {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: (e) => {
            console.log('YT player ready');
            if (videoId) store.setVideoId(videoId);
          },
          onStateChange: (e) => {
            const { PlayerState } = window.YT;
            switch (e.data) {
              case PlayerState.PLAYING:
                store.setState('playing');
                store.setBuffering(false);
                break;
              case PlayerState.PAUSED:
                store.setState('paused');
                break;
              case PlayerState.BUFFERING:
                store.setBuffering(true);
                break;
              case PlayerState.ENDED:
                store.setState('ended');
                break;
              case PlayerState.UNSTARTED:
                store.setState('unstarted');
                break;
            }
          },
          onError: (e) => {
            const errorMap: Record<number, string> = {
              2: 'Video ID không hợp lệ',
              5: 'Lỗi HTML5 player',
              100: 'Video không tồn tại hoặc bị xoá',
              101: 'Video không được phép nhúng',
              150: 'Video không được phép nhúng',
            };
            store.setError(errorMap[e.data] ?? `Lỗi không xác định (${e.data})`);
          },
        },
      });
    },
    [containerId, store]
  );

  const loadVideo = useCallback(
    (videoId: string) => {
      if (playerRef.current) {
        playerRef.current.loadVideoById(videoId, 0);
        store.setVideoId(videoId);
        store.setError(null);
      }
    },
    [store]
  );

  const play = useCallback(
    (position?: number) => {
      if (!isHost || !playerRef.current || !roomId) return;
      const pos = position ?? playerRef.current.getCurrentTime();
      playerRef.current.seekTo(pos, true);
      playerRef.current.playVideo();
      socket.emit('youtube:play_at', { room_id: roomId, position_seconds: pos });
    },
    [isHost, socket, roomId]
  );

  const pause = useCallback(() => {
    if (!isHost || !playerRef.current || !roomId) return;
    const pos = playerRef.current.getCurrentTime();
    playerRef.current.pauseVideo();
    socket.emit('youtube:pause', { room_id: roomId, position_seconds: pos });
  }, [isHost, socket, roomId]);

  const seek = useCallback(
    (seconds: number) => {
      if (!isHost || !playerRef.current || !roomId) return;
      playerRef.current.seekTo(seconds, true);
      socket.emit('youtube:seek', { room_id: roomId, position_seconds: seconds });
    },
    [isHost, socket, roomId]
  );

  // Sync from server events via roomStore playback changes
  const syncFromPlayback = useCallback(
    (playback: { state: string; position_seconds: number; video_id: string | null; anchor_time: string }) => {
      if (!playerRef.current || !playback.video_id) return;

      const curVideo = store.videoId;
      if (curVideo !== playback.video_id) {
        loadVideo(playback.video_id);
        return;
      }

      const elapsed = (Date.now() - new Date(playback.anchor_time).getTime()) / 1000;
      const targetPos = playback.position_seconds + (playback.state === 'playing' ? elapsed : 0);

      if (playback.state === 'playing') {
        playerRef.current.seekTo(targetPos, true);
        playerRef.current.playVideo();
      } else if (playback.state === 'paused') {
        playerRef.current.pauseVideo();
        playerRef.current.seekTo(playback.position_seconds, true);
      }
    },
    [store.videoId, loadVideo]
  );

  useEffect(() => {
    initPlayer();
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return { player: playerRef, loadVideo, play, pause, seek, syncFromPlayback, isHost };
}
