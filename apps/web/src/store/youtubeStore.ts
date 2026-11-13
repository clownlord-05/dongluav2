import { create } from 'zustand';
import type { PlaybackState } from '../types';

interface YouTubeStore {
  videoId: string | null;
  state: PlaybackState;
  position: number;
  duration: number;
  playbackRate: number;
  isBuffering: boolean;
  error: string | null;

  setVideoId: (id: string | null) => void;
  setState: (state: PlaybackState) => void;
  setPosition: (pos: number) => void;
  setDuration: (d: number) => void;
  setPlaybackRate: (rate: number) => void;
  setBuffering: (b: boolean) => void;
  setError: (err: string | null) => void;
}

export const useYouTubeStore = create<YouTubeStore>((set) => ({
  videoId: null,
  state: 'unstarted',
  position: 0,
  duration: 0,
  playbackRate: 1,
  isBuffering: false,
  error: null,

  setVideoId: (videoId) => set({ videoId }),
  setState: (state) => set({ state }),
  setPosition: (position) => set({ position }),
  setDuration: (duration) => set({ duration }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setBuffering: (isBuffering) => set({ isBuffering }),
  setError: (error) => set({ error }),
}));
