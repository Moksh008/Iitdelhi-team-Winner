import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app needs no backend: analysis runs on the device and nearby search uses
// public OpenStreetMap services directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
});
