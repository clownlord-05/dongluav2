import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioStore } from '../../store/audioStore';
import {
  useAudio,
  acquireMicStream,
  applyAudioOutputRoute,
  registerPlaybackAudioContext,
  unregisterPlaybackAudioContext,
} from '../../hooks/useAudio';
import {
  Mic,
  Volume2,
  ShieldCheck,
  Headphones,
  Play,
  Sparkles,
  Sliders,
  Radio,
  Check,
  RefreshCw,
  VolumeX,
} from 'lucide-react';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({ isOpen, onClose }) => {
  const devices = useAudioStore((s) => s.devices);
  const selectedDeviceId = useAudioStore((s) => s.selectedDeviceId);
  const setSelectedDevice = useAudioStore((s) => s.setSelectedDevice);
  const outputRoute = useAudioStore((s) => s.outputRoute);
  const outputDevices = useAudioStore((s) => s.outputDevices);
  const selectedOutputDeviceId = useAudioStore((s) => s.selectedOutputDeviceId);
  const actual = useAudioStore((s) => s.actual);
  const constraintWarnings = useAudioStore((s) => s.constraintWarnings);
  const audioMode = useAudioStore((s) => s.audioMode);
  const setAudioMode = useAudioStore((s) => s.setAudioMode);
  const gain = useAudioStore((s) => s.gain);
  const setGain = useAudioStore((s) => s.setGain);
  const beatSyncOffsetMs = useAudioStore((s) => s.beatSyncOffsetMs);
  const setBeatSyncOffsetMs = useAudioStore((s) => s.setBeatSyncOffsetMs);

  const { captureRaw, enumerateDevices } = useAudio();
  const [testing, setTesting] = useState(false);
  // Default loopback to TRUE so user immediately hears their own voice when testing mic!
  const [isLoopback, setIsLoopback] = useState(true);
  const [isPlayingSound, setIsPlayingSound] = useState(false);

  // Refs for zero-lag 60fps VU meter & isolated test audio pipeline
  const testStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const loopbackGainRef = useRef<GainNode | null>(null);
  const fallbackAudioElRef = useRef<HTMLAudioElement | null>(null);

  // Direct DOM refs so 60fps VU meter causes ZERO React re-renders (no lag!)
  const vuBarRef = useRef<HTMLDivElement | null>(null);
  const vuTextRef = useRef<HTMLSpanElement | null>(null);
  const vuBadgeRef = useRef<HTMLSpanElement | null>(null);

  const stopTestSession = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (fallbackAudioElRef.current) {
      fallbackAudioElRef.current.pause();
      fallbackAudioElRef.current.srcObject = null;
      fallbackAudioElRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      unregisterPlaybackAudioContext(audioCtxRef.current);
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    loopbackGainRef.current = null;
    setTesting(false);

    if (vuBarRef.current) {
      vuBarRef.current.style.width = '0%';
    }
    if (vuTextRef.current) {
      vuTextRef.current.textContent = 'Mức tín hiệu: 0%';
    }
    if (vuBadgeRef.current) {
      vuBadgeRef.current.textContent = 'Đang nghỉ';
    }
  }, []);

  // Clean up test session ONLY when modal closes or component unmounts
  useEffect(() => {
    if (!isOpen) {
      stopTestSession();
    }
    return () => {
      stopTestSession();
    };
  }, [isOpen, stopTestSession]);

  const startTestSession = useCallback(
    async (targetDeviceId: string, targetMode: 'raw' | 'standard') => {
      stopTestSession();

      const stream = await acquireMicStream(targetDeviceId, targetMode);
      if (!stream) return;

      testStreamRef.current = stream;
      setTesting(true);
      enumerateDevices();

      try {
        const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx: AudioContext = new CtxClass({
          latencyHint: 'interactive',
          sampleRate: 48000,
        });
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        registerPlaybackAudioContext(ctx);
        audioCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.35;
        source.connect(analyser);
        analyserRef.current = analyser;

        // Direct voice loopback so the user hears every tiny whisper and high note in real time (1.5x pure studio preamp)
        const loopGain = ctx.createGain();
        const currentGain = (useAudioStore.getState().gain ?? 1.0) * 1.5;
        loopGain.gain.value = isLoopback ? currentGain : 0.0;
        source.connect(loopGain);
        loopGain.connect(ctx.destination);
        loopbackGainRef.current = loopGain;

        // Mobile Safari/Android unlock helper: ensure audio output pipeline is active
        const audioEl = new Audio();
        audioEl.srcObject = stream;
        audioEl.muted = true; // Muted because WebAudio destination plays the sound with zero delay & gain control
        (audioEl as any).playsInline = true;
        audioEl.play().catch(() => {});
        fallbackAudioElRef.current = audioEl;

        // 60fps Time-Domain RMS + Peak VU meter updated via direct DOM refs (0 React re-renders!)
        const timeData = new Float32Array(analyser.fftSize);
        const updateMeter = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getFloatTimeDomainData(timeData);

          let sumSquares = 0;
          let peak = 0;
          for (let i = 0; i < timeData.length; i++) {
            const sample = Math.abs(timeData[i]);
            sumSquares += sample * sample;
            if (sample > peak) peak = sample;
          }
          const rms = Math.sqrt(sumSquares / timeData.length);
          const effectiveGain = useAudioStore.getState().gain ?? 1.0;
          // Combine RMS and Peak for natural human voice responsiveness
          const rawLevel = Math.min(1, (rms * 3.2 + peak * 0.6) * effectiveGain);
          const pct = Math.min(100, Math.round(rawLevel * 100));

          if (vuBarRef.current) {
            vuBarRef.current.style.width = `${pct}%`;
            if (pct > 85) {
              vuBarRef.current.className = 'h-full rounded-full bg-danger shadow-sm shadow-danger transition-[width] duration-75';
            } else if (pct > 45) {
              vuBarRef.current.className = 'h-full rounded-full bg-accent transition-[width] duration-75';
            } else {
              vuBarRef.current.className = 'h-full rounded-full bg-green-400 transition-[width] duration-75';
            }
          }
          if (vuTextRef.current) {
            vuTextRef.current.textContent = `Mức thu thực tế: ${pct}%`;
          }
          if (vuBadgeRef.current) {
            vuBadgeRef.current.textContent =
              pct > 85 ? '⚠️ Hơi rè (Clip)' : pct > 8 ? '🟢 Đang thu rõ' : 'Hãy nói vào mic...';
          }

          animationFrameRef.current = requestAnimationFrame(updateMeter);
        };

        animationFrameRef.current = requestAnimationFrame(updateMeter);
      } catch (err) {
        console.warn('Audio test setup error:', err);
      }
    },
    [stopTestSession, enumerateDevices, isLoopback]
  );

  if (!isOpen) return null;

  const handleToggleTest = async () => {
    if (testing) {
      stopTestSession();
    } else {
      await startTestSession(selectedDeviceId, audioMode);
    }
  };

  // Toggle hearing oneself through headphones/speakers
  const handleToggleLoopback = () => {
    const next = !isLoopback;
    setIsLoopback(next);
    if (loopbackGainRef.current) {
      loopbackGainRef.current.gain.value = next ? gain * 1.5 : 0.0;
    }
  };

  const handleGainChange = (newGain: number) => {
    setGain(newGain);
    if (loopbackGainRef.current && isLoopback) {
      loopbackGainRef.current.gain.value = newGain * 1.5;
    }
  };

  // Play test sound for speaker/headphone output check
  const handlePlayTestSound = async () => {
    if (isPlayingSound) return;
    setIsPlayingSound(true);

    try {
      const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new CtxClass();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5 (Pleasant Chord)

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);

        g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.45);

        osc.connect(g);
        g.connect(ctx.destination);

        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.45);
      });

      setTimeout(() => {
        setIsPlayingSound(false);
        ctx.close().catch(() => {});
      }, 950);
    } catch (e) {
      console.warn('playTestSound error:', e);
      setIsPlayingSound(false);
    }
  };

  const handleCloseModal = () => {
    stopTestSession();
    // If user already had an active live stage mic stream, refresh it with the newly selected settings
    if (useAudioStore.getState().stream) {
      captureRaw(selectedDeviceId, audioMode);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-fadeIn select-none">
      <div className="w-full max-w-lg bg-bg-card border border-white/15 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-primary to-accent text-white shadow-lg">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white flex items-center space-x-2">
                <span>Kiểm Tra Mic & Chỉnh Âm Thanh</span>
              </h2>
              <p className="text-[11px] text-text-secondary">
                Nghe thử trực tiếp giọng thật • Chuẩn Studio 48kHz
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            className="text-text-secondary hover:text-white text-base font-bold p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 1. Live Mic Test & Direct Voice Loopback (Placed right at top for instant access) */}
        <div className="bg-bg-panel rounded-2xl p-4 border border-primary/30 space-y-3 shadow-inner">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-extrabold text-white flex items-center space-x-1.5">
                <Mic className={`w-4 h-4 ${testing ? 'text-green-400 animate-pulse' : 'text-primary'}`} />
                <span>Thử Micro & Nghe Lại Giọng Trực Tiếp:</span>
              </span>
              <p className="text-[10px] text-text-secondary mt-0.5">
                {testing
                  ? 'Hãy nói hoặc hát vào mic — giọng bạn đang được phát lại trực tiếp!'
                  : 'Bấm "Bắt Đầu Thử Mic" rồi nói để nghe lại chính xác âm thanh mic thu vào'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleTest}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition flex items-center space-x-1.5 shadow-lg shrink-0 cursor-pointer ${
                testing
                  ? 'bg-danger hover:bg-red-600 text-white shadow-danger/30'
                  : 'bg-gradient-to-r from-primary to-accent hover:from-primary-dark hover:to-yellow-500 text-bg-base shadow-primary/30'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>{testing ? 'Dừng Thử Mic' : 'Bắt Đầu Thử Mic'}</span>
            </button>
          </div>

          {/* Real-time 60fps VU Level Bar (DOM Ref driven - Zero Lag) */}
          <div className="w-full h-4 bg-black/70 rounded-full overflow-hidden border border-white/15 p-0.5">
            <div
              ref={vuBarRef}
              className="h-full rounded-full bg-green-400 transition-[width] duration-75"
              style={{ width: '0%' }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-text-secondary font-mono">
            <span ref={vuBadgeRef} className="text-accent font-sans font-bold">
              {testing ? 'Hãy nói vào mic...' : 'Đang nghỉ'}
            </span>
            <span ref={vuTextRef} className="font-bold text-white">
              Mức thu thực tế: 0%
            </span>
            <span className="text-danger">Max 100%</span>
          </div>

          {/* Mic Volume / Gain Boost Slider */}
          <div className="pt-2 border-t border-white/10 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center space-x-1.5">
                <Volume2 className="w-3.5 h-3.5 text-accent" />
                <span>Độ nhạy / Khuếch đại tiếng Mic:</span>
              </span>
              <span className="font-extrabold text-accent">{Math.round(gain * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="2.0"
              step="0.05"
              value={gain}
              onChange={(e) => handleGainChange(parseFloat(e.target.value))}
              className="w-full accent-accent h-1.5 bg-black/50 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-text-secondary">
              <span>20% (Nhỏ)</span>
              <span>100% (Mặc định)</span>
              <span>200% (Khuếch đại X2)</span>
            </div>
          </div>

          {/* Loopback Toggle: Hear oneself */}
          <div
            onClick={handleToggleLoopback}
            className="flex items-center justify-between pt-2 border-t border-white/10 cursor-pointer hover:opacity-90"
          >
            <div className="flex items-center space-x-2">
              {isLoopback ? (
                <Headphones className="w-4 h-4 text-green-400 shrink-0" />
              ) : (
                <VolumeX className="w-4 h-4 text-text-secondary shrink-0" />
              )}
              <div className="text-xs text-white">
                <span className="font-bold">
                  Vọng lại tiếng nói để nghe thử (Loopback):{' '}
                  <span className={isLoopback ? 'text-green-400' : 'text-text-secondary'}>
                    {isLoopback ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                  </span>
                </span>
                <p className="text-[10px] text-text-secondary">
                  Bật để nghe trực tiếp giọng thật của bạn từ mic phát ra loa/tai nghe
                </p>
              </div>
            </div>
            <div
              className={`w-5 h-5 rounded-lg border flex items-center justify-center transition shrink-0 ${
                isLoopback
                  ? 'bg-green-500 border-green-400 text-black'
                  : 'border-white/30 bg-black/20 text-transparent'
              }`}
            >
              {isLoopback && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>
          </div>
        </div>

        {/* 2. Audio Mode Selector (RAW vs Standard) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-white flex items-center space-x-1.5">
            <Radio className="w-4 h-4 text-primary" />
            <span>Chế độ thu âm Micro:</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setAudioMode('raw');
                if (testing) {
                  startTestSession(selectedDeviceId, 'raw');
                }
              }}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 cursor-pointer ${
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
                Không lọc âm, giữ nguyên 48kHz dải âm giọng hát chân thực nhất. (Khuyên dùng tai nghe)
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setAudioMode('standard');
                if (testing) {
                  startTestSession(selectedDeviceId, 'standard');
                }
              }}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 cursor-pointer ${
                audioMode === 'standard'
                  ? 'bg-primary/20 border-primary text-white shadow-md'
                  : 'bg-white/5 border-white/10 text-text-secondary hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between font-extrabold text-xs">
                <span>🎧 Tiêu Chuẩn (Khử ồn)</span>
                {audioMode === 'standard' && <Check className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-[10px] opacity-80 leading-snug">
                Bật khử ồn & chống hú (Echo Cancellation) khi dùng loa ngoài điện thoại/laptop.
              </p>
            </button>
          </div>
        </div>

        {/* 3. Mic Device Selector & Refresh */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white flex items-center space-x-1.5">
              <Sliders className="w-3.5 h-3.5 text-accent" />
              <span>Thiết bị Microphone đầu vào:</span>
            </label>
            <button
              type="button"
              onClick={enumerateDevices}
              className="text-[11px] text-text-secondary hover:text-white flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Làm mới danh sách</span>
            </button>
          </div>
          <select
            value={selectedDeviceId || 'default'}
            onChange={(e) => {
              const newId = e.target.value;
              setSelectedDevice(newId);
              if (testing) {
                startTestSession(newId, audioMode);
              }
            }}
            className="w-full bg-bg-panel border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-primary"
          >
            {devices.length === 0 ? (
              <option value="default">Microphone Mặc định của thiết bị</option>
            ) : (
              devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone (${d.deviceId.slice(0, 8)})`}
                </option>
              ))
            )}
          </select>
        </div>

        {/* 4. Audio Output Route (Loudspeaker Lock vs Headphones) & Speaker Test */}
        <div className="bg-bg-panel rounded-2xl p-3.5 border border-accent/30 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold text-white flex items-center space-x-1.5">
              <Volume2 className="w-4 h-4 text-accent" />
              <span>Đầu Ra Âm Thanh (Loa Ngoài / Tai Nghe):</span>
            </label>
            <button
              type="button"
              onClick={handlePlayTestSound}
              disabled={isPlayingSound}
              className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition flex items-center space-x-1 disabled:opacity-50 shrink-0 cursor-pointer"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>{isPlayingSound ? 'Đang phát...' : 'Thử Loa'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                await applyAudioOutputRoute('speaker', 'default');
                if (testing) {
                  startTestSession(selectedDeviceId, audioMode);
                } else if (useAudioStore.getState().stream) {
                  captureRaw(selectedDeviceId, audioMode);
                }
              }}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 cursor-pointer ${
                outputRoute === 'speaker'
                  ? 'bg-accent/20 border-accent text-white shadow-md'
                  : 'bg-white/5 border-white/10 text-text-secondary hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between font-extrabold text-xs">
                <span>🔊 Bắt Buộc Loa Ngoài</span>
                {outputRoute === 'speaker' && <Check className="w-4 h-4 text-accent" />}
              </div>
              <p className="text-[10px] opacity-85 leading-snug">
                Khóa cứng nhạc beat & giọng hát luôn phát ra Loa Ngoài, chống nhảy vào loa trong (loa thoại).
              </p>
            </button>

            <button
              type="button"
              onClick={async () => {
                await applyAudioOutputRoute('headphone');
                if (testing) {
                  startTestSession(selectedDeviceId, audioMode);
                } else if (useAudioStore.getState().stream) {
                  captureRaw(selectedDeviceId, audioMode);
                }
              }}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 cursor-pointer ${
                outputRoute === 'headphone'
                  ? 'bg-accent/20 border-accent text-white shadow-md'
                  : 'bg-white/5 border-white/10 text-text-secondary hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between font-extrabold text-xs">
                <span>🎧 Chế Độ Tai Nghe</span>
                {outputRoute === 'headphone' && <Check className="w-4 h-4 text-accent" />}
              </div>
              <p className="text-[10px] opacity-85 leading-snug">
                Truyền âm thanh đầu ra qua Tai nghe khi bạn cắm tai nghe dây hoặc kết nối Bluetooth.
              </p>
            </button>
          </div>

          {outputDevices.length > 0 && (
            <div className="pt-1 space-y-1">
              <span className="text-[11px] font-bold text-text-secondary block">
                Chọn thiết bị đầu ra âm thanh cụ thể:
              </span>
              <select
                value={selectedOutputDeviceId || 'default'}
                onChange={async (e) => {
                  const newOutId = e.target.value;
                  const chosen = outputDevices.find((d) => d.deviceId === newOutId);
                  const isHp = chosen && /headset|headphone|bluetooth|earphone|airpods|buds|usb|tai nghe/i.test(chosen.label);
                  await applyAudioOutputRoute(isHp ? 'headphone' : outputRoute, newOutId);
                }}
                className="w-full bg-bg-card border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-accent"
              >
                <option value="default">
                  {outputRoute === 'speaker'
                    ? '🔊 Loa Ngoài Mặc Định (Speakerphone)'
                    : '🎧 Tai Nghe Đang Kết Nối'}
                </option>
                {outputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 5. Beat & Voice Zero-Delay Sync Calibration */}
        <div className="bg-bg-panel rounded-2xl p-3.5 border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-white">Cân Chỉnh Độ Trễ Nhạc Beat (Sync):</span>
            </div>
            <div className="flex items-center space-x-2">
              <span
                className={`text-xs font-extrabold px-2 py-0.5 rounded-lg ${
                  beatSyncOffsetMs === 0 ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary'
                }`}
              >
                {beatSyncOffsetMs > 0 ? `+${beatSyncOffsetMs}` : beatSyncOffsetMs} ms
              </span>
              {beatSyncOffsetMs !== 0 && (
                <button
                  type="button"
                  onClick={() => setBeatSyncOffsetMs(0)}
                  className="text-[10px] text-text-secondary hover:text-white underline cursor-pointer"
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
              <span>-300ms (Bù trễ Bluetooth)</span>
              <span>0ms (Chuẩn dây / Loa)</span>
              <span>+300ms (Bù trễ Mic)</span>
            </div>
          </div>
        </div>

        {/* 6. Actual Hardware Verification Specs Table */}
        <div className="bg-bg-panel rounded-2xl p-3.5 border border-white/5 space-y-2">
          <div className="text-xs font-bold text-white flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-green-400" />
            <span>Thông Số Thực Tế Phần Cứng Micro Thu Vào:</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <span className="text-text-secondary">Chống vọng (AEC):</span>
              <span
                className={`font-bold ${
                  (actual ? !actual.echoCancellation : audioMode === 'raw') ? 'text-green-400' : 'text-accent'
                }`}
              >
                {actual
                  ? actual.echoCancellation
                    ? 'ĐANG BẬT'
                    : 'TẮT (RAW)'
                  : audioMode === 'raw'
                  ? 'TẮT (RAW)'
                  : 'BẬT'}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <span className="text-text-secondary">Khử ồn (NS):</span>
              <span
                className={`font-bold ${
                  (actual ? !actual.noiseSuppression : audioMode === 'raw') ? 'text-green-400' : 'text-accent'
                }`}
              >
                {actual
                  ? actual.noiseSuppression
                    ? 'ĐANG BẬT'
                    : 'TẮT (Giữ âm)'
                  : audioMode === 'raw'
                  ? 'TẮT (Giữ âm)'
                  : 'BẬT'}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <span className="text-text-secondary">Tự cân bằng (AGC):</span>
              <span
                className={`font-bold ${
                  (actual ? !actual.autoGainControl : audioMode === 'raw') ? 'text-green-400' : 'text-accent'
                }`}
              >
                {actual
                  ? actual.autoGainControl
                    ? 'ĐANG BẬT'
                    : 'TẮT (Không nén)'
                  : audioMode === 'raw'
                  ? 'TẮT (Không nén)'
                  : 'BẬT'}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <span className="text-text-secondary">Tần số mẫu:</span>
              <span className="font-bold text-accent">
                {actual?.sampleRate ? `${actual.sampleRate.toLocaleString()} Hz` : '48,000 Hz'}
              </span>
            </div>
          </div>

          {constraintWarnings.length > 0 && audioMode === 'raw' && (
            <div className="text-[10px] text-amber-300/90 space-y-0.5 pt-1">
              {constraintWarnings.map((w, idx) => (
                <div key={idx}>{w}</div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-1 flex justify-end space-x-2">
          <button
            type="button"
            onClick={handleCloseModal}
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-xs font-extrabold text-white transition shadow-lg shadow-primary/20 cursor-pointer"
          >
            Lưu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioSettingsModal;
