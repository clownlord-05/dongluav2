import React, { useState } from 'react';
import { useRoomStore } from '../../store/roomStore';
import { useAuthStore } from '../../store/authStore';
import Avatar from '../common/Avatar';
import { Users, Hand, Check, X, ShieldAlert, Mic, MicOff, Ban, UserMinus } from 'lucide-react';

interface StageModerationPanelProps {
  roomId: string;
  isHost: boolean;
  onApproveHand?: (requestId: string) => void;
  onRejectHand?: (requestId: string) => void;
  onKickMember?: (userId: string) => void;
  onBanMember?: (userId: string) => void;
  onMuteMember?: (userId: string, isMuted: boolean) => void;
}

export const StageModerationPanel: React.FC<StageModerationPanelProps> = ({
  roomId,
  isHost,
  onApproveHand,
  onRejectHand,
  onKickMember,
  onBanMember,
  onMuteMember,
}) => {
  const [activeTab, setActiveTab] = useState<'hand' | 'members'>('hand');
  const members = useRoomStore((s) => s.members);
  const handQueue = useRoomStore((s) => s.handQueue).filter((h) => h.status === 'pending');
  const currentUserId = useAuthStore((s) => s.user?.id);

  return (
    <div className="flex flex-col h-full bg-bg-card border border-white/10 rounded-2xl overflow-hidden shadow-xl select-none">
      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-bg-panel text-xs font-bold">
        <button
          onClick={() => setActiveTab('hand')}
          className={`flex-1 py-3 px-3 flex items-center justify-center space-x-2 transition border-b-2 ${
            activeTab === 'hand'
              ? 'border-primary text-primary bg-white/5'
              : 'border-transparent text-text-secondary hover:text-white'
          }`}
        >
          <Hand className="w-4 h-4 text-accent" />
          <span>Xin hát</span>
          {handQueue.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-extrabold animate-pulse">
              {handQueue.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 py-3 px-3 flex items-center justify-center space-x-2 transition border-b-2 ${
            activeTab === 'members'
              ? 'border-primary text-primary bg-white/5'
              : 'border-transparent text-text-secondary hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Thành viên ({members.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'hand' ? (
          <div>
            {handQueue.length === 0 ? (
              <div className="text-center py-8 text-text-secondary text-xs">
                Hiện không có ai giơ tay xin hát.
              </div>
            ) : (
              <div className="space-y-2">
                {handQueue.map((req) => (
                  <div
                    key={req.id}
                    className="p-2.5 rounded-xl bg-bg-panel border border-white/5 flex items-center justify-between space-x-2 hover:border-white/10 transition"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <Avatar name={req.display_name} seed={req.avatar_seed} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {req.display_name}
                        </div>
                        <div className="text-[10px] text-accent">Đang đợi duyệt...</div>
                      </div>
                    </div>

                    {isHost ? (
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          onClick={() => onApproveHand && onApproveHand(req.id)}
                          className="p-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 transition"
                          title="Duyệt lên sân khấu"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onRejectHand && onRejectHand(req.id)}
                          className="p-1.5 rounded-lg bg-danger/20 text-danger hover:bg-danger/30 border border-danger/30 transition"
                          title="Từ chối"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-text-secondary">Chờ Chủ phòng</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {members.map((m) => {
              const isMe = m.user_id === currentUserId;
              const isOwner = m.role === 'OWNER';

              return (
                <div
                  key={m.user_id}
                  className="p-2 rounded-xl bg-bg-panel border border-white/5 flex items-center justify-between hover:border-white/10 transition"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Avatar
                      name={m.display_name}
                      seed={m.avatar_seed}
                      size="sm"
                      role={m.role}
                      isMuted={m.muted}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold text-white truncate">
                          {m.display_name}
                        </span>
                        {isMe && (
                          <span className="text-[9px] px-1 bg-white/10 text-text-secondary rounded">
                            Bạn
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-secondary">
                        {m.role === 'OWNER'
                          ? '👑 Chủ phòng'
                          : m.role === 'SPEAKER'
                          ? '🎤 Ca sĩ'
                          : m.role === 'MODERATOR'
                          ? '🛡️ Quản trị'
                          : '👀 Khán giả'}
                      </div>
                    </div>
                  </div>

                  {/* Host actions per member */}
                  {isHost && !isOwner && !isMe && (
                    <div className="flex items-center space-x-1 shrink-0">
                      {m.role === 'SPEAKER' && (
                        <button
                          onClick={() => onMuteMember && onMuteMember(m.user_id, !m.muted)}
                          className={`p-1 rounded-lg border transition ${
                            m.muted
                              ? 'bg-danger/20 border-danger/40 text-danger'
                              : 'bg-white/5 border-white/10 text-text-secondary hover:text-white'
                          }`}
                          title={m.muted ? 'Bật mic' : 'Tắt mic'}
                        >
                          {m.muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                        </button>
                      )}

                      <button
                        onClick={() => onKickMember && onKickMember(m.user_id)}
                        className="p-1 rounded-lg bg-white/5 border border-white/10 text-text-secondary hover:text-amber-400 hover:border-amber-400/40 transition"
                        title="Mời ra khỏi phòng (Kick)"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onBanMember && onBanMember(m.user_id)}
                        className="p-1 rounded-lg bg-white/5 border border-white/10 text-text-secondary hover:text-danger hover:border-danger/40 transition"
                        title="Cấm vĩnh viễn (Ban)"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StageModerationPanel;
