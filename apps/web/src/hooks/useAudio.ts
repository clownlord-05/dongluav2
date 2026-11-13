import { useEffect, useCallback, useRef } from 'react';
import { useAudioStore } from '../store/audioStore';
import { connectLiveKit, publishAudioTrack, disconnectLiveKit } from '../lib/livekit';
import { getLiveKitToken } from '../lib/api';
import type { AudioConstraintsActual } from '../types';

const RAW_CONSTRAINTS: any = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 2 },
  sampleRate: { ideal: 48000 },
  // Chromium flags for studio pass-through:
  googEchoCancellation: false,
  googAutoGainControl: false,
  googNoiseSuppression: false,
  googHighpassFilter: false,
};

const STANDARD_CONSTRAINTS: any = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function checkConstraints(actual: MediaTrackSettings): { result: AudioConstraintsActual; warnings: string[] } {
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

export function useAudio() {
  const store = useAudioStore();
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const enumerateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label || `Micro ${d.deviceId.slice(0, 6)}` }));
      store.setDevices(audioInputs);
    } catch (e) {
      console.error('enumerateDevices failed:', e);
    }
  }, [store]);

  const captureRaw = useCallback(
    async (deviceId?: string, customMode?: 'raw' | 'standard'): Promise<MediaStream | null> => {
      let stream: MediaStream | null = null;
      const mode = customMode || store.audioMode;
      const targetConstraints = mode === 'raw' ? RAW_CONSTRAINTS : STANDARD_CONSTRAINTS;

      // Stage 1: Try requested studio constraints with ideal device ID
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
        console.warn('[Audio] Stage 1 getUserMedia failed, falling back to standard mobile audio...', err1);
        // Stage 2: Fallback to standard permissive mobile audio
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              deviceId: deviceId && deviceId !== 'default' ? { ideal: deviceId } : undefined,
            },
            video: false,
          });
        } catch (err2) {
          console.warn('[Audio] Stage 2 getUserMedia failed, falling back to basic audio...', err2);
          // Stage 3: Bare audio constraint
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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

      try {
        const track = stream.getAudioTracks()[0];
        const actual = track ? track.getSettings() : ({} as any);
        const { result, warnings } = checkConstraints(actual);

        store.setActual(result, warnings);
        store.setStream(stream);
        streamRef.current = stream;

        // Setup AudioContext & Analyser for mic level meter
        const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new CtxClass();
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        audioCtxRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        analyserRef.current = analyser;

        // Refresh device list now that mic permission is granted
        enumerateDevices();

        return stream;
      } catch (ctxErr) {
        console.warn('[Audio] AudioContext setup error:', ctxErr);
        store.setStream(stream);
        streamRef.current = stream;
        return stream;
      }
    },
    [store, enumerateDevices]
  );

  const stopCapture = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    store.setStream(null);
    store.setActual(null, []);
  }, [store]);

  const connectAsSpearker = useCallback(
    async (roomId: string) => {
      try {
        const { data } = await getLiveKitToken(roomId);
        const room = await connectLiveKit(data.url, data.token);
        if (streamRef.current) {
          const track = streamRef.current.getAudioTracks()[0];
          if (track) await publishAudioTrack(room, track);
        }
        store.setConnected(true);
      } catch (e) {
        console.error('connectAsSpeaker failed:', e);
        store.setConnected(false);
      }
    },
    [store]
  );

  const disconnect = useCallback(() => {
    disconnectLiveKit();
    stopCapture();
    store.setConnected(false);
  }, [stopCapture, store]);

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
