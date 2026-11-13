import { getDb } from '../db';
import { RoomPlayback, PlaybackState } from '@dongluav2/shared-types';

export function getPlayback(roomId: string): RoomPlayback | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM room_playback WHERE room_id = ?').get(roomId) as RoomPlayback | undefined;
}

export function loadVideo(
  roomId: string,
  videoId: string,
  updatedBy: string,
  title?: string
): RoomPlayback {
  const db = getDb();
  db.prepare(`
    INSERT INTO room_playback (room_id, video_id, title, state, position_seconds, anchor_time, playback_rate, updated_by, updated_at)
    VALUES (?, ?, ?, 'paused', 0, datetime('now'), 1.0, ?, datetime('now'))
    ON CONFLICT(room_id) DO UPDATE SET
      video_id = excluded.video_id,
      title = excluded.title,
      state = 'paused',
      position_seconds = 0,
      anchor_time = datetime('now'),
      playback_rate = 1.0,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run(roomId, videoId, title || null, updatedBy);
  return getPlayback(roomId)!;
}

export function playAt(
  roomId: string,
  positionSeconds: number,
  updatedBy: string,
  playbackRate = 1.0
): RoomPlayback {
  const db = getDb();
  db.prepare(`
    UPDATE room_playback SET
      state = 'playing',
      position_seconds = ?,
      anchor_time = datetime('now'),
      playback_rate = ?,
      updated_by = ?,
      updated_at = datetime('now')
    WHERE room_id = ?
  `).run(positionSeconds, playbackRate, updatedBy, roomId);
  return getPlayback(roomId)!;
}

export function pauseAt(
  roomId: string,
  positionSeconds: number,
  updatedBy: string
): RoomPlayback {
  const db = getDb();
  db.prepare(`
    UPDATE room_playback SET
      state = 'paused',
      position_seconds = ?,
      anchor_time = datetime('now'),
      updated_by = ?,
      updated_at = datetime('now')
    WHERE room_id = ?
  `).run(positionSeconds, updatedBy, roomId);
  return getPlayback(roomId)!;
}

export function seekTo(
  roomId: string,
  positionSeconds: number,
  updatedBy: string
): RoomPlayback {
  const db = getDb();
  // Preserve current play/pause state, just update position
  db.prepare(`
    UPDATE room_playback SET
      position_seconds = ?,
      anchor_time = datetime('now'),
      updated_by = ?,
      updated_at = datetime('now')
    WHERE room_id = ?
  `).run(positionSeconds, updatedBy, roomId);
  return getPlayback(roomId)!;
}

export function computeCurrentPosition(pb: RoomPlayback): number {
  if (pb.state !== 'playing') return pb.position_seconds;
  const anchorMs = new Date(pb.anchor_time).getTime();
  const elapsedSec = (Date.now() - anchorMs) / 1000;
  return pb.position_seconds + elapsedSec * pb.playback_rate;
}
