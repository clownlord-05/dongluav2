export type UserRole = 'OWNER' | 'MODERATOR' | 'SPEAKER' | 'AUDIENCE';
export type RoomVisibility = 'public' | 'private' | 'PUBLIC' | 'PRIVATE';
export type RoomStatus = 'active' | 'closed' | 'ACTIVE' | 'CLOSED';
export type HandRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
export type ParticipantState = 'AUDIENCE' | 'REQUEST_PENDING' | 'INVITED_TO_STAGE' | 'SPEAKER_CONNECTING' | 'SPEAKER_LIVE' | 'SPEAKER_MUTED' | 'DISCONNECTED';
export type YouTubePlayerState = 'UNSTARTED' | 'ENDED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'CUED' | 'ERROR' | 'playing' | 'paused' | 'buffering' | 'ended';
export type ConnectionQuality = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DISCONNECTED';

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
  visibility: string;
  password_hash?: string | null;
  max_participants: number;
  status: string;
  created_at: string;
  closed_at?: string | null;
}

export interface RoomView {
  id: string;
  code: string;
  name: string;
  owner_id: string;
  visibility: string;
  has_password: boolean;
  max_participants: number;
  status: string;
  created_at: string;
  member_count: number;
  speaker_count: number;
}

export interface RoomMember {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  avatarSeed: string;
  role: UserRole;
  participantState: ParticipantState;
  isMuted: boolean;
  gainLevel: number;
  connectionQuality: ConnectionQuality;
  joinedAt: string;
}

export interface MemberView {
  user_id: string;
  display_name: string;
  avatar_seed: string;
  role: UserRole;
  connection_state: 'connected' | 'disconnected';
  muted: boolean;
  gain: number;
}

export interface HandRequest {
  id: string;
  room_id: string;
  user_id: string;
  status: HandRequestStatus;
  position: number;
  created_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  expires_at?: string | null;
}

export interface SongQueueItem {
  id: string;
  room_id: string;
  video_id: string;
  title: string;
  thumbnail: string;
  requested_by: string;
  queue_position: number;
  status: 'queued' | 'playing' | 'played' | 'removed' | 'QUEUED' | 'PLAYING' | 'PLAYED' | 'SKIPPED';
  created_at: string;
}

export interface RoomPlayback {
  room_id: string;
  video_id: string | null;
  title?: string | null;
  state: string;
  position_seconds: number;
  anchor_time: string;
  playback_rate: number;
  updated_by: string | null;
  updated_at: string;
}

export interface PlaybackState {
  roomId: string;
  videoId: string | null;
  title?: string | null;
  videoTitle?: string;
  state: YouTubePlayerState;
  positionSeconds: number;
  serverAnchorTime: number;
  playbackRate: number;
  updatedBy: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  roomId?: string;
  room_id?: string;
  userId?: string;
  user_id?: string;
  displayName?: string;
  display_name?: string;
  avatarSeed?: string;
  avatar_seed?: string;
  text?: string;
  message?: string;
  createdAt?: string;
  timestamp?: string;
  role?: UserRole | string;
  type?: 'text' | 'sticker';
}

export interface AudioTrackInfo {
  userId: string;
  trackSid: string;
  isMuted: boolean;
  gainLevel: number;
  inputLevel: number;
}

export interface SocketEvents {
  'room:join': { roomId: string; password?: string };
  'room:leave': { roomId: string };
  'hand:raise': { roomId: string; suggestedSong?: string };
  'hand:cancel': { roomId: string; requestId: string };
  'stage:accept': { roomId: string; inviteId: string };
  'stage:decline': { roomId: string; inviteId: string };
  'youtube:state_report': { roomId: string; videoId: string; currentTime: number; playerState: YouTubePlayerState; buffering: boolean };
  'room:chat_message': { roomId: string; text: string };
  'room:song_add': { roomId: string; videoId: string; title: string; thumbnail: string; channelName: string };

  'hand:approve': { roomId: string; requestId: string };
  'hand:reject': { roomId: string; requestId: string };
  'audio:mute': { roomId: string; targetUserId: string };
  'audio:unmute': { roomId: string; targetUserId: string };
  'audio:gain_change': { roomId: string; targetUserId: string; gain: number };
  'youtube:load': { roomId: string; videoId: string; title?: string };
  'youtube:play_at': { roomId: string; videoId: string; position: number };
  'youtube:pause': { roomId: string; position: number };
  'youtube:seek': { roomId: string; position: number };
  'room:kick': { roomId: string; targetUserId: string; reason?: string };
  'room:ban': { roomId: string; targetUserId: string; reason?: string };
  'stage:remove_speaker': { roomId: string; targetUserId: string };
  'room:song_remove': { roomId: string; songId: string };
}

export interface LiveKitTokenResponse {
  token: string;
  url: string;
  identity: string;
  roomName: string;
  canPublish: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
