import { useEffect, useCallback, useRef } from 'react';
import { useAudioStore } from '../store/audioStore';
import { connectLiveKit, publishAudioTrack, disconnectLiveKit } from '../lib/livekit';
import { getLiveKitToken } from '../lib/api';
import type { AudioConstraintsActual } from '../types';

// Studio Vocal Constraints:
// - echoCancellation: false -> Prevents Android/iOS from entering VoIP Call Mode (Earpiece / Loa trong) & prevents beat ducking!
// - noiseSuppression: false -> Prevents background gate from cutting off high notes, vibrato, and whispers!
// - autoGainControl: true  -> Enables hardware mic preamp so quiet voices & distant mics are boosted to full studio volume!
export const RAW_CONSTRAINTS: any = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
  sampleRate: { ideal: 48000 },
  googEchoCancellation: false,
  googExperimentalEchoCancellation: false,
  googAutoGainControl: true,
  googExperimentalAutoGainControl: true,
  googNoiseSuppression: false,
  googExperimentalNoiseSuppression: false,
  googHighpassFilter: false,
};

export const STANDARD_CONSTRAINTS: any = {
  echoCancellation: false,
  noiseSuppression: true,
  autoGainControl: true,
  googEchoCancellation: false,
  googAutoGainControl: true,
  googNoiseSuppression: true,
};

const EARPIECE_REGEX = /^(earpiece|loa thoại|loa trong|receiver)$/i;
const SPEAKERPHONE_REGEX = /^(speakerphone|loa ngoài)$/i;
const HEADPHONE_REGEX = /headset|headphone|bluetooth|earphone|airpods|buds|usb|tai nghe|wired|hands-free/i;

// Global registries of all hardware MediaStreams and AudioContexts
const activeHardwareStreams = new Set<MediaStream>();
const activeCaptureContexts = new Set<AudioContext>();
const activePlaybackContexts = new Set<AudioContext>();

export function registerPlaybackAudioContext(ctx: AudioContext) {
  activePlaybackContexts.add(ctx);
  const { outputRoute, selectedOutputDeviceId, outputDevices } = useAudioStore.getState();
  applySinkToContext(ctx, outputRoute, selectedOutputDeviceId, outputDevices);
}

export function unregisterPlaybackAudioContext(ctx: AudioContext) {
  activePlaybackContexts.delete(ctx);
}

async function applySinkToContext(
  ctx: AudioContext,
  route: 'speaker' | 'headphone',
  selectedOutputDeviceId: string,
  outputDevices: { deviceId: string; label: string }[]
) {
  try {
    if (typeof (ctx as any).setSinkId !== 'function') return;

    if (selectedOutputDeviceId && selectedOutputDeviceId !== 'default') {
      await (ctx as any).setSinkId(selectedOutputDeviceId);
      return;
    }

    if (route === 'headphone') {
      const hpOut = outputDevices.find((d) => HEADPHONE_REGEX.test(d.label));
      if (hpOut && hpOut.deviceId !== 'default') {
        await (ctx as any).setSinkId(hpOut.deviceId);
        return;
      }
    }

    if (route === 'speaker') {
      const spkOut = outputDevices.find(
        (d) => SPEAKERPHONE_REGEX.test(d.label.trim()) && !EARPIECE_REGEX.test(d.label.trim())
      );
      if (spkOut && spkOut.deviceId !== 'default') {
        await (ctx as any).setSinkId(spkOut.deviceId);
        return;
      }
    }

    await (ctx as any).setSinkId('');
  } catch (e) {}
}

/**
 * Forces all active playback AudioContexts and HTML media elements to route to the chosen output (Speaker vs Headphone).
 */
export async function applyAudioOutputRoute(
  route: 'speaker' | 'headphone',
  customOutputDeviceId?: string
) {
  const store = useAudioStore.getState();
  store.setOutputRoute(route);
  if (customOutputDeviceId !== undefined) {
    store.setSelectedOutputDevice(customOutputDeviceId);
  }

  const targetOutputId =
    customOutputDeviceId !== undefined ? customOutputDeviceId : store.selectedOutputDeviceId;
  const outputDevices = store.outputDevices;

  for (const ctx of Array.from(activePlaybackContexts)) {
    if (ctx.state === 'closed') {
      activePlaybackContexts.delete(ctx);
      continue;
    }
    await applySinkToContext(ctx, route, targetOutputId, outputDevices);
  }

  if (typeof document !== 'undefined') {
    const mediaEls = document.querySelectorAll('audio, video');
    mediaEls.forEach((el: any) => {
      if (typeof el.setSinkId === 'function') {
        const sink = targetOutputId && targetOutputId !== 'default' ? targetOutputId : '';
        el.setSinkId(sink).catch(() => {});
      }
    });
  }
}

/**
 * Forces Android AudioFlinger & iOS CoreAudio back to pure STREAM_MUSIC Loudspeaker mode.
 */
function forceOsLoudspeakerRestore() {
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).audioSession) {
      (navigator as any).audioSession.type = 'playback';
    }
  } catch (e) {}

  try {
    if (typeof window === 'undefined') return;
    const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!CtxClass) return;
    const restoreCtx: AudioContext = new CtxClass({ latencyHint: 'playback' });
    if (typeof (restoreCtx as any).setSinkId === 'function') {
      (restoreCtx as any).setSinkId('').catch(() => {});
    }
    const buf = restoreCtx.createBuffer(1, 128, restoreCtx.sampleRate || 48000);
    const src = restoreCtx.createBufferSource();
    src.buffer = buf;
    src.connect(restoreCtx.destination);
    src.start(0);
    setTimeout(() => {
      restoreCtx.close().catch(() => {});
    }, 60);
  } catch (e) {}
}

export function stopAllHardwareMicStreams() {
  const storeStream = useAudioStore.getState().stream;
  if (storeStream) {
    try {
      storeStream.getTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
    } catch (e) {}
  }

  activeHardwareStreams.forEach((s) => {
    try {
      s.getTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });
    } catch (e) {}
  });
  activeHardwareStreams.clear();

  activeCaptureContexts.forEach((ctx) => {
    try {
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    } catch (e) {}
  });
  activeCaptureContexts.clear();

  forceOsLoudspeakerRestore();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', stopAllHardwareMicStreams);
  window.addEventListener('beforeunload', stopAllHardwareMicStreams);
}

export function checkConstraints(actual: MediaTrackSettings): {
  result: AudioConstraintsActual;
  warnings: string[];
} {
  const warnings: string[] = [];
  const result: AudioConstraintsActual = {
    echoCancellation: (actual.echoCancellation as boolean) ?? false,
    noiseSuppression: (actual.noiseSuppression as boolean) ?? false,
    autoGainControl: (actual.autoGainControl as boolean) ?? true,
    channelCount: actual.channelCount ?? 1,
    sampleRate: actual.sampleRate ?? 48000,
  };

  if (result.echoCancellation) warnings.push('⚠️ Echo Cancellation đang bật trên thiết bị này');
  if (result.noiseSuppression) warnings.push('⚠️ Noise Suppression đang bật trên thiết bị này');
  if (result.sampleRate && result.sampleRate !== 48000)
    warnings.push(`⚠️ Sample rate thực tế: ${result.sampleRate}Hz (chuẩn 48000Hz)`);

  return { result, warnings };
}

async function openMicStream(
  targetDeviceId: string | undefined,
  mode: 'raw' | 'standard'
): Promise<MediaStream | null> {
  const targetConstraints = mode === 'raw' ? RAW_CONSTRAINTS : STANDARD_CONSTRAINTS;

  // Stage 1: Studio constraints (echoCancellation: false, autoGainControl: true)
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        ...targetConstraints,
        deviceId: targetDeviceId && targetDeviceId !== 'default' ? { ideal: targetDeviceId } : undefined,
      },
      video: false,
    });
  } catch (err1) {
    // Stage 2: Mobile constraints
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          deviceId: targetDeviceId && targetDeviceId !== 'default' ? { ideal: targetDeviceId } : undefined,
        },
        video: false,
      });
    } catch (err2) {
      // Stage 3: Bare audio fallback
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (err3) {
        return null;
      }
    }
  }
}

/**
 * Acquires a hardware microphone MediaStream:
 * - Preserves full sensitivity (autoGainControl: true + 4.5x WebAudio Studio Preamp)
 * - Prevents Earpiece ("Loa trong") routing on mobile if Android Chrome picks "Earpiece"
 */
export async function acquireMicStream(
  deviceId?: string,
  customMode?: 'raw' | 'standard'
): Promise<MediaStream | null> {
  const state = useAudioStore.getState();
  const mode = customMode || state.audioMode;
  const outputRoute = state.outputRoute || 'speaker';
  const requestedId = deviceId || state.selectedDeviceId;

  let stream = await openMicStream(requestedId, mode);
  if (!stream) {
    alert(
      'Không thể kết nối Micro!\nVui lòng kiểm tra quyền truy cập Micro trên trình duyệt (bấm vào biểu tượng ổ khoá trên thanh địa chỉ và chọn Cho Phép Micro).'
    );
    return null;
  }

  // Only intervene if the mobile OS explicitly routed the track to "Earpiece" ("Loa thoại" / "Loa trong")
  try {
    const currentTrack = stream.getAudioTracks()[0];
    const currentLabel = (currentTrack?.label || '').trim();
    if (EARPIECE_REGEX.test(currentLabel) && navigator.mediaDevices?.enumerateDevices) {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === 'audioinput' && !EARPIECE_REGEX.test(d.label.trim()));
      const replacement =
        outputRoute === 'headphone'
          ? inputs.find((d) => HEADPHONE_REGEX.test(d.label)) ||
            inputs.find((d) => SPEAKERPHONE_REGEX.test(d.label.trim()))
          : inputs.find((d) => SPEAKERPHONE_REGEX.test(d.label.trim())) || inputs[0];

      if (replacement) {
        const betterStream = await openMicStream(replacement.deviceId, mode);
        if (betterStream) {
          stream.getTracks().forEach((t) => t.stop());
          stream = betterStream;
        }
      }
    }
  } catch (e) {}

  activeHardwareStreams.add(stream);

  const track = stream.getAudioTracks()[0];
  const actual = track ? track.getSettings() : ({} as any);
  const { result, warnings } = checkConstraints(actual);
  useAudioStore.getState().setActual(result, warnings);

  await applyAudioOutputRoute(outputRoute);

  return stream;
}

/**
 * Creates a Studio Vocal Preamp + Brickwall Peak Limiter chain in the given AudioContext:
 * - Multiplies input voice by `gain * 4.5` (450% studio preamp boost at 100% slider, up to 900% at 200% slider!)
 * - Brickwall Limiter at -1.5dB catches only extreme peaks so loud singing never clips while whispers & normal speech are crystal clear and loud!
 */
export function createStudioVocalPreamp(ctx: AudioContext, initialGain: number) {
  // High-Pass at 65Hz only removes DC offset & desk thumps while keeping 100% of vocal warmth
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 65;
  highpass.Q.value = 0.707;

  // Vocal Presence Shelf (+3.5 dB above 2.5 kHz for crisp articulation & high notes)
  const presence = ctx.createBiquadFilter();
  presence.type = 'highshelf';
  presence.frequency.value = 2500;
  presence.gain.value = 3.5;

  // Powerful 4.5x Studio Preamp Gain
  const preampGain = ctx.createGain();
  preampGain.gain.value = Math.max(0.2, initialGain) * 4.5;

  // Brickwall Peak Limiter (threshold -1.5dB: NEVER reduces whispers or normal voice, only prevents >0dB clipping!)
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 4;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.06;

  highpass.connect(presence);
  presence.connect(preampGain);
  preampGain.connect(limiter);

  return {
    inputNode: highpass,
    preampGain,
    outputNode: limiter,
    setGain: (g: number) => {
      preampGain.gain.value = Math.max(0.2, g) * 4.5;
    },
    disconnect: () => {
      try {
        highpass.disconnect();
        presence.disconnect();
        preampGain.disconnect();
        limiter.disconnect();
      } catch (e) {}
    },
  };
}

export function useAudio() {
  const rawStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const enumerateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();

      const audioInputs = devices
        .filter((d) => d.kind === 'audioinput' && !EARPIECE_REGEX.test(d.label.trim()))
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label
            ? d.label.replace(/^Speakerphone$/i, '🔊 Loa Ngoài (Speakerphone)')
            : `Micro ${d.deviceId.slice(0, 6)}`,
        }));

      const audioOutputs = devices
        .filter((d) => d.kind === 'audiooutput' && !EARPIECE_REGEX.test(d.label.trim()))
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Loa / Tai nghe ${d.deviceId.slice(0, 6)}`,
        }));

      useAudioStore.getState().setDevices(audioInputs);
      useAudioStore.getState().setOutputDevices(audioOutputs);
    } catch (e) {
      console.error('enumerateDevices failed:', e);
    }
  }, []);

  const captureRaw = useCallback(
    async (deviceId?: string, customMode?: 'raw' | 'standard'): Promise<MediaStream | null> => {
      const prevStream = useAudioStore.getState().stream;
      if (prevStream) {
        prevStream.getTracks().forEach((t) => t.stop());
      }
      stopAllHardwareMicStreams();

      const rawStream = await acquireMicStream(deviceId, customMode);
      if (!rawStream) return null;
      rawStreamRef.current = rawStream;

      // Store the direct hardware MediaStream in useAudioStore!
      // NEVER wrap it in a separate AudioContext's createMediaStreamDestination(),
      // because feeding a synthetic MediaStreamDestination track from AudioContext #1
      // into createMediaStreamSource() of AudioContext #2 in useWebRTCAudio drops audio in Chrome/WebKit!
      useAudioStore.getState().setStream(rawStream);

      enumerateDevices();

      return rawStream;
    },
    [enumerateDevices]
  );

  const stopCapture = useCallback(() => {
    stopAllHardwareMicStreams();
    rawStreamRef.current = null;
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
