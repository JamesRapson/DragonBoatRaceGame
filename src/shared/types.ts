/** Shared types for the game model. */

/** A racing boat (player or AI). */
export interface Boat {
  id: number;
  name: string;
  hull: string; // hull colour
  accent: string; // paddle / trim colour
  isPlayer: boolean;

  x: number; // lateral position across the river, 0..RIVER_WIDTH_M
  dist: number; // distance travelled along the river, 0..RACE_LENGTH_M
  speed: number; // current effective forward speed (m/s)
  fatigue: number; // 0..100

  // Power 10 state — held to sprint (continuous boost while true)
  powering: boolean; // is the Power 10 currently held/active

  // Penalty timers (sim-time when each penalty ends)
  bankUntil: number;
  obstUntil: number;
  collUntil: number;

  finished: boolean;
  finishTime: number; // sim-time the boat crossed the line
  rank: number; // 1-based race position

  strokePhase: number; // 0..1 paddle animation phase

  steerInput: number; // -1/0/+1 lateral input for human-controlled boats

  // AI-only fields (absent for human-controlled boats)
  ai?: AiState;
}

export interface AiState {
  targetX: number; // lateral position the AI is steering toward
  retargetAt: number; // sim-time to pick a new target
  nextPowerAt: number; // sim-time the AI may consider a Power 10
  skill: number; // 0..1, affects steering accuracy and aggression
}

export type EntityKind = 'log' | 'fish' | 'disk' | 'tide';

/** A world feature fixed to a position along the course. */
export interface Entity {
  id: number;
  kind: EntityKind;
  x: number; // lateral centre, 0..RIVER_WIDTH_M
  cy: number; // course position of centre (metres from start line)
  w: number; // width across the river (m)
  len: number; // length along the river (m)
  vx: number; // lateral drift velocity (m/s) — logs & fish only
  vy: number; // along-river drift velocity (m/s) — logs & fish only
  withTide: boolean; // tide direction: true = with the boats (boost)
  collectedBy: number; // disk: id of boat that took it, -1 otherwise
}

export type GamePhase = 'ready' | 'lobby' | 'countdown' | 'racing' | 'finished';

/**
 * Read-only view of a race, consumed by the renderer and HUD. Both the local
 * single-player `Game` and the networked `RemoteGame` implement this, so the
 * presentation layer is identical for Practice and Multiplayer.
 */
export interface GameView {
  phase: GamePhase;
  time: number;
  boats: Boat[];
  entities: Entity[];
  player: Boat;
  toast: { text: string; until: number } | null;
  countdown?: number; // seconds remaining in a lobby/countdown, if any
  canPower(): boolean;
  results(): Boat[];
}

/** Write side: player input + race control. */
export interface GameController {
  setSteer(dir: number): void;
  setPower(on: boolean): void; // hold to sprint: true while held, false on release
  start(): void;
}
