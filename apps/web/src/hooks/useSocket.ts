import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';

export function useSocket(): Socket {
  const token = useAuthStore((s) => s.token);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;
    const s = connectSocket(token);
    socketRef.current = s;

    s.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });

    return () => {
      // Don't disconnect on unmount of a single component; disconnect is managed elsewhere
    };
  }, [token]);

  return getSocket();
}

export function useSocketDisconnect() {
  return disconnectSocket;
}
