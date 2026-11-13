import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { createSession, updateProfile } from '../../lib/api';
import Avatar from './Avatar';
import {
  Sparkles,
  UserCheck,
  Upload,
  Smile,
  Bot,
  Image as ImageIcon,
  Check,
  X,
  RotateCcw,
} from 'lucide-react';

interface NicknameModalProps {
  isOpen: boolean;
  onClose: () => void;
  required?: boolean;
}

const RANDOM_NAMES = [
  'Họa Mi Rực Lửa',
  'Giọng Ca Vàng',
  'Sơn Tùng MTP Fake',
  'Thần Đồng Bolero',
  'Hét Ra Lửa',
  'Tiếng Hát Át Tiếng Bom',
  'Chúa Tể Nốt Cao',
  'Ca Sĩ Giấu Mặt',
  'Bản Lĩnh Đống Lửa',
  'Rocker Bóng Đêm',
  'Idol Giới Trẻ',
  'Diva Phòng Trà',
];

const PRESET_EMOJIS = [
  '🎤', '🔥', '👑', '🎸', '🎧', '🐱',
  '🐯', '🦊', '🐼', '🦄', '🚀', '⚡',
  '😎', '🐺', '🦁', '🐉', '💎', '🌸',
  '🍕', '🍺', '🤖', '🛸', '👾', '🎯',
];

const DICEBEAR_PRESETS = [
  { label: 'Robot DJ', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=spark' },
  { label: 'Robot Lửa', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=flame' },
  { label: 'Rocker', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=rockstar' },
  { label: 'Ca Sĩ Trẻ', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=karaoke' },
  { label: 'Anime Idol', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=music' },
  { label: 'Anime Star', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=singer' },
  { label: 'Vui Vẻ', url: 'https://api.dicebear.com/7.x/fun-emoji/svg?seed=cool' },
  { label: 'Cháy Quá', url: 'https://api.dicebear.com/7.x/fun-emoji/svg?seed=fire' },
];

export const NicknameModal: React.FC<NicknameModalProps> = ({
  isOpen,
  onClose,
  required = false,
}) => {
  const { user, setAuth, updateUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarSeed, setAvatarSeed] = useState(user?.avatar_seed || '');
  const [activeTab, setActiveTab] = useState<'emoji' | 'cartoon' | 'upload'>('emoji');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync state whenever modal opens or user changes
  useEffect(() => {
    if (isOpen) {
      setDisplayName(user?.display_name || '');
      setAvatarSeed(user?.avatar_seed || '');
      setError(null);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleRandomName = () => {
    const random = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    setDisplayName(random);
  };

  // Process and compress uploaded image to 160x160 lightweight base64 JPEG
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn file hình ảnh hợp lệ (.png, .jpg, .webp)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetSize = 160;
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Center square crop
        const minSide = Math.min(img.width, img.height);
        const startX = (img.width - minSide) / 2;
        const startY = (img.height - minSide) / 2;

        ctx.drawImage(img, startX, startY, minSide, minSide, 0, 0, targetSize, targetSize);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setAvatarSeed(dataUrl);
        setError(null);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleResetToDefault = () => {
    setAvatarSeed('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = displayName.trim();
    if (!cleanName) {
      setError('Vui lòng nhập tên hiển thị!');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (user?.id) {
        // Update existing user profile
        const { data } = await updateProfile({
          display_name: cleanName,
          avatar_seed: avatarSeed,
        });
        updateUser({
          display_name: cleanName,
          avatar_seed: avatarSeed,
        });

        // Broadcast to current room via socket if active
        const socket = (window as any).__SOCKET__;
        if (socket) {
          const roomId = window.location.pathname.startsWith('/room/')
            ? window.location.pathname.split('/room/')[1]
            : undefined;
          socket.emit('user:update_profile', {
            roomId,
            display_name: cleanName,
            avatar_seed: avatarSeed,
          });
        }
      } else {
        // Create new user session
        const { data } = await createSession(cleanName, undefined, avatarSeed);
        setAuth(data.user, data.token);
      }
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Không thể cập nhật hồ sơ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none overflow-y-auto">
      <div className="w-full max-w-lg bg-bg-card border border-white/10 rounded-3xl p-5 md:p-6 shadow-2xl relative my-auto">
        {/* Close Button */}
        {!required && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header */}
        <div className="mb-4 text-center">
          <h2 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary via-orange-400 to-accent">
            🎤 Cập Nhật Avatar & Nickname
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Chọn avatar yêu thích hoặc tải ảnh của bạn để tỏa sáng trên sân khấu!
          </p>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-xl bg-danger/20 border border-danger/40 text-danger text-xs text-center font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Live Avatar Preview in Center */}
          <div className="flex flex-col items-center justify-center p-3.5 bg-bg-panel/80 rounded-2xl border border-white/10">
            <div className="relative group cursor-pointer" onClick={() => setActiveTab('upload')}>
              <Avatar
                name={displayName || 'Ca Sĩ'}
                seed={avatarSeed}
                size="xl"
                role="SPEAKER"
                isSpeaking={true}
              />
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload className="w-6 h-6 text-white" />
              </div>
            </div>

            <div className="mt-2 text-center">
              <span className="text-sm font-black text-white">
                {displayName.trim() || 'Tên Sân Khấu'}
              </span>
              <p className="text-[10px] text-text-secondary">
                {avatarSeed.startsWith('data:image/')
                  ? 'Ảnh tự tải lên'
                  : avatarSeed.startsWith('emoji:')
                  ? `Biểu tượng ${avatarSeed.slice(6)}`
                  : avatarSeed.startsWith('http')
                  ? 'Avatar hoạt hình'
                  : 'Avatar chữ cái gradient'}
              </p>
            </div>

            {avatarSeed && (
              <button
                type="button"
                onClick={handleResetToDefault}
                className="mt-1 flex items-center space-x-1 text-[11px] text-text-secondary hover:text-accent transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Đặt lại chữ cái ban đầu</span>
              </button>
            )}
          </div>

          {/* Nickname Input */}
          <div>
            <label className="block text-xs font-bold text-white mb-1.5 flex items-center justify-between">
              <span>Nickname hiển thị:</span>
              <button
                type="button"
                onClick={handleRandomName}
                className="text-[11px] text-accent hover:text-yellow-300 font-semibold flex items-center space-x-1"
              >
                <Sparkles className="w-3 h-3" />
                <span>Gợi ý tên ngầu</span>
              </button>
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ví dụ: Giọng Ca Vàng"
                maxLength={40}
                required
                className="flex-1 bg-bg-panel border border-white/15 focus:border-primary rounded-xl px-4 py-2.5 text-xs md:text-sm text-white focus:outline-none transition shadow-inner"
              />
            </div>
          </div>

          {/* Avatar Source Selector Tabs */}
          <div>
            <label className="block text-xs font-bold text-white mb-2">
              Chọn Avatar biểu tượng:
            </label>

            <div className="flex items-center space-x-1.5 p-1 bg-bg-panel rounded-xl border border-white/10 mb-3">
              <button
                type="button"
                onClick={() => setActiveTab('emoji')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                  activeTab === 'emoji'
                    ? 'bg-primary text-white shadow-md'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                <Smile className="w-3.5 h-3.5" />
                <span>Emoji Vui</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('cartoon')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                  activeTab === 'cartoon'
                    ? 'bg-primary text-white shadow-md'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Hoạt Hình</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                  activeTab === 'upload'
                    ? 'bg-primary text-white shadow-md'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Tải Ảnh Lên</span>
              </button>
            </div>

            {/* TAB 1: EMOJIS */}
            {activeTab === 'emoji' && (
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-40 overflow-y-auto p-1 bg-bg-panel/50 rounded-2xl border border-white/5">
                {PRESET_EMOJIS.map((emoji) => {
                  const seedVal = `emoji:${emoji}`;
                  const isSelected = avatarSeed === seedVal;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAvatarSeed(seedVal)}
                      className={`h-10 rounded-xl flex items-center justify-center text-xl transition transform hover:scale-110 ${
                        isSelected
                          ? 'bg-primary/30 border-2 border-primary shadow-lg shadow-primary/30 scale-105'
                          : 'bg-white/5 hover:bg-white/10 border border-white/5'
                      }`}
                    >
                      <span>{emoji}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* TAB 2: CARTOON / DICEBEAR */}
            {activeTab === 'cartoon' && (
              <div className="grid grid-cols-4 gap-2.5 max-h-40 overflow-y-auto p-1 bg-bg-panel/50 rounded-2xl border border-white/5">
                {DICEBEAR_PRESETS.map((item) => {
                  const isSelected = avatarSeed === item.url;
                  return (
                    <button
                      key={item.url}
                      type="button"
                      onClick={() => setAvatarSeed(item.url)}
                      className={`p-1.5 rounded-xl flex flex-col items-center justify-center space-y-1 transition ${
                        isSelected
                          ? 'bg-primary/20 border-2 border-primary shadow-lg shadow-primary/30'
                          : 'bg-white/5 hover:bg-white/10 border border-white/5'
                      }`}
                    >
                      <img
                        src={item.url}
                        alt={item.label}
                        className="w-10 h-10 rounded-full bg-black/40 object-cover"
                      />
                      <span className="text-[10px] font-semibold text-white truncate max-w-full">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* TAB 3: CUSTOM IMAGE UPLOAD */}
            {activeTab === 'upload' && (
              <div className="bg-bg-panel/60 border-2 border-dashed border-white/15 rounded-2xl p-5 text-center flex flex-col items-center justify-center space-y-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-lg">
                  <Upload className="w-6 h-6" />
                </div>

                <div>
                  <div className="text-xs font-bold text-white">Tải ảnh từ máy tính hoặc điện thoại</div>
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    Hỗ trợ PNG, JPG, WEBP (tự động căn tròn 160x160 cực nhẹ và nét)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold transition flex items-center space-x-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Chọn Tệp Ảnh</span>
                </button>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-white/10">
            {!required && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-text-secondary hover:text-white font-semibold transition"
              >
                Hủy
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary-dark hover:to-orange-600 text-white text-xs font-extrabold shadow-lg shadow-primary/30 transition disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" />
              <span>{loading ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NicknameModal;
