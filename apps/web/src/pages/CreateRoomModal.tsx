import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, ensureAuthToken, createSession } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Plus, Lock, Globe, Users, User } from 'lucide-react';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user, setAuth } = useAuthStore();
  const [hostName, setHostName] = useState(user?.display_name || '');
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [password, setPassword] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên phòng!');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // 1. Ensure user has a valid session/token
      if (hostName.trim() && (!user || user.display_name !== hostName.trim())) {
        const { data: authData } = await createSession(hostName.trim());
        setAuth(authData.user, authData.token);
      } else {
        await ensureAuthToken();
      }

      // 2. Create room
      const { data } = await createRoom({
        name: name.trim(),
        visibility,
        password: visibility === 'private' && password ? password : undefined,
        max_participants: maxParticipants,
      });

      onClose();
      navigate(`/room/${data.room.id}`);
    } catch (err: any) {
      console.error('Create room error:', err);
      setError(err.response?.data?.error || err.message || 'Không thể tạo phòng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-bg-card border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Plus className="w-5 h-5 text-primary" />
            <span>Tạo Phòng Karaoke Mới</span>
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-white text-sm">
            ✕
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-danger/20 border border-danger/40 text-danger text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-text-secondary mb-1">
              Tên của bạn (Chủ phòng)
            </label>
            <div className="flex items-center space-x-2 bg-bg-panel border border-white/10 rounded-xl px-3 py-2">
              <User className="w-4 h-4 text-accent shrink-0" />
              <input
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="VD: Chủ Sân Khấu"
                maxLength={40}
                className="w-full bg-transparent text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-text-secondary mb-1">Tên phòng hát *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Quán Rượu Đống Lửa Bolero"
              maxLength={60}
              required
              className="w-full bg-bg-panel border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block font-semibold text-text-secondary mb-1">Chế độ phòng</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`py-2 px-3 rounded-xl border flex items-center justify-center space-x-2 transition ${
                  visibility === 'public'
                    ? 'bg-primary/20 border-primary text-white font-bold'
                    : 'bg-bg-panel border-white/5 text-text-secondary hover:text-white'
                }`}
              >
                <Globe className="w-4 h-4 text-accent" />
                <span>Công khai</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`py-2 px-3 rounded-xl border flex items-center justify-center space-x-2 transition ${
                  visibility === 'private'
                    ? 'bg-primary/20 border-primary text-white font-bold'
                    : 'bg-bg-panel border-white/5 text-text-secondary hover:text-white'
                }`}
              >
                <Lock className="w-4 h-4 text-primary" />
                <span>Riêng tư (Mật khẩu)</span>
              </button>
            </div>
          </div>

          {visibility === 'private' && (
            <div>
              <label className="block font-semibold text-text-secondary mb-1">
                Mật khẩu vào phòng
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                className="w-full bg-bg-panel border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-primary"
              />
            </div>
          )}

          <div>
            <label className="block font-semibold text-text-secondary mb-1">
              Số người tối đa trong phòng
            </label>
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-text-secondary" />
              <select
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(parseInt(e.target.value, 10))}
                className="flex-1 bg-bg-panel border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-primary"
              >
                <option value={10}>10 người (Phòng nhỏ)</option>
                <option value={20}>20 người (Tiêu chuẩn)</option>
                <option value={30}>30 người (Sân khấu vừa)</option>
                <option value={50}>50 người (Sân khấu lớn)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold shadow-md shadow-primary/30 transition disabled:opacity-50"
            >
              {loading ? 'Đang tạo...' : 'Tạo Phòng & Lên Sân Khấu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRoomModal;
