// Smoke test: connect two WebSocket clients and confirm the server places them
// in the same race with distinct lanes and an identical shared world.
import { WebSocket } from 'ws';

const URL = process.env.URL || 'ws://localhost:3000/ws';
const clients = ['A', 'B'].map((tag) => {
  const ws = new WebSocket(URL);
  const state = { tag, boatId: null, lastWorld: null, states: 0, toasts: 0 };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: `Bot-${tag}` })));
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString());
    if (m.t === 'welcome') state.boatId = m.boatId;
    else if (m.t === 'state') {
      state.states++;
      if (m.s.phase === 'racing') {
        state.lastWorld = m.s.entities.map((e) => `${e.id}:${e.kind}`).join(',');
        // Drive the boat a little so we exercise input handling.
        ws.send(JSON.stringify({ t: 'steer', dir: state.tag === 'A' ? 1 : -1 }));
        if (state.states % 20 === 0) ws.send(JSON.stringify({ t: 'power' }));
      }
    } else if (m.t === 'toast') state.toasts++;
  });
  return state;
});

setTimeout(() => {
  const [a, b] = clients;
  console.log('Client A:', { boatId: a.boatId, states: a.states, toasts: a.toasts });
  console.log('Client B:', { boatId: b.boatId, states: b.states, toasts: b.toasts });
  console.log('Distinct lanes:', a.boatId !== null && b.boatId !== null && a.boatId !== b.boatId);
  console.log('Shared identical world:', !!a.lastWorld && a.lastWorld === b.lastWorld);
  process.exit(0);
}, 16000);
