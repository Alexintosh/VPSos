import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000';
const wsTarget = process.env.VITE_WS_PROXY_TARGET || apiTarget.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@vpsos/types': path.resolve(rootDir, 'src/plugins/types.ts'),
      '@vpsos/client': path.resolve(rootDir, 'src/api/client.ts'),
      '@vpsos/useUI': path.resolve(rootDir, 'src/ui/state.ts'),
      '@vpsos/plugins': path.resolve(rootDir, 'src/plugins'),
      '@vpsos/ui': path.resolve(rootDir, 'src/ui'),
      '@vpsos/api': path.resolve(rootDir, 'src/api')
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/ws': {
        target: wsTarget,
        ws: true
      }
    }
  }
});
