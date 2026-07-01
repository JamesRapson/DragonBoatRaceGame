import './style.css';
import { Game } from '../shared/game';
import type { GameController, GameView } from '../shared/types';
import { Renderer } from './render';
import { Hud } from './hud';
import { bindInput } from './input';
import { RemoteGame } from './net';

type Active = (GameView & GameController & { update(dt: number): void });

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const hud = new Hud();

// Start in a paused local lineup so the menu has the river behind it.
let active: Active = new Game(1);
let remote: RemoteGame | null = null;

bindInput(() => active);

document.getElementById('btn-practice')!.addEventListener('click', () => {
  remote?.disconnect();
  remote = null;
  const g = new Game(1);
  g.start();
  active = g;
});

document.getElementById('btn-multiplayer')!.addEventListener('click', () => {
  // Reuse the existing connection if we're already in multiplayer — opening a
  // second WebSocket would register the user as a duplicate player and leave a
  // zombie holding a boat lane while the client controls a lane-less spectator.
  if (remote?.connected) { active = remote; return; }
  remote?.disconnect();
  const r = new RemoteGame();
  r.connect();
  remote = r;
  active = r;
});

function resize(): void { renderer.resize(); }
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  try {
    active.update(dt);
    renderer.render(active);
    hud.update(active, active === remote);
  } catch (err) {
    console.error('frame error', err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
