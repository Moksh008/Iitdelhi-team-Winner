import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'https://satark-backend-sf2b.onrender.com',
        changeOrigin: true
      },
      '/ws': {
        target: 'wss://satark-backend-sf2b.onrender.com',
        ws: true,
        changeOrigin: true
      }
    }
  }
});
