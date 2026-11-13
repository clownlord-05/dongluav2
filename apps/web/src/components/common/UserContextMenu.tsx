import React, { useEffect, useRef } from 'react';
import { useAudioStore } from '../../store/audioStore';
import { useAuthStore } from '../../store/authStore';
import Avatar from './Avatar';
import {
  Volume2,
  Mic,
  MicOff,
  UserX,
  UserMinus,
  Ban,
  Check,
  Sparkles,
  Copy,
  Radio,
  VideoOff,
  VolumeX,
  Smile,
  ShieldAlert,
  X,
} from 'lucide-react';

export interface ContextMenuTarget {
  user_id: string;
  display_name: string;
  avatar_seed?: string;
  role?: string;
  muted?: boolean;
  gain?: number;
}

interface UserContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  target: ContextMenuTarget | null;
  isHost: boolean;
  onClose: () => void;
  onOpenProfile?: () => void;
  onMuteSpeaker?: (userId: string, isMuted: boolean) => void;
  onGainChange?: (userId: string, gain: number) => void;
  onRemoveSpeaker?: (userId: string) => void;
  onInviteToStage?: (userId: string) => void;
  onKickMember?: (userId: string) => void;
  onBanMember?: (userId: string) => void;
}

export const UserContextMenu: React.FC<UserContextMenuProps> = ({
  isOpen,
  x,
  y,
  target,
  isHost,
  onClose,
  onOpenProfile,
  onMuteSpeaker,
  onGainChange,
  onRemoveSpeaker,
  onInviteToStage,
  onKickMember,
  onBanMember,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const currentUser = useAuthStore((s) => s.user);

  const {
    userVolumes,
    userMutes,
    userMuteEffects,
    userDisabledVideo,
    setUserVolume,
    setUserMute,
    setUserMuteEffects,
    setUserDisabledVideo,
  } = useAudioStore();

  const [copied, setCopied] = React.useState(false);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !target) return null;

  const isMe = target.user_id === currentUser?.id;
  const isTargetOwner = target.role === 'OWNER';
  const isTargetSpeaker = target.role === 'SPEAKER' || isTargetOwner;

  // Local user settings
  const localVolume = userVolumes[target.user_id] ?? 100;
  const isLocallyMuted = userMutes[target.user_id] ?? false;
  const isEffectsMuted = userMuteEffects[target.user_id] ?? false;
  const isVideoDisabled = userDisabledVideo[target.user_id] ?? false;

  // Viewport clamping
  const menuWidth = 260;
  const menuHeight = 440;
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 600;

  const clampedX = Math.max(12, Math.min(x, winWidth - menuWidth - 16));
  const clampedY = Math.max(12, Math.min(y, winHeight - menuHeight - 16));

  const handleCopy = () => {
    navigator.clipboard.writeText(`${target.display_name} (#${target.user_id})`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Invisible backdrop to dismiss context menu on tap anywhere */}
      <div
        className="fixed inset-0 z-50 bg-black/20"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Discord Style Context Menu Box */}
      <div
        ref={menuRef}
        style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
        className="fixed z-50 w-[260px] bg-[#111214] border border-[#2b2d31] rounded-xl shadow-2xl p-2 text-xs text-text-primary select-none animate-fadeIn font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header User Info */}
        <div className="flex items-center space-x-2.5 p-2 bg-[#1e1f22] rounded-lg mb-2 border border-white/5">
          <Avatar seed={target.avatar_seed || target.user_id} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-white truncate text-xs flex items-center space-x-1">
              <span>{target.display_name}</span>
              {isMe && <span className="text-[10px] text-primary">(Bạn)</span>}
            </div>
            <div className="text-[10px] text-text-secondary truncate">
              {target.role === 'OWNER'
                ? '👑 Chủ phòng'
                : target.role === 'SPEAKER'
                ? '🎤 Ca sĩ sân khấu'
                : '🎧 Khán giả nghe'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-white p-1 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Change Avatar & Profile Button (If right-clicking oneself) */}
        {isMe && onOpenProfile && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenProfile();
            }}
            className="w-full flex items-center space-x-2 px-2.5 py-2 rounded-lg bg-gradient-to-r from-primary/20 to-orange-500/20 hover:from-primary/30 hover:to-orange-500/30 border border-primary/30 text-white font-bold transition text-left mb-2 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span>Đổi Avatar & Nickname</span>
          </button>
        )}

        {/* 1. Âm Lượng Người Dùng (Discord Slider) */}
        <div className="px-2 py-1.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-white">
            <div className="flex items-center space-x-1.5">
              <Volume2 className="w-3.5 h-3.5 text-[#5865f2]" />
              <span>Âm Lượng Người Dùng</span>
            </div>
            <span className="text-[11px] font-mono text-[#5865f2] font-bold">
              {localVolume}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={1}
            value={localVolume}
            onChange={(e) => setUserVolume(target.user_id, Number(e.target.value))}
            className="w-full h-1.5 bg-[#4e5058] rounded-lg appearance-none cursor-pointer accent-[#5865f2]"
          />
        </div>

        {/* 2. Tắt âm (Local Mute Checkbox) */}
        <div
          onClick={() => setUserMute(target.user_id, !isLocallyMuted)}
          className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-[#5865f2]/10 cursor-pointer transition text-white"
        >
          <span>Tắt âm</span>
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition ${
              isLocallyMuted
                ? 'bg-[#5865f2] border-[#5865f2]'
                : 'border-white/30 bg-black/20'
            }`}
          >
            {isLocallyMuted && <Check className="w-3 h-3 text-white stroke-[3]" />}
          </div>
        </div>

        {/* 3. Tắt âm Biểu Cảm Tiếng (Mute Sound Effects Checkbox) */}
        <div
          onClick={() => setUserMuteEffects(target.user_id, !isEffectsMuted)}
          className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-[#5865f2]/10 cursor-pointer transition text-white"
        >
          <span>Tắt âm Biểu Cảm Tiếng</span>
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition ${
              isEffectsMuted
                ? 'bg-[#5865f2] border-[#5865f2]'
                : 'border-white/30 bg-black/20'
            }`}
          >
            {isEffectsMuted && <Check className="w-3 h-3 text-white stroke-[3]" />}
          </div>
        </div>

        {/* 4. Vô hiệu hóa video (Disable Video Checkbox) */}
        <div
          onClick={() => setUserDisabledVideo(target.user_id, !isVideoDisabled)}
          className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-[#5865f2]/10 cursor-pointer transition text-white"
        >
          <span>Vô hiệu hóa video</span>
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition ${
              isVideoDisabled
                ? 'bg-[#5865f2] border-[#5865f2]'
                : 'border-white/30 bg-black/20'
            }`}
          >
            {isVideoDisabled && <Check className="w-3 h-3 text-white stroke-[3]" />}
          </div>
        </div>

        {/* Separator */}
        <div className="h-px bg-[#2b2d31] my-1.5" />

        {/* 5. Host Controls (Only for Host viewing other members) */}
        {isHost && !isMe && (
          <div className="space-y-0.5">
            {/* Invite to stage (If Audience) */}
            {!isTargetSpeaker && onInviteToStage && (
              <button
                type="button"
                onClick={() => {
                  onInviteToStage(target.user_id);
                  onClose();
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-green-600/20 text-green-400 transition text-left"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Mời Lên Sân Khấu Hát</span>
              </button>
            )}

            {/* Remove from stage (If Speaker) */}
            {isTargetSpeaker && !isTargetOwner && onRemoveSpeaker && (
              <button
                type="button"
                onClick={() => {
                  onRemoveSpeaker(target.user_id);
                  onClose();
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-danger/20 text-danger transition text-left"
              >
                <UserMinus className="w-3.5 h-3.5" />
                <span>Đưa Xuống Khán Giả</span>
              </button>
            )}

            {/* Mute on Stage (Server Mute for Room) */}
            {isTargetSpeaker && onMuteSpeaker && (
              <button
                type="button"
                onClick={() => {
                  onMuteSpeaker(target.user_id, !target.muted);
                  onClose();
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-white/10 text-white transition text-left"
              >
                {target.muted ? (
                  <>
                    <Mic className="w-3.5 h-3.5 text-green-400" />
                    <span>Mở Mic Phòng</span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-3.5 h-3.5 text-danger" />
                    <span>Tắt Mic Phòng (Server)</span>
                  </>
                )}
              </button>
            )}

            {/* Host Mic Gain Slider for this Speaker */}
            {isTargetSpeaker && onGainChange && (
              <div className="px-2.5 py-1 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-text-secondary">
                  <span>Mic Gain Phòng (Chủ phòng)</span>
                  <span className="font-mono text-accent">
                    {Math.round((target.gain ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={target.gain ?? 1}
                  onChange={(e) => onGainChange(target.user_id, parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/20 rounded accent-accent cursor-pointer"
                />
              </div>
            )}
          </div>
        )}

        {/* 6. Utility Options */}
        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-white/10 text-text-secondary hover:text-white transition text-left"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>{copied ? 'Đã sao chép!' : 'Sao chép Tên & ID'}</span>
        </button>

        {/* 7. Moderation: Kick & Ban (Chặn) */}
        {isHost && !isMe && !isTargetOwner && (
          <>
            <div className="h-px bg-[#2b2d31] my-1" />

            {/* Đá khỏi phòng (Kick) */}
            {onKickMember && (
              <button
                type="button"
                onClick={() => {
                  onKickMember(target.user_id);
                  onClose();
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md hover:bg-danger/20 text-text-secondary hover:text-danger transition text-left"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Đá Khỏi Phòng</span>
              </button>
            )}

            {/* Chặn (Ban) - Red Text like Discord */}
            {onBanMember && (
              <button
                type="button"
                onClick={() => {
                  onBanMember(target.user_id);
                  onClose();
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md text-[#fa777c] hover:bg-[#da373c]/20 hover:text-white font-semibold transition text-left"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Chặn</span>
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default UserContextMenu;
