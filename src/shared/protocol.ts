import type { Boat, Entity, GamePhase } from './types';

/** Messages sent from a client to the server. */
export type ClientMsg =
  | { t: 'join'; name?: string }
  | { t: 'steer'; dir: number }
  | { t: 'power' };

/** Boat fields needed to render — excludes server-only ai/steerInput. */
export type BoatSnap = Pick<
  Boat,
  | 'id' | 'name' | 'hull' | 'accent' | 'x' | 'dist' | 'speed' | 'fatigue'
  | 'powerMult' | 'powerStacks' | 'powerUntil' | 'bankUntil' | 'obstUntil'
  | 'collUntil' | 'finished' | 'finishTime' | 'rank' | 'strokePhase'
>;

export type EntitySnap = Pick<
  Entity,
  'id' | 'kind' | 'x' | 'cy' | 'w' | 'len' | 'vx' | 'vy' | 'withTide' | 'collectedBy'
>;

/** Full world state broadcast each server tick. */
export interface Snapshot {
  phase: GamePhase;
  time: number;
  countdown: number; // seconds left in lobby/countdown (0 when racing)
  boats: BoatSnap[];
  entities: EntitySnap[];
}

/** Messages sent from the server to a client. */
export type ServerMsg =
  | { t: 'welcome'; boatId: number } // your assigned lane for this race
  | { t: 'state'; s: Snapshot }
  | { t: 'toast'; text: string };

export function snapBoat(b: Boat): BoatSnap {
  return {
    id: b.id, name: b.name, hull: b.hull, accent: b.accent, x: b.x, dist: b.dist,
    speed: b.speed, fatigue: b.fatigue, powerMult: b.powerMult, powerStacks: b.powerStacks,
    powerUntil: b.powerUntil, bankUntil: b.bankUntil, obstUntil: b.obstUntil,
    collUntil: b.collUntil, finished: b.finished, finishTime: b.finishTime,
    rank: b.rank, strokePhase: b.strokePhase,
  };
}

export function snapEntity(e: Entity): EntitySnap {
  return {
    id: e.id, kind: e.kind, x: e.x, cy: e.cy, w: e.w, len: e.len,
    vx: e.vx, vy: e.vy, withTide: e.withTide, collectedBy: e.collectedBy,
  };
}
