import { CONFIG } from '../src/shared/config';
import { Game } from '../src/shared/game';
import type { GamePhase } from '../src/shared/types';
import { snapBoat, snapEntity } from '../src/shared/protocol';
import type { ClientMsg, ServerMsg, Snapshot } from '../src/shared/protocol';

/** A connected client the room can send messages to. */
export interface Conn {
  send(msg: ServerMsg): void;
}

interface Player {
  conn: Conn;
  name: string;
  boatId: number | null; // assigned lane for the current race, or null (spectating)
}

type RoomPhase = 'idle' | 'countdown' | 'racing' | 'finished';

/**
 * A single race room: collects players in a join window, fills empty lanes with
 * AI, runs the authoritative simulation, broadcasts state, then loops to the
 * next race. One instance per server (single EC2 box, no Redis needed).
 */
export class Room {
  private players: Player[] = [];
  private game = new Game(1);
  private phase: RoomPhase = 'idle';
  private clock = 0; // seconds since server start (tick-accumulated)
  private phaseEnds = 0; // clock time the current phase ends

  addPlayer(conn: Conn): void {
    this.players.push({ conn, name: 'Racer', boatId: null });
    if (this.phase === 'idle') this.beginCountdown();
  }

  removePlayer(conn: Conn): void {
    const i = this.players.findIndex((p) => p.conn === conn);
    if (i < 0) return;
    const [p] = this.players.splice(i, 1);
    // If they were racing, hand their boat to the AI so the race still ends.
    if (p.boatId != null && this.phase === 'racing') {
      const b = this.game.boats[p.boatId];
      if (b && !b.finished && !b.ai) {
        b.ai = { targetX: b.x, retargetAt: 0, nextPowerAt: this.game.time + 3, skill: 0.6 };
      }
    }
    if (this.players.length === 0) this.phase = 'idle';
  }

  onMessage(conn: Conn, msg: ClientMsg): void {
    const p = this.players.find((x) => x.conn === conn);
    if (!p) return;
    switch (msg.t) {
      case 'join':
        if (msg.name) p.name = msg.name.slice(0, 16);
        break;
      case 'steer':
        if (p.boatId != null) this.game.setSteer(Math.sign(msg.dir), p.boatId);
        break;
      case 'power':
        if (p.boatId != null) this.game.triggerPower(p.boatId);
        break;
    }
  }

  /** Advance the room by `dt` real seconds (called by the server tick loop). */
  tick(dt: number): void {
    this.clock += dt;
    switch (this.phase) {
      case 'countdown':
        if (this.clock >= this.phaseEnds) this.startRace();
        break;
      case 'racing':
        this.game.update(dt);
        this.routeEvents();
        if (this.game.phase === 'finished') {
          this.phase = 'finished';
          this.phaseEnds = this.clock + CONFIG.RESULTS_DISPLAY_S;
        }
        break;
      case 'finished':
        if (this.clock >= this.phaseEnds) {
          if (this.players.length > 0) this.beginCountdown();
          else this.phase = 'idle';
        }
        break;
    }
    if (this.players.length > 0) this.broadcast();
  }

  private beginCountdown(): void {
    this.phase = 'countdown';
    this.phaseEnds = this.clock + CONFIG.LOBBY_COUNTDOWN_S;
    this.game.reset(1); // a fresh lineup to show while waiting
    for (const p of this.players) p.boatId = null;
  }

  private startRace(): void {
    const humanCount = Math.min(this.players.length, CONFIG.NUM_BOATS);
    this.game.reset(humanCount);
    this.players.forEach((p, i) => {
      p.boatId = i < humanCount ? i : null;
      if (p.boatId != null) {
        const b = this.game.boats[p.boatId];
        b.name = p.name;
        p.conn.send({ t: 'welcome', boatId: p.boatId });
      }
    });
    this.game.beginRace();
    this.phase = 'racing';
  }

  private routeEvents(): void {
    if (this.game.events.length === 0) return;
    for (const ev of this.game.events) {
      const p = this.players.find((x) => x.boatId === ev.boatId);
      if (p) p.conn.send({ t: 'toast', text: ev.text });
    }
  }

  private broadcast(): void {
    const phase: GamePhase =
      this.phase === 'idle' ? 'lobby'
      : this.phase === 'countdown' ? 'countdown'
      : this.phase === 'racing' ? 'racing'
      : 'finished';
    const countdown = this.phase === 'countdown'
      ? Math.max(0, Math.ceil(this.phaseEnds - this.clock))
      : 0;
    const snap: Snapshot = {
      phase,
      time: this.game.time,
      countdown,
      boats: this.game.boats.map(snapBoat),
      entities: this.game.entities.map(snapEntity),
    };
    const msg: ServerMsg = { t: 'state', s: snap };
    for (const p of this.players) p.conn.send(msg);
  }
}
