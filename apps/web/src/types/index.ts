// ============================================================
// ĐỐNG LỬA V2 – Frontend Types
// ============================================================

export type UserRole = 'OWNER' | 'MODERATOR' | 'SPEAKER' | 'AUDIENCE';
export type RoomVisibility = 'public' | 'private';
export type RoomStatus = 'active' | 'closed';
export type MemberConnectionState = 'connected' | 'disconnected';
export type HandRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
export type SongStatus = 'queued' | 'playing' | 'played' | 'removed';
export type PlaybackState = 'playing' | 'paused' | 'buffering' | 'ended' | 'unstarted';
export type ModerationAction = 'kick' | 'ban' | 'mute' | 'unmute' | 'gain_change' | 'remove_from_stage';

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_seed: string;
  created_at: string;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  owner_id: string;
  visibility: RoomVisibility;
  has_password: boolean;
  max_participants: number;
  status: RoomStatus;
  created_at: string;
  member_count: number;
}

export interface MemberView {
  user_id: string;
  display_name: string;
  avatar_seed: string;
  role: UserRole;
  connection_state: MemberConnectionState;
  muted?: boolean;
  gain?: number;
}

export interface HandRequest {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  avatar_seed: string;
  status: HandRequestStatus;
  position: number;
  created_at: string;
}

export interface SongQueueItem {
  id: string;
  room_id: string;
  video_id: string;
  title: string;
  thumbnail: string;
  requested_by: string;
  requester_name: string;
  queue_position: number;
  status: SongStatus;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id?: string;
  userId?: string;
  display_name?: string;
  displayName?: string;
  avatar_seed?: string;
  avatarSeed?: string;
  message?: string;
  text?: string;
  timestamp?: string;
  createdAt?: string;
  role?: string;
  type?: 'text' | 'sticker';
}

export interface PlaybackInfo {
  video_id: string | null;
  title?: string | null;
  state: PlaybackState;
  position_seconds: number;
  anchor_time: string;
  playback_rate: number;
}

export interface RoomState {
  room: Room | null;
  members: MemberView[];
  speakers: MemberView[];
  handQueue: HandRequest[];
  songQueue: SongQueueItem[];
  chatMessages: ChatMessage[];
  playback: PlaybackInfo | null;
  myHandRequestId: string | null;
}

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
}

export interface AudioConstraintsActual {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  channelCount: number;
  sampleRate: number;
}

// Socket event payloads
export interface StageInviteEvent {
  invite_id: string;
  room_id: string;
  invited_by: string;
  invited_by_name: string;
}

export interface ModerationLogEntry {
  id: string;
  actor_id: string;
  actor_name: string;
  target_user_id: string;
  target_name: string;
  action: ModerationAction;
  reason?: string;
  created_at: string;
}
