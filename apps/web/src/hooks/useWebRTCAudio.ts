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

interface RemoteAudioNode {
  audioElement: HTMLAudioElement;
  sourceNode?: MediaStreamAudioSourceNode;
  gainNode?: GainNode;
  analyserNode?: AnalyserNode;
  stream: MediaStream;
}

export function useWebRTCAudio(socket: Socket | null, roomId: string | undefined) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const members = useRoomStore((s) => s.members);
  const stream = useAudioStore((s) => s.stream);
  const isMuted = useAudioStore((s) => s.isMuted);
  const userVolumes = useAudioStore((s) => s.userVolumes);
  const userMutes = useAudioStore((s) => s.userMutes);
  const setRemoteAudioLevel = useAudioStore((s) => s.setRemoteAudioLevel);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteNodes = useRef<Map<string, RemoteAudioNode>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  // Initialize shared AudioContext for low-latency playback & volume processing
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new CtxClass({
        latencyHint: 'interactive',
        sampleRate: 48000,
      });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Clean up a specific remote peer's connection and audio nodes
  const cleanupPeer = useCallback((userId: string) => {
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
        node.analyserNode?.disconnect();
      } catch (e) {
        // Ignored
      }
      remoteNodes.current.delete(userId);
    }
    setRemoteAudioLevel(userId, 0);
  }, [setRemoteAudioLevel]);

  // Clean up all peer connections
  const cleanupAllPeers = useCallback(() => {
    for (const userId of peerConnections.current.keys()) {
      cleanupPeer(userId);
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [cleanupPeer]);

  // Attach and play remote audio with volume boost and real-time level analyzer
  const handleRemoteStream = useCallback(
    (fromUserId: string, remoteStream: MediaStream) => {
      try {
        const ctx = getAudioContext();
        let node = remoteNodes.current.get(fromUserId);

        if (!node) {
          const audioEl = new Audio();
          audioEl.autoplay = true;
          audioEl.srcObject = remoteStream;

          let sourceNode: MediaStreamAudioSourceNode | undefined;
          let gainNode: GainNode | undefined;
          let analyserNode: AnalyserNode | undefined;

          try {
            sourceNode = ctx.createMediaStreamSource(remoteStream);
            gainNode = ctx.createGain();
            analyserNode = ctx.createAnalyser();
            analyserNode.fftSize = 128;

            sourceNode.connect(gainNode);
            sourceNode.connect(analyserNode);
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
            analyserNode,
            stream: remoteStream,
          };
          remoteNodes.current.set(fromUserId, node);
        } else {
          node.stream = remoteStream;
          node.audioElement.srcObject = remoteStream;
        }

        // Apply initial volume & mute
        const vol = userVolumes[fromUserId] ?? 100;
        const isUserMuted = userMutes[fromUserId] ?? false;
        const gainValue = isUserMuted ? 0 : vol / 100;
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
    [getAudioContext, userVolumes, userMutes]
  );

  // Update volume & mute for remote peers dynamically
  useEffect(() => {
    remoteNodes.current.forEach((node, userId) => {
      const vol = userVolumes[userId] ?? 100;
      const isUserMuted = userMutes[userId] ?? false;
      const gainValue = isUserMuted ? 0 : vol / 100;

      if (node.gainNode) {
        node.gainNode.gain.value = gainValue;
      }
      if (!node.audioElement.muted) {
        node.audioElement.volume = Math.min(1.0, gainValue);
      }
    });
  }, [userVolumes, userMutes]);

  // Lightweight 120ms interval to measure remote speakers' RMS levels (0-100) without 60fps store churn
  useEffect(() => {
    const dataArray = new Uint8Array(64);
    const interval = setInterval(() => {
      if (remoteNodes.current.size === 0) return;
      remoteNodes.current.forEach((node, userId) => {
        if (node.analyserNode) {
          node.analyserNode.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setRemoteAudioLevel(userId, level);
        }
      });
    }, 120);

    return () => {
      clearInterval(interval);
    };
  }, [setRemoteAudioLevel]);

  // Initiate a WebRTC connection offer to a target peer
  const createAndSendOffer = useCallback(
    async (targetUserId: string) => {
      if (!socket || !stream || targetUserId === currentUserId) return;

      try {
        let pc = peerConnections.current.get(targetUserId);
        if (pc) {
          pc.close();
        }

        pc = new RTCPeerConnection(RTC_CONFIG);
        peerConnections.current.set(targetUserId, pc);

        // Add local raw audio tracks to peer connection
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !isMuted;
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
    [socket, stream, currentUserId, isMuted]
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

        pc = new RTCPeerConnection(RTC_CONFIG);
        peerConnections.current.set(fromUserId, pc);

        pc.ontrack = (event) => {
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

    // When another peer requests active streams, send them an offer if we have an active stream
    const handleRequest = ({ fromUserId }: { from: string; fromUserId?: string }) => {
      if (fromUserId && fromUserId !== currentUserId && stream) {
        createAndSendOffer(fromUserId);
      }
    };

    // When a speaker stops singing or leaves stage
    const handleStop = ({ fromUserId }: { fromUserId: string }) => {
      if (fromUserId) {
        cleanupPeer(fromUserId);
      }
    };

    // Relay Audio Chunk listener for 5,000 audience members not on direct P2P mesh
    const handleRelayChunk = ({
      speakerId,
      chunk,
    }: {
      speakerId: string;
      chunk: ArrayBuffer;
    }) => {
      if (peerConnections.current.has(speakerId) || speakerId === currentUserId) return;

      try {
        const ctx = getAudioContext();
        const pcm16 = new Int16Array(chunk);
        if (pcm16.length === 0) return;

        const buffer = ctx.createBuffer(1, pcm16.length, 48000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < pcm16.length; i++) {
          channelData[i] = pcm16[i] / 32768.0;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Apply Discord style per-user volume & mute
        const vol = userVolumes[speakerId] ?? 100;
        const isUserMuted = userMutes[speakerId] ?? false;
        const gainNode = ctx.createGain();
        gainNode.gain.value = isUserMuted ? 0 : vol / 100;

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        const now = ctx.currentTime;
        // Strict anti-drift: If scheduled playback drifted >80ms ahead of real time,
        // immediately reset to now to eliminate all accumulated network delay!
        if (nextPlayTimeRef.current < now || nextPlayTimeRef.current - now > 0.08) {
          nextPlayTimeRef.current = now;
        }
        source.start(nextPlayTimeRef.current);
        nextPlayTimeRef.current += buffer.duration;
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

    // Announce to the room that we are ready to receive audio streams
    socket.emit('signal:request', { roomId, room_id: roomId });

    return () => {
      socket.off('signal:offer', handleOffer);
      socket.off('signal:answer', handleAnswer);
      socket.off('signal:ice', handleIce);
      socket.off('signal:request', handleRequest);
      socket.off('signal:stop', handleStop);
      socket.off('audio:relay_chunk', handleRelayChunk);
    };
  }, [socket, roomId, currentUserId, stream, createAndSendOffer, cleanupPeer, handleRemoteStream]);

  // Stage Performer publisher: P2P Mesh for performers + Binary PCM Relay for 5,000 Audience
  useEffect(() => {
    if (!socket || !stream || !roomId) return;

    // 1. Direct WebRTC P2P Mesh for ALL active room members (up to 25 peers)
    // Direct UDP peer connection achieves 10ms-30ms ultra-low latency without server bottlenecks
    const activePeers = members.filter((m) => m.user_id !== currentUserId);
    activePeers.slice(0, 25).forEach((m) => {
      createAndSendOffer(m.user_id);
    });

    // 2. High-speed Audio Relay Publisher for the entire 5,000 Audience
    let processorNode: ScriptProcessorNode | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let silentGain: GainNode | null = null;

    try {
      const ctx = getAudioContext();
      sourceNode = ctx.createMediaStreamSource(stream);
      processorNode = ctx.createScriptProcessor(2048, 1, 1);

      processorNode.onaudioprocess = (e) => {
        if (useAudioStore.getState().isMuted) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        socket.emit('audio:relay_chunk', { roomId, chunk: pcm16.buffer });
      };

      silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      sourceNode.connect(processorNode);
      processorNode.connect(silentGain);
      silentGain.connect(ctx.destination);
    } catch (e) {
      console.warn('[WebRTC] ScriptProcessor audio relay init error:', e);
    }

    return () => {
      try {
        processorNode?.disconnect();
        sourceNode?.disconnect();
        silentGain?.disconnect();
      } catch (e) {}
      if (socket && roomId) {
        socket.emit('signal:stop', { roomId, room_id: roomId });
      }
    };
  }, [stream, members, currentUserId, socket, roomId, createAndSendOffer, getAudioContext]);

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
