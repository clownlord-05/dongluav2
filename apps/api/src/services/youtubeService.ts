import { getDb } from '../db';
import { RoomPlayback, PlaybackState } from '../types/shared';

// In-memory playback cache for O(1) zero-latency reads across 200-5,000 concurrent users
const playbackCache = new Map<string, RoomPlayback>();

export function getPlayback(roomId: string): RoomPlayback | undefined {
  const cached = playbackCache.get(roomId);
  if (cached) return cached;
  const db = getDb();
  const row = db.prepare('SELECT * FROM room_playback WHERE room_id = ?').get(roomId) as RoomPlayback | undefined;
  if (row) {
    playbackCache.set(roomId, row);
  }
  return row;
}

export function loadVideo(
  roomId: string,
  videoId: string,
  updatedBy: string,
  title?: string
): RoomPlayback {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const pb: RoomPlayback = {
    room_id: roomId,
    video_id: videoId,
    title: title || null,
    state: 'paused',
    position_seconds: 0,
    anchor_time: nowIso,
    playback_rate: 1.0,
    updated_by: updatedBy,
    updated_at: nowIso,
  };
  playbackCache.set(roomId, pb);

  db.prepare(`
    INSERT INTO room_playback (room_id, video_id, title, state, position_seconds, anchor_time, playback_rate, updated_by, updated_at)
    VALUES (?, ?, ?, 'paused', 0, ?, 1.0, ?, ?)
    ON CONFLICT(room_id) DO UPDATE SET
      video_id = excluded.video_id,
      title = excluded.title,
      state = 'paused',
      position_seconds = 0,
      anchor_time = excluded.anchor_time,
      playback_rate = 1.0,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(roomId, videoId, title || null, nowIso, updatedBy, nowIso);
  return pb;
}

export function playAt(
  roomId: string,
  positionSeconds: number,
  updatedBy: string,
  playbackRate = 1.0
): RoomPlayback {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const existing = getPlayback(roomId);
  const pb: RoomPlayback = {
    room_id: roomId,
    video_id: existing?.video_id || null,
    title: existing?.title || null,
    state: 'playing',
    position_seconds: positionSeconds,
    anchor_time: nowIso,
    playback_rate: playbackRate,
    updated_by: updatedBy,
    updated_at: nowIso,
  };
  playbackCache.set(roomId, pb);

  db.prepare(`
    UPDATE room_playback SET
      state = 'playing',
      position_seconds = ?,
      anchor_time = ?,
      playback_rate = ?,
      updated_by = ?,
      updated_at = ?
    WHERE room_id = ?
  `).run(positionSeconds, nowIso, playbackRate, updatedBy, nowIso, roomId);
  return pb;
}

export function pauseAt(
  roomId: string,
  positionSeconds: number,
  updatedBy: string
): RoomPlayback {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const existing = getPlayback(roomId);
  const pb: RoomPlayback = {
    room_id: roomId,
    video_id: existing?.video_id || null,
    title: existing?.title || null,
    state: 'paused',
    position_seconds: positionSeconds,
    anchor_time: nowIso,
    playback_rate: existing?.playback_rate || 1.0,
    updated_by: updatedBy,
    updated_at: nowIso,
  };
  playbackCache.set(roomId, pb);

  db.prepare(`
    UPDATE room_playback SET
      state = 'paused',
      position_seconds = ?,
      anchor_time = ?,
      updated_by = ?,
      updated_at = ?
    WHERE room_id = ?
  `).run(positionSeconds, nowIso, updatedBy, nowIso, roomId);
  return pb;
}

export function seekTo(
  roomId: string,
  positionSeconds: number,
  updatedBy: string
): RoomPlayback {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const existing = getPlayback(roomId);
  const pb: RoomPlayback = {
    room_id: roomId,
    video_id: existing?.video_id || null,
    title: existing?.title || null,
    state: existing?.state || 'playing',
    position_seconds: positionSeconds,
    anchor_time: nowIso,
    playback_rate: existing?.playback_rate || 1.0,
    updated_by: updatedBy,
    updated_at: nowIso,
  };
  playbackCache.set(roomId, pb);

  db.prepare(`
    UPDATE room_playback SET
      position_seconds = ?,
      anchor_time = ?,
      updated_by = ?,
      updated_at = ?
    WHERE room_id = ?
  `).run(positionSeconds, nowIso, updatedBy, nowIso, roomId);
  return pb;
}

export function computeCurrentPosition(pb: RoomPlayback): number {
  if (pb.state !== 'playing') return pb.position_seconds;
  let anchorStr = pb.anchor_time || '';
  // Ensure UTC parsing if SQLite returned local datetime format without Z
  if (anchorStr && !anchorStr.endsWith('Z') && !anchorStr.includes('+')) {
    anchorStr = anchorStr.replace(' ', 'T') + 'Z';
  }
  const anchorMs = new Date(anchorStr).getTime();
  if (isNaN(anchorMs)) return pb.position_seconds;
  const elapsedSec = Math.max(0, (Date.now() - anchorMs) / 1000);
  return Math.max(0, pb.position_seconds + elapsedSec * (pb.playback_rate || 1.0));
}
