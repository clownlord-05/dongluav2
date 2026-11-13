import { useEffect, useRef, useCallback } from 'react';
import { useRoomStore } from '../store/roomStore';
import { useAuthStore } from '../store/authStore';
import { useAudioStore } from '../store/audioStore';
import type { Socket } from 'socket.io-client';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 2,
};

/**
 * Injects Opus ultra-low-latency and studio-quality parameters into SDP:
 * - minptime=10 / ptime=10: 10ms packet duration (cuts packetization delay in half)
 * - maxaveragebitrate=128000: 128 kbps full-fidelity audio
 * - stereo=1, sprop-stereo=1: Uncompressed stereo soundstage
 * - cbr=1: Constant bitrate to eliminate voice cutoffs/artifacts
 * - maxplaybackrate=48000: 48kHz studio audio rate
 */
function tuneOpusSDP(sdp: string): string {
  const lines = sdp.split('\r\n');
  let opusPt: string | null = null;
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) {
      opusPt = match[1];
      break;
    }
  }
  if (!opusPt) return sdp;

  const customParams: Record<string, string> = {
    minptime: '10',
    ptime: '10',
    maxaveragebitrate: '128000',
    stereo: '1',
    'sprop-stereo': '1',
    cbr: '1',
    maxplaybackrate: '48000',
    useinbandfec: '1',
  };

  let fmtpFound = false;
  const newLines = lines.map((line) => {
    if (line.startsWith(`a=fmtp:${opusPt} `) || line === `a=fmtp:${opusPt}`) {
      fmtpFound = true;
      const existingParamsStr = line.replace(`a=fmtp:${opusPt}`, '').trim();
      const existingPairs = existingParamsStr.split(';').map((s) => s.trim()).filter(Boolean);
      const map = new Map<string, string>();
      for (const pair of existingPairs) {
        const [k, v] = pair.split('=');
        if (k) map.set(k.trim(), (v || '').trim());
      }
      for (const [k, v] of Object.entries(customParams)) {
        map.set(k, v);
      }
      const merged = Array.from(map.entries())
        .map(([k, v]) => (v ? `${k}=${v}` : k))
        .join(';');
      return `a=fmtp:${opusPt} ${merged}`;
    }
    return line;
  });

  if (!fmtpFound) {
    const idx = newLines.findIndex((l) => l.startsWith(`a=rtpmap:${opusPt}`));
    if (idx !== -1) {
      const params = Object.entries(customParams)
        .map(([k, v]) => `${k}=${v}`)
        .join(';');
      newLines.splice(idx + 1, 0, `a=fmtp:${opusPt} ${params}`);
    }
  }

  return newLines.join('\r\n');
}

const MAX_P2P_PEERS = 8;

// Off-main-thread AudioWorklet code for 24kHz low-latency PCM broadcast to 200+ audience members
const WORKLET_CODE = `
class DongLuaMicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(720); // 30ms at 24kHz (1440 bytes/packet)
    this.writeIndex = 0;
    this.sumSq = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];
    const len = ch.length;
    // Downsample 48kHz -> 24kHz (2:1 decimation with 2-sample average)
    for (let i = 0; i < len; i += 2) {
      const s = (ch[i] + (ch[i + 1] !== undefined ? ch[i + 1] : ch[i])) * 0.5;
      const clamped = s < -1 ? -1 : s > 1 ? 1 : s;
      this.sumSq += clamped * clamped;
      this.buffer[this.writeIndex++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
      if (this.writeIndex >= 720) {
        const rms = Math.sqrt(this.sumSq / 720);
        // Built-in silence gate: only transmit when vocal/sound energy is above noise floor
        if (rms > 0.0005) {
          const out = new Int16Array(this.buffer);
          this.port.postMessage(out.buffer, [out.buffer]);
        }
        this.writeIndex = 0;
        this.sumSq = 0;
      }
    }
    return true;
  }
}
registerProcessor('donglua-mic-processor', DongLuaMicProcessor);
`;

let workletBlobUrl: string | null = null;
function getWorkletUrl(): string {
  if (!workletBlobUrl) {
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    workletBlobUrl = URL.createObjectURL(blob);
  }
  return workletBlobUrl;
}

interface RemoteAudioNode {
  audioElement: HTMLAudioElement;
  sourceNode?: MediaStreamAudioSourceNode;
  gainNode?: GainNode;
  stream: MediaStream;
}

export function useWebRTCAudio(socket: Socket | null, roomId: string | undefined) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const members = useRoomStore((s) => s.members);
  const stream = useAudioStore((s) => s.stream);
  const isMuted = useAudioStore((s) => s.isMuted);
  const userVolumes = useAudioStore((s) => s.userVolumes);
  const userMutes = useAudioStore((s) => s.userMutes);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const connectedPeers = useRef<Set<string>>(new Set());
  const remoteNodes = useRef<Map<string, RemoteAudioNode>>(new Map());
  const relayGainNodes = useRef<Map<string, GainNode>>(new Map());
  const nextPlayTimeMap = useRef<Map<string, number>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletLoadedRef = useRef<boolean>(false);

  // Initialize shared AudioContext for low-latency playback & volume processing
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new CtxClass({
        latencyHint: 'interactive',
        sampleRate: 48000,
      });
      workletLoadedRef.current = false;
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Clean up a specific remote peer's connection and audio nodes
  const cleanupPeer = useCallback((userId: string) => {
    connectedPeers.current.delete(userId);
    nextPlayTimeMap.current.delete(userId);

    const pc = peerConnections.current.get(userId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(userId);
    }

    const node = remoteNodes.current.get(userId);
    if (node) {
      node.audioElement.pause();
      node.audioElement.srcObject = null;
      try {
        node.sourceNode?.disconnect();
        node.gainNode?.disconnect();
      } catch (e) {
        // Ignored
      }
      remoteNodes.current.delete(userId);
    }

    const relayGain = relayGainNodes.current.get(userId);
    if (relayGain) {
      try {
        relayGain.disconnect();
      } catch (e) {}
      relayGainNodes.current.delete(userId);
    }
  }, []);

  // Clean up all peer connections
  const cleanupAllPeers = useCallback(() => {
    for (const userId of Array.from(peerConnections.current.keys())) {
      cleanupPeer(userId);
    }
    for (const userId of Array.from(relayGainNodes.current.keys())) {
      cleanupPeer(userId);
    }
    connectedPeers.current.clear();
    nextPlayTimeMap.current.clear();
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      workletLoadedRef.current = false;
    }
  }, [cleanupPeer]);

  // Compute combined gain for a remote speaker (User local volume * Host stage gain)
  const computeSpeakerGain = useCallback((speakerId: string) => {
    const { userVolumes: curVolumes, userMutes: curMutes } = useAudioStore.getState();
    if (curMutes[speakerId]) return 0;
    const localVol = (curVolumes[speakerId] ?? 100) / 100;
    const member = useRoomStore.getState().members.find((m) => m.user_id === speakerId);
    const hostGain = member?.gain ?? 1.0;
    return localVol * hostGain;
  }, []);

  // Attach and play remote audio with volume boost
  const handleRemoteStream = useCallback(
    (fromUserId: string, remoteStream: MediaStream) => {
      try {
        const ctx = getAudioContext();
        let node = remoteNodes.current.get(fromUserId);

        if (!node) {
          const audioEl = new Audio();
          audioEl.autoplay = true;
          (audioEl as any).playsInline = true;
          audioEl.srcObject = remoteStream;

          let sourceNode: MediaStreamAudioSourceNode | undefined;
          let gainNode: GainNode | undefined;

          try {
            sourceNode = ctx.createMediaStreamSource(remoteStream);
            gainNode = ctx.createGain();

            sourceNode.connect(gainNode);
            gainNode.connect(ctx.destination);

            // Mute audioEl if Web Audio destination is playing to avoid duplicate sound
            audioEl.muted = true;
          } catch (e) {
            console.warn('[WebRTC] WebAudio routing fallback to HTMLAudioElement:', e);
            audioEl.muted = false;
          }

          node = {
            audioElement: audioEl,
            sourceNode,
            gainNode,
            stream: remoteStream,
          };
          remoteNodes.current.set(fromUserId, node);
        } else {
          node.stream = remoteStream;
          node.audioElement.srcObject = remoteStream;
        }

        const gainValue = computeSpeakerGain(fromUserId);
        if (node.gainNode) {
          node.gainNode.gain.value = gainValue;
        }
        if (!node.audioElement.muted) {
          node.audioElement.volume = Math.min(1.0, gainValue);
        }

        node.audioElement.play().catch(() => {
          // Autoplay policy: will resume on first user interaction
        });
      } catch (err) {
        console.error('[WebRTC] Failed to handle remote stream:', err);
      }
    },
    [getAudioContext, computeSpeakerGain]
  );

  // Update volume & mute for remote peers dynamically (both P2P and Relay nodes)
  useEffect(() => {
    remoteNodes.current.forEach((node, userId) => {
      const gainValue = computeSpeakerGain(userId);
      if (node.gainNode) {
        node.gainNode.gain.value = gainValue;
      }
      if (!node.audioElement.muted) {
        node.audioElement.volume = Math.min(1.0, gainValue);
      }
    });
    relayGainNodes.current.forEach((gainNode, userId) => {
      gainNode.gain.value = computeSpeakerGain(userId);
    });
  }, [userVolumes, userMutes, members, computeSpeakerGain]);

  // Bind connection state tracker so relay seamlessly covers until P2P is genuinely connected
  const attachConnectionStateTracker = useCallback((peerId: string, pc: RTCPeerConnection) => {
    const updateState = () => {
      const state = pc.connectionState;
      const ice = pc.iceConnectionState;
      if (state === 'connected' || ice === 'connected' || ice === 'completed') {
        connectedPeers.current.add(peerId);
      } else if (
        state === 'disconnected' ||
        state === 'failed' ||
        state === 'closed' ||
        ice === 'disconnected' ||
        ice === 'failed' ||
        ice === 'closed'
      ) {
        connectedPeers.current.delete(peerId);
      }
    };
    pc.onconnectionstatechange = updateState;
    pc.oniceconnectionstatechange = updateState;
  }, []);

  // Initiate a WebRTC connection offer to a target peer
  const createAndSendOffer = useCallback(
    async (targetUserId: string) => {
      if (!socket || !stream || targetUserId === currentUserId) return;

      try {
        let pc = peerConnections.current.get(targetUserId);
        if (pc) {
          pc.close();
        }
        connectedPeers.current.delete(targetUserId);

        pc = new RTCPeerConnection(RTC_CONFIG);
        peerConnections.current.set(targetUserId, pc);
        attachConnectionStateTracker(targetUserId, pc);

        const curMuted = useAudioStore.getState().isMuted;
        // Add local raw audio tracks to peer connection
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !curMuted;
          pc!.addTrack(track, stream);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate && socket) {
            socket.emit('signal:ice', {
              toUserId: targetUserId,
              candidate: event.candidate,
            });
          }
        };

        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
          voiceActivityDetection: false,
        } as any);

        offer.sdp = tuneOpusSDP(offer.sdp || '');
        await pc.setLocalDescription(offer);

        socket.emit('signal:offer', {
          toUserId: targetUserId,
          offer: pc.localDescription,
        });
      } catch (err) {
        console.error(`[WebRTC] Failed to create offer to ${targetUserId}:`, err);
      }
    },
    [socket, stream, currentUserId, attachConnectionStateTracker]
  );

  // Update track enabled state when local mic is muted/unmuted
  useEffect(() => {
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted, stream]);

  // Main Socket.IO signaling event listeners
  useEffect(() => {
    if (!socket || !roomId) return;

    // Handle incoming offer from a speaker
    const handleOffer = async ({
      fromUserId,
      offer,
    }: {
      from: string;
      fromUserId?: string;
      offer: any;
    }) => {
      if (!fromUserId || fromUserId === currentUserId) return;

      try {
        let pc = peerConnections.current.get(fromUserId);
        if (pc) {
          pc.close();
        }
        connectedPeers.current.delete(fromUserId);

        pc = new RTCPeerConnection(RTC_CONFIG);
        peerConnections.current.set(fromUserId, pc);
        attachConnectionStateTracker(fromUserId, pc);

        pc.ontrack = (event) => {
          connectedPeers.current.add(fromUserId);
          // Zero jitter buffer playout hint
          if (event.receiver) {
            if ('playoutDelayHint' in event.receiver) {
              event.receiver.playoutDelayHint = 0;
            }
            if ('jitterBufferTarget' in event.receiver) {
              (event.receiver as any).jitterBufferTarget = 0;
            }
          }
          const remoteStream = event.streams[0] || new MediaStream([event.track]);
          handleRemoteStream(fromUserId, remoteStream);
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('signal:ice', {
              toUserId: fromUserId,
              candidate: event.candidate,
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        answer.sdp = tuneOpusSDP(answer.sdp || '');
        await pc.setLocalDescription(answer);

        socket.emit('signal:answer', {
          toUserId: fromUserId,
          answer: pc.localDescription,
        });
      } catch (err) {
        console.error(`[WebRTC] Error handling offer from ${fromUserId}:`, err);
      }
    };

    // Handle incoming answer from peer
    const handleAnswer = async ({
      fromUserId,
      answer,
    }: {
      from: string;
      fromUserId?: string;
      answer: any;
    }) => {
      if (!fromUserId) return;
      const pc = peerConnections.current.get(fromUserId);
      if (pc && pc.signalingState !== 'closed') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error(`[WebRTC] Error setting remote description from ${fromUserId}:`, err);
        }
      }
    };

    // Handle incoming ICE candidate
    const handleIce = async ({
      fromUserId,
      candidate,
    }: {
      from: string;
      fromUserId?: string;
      candidate: any;
    }) => {
      if (!fromUserId || !candidate) return;
      const pc = peerConnections.current.get(fromUserId);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error(`[WebRTC] Error adding ICE candidate from ${fromUserId}:`, err);
        }
      }
    };

    // Cap direct P2P offers to MAX_P2P_PEERS (prioritizing stage speakers) so 200 audience members never overload the singer
    const handleRequest = ({ fromUserId }: { from: string; fromUserId?: string }) => {
      if (!fromUserId || fromUserId === currentUserId || !stream) return;
      const requester = useRoomStore.getState().members.find((m) => m.user_id === fromUserId);
      const isStagePeer =
        requester?.role === 'OWNER' ||
        requester?.role === 'SPEAKER' ||
        requester?.role === 'MODERATOR';
      if (isStagePeer || peerConnections.current.size < MAX_P2P_PEERS) {
        createAndSendOffer(fromUserId);
      }
    };

    // When a speaker stops singing or leaves stage
    const handleStop = ({ fromUserId }: { fromUserId: string }) => {
      if (fromUserId) {
        cleanupPeer(fromUserId);
      }
    };

    // Zero-leak, ultra-low-latency 24kHz PCM receiver for 200+ audience members & 4G NAT fallback
    const handleRelayChunk = ({
      speakerId,
      chunk,
    }: {
      speakerId: string;
      chunk: ArrayBuffer;
    }) => {
      // Only skip relay if direct WebRTC P2P is genuinely connected & active
      if (!speakerId || speakerId === currentUserId || connectedPeers.current.has(speakerId)) {
        return;
      }

      try {
        const gainVal = computeSpeakerGain(speakerId);
        if (gainVal <= 0.001) return;

        const ctx = getAudioContext();
        const pcm16 = new Int16Array(chunk);
        if (pcm16.length === 0) return;

        const buffer = ctx.createBuffer(1, pcm16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < pcm16.length; i++) {
          channelData[i] = pcm16[i] / 32768.0;
        }

        // Reuse ONE single persistent GainNode per speaker (prevents WebAudio graph memory leaks!)
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
        // Strict per-speaker anti-drift (<55ms max buffer window)
        if (nextTime < now) {
          nextTime = now + 0.012;
        } else if (nextTime - now > 0.055) {
          nextTime = now + 0.015;
        }
        source.start(nextTime);
        nextPlayTimeMap.current.set(speakerId, nextTime + buffer.duration);
      } catch (e) {
        // Ignored
      }
    };

    socket.on('signal:offer', handleOffer);
    socket.on('signal:answer', handleAnswer);
    socket.on('signal:ice', handleIce);
    socket.on('signal:request', handleRequest);
    socket.on('signal:stop', handleStop);
    socket.on('audio:relay_chunk', handleRelayChunk);

    // Announce to active speakers that we are ready to receive audio streams
    socket.emit('signal:request', { roomId, room_id: roomId });

    return () => {
      socket.off('signal:offer', handleOffer);
      socket.off('signal:answer', handleAnswer);
      socket.off('signal:ice', handleIce);
      socket.off('signal:request', handleRequest);
      socket.off('signal:stop', handleStop);
      socket.off('audio:relay_chunk', handleRelayChunk);
    };
  }, [
    socket,
    roomId,
    currentUserId,
    stream,
    createAndSendOffer,
    cleanupPeer,
    handleRemoteStream,
    attachConnectionStateTracker,
    computeSpeakerGain,
    getAudioContext,
  ]);

  // 1. Stream lifecycle: P2P Offers (prioritizing stage peers, capped at MAX_P2P_PEERS) + Off-Main-Thread AudioWorklet Broadcast for 200+ Audience
  useEffect(() => {
    if (!socket || !roomId || !stream) return;

    const allPeers = useRoomStore.getState().members.filter((m) => m.user_id !== currentUserId);
    // Prioritize OWNER, SPEAKER, MODERATOR first for direct P2P
    const sortedPeers = [...allPeers].sort((a, b) => {
      const score = (r: string) => (r === 'OWNER' || r === 'SPEAKER' ? 0 : r === 'MODERATOR' ? 1 : 2);
      return score(a.role) - score(b.role);
    });
    sortedPeers.slice(0, MAX_P2P_PEERS).forEach((m) => {
      createAndSendOffer(m.user_id);
    });

    // Off-main-thread AudioWorklet broadcaster for the 200+ audience
    let cancelled = false;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let workletNode: AudioWorkletNode | null = null;
    let silentGain: GainNode | null = null;

    const setupWorkletBroadcaster = async () => {
      try {
        const ctx = getAudioContext();
        if (ctx.audioWorklet && !workletLoadedRef.current) {
          await ctx.audioWorklet.addModule(getWorkletUrl());
          workletLoadedRef.current = true;
        }
        if (cancelled || !ctx.audioWorklet) return;

        sourceNode = ctx.createMediaStreamSource(stream);
        workletNode = new AudioWorkletNode(ctx, 'donglua-mic-processor');
        workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
          if (useAudioStore.getState().isMuted) return;
          socket.volatile.emit('audio:relay_chunk', {
            roomId,
            chunk: event.data,
          });
        };

        silentGain = ctx.createGain();
        silentGain.gain.value = 0;
        sourceNode.connect(workletNode);
        workletNode.connect(silentGain);
        silentGain.connect(ctx.destination);
      } catch (err) {
        console.warn('[WebRTC] AudioWorklet broadcaster fallback:', err);
      }
    };

    setupWorkletBroadcaster();

    return () => {
      cancelled = true;
      try {
        workletNode?.port.close();
        workletNode?.disconnect();
        sourceNode?.disconnect();
        silentGain?.disconnect();
      } catch (e) {}
      socket.emit('signal:stop', { roomId, room_id: roomId });
    };
  }, [stream, socket, roomId, currentUserId, createAndSendOffer, getAudioContext]);

  // 2. Members diff: Connect P2P to new Stage Peers (or up to MAX_P2P_PEERS) without touching existing connections
  useEffect(() => {
    if (!socket || !roomId || !stream) return;

    const allPeers = members.filter((m) => m.user_id !== currentUserId);
    for (const m of allPeers) {
      const isStagePeer = m.role === 'OWNER' || m.role === 'SPEAKER' || m.role === 'MODERATOR';
      if (!isStagePeer && peerConnections.current.size >= MAX_P2P_PEERS) continue;

      const existingPc = peerConnections.current.get(m.user_id);
      if (
        !existingPc ||
        existingPc.connectionState === 'closed' ||
        existingPc.connectionState === 'failed'
      ) {
        createAndSendOffer(m.user_id);
      }
    }
  }, [members, stream, socket, roomId, currentUserId, createAndSendOffer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAllPeers();
    };
  }, [cleanupAllPeers]);

  return {
    cleanupAllPeers,
    createAndSendOffer,
  };
}
