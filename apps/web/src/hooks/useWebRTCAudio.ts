import { useEffect, useRef, useCallback } from 'react';
import { useRoomStore } from '../store/roomStore';
import { useAuthStore } from '../store/authStore';
import { useAudioStore } from '../store/audioStore';
import {
  registerPlaybackAudioContext,
  unregisterPlaybackAudioContext,
  createStudioVocalPreamp,
} from './useAudio';
import type { Socket } from 'socket.io-client';

const WORKLET_CODE = `
class DongLuaStudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 1920 samples at 48kHz = 40ms studio frame (25 frames/sec)
    this.buffer = new Int16Array(1920);
    this.writeIndex = 0;
    this.maxPeak = 0;
    this.hangoverFrames = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];
    const len = ch.length;
    for (let i = 0; i < len; i++) {
      const s = ch[i];
      const abs = s < 0 ? -s : s;
      if (abs > this.maxPeak) this.maxPeak = abs;
      const clamped = s < -1 ? -1 : s > 1 ? 1 : s;
      this.buffer[this.writeIndex++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
      if (this.writeIndex >= 1920) {
        // Ultra-sensitive -85 dBFS threshold + 600ms (15 frames) hangover
        if (this.maxPeak > 0.00005) {
          this.hangoverFrames = 15;
        }
        if (this.hangoverFrames > 0) {
          this.hangoverFrames--;
          const out = new Int16Array(this.buffer);
          this.port.postMessage(out.buffer, [out.buffer]);
        }
        this.writeIndex = 0;
        this.maxPeak = 0;
      }
    }
    return true;
  }
}
registerProcessor('donglua-studio-processor', DongLuaStudioProcessor);
`;

let workletBlobUrl: string | null = null;
function getWorkletUrl(): string {
  if (!workletBlobUrl) {
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    workletBlobUrl = URL.createObjectURL(blob);
  }
  return workletBlobUrl;
}

export function useWebRTCAudio(socket: Socket | null, roomId: string | undefined) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const members = useRoomStore((s) => s.members);
  const stream = useAudioStore((s) => s.stream);
  const isMuted = useAudioStore((s) => s.isMuted);
  const localMicGain = useAudioStore((s) => s.gain);
  const userVolumes = useAudioStore((s) => s.userVolumes);
  const userMutes = useAudioStore((s) => s.userMutes);

  const relayGainNodes = useRef<Map<string, GainNode>>(new Map());
  const nextPlayTimeMap = useRef<Map<string, number>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletLoadedRef = useRef<boolean>(false);
  const vocalPreampRef = useRef<ReturnType<typeof createStudioVocalPreamp> | null>(null);

  // Sync live studio vocal preamp when user adjusts mic gain slider
  useEffect(() => {
    if (vocalPreampRef.current) {
      vocalPreampRef.current.setGain(localMicGain);
    }
  }, [localMicGain]);

  // Initialize shared AudioContext on STREAM_MUSIC (Loudspeaker / Media mode)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new CtxClass({
        latencyHint: 'interactive',
        sampleRate: 48000,
      });
      audioContextRef.current = ctx;
      workletLoadedRef.current = false;
      registerPlaybackAudioContext(ctx);
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Clean up a specific remote speaker's audio node
  const cleanupPeer = useCallback((userId: string) => {
    nextPlayTimeMap.current.delete(userId);
    const relayGain = relayGainNodes.current.get(userId);
    if (relayGain) {
      try {
        relayGain.disconnect();
      } catch (e) {}
      relayGainNodes.current.delete(userId);
    }
  }, []);

  // Clean up all audio nodes
  const cleanupAllPeers = useCallback(() => {
    for (const userId of Array.from(relayGainNodes.current.keys())) {
      cleanupPeer(userId);
    }
    nextPlayTimeMap.current.clear();
    if (audioContextRef.current) {
      unregisterPlaybackAudioContext(audioContextRef.current);
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      workletLoadedRef.current = false;
    }
  }, [cleanupPeer]);

  // Compute combined gain for a remote speaker (User local volume * Host stage gain * 1.6x stage presence)
  const computeSpeakerGain = useCallback((speakerId: string) => {
    const { userVolumes: curVolumes, userMutes: curMutes } = useAudioStore.getState();
    if (curMutes[speakerId]) return 0;
    const localVol = (curVolumes[speakerId] ?? 100) / 100;
    const member = useRoomStore.getState().members.find((m) => m.user_id === speakerId);
    const hostGain = member?.gain ?? 1.0;
    return localVol * hostGain * 1.6;
  }, []);

  // Update volume & mute for remote speakers dynamically
  useEffect(() => {
    relayGainNodes.current.forEach((gainNode, userId) => {
      gainNode.gain.value = computeSpeakerGain(userId);
    });
  }, [userVolumes, userMutes, members, computeSpeakerGain]);

  // Update track enabled state when local mic is muted/unmuted
  useEffect(() => {
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted, stream]);

  // Main Socket.IO audio stream listeners
  useEffect(() => {
    if (!socket || !roomId) return;

    const handleStop = ({ fromUserId }: { fromUserId: string }) => {
      if (fromUserId) {
        cleanupPeer(fromUserId);
      }
    };

    // Full-range 48kHz Studio PCM receiver on STREAM_MUSIC (Loudspeaker, zero YouTube ducking!)
    const handleRelayChunk = ({
      speakerId,
      chunk,
    }: {
      speakerId: string;
      chunk: ArrayBuffer;
    }) => {
      if (!speakerId || speakerId === currentUserId) return;

      try {
        const gainVal = computeSpeakerGain(speakerId);
        if (gainVal <= 0.001) return;

        const ctx = getAudioContext();
        const pcm16 = new Int16Array(chunk);
        if (pcm16.length === 0) return;

        const buffer = ctx.createBuffer(1, pcm16.length, 48000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < pcm16.length; i++) {
          channelData[i] = pcm16[i] / 32768.0;
        }

        // Reuse ONE single persistent GainNode per speaker (0 WebAudio node leaks!)
        let gainNode = relayGainNodes.current.get(speakerId);
        if (!gainNode) {
          gainNode = ctx.createGain();
          gainNode.connect(ctx.destination);
          relayGainNodes.current.set(speakerId, gainNode);
        }
        gainNode.gain.value = gainVal;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gainNode);
        source.onended = () => {
          try {
            source.disconnect();
          } catch (e) {}
        };

        const now = ctx.currentTime;
        let nextTime = nextPlayTimeMap.current.get(speakerId) || 0;
        if (nextTime < now) {
          nextTime = now + 0.012;
        } else if (nextTime - now > 0.09) {
          nextTime = now + 0.015;
        }
        source.start(nextTime);
        nextPlayTimeMap.current.set(speakerId, nextTime + buffer.duration);
      } catch (e) {
        // Ignored
      }
    };

    socket.on('signal:stop', handleStop);
    socket.on('audio:relay_chunk', handleRelayChunk);

    return () => {
      socket.off('signal:stop', handleStop);
      socket.off('audio:relay_chunk', handleRelayChunk);
    };
  }, [socket, roomId, currentUserId, cleanupPeer, computeSpeakerGain, getAudioContext]);

  // Off-Main-Thread 48kHz Studio Broadcaster with Built-In 4.5x Vocal Preamp & Limiter in the SAME AudioContext
  useEffect(() => {
    if (!socket || !roomId || !stream) return;

    let cancelled = false;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let preamp: ReturnType<typeof createStudioVocalPreamp> | null = null;
    let workletNode: AudioWorkletNode | null = null;
    let fallbackProcessor: ScriptProcessorNode | null = null;
    let silentGain: GainNode | null = null;

    const setupBroadcaster = async () => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      sourceNode = ctx.createMediaStreamSource(stream);
      preamp = createStudioVocalPreamp(ctx, useAudioStore.getState().gain ?? 1.0);
      vocalPreampRef.current = preamp;
      sourceNode.connect(preamp.inputNode);

      silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      silentGain.connect(ctx.destination);

      try {
        if (ctx.audioWorklet && !workletLoadedRef.current) {
          await ctx.audioWorklet.addModule(getWorkletUrl());
          workletLoadedRef.current = true;
        }
        if (cancelled) return;

        if (ctx.audioWorklet) {
          workletNode = new AudioWorkletNode(ctx, 'donglua-studio-processor');
          workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            if (useAudioStore.getState().isMuted) return;
            socket.volatile.emit('audio:relay_chunk', {
              roomId,
              chunk: event.data,
            });
          };
          preamp.outputNode.connect(workletNode);
          workletNode.connect(silentGain);
          return;
        }
      } catch (err) {
        console.warn('[Audio] AudioWorklet fallback to ScriptProcessor:', err);
      }

      // Fallback for older webviews without AudioWorklet
      if (!cancelled) {
        fallbackProcessor = ctx.createScriptProcessor(1024, 1, 1);
        fallbackProcessor.onaudioprocess = (e) => {
          if (useAudioStore.getState().isMuted) return;
          const ch = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(ch.length);
          for (let i = 0; i < ch.length; i++) {
            const s = ch[i] < -1 ? -1 : ch[i] > 1 ? 1 : ch[i];
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          socket.volatile.emit('audio:relay_chunk', {
            roomId,
            chunk: pcm16.buffer,
          });
        };
        preamp.outputNode.connect(fallbackProcessor);
        fallbackProcessor.connect(silentGain);
      }
    };

    setupBroadcaster();

    return () => {
      cancelled = true;
      vocalPreampRef.current = null;
      try {
        workletNode?.port.close();
        workletNode?.disconnect();
        fallbackProcessor?.disconnect();
        preamp?.disconnect();
        sourceNode?.disconnect();
        silentGain?.disconnect();
      } catch (e) {}
      socket.emit('signal:stop', { roomId, room_id: roomId });
    };
  }, [stream, socket, roomId, getAudioContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAllPeers();
    };
  }, [cleanupAllPeers]);

  return {
    cleanupAllPeers,
  };
}
