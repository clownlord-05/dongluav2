import { useEffect, useCallback, useRef } from 'react';
import { useAudioStore } from '../store/audioStore';
import { connectLiveKit, publishAudioTrack, disconnectLiveKit } from '../lib/livekit';
import { getLiveKitToken } from '../lib/api';
import type { AudioConstraintsActual } from '../types';

// Force Media Recording Mode (AudioSource.MIC / MODE_NORMAL on Android & iOS)
// Disabling hardware VoIP echoCancellation/noiseSuppression prevents the OS from switching
// to the Earpiece (Loa trong), prevents YouTube beat volume ducking, and captures 100% of whispers & high notes!
export const RAW_CONSTRAINTS: any = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 2 },
  sampleRate: { ideal: 48000 },
  googEchoCancellation: false,
  googExperimentalEchoCancellation: false,
  googAutoGainControl: false,
  googExperimentalAutoGainControl: false,
  googNoiseSuppression: false,
  googExperimentalNoiseSuppression: false,
  googHighpassFilter: false,
  googAudioMirroring: false,
};

export const STANDARD_CONSTRAINTS: any = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  googEchoCancellation: false,
  googExperimentalEchoCancellation: false,
  googAutoGainControl: false,
  googExperimentalAutoGainControl: false,
  googNoiseSuppression: false,
  googExperimentalNoiseSuppression: false,
  googHighpassFilter: false,
};

// Global registry of all hardware MediaStreams ever opened by getUserMedia
// Guarantees 100% hardware microphone release across all components/modals
const activeHardwareStreams = new Set<MediaStream>();
const activeAudioContexts = new Set<AudioContext>();

export function stopAllHardwareMicStreams() {
  activeHardwareStreams.forEach((s) => {
    try {
      s.getTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
    } catch (e) {}
  });
  activeHardwareStreams.clear();

  activeAudioContexts.forEach((ctx) => {
    try {
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    } catch (e) {}
  });
  activeAudioContexts.clear();

  // Restore mobile OS AudioSession to pure media playback (Loudspeaker)
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).audioSession) {
      (navigator as any).audioSession.type = 'playback';
    }
  } catch (e) {}
}

export function checkConstraints(actual: MediaTrackSettings): {
  result: AudioConstraintsActual;
  warnings: string[];
} {
  const warnings: string[] = [];
  const result: AudioConstraintsActual = {
    echoCancellation: (actual.echoCancellation as boolean) ?? false,
    noiseSuppression: (actual.noiseSuppression as boolean) ?? false,
    autoGainControl: (actual.autoGainControl as boolean) ?? false,
    channelCount: actual.channelCount ?? 1,
    sampleRate: actual.sampleRate ?? 48000,
  };

  if (result.echoCancellation) warnings.push('⚠️ Echo Cancellation đang bật trên thiết bị này');
  if (result.noiseSuppression) warnings.push('⚠️ Noise Suppression đang bật trên thiết bị này');
  if (result.autoGainControl) warnings.push('⚠️ Auto Gain Control đang bật trên thiết bị này');
  if (result.sampleRate && result.sampleRate !== 48000)
    warnings.push(`⚠️ Sample rate thực tế: ${result.sampleRate}Hz (chuẩn 48000Hz)`);

  return { result, warnings };
}

/**
 * Acquires a microphone MediaStream with 3-tier fallback (RAW Studio -> Mobile Standard -> Basic)
 * and updates the hardware constraint specs in useAudioStore.
 */
export async function acquireMicStream(
  deviceId?: string,
  customMode?: 'raw' | 'standard'
): Promise<MediaStream | null> {
  const state = useAudioStore.getState();
  const mode = customMode || state.audioMode;
  const targetConstraints = mode === 'raw' ? RAW_CONSTRAINTS : STANDARD_CONSTRAINTS;
  let stream: MediaStream | null = null;

  // Set iOS 17+ AudioSession to play-and-record (Loudspeaker + Media mix, never earpiece voice-chat)
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).audioSession) {
      (navigator as any).audioSession.type = 'play-and-record';
    }
  } catch (e) {}

  // Stage 1: Studio 48kHz RAW Media constraints (keeps Android/iOS on Loudspeaker MODE_NORMAL)
  try {
    const constraints: MediaStreamConstraints = {
      audio: {
        ...targetConstraints,
        deviceId: deviceId && deviceId !== 'default' ? { ideal: deviceId } : undefined,
      },
      video: false,
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err1) {
    console.warn('[Audio] Stage 1 getUserMedia failed, falling back to mobile RAW media mode...', err1);
    // Stage 2: Mobile RAW Media constraints (omits sampleRate/channelCount but keeps echoCancellation: false so phone stays on Loudspeaker!)
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...STANDARD_CONSTRAINTS,
          deviceId: deviceId && deviceId !== 'default' ? { ideal: deviceId } : undefined,
        },
        video: false,
      });
    } catch (err2) {
      console.warn('[Audio] Stage 2 getUserMedia failed, falling back to basic audio...', err2);
      // Stage 3: Bare audio constraint
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        // Immediately disable any hardware VoIP processing tracks if the browser supports applyConstraints
        const t = stream.getAudioTracks()[0];
        if (t && typeof t.applyConstraints === 'function') {
          await t
            .applyConstraints({
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            })
            .catch(() => {});
        }
      } catch (err3: any) {
        console.error('[Audio] All getUserMedia attempts failed:', err3);
        alert(
          'Không thể kết nối Micro!\nVui lòng kiểm tra quyền truy cập Micro trên trình duyệt (bấm vào biểu tượng ổ khoá trên thanh địa chỉ và chọn Cho Phép Micro).'
        );
        return null;
      }
    }
  }

  if (!stream) return null;
  activeHardwareStreams.add(stream);

  const track = stream.getAudioTracks()[0];
  const actual = track ? track.getSettings() : ({} as any);
  const { result, warnings } = checkConstraints(actual);
  useAudioStore.getState().setActual(result, warnings);

  return stream;
}

export function useAudio() {
  const rawStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  const gainValue = useAudioStore((s) => s.gain);

  // Sync live mic gain node whenever user adjusts gain slider (1.5x pure preamp boost, 0 compression)
  useEffect(() => {
    if (micGainNodeRef.current) {
      micGainNodeRef.current.gain.value = gainValue * 1.5;
    }
  }, [gainValue]);

  const enumerateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label || `Micro ${d.deviceId.slice(0, 6)}` }));
      useAudioStore.getState().setDevices(audioInputs);
    } catch (e) {
      console.error('enumerateDevices failed:', e);
    }
  }, []);

  const captureRaw = useCallback(
    async (deviceId?: string, customMode?: 'raw' | 'standard'): Promise<MediaStream | null> => {
      // Stop any previous hardware capture streams completely first
      const prevStream = useAudioStore.getState().stream;
      if (prevStream) {
        prevStream.getTracks().forEach((t) => t.stop());
      }
      stopAllHardwareMicStreams();

      const rawStream = await acquireMicStream(deviceId, customMode);
      if (!rawStream) return null;
      rawStreamRef.current = rawStream;

      try {
        const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx: AudioContext = new CtxClass({
          latencyHint: 'interactive',
          sampleRate: 48000,
        });
        activeAudioContexts.add(ctx);
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        ctx.onstatechange = () => {
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
        };
        audioCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(rawStream);

        // Pure 100% uncompressed direct studio preamp (NO DynamicsCompressorNode so whispers & high notes are 100% preserved!)
        const gainNode = ctx.createGain();
        gainNode.gain.value = (useAudioStore.getState().gain ?? 1.0) * 1.5;
        micGainNodeRef.current = gainNode;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;

        source.connect(gainNode);
        gainNode.connect(analyser);
        analyserRef.current = analyser;

        // Route gain-adjusted audio into outbound stream if supported
        let outboundStream = rawStream;
        if (typeof ctx.createMediaStreamDestination === 'function') {
          const dest = ctx.createMediaStreamDestination();
          gainNode.connect(dest);
          if (dest.stream.getAudioTracks().length > 0) {
            outboundStream = dest.stream;
          }
        }

        useAudioStore.getState().setStream(outboundStream);

        // Refresh device list now that mic permission is granted
        enumerateDevices();

        return outboundStream;
      } catch (ctxErr) {
        console.warn('[Audio] AudioContext setup error:', ctxErr);
        useAudioStore.getState().setStream(rawStream);
        return rawStream;
      }
    },
    [enumerateDevices]
  );

  const stopCapture = useCallback(() => {
    const activeStream = useAudioStore.getState().stream;
    if (activeStream) {
      activeStream.getTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
    }
    stopAllHardwareMicStreams();
    rawStreamRef.current = null;
    micGainNodeRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    useAudioStore.getState().setStream(null);
    useAudioStore.getState().setActual(null, []);
  }, []);

  const connectAsSpearker = useCallback(async (roomId: string) => {
    try {
      const { data } = await getLiveKitToken(roomId);
      const room = await connectLiveKit(data.url, data.token);
      const activeStream = useAudioStore.getState().stream || rawStreamRef.current;
      if (activeStream) {
        const track = activeStream.getAudioTracks()[0];
        if (track) await publishAudioTrack(room, track);
      }
      useAudioStore.getState().setConnected(true);
    } catch (e) {
      console.error('connectAsSpeaker failed:', e);
      useAudioStore.getState().setConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectLiveKit();
    stopCapture();
    useAudioStore.getState().setConnected(false);
  }, [stopCapture]);

  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  return {
    captureRaw,
    stopCapture,
    connectAsSpearker,
    disconnect,
    enumerateDevices,
    analyser: analyserRef.current,
  };
}
