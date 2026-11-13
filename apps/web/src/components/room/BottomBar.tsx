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
  const { isConnected, isMuted } = useAudioStore();

  const myMember = members.find((m) => m.user_id === user?.id);
  const isSpeaker = myMember?.role === 'SPEAKER' || myMember?.role === 'OWNER';
  const myPendingHand = handQueue.find((h) => h.user_id === user?.id && h.status === 'pending');

  return (
    <div className="relative select-none">
      {/* Floating Stage Invite Notification Banner */}
      {stageInvite && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-primary to-accent p-0.5 rounded-2xl shadow-2xl animate-bounce">
          <div className="bg-bg-card px-4 py-2.5 rounded-2xl flex items-center space-x-3 text-xs">
            <Sparkles className="w-5 h-5 text-accent" />
            <div>
              <span className="font-bold text-white">
                {stageInvite.invited_by_name || 'Chủ phòng'} đã duyệt bạn lên sân khấu hát!
              </span>
              <p className="text-[10px] text-text-secondary">Đeo tai nghe và bật mic RAW để bắt đầu.</p>
            </div>
            <div className="flex items-center space-x-1.5 pl-2">
              <button
                onClick={onAcceptStageInvite}
                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold flex items-center space-x-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Lên hát ngay</span>
              </button>
              <button
                onClick={onDeclineStageInvite}
                className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-text-secondary rounded-xl font-semibold"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Bar */}
      <footer className="h-16 bg-bg-panel border-t border-white/10 px-4 flex items-center justify-between">
        {/* Left: Role info, Chat toggle & Headphone reminder */}
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1.5 text-xs text-text-secondary">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-semibold text-white">
              {isHost ? 'Chủ phòng' : isSpeaker ? 'Ca sĩ' : 'Khán giả'}
            </span>
          </div>

          {onToggleChat && (
            <button
              onClick={onToggleChat}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 transition ${
                isChatOpen
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-text-secondary hover:text-white'
              }`}
              title={isChatOpen ? 'Thu nhỏ khung Chat' : 'Mở khung Chat & Sân khấu'}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isChatOpen ? 'Thu nhỏ' : 'Chat'}</span>
              {handQueue.filter((h) => h.status === 'pending').length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-danger text-white text-[9px] font-black">
                  {handQueue.filter((h) => h.status === 'pending').length}
                </span>
              )}
            </button>
          )}

          <button
            onClick={onOpenAudioSettings}
            className="flex items-center space-x-1 text-[11px] px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-accent font-bold transition"
            title="Cài đặt & Thử Mic / Tai nghe"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Tai nghe + Mic RAW</span>
            <span className="md:hidden">Thử Mic</span>
          </button>
        </div>

        {/* Center: Stage Actions */}
        <div className="flex items-center space-x-3">
          {isSpeaker ? (
            /* Speaker Controls */
            <div className="flex items-center space-x-2">
              <button
                onClick={onToggleMic}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition shadow-lg ${
                  isMuted
                    ? 'bg-danger text-white shadow-danger/30'
                    : 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/30'
                }`}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 animate-pulse" />}
                <span>{isMuted ? 'Đang Tắt Mic' : 'Mic RAW Đang Bật'}</span>
              </button>

              {/* Speaker can leave stage back to audience (unless Owner) */}
              {!isHost && (
                <button
                  onClick={onLeaveStage}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-text-secondary text-xs font-semibold transition"
                >
                  Xuống khán giả
                </button>
              )}
            </div>
          ) : myPendingHand ? (
            /* Waiting approval */
            <div className="flex items-center space-x-2">
              <div className="px-4 py-2 rounded-xl bg-accent/20 border border-accent/40 text-accent text-xs font-bold flex items-center space-x-2 animate-pulse">
                <Hand className="w-4 h-4" />
                <span>Đang chờ Chủ phòng duyệt...</span>
              </div>
              <button
                onClick={onCancelHand}
                className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-xs transition"
                title="Huỷ yêu cầu xin hát"
              >
                ✕
              </button>
            </div>
          ) : (
            /* Audience can raise hand */
            <button
              onClick={onRaiseHand}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent hover:from-primary-dark hover:to-yellow-500 text-white font-extrabold text-xs flex items-center space-x-2 shadow-lg shadow-primary/30 hover:scale-105 transition-all"
            >
              <Hand className="w-4 h-4 text-bg-base fill-bg-base" />
              <span className="text-bg-base">Giơ Tay Xin Hát</span>
            </button>
          )}
        </div>

        {/* Right: Audio Settings & Leave Room */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenAudioSettings}
            className="p-2 rounded-xl bg-bg-card hover:bg-white/10 border border-white/10 text-text-secondary hover:text-white transition"
            title="Cài đặt Mic RAW & Thiết bị"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={onLeaveRoom}
            className="px-3 py-1.5 rounded-xl bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger text-xs font-bold flex items-center space-x-1.5 transition"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Rời phòng</span>
          </button>
        </div>
      </footer>
    </div>
  );
};

export default BottomBar;
