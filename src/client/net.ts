import { CONFIG } from '../shared/config';
import type { Boat, Entity, GamePhase, GameView, GameController } from '../shared/types';
import type { ClientMsg, ServerMsg, Snapshot, BoatSnap, EntitySnap } from '../shared/protocol';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Interpolate a 0..1 phase taking the shortest way around the wrap. */
function lerpPhase(a: number, b: number, t: number): number {
  let d = b - a;
  if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
  return ((a + d * t) % 1 + 1) % 1;
}

interface Stamped { t: number; s: Snapshot; }

/**
 * Client-side view of a server-run race. Buffers snapshots and renders a short
 * time in the past (INTERP_DELAY_MS) so motion stays smooth between the ~20Hz
 * server updates. Implements the same interfaces as the local `Game`, so the
 * renderer/HUD treat Practice and Multiplayer identically.
 */
export class RemoteGame implements GameView, GameController {
  phase: GamePhase = 'lobby';
  time = 0;
  countdown = 0;
  boats: Boat[] = [];
  entities: Entity[] = [];
  player!: Boat;
  toast: { text: string; until: number } | null = null;
  connected = false;

  private ws: WebSocket | null = null;
  private buf: Stamped[] = [];
  private myBoatId: number | null = null;
  private toastExpiry = 0;

  connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => { this.connected = true; this.send({ t: 'join' }); };
    this.ws.onclose = () => { this.connected = false; };
    this.ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as ServerMsg);
  }

  disconnect(): void { this.ws?.close(); this.ws = null; }

  private send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMessage(msg: ServerMsg): void {
    if (msg.t === 'welcome') {
      this.myBoatId = msg.boatId;
    } else if (msg.t === 'state') {
      this.buf.push({ t: performance.now(), s: msg.s });
      if (this.buf.length > 16) this.buf.shift();
    } else if (msg.t === 'toast') {
      this.toast = { text: msg.text, until: 0 };
      this.toastExpiry = performance.now() + 1400;
    }
  }

  // --- GameController ---
  setSteer(dir: number): void { this.send({ t: 'steer', dir }); }
  triggerPower(): void { this.send({ t: 'power' }); }
  start(): void { /* the server controls when a race starts */ }

  // --- GameView ---
  canPower(): boolean {
    return this.phase === 'racing' && !!this.player
      && this.player.fatigue < CONFIG.MAX_FATIGUE && !this.player.finished;
  }
  results(): Boat[] { return [...this.boats].sort((a, b) => a.rank - b.rank); }

  /** Called once per animation frame to refresh the interpolated view. */
  update(_dt: number): void {
    const now = performance.now();
    if (this.toast && now >= this.toastExpiry) this.toast = null;
    if (this.buf.length === 0) return;

    const renderTime = now - CONFIG.INTERP_DELAY_MS;
    const last = this.buf[this.buf.length - 1];
    let older = this.buf[0];
    let newer = last;
    for (let i = 0; i < this.buf.length - 1; i++) {
      if (this.buf[i].t <= renderTime && this.buf[i + 1].t >= renderTime) {
        older = this.buf[i]; newer = this.buf[i + 1]; break;
      }
    }
    let alpha = newer.t !== older.t
      ? Math.max(0, Math.min(1, (renderTime - older.t) / (newer.t - older.t)))
      : 0;
    if (renderTime >= last.t) { older = newer = last; alpha = 0; }

    const A = older.s, B = newer.s;
    this.phase = B.phase;
    this.time = B.time;
    this.countdown = B.countdown;

    const aBoats = new Map(A.boats.map((b) => [b.id, b]));
    this.boats = B.boats.map((b) => this.toBoat(aBoats.get(b.id) ?? b, b, alpha));

    const aEnts = new Map(A.entities.map((e) => [e.id, e]));
    this.entities = B.entities.map((e) => this.toEntity(aEnts.get(e.id) ?? e, e, alpha));

    this.player = this.boats.find((b) => b.id === this.myBoatId) ?? this.boats[0];
  }

  private toBoat(a: BoatSnap, b: BoatSnap, t: number): Boat {
    return {
      id: b.id, name: b.name, hull: b.hull, accent: b.accent,
      isPlayer: b.id === this.myBoatId,
      x: lerp(a.x, b.x, t), dist: lerp(a.dist, b.dist, t),
      speed: b.speed, fatigue: b.fatigue,
      powerMult: b.powerMult, powerStacks: b.powerStacks, powerUntil: b.powerUntil,
      bankUntil: b.bankUntil, obstUntil: b.obstUntil, collUntil: b.collUntil,
      finished: b.finished, finishTime: b.finishTime, rank: b.rank,
      strokePhase: lerpPhase(a.strokePhase, b.strokePhase, t),
      steerInput: 0,
    };
  }

  private toEntity(a: EntitySnap, b: EntitySnap, t: number): Entity {
    return {
      id: b.id, kind: b.kind, x: lerp(a.x, b.x, t), cy: lerp(a.cy, b.cy, t),
      w: b.w, len: b.len, vx: b.vx, vy: b.vy, withTide: b.withTide, collectedBy: b.collectedBy,
    };
  }
}
