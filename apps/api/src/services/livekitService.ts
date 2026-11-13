import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const API_KEY = process.env.LIVEKIT_API_KEY || '';
const API_SECRET = process.env.LIVEKIT_API_SECRET || '';

export type LiveKitRole = 'audience' | 'speaker';

export function generateLiveKitToken(
  roomName: string,
  participantIdentity: string,
  role: LiveKitRole,
  displayName: string
): string {
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: participantIdentity,
    name: displayName,
    ttl: '4h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: role === 'speaker',       // speakers can publish audio
    canSubscribe: true,                   // everyone can subscribe (hear others)
    canPublishData: role === 'speaker',   // speakers can send data messages too
  });

  return at.toJwt() as unknown as string;
}

export async function revokeParticipant(roomName: string, participantIdentity: string): Promise<void> {
  if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
    console.warn('[LiveKit] No credentials configured, skipping revoke');
    return;
  }
  try {
    const svc = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);
    await svc.removeParticipant(roomName, participantIdentity);
  } catch (err) {
    // participant may already have left
    console.warn(`[LiveKit] revokeParticipant failed for ${participantIdentity}:`, err);
  }
}

export async function muteParticipantTrack(
  roomName: string,
  participantIdentity: string,
  trackSid: string,
  muted: boolean
): Promise<void> {
  if (!LIVEKIT_URL || !API_KEY || !API_SECRET) return;
  try {
    const svc = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);
    await svc.mutePublishedTrack(roomName, participantIdentity, trackSid, muted);
  } catch (err) {
    console.warn(`[LiveKit] muteParticipantTrack failed:`, err);
  }
}
