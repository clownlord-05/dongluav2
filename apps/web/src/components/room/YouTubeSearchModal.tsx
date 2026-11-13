import React, { useState } from 'react';
import { searchYouTube, YouTubeSearchResult } from '../../lib/api';
import { Search, Play, Plus, Music, Sparkles, X, Clock, Eye, Check } from 'lucide-react';

interface YouTubeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  onSelectPlayNow?: (videoId: string, title: string, thumbnail: string) => void;
  onSelectAddToQueue: (videoId: string, title: string, thumbnail: string) => void;
}

const QUICK_TAGS = [
  'Karaoke Tone Nam',
  'Karaoke Tone Nữ',
  'Karaoke Nhạc Trẻ',
  'Karaoke Bolero',
  'Karaoke Remix',
  'Karaoke Acoustic',
  'Sơn Tùng M-TP Karaoke',
  'Hoài Lâm Karaoke',
];

export const YouTubeSearchModal: React.FC<YouTubeSearchModalProps> = ({
  isOpen,
  onClose,
  isHost,
  onSelectPlayNow,
  onSelectAddToQueue,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleSearch = async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    try {
      // Append 'karaoke' if not already containing karaoke
      const finalQuery = /karaoke/i.test(q) ? q : `${q} karaoke`;
      const { data } = await searchYouTube(finalQuery);
      setResults(data.results || []);
      if ((data.results || []).length === 0) {
        setError('Không tìm thấy bài hát nào phù hợp trên YouTube.');
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.response?.data?.error || 'Lỗi khi tìm kiếm YouTube');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const handleTagClick = (tag: string) => {
    setQuery(tag);
    handleSearch(tag);
  };

  const handlePlayNow = (v: YouTubeSearchResult) => {
    if (onSelectPlayNow) {
      onSelectPlayNow(v.videoId, v.title, v.thumbnail);
      onClose();
    }
  };

  const handleAddToQueue = (v: YouTubeSearchResult) => {
    onSelectAddToQueue(v.videoId, v.title, v.thumbnail);
    setAddedIds((prev) => ({ ...prev, [v.videoId]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [v.videoId]: false }));
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl bg-bg-card border border-white/10 rounded-3xl p-5 md:p-6 shadow-2xl flex flex-col max-h-[85vh] space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
                <span>Tìm Bài Hát Trực Tiếp Trên YouTube</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold border border-red-500/30">
                  Karaoke
                </span>
              </h2>
              <p className="text-[11px] text-text-secondary">
                Tìm kiếm hàng triệu bài hát beat karaoke chất lượng cao
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleFormSubmit} className="flex space-x-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text-secondary absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập tên bài hát hoặc ca sĩ (VD: Hoa nở không màu, Lạc trôi, Cắt đôi nỗi sầu)..."
              autoFocus
              className="w-full bg-bg-panel border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-primary transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-red-600 to-primary hover:from-red-700 hover:to-primary-dark text-white text-xs font-bold shadow-lg shadow-red-600/20 transition disabled:opacity-50 shrink-0"
          >
            {loading ? 'Đang tìm...' : 'Tìm Kiếm'}
          </button>
        </form>

        {/* Quick Tag Suggestions */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 shrink-0 scrollbar-none text-[11px]">
          <span className="text-text-secondary text-[10px] uppercase font-bold shrink-0 flex items-center space-x-1 mr-1">
            <Sparkles className="w-3 h-3 text-accent" />
            <span>Gợi ý:</span>
          </span>
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleTagClick(tag)}
              className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-text-secondary hover:text-accent shrink-0 transition"
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-2xl bg-danger/10 border border-danger/30 text-danger text-xs">
            {error}
          </div>
        )}

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="text-center py-16 text-text-secondary text-xs space-y-2">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p>Đang quét video Karaoke trên YouTube...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-14 text-text-secondary text-xs space-y-1">
              <div className="text-3xl mb-1">🎤</div>
              <p className="font-semibold text-white">Chưa có kết quả tìm kiếm</p>
              <p className="text-[11px]">
                Hãy nhập tên bài hát hoặc bấm vào các gợi ý ở trên để tìm beat hát nhé!
              </p>
            </div>
          ) : (
            results.map((v) => {
              const isAdded = !!addedIds[v.videoId];

              return (
                <div
                  key={v.videoId}
                  className="p-2.5 rounded-2xl bg-bg-panel border border-white/5 hover:border-white/15 flex items-center space-x-3 transition group"
                >
                  {/* Thumbnail with duration badge */}
                  <div className="relative w-28 md:w-32 aspect-video rounded-xl overflow-hidden bg-black shrink-0">
                    <img
                      src={v.thumbnail}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    {v.duration && (
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white font-semibold">
                        {v.duration}
                      </span>
                    )}
                  </div>

                  {/* Title & Channel */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <h4
                      className="text-xs font-bold text-white group-hover:text-primary transition-colors line-clamp-2 leading-snug"
                      title={v.title}
                    >
                      {v.title}
                    </h4>
                    <div className="flex items-center space-x-3 text-[10px] text-text-secondary">
                      <span className="truncate">{v.author}</span>
                      {v.views > 0 && (
                        <span className="flex items-center space-x-1 shrink-0">
                          <Eye className="w-3 h-3" />
                          <span>{v.views.toLocaleString()} lượt xem</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {/* Host Play Now Button */}
                    {isHost && onSelectPlayNow && (
                      <button
                        onClick={() => handlePlayNow(v)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-orange-700 text-white text-xs font-bold flex items-center space-x-1 shadow-md shadow-primary/20 transition"
                        title="Phát ngay trên sân khấu"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span className="hidden sm:inline">Phát Ngay</span>
                      </button>
                    )}

                    {/* Add to Queue Button */}
                    <button
                      onClick={() => handleAddToQueue(v)}
                      disabled={isAdded}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1 border transition ${
                        isAdded
                          ? 'bg-green-500/20 border-green-500/40 text-green-400'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-accent'
                      }`}
                      title="Thêm vào hàng chờ bài hát"
                    >
                      {isAdded ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span className="hidden sm:inline">Đã thêm!</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Hàng Chờ</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default YouTubeSearchModal;
