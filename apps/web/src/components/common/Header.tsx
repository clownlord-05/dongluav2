import React from 'react';
import { useAuthStore } from '../../store/authStore';
import Avatar from './Avatar';
import { Flame, Plus, LogIn, Settings, Heart } from 'lucide-react';

interface HeaderProps {
  onCreateRoom?: () => void;
  onJoinRoom?: () => void;
  onOpenSettings?: () => void;
  onOpenProfile?: () => void;
  onOpenAbout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onCreateRoom,
  onJoinRoom,
  onOpenSettings,
  onOpenProfile,
  onOpenAbout,
}) => {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="h-16 bg-bg-panel border-b border-white/10 px-4 md:px-6 flex items-center justify-between select-none">
      {/* Brand */}
      <a href="/" className="flex items-center space-x-3 group">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-dark via-primary to-accent flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
          <Flame className="w-6 h-6 text-white animate-bounce" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-base md:text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-primary via-orange-400 to-accent">
              ĐỐNG LỬA V2
            </span>
            <span className="hidden sm:inline-block text-xs uppercase px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-semibold">
              HÃY NGHE TAO HÉT
            </span>
          </div>
          <p className="text-[11px] text-text-secondary hidden md:block">
            Phòng Karaoke Sân Khấu • Âm Thanh RAW Không Lọc • Đồng Bộ YouTube
          </p>
        </div>
      </a>

      {/* Right Controls */}
      <div className="flex items-center space-x-3">
        {onCreateRoom && (
          <button
            onClick={onCreateRoom}
            className="hidden sm:flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-md hover:shadow-primary/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo phòng</span>
          </button>
        )}

        {onJoinRoom && (
          <button
            onClick={onJoinRoom}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-bg-card hover:bg-white/10 text-text-primary text-xs font-semibold border border-white/10 transition-all"
          >
            <LogIn className="w-4 h-4 text-accent" />
            <span>Nhập mã</span>
          </button>
        )}

        {onOpenAbout && (
          <button
            onClick={onOpenAbout}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-extrabold transition-all cursor-pointer"
            title="Giới thiệu chung, Góp ý & Donate"
          >
            <Heart className="w-3.5 h-3.5 fill-rose-400 text-rose-400 animate-pulse" />
            <span className="hidden sm:inline">Giới Thiệu &amp; Donate</span>
          </button>
        )}

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-bg-card hover:bg-white/10 text-text-secondary hover:text-white border border-white/10 transition-all"
            title="Cài đặt Mic RAW & Âm thanh"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {/* User Badge */}
        {user ? (
          <button
            onClick={onOpenProfile}
            className="flex items-center space-x-2.5 pl-2 pr-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            <Avatar name={user.display_name} seed={user.avatar_seed} size="sm" />
            <span className="text-xs font-bold text-text-primary max-w-[100px] truncate">
              {user.display_name}
            </span>
          </button>
        ) : (
          <button
            onClick={onOpenProfile}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-accent text-bg-base hover:bg-yellow-400 transition"
          >
            Đặt Nickname
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
