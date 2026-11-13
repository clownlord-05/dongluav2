import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core (rarely changes → long cache TTL)
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Zustand state (tiny)
          'vendor-state': ['zustand'],
          // Socket.IO client
          'vendor-socket': ['socket.io-client'],
          // Lucide icons (biggest single contributor after react-dom)
          'vendor-icons': ['lucide-react'],
          // LiveKit components
          'vendor-livekit': ['@livekit/components-react'],
        },
      },
    },
  },
});
