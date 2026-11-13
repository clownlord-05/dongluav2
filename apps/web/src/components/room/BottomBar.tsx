import React from 'react';
import { useRoomStore } from '../../store/roomStore';
import { useAuthStore } from '../../store/authStore';
import { useAudioStore } from '../../store/audioStore';
import {
  Hand,
  Mic,
  MicOff,
  LogOut,
  Settings,
  Sparkles,
  Check,
  X,
  Volume2,
  Headphones,
  MessageSquare,
  Sliders,
} from 'lucide-react';

interface BottomBarProps {
  roomId: string;
  isHost: boolean;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  onRaiseHand: () => void;
  onCancelHand: () => void;
  onAcceptStageInvite: () => void;
  onDeclineStageInvite: () => void;
  onToggleMic: () => void;
  onLeaveStage: () => void;
  onLeaveRoom: () => void;
  onOpenAudioSettings: () => void;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  roomId,
  isHost,
  isChatOpen,
  onToggleChat,
  onRaiseHand,
  onCancelHand,
  onAcceptStageInvite,
  onDeclineStageInvite,
  onToggleMic,
  onLeaveStage,
  onLeaveRoom,
  onOpenAudioSettings,
}) => {
  const user = useAuthStore((s) => s.user);
  const members = useRoomStore((s) => s.members);
  const handQueue = useRoomStore((s) => s.handQueue);
  const stageInvite = useRoomStore((s) => s.stageInvite);
  const isMuted = useAudioStore((s) => s.isMuted);
  const hasStream = useAudioStore((s) => !!s.stream);
  const isMicLive = !isMuted && hasStream;

  const myMember = members.find((m) => m.user_id === user?.id);
  const isSpeaker = myMember?.role === 'SPEAKER' || myMember?.role === 'OWNER';
  const myPendingHand = handQueue.find((h) => h.user_id === user?.id && h.status === 'pending');

  return (
    <div className="shrink-0 z-30 select-none bg-bg-panel border-t border-white/10 relative">
      {/* Floating Stage Invite Notification Banner */}
      {stageInvite && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-primary to-accent p-0.5 rounded-2xl shadow-2xl animate-bounce max-w-[95%] w-max">
          <div className="bg-bg-card px-3.5 py-2 rounded-2xl flex items-center space-x-2.5 text-xs">
            <Sparkles className="w-5 h-5 text-accent shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-white block truncate">
                {stageInvite.invited_by_name || 'Chủ phòng'} duyệt bạn lên hát!
              </span>
              <p className="text-[10px] text-text-secondary">Đeo tai nghe và bật mic để bắt đầu.</p>
            </div>
            <div className="flex items-center space-x-1 pl-1 shrink-0">
              <button
                onClick={onAcceptStageInvite}
                className="px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-[11px] flex items-center space-x-1"
              >
                <Check className="w-3 h-3" />
                <span>Lên hát</span>
              </button>
              <button
                onClick={onDeclineStageInvite}
                className="p-1 bg-white/10 hover:bg-white/20 text-text-secondary rounded-xl font-semibold"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Bar */}
      <footer className="h-16 px-2.5 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Left: Role info + Mic / Giơ tay Action */}
        <div className="flex items-center space-x-1.5 sm:space-x-2.5 min-w-0">
          {/* Role badge (Desktop only) */}
          <div className="hidden lg:flex items-center space-x-1.5 text-xs text-text-secondary pr-1">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-semibold text-white">
              {isHost ? 'Chủ phòng' : isSpeaker ? 'Ca sĩ' : 'Khán giả'}
            </span>
          </div>

          {/* Primary Action Button */}
          {isSpeaker ? (
            <div className="flex items-center space-x-1 sm:space-x-1.5">
              <button
                type="button"
                onClick={onToggleMic}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition shadow-lg shrink-0 ${
                  !isMicLive
                    ? 'bg-danger text-white shadow-danger/30'
                    : 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/30'
                }`}
                title={!isMicLive ? 'Bấm để bật Micro' : 'Bấm để tắt Micro'}
              >
                {!isMicLive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 animate-pulse" />}
                <span>{!hasStream ? 'Bấm Bật Mic' : isMuted ? 'Tắt Mic' : 'Mic Đang Bật'}</span>
              </button>

              {!isHost && (
                <button
                  type="button"
                  onClick={onLeaveStage}
                  className="hidden sm:inline-flex px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-text-secondary text-[11px] font-semibold transition"
                  title="Xuống khán giả"
                >
                  Xuống
                </button>
              )}
            </div>
          ) : myPendingHand ? (
            <div className="flex items-center space-x-1">
              <div className="px-2.5 sm:px-3 py-2 rounded-xl bg-accent/20 border border-accent/40 text-accent text-[11px] sm:text-xs font-bold flex items-center space-x-1.5 animate-pulse">
                <Hand className="w-3.5 h-3.5" />
                <span className="truncate max-w-[120px] sm:max-w-none">Chờ duyệt...</span>
              </div>
              <button
                type="button"
                onClick={onCancelHand}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-xs transition"
                title="Huỷ yêu cầu"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onRaiseHand}
              className="px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:from-primary-dark hover:to-yellow-500 text-bg-base font-extrabold text-xs flex items-center space-x-1.5 shadow-md shadow-primary/30 transition hover:scale-105 shrink-0"
            >
              <Hand className="w-3.5 h-3.5 fill-bg-base text-bg-base" />
              <span>Xin Hát</span>
            </button>
          )}
        </div>

        {/* Center: Prominent "Chỉnh Âm Thanh" (Audio Settings Button) */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenAudioSettings}
            className="px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/40 text-amber-300 font-extrabold text-xs flex items-center space-x-1.5 transition shadow-sm active:scale-95 cursor-pointer"
            title="Cài đặt Mic RAW, Beat Sync Offset và Âm lượng"
          >
            <Sliders className="w-4 h-4 text-accent shrink-0 animate-pulse" />
            <span className="tracking-wide">Chỉnh Âm Thanh</span>
          </button>
        </div>

        {/* Right: Chat Toggle & Leave */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
          {onToggleChat && (
            <button
              type="button"
              onClick={onToggleChat}
              className={`p-2 sm:px-3 sm:py-2 rounded-xl border text-xs font-bold flex items-center space-x-1.5 transition ${
                isChatOpen
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-text-secondary hover:text-white'
              }`}
              title={isChatOpen ? 'Thu nhỏ khung Chat' : 'Mở Chat'}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">{isChatOpen ? 'Thu nhỏ' : 'Chat'}</span>
              {handQueue.filter((h) => h.status === 'pending').length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-danger text-white text-[9px] font-black">
                  {handQueue.filter((h) => h.status === 'pending').length}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onLeaveRoom}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger text-xs font-bold flex items-center space-x-1 transition"
            title="Rời phòng"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Rời</span>
          </button>
        </div>
      </footer>
    </div>
  );
};

export default React.memo(BottomBar);
