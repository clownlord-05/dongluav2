import {
  Room as LiveKitRoom,
  RoomEvent,
  Track,
  LocalTrackPublication,
} from 'livekit-client';

let livekitRoom: LiveKitRoom | null = null;

export function getLiveKitRoom(): LiveKitRoom {
  if (!livekitRoom) {
    livekitRoom = new LiveKitRoom();
  }
  return livekitRoom;
}

export async function connectLiveKit(
  url: string,
  token: string,
  onDisconnect?: () => void
): Promise<LiveKitRoom> {
  const room = getLiveKitRoom();
  await room.connect(url, token, {
    autoSubscribe: true,
  });
  if (onDisconnect) {
    room.on(RoomEvent.Disconnected, onDisconnect);
  }
  return room;
}

export async function publishAudioTrack(
  room: LiveKitRoom,
  track: MediaStreamTrack
): Promise<LocalTrackPublication | null> {
  try {
    const pub = await room.localParticipant.publishTrack(track, {
      name: 'microphone',
      source: Track.Source.Microphone,
    });
    return pub;
  } catch (e) {
    console.error('Failed to publish audio track:', e);
    return null;
  }
}

export async function disconnectLiveKit() {
  if (livekitRoom) {
    await livekitRoom.disconnect();
    livekitRoom = null;
  }
}
