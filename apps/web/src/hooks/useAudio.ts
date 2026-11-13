import { useEffect, useCallback, useRef } from 'react';
import { useAudioStore } from '../store/audioStore';
import { connectLiveKit, publishAudioTrack, disconnectLiveKit } from '../lib/livekit';
import { getLiveKitToken } from '../lib/api';
import type { AudioConstraintsActual } from '../types';

const RAW_CONSTRAINTS: any = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 2, min: 1 },
  sampleRate: { ideal: 48000, min: 44100 },
  sampleSize: 16,
  latency: 0,
  // Chromium internal WebRTC flags for zero audio filtering:
  googEchoCancellation: false,
  googAutoGainControl: false,
  googNoiseSuppression: false,
  googHighpassFilter: false, // Prevents cutting frequencies <200Hz
  googTypingNoiseDetection: false,
  googAudioMirroring: false,
};

const STANDARD_CONSTRAINTS: any = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
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

  if (result.echoCancellation) warnings.push('⚠️ Echo Cancellation đang bật (không thể tắt trên thiết bị này)');
  if (result.noiseSuppression) warnings.push('⚠️ Noise Suppression đang bật (không thể tắt trên thiết bị này)');
  if (result.autoGainControl) warnings.push('⚠️ Auto Gain Control đang bật (không thể tắt trên thiết bị này)');
  if (result.sampleRate && result.sampleRate !== 48000)
    warnings.push(`⚠️ Sample rate thực tế: ${result.sampleRate}Hz (yêu cầu 48000Hz)`);

  return { result, warnings };
}

export function useAudio() {
  const store = useAudioStore();
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 8)}` }));
      store.setDevices(audioInputs);
    } catch (e) {
      console.error('enumerateDevices failed:', e);
    }
  }, []);

  const captureRaw = useCallback(
    async (deviceId?: string, customMode?: 'raw' | 'standard'): Promise<MediaStream | null> => {
      try {
        const mode = customMode || store.audioMode;
        const targetConstraints = mode === 'raw' ? RAW_CONSTRAINTS : STANDARD_CONSTRAINTS;
        const constraints: MediaStreamConstraints = {
          audio: {
            ...targetConstraints,
            deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
          },
          video: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const track = stream.getAudioTracks()[0];
        const actual = track.getSettings();
        const { result, warnings } = checkConstraints(actual);

        store.setActual(result, warnings);
        store.setStream(stream);
        streamRef.current = stream;

        // Setup analyser for mic level meter
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        return stream;
      } catch (e) {
        console.error('getUserMedia failed:', e);
        return null;
      }
    },
    [store]
  );

  const stopCapture = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    store.setStream(null);
    store.setActual(null, []);
  }, [store]);

  const connectAsSpearker = useCallback(
    async (roomId: string) => {
      try {
        const { data } = await getLiveKitToken(roomId);
        const stream = await captureRaw(store.selectedDeviceId);
        if (!stream) throw new Error('No stream');

        const room = await connectLiveKit(data.url, data.token, () => {
          store.setConnected(false);
        });

        const track = stream.getAudioTracks()[0];
        await publishAudioTrack(room, track);
        store.setConnected(true);
      } catch (e) {
        console.error('LiveKit connect failed:', e);
      }
    },
    [store, captureRaw]
  );

  const disconnect = useCallback(async () => {
    stopCapture();
    await disconnectLiveKit();
    store.setConnected(false);
  }, [stopCapture, store]);

  const getMicLevel = useCallback((): number => {
    if (!analyserRef.current) return 0;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    return avg / 255;
  }, []);

  useEffect(() => {
    enumerateDevices();
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
  }, [enumerateDevices]);

  return {
    captureRaw,
    stopCapture,
    connectAsSpearker,
    disconnect,
    getMicLevel,
    enumerateDevices,
    analyser: analyserRef,
  };
}
