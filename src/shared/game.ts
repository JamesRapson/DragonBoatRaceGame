import { CONFIG } from './config';
import type { Boat, Entity, GamePhase, GameView, GameController } from './types';
import { Spawner, driftEntities } from './entities';
import { updateAi } from './ai';

const HULLS = [
  { hull: '#D4537E', accent: '#FBEAF0', name: 'You' },
  { hull: '#1D9E75', accent: '#E1F5EE', name: 'Jade' },
  { hull: '#EF9F27', accent: '#FAEEDA', name: 'Amber' },
  { hull: '#378ADD', accent: '#E6F1FB', name: 'Cobalt' },
  { hull: '#7F77DD', accent: '#EEEDFE', name: 'Violet' },
  { hull: '#E24B4A', accent: '#FCEBEB', name: 'Crimson' },
];

/** One toast message queued for the HUD. */
export interface Toast { text: string; until: number; }

export class Game implements GameView, GameController {
  phase: GamePhase = 'ready';
  time = 0; // sim-time in seconds
  boats: Boat[] = [];
  entities: Entity[] = [];
  player!: Boat; // the local player's boat (single-player / client convenience)
  toast: Toast | null = null;

  /** Per-boat toast events this tick — the server routes these to each player. */
  events: { boatId: number; text: string }[] = [];
  /** Index of the boat treated as "the local player" for toast/HUD purposes. */
  localPlayerId = 0;

  private spawner = new Spawner();
  private finishOrder: Boat[] = [];

  /** @param humanCount how many boats (from lane 0) are human-controlled. */
  constructor(humanCount = 1) {
    this.reset(humanCount);
  }

  reset(humanCount = 1): void {
    this.phase = 'ready';
    this.time = 0;
    this.entities = [];
    this.finishOrder = [];
    this.toast = null;
    this.events = [];
    this.spawner.reset();

    const n = CONFIG.NUM_BOATS;
    const spacing = CONFIG.RIVER_WIDTH_M / (n + 1);
    this.boats = [];
    for (let i = 0; i < n; i++) {
      const def = HULLS[i % HULLS.length];
      const human = i < humanCount;
      const boat: Boat = {
        id: i,
        name: def.name,
        hull: def.hull,
        accent: def.accent,
        isPlayer: i === this.localPlayerId,
        x: spacing * (i + 1),
        dist: 0,
        speed: CONFIG.BASE_SPEED_MS,
        fatigue: 0,
        powerMult: 1,
        powerStacks: 0,
        powerUntil: 0,
        bankUntil: 0,
        obstUntil: 0,
        collUntil: 0,
        finished: false,
        finishTime: 0,
        rank: i + 1,
        strokePhase: Math.random(),
        steerInput: 0,
      };
      if (!human) {
        boat.ai = {
          targetX: boat.x,
          retargetAt: 0,
          nextPowerAt: 2 + Math.random() * 4,
          skill: 0.45 + Math.random() * 0.45,
        };
      }
      this.boats.push(boat);
    }
    this.player = this.boats[this.localPlayerId] ?? this.boats[0];
    this.updateRanks();
  }

  /** Begin racing with the boats currently configured (used by the server). */
  beginRace(): void {
    if (this.phase !== 'racing') this.phase = 'racing';
  }

  /** Single-player / client convenience: fresh race with one human (lane 0). */
  start(): void {
    if (this.phase === 'racing') return;
    this.reset(1);
    this.phase = 'racing';
  }

  setSteer(dir: number, id = this.localPlayerId): void {
    const b = this.boats[id];
    if (b) b.steerInput = dir;
  }

  /** Trigger a Power 10 for a given boat (defaults to the local player). */
  triggerPower(id = this.localPlayerId): void {
    if (this.phase !== 'racing') return;
    const b = this.boats[id];
    if (b) this.applyPower(b);
  }

  /** Apply (and stack) a Power 10 to a boat. */
  private applyPower(b: Boat): void {
    if (b.fatigue >= CONFIG.MAX_FATIGUE) return;
    if (this.time >= b.powerUntil) { b.powerMult = 1; b.powerStacks = 0; }
    b.powerMult += CONFIG.POWER10_SPEED_STEP;
    b.powerStacks += 1;
    b.powerUntil = this.time + CONFIG.POWER10_DURATION_S;
    b.fatigue = Math.min(CONFIG.MAX_FATIGUE, b.fatigue + CONFIG.POWER10_FATIGUE_COST);
  }

  canPower(): boolean {
    return this.phase === 'racing' && this.player.fatigue < CONFIG.MAX_FATIGUE;
  }

  private showToast(text: string, boatId: number): void {
    this.events.push({ boatId, text });
    if (boatId === this.player.id) this.toast = { text, until: this.time + 1.4 };
  }

  /** Advance the simulation by `dtReal` real seconds. */
  update(dtReal: number): void {
    if (this.phase !== 'racing') return;
    const dt = Math.min(0.05, dtReal) * CONFIG.SIM_SPEED;
    this.time += dt;
    this.events = [];

    // Keep the world populated around the leader; cull behind the last boat.
    const leadDist = Math.max(...this.boats.map((b) => b.dist));
    const tailDist = Math.min(...this.boats.map((b) => b.dist));
    this.spawner.update(
      this.entities,
      leadDist + CONFIG.VIEW_AHEAD_M + 30,
      tailDist - CONFIG.VIEW_BEHIND_M - 20,
    );
    driftEntities(this.entities, dt);

    // Steering: AI boats decide; human boats use their last input.
    for (const b of this.boats) {
      if (b.finished) continue;
      if (b.ai) {
        updateAi(b, this.entities, this.time, leadDist, (x) => this.applyPower(x), dt);
      } else {
        b.x += b.steerInput * CONFIG.LATERAL_SPEED_MS * dt;
      }
    }

    // Per-boat physics.
    for (const b of this.boats) {
      if (b.finished) continue;
      this.updateBoat(b, dt);
    }

    this.resolveBoatCollisions();
    this.updateRanks();

    if (this.toast && this.time >= this.toast.until) this.toast = null;

    // End the race once every human boat has finished.
    const humans = this.boats.filter((b) => !b.ai);
    if (humans.length > 0 && humans.every((b) => b.finished)) {
      this.phase = 'finished';
    }
  }

  private updateBoat(b: Boat, dt: number): void {
    // Expire Power 10.
    if (this.time >= b.powerUntil) { b.powerMult = 1; b.powerStacks = 0; }

    // Clamp lateral position; hitting a bank costs speed.
    const margin = CONFIG.BOAT_WID_M / 2;
    let hitBank = false;
    if (b.x < margin) { b.x = margin; hitBank = true; }
    if (b.x > CONFIG.RIVER_WIDTH_M - margin) { b.x = CONFIG.RIVER_WIDTH_M - margin; hitBank = true; }
    if (hitBank && this.time >= b.bankUntil) {
      b.bankUntil = this.time + CONFIG.BANK_PENALTY_S;
      this.showToast('Hit the bank! −30%', b.id);
    }

    // Base speed with Power 10 stacks.
    let speed = CONFIG.BASE_SPEED_MS * b.powerMult;

    // Feature interactions.
    let inTide: Entity | null = null;
    for (const e of this.entities) {
      if (!this.overlaps(b, e)) continue;
      if (e.kind === 'tide') {
        inTide = e;
      } else if (e.kind === 'disk') {
        if (e.collectedBy === -1) {
          e.collectedBy = b.id;
          b.fatigue = Math.max(0, b.fatigue - CONFIG.ENERGY_RECOVERY);
          this.showToast('+ Energy! −20 fatigue', b.id);
        }
      } else { // log or fish
        if (this.time >= b.obstUntil) {
          b.obstUntil = this.time + CONFIG.OBSTACLE_PENALTY_S;
          this.showToast(e.kind === 'log' ? 'Hit a log — −30% for 10s' : 'Hit a boat — −30% for 10s', b.id);
        }
      }
    }
    if (inTide) {
      speed *= inTide.withTide ? (1 + CONFIG.TIDE_BOOST) : (1 - CONFIG.TIDE_PENALTY);
    }
    if (this.time < b.bankUntil) speed *= (1 - CONFIG.BANK_PENALTY);
    if (this.time < b.obstUntil) speed *= (1 - CONFIG.OBSTACLE_PENALTY);
    if (this.time < b.collUntil) speed *= (1 - CONFIG.BOAT_COLLISION_PENALTY);

    b.speed = speed;
    b.dist += speed * dt;

    // Paddle animation phase advances with speed (so the crew strokes faster
    // during a Power 10 and slower under a penalty).
    const cadence = (speed / CONFIG.BASE_SPEED_MS) / CONFIG.STROKE_DUR_S;
    b.strokePhase = (b.strokePhase + cadence * dt) % 1;

    // Finish line.
    if (b.dist >= CONFIG.RACE_LENGTH_M && !b.finished) {
      b.dist = CONFIG.RACE_LENGTH_M;
      b.finished = true;
      b.finishTime = this.time;
      this.finishOrder.push(b);
    }
  }

  /** Axis-aligned overlap between a boat and a feature, in metres. */
  private overlaps(b: Boat, e: Entity): boolean {
    const dx = Math.abs(b.x - e.x);
    const dy = Math.abs(b.dist - e.cy);
    return dx < (CONFIG.BOAT_WID_M + e.w) / 2 && dy < (CONFIG.BOAT_LEN_M + e.len) / 2;
  }

  /** Detect boat-on-boat contact and apply a shared penalty. */
  private resolveBoatCollisions(): void {
    const list = this.boats.filter((b) => !b.finished);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], c = list[j];
        const dx = Math.abs(a.x - c.x);
        const dy = Math.abs(a.dist - c.dist);
        if (dx < CONFIG.BOAT_WID_M && dy < CONFIG.BOAT_LEN_M) {
          // Nudge apart laterally.
          const push = (CONFIG.BOAT_WID_M - dx) / 2 + 0.05;
          const dir = a.x <= c.x ? -1 : 1;
          a.x += dir * push; c.x -= dir * push;
          if (this.time >= a.collUntil || this.time >= c.collUntil) {
            a.collUntil = this.time + CONFIG.BOAT_COLLISION_S;
            c.collUntil = this.time + CONFIG.BOAT_COLLISION_S;
            this.showToast('Boats collided! −30%', a.id);
            this.showToast('Boats collided! −30%', c.id);
          }
        }
      }
    }
  }

  /** Race positions: finished boats by finish time, then the rest by distance. */
  private updateRanks(): void {
    const sorted = [...this.boats].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
    sorted.forEach((b, i) => (b.rank = i + 1));
  }

  /** Final standings (only valid once finished). */
  results(): Boat[] {
    return [...this.boats].sort((a, b) => a.rank - b.rank);
  }
}
