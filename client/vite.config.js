import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Репозиторий: https://github.com/L3ndyy/message — на GitHub Pages будет по адресу /message/
export default defineConfig({
  plugins: [react()],
  base: '/message/',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
