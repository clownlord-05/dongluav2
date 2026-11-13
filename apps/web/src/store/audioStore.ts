import { create } from 'zustand';
import type { AudioDeviceInfo, AudioConstraintsActual } from '../types';

interface AudioStore {
  selectedDeviceId: string;
  devices: AudioDeviceInfo[];
  isMuted: boolean;
  gain: number; // 0.0 - 2.0
  stream: MediaStream | null;
  actual: AudioConstraintsActual | null;
  constraintWarnings: string[];
  isConnected: boolean; // LiveKit connected as speaker
  audioMode: 'raw' | 'standard'; // 'raw' studio uncompressed or 'standard' browser filtered

  // Discord-style local user audio settings
  userVolumes: Record<string, number>; // userId -> percentage (0 - 200, default 100)
  userMutes: Record<string, boolean>; // userId -> boolean (true = muted locally)
  userMuteEffects: Record<string, boolean>; // userId -> boolean (true = mute cheer sound effects)
  userDisabledVideo: Record<string, boolean>; // userId -> boolean

  // Beat synchronization offset (in milliseconds: -500 to +500)
  beatSyncOffsetMs: number;
  // Remote users' live mic levels (0-100) for real-time visualizer
  remoteAudioLevels: Record<string, number>;

  setDevices: (devices: AudioDeviceInfo[]) => void;
  setSelectedDevice: (deviceId: string) => void;
  setMuted: (muted: boolean) => void;
  setGain: (gain: number) => void;
  setStream: (stream: MediaStream | null) => void;
  setActual: (actual: AudioConstraintsActual | null, warnings: string[]) => void;
  setConnected: (connected: boolean) => void;
  setAudioMode: (mode: 'raw' | 'standard') => void;
  setBeatSyncOffsetMs: (offset: number) => void;
  setRemoteAudioLevel: (userId: string, level: number) => void;

  setUserVolume: (userId: string, volume: number) => void;
  setUserMute: (userId: string, muted: boolean) => void;
  setUserMuteEffects: (userId: string, muted: boolean) => void;
  setUserDisabledVideo: (userId: string, disabled: boolean) => void;
}

export const useAudioStore = create<AudioStore>((set) => ({
  selectedDeviceId: 'default',
  devices: [],
  isMuted: false,
  gain: 1.0,
  stream: null,
  actual: null,
  constraintWarnings: [],
  isConnected: false,
  audioMode: 'raw',
  beatSyncOffsetMs: 0,
  remoteAudioLevels: {},

  userVolumes: {},
  userMutes: {},
  userMuteEffects: {},
  userDisabledVideo: {},

  setDevices: (devices) => set({ devices }),
  setSelectedDevice: (selectedDeviceId) => set({ selectedDeviceId }),
  setMuted: (isMuted) => set({ isMuted }),
  setGain: (gain) => set({ gain }),
  setStream: (stream) => set({ stream }),
  setActual: (actual, constraintWarnings) => set({ actual, constraintWarnings }),
  setConnected: (isConnected) => set({ isConnected }),
  setAudioMode: (audioMode) => set({ audioMode }),
  setBeatSyncOffsetMs: (beatSyncOffsetMs) => set({ beatSyncOffsetMs }),
  setRemoteAudioLevel: (userId, level) =>
    set((s) => ({ remoteAudioLevels: { ...s.remoteAudioLevels, [userId]: level } })),

  setUserVolume: (userId, volume) =>
    set((s) => ({ userVolumes: { ...s.userVolumes, [userId]: volume } })),
  setUserMute: (userId, muted) =>
    set((s) => ({ userMutes: { ...s.userMutes, [userId]: muted } })),
  setUserMuteEffects: (userId, muted) =>
    set((s) => ({ userMuteEffects: { ...s.userMuteEffects, [userId]: muted } })),
  setUserDisabledVideo: (userId, disabled) =>
    set((s) => ({ userDisabledVideo: { ...s.userDisabledVideo, [userId]: disabled } })),
}));
