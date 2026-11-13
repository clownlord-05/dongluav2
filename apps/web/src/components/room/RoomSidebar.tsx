import React, { useState, useRef, useEffect } from 'react';
import { useRoomStore } from '../../store/roomStore';
import { useAuthStore } from '../../store/authStore';
import Avatar from '../common/Avatar';
import {
  MessageSquare,
  Hand,
  ListMusic,
  Users,
  Send,
  Plus,
  Play,
  Trash2,
  Check,
  X,
  Mic,
  MicOff,
  Volume2,
  UserX,
  UserMinus,
  Ban,
  Music,
  Search,
  Smile,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Minimize2,
  Maximize2,
  MoreVertical,
} from 'lucide-react';

interface RoomSidebarProps {
  roomId: string;
  isHost: boolean;
  onSendMessage: (text: string, type?: 'text' | 'sticker') => void;
  onAddSong: (videoId: string, title?: string) => void;
  onPlaySongNow?: (songId: string) => void;
  onPlayDirect?: (videoId: string, title?: string) => void;
  onRemoveSong?: (songId: string) => void;
  onApproveHand?: (requestId: string) => void;
  onRejectHand?: (requestId: string) => void;
  onMuteSpeaker?: (userId: string, isMuted: boolean) => void;
  onGainChange?: (userId: string, gain: number) => void;
  onRemoveSpeaker?: (userId: string) => void;
  onKickMember?: (userId: string) => void;
  onBanMember?: (userId: string) => void;
  onOpenSearch?: () => void;
  onClose?: () => void;
  mobileViewMode?: 'compact' | 'expanded';
  onToggleMobileViewMode?: () => void;
  getTriggerProps?: (target: any) => any;
  onOpenContextMenu?: (target: any, x: number, y: number) => void;
}

interface StickerItem {
  id: string;
  emoji: string;
  text: string;
  gradient: string;
}

const KARAOKE_STICKERS: StickerItem[] = [
  { id: 's1', emoji: '🎤', text: 'Hát đỉnh chóp!', gradient: 'from-amber-500/20 to-orange-600/20 border-orange-500/40 text-orange-300' },
  { id: 's2', emoji: '👏', text: 'Tuyệt vời ông mặt trời!', gradient: 'from-emerald-500/20 to-teal-600/20 border-emerald-500/40 text-emerald-300' },
  { id: 's3', emoji: '💐', text: 'Tặng 1000 đóa hoa!', gradient: 'from-pink-500/20 to-rose-600/20 border-pink-500/40 text-pink-300' },
  { id: 's4', emoji: '🔥', text: 'Cháy quá anh em ơi!', gradient: 'from-red-500/20 to-orange-600/20 border-red-500/40 text-red-300' },
  { id: 's5', emoji: '🍻', text: '1 2 3 Dzô! Cạn ly!', gradient: 'from-yellow-500/20 to-amber-600/20 border-yellow-500/40 text-yellow-300' },
  { id: 's6', emoji: '💯', text: '10 điểm không có nhưng!', gradient: 'from-purple-500/20 to-indigo-600/20 border-purple-500/40 text-purple-300' },
  { id: 's7', emoji: '💖', text: 'Thả ngàn trái tim!', gradient: 'from-rose-500/20 to-pink-600/20 border-rose-500/40 text-rose-300' },
  { id: 's8', emoji: '👑', text: 'Giọng ca vàng sân khấu!', gradient: 'from-amber-400/20 to-yellow-600/20 border-amber-400/40 text-amber-200' },
  { id: 's9', emoji: '🕺', text: 'Quẩy lên anh em ơi!', gradient: 'from-cyan-500/20 to-blue-600/20 border-cyan-500/40 text-cyan-300' },
  { id: 's10', emoji: '🚀', text: 'Lên nóc nhà bắt con gà!', gradient: 'from-violet-500/20 to-fuchsia-600/20 border-violet-500/40 text-violet-300' },
  { id: 's11', emoji: '🥹', text: 'Nghe nổi da gà luôn!', gradient: 'from-teal-500/20 to-emerald-600/20 border-teal-500/40 text-teal-300' },
  { id: 's12', emoji: '⭐', text: 'Idol của lòng tôi!', gradient: 'from-yellow-400/20 to-orange-500/20 border-yellow-400/40 text-yellow-200' },
];

const EMOJI_GROUPS = [
  {
    name: 'Âm Nhạc',
    emojis: ['🎤', '🎧', '🎵', '🎶', '🎸', '🎹', '🥁', '🎺', '🎷', '📻', '🎙️', '🔊', '🎼'],
  },
  {
    name: 'Cổ Vũ',
    emojis: ['🔥', '👏', '💐', '❤️', '💖', '💯', '🍻', '🥂', '🎉', '✨', '👑', '⭐', '🚀', '🥳', '🤩', '💃', '🕺', '🫶', '🙌', '🏆'],
  },
  {
    name: 'Biểu Cảm',
    emojis: ['😂', '🤣', '🥹', '😍', '😎', '😭', '😜', '🫡', '🤗', '🥰', '🤤', '🤫', '😇', '😘', '😋', '👍', '✌️', '🤟', '🤙', '🙏'],
  },
];

const QUICK_CHEERS = [
  { emoji: '👏', label: 'Vỗ tay', text: '👏 Tuyệt vời! Vỗ tay cho ca sĩ nào!' },
  { emoji: '💐', label: 'Tặng hoa', text: '💐 Tặng ca sĩ một bó hoa tươi thắm!' },
  { emoji: '🔥', label: 'Cháy quá', text: '🔥 Hát cháy quá anh em ơi!' },
  { emoji: '💖', label: 'Thả tim', text: '💖 Thả tim nồng nhiệt cho bài hát!' },
  { emoji: '🍻', label: 'Cạn ly', text: '🍻 1 2 3 Dzô! Nâng ly cổ vũ sân khấu!' },
  { emoji: '💯', label: '10 điểm', text: '💯 10 điểm cho giọng hát vàng!' },
];

function extractYouTubeVideoId(url: string): string | null {
  const clean = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = clean.match(regex);
  return match ? match[1] : null;
}

export const RoomSidebar: React.FC<RoomSidebarProps> = ({
  roomId,
  isHost,
  onSendMessage,
  onAddSong,
  onPlaySongNow,
  onPlayDirect,
  onRemoveSong,
  onApproveHand,
  onRejectHand,
  onMuteSpeaker,
  onGainChange,
  onRemoveSpeaker,
  onKickMember,
  onBanMember,
  onOpenSearch,
  onClose,
  mobileViewMode = 'compact',
  onToggleMobileViewMode,
  getTriggerProps,
  onOpenContextMenu,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'stage' | 'queue'>('chat');
  const [chatText, setChatText] = useState('');
  const [songUrl, setSongUrl] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [songError, setSongError] = useState<string | null>(null);

  // Sticker & Emoji Picker states
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'stickers' | 'emojis'>('stickers');
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  const chatMessages = useRoomStore((s) => s.chatMessages);
  const members = useRoomStore((s) => s.members);
  const totalMemberCount = useRoomStore((s) => s.totalMemberCount);
  const handQueue = useRoomStore((s) => s.handQueue).filter((h) => h.status === 'pending');
  const songQueue = useRoomStore((s) => s.songQueue).filter((s) => s.status === 'queued');
  const user = useAuthStore((s) => s.user);

  const chatListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeTab === 'chat' && chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatMessages.length, activeTab]);

  // Click outside to close emoji picker
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendMessage(chatText.trim(), 'text');
    setChatText('');
  };

  const handleSendSticker = (sticker: StickerItem) => {
    onSendMessage(`${sticker.emoji} ${sticker.text}`, 'sticker');
    setShowEmojiPicker(false);
  };

  const handleQuickCheer = (cheerText: string) => {
    onSendMessage(cheerText, 'sticker');
  };

  const handleInsertEmoji = (emoji: string) => {
    setChatText((prev) => prev + emoji);
  };

  const handleAddSongSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSongError(null);
    const videoId = extractYouTubeVideoId(songUrl);
    if (!videoId) {
      setSongError('Vui lòng dán link YouTube hợp lệ (hoặc Video ID 11 ký tự)!');
      return;
    }
    onAddSong(videoId, songTitle.trim() || undefined);
    setSongUrl('');
    setSongTitle('');
  };

  const speakers = members.filter((m) => m.role === 'SPEAKER' || m.role === 'OWNER');
  const audience = members.filter((m) => m.role === 'AUDIENCE' || m.role === 'MODERATOR');

  return (
    <aside className="flex flex-col h-full bg-bg-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl select-none relative">
      {/* Mobile Top Drag / Zoom Indicator */}
      <div
        onClick={onToggleMobileViewMode}
        className="w-full flex justify-center py-2 lg:hidden cursor-pointer bg-bg-panel/95 active:opacity-60 border-b border-white/5"
        title="Nhấn để phóng to hoặc thu nhỏ"
      >
        <div className="w-10 h-1.5 rounded-full bg-white/30 hover:bg-white/50 transition" />
      </div>

      {/* 3 Unified Tabs Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-bg-panel/90 text-xs font-bold shrink-0 px-1">
        <div className="flex items-center flex-1 min-w-0">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2.5 px-2 flex items-center justify-center space-x-1 transition border-b-2 ${
              activeTab === 'chat'
                ? 'border-primary text-primary bg-white/5'
                : 'border-transparent text-text-secondary hover:text-white'
            }`}
            title="Trò chuyện"
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Chat</span>
          </button>

          <button
            onClick={() => setActiveTab('stage')}
            className={`flex-1 py-2.5 px-2 flex items-center justify-center space-x-1 transition border-b-2 ${
              activeTab === 'stage'
                ? 'border-primary text-primary bg-white/5'
                : 'border-transparent text-text-secondary hover:text-white'
            }`}
            title="Quản lý sân khấu và thành viên"
          >
            <Hand className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Sân khấu</span>
            {handQueue.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-danger text-white text-[9px] font-black animate-pulse">
                {handQueue.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('queue')}
            className={`flex-1 py-2.5 px-2 flex items-center justify-center space-x-1 transition border-b-2 ${
              activeTab === 'queue'
                ? 'border-primary text-primary bg-white/5'
                : 'border-transparent text-text-secondary hover:text-white'
            }`}
            title="Hàng chờ bài hát"
          >
            <ListMusic className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Bài hát</span>
            {songQueue.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-accent/20 text-accent border border-accent/30 text-[9px] font-bold">
                {songQueue.length}
              </span>
            )}
          </button>
        </div>

        {/* Action Controls: Resize & Minimize to Icon */}
        <div className="flex items-center space-x-1 shrink-0 pl-1 border-l border-white/10">
          {/* Mobile Zoom (Compact <-> Expanded) Toggle */}
          {onToggleMobileViewMode && (
            <button
              type="button"
              onClick={onToggleMobileViewMode}
              className="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-white/10 transition lg:hidden"
              title={mobileViewMode === 'compact' ? 'Phóng to toàn màn hình' : 'Thu gọn nửa màn hình'}
            >
              {mobileViewMode === 'compact' ? (
                <Maximize2 className="w-3.5 h-3.5 text-accent" />
              ) : (
                <Minimize2 className="w-3.5 h-3.5 text-accent" />
              )}
            </button>
          )}

          {/* Minimize into Floating Icon button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-white/10 transition flex items-center space-x-1"
              title="Thu nhỏ thành Icon nổi"
            >
              <ChevronDown className="w-4 h-4 text-white" />
              <span className="text-[10px] hidden sm:inline font-bold">Thu nhỏ</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Realtime Chat */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col justify-between overflow-hidden relative">
          {/* Message List */}
          <div ref={chatListRef} className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="text-center py-12 text-text-secondary text-xs space-y-1">
                <div className="text-2xl">👋</div>
                <p className="font-semibold text-white">Chưa có tin nhắn nào</p>
                <p className="text-[11px]">Hãy gửi lời chào và cổ vũ mọi người hát nhé!</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                const senderId = msg.userId || msg.user_id;
                const isMe = senderId === user?.id;
                const senderName = msg.displayName || msg.display_name || 'Khách';
                const content = msg.text || msg.message || '';
                const timeStr = new Date(msg.createdAt || msg.timestamp || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isSticker = msg.type === 'sticker';
                const role = msg.role;

                const senderTarget = senderId
                  ? {
                      user_id: senderId,
                      display_name: senderName,
                      role: role || 'AUDIENCE',
                    }
                  : null;

                return (
                  <div
                    key={msg.id || idx}
                    {...(getTriggerProps && senderTarget ? getTriggerProps(senderTarget) : {})}
                    className={`flex flex-col text-xs cursor-pointer group ${isMe ? 'items-end' : 'items-start'}`}
                    title="Chuột phải hoặc giữ (hold) để tùy chỉnh âm lượng người này"
                  >
                    <div className="flex items-center space-x-1.5 mb-1">
                      <span className={`font-bold text-[11px] ${isMe ? 'text-primary' : 'text-text-secondary'}`}>
                        {senderName}
                      </span>
                      {role && role !== 'AUDIENCE' && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-white/10 text-accent">
                          {role === 'OWNER' ? 'Chủ phòng' : role === 'SPEAKER' ? 'Ca sĩ' : role}
                        </span>
                      )}
                      <span className="text-[9px] text-text-secondary opacity-60">
                        {timeStr}
                      </span>
                    </div>

                    {isSticker ? (
                      /* Sticker Card Bubble */
                      <div
                        className={`p-2.5 rounded-2xl max-w-[90%] shadow-lg transition-transform hover:scale-105 border ${
                          isMe
                            ? 'bg-gradient-to-br from-primary/30 via-red-600/20 to-orange-500/20 border-primary/50 text-white rounded-tr-none'
                            : 'bg-gradient-to-br from-bg-panel via-white/5 to-bg-panel border-white/20 text-white rounded-tl-none'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl animate-pulse shrink-0">
                            {content.slice(0, 2)}
                          </span>
                          <span className="font-extrabold text-xs text-white leading-snug">
                            {content.slice(2).trim()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* Regular Chat Bubble */
                      <div
                        className={`px-3.5 py-2 rounded-2xl max-w-[88%] break-words leading-relaxed text-xs shadow-sm ${
                          isMe
                            ? 'bg-gradient-to-r from-primary to-primary-dark text-white rounded-tr-none'
                            : 'bg-bg-panel border border-white/10 text-text-primary rounded-tl-none'
                        }`}
                      >
                        {content}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Cheer Reaction Bar (1 Chạm Cổ Vũ) */}
          <div className="px-3 pt-2 pb-1 border-t border-white/10 bg-bg-panel/90 flex items-center space-x-1.5 overflow-x-auto scrollbar-none shrink-0">
            <span className="text-[10px] text-accent font-bold uppercase shrink-0 mr-1 flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-accent" />
              <span>Cổ vũ:</span>
            </span>
            {QUICK_CHEERS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => handleQuickCheer(c.text)}
                className="px-2 py-1 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-white text-[11px] font-semibold flex items-center space-x-1 shrink-0 transition hover:scale-105 active:scale-95"
                title={c.text}
              >
                <span>{c.emoji}</span>
                <span className="text-[10px]">{c.label}</span>
              </button>
            ))}
          </div>

          {/* Emoji & Sticker Tray Popover */}
          {showEmojiPicker && (
            <div
              ref={emojiPickerRef}
              className="absolute bottom-16 left-2 right-2 bg-bg-card border border-white/15 rounded-2xl p-2.5 shadow-2xl z-30 flex flex-col space-y-2 animate-fadeIn max-h-60 sm:max-h-72"
            >
              {/* Popover Header with 2 Tabs */}
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex space-x-1">
                  <button
                    type="button"
                    onClick={() => setPickerTab('stickers')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      pickerTab === 'stickers'
                        ? 'bg-primary text-white shadow'
                        : 'text-text-secondary hover:text-white'
                    }`}
                  >
                    🎭 Sticker Cổ Vũ
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerTab('emojis')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      pickerTab === 'emojis'
                        ? 'bg-primary text-white shadow'
                        : 'text-text-secondary hover:text-white'
                    }`}
                  >
                    😊 Icon & Biểu Cảm
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(false)}
                  className="text-text-secondary hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content: Stickers */}
              {pickerTab === 'stickers' ? (
                <div className="grid grid-cols-2 gap-1.5 overflow-y-auto max-h-52 p-0.5">
                  {KARAOKE_STICKERS.map((stk) => (
                    <button
                      key={stk.id}
                      type="button"
                      onClick={() => handleSendSticker(stk)}
                      className={`p-2 rounded-xl bg-gradient-to-r ${stk.gradient} border text-left flex items-center space-x-2 hover:scale-[1.02] active:scale-95 transition shadow-sm`}
                    >
                      <span className="text-xl shrink-0">{stk.emoji}</span>
                      <span className="text-[11px] font-extrabold truncate">{stk.text}</span>
                    </button>
                  ))}
                </div>
              ) : (
                /* Content: Emojis */
                <div className="overflow-y-auto max-h-52 space-y-2.5 p-0.5">
                  {EMOJI_GROUPS.map((grp) => (
                    <div key={grp.name} className="space-y-1">
                      <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                        {grp.name}
                      </div>
                      <div className="grid grid-cols-8 gap-1">
                        {grp.emojis.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => handleInsertEmoji(em)}
                            className="w-8 h-8 rounded-lg hover:bg-white/10 text-base flex items-center justify-center transition active:scale-90"
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chat Input Bar */}
          <form
            onSubmit={handleSendChat}
            className="p-2.5 bg-bg-panel flex items-center space-x-2 shrink-0 relative border-t border-white/5"
          >
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-2 rounded-xl border transition shrink-0 ${
                showEmojiPicker
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-text-secondary hover:text-white'
              }`}
              title="Chọn Sticker & Icon cổ vũ"
            >
              <Smile className="w-4 h-4" />
            </button>
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Nhắn tin cổ vũ ca sĩ..."
              maxLength={300}
              className="flex-1 bg-bg-card border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-primary transition"
            />
            <button
              type="submit"
              disabled={!chatText.trim()}
              className="p-2 rounded-xl bg-primary hover:bg-primary-dark text-white disabled:opacity-40 transition shadow-md shadow-primary/20 shrink-0"
              title="Gửi tin nhắn"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: Sân Khấu & Thành Viên (Discord Stage Style) */}
      {activeTab === 'stage' && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
          {/* Section 1: Hàng Chờ Xin Hát */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-white uppercase tracking-wider">
              <div className="flex items-center space-x-1.5">
                <Hand className="w-4 h-4 text-accent" />
                <span>Yêu Cầu Xin Hát ({handQueue.length})</span>
              </div>
            </div>

            {handQueue.length === 0 ? (
              <div className="p-4 rounded-xl bg-bg-panel border border-white/5 text-center text-text-secondary text-xs">
                Hiện không có ai giơ tay xin hát.
              </div>
            ) : (
              handQueue.map((req) => {
                const reqTarget = {
                  user_id: req.user_id,
                  display_name: req.display_name,
                  avatar_seed: req.avatar_seed || req.user_id,
                  role: 'AUDIENCE',
                };
                return (
                  <div
                    key={req.id}
                    {...(getTriggerProps ? getTriggerProps(reqTarget) : {})}
                    className="p-2.5 rounded-xl bg-bg-panel border border-white/10 flex items-center justify-between hover:border-primary/40 transition cursor-pointer group"
                    title="Chuột phải hoặc giữ (hold) để tùy chỉnh thành viên này"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Avatar seed={req.avatar_seed || req.user_id} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {req.display_name || 'Khán giả'}
                        </div>
                        <div className="text-[10px] text-text-secondary">Xin lên sân khấu</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      {isHost && (
                        <>
                          {onApproveHand && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onApproveHand(req.id);
                              }}
                              className="p-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 transition"
                              title="Đồng ý cho lên hát"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onRejectHand && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRejectHand(req.id);
                              }}
                              className="p-1.5 rounded-lg bg-danger/20 hover:bg-danger/30 text-danger border border-danger/30 transition"
                              title="Từ chối"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          if (onOpenContextMenu) {
                            onOpenContextMenu(reqTarget, rect.left, rect.bottom + 4);
                          }
                        }}
                        className="p-1 rounded-md text-text-secondary hover:text-white hover:bg-white/10 transition opacity-70 group-hover:opacity-100"
                        title="Tùy chọn người dùng"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Section 2: Người Đang Trên Sân Khấu (Speakers) */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
              <Mic className="w-4 h-4 text-primary" />
              <span>Đang Trên Sân Khấu ({speakers.length})</span>
            </div>

            <div className="space-y-1.5">
              {speakers.map((spk) => (
                <div
                  key={spk.user_id}
                  {...(getTriggerProps ? getTriggerProps(spk) : {})}
                  className="p-2.5 rounded-xl bg-bg-panel border border-primary/20 flex flex-col space-y-2 cursor-pointer hover:border-primary/50 transition group"
                  title="Chuột phải hoặc giữ (hold) để mở menu cài đặt âm thanh"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Avatar seed={spk.avatar_seed} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate flex items-center space-x-1.5">
                          <span>{spk.display_name}</span>
                          {spk.role === 'OWNER' && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/20 text-primary border border-primary/30">
                              Chủ phòng
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-text-secondary">
                          {spk.muted ? 'Đã tắt mic' : 'Đang bật mic'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      {isHost && spk.role !== 'OWNER' && (
                        <>
                          {onMuteSpeaker && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onMuteSpeaker(spk.user_id, !spk.muted);
                              }}
                              className={`p-1.5 rounded-lg transition ${
                                spk.muted
                                  ? 'bg-danger/20 text-danger border border-danger/30'
                                  : 'bg-white/5 text-text-secondary hover:text-white'
                              }`}
                              title={spk.muted ? 'Mở mic' : 'Tắt mic'}
                            >
                              {spk.muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {onRemoveSpeaker && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveSpeaker(spk.user_id);
                              }}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary hover:text-danger transition"
                              title="Mời xuống khán giả"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          if (onOpenContextMenu) {
                            onOpenContextMenu(spk, rect.left, rect.bottom + 4);
                          }
                        }}
                        className="p-1 rounded-md text-text-secondary hover:text-white hover:bg-white/10 transition opacity-70 group-hover:opacity-100"
                        title="Tùy chọn người dùng"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Host Gain Fader */}
                  {isHost && onGainChange && (
                    <div
                      className="flex items-center space-x-2 pt-1 border-t border-white/5 text-[11px] text-text-secondary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Volume2 className="w-3 h-3 text-accent shrink-0" />
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.05}
                        value={spk.gain ?? 1}
                        onChange={(e) => onGainChange(spk.user_id, parseFloat(e.target.value))}
                        className="flex-1 h-1 rounded-lg appearance-none bg-white/20 accent-primary cursor-pointer"
                      />
                      <span className="font-mono text-[10px] w-8 text-right">
                        {Math.round((spk.gain ?? 1) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Khán Giả Nghe (Audience) */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-text-secondary" />
                <span>Khán Giả ({(totalMemberCount || audience.length).toLocaleString()})</span>
              </div>
              {(totalMemberCount || audience.length) > 50 && (
                <span className="text-[10px] text-green-400 font-semibold px-1.5 py-0.5 rounded bg-green-500/10">
                  Siêu Mượt 5000+
                </span>
              )}
            </div>

            <div className="space-y-1">
              {audience.slice(0, 50).map((aud) => (
                <div
                  key={aud.user_id}
                  {...(getTriggerProps ? getTriggerProps(aud) : {})}
                  className="p-2 rounded-xl bg-bg-panel/60 border border-white/5 flex items-center justify-between hover:bg-bg-panel transition cursor-pointer group"
                  title="Chuột phải hoặc giữ (hold) để mở menu cài đặt âm thanh"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Avatar seed={aud.avatar_seed} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-white truncate">
                        {aud.display_name}
                      </div>
                      <div className="text-[10px] text-text-secondary">Khán giả nghe</div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    {isHost && (
                      <>
                        {onKickMember && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onKickMember(aud.user_id);
                            }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-danger/20 text-text-secondary hover:text-danger transition"
                            title="Kick khỏi phòng"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onBanMember && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onBanMember(aud.user_id);
                            }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-danger/20 text-text-secondary hover:text-danger transition"
                            title="Cấm (Ban) khỏi phòng"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (onOpenContextMenu) {
                          onOpenContextMenu(aud, rect.left, rect.bottom + 4);
                        }
                      }}
                      className="p-1 rounded-md text-text-secondary hover:text-white hover:bg-white/10 transition opacity-70 group-hover:opacity-100"
                      title="Tùy chọn người dùng"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {Math.max(0, (totalMemberCount || audience.length) - 50) > 0 && (
                <div className="p-3 text-center rounded-xl bg-white/5 border border-white/5 text-xs text-text-secondary">
                  ... và <span className="text-accent font-bold">+{Math.max(0, (totalMemberCount || audience.length) - 50).toLocaleString()}</span> khán giả khác đang theo dõi
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Hàng Chờ Bài Hát (Song Queue) */}
      {activeTab === 'queue' && (
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {/* Song Queue List */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
            {songQueue.length === 0 ? (
              <div className="text-center py-12 text-text-secondary text-xs space-y-1">
                <Music className="w-8 h-8 text-text-secondary mx-auto mb-1 opacity-50" />
                <p className="font-semibold text-white">Hàng chờ bài hát đang trống</p>
                <p className="text-[11px]">Dán link YouTube Karaoke vào ô bên dưới để thêm bài!</p>
              </div>
            ) : (
              songQueue.map((song, idx) => (
                <div
                  key={song.id}
                  className="p-2.5 rounded-xl bg-bg-panel border border-white/5 flex items-center space-x-3 hover:border-white/10 transition"
                >
                  <span className="text-xs font-bold text-accent w-4 text-center">
                    {idx + 1}
                  </span>
                  <img
                    src={song.thumbnail || `https://img.youtube.com/vi/${song.video_id}/mqdefault.jpg`}
                    alt=""
                    className="w-16 h-11 object-cover rounded-lg shrink-0 bg-black"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate" title={song.title}>
                      {song.title}
                    </div>
                    <div className="text-[10px] text-text-secondary truncate mt-0.5">
                      Bởi: <span className="text-accent">{song.requester_name || 'Khách'}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    {isHost && onPlaySongNow && (
                      <button
                        onClick={() => onPlaySongNow(song.id)}
                        className="px-2 py-1 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 text-xs font-bold flex items-center space-x-1 transition"
                        title="Phát bài này ngay lập tức"
                      >
                        <Play className="w-3 h-3 fill-primary" />
                        <span>Phát</span>
                      </button>
                    )}
                    {onRemoveSong && (
                      <button
                        onClick={() => onRemoveSong(song.id)}
                        className="p-1.5 rounded-lg bg-white/5 text-text-secondary hover:text-danger transition"
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

          {/* Add Song Form & Search Button (Host Only) */}
          {isHost ? (
            <div className="p-3 border-t border-white/10 bg-bg-panel space-y-2 shrink-0">
              {onOpenSearch && (
                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 via-primary to-primary-dark hover:from-red-700 hover:to-orange-700 text-white text-xs font-black flex items-center justify-center space-x-2 shadow-md shadow-red-600/20 hover:scale-[1.02] transition-all"
                >
                  <Search className="w-4 h-4" />
                  <span>Tìm & Chọn Bài Hát YouTube (Chủ Phòng)</span>
                </button>
              )}

              <form onSubmit={handleAddSongSubmit} className="space-y-2">
                {songError && (
                  <div className="text-[11px] text-danger font-semibold">{songError}</div>
                )}
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={songUrl}
                    onChange={(e) => setSongUrl(e.target.value)}
                    placeholder="Hoặc dán link YouTube Karaoke..."
                    className="w-full bg-bg-card border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary transition"
                  />
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={songTitle}
                      onChange={(e) => setSongTitle(e.target.value)}
                      placeholder="Tên bài hát (tuỳ chọn)"
                      className="flex-1 bg-bg-card border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary transition"
                    />
                    {onPlayDirect && (
                      <button
                        type="button"
                        onClick={() => {
                          const vId = extractYouTubeVideoId(songUrl);
                          if (!vId) {
                            setSongError('Vui lòng nhập link YouTube hợp lệ!');
                            return;
                          }
                          onPlayDirect(vId, songTitle.trim() || undefined);
                          setSongUrl('');
                          setSongTitle('');
                        }}
                        className="px-3 py-2 rounded-xl bg-gradient-to-r from-red-600 to-primary hover:from-red-700 hover:to-primary-dark text-white font-bold text-xs flex items-center space-x-1 transition shrink-0 shadow"
                        title="Phát ngay trên sân khấu"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Hát Ngay</span>
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-accent font-bold text-xs flex items-center space-x-1 transition shrink-0"
                      title="Thêm vào hàng chờ"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Hàng Chờ</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <div className="p-3 border-t border-white/10 bg-bg-panel text-center text-[11px] text-text-secondary shrink-0">
              <span>Chỉ Chủ phòng mới có quyền tìm kiếm và chọn bài hát cho sân khấu.</span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

export default React.memo(RoomSidebar);
