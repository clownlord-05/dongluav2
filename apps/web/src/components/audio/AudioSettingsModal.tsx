import React, { useState, useEffect, useRef } from 'react';
import { useAudioStore } from '../../store/audioStore';
import { useAudio } from '../../hooks/useAudio';
import {
  Mic,
  Volume2,
  ShieldCheck,
  AlertTriangle,
  Headphones,
  CheckCircle2,
  Play,
  Sparkles,
  Sliders,
  Radio,
  Check,
  RefreshCw,
} from 'lucide-react';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    devices,
    selectedDeviceId,
    setSelectedDevice,
    actual,
    constraintWarnings,
    audioMode,
    setAudioMode,
    gain,
    setGain,
    beatSyncOffsetMs,
    setBeatSyncOffsetMs,
  } = useAudioStore();

  const { captureRaw, stopCapture, enumerateDevices } = useAudio();
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [isLoopback, setIsLoopback] = useState(false);
  const [isPlayingSound, setIsPlayingSound] = useState(false);

  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const loopbackGainRef = useRef<GainNode | null>(null);

  // Clean up on close or unmount
  useEffect(() => {
    return () => {
      if (testing) {
        stopCapture();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [testing, stopCapture]);

  if (!isOpen) return null;

  // Toggle live mic test with VU meter & optional headphone loopback
  const handleStartTest = async () => {
    if (testing) {
      stopCapture();
      setTesting(false);
      setLevel(0);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      return;
    }

    const stream = await captureRaw(selectedDeviceId, audioMode);
    if (!stream) return;

    setTesting(true);

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
      });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Loopback monitor (optional direct listen through headphones)
      const loopGain = ctx.createGain();
      loopGain.gain.value = isLoopback ? 1.0 : 0.0;
      source.connect(loopGain);
      loopGain.connect(ctx.destination);
      loopbackGainRef.current = loopGain;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.warn('Audio test setup error:', err);
    }
  };

  // Toggle hearing oneself through headphones
  const handleToggleLoopback = () => {
    const next = !isLoopback;
    setIsLoopback(next);
    if (loopbackGainRef.current) {
      loopbackGainRef.current.gain.value = next ? 1.0 : 0.0;
    }
  };

  // Play test sound for speaker/headphone output check
  const handlePlayTestSound = () => {
    if (isPlayingSound) return;
    setIsPlayingSound(true);

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5 (Pleasant Chord)

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);

        g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.4);

        osc.connect(g);
        g.connect(ctx.destination);

        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.4);
      });

      setTimeout(() => {
        setIsPlayingSound(false);
      }, 900);
    } catch (e) {
      console.warn('playTestSound error:', e);
      setIsPlayingSound(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn select-none">
      <div className="w-full max-w-lg bg-bg-card border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-primary to-accent text-white shadow-lg">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
                <span>Kiểm Tra Mic & Âm Thanh Đầu Vào/Ra</span>
              </h2>
              <p className="text-[11px] text-text-secondary">
                ĐỐNG LỬA V2 • Chuẩn RAW Studio 48kHz không lọc âm
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (testing) stopCapture();
              onClose();
            }}
            className="text-text-secondary hover:text-white text-base font-bold p-1.5 rounded-xl hover:bg-white/10 transition"
          >
            ✕
          </button>
        </div>

        {/* 1. Headphone Notice */}
        <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 to-orange-500/10 border border-amber-500/30 flex items-start space-x-3">
          <Headphones className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            <span className="font-bold text-accent">LƯU Ý QUAN TRỌNG:</span> Khi hát ở chế độ{' '}
            <span className="text-white font-bold">RAW (Không lọc âm)</span>, bạn{' '}
            <span className="text-accent underline font-bold">bắt buộc nên đeo tai nghe</span> để
            tiếng nhạc karaoke từ loa không bị dội ngược lại vào micro gây tiếng vang!
          </div>
        </div>

        {/* 2. Audio Mode Selector (RAW vs Standard) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-white flex items-center space-x-1.5">
            <Radio className="w-4 h-4 text-primary" />
            <span>Chế độ thu âm:</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setAudioMode('raw');
                if (testing) {
                  stopCapture();
                  setTesting(false);
                }
              }}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 ${
                audioMode === 'raw'
                  ? 'bg-primary/20 border-primary text-white shadow-md'
                  : 'bg-white/5 border-white/10 text-text-secondary hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between font-extrabold text-xs">
                <span>🎤 RAW Studio</span>
                {audioMode === 'raw' && <Check className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-[10px] opacity-80 leading-snug">
                Không lọc âm, giữ nguyên 48kHz dải âm giọng hát chân thực nhất. (Nên dùng tai nghe)
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setAudioMode('standard');
                if (testing) {
                  stopCapture();
                  setTesting(false);
                }
              }}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 ${
                audioMode === 'standard'
                  ? 'bg-primary/20 border-primary text-white shadow-md'
                  : 'bg-white/5 border-white/10 text-text-secondary hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between font-extrabold text-xs">
                <span>🎧 Tiêu Chuẩn</span>
                {audioMode === 'standard' && <Check className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-[10px] opacity-80 leading-snug">
                Bật khử ồn & chống vọng nếu bạn hát trực tiếp bằng loa ngoài laptop/điện thoại.
              </p>
            </button>
          </div>
        </div>

        {/* 3. Mic Selector & Refresh */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white flex items-center space-x-1.5">
              <Sliders className="w-3.5 h-3.5 text-accent" />
              <span>Thiết bị Microphone đầu vào:</span>
            </label>
            <button
              type="button"
              onClick={enumerateDevices}
              className="text-[11px] text-text-secondary hover:text-white flex items-center space-x-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Làm mới mic</span>
            </button>
          </div>
          <select
            value={selectedDeviceId || ''}
            onChange={(e) => {
              setSelectedDevice(e.target.value);
              if (testing) {
                stopCapture();
                setTesting(false);
              }
            }}
            className="w-full bg-bg-panel border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-primary"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone (${d.deviceId.slice(0, 8)})`}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Live Mic Test VU Meter */}
        <div className="bg-bg-panel rounded-2xl p-4 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center space-x-1.5">
              <Mic className="w-3.5 h-3.5 text-green-400" />
              <span>Thử Tín Hiệu Micro:</span>
            </span>
            <button
              type="button"
              onClick={handleStartTest}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-md ${
                testing
                  ? 'bg-danger text-white'
                  : 'bg-gradient-to-r from-primary to-accent hover:from-primary-dark hover:to-yellow-500 text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{testing ? 'Dừng Thử Mic' : 'Bắt Đầu Thử Mic'}</span>
            </button>
          </div>

          {/* VU Level Bar */}
          <div className="w-full h-3.5 bg-black/60 rounded-full overflow-hidden border border-white/15 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                level > 80
                  ? 'bg-danger shadow-sm shadow-danger'
                  : level > 45
                  ? 'bg-accent'
                  : 'bg-green-400'
              }`}
              style={{ width: `${level}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-secondary font-mono">
            <span>0 dB (Im lặng)</span>
            <span className="font-bold text-white">Mức tín hiệu: {level}%</span>
            <span className="text-danger">+6 dB (Clip)</span>
          </div>

          {/* Loopback checkbox: Hear oneself */}
          <div
            onClick={handleToggleLoopback}
            className="flex items-center justify-between pt-2 border-t border-white/5 cursor-pointer hover:opacity-90"
          >
            <div className="flex items-center space-x-2">
              <Headphones className="w-4 h-4 text-accent" />
              <div className="text-xs text-white">
                <span className="font-bold">Nghe lại giọng mình qua tai nghe (Loopback)</span>
                <p className="text-[10px] text-text-secondary">
                  Nói vào mic và nghe trực tiếp giọng bạn xem có trong và rõ không
                </p>
              </div>
            </div>
            <div
              className={`w-5 h-5 rounded-lg border flex items-center justify-center transition ${
                isLoopback
                  ? 'bg-accent border-accent text-black'
                  : 'border-white/30 bg-black/20 text-transparent'
              }`}
            >
              {isLoopback && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>
          </div>
        </div>

        {/* 5. Audio Output / Speaker Test */}
        <div className="bg-bg-panel rounded-2xl p-3.5 border border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-white/5 text-accent">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Kiểm tra Âm Thanh Đầu Ra (Loa/Tai nghe)</div>
              <div className="text-[10px] text-text-secondary">
                Phát chuông mẫu để kiểm tra âm thanh tai nghe hoạt động tốt
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePlayTestSound}
            disabled={isPlayingSound}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center space-x-1.5 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>{isPlayingSound ? 'Đang phát...' : 'Thử Loa'}</span>
          </button>
        </div>

        {/* 5.5 Beat & Voice Zero-Delay Sync Calibration */}
        <div className="bg-bg-panel rounded-2xl p-3.5 border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-white">Cân Chỉnh Độ Trễ Beat (Karaoke Sync):</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`text-xs font-extrabold px-2 py-0.5 rounded-lg ${
                beatSyncOffsetMs === 0 ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary'
              }`}>
                {beatSyncOffsetMs > 0 ? `+${beatSyncOffsetMs}` : beatSyncOffsetMs} ms
              </span>
              {beatSyncOffsetMs !== 0 && (
                <button
                  type="button"
                  onClick={() => setBeatSyncOffsetMs(0)}
                  className="text-[10px] text-text-secondary hover:text-white underline"
                >
                  Đặt lại 0ms
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <input
              type="range"
              min="-300"
              max="300"
              step="10"
              value={beatSyncOffsetMs}
              onChange={(e) => setBeatSyncOffsetMs(parseInt(e.target.value, 10))}
              className="w-full accent-primary h-1.5 bg-black/40 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-text-secondary">
              <span>-300ms (Bù trễ tai nghe Bluetooth)</span>
              <span>0ms (Chuẩn dây / Loa)</span>
              <span>+300ms (Bù trễ Mic)</span>
            </div>
          </div>
          <p className="text-[10px] text-text-secondary leading-snug">
            💡 Mẹo: Nếu bạn dùng tai nghe Bluetooth (AirPods, Galaxy Buds) thấy tiếng hát bị chậm hơn nhạc beat YouTube một chút, hãy kéo thanh về phía âm (-50ms đến -150ms) để khớp hoàn hảo!
          </p>
        </div>

        {/* 6. RAW Verification Specs Table */}
        <div className="bg-bg-panel rounded-2xl p-3.5 border border-white/5 space-y-2">
          <div className="text-xs font-bold text-white flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-green-400" />
            <span>Thông Số Thu Âm Hiện Tại:</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <span className="text-text-secondary">Echo Cancellation:</span>
              <span
                className={`font-bold ${
                  audioMode === 'raw' ? 'text-green-400' : 'text-accent'
                }`}
              >
                {audioMode === 'raw' ? 'TẮT (RAW)' : 'BẬT'}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <span className="text-text-secondary">Noise Suppression:</span>
              <span
                className={`font-bold ${
                  audioMode === 'raw' ? 'text-green-400' : 'text-accent'
                }`}
              >
                {audioMode === 'raw' ? 'TẮT (Giữ tần số)' : 'BẬT'}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <span className="text-text-secondary">Auto Gain Control:</span>
              <span
                className={`font-bold ${
                  audioMode === 'raw' ? 'text-green-400' : 'text-accent'
                }`}
              >
                {audioMode === 'raw' ? 'TẮT (Không nén)' : 'BẬT'}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <span className="text-text-secondary">Sample Rate:</span>
              <span className="font-bold text-accent">48,000 Hz</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-2 flex justify-end space-x-2">
          <button
            type="button"
            onClick={() => {
              if (testing) stopCapture();
              onClose();
            }}
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-xs font-extrabold text-white transition shadow-lg shadow-primary/20"
          >
            Đã Xong
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioSettingsModal;
