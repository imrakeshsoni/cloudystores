import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    allowedHosts: ['.ngrok-free.dev'],
    proxy: {
      '/api/auth':    { target: 'http://localhost:3001', rewrite: (p) => p.replace('/api/auth', '/v1/auth') },
      '/api/tenant':  { target: 'http://localhost:3002', rewrite: (p) => p.replace('/api/tenant', '/v1') },
      '/api/core':    { target: 'http://localhost:3003', rewrite: (p) => p.replace('/api/core', '/v1') },
      '/api/orders':  { target: 'http://localhost:3007', rewrite: (p) => p.replace('/api/orders', '/v1') },
      '/api/reports': { target: 'http://localhost:3008', rewrite: (p) => p.replace('/api/reports', '/v1') },
    },
  },
});
