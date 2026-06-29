import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import sirv from 'sirv';
import { CONFIG } from '../src/shared/config';
import type { ClientMsg, ServerMsg } from '../src/shared/protocol';
import { Room, type Conn } from './room';

const PORT = Number(process.env.PORT) || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

// Serve the built client if it exists (production). In dev, Vite serves it and
// proxies /ws here, so a missing dist/ is fine.
type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
const serveStatic: Handler = existsSync(distDir)
  ? (sirv(distDir, { single: true, gzip: true }) as unknown as Handler)
  : (_req, _res, next) => next();

const http = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
  serveStatic(req, res, () => { res.writeHead(404); res.end('Not found'); });
});

const wss = new WebSocketServer({ noServer: true });
const room = new Room();

http.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.split('?')[0] === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws: WebSocket) => {
  const conn: Conn = {
    send(msg: ServerMsg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  room.addPlayer(conn);
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMsg;
      room.onMessage(conn, msg);
    } catch {
      /* ignore malformed messages */
    }
  });
  ws.on('close', () => room.removePlayer(conn));
  ws.on('error', () => room.removePlayer(conn));
});

// Authoritative tick loop.
const dt = 1 / CONFIG.SERVER_TICK_HZ;
setInterval(() => room.tick(dt), 1000 / CONFIG.SERVER_TICK_HZ);

http.listen(PORT, () => {
  console.log(`Dragon Boat server on http://localhost:${PORT}  (ws path: /ws)`);
});
