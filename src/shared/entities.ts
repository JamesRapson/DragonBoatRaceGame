import { CONFIG } from './config';
import type { Entity, EntityKind } from './types';

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

type Category = 'disk' | 'obstacle' | 'tide';
const START_CLEAR_M = 12; // keep the start line clear of features
const WINDOW_M = 100; // look-back distance for density counting

/**
 * Spawns and culls world features (logs, fishing boats, tides, energy disks).
 *
 * Generation advances the river one metre at a time, just ahead of the boats.
 * For each new metre we look back over the previous 100 m and count the
 * entities of each category. Per `CONFIG.DENSITY_PER_100M`:
 *   - below the minimum  → add one (randomly placed in this metre)
 *   - at/above the maximum → add none
 *   - in between          → add with probability `SPAWN_FILL_CHANCE_PER_M`
 * This keeps any rolling 100 m of river within the configured min/max.
 */
export class Spawner {
  private frontier = 0; // next metre of course to generate (m from start)
  private nextId = 1;

  constructor(private readonly width = CONFIG.RIVER_WIDTH_M) {}

  reset(): void {
    this.frontier = 0;
    this.nextId = 1;
  }

  /** Generate metres up to `aheadTo`; cull features out of range. */
  update(entities: Entity[], aheadTo: number, cullBelow: number): void {
    const cullAbove = aheadTo + 40;
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i];
      if (e.cy + e.len / 2 < cullBelow || e.cy - e.len / 2 > cullAbove) entities.splice(i, 1);
    }
    const limit = Math.min(aheadTo, CONFIG.RACE_LENGTH_M - 5);
    let guard = 0;
    while (this.frontier < limit && guard++ < 2000) {
      this.fillMetre(this.frontier, entities);
      this.frontier += 1;
    }
  }

  /** Consider adding one of each category for the metre ending at `cy`. */
  private fillMetre(cy: number, entities: Entity[]): void {
    if (cy < START_CLEAR_M) return;
    this.consider('tide', cy, entities);
    this.consider('disk', cy, entities);
    this.consider('obstacle', cy, entities);
  }

  /** Count entities of a category whose centre lies in (cy-100, cy]. */
  private countInWindow(category: Category, cy: number, entities: Entity[]): number {
    const lo = cy - WINDOW_M;
    let n = 0;
    for (const e of entities) {
      if (e.cy <= cy && e.cy > lo && this.categoryOf(e.kind) === category) n++;
    }
    return n;
  }

  private categoryOf(kind: EntityKind): Category {
    if (kind === 'tide') return 'tide';
    if (kind === 'disk') return 'disk';
    return 'obstacle';
  }

  private consider(category: Category, cy: number, entities: Entity[]): void {
    const range = CONFIG.DENSITY_PER_100M[category];
    const count = this.countInWindow(category, cy, entities);

    let add: boolean;
    if (count < range.min) add = true;
    else if (count >= range.max) add = false;
    else add = Math.random() < CONFIG.SPAWN_FILL_CHANCE_PER_M;
    if (!add) return;

    // Place randomly within the metre just generated (kept <= cy so it counts
    // in subsequent look-back windows immediately).
    const pos = cy - Math.random();
    if (category === 'tide') {
      const e = this.make('tide', pos);
      if (this.tideFits(e, pos, entities)) entities.push(e);
    } else if (category === 'disk') {
      entities.push(this.make('disk', pos));
    } else {
      const kind: EntityKind = Math.random() < CONFIG.OBSTACLE_FISH_FRACTION ? 'fish' : 'log';
      entities.push(this.make(kind, pos));
    }
  }

  /** True if a tide at `pos` clears every existing tide (no overlap + gap). */
  private tideFits(e: Entity, pos: number, entities: Entity[]): boolean {
    return !entities.some((o) => o.kind === 'tide'
      && Math.abs(o.cy - pos) < (o.len + e.len) / 2 + CONFIG.TIDE_GAP_M);
  }

  private make(kind: EntityKind, cy: number): Entity {
    const id = this.nextId++;
    const base: Entity = {
      id, kind, x: 0, cy, w: 0, len: 0, vx: 0, vy: 0, withTide: false, collectedBy: -1,
    };
    // Give drifting features a velocity in a random direction.
    const drift = (speed: number) => {
      const ang = Math.random() * Math.PI * 2;
      base.vx = Math.cos(ang) * speed;
      base.vy = Math.sin(ang) * speed;
    };
    switch (kind) {
      case 'log':
        base.w = CONFIG.LOG_WIDTH_M;
        base.len = CONFIG.LOG_THICK_M;
        base.x = rand(base.w / 2, this.width - base.w / 2);
        drift(CONFIG.LOG_SPEED_MS);
        break;
      case 'fish':
        base.w = CONFIG.FISH_WID_M;
        base.len = CONFIG.FISH_LEN_M;
        base.x = rand(base.w / 2, this.width - base.w / 2);
        drift(CONFIG.FISH_SPEED_MS);
        break;
      case 'disk':
        base.w = CONFIG.DISK_SIZE_M;
        base.len = CONFIG.DISK_SIZE_M;
        base.x = rand(6, this.width - 6);
        break;
      case 'tide':
        base.w = rand(CONFIG.TIDE_MIN_W_M, CONFIG.TIDE_MAX_W_M);
        base.len = rand(CONFIG.TIDE_MIN_LEN_M, CONFIG.TIDE_MAX_LEN_M);
        base.x = rand(base.w / 2, this.width - base.w / 2);
        base.withTide = Math.random() < 0.5;
        break;
    }
    return base;
  }
}

/** Move drifting features (logs and fishing boats) and bounce them off the banks. */
export function driftEntities(entities: Entity[], dt: number): void {
  for (const e of entities) {
    if (e.vx === 0 && e.vy === 0) continue;
    e.x += e.vx * dt;
    e.cy += e.vy * dt; // drift along the river too
    const lo = e.w / 2;
    const hi = CONFIG.RIVER_WIDTH_M - e.w / 2;
    if (e.x < lo) { e.x = lo; e.vx = -e.vx; }
    else if (e.x > hi) { e.x = hi; e.vx = -e.vx; }
  }
}
