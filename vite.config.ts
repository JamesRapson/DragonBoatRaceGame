import { defineConfig } from 'vite';

// In development, Vite serves the client on 5173 and proxies the WebSocket
// path to the game server on 3000. In production the Node server serves both
// the built client and /ws on a single port, so no proxy is involved.
export default defineConfig({
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
