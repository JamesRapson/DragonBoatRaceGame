// Reproduce the "players who joined mid-race don't get a boat next race" bug.
import { Room } from '../server/room';
import type { ServerMsg } from '../src/shared/protocol';
import { CONFIG } from '../src/shared/config';

function makePlayer(id: number) {
  const rec = { id, welcomes: [] as number[], lastPhase: '' };
  const conn = {
    send(m: ServerMsg) {
      if (m.t === 'welcome') rec.welcomes.push(m.boatId);
      else if (m.t === 'state') rec.lastPhase = m.s.phase;
    },
  };
  return { conn, rec };
}

const room = new Room();
const players = [makePlayer(0), makePlayer(1)];
players.forEach((p) => room.addPlayer(p.conn)); // 2 players start

let addedLate = false;
let racingStarts = 0;
let prev = '';
for (let i = 0; i < 8000 && racingStarts < 2; i++) {
  room.tick(0.1);
  const ph = players[0].rec.lastPhase;
  if (ph === 'racing' && prev !== 'racing') racingStarts++;
  // Once race 1 is underway, two more people join and wait.
  if (ph === 'racing' && racingStarts === 1 && !addedLate) {
    const late = [makePlayer(2), makePlayer(3)];
    late.forEach((p) => { room.addPlayer(p.conn); players.push(p); });
    addedLate = true;
    console.log('  (added players 2 & 3 mid-race — they should join race 2)');
  }
  prev = ph;
}

console.log(`NUM_BOATS = ${CONFIG.NUM_BOATS}, race starts observed = ${racingStarts}`);
for (const p of players) {
  console.log(`player ${p.rec.id}: welcomes = [${p.rec.welcomes.join(', ')}], lastPhase=${p.rec.lastPhase}`);
}
const lateJoinersGotBoats = players.slice(2).every((p) => p.rec.welcomes.length >= 1);
console.log(lateJoinersGotBoats
  ? 'OK — the mid-race joiners got a boat in race 2'
  : 'BUG — mid-race joiners never got a boat (stuck as viewers)');
