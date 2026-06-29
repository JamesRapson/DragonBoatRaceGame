# Dragon Boat Race

A real-time multiplayer, browser-based dragon boat racing game. Race up a 500 m
river, dodging logs, fishing boats and tides, managing fatigue against the
**Power 10** boost — first across the finish line wins.

Built with **TypeScript + HTML5 Canvas + Vite** (client) and a **Node + `ws`**
authoritative game server. No UI framework, no Redis — designed to run on a
single host.

## Run it (development)

```bash
npm install
npm run dev      # game server on :3000, client on http://localhost:5173 (proxies /ws → :3000)
```

Open the client, choose **Practice vs AI** (local simulation) or **Multiplayer**
(joins a race on the server). Open the URL in two tabs to race against yourself.

```bash
npm run build    # type-check (client + server) and bundle the client into dist/
npm start        # production: one Node process serves dist/ AND /ws on $PORT (default 3000)
npm test         # (node test/two-clients.mjs) two-client multiplayer smoke test
```

See [DEPLOY.md](DEPLOY.md) for hosting on a single AWS EC2 instance.

## How to play

- Steer with the arrow keys (or `A`/`D`, or the on-screen buttons).
- **Power 10** (button or `Space`): +speed for 10 s, +fatigue; stack it by tapping
  again. Disabled at 100 fatigue.
- **Tides** — *brighter/thicker* ripples speed you up, *darker/thinner* slow you down.
- **Logs / fishing boats** cost speed on contact; **energy disks** (gold) cut fatigue.
- Hitting a **bank** or another **boat** costs speed too.

## Architecture

Server-authoritative: the server runs the one true simulation at a fixed tick,
owns the random world, and broadcasts state; clients send input and render
interpolated snapshots. Empty lanes are filled with AI.

```
src/shared/   simulation, shared by client & server (DOM-free)
  config.ts     ALL tuning constants (CONFIG)
  types.ts      model types + GameView / GameController interfaces
  entities.ts   spawning/culling (frontier-based; tides never overlap)
  ai.ts         rival-boat AI
  game.ts       authoritative simulation (physics, collisions, ranking, finish)
  protocol.ts   client/server message + snapshot types

src/client/   browser
  render.ts     canvas rendering (water/grass/tide patterns, paddling boats)
  hud.ts        DOM HUD overlay
  input.ts      keyboard + on-screen controls
  net.ts        RemoteGame — ws client + snapshot interpolation (a GameView)
  main.ts       bootstrap, mode switch (Practice / Multiplayer), rAF loop

server/
  index.ts      http (serves dist/) + WebSocket upgrade on /ws + tick loop
  room.ts       lobby → countdown → race → results, AI lane-fill, input routing
```

Both the local `Game` and the networked `RemoteGame` implement the same
`GameView`/`GameController`, so the renderer, HUD and input are identical in
Practice and Multiplayer.

## Tuning

Everything adjustable lives in `src/shared/config.ts` (`CONFIG`): `SIM_SPEED`,
`BASE_SPEED_MS`, `POWER10_*`, tide/obstacle/penalty effects, `SPAWN_WEIGHTS`,
and the multiplayer knobs (`SERVER_TICK_HZ`, `LOBBY_COUNTDOWN_S`,
`RESULTS_DISPLAY_S`, `INTERP_DELAY_MS`).
