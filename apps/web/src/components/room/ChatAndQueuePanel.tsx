import React, { useState, useRef, useEffect } from 'react';
import { useRoomStore } from '../../store/roomStore';
import { useAuthStore } from '../../store/authStore';
import { MessageSquare, ListMusic, Send, Plus, Play, Trash2, Youtube } from 'lucide-react';

interface ChatAndQueuePanelProps {
  roomId: string;
  isHost: boolean;
  onSendMessage: (text: string) => void;
  onAddSong: (videoId: string, title?: string) => void;
  onPlaySongNow?: (songId: string) => void;
  onRemoveSong?: (songId: string) => void;
}

function extractYouTubeVideoId(url: string): string | null {
  const clean = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = clean.match(regex);
  return match ? match[1] : null;
}

export const ChatAndQueuePanel: React.FC<ChatAndQueuePanelProps> = ({
  roomId,
  isHost,
  onSendMessage,
  onAddSong,
  onPlaySongNow,
  onRemoveSong,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'queue'>('chat');
  const [chatText, setChatText] = useState('');
  const [songUrl, setSongUrl] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [songError, setSongError] = useState<string | null>(null);

  const chatMessages = useRoomStore((s) => s.chatMessages);
  const songQueue = useRoomStore((s) => s.songQueue).filter((s) => s.status === 'queued');
  const user = useAuthStore((s) => s.user);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendMessage(chatText.trim());
    setChatText('');
  };

  const handleAddSongSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSongError(null);
    const videoId = extractYouTubeVideoId(songUrl);
    if (!videoId) {
      setSongError('Vui lòng nhập link YouTube hợp lệ (hoặc Video ID 11 ký tự)!');
      return;
    }
    onAddSong(videoId, songTitle.trim() || undefined);
    setSongUrl('');
    setSongTitle('');
  };

  return (
    <div className="flex flex-col h-full bg-bg-card border border-white/10 rounded-2xl overflow-hidden shadow-xl select-none">
      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-bg-panel text-xs font-bold">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-3 px-3 flex items-center justify-center space-x-2 transition border-b-2 ${
            activeTab === 'chat'
              ? 'border-primary text-primary bg-white/5'
              : 'border-transparent text-text-secondary hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Trò chuyện</span>
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex-1 py-3 px-3 flex items-center justify-center space-x-2 transition border-b-2 ${
            activeTab === 'queue'
              ? 'border-primary text-primary bg-white/5'
              : 'border-transparent text-text-secondary hover:text-white'
          }`}
        >
          <ListMusic className="w-4 h-4 text-accent" />
          <span>Hàng chờ bài ({songQueue.length})</span>
        </button>
      </div>

      {/* Tab 1: Chat Feed */}
      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {chatMessages.length === 0 ? (
              <div className="text-center py-10 text-text-secondary text-xs">
                Chào mừng bạn đến với phòng! Hãy gửi lời chào và cổ vũ mọi người hát nhé! 🎶
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                const isMe = msg.user_id === user?.id;

                return (
                  <div
                    key={msg.id || idx}
                    className={`flex flex-col text-xs ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center space-x-1.5 mb-0.5">
                      <span className="font-bold text-text-secondary text-[11px]">
                        {msg.display_name}
                      </span>
                      <span className="text-[9px] text-text-secondary opacity-60">
                        {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-2xl max-w-[85%] break-words leading-relaxed ${
                        isMe
                          ? 'bg-primary text-white rounded-tr-none'
                          : 'bg-bg-panel border border-white/5 text-text-primary rounded-tl-none'
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <form onSubmit={handleSendChat} className="p-2.5 border-t border-white/10 bg-bg-panel flex space-x-2">
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Nhắn tin cổ vũ..."
              maxLength={300}
              className="flex-1 bg-bg-card border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary transition"
            />
            <button
              type="submit"
              disabled={!chatText.trim()}
              className="p-2 rounded-xl bg-primary hover:bg-primary-dark text-white disabled:opacity-40 transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        /* Tab 2: Song Queue */
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {/* Song list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {songQueue.length === 0 ? (
              <div className="text-center py-8 text-text-secondary text-xs">
                Chưa có bài hát nào trong hàng chờ. Dán link YouTube bên dưới để thêm bài!
              </div>
            ) : (
              songQueue.map((song) => (
                <div
                  key={song.id}
                  className="p-2 rounded-xl bg-bg-panel border border-white/5 flex items-center space-x-2.5 hover:border-white/10 transition"
                >
                  <img
                    src={song.thumbnail || `https://img.youtube.com/vi/${song.video_id}/mqdefault.jpg`}
                    alt=""
                    className="w-14 h-10 object-cover rounded-lg shrink-0 bg-black"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate" title={song.title}>
                      {song.title}
                    </div>
                    <div className="text-[10px] text-text-secondary truncate">
                      Yêu cầu: <span className="text-accent">{song.requester_name || 'Khách'}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    {isHost && onPlaySongNow && (
                      <button
                        onClick={() => onPlaySongNow(song.id)}
                        className="p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 transition"
                        title="Phát bài này ngay"
                      >
                        <Play className="w-3.5 h-3.5 fill-primary" />
                      </button>
                    )}
                    {onRemoveSong && (
                      <button
                        onClick={() => onRemoveSong(song.id)}
                        className="p-1.5 rounded-lg bg-white/5 text-text-secondary hover:text-danger hover:bg-danger/10 transition"
                        title="Xoá khỏi hàng chờ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Song Form */}
          <form onSubmit={handleAddSongSubmit} className="p-3 border-t border-white/10 bg-bg-panel space-y-2">
            {songError && (
              <div className="text-[11px] text-danger font-semibold">{songError}</div>
            )}
            <div className="flex space-x-1.5">
              <input
                type="text"
                value={songUrl}
                onChange={(e) => setSongUrl(e.target.value)}
                placeholder="Dán link YouTube hoặc Video ID..."
                className="flex-1 bg-bg-card border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary transition"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-accent text-bg-base font-bold text-xs flex items-center space-x-1 hover:bg-yellow-400 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ChatAndQueuePanel;
