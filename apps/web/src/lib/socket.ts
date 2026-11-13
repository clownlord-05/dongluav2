import { io, Socket } from 'socket.io-client';

// In production, connect to the backend URL (Fly.io)
// In development, connect to '/' which is proxied by Vite to localhost:3001
const BACKEND_URL = import.meta.env.VITE_API_URL || '/';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(BACKEND_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      path: '/socket.io',
    });
  }
  return socket;
}

export function connectSocket(token: string) {
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export default getSocket;
