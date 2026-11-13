import { create } from 'zustand';
import type {
  Room,
  MemberView,
  HandRequest,
  SongQueueItem,
  ChatMessage,
  PlaybackInfo,
} from '../types';

interface RoomStore {
  room: Room | null;
  members: MemberView[];
  speakers: MemberView[];
  handQueue: HandRequest[];
  songQueue: SongQueueItem[];
  chatMessages: ChatMessage[];
  playback: PlaybackInfo | null;
  myHandRequestId: string | null;
  stageInvite: { invite_id: string; invited_by_name: string } | null;
  totalMemberCount: number;

  setRoom: (room: Room) => void;
  clearRoom: () => void;
  setMembers: (members: MemberView[]) => void;
  setTotalMemberCount: (count: number) => void;
  updateMember: (userId: string, updates: Partial<MemberView>) => void;
  addMember: (member: MemberView) => void;
  removeMember: (userId: string) => void;
  setSpeakers: (speakers: MemberView[]) => void;
  addSpeaker: (member: MemberView) => void;
  removeSpeaker: (userId: string) => void;
  setHandQueue: (queue: HandRequest[]) => void;
  updateHandRequest: (id: string, updates: Partial<HandRequest>) => void;
  setSongQueue: (queue: SongQueueItem[]) => void;
  addSongToQueue: (song: SongQueueItem) => void;
  removeSongFromQueue: (id: string) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setPlayback: (info: PlaybackInfo) => void;
  setMyHandRequestId: (id: string | null) => void;
  setStageInvite: (invite: { invite_id: string; invited_by_name: string } | null) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  room: null,
  members: [],
  speakers: [],
  handQueue: [],
  songQueue: [],
  chatMessages: [],
  playback: null,
  myHandRequestId: null,
  stageInvite: null,
  totalMemberCount: 1,

  setRoom: (room) => set({ room }),
  setTotalMemberCount: (totalMemberCount) => set({ totalMemberCount }),
  clearRoom: () =>
    set({
      room: null,
      members: [],
      speakers: [],
      handQueue: [],
      songQueue: [],
      chatMessages: [],
      playback: null,
      myHandRequestId: null,
      stageInvite: null,
    }),

  setMembers: (members) => set({ members }),
  updateMember: (userId, updates) =>
    set((s) => ({
      members: s.members.map((m) => (m.user_id === userId ? { ...m, ...updates } : m)),
    })),
  addMember: (member) =>
    set((s) => {
      const idx = s.members.findIndex((m) => m.user_id === member.user_id);
      if (idx !== -1) {
        const existing = s.members[idx];
        if (
          existing.role === member.role &&
          existing.muted === member.muted &&
          existing.display_name === member.display_name &&
          existing.avatar_seed === member.avatar_seed
        ) {
          return s;
        }
        const updated = [...s.members];
        updated[idx] = { ...existing, ...member };
        return { members: updated };
      }
      // Cap stored AUDIENCE list at 150 to keep React/DOM ultra-fast for 200-5,000 viewers
      // while always keeping OWNER, MODERATOR, and SPEAKER members
      if (member.role === 'AUDIENCE' && s.members.length >= 150) {
        return s;
      }
      return { members: [...s.members, member] };
    }),
  removeMember: (userId) =>
    set((s) => ({ members: s.members.filter((m) => m.user_id !== userId) })),

  setSpeakers: (speakers) => set({ speakers }),
  addSpeaker: (member) =>
    set((s) => {
      if (s.speakers.find((m) => m.user_id === member.user_id)) return s;
      return { speakers: [...s.speakers, member] };
    }),
  removeSpeaker: (userId) =>
    set((s) => ({ speakers: s.speakers.filter((m) => m.user_id !== userId) })),

  setHandQueue: (handQueue) => set({ handQueue }),
  updateHandRequest: (id, updates) =>
    set((s) => ({
      handQueue: s.handQueue.map((h) => (h.id === id ? { ...h, ...updates } : h)),
    })),

  setSongQueue: (songQueue) => set({ songQueue }),
  addSongToQueue: (song) =>
    set((s) => ({ songQueue: [...s.songQueue, song] })),
  removeSongFromQueue: (id) =>
    set((s) => ({ songQueue: s.songQueue.filter((s2) => s2.id !== id) })),

  addChatMessage: (msg) =>
    set((s) => ({
      chatMessages: [...s.chatMessages.slice(-79), msg],
    })),

  setPlayback: (playback) => set({ playback }),
  setMyHandRequestId: (myHandRequestId) => set({ myHandRequestId }),
  setStageInvite: (stageInvite) => set({ stageInvite }),
}));
