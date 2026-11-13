import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listRooms } from '../lib/api';
import { Room } from '../types';
import Header from '../components/common/Header';
import NicknameModal from '../components/common/NicknameModal';
import AudioSettingsModal from '../components/audio/AudioSettingsModal';
import CreateRoomModal from './CreateRoomModal';
import JoinRoomModal from './JoinRoomModal';
import { AboutContent, AboutModal } from '../components/common/AboutSection';
import { Flame, Mic2, Users, Lock, Globe, Plus, Sparkles, RefreshCw, Heart } from 'lucide-react';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);

  const fetchRooms = async () => {
    try {
      const { data } = await listRooms();
      setRooms(data.rooms || []);
    } catch (e) {
      console.warn('Failed to load rooms:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-bg-base text-text-primary select-none overflow-hidden">
      {/* Top Header */}
      <Header
        onCreateRoom={() => setShowCreateModal(true)}
        onJoinRoom={() => setShowJoinModal(true)}
        onOpenSettings={() => setShowAudioSettings(true)}
        onOpenProfile={() => setShowNicknameModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 max-w-6xl mx-auto w-full">
        {/* Hero Section */}
        <div className="relative rounded-3xl bg-gradient-to-r from-bg-panel via-bg-card to-bg-panel border border-white/10 p-6 md:p-10 shadow-2xl overflow-hidden">
          {/* Background glowing flare */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-bold">
              <Flame className="w-4 h-4 animate-bounce" />
              <span>NỀN TẢNG KARAOKE SÂN KHẤU TRỰC TUYẾN</span>
            </div>

            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white leading-tight">
              ĐỐNG LỬA V2 <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-orange-400 to-accent">
                HÃY NGHE TAO HÉT!
              </span>
            </h1>

            <p className="text-xs md:text-sm text-text-secondary leading-relaxed">
              Trải nghiệm phòng sân khấu (Stage) như Discord: Chủ phòng toàn quyền điều phối, khán giả giơ tay xin hát, mic thu âm RAW 48kHz không lọc âm giữ trọn giọng thật, kết nối trực tiếp và đồng bộ bài hát YouTube!
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-orange-700 text-white text-xs font-extrabold flex items-center space-x-2 shadow-xl shadow-primary/30 hover:scale-105 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo Phòng Mới</span>
              </button>

              <button
                onClick={() => setShowJoinModal(true)}
                className="px-5 py-3 rounded-2xl bg-bg-card hover:bg-white/10 border border-white/10 text-accent text-xs font-bold flex items-center space-x-2 transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>Vào bằng Mã Phòng</span>
              </button>

              <button
                onClick={() => setShowAboutModal(true)}
                className="px-5 py-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-extrabold flex items-center space-x-2 transition cursor-pointer"
              >
                <Heart className="w-4 h-4 fill-rose-400 text-rose-400" />
                <span>Giới Thiệu và Góp Ý</span>
              </button>
            </div>
          </div>
        </div>

        {/* Public Rooms Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
              <h2 className="text-base md:text-lg font-bold text-white">
                Các Phòng Đang Hoạt Động ({rooms.length})
              </h2>
            </div>

            <button
              onClick={fetchRooms}
              className="text-xs text-text-secondary hover:text-white flex items-center space-x-1.5 p-1.5 rounded-lg bg-bg-card border border-white/5"
              title="Làm mới danh sách"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>

          {loading && rooms.length === 0 ? (
            <div className="text-center py-16 text-text-secondary text-xs">
              Đang tải danh sách phòng...
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-16 bg-bg-card/50 border border-dashed border-white/10 rounded-2xl space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-text-secondary">
                <Mic2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Chưa có phòng hát nào mở</h3>
              <p className="text-xs text-text-secondary max-w-sm mx-auto">
                Hãy là người đầu tiên tạo phòng, dán link YouTube karaoke và mời bạn bè cùng vào hòa giọng nhé!
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-md shadow-primary/30 transition"
              >
                Tạo Phòng Đầu Tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((r) => (
                <div
                  key={r.id}
                  onClick={() => navigate(`/room/${r.id}`)}
                  className="group bg-bg-card border border-white/10 hover:border-primary/50 rounded-2xl p-5 shadow-lg hover:shadow-primary/10 transition-all cursor-pointer flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-mono text-accent font-bold uppercase tracking-wider">
                        #{r.code}
                      </span>
                      <div className="flex items-center space-x-1 text-[11px] text-text-secondary">
                        {r.has_password ? (
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-green-400" />
                        )}
                        <span>{r.has_password ? 'Có pass' : 'Công khai'}</span>
                      </div>
                    </div>

                    <h3 className="text-sm font-extrabold text-white group-hover:text-primary transition-colors truncate">
                      {r.name}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-text-secondary">
                    <div className="flex items-center space-x-1.5">
                      <Users className="w-3.5 h-3.5 text-accent" />
                      <span>{r.member_count} đang tham gia</span>
                    </div>

                    <span className="text-primary font-bold group-hover:translate-x-1 transition-transform inline-flex items-center">
                      Vào hát →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Giới Thiệu Chung, Góp Ý & Donate Section */}
        <AboutContent />

        {/* Footer Credit */}
        <footer className="mt-10 pt-6 border-t border-white/10 text-center">
          <p className="text-xs sm:text-sm font-bold text-text-secondary tracking-wider uppercase">
            ĐƯỢC NGHĨ VÀ PHÁT TRIỂN BỞI MỘT MÌNH TAO - <span className="text-white font-extrabold">NGUYEN MANH TUNG</span>
          </p>
        </footer>
      </main>

      {/* Modals */}
      <CreateRoomModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
      <JoinRoomModal isOpen={showJoinModal} onClose={() => setShowJoinModal(false)} />
      <NicknameModal isOpen={showNicknameModal} onClose={() => setShowNicknameModal(false)} />
      <AudioSettingsModal isOpen={showAudioSettings} onClose={() => setShowAudioSettings(false)} />
      <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} />
    </div>
  );
};

export default HomePage;
