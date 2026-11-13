import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { getDb } from '../db';
import { getActiveMember, joinRoom, leaveRoom, setMemberRole, setMemberMuted, setMemberGain, getRoomMemberCount } from '../services/participantService';
import { getRoomById, validateRoomPassword, closeRoom } from '../services/roomService';
import { loadVideo, playAt, pauseAt, seekTo, getPlayback, computeCurrentPosition } from '../services/youtubeService';
import { raiseHand, cancelHandRequest, reviewHandRequest } from '../services/handRequestService';
import { getOrRestoreSession } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

let io: SocketIOServer | null = null;

export function getIo(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO is not initialized yet!');
  }
  return io;
}

export function initSocket(server: HttpServer): SocketIOServer {
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map(s => s.trim());

  // In-memory token authentication cache for 5,000+ connections
  const sessionCache = new Map<string, { user_id: string; username: string; display_name: string; avatar_seed: string; expires: number }>();
  const chatTimestamps = new Map<string, number[]>();
  const lastLevelEmit = new Map<string, number>();

  // In-memory O(1) role map per room: roomId -> Map<userId, role>
  const roomRoles = new Map<string, Map<string, string>>();
  const memberCountTimers = new Map<string, NodeJS.Timeout>();

  function setFastRole(roomId: string, uid: string, role: string) {
    let map = roomRoles.get(roomId);
    if (!map) {
      map = new Map<string, string>();
      roomRoles.set(roomId, map);
    }
    map.set(uid, role);
  }

  function getFastRole(roomId: string, uid: string): string | undefined {
    const cached = roomRoles.get(roomId)?.get(uid);
    if (cached) return cached;
    const member = getActiveMember(roomId, uid);
    if (member) {
      setFastRole(roomId, uid, member.role);
      return member.role;
    }
    return undefined;
  }

  function emitMemberCountThrottled(roomId: string) {
    if (memberCountTimers.has(roomId)) return;
    const timer = setTimeout(() => {
      memberCountTimers.delete(roomId);
      if (!io) return;
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      const count = roomSockets ? roomSockets.size : getRoomMemberCount(roomId);
      io.to(roomId).emit('room:member_count', { count: Math.max(1, count) });
    }, 350);
    memberCountTimers.set(roomId, timer);
  }

  io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling'],
    perMessageDeflate: false, // Critical for 5,000 clients: eliminates CPU zlib bottleneck
    httpCompression: false,
    maxHttpBufferSize: 1e6,
  });

  // Auth middleware for sockets with instant memory cache
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication token required'));
    }

    const now = Date.now();
    const cached = sessionCache.get(token);
    if (cached && cached.expires > now) {
      (socket as any).userId = cached.user_id;
      (socket as any).user = cached;
      return next();
    }

    try {
      const session = getOrRestoreSession(token, {
        userId: socket.handshake.auth?.userId,
        displayName: socket.handshake.auth?.displayName,
        avatarSeed: socket.handshake.auth?.avatarSeed,
      });

      if (!session) {
        return next(new Error('Invalid or expired session'));
      }

      sessionCache.set(token, { ...session, expires: now + 300000 }); // cache 5 mins
      (socket as any).userId = session.user_id;
      (socket as any).user = session;
      next();
    } catch (err: any) {
      next(new Error('Database error during socket auth: ' + err.message));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as string;
    const user = (socket as any).user;
    console.log(`[Socket] Connected: user=${user.display_name} (${userId}) socket=${socket.id}`);

    // --- 1. ROOM JOIN / LEAVE ---
    socket.on('room:join', ({ roomId, password }: { roomId: string; password?: string }) => {
      try {
        const room = getRoomById(roomId);
        if (!room || room.status === 'closed') {
          socket.emit('error', { message: 'Phòng không tồn tại hoặc đã đóng' });
          return;
        }

        if (room.password_hash && !validateRoomPassword(room, password)) {
          // Check if already an existing member (e.g. reconnect)
          const existing = getActiveMember(roomId, userId);
          if (!existing) {
            socket.emit('error', { message: 'Mật khẩu phòng không đúng' });
            return;
          }
        }

        const isOwner = room.owner_id === userId;
        const existingMember = getActiveMember(roomId, userId);
        const initialRole = isOwner
          ? 'OWNER'
          : existingMember?.role === 'SPEAKER' || existingMember?.role === 'MODERATOR'
          ? existingMember.role
          : 'AUDIENCE';
        const member = joinRoom(roomId, userId, initialRole);
        setFastRole(roomId, userId, member.role);

        socket.join(roomId);
        socket.join(`user:${userId}`);
        (socket as any).currentRoom = roomId;

        if (member.role === 'SPEAKER' || member.role === 'OWNER') {
          socket.join(`speakers:${roomId}`);
        }

        // Broadcast to everyone in room
        io!.to(roomId).emit('room:member_joined', {
          user_id: userId,
          display_name: user.display_name,
          avatar_seed: user.avatar_seed,
          role: member.role,
          muted: member.muted === 1,
          gain: member.gain ?? 1.0,
          connection_state: 'connected',
        });

        // Throttled member count broadcast to entire room
        emitMemberCountThrottled(roomId);

        // Send current room playback state to the newly joined user
        const pb = getPlayback(roomId);
        if (pb) {
          socket.emit('youtube:sync', {
            video_id: pb.video_id,
            videoId: pb.video_id,
            title: pb.title,
            state: pb.state,
            current_position: computeCurrentPosition(pb),
            playback_rate: pb.playback_rate,
            server_time: Date.now(),
          });
        }
      } catch (err: any) {
        console.error('[Socket] room:join error:', err);
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('room:leave', ({ roomId }: { roomId: string }) => {
      leaveRoom(roomId, userId);
      roomRoles.get(roomId)?.delete(userId);
      socket.leave(roomId);
      socket.leave(`speakers:${roomId}`);
      (socket as any).currentRoom = null;
      io!.to(roomId).emit('room:member_left', { user_id: userId, reason: 'left' });
      emitMemberCountThrottled(roomId);
    });

    // --- 2. CHAT MESSAGE ---
    socket.on('room:chat_message', (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      const text = payload?.text || payload?.message;
      const type = payload?.type || 'text';
      if (!roomId || !text || typeof text !== 'string' || text.trim().length === 0) return;

      // Anti-Spam protection for 5000 concurrent users: max 4 msgs per 2.5s
      const now = Date.now();
      const userChatHistory = chatTimestamps.get(userId) || [];
      const recentChats = userChatHistory.filter((t) => now - t < 2500);
      if (recentChats.length >= 4) {
        socket.emit('error', { message: 'Bạn đang gửi tin nhắn quá nhanh! Vui lòng đợi 2 giây.' });
        return;
      }
      recentChats.push(now);
      chatTimestamps.set(userId, recentChats);

      const cleanText = text.trim().slice(0, 500);
      const role = getFastRole(roomId, userId) || 'AUDIENCE';
      const nowIso = new Date().toISOString();

      const msg = {
        id: uuidv4(),
        roomId,
        room_id: roomId,
        userId,
        user_id: userId,
        displayName: user.display_name,
        display_name: user.display_name,
        avatarSeed: user.avatar_seed,
        avatar_seed: user.avatar_seed,
        text: cleanText,
        message: cleanText,
        type,
        role,
        createdAt: nowIso,
        timestamp: nowIso,
      };

      io!.to(roomId).emit('room:chat_message', msg);
    });

    // --- 3. YOUTUBE PLAYBACK SYNC ---
    socket.on('youtube:load', (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      const video_id = payload?.video_id || payload?.videoId;
      const title = payload?.title || 'Karaoke Beat';
      if (!roomId || !video_id) return;

      const role = getFastRole(roomId, userId);
      if (!role || !['OWNER', 'MODERATOR'].includes(role)) return;

      loadVideo(roomId, video_id, userId, title);
      io!.to(roomId).emit('youtube:load', {
        video_id,
        videoId: video_id,
        title,
      });
    });

    socket.on('youtube:play_at', (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      const position = typeof payload?.position === 'number' ? payload.position : (payload?.position_seconds || 0);
      if (!roomId) return;

      const role = getFastRole(roomId, userId);
      if (!role || !['OWNER', 'MODERATOR'].includes(role)) return;

      playAt(roomId, position, userId);
      io!.to(roomId).emit('youtube:play_at', {
        position,
        position_seconds: position,
        server_time: Date.now(),
      });
    });

    socket.on('youtube:pause', (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      const position = typeof payload?.position === 'number' ? payload.position : (payload?.position_seconds || 0);
      if (!roomId) return;

      const role = getFastRole(roomId, userId);
      if (!role || !['OWNER', 'MODERATOR'].includes(role)) return;

      pauseAt(roomId, position, userId);
      io!.to(roomId).emit('youtube:pause', {
        position,
        position_seconds: position,
        server_time: Date.now(),
      });
    });

    socket.on('youtube:seek', (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      const position = typeof payload?.position === 'number' ? payload.position : (payload?.position_seconds || 0);
      if (!roomId) return;

      const role = getFastRole(roomId, userId);
      if (!role || !['OWNER', 'MODERATOR'].includes(role)) return;

      seekTo(roomId, position, userId);
      io!.to(roomId).emit('youtube:seek', {
        position,
        position_seconds: position,
        server_time: Date.now(),
      });
    });

    // Client reports drift
    socket.on('youtube:state_report', ({ roomId, current_time }: { roomId: string; current_time: number }) => {
      const pb = getPlayback(roomId);
      if (!pb || pb.state !== 'playing') return;
      const expected = computeCurrentPosition(pb);
      const drift = Math.abs(current_time - expected);
      // If drift is severe (> 3 seconds), suggest resync to this client
      if (drift > 3.0) {
        socket.emit('youtube:resync', {
          target_position: expected,
          server_time: Date.now(),
        });
      }
    });

    // --- 3.5 SONG QUEUE REALTIME ---
    socket.on('room:song_add', (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      const video_id = payload?.video_id || payload?.videoId;
      if (!roomId || !video_id) return;
      const title = (payload?.title || 'Karaoke Song').slice(0, 200);
      const thumbnail = (payload?.thumbnail || `https://img.youtube.com/vi/${video_id}/mqdefault.jpg`).slice(0, 500);

      const db = getDb();
      const maxPosRow = db.prepare(`
        SELECT COALESCE(MAX(queue_position), 0) + 1 as next_pos
        FROM song_queue WHERE room_id = ? AND status = 'queued'
      `).get(roomId) as { next_pos: number };

      const id = uuidv4();
      db.prepare(`
        INSERT INTO song_queue (id, room_id, video_id, title, thumbnail, requested_by, queue_position, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')
      `).run(id, roomId, video_id, title, thumbnail, userId, maxPosRow ? maxPosRow.next_pos : 1);

      const newSong = db.prepare(`
        SELECT sq.*, u.display_name as requested_by_name
        FROM song_queue sq
        JOIN users u ON u.id = sq.requested_by
        WHERE sq.id = ?
      `).get(id);

      io!.to(roomId).emit('room:song_add', newSong);
    });

    socket.on('room:song_remove', (payload: any) => {
      const roomId = payload?.roomId || payload?.room_id;
      const songId = payload?.songId || payload?.song_id;
      if (!roomId || !songId) return;

      const db = getDb();
      const song = db.prepare('SELECT * FROM song_queue WHERE id = ? AND room_id = ?').get(songId, roomId) as any;
      if (!song) return;

      const member = getActiveMember(roomId, userId);
      const isHost = member && ['OWNER', 'MODERATOR'].includes(member.role);
      const isRequester = song.requested_by === userId;
      if (!isHost && !isRequester) return;

      db.prepare(`UPDATE song_queue SET status = 'removed' WHERE id = ?`).run(songId);
      io!.to(roomId).emit('room:song_remove', { song_id: songId, songId });
    });

    // --- 3.6 STAGE HAND REQUESTS & PARTICIPANTS ---
    socket.on('hand:raise', (data: any) => {
      try {
        const roomId = data?.roomId || data?.room_id;
        if (!roomId) return;
        let member = getActiveMember(roomId, userId);
        if (!member) {
          joinRoom(roomId, userId, 'AUDIENCE');
          member = getActiveMember(roomId, userId);
        }
        if (!member || ['SPEAKER', 'OWNER'].includes(member.role)) return;
        const req = raiseHand(roomId, userId);
        io!.to(roomId).emit('hand:request_updated', {
          id: req.id,
          request_id: req.id,
          room_id: roomId,
          user_id: userId,
          display_name: user.display_name,
          userName: user.display_name,
          avatar_seed: user.avatar_seed,
          userAvatar: user.avatar_seed,
          status: 'pending',
          position: req.position,
          created_at: req.created_at,
        });
      } catch (e: any) {
        console.warn('hand:raise error:', e);
      }
    });

    socket.on('hand:cancel', (data: any) => {
      try {
        const roomId = data?.roomId || data?.room_id;
        const requestId = data?.requestId || data?.request_id;
        if (!roomId) return;
        const req = cancelHandRequest(requestId || '', userId);
        if (req) {
          io!.to(roomId).emit('hand:request_updated', {
            id: req.id,
            request_id: req.id,
            room_id: roomId,
            user_id: userId,
            status: 'cancelled',
          });
        }
      } catch (e: any) {
        console.warn('hand:cancel error:', e);
      }
    });

    socket.on('hand:approve', (data: any) => {
      try {
        const roomId = data?.roomId || data?.room_id;
        const requestId = data?.requestId || data?.request_id;
        if (!roomId || !requestId) return;
        const role = getFastRole(roomId, userId);
        if (!role || !['OWNER', 'MODERATOR'].includes(role)) return;

        const req = reviewHandRequest(requestId, userId, true);
        if (!req) return;

        setMemberRole(roomId, req.user_id, 'SPEAKER');
        setMemberMuted(roomId, req.user_id, false);
        setFastRole(roomId, req.user_id, 'SPEAKER');

        // Also add target user's socket to speakers room
        io!.in(`user:${req.user_id}`).socketsJoin(`speakers:${roomId}`);

        io!.to(roomId).emit('hand:request_updated', {
          id: req.id,
          request_id: req.id,
          room_id: roomId,
          user_id: req.user_id,
          status: 'approved',
        });
        io!.to(roomId).emit('stage:participant_added', {
          user_id: req.user_id,
          role: 'SPEAKER',
          muted: false,
        });
        // Direct stage invite only to the target user so mobile users can tap to grant microphone permission
        io!.to(`user:${req.user_id}`).emit('stage:invite', {
          invite_id: req.id,
          user_id: req.user_id,
          invited_by_name: user.display_name || 'Chủ phòng',
        });
      } catch (e: any) {
        console.warn('hand:approve error:', e);
      }
    });

    socket.on('hand:reject', (data: any) => {
      try {
        const roomId = data?.roomId || data?.room_id;
        const requestId = data?.requestId || data?.request_id;
        if (!roomId || !requestId) return;
        const role = getFastRole(roomId, userId);
        if (!role || !['OWNER', 'MODERATOR'].includes(role)) return;

        const req = reviewHandRequest(requestId, userId, false);
        if (!req) return;

        io!.to(roomId).emit('hand:request_updated', {
          id: req.id,
          request_id: req.id,
          room_id: roomId,
          user_id: req.user_id,
          status: 'rejected',
        });
      } catch (e: any) {
        console.warn('hand:reject error:', e);
      }
    });

    socket.on('stage:accept', (data: any) => {
      try {
        const roomId = data?.roomId || data?.room_id;
        if (!roomId) return;
        setMemberRole(roomId, userId, 'SPEAKER');
        setMemberMuted(roomId, userId, false);
        setFastRole(roomId, userId, 'SPEAKER');
        socket.join(`speakers:${roomId}`);
        io!.to(roomId).emit('stage:participant_added', {
          user_id: userId,
          role: 'SPEAKER',
          muted: false,
        });
      } catch (e: any) {
        console.warn('stage:accept error:', e);
      }
    });

    socket.on('stage:decline', (_data: any) => {
      // Handled gracefully
    });

    socket.on('stage:remove_self', (data: any) => {
      try {
        const roomId = data?.roomId || data?.room_id;
        if (!roomId) return;
        setMemberRole(roomId, userId, 'AUDIENCE');
        setFastRole(roomId, userId, 'AUDIENCE');
        socket.leave(`speakers:${roomId}`);
        io!.to(roomId).emit('stage:participant_removed', {
          user_id: userId,
          new_role: 'AUDIENCE',
        });
      } catch (e: any) {
        console.warn('stage:remove_self error:', e);
      }
    });

    socket.on('stage:invite_member', (data: any) => {
      try {
        const roomId = data?.roomId || data?.room_id;
        const targetUserId = data?.targetUserId || data?.target_user_id || data?.userId || data?.user_id;
        if (!roomId || !targetUserId) return;
        const role = getFastRole(roomId, userId);
        if (!role || !['OWNER', 'MODERATOR'].includes(role)) return;

        io!.to(`user:${targetUserId}`).emit('stage:invite', {
          invite_id: String(Date.now()),
          user_id: targetUserId,
          invited_by_name: user.display_name,
        });
      } catch (e: any) {
        console.warn('stage:invite_member error:', e);
      }
    });

    socket.on('stage:remove_speaker', (data: any) => {
      try {
        const roomId = data?.roomId || data?.room_id;
        const targetUserId = data?.targetUserId || data?.target_user_id || data?.userId || data?.user_id;
        if (!roomId || !targetUserId) return;
        const role = getFastRole(roomId, userId);
        const isSelf = targetUserId === userId;
        if (!isSelf && (!role || !['OWNER', 'MODERATOR'].includes(role))) return;

        setMemberRole(roomId, targetUserId, 'AUDIENCE');
        setFastRole(roomId, targetUserId, 'AUDIENCE');
        io!.in(`user:${targetUserId}`).socketsLeave(`speakers:${roomId}`);
        io!.to(roomId).emit('stage:participant_removed', {
          user_id: targetUserId,
          new_role: 'AUDIENCE',
        });
      } catch (e: any) {
        console.warn('stage:remove_speaker error:', e);
      }
    });

    socket.on('room:kick', ({ roomId, targetUserId, reason }: { roomId: string; targetUserId: string; reason?: string }) => {
      const member = getActiveMember(roomId, userId);
      if (!member || !['OWNER', 'MODERATOR'].includes(member.role)) return;

      leaveRoom(roomId, targetUserId);
      io!.to(roomId).emit('room:member_left', { user_id: targetUserId, reason: 'kicked' });
      io!.to(roomId).emit('room:kicked', { user_id: targetUserId, reason });
    });

    socket.on('room:ban', ({ roomId, targetUserId, reason }: { roomId: string; targetUserId: string; reason?: string }) => {
      const member = getActiveMember(roomId, userId);
      if (!member || !['OWNER', 'MODERATOR'].includes(member.role)) return;

      leaveRoom(roomId, targetUserId);
      io!.to(roomId).emit('room:member_left', { user_id: targetUserId, reason: 'banned' });
      io!.to(roomId).emit('room:banned', { user_id: targetUserId, reason });
    });

    // --- 3.7 CLOSE ROOM (Owner only) ---
    socket.on('room:close', ({ roomId }: { roomId: string }) => {
      try {
        const member = getActiveMember(roomId, userId);
        const room = getRoomById(roomId);
        if (!room) return;
        const isOwner = room.owner_id === userId || (member && member.role === 'OWNER');
        if (!isOwner) return;

        closeRoom(roomId, userId);
        io!.to(roomId).emit('room:closed', {
          room_id: roomId,
          closed_by_name: user.display_name,
        });
      } catch (err: any) {
        console.warn('room:close error:', err);
      }
    });

    // --- 4. AUDIO CONTROLS (Host Gain & Mute + Self Mute/Unmute for Speakers) ---
    socket.on('audio:mute', (data: any) => {
      const roomId = data?.roomId || data?.room_id;
      const targetUserId = data?.targetUserId || data?.target_user_id || userId;
      if (!roomId) return;
      const role = getFastRole(roomId, userId);
      const isSelf = targetUserId === userId;
      if (!isSelf && (!role || !['OWNER', 'MODERATOR'].includes(role))) return;

      setMemberMuted(roomId, targetUserId, true);
      io!.to(roomId).emit('audio:mute_changed', { user_id: targetUserId, muted: true });
    });

    socket.on('audio:unmute', (data: any) => {
      const roomId = data?.roomId || data?.room_id;
      const targetUserId = data?.targetUserId || data?.target_user_id || userId;
      if (!roomId) return;
      const role = getFastRole(roomId, userId);
      const isSelf = targetUserId === userId;
      if (!isSelf && (!role || !['OWNER', 'MODERATOR'].includes(role))) return;

      setMemberMuted(roomId, targetUserId, false);
      io!.to(roomId).emit('audio:mute_changed', { user_id: targetUserId, muted: false });
    });

    socket.on('audio:gain_change', (data: any) => {
      const roomId = data?.roomId || data?.room_id;
      const targetUserId = data?.targetUserId || data?.target_user_id || userId;
      const gain = typeof data?.gain === 'number' ? data.gain : 1.0;
      if (!roomId) return;
      const role = getFastRole(roomId, userId);
      const isSelf = targetUserId === userId;
      if (!isSelf && (!role || !['OWNER', 'MODERATOR'].includes(role))) return;

      setMemberGain(roomId, targetUserId, gain);
      io!.to(roomId).emit('audio:gain_changed', { user_id: targetUserId, gain });
    });

    // Native WebRTC signaling relay (for direct peer-to-peer audio mesh)
    socket.on('signal:offer', ({ to, offer, toUserId }: { to?: string; offer: any; toUserId?: string }) => {
      const target = toUserId ? `user:${toUserId}` : to;
      if (target) {
        io!.to(target).emit('signal:offer', { from: socket.id, fromUserId: userId, offer });
      }
    });

    socket.on('signal:answer', ({ to, answer, toUserId }: { to?: string; answer: any; toUserId?: string }) => {
      const target = toUserId ? `user:${toUserId}` : to;
      if (target) {
        io!.to(target).emit('signal:answer', { from: socket.id, fromUserId: userId, answer });
      }
    });

    socket.on('signal:ice', ({ to, candidate, toUserId }: { to?: string; candidate: any; toUserId?: string }) => {
      const target = toUserId ? `user:${toUserId}` : to;
      if (target) {
        io!.to(target).emit('signal:ice', { from: socket.id, fromUserId: userId, candidate });
      }
    });

    // Forward stream request ONLY to active speakers so 200 audience members don't get flooded
    socket.on('signal:request', (data: any) => {
      const roomId = data?.roomId || data?.room_id;
      if (roomId) {
        socket.to(`speakers:${roomId}`).emit('signal:request', { from: socket.id, fromUserId: userId });
      }
    });

    socket.on('signal:stop', (data: any) => {
      const roomId = data?.roomId || data?.room_id;
      if (roomId) {
        socket.to(roomId).emit('signal:stop', { fromUserId: userId });
      }
    });

    // Audio level meter broadcast (Throttled to max 5/sec, volatile)
    socket.on('audio:level', ({ roomId, level }: { roomId: string; level: number }) => {
      const now = Date.now();
      const last = lastLevelEmit.get(userId) || 0;
      if (now - last < 200) return;
      lastLevelEmit.set(userId, now);
      socket.volatile.to(roomId).emit('audio:level', { user_id: userId, level });
    });

    // Ultra-low-latency volatile binary audio broadcast for 200+ audience members
    socket.on('audio:relay_chunk', ({ roomId, chunk }: { roomId: string; chunk: ArrayBuffer }) => {
      if (!roomId || !chunk) return;
      socket.volatile.to(roomId).emit('audio:relay_chunk', {
        speakerId: userId,
        chunk,
      });
    });

    // Profile & Avatar live update
    socket.on('user:update_profile', ({ roomId, display_name, avatar_seed }: { roomId?: string; display_name?: string; avatar_seed?: string }) => {
      const db = getDb();
      const current = db.prepare('SELECT id, display_name, avatar_seed FROM users WHERE id = ?').get(userId) as any;
      if (current) {
        const newDisplayName = display_name?.trim() ? display_name.trim().slice(0, 64) : current.display_name;
        const newAvatar = avatar_seed !== undefined ? avatar_seed.trim().slice(0, 100000) : current.avatar_seed;
        db.prepare('UPDATE users SET display_name = ?, avatar_seed = ? WHERE id = ?').run(newDisplayName, newAvatar, userId);
        
        if (roomId) {
          io!.to(roomId).emit('room:member_updated', {
            user_id: userId,
            display_name: newDisplayName,
            avatar_seed: newAvatar,
          });
        }
      }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
      const currentRoom = (socket as any).currentRoom;
      if (currentRoom) {
        leaveRoom(currentRoom, userId);
        roomRoles.get(currentRoom)?.delete(userId);
        io!.to(currentRoom).emit('room:member_left', { user_id: userId, reason: 'disconnected' });
        emitMemberCountThrottled(currentRoom);
      }
      chatTimestamps.delete(userId);
      lastLevelEmit.delete(userId);
      console.log(`[Socket] Disconnected: user=${userId}`);
    });
  });

  return io;
}
