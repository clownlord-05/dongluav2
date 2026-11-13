import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRoomByCode } from '../lib/api';
import { LogIn, KeyRound } from 'lucide-react';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length < 4) {
      setError('Mã phòng không hợp lệ!');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await getRoomByCode(cleanCode);
      onClose();
      navigate(`/room/${data.room.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Không tìm thấy phòng với mã này!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-bg-card border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <KeyRound className="w-5 h-5 text-accent" />
            <span>Nhập Mã Vào Phòng</span>
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
              Mã phòng (6 ký tự)
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="VD: 7T9K2X"
              maxLength={8}
              required
              className="w-full bg-bg-panel border border-white/10 rounded-xl px-4 py-3 text-center text-lg font-mono font-bold tracking-widest text-accent uppercase focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-accent hover:bg-yellow-400 text-bg-base font-bold transition disabled:opacity-50"
            >
              {loading ? 'Đang kiểm tra...' : 'Vào Phòng Ngay'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JoinRoomModal;
