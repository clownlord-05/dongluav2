import React from 'react';
import { useRoomStore } from '../../store/roomStore';
import { useAuthStore } from '../../store/authStore';
import Avatar from '../common/Avatar';
import { Mic, MicOff, Volume2, UserX, MoreVertical, Sliders } from 'lucide-react';

interface StagePodiumProps {
  roomId: string;
  isHost: boolean;
  onMuteSpeaker?: (userId: string, isMuted: boolean) => void;
  onGainChange?: (userId: string, gain: number) => void;
  onRemoveSpeaker?: (userId: string) => void;
  getTriggerProps?: (target: any) => any;
  onOpenContextMenu?: (target: any, x: number, y: number) => void;
  onOpenAudioSettings?: () => void;
}

export const StagePodium: React.FC<StagePodiumProps> = ({
  roomId,
  isHost,
  onMuteSpeaker,
  onGainChange,
  onRemoveSpeaker,
  getTriggerProps,
  onOpenContextMenu,
  onOpenAudioSettings,
}) => {
  const members = useRoomStore((s) => s.members);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Speakers are members with role 'SPEAKER' or 'OWNER'
  const speakers = members.filter((m) => m.role === 'SPEAKER' || m.role === 'OWNER');

  return (
    <div className="bg-bg-panel/70 border border-white/10 rounded-2xl p-3 sm:p-4 shadow-xl select-none">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Sân Khấu Trực Tiếp ({speakers.length})
          </h3>
        </div>
        {onOpenAudioSettings ? (
          <button
            type="button"
            onClick={onOpenAudioSettings}
            className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent text-[11px] font-bold transition cursor-pointer"
            title="Nhấn để mở Cài đặt Mic & Chỉnh âm thanh"
          >
            <Sliders className="w-3 h-3 text-accent" />
            <span>Chỉnh Âm Thanh</span>
          </button>
        ) : (
          <span className="text-[11px] text-text-secondary">
            Micro RAW 48kHz • Không lọc âm
          </span>
        )}
      </div>

      {speakers.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-white/10 rounded-xl text-text-secondary text-xs">
          Chưa có ca sĩ nào trên sân khấu. Hãy giơ tay để được lên hát!
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {speakers.map((sp) => {
            const isMe = sp.user_id === currentUserId;
            const isOwner = sp.role === 'OWNER';

            return (
              <div
                key={sp.user_id}
                {...(getTriggerProps ? getTriggerProps(sp) : {})}
                className="bg-bg-card border border-white/10 rounded-xl p-3 flex flex-col justify-between space-y-2 hover:border-primary/40 transition-colors cursor-pointer relative group"
                title="Chuột phải hoặc giữ (hold) để mở menu cài đặt âm thanh"
              >
                <div className="flex items-center space-x-3">
                  <Avatar
                    name={sp.display_name}
                    seed={sp.avatar_seed}
                    size="md"
                    role={sp.role}
                    isMuted={sp.muted}
                    isSpeaking={!sp.muted}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-bold text-white truncate">
                        {sp.display_name}
                      </span>
                      {isMe && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-primary/20 text-primary rounded font-semibold">
                          Bạn
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 mt-0.5">
                      {sp.muted ? (
                        <span className="text-[10px] text-danger flex items-center space-x-1 font-semibold">
                          <MicOff className="w-3 h-3" />
                          <span>Đang tắt mic</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-green-400 flex items-center space-x-1 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
                          <span>Đang hát (Live)</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3-dots context menu trigger */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      if (onOpenContextMenu) {
                        onOpenContextMenu(sp, rect.left, rect.bottom + 4);
                      }
                    }}
                    className="p-1 rounded-md text-text-secondary hover:text-white hover:bg-white/10 transition opacity-70 group-hover:opacity-100"
                    title="Menu tùy chọn thành viên"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Animated Voice Waveform Bars */}
                {!sp.muted && (
                  <div className="flex items-center justify-center space-x-1 h-4 px-2 py-1 bg-black/40 rounded-lg">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => (
                      <div
                        key={bar}
                        className="w-1 bg-gradient-to-t from-primary to-accent rounded-full animate-wave"
                        style={{
                          height: `${Math.max(20, Math.sin(bar * 0.8) * 100)}%`,
                          animationDelay: `${bar * 0.1}s`,
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Host Controls for this speaker */}
                {isHost && (
                  <div className="pt-1.5 border-t border-white/5 flex items-center justify-between text-xs">
                    {/* Gain fader */}
                    <div className="flex items-center space-x-1.5 text-text-secondary flex-1 mr-2">
                      <Volume2 className="w-3.5 h-3.5 text-accent" />
                      <input
                        type="range"
                        min={0}
                        max={150}
                        defaultValue={sp.gain ? Math.round(sp.gain * 100) : 100}
                        onChange={(e) => {
                          const newGain = parseInt(e.target.value, 10) / 100;
                          if (onGainChange) onGainChange(sp.user_id, newGain);
                        }}
                        className="w-full h-1 bg-white/20 rounded accent-primary cursor-pointer"
                        title="Âm lượng Mic phòng"
                      />
                    </div>

                    <div className="flex items-center space-x-1">
                      {/* Mute button */}
                      <button
                        onClick={() => onMuteSpeaker && onMuteSpeaker(sp.user_id, !sp.muted)}
                        className={`p-1.5 rounded-lg border transition ${
                          sp.muted
                            ? 'bg-danger/20 border-danger/40 text-danger hover:bg-danger/30'
                            : 'bg-white/5 border-white/10 text-text-secondary hover:text-white'
                        }`}
                        title={sp.muted ? 'Bật mic' : 'Tắt mic người này'}
                      >
                        {sp.muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>

                      {/* Remove from stage (cannot remove owner) */}
                      {!isOwner && onRemoveSpeaker && (
                        <button
                          onClick={() => onRemoveSpeaker(sp.user_id)}
                          className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-text-secondary hover:text-danger hover:border-danger/30 transition"
                          title="Đưa xuống khán giả"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default React.memo(StagePodium);
