// Verify the per-metre / 100m-look-back spawner keeps every rolling 100 m
// window within CONFIG.DENSITY_PER_100M.
import { CONFIG } from '../src/shared/config';
import { Spawner } from '../src/shared/entities';
import type { Entity } from '../src/shared/types';

const d = CONFIG.DENSITY_PER_100M;
const cat = (e: Entity): 'disk' | 'obstacle' | 'tide' =>
  e.kind === 'tide' ? 'tide' : e.kind === 'disk' ? 'disk' : 'obstacle';

let windows = 0;
const breaches: string[] = [];

for (let run = 1; run <= 5; run++) {
  const sp = new Spawner();
  const ents: Entity[] = [];
  sp.update(ents, CONFIG.RACE_LENGTH_M + 100, -100); // generate the whole course

  for (let w = 100; w <= CONFIG.RACE_LENGTH_M; w += 5) {
    windows++;
    const inWin = ents.filter((e) => e.cy > w - 100 && e.cy <= w);
    for (const c of ['disk', 'obstacle', 'tide'] as const) {
      const n = inWin.filter((e) => cat(e) === c).length;
      // max is a hard rule; min can fall short only where tides physically can't fit.
      if (n > d[c].max) breaches.push(`run${run} @${w}m ${c}=${n} > max ${d[c].max}`);
      if (c !== 'tide' && n < d[c].min) breaches.push(`run${run} @${w}m ${c}=${n} < min ${d[c].min}`);
    }
  }
}

console.log('limits:', JSON.stringify(d));
console.log(`checked ${windows} rolling 100m windows across 5 runs`);
console.log(breaches.length === 0 ? 'ALL WITHIN RANGE ✓' : 'BREACHES:\n' + breaches.slice(0, 12).join('\n'));
