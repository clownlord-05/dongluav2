import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// In production (Vercel), point to Fly.io backend
// In development, Vite proxies '/api' to localhost:3001
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

let sessionPromise: Promise<string> | null = null;

export async function ensureAuthToken(preferredName?: string): Promise<string> {
  const currentToken = useAuthStore.getState().token;
  if (currentToken) return currentToken;

  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    try {
      const existingUser = useAuthStore.getState().user;
      const defaultName = preferredName || existingUser?.display_name || `Ca Sĩ #${Math.floor(1000 + Math.random() * 9000)}`;
      const randomUser = existingUser?.username || `user_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const res = await axios.post<{ user: import('../types').User; token: string }>('/api/auth/session', {
        username: randomUser,
        display_name: defaultName,
        avatar_seed: existingUser?.avatar_seed || randomUser,
      });
      useAuthStore.getState().setAuth(res.data.user, res.data.token);
      return res.data.token;
    } finally {
      sessionPromise = null;
    }
  })();

  return sessionPromise;
}

api.interceptors.request.use(async (config) => {
  if (!config.url?.includes('/auth/session')) {
    let token = useAuthStore.getState().token;
    if (!token) {
      try {
        token = await ensureAuthToken();
      } catch (e) {
        console.warn('Auto auth token generation failed:', e);
      }
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const user = useAuthStore.getState().user;
    if (user) {
      config.headers['x-user-id'] = user.id;
      config.headers['x-user-name'] = encodeURIComponent(user.display_name || '');
      if (user.avatar_seed && user.avatar_seed.length < 512) {
        config.headers['x-user-avatar'] = encodeURIComponent(user.avatar_seed);
      }
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalConfig = err.config;
    if (err.response?.status === 401 && originalConfig && !originalConfig._retry) {
      originalConfig._retry = true;
      const savedName = useAuthStore.getState().user?.display_name;
      useAuthStore.getState().logout();
      try {
        const newToken = await ensureAuthToken(savedName);
        originalConfig.headers.Authorization = `Bearer ${newToken}`;
        return api.request(originalConfig);
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }
    return Promise.reject(err);
  }
);

// Auth
export const createSession = (display_name: string, username?: string, avatar_seed?: string) => {
  const cleanUsername = username || `user_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  return axios.post<{ user: import('../types').User; token: string }>('/api/auth/session', {
    display_name,
    username: cleanUsername,
    avatar_seed: avatar_seed || cleanUsername,
  });
};

export const updateProfile = (data: { display_name?: string; avatar_seed?: string }) =>
  api.patch<{ user: import('../types').User }>('/auth/profile', data);

// Rooms
export const listRooms = () =>
  api.get<{ rooms: import('../types').Room[] }>('/rooms');

export const createRoom = (data: {
  name: string;
  visibility: string;
  password?: string;
  max_participants?: number;
}) => api.post<{ room: import('../types').Room }>('/rooms', data);

export const getRoom = (roomId: string) =>
  api.get<{ room: import('../types').Room; members: import('../types').MemberView[] }>(`/rooms/${roomId}`);

export const getRoomByCode = (code: string) =>
  api.get<{ room: import('../types').Room }>(`/rooms/code/${code}`);

export const closeRoomApi = (roomId: string) =>
  api.delete(`/rooms/${roomId}`);

// Invitations
export const createInvitation = (roomId: string) =>
  api.post<{ invite_code: string }>(`/rooms/${roomId}/invitations`);

// LiveKit token
export const getLiveKitToken = (roomId: string) =>
  api.get<{ token: string; url: string; identity: string; room_name: string; can_publish: boolean }>(`/rooms/${roomId}/livekit-token`);

// Song queue
export const getSongQueue = (roomId: string) =>
  api.get<{ songs: import('../types').SongQueueItem[] }>(`/rooms/${roomId}/songs`);

// Hand requests
export const getHandRequests = (roomId: string) =>
  api.get<{ requests: import('../types').HandRequest[] }>(`/rooms/${roomId}/hand-requests`);

// YouTube Direct Search
export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
  author: string;
  url: string;
  views: number;
}

export const searchYouTube = (query: string) =>
  api.get<{ results: YouTubeSearchResult[] }>(`/youtube/search`, { params: { q: query } });

// Moderation log
export const getModerationLog = (roomId: string) =>
  api.get<{ entries: import('../types').ModerationLogEntry[] }>(`/rooms/${roomId}/moderation`);

export default api;
