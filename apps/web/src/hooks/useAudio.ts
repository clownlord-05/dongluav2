import { useEffect, useCallback, useRef } from 'react';
import { useAudioStore } from '../store/audioStore';
import { connectLiveKit, publishAudioTrack, disconnectLiveKit } from '../lib/livekit';
import { getLiveKitToken } from '../lib/api';
import type { AudioConstraintsActual } from '../types';

// Strict Media Recording Constraints (forces AudioParameters::NO_EFFECTS in Chromium so Android NEVER enters MODE_IN_COMMUNICATION)
export const RAW_CONSTRAINTS: any = {
  echoCancellation: { exact: false },
  noiseSuppression: { exact: false },
  autoGainControl: { exact: false },
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

const EARPIECE_REGEX = /earpiece|loa thoại|loa trong|receiver/i;
const SPEAKERPHONE_REGEX = /speakerphone|loa ngoài|speaker/i;
const HEADPHONE_REGEX = /headset|headphone|bluetooth|earphone|airpods|buds|usb|tai nghe|wired|hands-free/i;

// Global registries of all hardware MediaStreams and AudioContexts
const activeHardwareStreams = new Set<MediaStream>();
const activeCaptureContexts = new Set<AudioContext>();
const activePlaybackContexts = new Set<AudioContext>();

export function registerPlaybackAudioContext(ctx: AudioContext) {
  activePlaybackContexts.add(ctx);
  // Immediately apply current output sinkId if supported
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
        (d) => SPEAKERPHONE_REGEX.test(d.label) && !EARPIECE_REGEX.test(d.label)
      );
      if (spkOut && spkOut.deviceId !== 'default') {
        await (ctx as any).setSinkId(spkOut.deviceId);
        return;
      }
    }

    // Default system speaker sink ('')
    await (ctx as any).setSinkId('');
  } catch (e) {
    // Browser or OS does not support custom sinkId on AudioContext
  }
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

  // 1. Update all WebAudio playback contexts
  for (const ctx of Array.from(activePlaybackContexts)) {
    if (ctx.state === 'closed') {
      activePlaybackContexts.delete(ctx);
      continue;
    }
    await applySinkToContext(ctx, route, targetOutputId, outputDevices);
  }

  // 2. Update any HTML <audio> / <video> elements in the page
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

// Automatically release all hardware mic streams when user exits tab, refreshes, or closes browser
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
 * Selects the optimal hardware deviceId so Android Chrome NEVER picks DEVICE_EARPIECE ("Loa trong").
 * - In Chromium Android (AudioManagerAndroid.java), `deviceId: "default"` calls `selectDefaultDevice()`
 *   which prefers `DEVICE_EARPIECE` over `DEVICE_SPEAKERPHONE`!
 * - By explicitly picking the "Speakerphone" ("Loa ngoài") deviceId when outputRoute === 'speaker',
 *   Chromium calls `AudioManager.setSpeakerphoneOn(true)` at the OS level!
 */
async function resolveOptimalInputDeviceId(
  requestedDeviceId?: string,
  outputRoute: 'speaker' | 'headphone' = 'speaker'
): Promise<string | undefined> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return requestedDeviceId;
    const all = await navigator.mediaDevices.enumerateDevices();
    const inputs = all.filter((d) => d.kind === 'audioinput' && !EARPIECE_REGEX.test(d.label));

    // If user explicitly picked a specific non-default, non-earpiece device in settings, honor it
    if (requestedDeviceId && requestedDeviceId !== 'default') {
      const matched = inputs.find((d) => d.deviceId === requestedDeviceId);
      if (matched) return matched.deviceId;
    }

    if (outputRoute === 'headphone') {
      const headphoneInput = inputs.find((d) => HEADPHONE_REGEX.test(d.label));
      if (headphoneInput) return headphoneInput.deviceId;
    }

    // Default or fallback: ALWAYS prefer "Speakerphone" ("Loa ngoài") on Android so OS forces setSpeakerphoneOn(true)
    const speakerphoneInput = inputs.find(
      (d) => SPEAKERPHONE_REGEX.test(d.label) || d.deviceId === 'speakerphone'
    );
    if (speakerphoneInput) {
      return speakerphoneInput.deviceId;
    }

    return requestedDeviceId && requestedDeviceId !== 'default' ? requestedDeviceId : undefined;
  } catch (e) {
    return requestedDeviceId && requestedDeviceId !== 'default' ? requestedDeviceId : undefined;
  }
}

async function openRawStreamWithDevice(
  targetDeviceId: string | undefined,
  mode: 'raw' | 'standard'
): Promise<MediaStream | null> {
  const targetConstraints = mode === 'raw' ? RAW_CONSTRAINTS : STANDARD_CONSTRAINTS;

  // Stage 1: Strict NO_EFFECTS (`exact: false`) so Chromium never calls SetCommunicationAudioModeOn(true)
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        ...targetConstraints,
        deviceId: targetDeviceId ? { exact: targetDeviceId } : undefined,
      },
      video: false,
    });
  } catch (err1) {
    // Stage 2: Mobile RAW Media constraints with ideal deviceId and boolean false
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          ...STANDARD_CONSTRAINTS,
          deviceId: targetDeviceId ? { ideal: targetDeviceId } : undefined,
        },
        video: false,
      });
    } catch (err2) {
      // Stage 3: Bare audio constraint with immediate constraint disable
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });
        return s;
      } catch (err3) {
        return null;
      }
    }
  }
}

/**
 * Acquires a microphone MediaStream while locking audio output to Loudspeaker ("Loa ngoài")
 * or Headphones ("Tai nghe"), preventing Android/iOS from ever routing to the Earpiece ("Loa trong").
 */
export async function acquireMicStream(
  deviceId?: string,
  customMode?: 'raw' | 'standard'
): Promise<MediaStream | null> {
  const state = useAudioStore.getState();
  const mode = customMode || state.audioMode;
  const outputRoute = state.outputRoute || 'speaker';

  const initialTargetId = await resolveOptimalInputDeviceId(
    deviceId || state.selectedDeviceId,
    outputRoute
  );

  let stream = await openRawStreamWithDevice(initialTargetId, mode);
  if (!stream) {
    alert(
      'Không thể kết nối Micro!\nVui lòng kiểm tra quyền truy cập Micro trên trình duyệt (bấm vào biểu tượng ổ khoá trên thanh địa chỉ và chọn Cho Phép Micro).'
    );
    return null;
  }

  // Now that getUserMedia permission is granted, device labels are unlocked!
  // Re-check if Android Chrome accidentally picked "Earpiece" or "Default" instead of "Speakerphone" / "Headset".
  try {
    const optimalAfterGrant = await resolveOptimalInputDeviceId(
      deviceId || state.selectedDeviceId,
      outputRoute
    );
    const currentTrack = stream.getAudioTracks()[0];
    const currentSettingsId = currentTrack?.getSettings()?.deviceId;
    const currentLabel = currentTrack?.label || '';

    const isCurrentlyEarpiece = EARPIECE_REGEX.test(currentLabel);
    const needsSwitchToOptimal =
      optimalAfterGrant &&
      optimalAfterGrant !== 'default' &&
      optimalAfterGrant !== currentSettingsId;

    if (isCurrentlyEarpiece || needsSwitchToOptimal) {
      const betterStream = await openRawStreamWithDevice(optimalAfterGrant, mode);
      if (betterStream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = betterStream;
      }
    }
  } catch (e) {}

  activeHardwareStreams.add(stream);

  const track = stream.getAudioTracks()[0];
  const actual = track ? track.getSettings() : ({} as any);
  const { result, warnings } = checkConstraints(actual);
  useAudioStore.getState().setActual(result, warnings);

  // Re-assert output sink routing (Loudspeaker or Headphone)
  await applyAudioOutputRoute(outputRoute);

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

      // Filter out "Earpiece" ("Loa thoại" / "Loa trong") so it can NEVER be selected
      const audioInputs = devices
        .filter((d) => d.kind === 'audioinput' && !EARPIECE_REGEX.test(d.label))
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label
            ? d.label.replace(/^Speakerphone$/i, '🔊 Loa Ngoài (Speakerphone)')
            : `Micro ${d.deviceId.slice(0, 6)}`,
        }));

      const audioOutputs = devices
        .filter((d) => d.kind === 'audiooutput' && !EARPIECE_REGEX.test(d.label))
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
        activeCaptureContexts.add(ctx);
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
