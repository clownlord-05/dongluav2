import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

import { initDb } from './db';
import { initSocket } from './socket';
import authRoutes from './routes/auth';
import roomsRoutes from './routes/rooms';
import participantsRoutes from './routes/participants';
import handRequestsRoutes from './routes/handRequests';
import songsRoutes from './routes/songs';
import youtubeRoutes from './routes/youtube';

const PORT = parseInt(process.env.PORT || '3001', 10);
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map(s => s.trim());

async function bootstrap() {
  // 1. Initialize SQLite database with WebAssembly
  await initDb();

  const app = express();
  const server = http.createServer(app);

  // 2. Middleware
  app.use(cors({
    origin: CORS_ORIGIN.includes('*') ? '*' : CORS_ORIGIN,
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} - ${Date.now() - start}ms`);
    });
    next();
  });

  // 3. API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomsRoutes);
  app.use('/api/rooms', participantsRoutes);
  app.use('/api/rooms', handRequestsRoutes);
  app.use('/api/rooms', songsRoutes);
  app.use('/api/youtube', youtubeRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'DONG LUA V2 - HAY NGHE TAO HET API',
      timestamp: new Date().toISOString(),
    });
  });

  // Serve static frontend if built
  const possibleWebPaths = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(__dirname, '../web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(process.cwd(), '../../apps/web/dist'),
  ];
  const finalDistPath = possibleWebPaths.find((p) => fs.existsSync(p)) || null;

  if (finalDistPath) {
    app.use(express.static(finalDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(finalDistPath, 'index.html'));
    });
  }

  // 4. Initialize Socket.IO
  initSocket(server);

  // 5. Start Server
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`
=====================================================
  🔥 ĐỐNG LỬA V2 – HÃY NGHE TAO HÉT BACKEND STARTED
  🚀 Server URL: http://localhost:${PORT}
  📡 WebSocket:  ws://localhost:${PORT}
  🎵 LiveKit:    ${process.env.LIVEKIT_URL || 'Not configured (using WebRTC signaling fallback)'}
  CORS Origins:  ${CORS_ORIGIN.join(', ')}
=====================================================
    `);
  });
}

bootstrap().catch(err => {
  console.error('[Bootstrap] Fatal startup error:', err);
  process.exit(1);
});
