/**
 * Central tuning constants for the dragon boat race.
 * Every value that may need experimentation lives here so the feel of the
 * game can be adjusted in one place.
 */
export const CONFIG = {
  // --- Course ---
  RACE_LENGTH_M: 500, // distance from start to finish line
  RIVER_WIDTH_M: 100, // playable width of the river
  VIEW_AHEAD_M: 50, // how far ahead of the player the screen shows
  VIEW_BEHIND_M: 50, // how far behind the player the screen shows

  // --- Boats ---
  NUM_BOATS: 4,
  BASE_SPEED_MS: 3, // base forward speed of every boat
  LATERAL_SPEED_MS: 6, // how fast a boat slides left/right when steering
  BOAT_LEN_M: 10, // length of a dragon boat (along the river)
  BOAT_WID_M: 2.5, // width of a dragon boat (across the river)

  // Pace multiplier — scales the whole simulation clock. 1 = real seconds.
  SIM_SPEED: 2.4,

  // --- Power 10 ---
  POWER10_SPEED_STEP: 0.30, // each press adds +20% speed
  POWER10_DURATION_S: 10, // duration of the boost (refreshed on each press)
  POWER10_FATIGUE_COST: 20, // fatigue added per press
  MAX_FATIGUE: 100, // Power 10 disabled at this fatigue level

  // --- Tides ---
  TIDE_BOOST: 0.25, // +15% when travelling with the tide
  TIDE_PENALTY: 0.25, // -15% when travelling against the tide
  TIDE_MIN_LEN_M: 30, // minimum length (along the river)
  TIDE_MAX_LEN_M: 60, // maximum length (along the river)
  TIDE_MIN_W_M: 8, // minimum width (across the river)
  TIDE_MAX_W_M: 20, // maximum width (across the river)
  TIDE_GAP_M: 12, // minimum gap so tides never overlap

  // --- Energy disks ---
  ENERGY_RECOVERY: 20, // fatigue removed when a disk is collected
  DISK_SIZE_M: 3,

  // --- Logs ---
  LOG_SPEED_MS: 1.5, // logs drift slowly across the river
  LOG_WIDTH_M: 8, // span across the river
  LOG_THICK_M: 1, // thickness along the river

  // --- Fishing boats ---
  FISH_SPEED_MS: 4,
  FISH_LEN_M: 12.0, 
  FISH_WID_M: 4.0,

  // --- Penalties ---
  BANK_PENALTY: 0.30, // -30% speed for hitting the bank
  BANK_PENALTY_S: 5,
  OBSTACLE_PENALTY: 0.30, // -30% speed for hitting a log / fishing boat
  OBSTACLE_PENALTY_S: 10,
  BOAT_COLLISION_PENALTY: 0.30, // -30% speed when two boats collide
  BOAT_COLLISION_S: 5,

  // --- Spawning density ---
  // How many of each feature appear within every 100 m section of river. For
  // each section a count is rolled uniformly in [min, max] per category.
  // "obstacle" covers logs and fishing boats combined.
  DENSITY_PER_100M: {
    disk: { min: 1, max: 3 },
    obstacle: { min: 1, max: 3 },
    tide: { min: 2, max: 5 },
  } as Record<'disk' | 'obstacle' | 'tide', { min: number; max: number }>,
  // Of the obstacles spawned, the fraction that are fishing boats (rest are logs).
  OBSTACLE_FISH_FRACTION: 0.5,
  // Generation advances the river one metre at a time. For each new metre we
  // look back 100 m and count each category: below min always adds one, at/above
  // max never does. In between, this is the per-metre chance of adding another
  // (0 hugs the minimum; higher pushes density toward the maximum).
  SPAWN_FILL_CHANCE_PER_M: 0.03,

  // --- Multiplayer ---
  SERVER_TICK_HZ: 20, // server simulation/broadcast rate
  LOBBY_COUNTDOWN_S: 20, // join window before a race starts
  RESULTS_DISPLAY_S: 10, // how long results show before the next race
  INTERP_DELAY_MS: 120, // client renders this far in the past to smooth jitter

  // --- Visuals ---
  PADDLES_PER_SIDE: 10,
  STROKE_DUR_S: 0.8, // time for one full paddle stroke at base speed
  STROKE_ANGLE_DEG: 24, // paddle sweep amplitude
} as const;

export type Config = typeof CONFIG;
