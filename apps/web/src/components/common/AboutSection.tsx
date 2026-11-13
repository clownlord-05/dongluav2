import React, { useState } from 'react';
import { Flame, Mail, Heart, Copy, Check, Sparkles, Bug, QrCode, X, ZoomIn } from 'lucide-react';

export const AboutContent: React.FC = () => {
  const [copiedBank, setCopiedBank] = useState(false);
  const [copiedMail, setCopiedMail] = useState(false);
  const [zoomQr, setZoomQr] = useState(false);

  const handleCopyBank = () => {
    navigator.clipboard.writeText('051220048999');
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2500);
  };

  const handleCopyMail = () => {
    navigator.clipboard.writeText('manhtungclord@gmail.com');
    setCopiedMail(true);
    setTimeout(() => setCopiedMail(false), 2500);
  };

  return (
    <div className="relative rounded-3xl bg-gradient-to-br from-bg-panel via-bg-card to-bg-panel border border-white/10 p-6 md:p-8 shadow-2xl overflow-hidden">
      {/* Decorative ambient glow */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-center">
        {/* Left Column: Giới Thiệu Chung & Góp Ý (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-accent text-xs font-extrabold uppercase tracking-wider">
            <Flame className="w-4 h-4 text-primary animate-pulse" />
            <span>Giới Thiệu Chung • Tâm Thư Nhà Sáng Lập</span>
          </div>

          <h2 className="text-xl md:text-2xl font-black text-white leading-snug">
            Tại sao lại có{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-orange-400 to-accent">
              ĐỐNG LỬA V2
            </span>
            ?
          </h2>

          {/* Story Quote Box */}
          <div className="p-4 md:p-5 rounded-2xl bg-black/35 border border-white/10 space-y-3 text-xs md:text-sm text-text-primary leading-relaxed shadow-inner">
            <p>
              Theo dõi chương trình <span className="text-accent font-extrabold">The New Rên</span> từ những buổi đầu tiên, tao thấy có rất nhiều thí sinh hát cực kỳ hay nhưng lại bị bộ lọc âm của Discord{' '}
              <span className="text-danger font-bold">&ldquo;bóp hiệu năng&rdquo;</span>, cắt mất nốt cao, nuốt mất tiếng lấy hơi khiến anh em không thể{' '}
              <span className="text-primary font-extrabold">&ldquo;bùng nổ sức mạnh&rdquo;</span> — nghe thực sự rất khó chịu!
            </p>
            <p>
              Ấp ủ từ chính những cái khó chịu đấy, tao quyết định tự tay làm ra{' '}
              <span className="text-white font-extrabold">Đống Lửa V2</span> này với luồng thu âm RAW 48kHz nguyên bản không qua lọc bóp nghẹt, với mong muốn giúp{' '}
              <span className="text-accent font-extrabold">
                những &ldquo;con tướng&rdquo; không còn bị nerf sức mạnh trong những mùa sau nữa!
              </span>{' '}
              🔥🎤
            </p>
          </div>

          {/* Tester & Bug Report Box */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-white/5 to-transparent border border-primary/30 space-y-2.5">
            <div className="flex items-center space-x-2 text-xs md:text-sm font-extrabold text-white">
              <Bug className="w-4 h-4 text-primary shrink-0" />
              <span>Hòm Thư Góp Ý &amp; Báo Lỗi — Chúng mày chính là Tester của tao!</span>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Mọi góp ý, lỗi to lỗi nhỏ trong quá trình trải nghiệm thì gửi thẳng về Gmail cho tao nhé. Chúng mày là những <span className="text-white font-bold">Tester</span> đầu tiên giúp Đống Lửa V2 hoàn thiện hơn mỗi ngày:
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href="mailto:manhtungclord@gmail.com"
                className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-mono font-bold text-accent transition"
              >
                <Mail className="w-3.5 h-3.5 text-primary" />
                <span>manhtungclord@gmail.com</span>
              </a>
              <button
                type="button"
                onClick={handleCopyMail}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/40 text-xs font-bold text-white transition cursor-pointer"
              >
                {copiedMail ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-green-400">Đã chép Gmail!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao chép Gmail</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pt-1 flex items-center space-x-2 text-xs md:text-sm font-black text-accent">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Cảm ơn tất cả chúng mày rất nhiều! ❤️🔥</span>
          </div>
        </div>

        {/* Right Column: Donate / Hiện Kim Card (5 cols) */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl bg-gradient-to-b from-[#1c1d22] to-[#121317] border border-accent/30 p-5 shadow-xl flex flex-col items-center text-center space-y-4">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-extrabold">
              <Heart className="w-3.5 h-3.5 fill-rose-400 text-rose-400 animate-pulse" />
              <span>Góc Yêu Thương Quy Đổi Hiện Kim</span>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Còn nếu yêu thương quá không nói nên lời thì có thể quy đổi thành <span className="text-white font-bold">hiện kim</span> tiếp lửa nuôi server về:
            </p>

            {/* Bank Info Pill */}
            <div className="w-full p-3 rounded-xl bg-black/50 border border-white/10 flex items-center justify-between gap-2">
              <div className="text-left min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-text-secondary font-bold">
                  Ngân hàng Quân Đội (MB Bank)
                </div>
                <div className="text-sm md:text-base font-mono font-black text-accent tracking-wider">
                  051220048999
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyBank}
                className="px-3 py-2 rounded-xl bg-accent hover:bg-yellow-400 text-bg-base font-extrabold text-xs flex items-center space-x-1.5 shrink-0 transition shadow-md cursor-pointer"
              >
                {copiedBank ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Đã chép STK</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Chép STK</span>
                  </>
                )}
              </button>
            </div>

            {/* QR Image */}
            <div
              onClick={() => setZoomQr(true)}
              className="relative group cursor-pointer rounded-2xl overflow-hidden border-2 border-accent/40 shadow-2xl bg-white max-w-[230px] w-full aspect-[3/4] flex items-center justify-center"
              title="Nhấn để phóng to mã QR"
            >
              <img
                src="/donate-qr.jpg"
                alt="Mã QR Donate MB Bank 051220048999"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 flex items-center justify-center space-x-1 text-[11px] font-bold text-white">
                <ZoomIn className="w-3.5 h-3.5 text-accent" />
                <span>Quét mã hoặc nhấn để phóng to</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Zoom QR Modal */}
      {zoomQr && (
        <div
          onClick={() => setZoomQr(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-sm w-full bg-bg-card border border-white/20 rounded-3xl p-4 shadow-2xl flex flex-col items-center space-y-3"
          >
            <button
              type="button"
              onClick={() => setZoomQr(false)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-xs font-extrabold text-accent flex items-center space-x-1.5">
              <QrCode className="w-4 h-4" />
              <span>MB Bank: 051220048999</span>
            </div>
            <img
              src="/donate-qr.jpg"
              alt="Mã QR Donate"
              className="w-full max-h-[70vh] object-contain rounded-2xl bg-white"
            />
            <p className="text-xs text-white font-bold">Cảm ơn tất cả chúng mày! ❤️🔥</p>
          </div>
        </div>
      )}
    </div>
  );
};

export const AboutModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-4xl w-full my-auto max-h-[92vh] overflow-y-auto rounded-3xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="sticky top-3 float-right mr-3 mt-3 z-30 p-2 rounded-full bg-black/70 hover:bg-danger text-white border border-white/20 transition cursor-pointer"
          title="Đóng"
        >
          <X className="w-5 h-5" />
        </button>
        <AboutContent />
      </div>
    </div>
  );
};

export default AboutContent;
