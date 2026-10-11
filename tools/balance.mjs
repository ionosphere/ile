// Équilibrage : fait s'affronter des équipes de bots en accéléré et affiche qui gagne.
// Usage : node tools/balance.mjs [matchs par duel] [durée en secondes]

import { World } from '../src/sim/world.js';
import { Nav } from '../src/ai/nav.js';
import { Bot } from '../src/ai/bot.js';
import { CHARACTERS, CHARACTER_IDS } from '../src/config/characters.js';
import { STEP, DIFFICULTY, ALLY_LEVEL } from '../src/config/tuning.js';
import { MAPS } from '../src/config/maps/index.js';

const rounds = Number(process.argv[2] ?? 12);
const seconds = Number(process.argv[3] ?? 180);

function play(idsA, idsB, seed, levels = [{}, {}]) {
  const world = new World(seed % 2 ? MAPS.ferme : MAPS.salon, { seed });
  const nav = new Nav(world.level);
  const squads = [null, [], []];
  const bots = [];
  [idsA, idsB].forEach((ids, t) => ids.forEach((id) => {
    const bot = new Bot(world, world.addActor({ team: t + 1, character: CHARACTERS[id] }), nav, squads[t + 1], levels[t]);
    squads[t + 1].push(bot);
    bots.push(bot);
  }));
  world.startMatch({ duration: seconds, countdown: 0.1 });
  const commands = [];
  while (world.match.phase !== 'ended') {
    for (let b = 0; b < bots.length; b++) commands[b] = bots[b].command(STEP);
    world.step(commands, STEP);
  }
  return { result: world.match.result, actors: world.actors };
}

console.log(`${rounds} matchs de ${seconds} s par duel (sur les deux cartes, en changeant de côté)\n`);

// 1. équipes d'une seule héroïne
console.log('Équipes de quatre fois la même héroïne');
for (let i = 0; i < CHARACTER_IDS.length; i++) {
  for (let j = i + 1; j < CHARACTER_IDS.length; j++) {
    const a = CHARACTER_IDS[i];
    const b = CHARACTER_IDS[j];
    let wins = 0;
    let cover = 0;
    for (let r = 0; r < rounds; r++) {
      const swap = r % 4 >= 2;
      const { result } = play(Array(4).fill(swap ? b : a), Array(4).fill(swap ? a : b), 100 + r);
      const teamA = swap ? 2 : 1;
      if (result.winner === teamA) wins++;
      cover += result.coverage[teamA] - result.coverage[3 - teamA];
    }
    console.log(`  ${a.padEnd(7)} contre ${b.padEnd(7)} : ${a} gagne ${wins}/${rounds}, écart moyen de terrain ${((cover / rounds) * 100).toFixed(1)} points`);
  }
}

// 2. équipes mixtes : ce que chaque héroïne apporte
console.log('\nÉquipes mixtes (une de chaque + une au hasard) : moyennes par héroïne');
const sum = Object.fromEntries(CHARACTER_IDS.map((id) => [id, { n: 0, turf: 0, kills: 0, deaths: 0 }]));
for (let r = 0; r < rounds; r++) {
  const extra = (k) => CHARACTER_IDS[(r + k) % 3];
  const { actors } = play([...CHARACTER_IDS, extra(0)], [...CHARACTER_IDS, extra(1)], 500 + r);
  for (const a of actors) {
    const s = sum[a.character.id];
    s.n++;
    s.turf += a.turf;
    s.kills += a.kills;
    s.deaths += a.deaths;
  }
}
for (const id of CHARACTER_IDS) {
  const s = sum[id];
  console.log(`  ${id.padEnd(7)} : ${(s.turf / s.n).toFixed(0).padStart(4)} m² peints, ${(s.kills / s.n).toFixed(1)} éliminations, ${(s.deaths / s.n).toFixed(1)} fois éliminée`);
}

// 3. difficulté : coéquipières au niveau habituel contre des adversaires de chaque niveau
console.log('\nDifficulté (équipes mixtes, alliées « ' + ALLY_LEVEL + ' » contre adversaires du niveau indiqué)');
for (const [id, level] of Object.entries(DIFFICULTY)) {
  let wins = 0;
  let cover = 0;
  let deaths = 0;
  for (let r = 0; r < rounds; r++) {
    const swap = r % 4 >= 2;
    const levels = swap ? [level, DIFFICULTY[ALLY_LEVEL]] : [DIFFICULTY[ALLY_LEVEL], level];
    const { result, actors } = play([...CHARACTER_IDS, CHARACTER_IDS[r % 3]], [...CHARACTER_IDS, CHARACTER_IDS[(r + 1) % 3]], 900 + r, levels);
    const ally = swap ? 2 : 1;
    if (result.winner === ally) wins++;
    cover += result.coverage[ally] - result.coverage[3 - ally];
    for (const a of actors) if (a.team === ally) deaths += a.deaths / 4;
  }
  console.log(`  ${id.padEnd(9)} : les alliées gagnent ${wins}/${rounds}, écart moyen ${((cover / rounds) * 100).toFixed(1)} points, ${(deaths / rounds).toFixed(1)} éliminations subies par alliée`);
}
