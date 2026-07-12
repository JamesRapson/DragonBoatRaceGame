import { CONFIG } from './config';
import type { Boat, Entity } from './types';

/**
 * Lightweight AI for rival boats: wander toward a target lane, dodge the
 * nearest hazard ahead, drift toward helpful tides / energy disks, and hold
 * Power 10 in bursts (more aggressively when trailing), easing off before
 * fatigue maxes out.
 */
export function updateAi(
  boat: Boat,
  entities: Entity[],
  time: number,
  leaderDist: number,
  dt: number,
): void {
  const ai = boat.ai;
  if (!ai) return;

  // Periodically choose a new lane to aim for.
  if (time >= ai.retargetAt) {
    ai.targetX = 12 + Math.random() * (CONFIG.RIVER_WIDTH_M - 24);
    ai.retargetAt = time + 1.5 + Math.random() * 2.5;
  }

  // Look ahead for the most relevant feature and bias the target lane.
  let nearestHazard: Entity | null = null;
  let nearestHazardGap = Infinity;
  let bestHelper: Entity | null = null;
  let bestHelperGap = Infinity;

  for (const e of entities) {
    const gap = e.cy - boat.dist; // metres ahead
    if (gap < 1 || gap > 30) continue;
    const dx = Math.abs(e.x - boat.x);
    if (e.kind === 'log' || e.kind === 'fish') {
      if (dx < 10 && gap < nearestHazardGap) { nearestHazard = e; nearestHazardGap = gap; }
    } else if (e.kind === 'disk' || (e.kind === 'tide' && e.withTide)) {
      if (dx < 22 && gap < bestHelperGap) { bestHelper = e; bestHelperGap = gap; }
    }
  }

  let target = ai.targetX;
  if (bestHelper) target = bestHelper.x;
  if (nearestHazard) {
    // Steer to whichever side has more room.
    const room = nearestHazard.x;
    target = room > CONFIG.RIVER_WIDTH_M / 2
      ? nearestHazard.x - 14
      : nearestHazard.x + 14;
  }
  ai.targetX = Math.max(6, Math.min(CONFIG.RIVER_WIDTH_M - 6, target));

  // Steer toward the target lane, accuracy scaled by skill.
  const diff = ai.targetX - boat.x;
  const step = CONFIG.LATERAL_SPEED_MS * (0.55 + ai.skill * 0.45) * dt;
  boat.x += Math.sign(diff) * Math.min(Math.abs(diff), step);

  // Hold Power 10 in bursts: start sprinting when fresh and eager, then ease
  // off before fatigue maxes so there's something left in reserve.
  if (boat.powering) {
    if (boat.fatigue > 75) boat.powering = false;
  } else if (time >= ai.nextPowerAt && boat.fatigue < 55) {
    const trailing = leaderDist - boat.dist; // metres behind the leader
    const eagerness = ai.skill * 0.5 + (trailing > 20 ? 0.4 : 0.1);
    if (Math.random() < eagerness) boat.powering = true;
    ai.nextPowerAt = time + 1 + Math.random() * 3;
  }
}
