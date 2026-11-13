import React, { useEffect, useRef, useState } from 'react';
import { useYouTubeStore } from '../../store/youtubeStore';
import { useRoomStore } from '../../store/roomStore';
import { useAudioStore } from '../../store/audioStore';
import { searchYouTube, YouTubeSearchResult } from '../../lib/api';
import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  Music,
  Search,
  Sparkles,
  X,
  Lock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';

interface YouTubePlayerProps {
  roomId: string;
  isHost: boolean;
  onPlayNext?: () => void;
  onLoadSong?: (videoId: string, title?: string) => void;
  onOpenSearch?: () => void;
  onSelectPlayNow?: (videoId: string, title?: string) => void;
}

const QUICK_TAGS = [
  'Karaoke Nhạc Trẻ',
  'Karaoke Bolero',
  'Karaoke Remix',
  'Karaoke Tone Nữ',
  'Karaoke Tone Nam',
  'Karaoke Acoustic',
];

function extractYouTubeId(urlOrId: string): string | null {
  const clean = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  const match = clean.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : null;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  roomId,
  isHost,
  onPlayNext,
  onOpenSearch,
  onSelectPlayNow,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const setPlayerState = useYouTubeStore((s) => s.setState);
  const setBuffering = useYouTubeStore((s) => s.setBuffering);
  const playback = useRoomStore((s) => s.playback);
  const beatSyncOffsetMs = useAudioStore((s) => s.beatSyncOffsetMs);

  const [localVolume, setLocalVolume] = useState(80);
  const currentTimeRef = useRef(0);
  const [userInteracted, setUserInteracted] = useState(false);

  // Cache initial start second per video_id so iframe src NEVER mutates during playback!
  const videoStartCacheRef = useRef<{ videoId: string; startSec: number }>({ videoId: '', startSec: 0 });
  if (playback?.video_id && videoStartCacheRef.current.videoId !== playback.video_id) {
    const startSec =
      playback.state === 'playing' && playback.anchor_time
        ? Math.max(
            0,
            Math.floor(
              playback.position_seconds +
                ((Date.now() - new Date(playback.anchor_time).getTime()) / 1000) *
                  (playback.playback_rate || 1)
            )
          )
        : Math.max(0, Math.floor(playback.position_seconds || 0));
    videoStartCacheRef.current = { videoId: playback.video_id, startSec };
  }

  // Inline YouTube Direct Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const searchDebounceRef = useRef<any>(null);

  const detectedVideoId = extractYouTubeId(searchQuery);

  // PostMessage helper to control YouTube iframe directly
  const postIframeCommand = (func: string, args: any[] = []) => {
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func, args }),
          '*'
        );
      }
    } catch (err) {
      console.warn('postIframeCommand error:', err);
    }
  };

  const handleUserTapToSync = () => {
    setUserInteracted(true);
    postIframeCommand('unMute');
    postIframeCommand('setVolume', [localVolume]);
    postIframeCommand('playVideo');
    if (typeof playback?.position_seconds === 'number') {
      const elapsed =
        playback.state === 'playing' && playback.anchor_time
          ? (Date.now() - new Date(playback.anchor_time).getTime()) / 1000
          : 0;
      const rate = playback.playback_rate || 1;
      const targetPos = Math.max(0, playback.position_seconds + elapsed * rate + beatSyncOffsetMs / 1000);
      postIframeCommand('seekTo', [targetPos, true]);
    }
  };

  // Listen to YouTube Iframe API postMessages (infoDelivery)
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.event === 'infoDelivery' && data.info) {
          if (typeof data.info.currentTime === 'number') {
            currentTimeRef.current = data.info.currentTime;
          }
          if (typeof data.info.playerState === 'number') {
            // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: cued
            if (data.info.playerState === 1) {
              setPlayerState('playing');
              setBuffering(false);
              setUserInteracted(true);
            } else if (data.info.playerState === 2) {
              setPlayerState('paused');
            } else if (data.info.playerState === 3) {
              setBuffering(true);
            } else if (data.info.playerState === 0) {
              setPlayerState('ended');
              if (isHost && onPlayNext) onPlayNext();
            }
          }
        }
      } catch (e) {
        // Not a JSON message or unrelated message
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [isHost, onPlayNext, setPlayerState, setBuffering]);

  // 1. Immediate sync on playback state or seek change from server
  useEffect(() => {
    if (!playback?.video_id) return;

    if (playback.state === 'playing') {
      postIframeCommand('playVideo');
    } else if (playback.state === 'paused') {
      postIframeCommand('pauseVideo');
    }

    if (typeof playback.position_seconds === 'number') {
      const elapsed =
        playback.state === 'playing' && playback.anchor_time
          ? (Date.now() - new Date(playback.anchor_time).getTime()) / 1000
          : 0;
      const rate = playback.playback_rate || 1;
      const targetPos = Math.max(0, playback.position_seconds + elapsed * rate + beatSyncOffsetMs / 1000);

      // Tight 0.35s drift check on direct state/seek trigger
      if (Math.abs(currentTimeRef.current - targetPos) > 0.35) {
        postIframeCommand('seekTo', [targetPos, true]);
        currentTimeRef.current = targetPos;
      }
    }
  }, [
    playback?.state,
    playback?.video_id,
    playback?.position_seconds,
    playback?.anchor_time,
    playback?.playback_rate,
    beatSyncOffsetMs,
  ]);

  // 2. Periodic precision beat clock synchronization for audience & singers
  useEffect(() => {
    if (isHost || !playback?.video_id || playback.state !== 'playing' || !playback.anchor_time) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const anchor = new Date(playback.anchor_time).getTime();
      const elapsed = (now - anchor) / 1000;
      const rate = playback.playback_rate || 1;
      const targetPos = Math.max(0, playback.position_seconds + elapsed * rate + beatSyncOffsetMs / 1000);
      const drift = currentTimeRef.current - targetPos;

      // Keep beat locked within 450ms of host / singer
      if (Math.abs(drift) > 0.45) {
        postIframeCommand('seekTo', [targetPos, true]);
        currentTimeRef.current = targetPos;
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [
    isHost,
    playback?.video_id,
    playback?.state,
    playback?.position_seconds,
    playback?.anchor_time,
    playback?.playback_rate,
    beatSyncOffsetMs,
  ]);

  const handleVolumeChange = (v: number) => {
    setLocalVolume(v);
    postIframeCommand('setVolume', [v]);
  };

  const handleHostPlay = () => {
    if (!isHost || !playback?.video_id) return;
    postIframeCommand('playVideo');
    const socket = (window as any).__SOCKET__;
    if (socket) {
      socket.emit('youtube:play_at', { roomId, position: currentTimeRef.current });
    }
  };

  const handleHostPause = () => {
    if (!isHost || !playback?.video_id) return;
    postIframeCommand('pauseVideo');
    const socket = (window as any).__SOCKET__;
    if (socket) {
      socket.emit('youtube:pause', { roomId, position: currentTimeRef.current });
    }
  };

  // Direct Search execution
  const performSearch = async (queryToSearch: string) => {
    const q = queryToSearch.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    if (extractYouTubeId(q)) {
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    try {
      const finalQuery = /karaoke/i.test(q) ? q : `${q} karaoke`;
      const { data } = await searchYouTube(finalQuery);
      setSearchResults(data.results || []);
      if ((data.results || []).length === 0) {
        setSearchError('Không tìm thấy bài hát karaoke nào phù hợp.');
      }
    } catch (err: any) {
      setSearchError(err.response?.data?.error || 'Lỗi khi tìm bài trên YouTube.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchInputChange = (val: string) => {
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (val.trim().length > 1) {
      searchDebounceRef.current = setTimeout(() => {
        performSearch(val);
      }, 350);
    } else {
      setSearchResults([]);
    }
  };

  // Direct Instant Play (No Queue required)
  const handlePlayDirect = (videoId: string, title?: string) => {
    const songTitle = title || 'Karaoke Beat';
    if (onSelectPlayNow) {
      onSelectPlayNow(videoId, songTitle);
    } else {
      const socket = (window as any).__SOCKET__;
      if (socket) {
        socket.emit('youtube:load', { roomId, videoId, title: songTitle });
        socket.emit('youtube:play_at', { roomId, position: 0 });
      }
    }

    setSearchQuery('');
    setSearchResults([]);
    setShowInlineSearch(false);
  };

  const currentSongTitle = playback?.title || 'Karaoke Beat Chuẩn';

  return (
    <div className="flex flex-col h-full bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative select-none">
      {/* 🎵 NOW PLAYING HEADER BANNER (Hiển thị rõ ràng tên bài hát đang phát) */}
      {playback?.video_id && (
        <div className="px-3.5 py-2.5 bg-gradient-to-r from-bg-panel via-bg-card to-bg-panel border-b border-white/10 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center space-x-2.5 min-w-0">
            {/* Live Audio Equalizer Indicator */}
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary/30 to-red-600/30 border border-primary/40 flex items-center justify-center shrink-0 shadow-md">
              {playback.state === 'playing' ? (
                <div className="flex items-end space-x-0.5 h-3.5">
                  <span className="w-1 bg-primary animate-pulse h-3 rounded-full" />
                  <span className="w-1 bg-accent animate-[pulse_0.6s_infinite] h-4 rounded-full" />
                  <span className="w-1 bg-primary animate-[pulse_0.4s_infinite] h-2 rounded-full" />
                </div>
              ) : (
                <Music className="w-4 h-4 text-primary" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-primary text-white tracking-wider">
                  {playback.state === 'playing' ? 'Đang Phát' : 'Tạm Dừng'}
                </span>
                <span className="text-[10px] text-text-secondary truncate">
                  Sân khấu Karaoke
                </span>
              </div>
              <h2
                className="text-xs md:text-sm font-extrabold text-white truncate max-w-[240px] sm:max-w-md md:max-w-lg mt-0.5"
                title={currentSongTitle}
              >
                {currentSongTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Host Quick Search Toggle */}
            {isHost && (
              <button
                onClick={() => setShowInlineSearch(!showInlineSearch)}
                className="px-2.5 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs font-bold flex items-center space-x-1.5 transition"
                title="Đổi bài hát khác trực tiếp trên YouTube"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Đổi bài</span>
                {showInlineSearch ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            )}

            <a
              href={`https://www.youtube.com/watch?v=${playback.video_id}`}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition"
              title="Mở trên YouTube"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* 16:9 Aspect Video Player Container */}
      <div className="relative w-full aspect-video bg-[#0a0b0d] overflow-hidden">
        {playback?.video_id ? (
          // ACTIVE VIDEO IFRAME (Direct Embed, Guaranteed to Render)
          <div className="w-full h-full relative bg-black">
            {(() => {
              const initialStartSeconds = videoStartCacheRef.current.startSec;

              return (
                <>
                  <iframe
                    ref={iframeRef}
                    key={playback.video_id}
                    src={`https://www.youtube-nocookie.com/embed/${playback.video_id}?enablejsapi=1&autoplay=1&mute=0&start=${initialStartSeconds}&controls=1&rel=0&playsinline=1&modestbranding=1&origin=${encodeURIComponent(
                      window.location.origin
                    )}`}
                    title={currentSongTitle}
                    className="w-full h-full border-0 absolute inset-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />

                  {/* 1-Tap Overlay for Newcomers or Mobile Autoplay Block */}
                  {playback.state === 'playing' && !userInteracted && (
                    <button
                      type="button"
                      onClick={handleUserTapToSync}
                      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/65 backdrop-blur-xs transition cursor-pointer hover:bg-black/50 group select-none"
                    >
                      <div className="px-5 py-3 rounded-2xl bg-gradient-to-r from-primary to-accent hover:scale-105 active:scale-95 text-bg-base font-extrabold flex items-center space-x-2.5 shadow-2xl animate-pulse transition-all">
                        <Play className="w-6 h-6 fill-bg-base" />
                        <span className="text-xs sm:text-sm font-black uppercase tracking-wider">
                          Chạm để nghe nhạc cùng phòng
                        </span>
                      </div>
                      <p className="text-[11px] text-white/90 mt-2 font-medium">
                        Phòng đang phát nhạc trực tiếp — Chạm để đồng bộ âm thanh ngay
                      </p>
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
          // EMPTY STATE: Search & Direct Play
          <div className="absolute inset-0 flex flex-col justify-center p-4 md:p-6 bg-gradient-to-b from-[#18191c] via-[#121316] to-[#0a0b0d] overflow-y-auto">
            {isHost ? (
              // HOST: Direct YouTube Search & Instant Play Box on the Screen
              <div className="max-w-xl mx-auto w-full my-auto flex flex-col space-y-3.5">
                <div className="text-center space-y-1">
                  <div className="inline-flex p-2.5 rounded-2xl bg-gradient-to-tr from-red-600/20 to-primary/20 text-primary border border-primary/20 mb-1 shadow-lg">
                    <Music className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-sm md:text-base font-extrabold text-white">
                    Sân Khấu Karaoke Đang Chờ Bài Hát
                  </h3>
                  <p className="text-[11px] md:text-xs text-text-secondary">
                    Bạn là <span className="text-primary font-bold">Chủ Phòng</span>. Tìm bài hát trên YouTube hoặc dán link để{' '}
                    <span className="text-white font-bold">hát ngay trực tiếp</span>!
                  </p>
                </div>

                {/* Direct Search Bar */}
                <div className="relative">
                  <div className="flex items-center space-x-2 bg-bg-panel border-2 border-primary/40 focus-within:border-primary rounded-2xl px-3 py-2 shadow-xl transition">
                    <Search className="w-4 h-4 text-primary shrink-0" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          performSearch(searchQuery);
                        }
                      }}
                      placeholder="Nhập tên bài hát hoặc dán link YouTube (VD: Tìm em karaoke, Cắt đôi nỗi sầu)..."
                      className="w-full bg-transparent text-xs text-white placeholder-text-secondary/60 focus:outline-none"
                      autoFocus
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="text-text-secondary hover:text-white p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => performSearch(searchQuery)}
                      disabled={searchLoading || !searchQuery.trim()}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-primary hover:from-red-700 hover:to-primary-dark text-white text-xs font-bold shrink-0 transition disabled:opacity-50"
                    >
                      {searchLoading ? 'Đang tìm...' : 'Tìm'}
                    </button>
                  </div>

                  {/* Detected Direct Link Button */}
                  {detectedVideoId && (
                    <div className="mt-2 p-2 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-between">
                      <span className="text-[11px] text-white truncate mr-2">
                        🔗 Link YouTube: <span className="font-mono text-accent">{detectedVideoId}</span>
                      </span>
                      <button
                        onClick={() => handlePlayDirect(detectedVideoId, 'YouTube Video')}
                        className="px-3 py-1 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold flex items-center space-x-1 shrink-0 shadow transition"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Phát Ngay</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Suggestion Chips */}
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
                  <span className="text-text-secondary text-[10px] uppercase font-bold shrink-0 mr-1 flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-accent" />
                    <span>Gợi ý:</span>
                  </span>
                  {QUICK_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setSearchQuery(tag);
                        performSearch(tag);
                      }}
                      className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-text-secondary hover:text-white shrink-0 transition"
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                {/* Loading state */}
                {searchLoading && (
                  <div className="py-6 text-center text-xs text-text-secondary space-y-1.5">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    <p>Đang tìm kiếm bài hát karaoke trên YouTube...</p>
                  </div>
                )}

                {/* Error */}
                {searchError && (
                  <div className="p-2 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs text-center">
                    {searchError}
                  </div>
                )}

                {/* Live Direct Results List (Instant Play) */}
                {searchResults.length > 0 && (
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 rounded-xl bg-black/50 p-2 border border-white/10">
                    {searchResults.map((v) => (
                      <div
                        key={v.videoId}
                        className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center space-x-2.5 transition group border border-transparent hover:border-white/10"
                      >
                        <div className="relative w-16 md:w-20 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
                          <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                          {v.duration && (
                            <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/80 text-[8px] font-mono text-white">
                              {v.duration}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">
                            {v.title}
                          </div>
                          <div className="text-[10px] text-text-secondary truncate">{v.author}</div>
                        </div>
                        <button
                          onClick={() => handlePlayDirect(v.videoId, v.title)}
                          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-primary hover:from-red-700 hover:to-primary-dark text-white text-xs font-bold flex items-center space-x-1 shrink-0 shadow-md shadow-primary/25 hover:scale-105 transition-all"
                          title="Bấm để phát bài này ngay lập tức trên sân khấu"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Hát Ngay</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // AUDIENCE: Locked View (No interaction, only Host can choose)
              <div className="max-w-md mx-auto text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-red-600/20 to-primary/20 text-primary flex items-center justify-center mx-auto animate-pulse border border-primary/20 shadow-lg">
                  <Music className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-base font-extrabold text-white">
                  Sân Khấu Karaoke Đang Chờ Bài Hát
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Chủ phòng đang chọn bài hát trực tiếp trên YouTube. Hãy sẵn sàng bấm nút{' '}
                  <span className="text-primary font-bold">"Giơ Tay"</span> ở thanh bên dưới để xin lên sân khấu hát nhé!
                </p>
                <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-text-secondary">
                  <Lock className="w-3.5 h-3.5 text-accent" />
                  <span>Chỉ Chủ phòng có quyền tìm và chọn bài hát YouTube</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control Bar Below Player */}
      <div className="p-2.5 md:p-3 bg-bg-card border-t border-white/10 flex flex-col space-y-2">
        {/* Controls Row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Left: Playback & Search controls */}
          {isHost ? (
            <div className="flex items-center space-x-2">
              {playback?.video_id && (
                <>
                  {playback?.state === 'playing' ? (
                    <button
                      onClick={handleHostPause}
                      className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center space-x-1.5 transition"
                    >
                      <Pause className="w-4 h-4 text-accent" />
                      <span>Tạm dừng</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleHostPlay}
                      className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-primary/30 transition"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Phát tiếp</span>
                    </button>
                  )}

                  {onPlayNext && (
                    <button
                      onClick={onPlayNext}
                      className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white text-xs font-semibold flex items-center space-x-1 transition"
                      title="Chuyển bài tiếp theo trong hàng chờ"
                    >
                      <SkipForward className="w-4 h-4" />
                      <span className="hidden sm:inline">Bài tiếp</span>
                    </button>
                  )}
                </>
              )}

              {/* Host Inline Search Toggle */}
              <button
                onClick={() => setShowInlineSearch(!showInlineSearch)}
                className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs font-bold flex items-center space-x-1.5 transition"
                title="Tìm bài hát trên YouTube trực tiếp"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{playback?.video_id ? 'Đổi bài hát' : 'Tìm bài'}</span>
                {showInlineSearch ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : (
            <div className="text-xs text-text-secondary flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>Đang nghe theo Chủ phòng</span>
            </div>
          )}

          {/* Right: Local Background Music Volume */}
          <div className="flex items-center space-x-2 text-text-secondary">
            <Volume2 className="w-4 h-4 text-accent" />
            <span className="text-[11px] hidden sm:inline">Nhạc beat:</span>
            <input
              type="range"
              min={0}
              max={100}
              value={localVolume}
              onChange={(e) => handleVolumeChange(parseInt(e.target.value, 10))}
              className="w-20 md:w-28 h-1.5 rounded-lg appearance-none bg-white/20 accent-accent cursor-pointer"
              title={`Âm lượng beat cá nhân: ${localVolume}%`}
            />
            <span className="text-[11px] w-7 text-right">{localVolume}%</span>
          </div>
        </div>

        {/* Collapsible Inline Search Bar for Host (Available anytime) */}
        {isHost && showInlineSearch && (
          <div className="pt-2 border-t border-white/10 space-y-2 animate-fadeIn">
            <div className="flex items-center space-x-2 bg-bg-panel border border-primary/30 rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-primary shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    performSearch(searchQuery);
                  }
                }}
                placeholder="Tìm bài hát khác trên YouTube hoặc dán link video..."
                className="w-full bg-transparent text-xs text-white placeholder-text-secondary/60 focus:outline-none"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="text-text-secondary hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => performSearch(searchQuery)}
                disabled={searchLoading || !searchQuery.trim()}
                className="px-3 py-1 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold transition disabled:opacity-50"
              >
                {searchLoading ? '...' : 'Tìm'}
              </button>
            </div>

            {/* Quick detected URL play button */}
            {detectedVideoId && (
              <div className="p-2 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-between">
                <span className="text-[11px] text-white truncate mr-2">
                  🔗 Link YouTube: <span className="font-mono text-accent">{detectedVideoId}</span>
                </span>
                <button
                  onClick={() => handlePlayDirect(detectedVideoId, 'YouTube Video')}
                  className="px-3 py-1 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold flex items-center space-x-1 shrink-0 shadow transition"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Phát Ngay</span>
                </button>
              </div>
            )}

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl bg-black/60 p-2 border border-white/10">
                {searchResults.map((v) => (
                  <div
                    key={v.videoId}
                    className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center space-x-2 transition"
                  >
                    <img
                      src={v.thumbnail}
                      alt=""
                      className="w-14 aspect-video rounded-lg object-cover bg-black"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{v.title}</div>
                      <div className="text-[10px] text-text-secondary truncate">{v.author}</div>
                    </div>
                    <button
                      onClick={() => handlePlayDirect(v.videoId, v.title)}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-red-600 to-primary hover:from-red-700 hover:to-primary-dark text-white text-xs font-bold flex items-center space-x-1 shadow transition"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      <span>Hát Ngay</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(YouTubePlayer);
