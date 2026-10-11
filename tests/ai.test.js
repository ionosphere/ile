import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Nav } from '../src/ai/nav.js';
import { Bot } from '../src/ai/bot.js';
import { WEAPONS } from '../src/config/weapons.js';
import { MATCH, PLAYER, STEP } from '../src/config/tuning.js';
import { ENCLOS as FERME } from '../src/config/maps/enclos.js';

const box = (x0, x1, y0, y1, z0, z1, extra) => ({ min: [x0, y0, z0], max: [x1, y1, z1], color: '#fff', ...extra });

// Sol de 20 × 20 m avec un mur au milieu (z de -6 à -5).
const ARENA = {
  spawns: [null, [{ pos: [0, 0, 0], yaw: 0 }], [{ pos: [-6, 0, 0], yaw: 0 }]],
  boxes: [box(-10, 10, -1, 0, -10, 10, { sides: false }), box(-3, 3, 0, 4, -6, -5)],
};

// Monde peuplé de bots, avec une fonction pour avancer le temps.
function botWorld(map, teams, { skill = 0.5, seed = 7 } = {}) {
  const world = new World(map, { seed });
  const nav = new Nav(world.level);
  const squads = [null, [], []];
  const bots = teams.map((team) => {
    const bot = new Bot(world, world.addActor({ team, weapon: WEAPONS.double }), nav, squads[team], { skill });
    squads[team].push(bot);
    return bot;
  });
  const commands = [];
  const run = (seconds, each) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      for (let b = 0; b < bots.length; b++) commands[b] = bots[b].command(STEP);
      world.step(commands, STEP);
      each?.();
    }
  };
  return { world, nav, bots, run };
}

test('navigation : contourne le mur', () => {
  const world = new World(ARENA);
  const nav = new Nav(world.level);
  assert.ok(nav.walkableAt(0, 0));
  assert.equal(nav.walkableAt(0, -5.5), false, 'dans le mur');
  assert.equal(nav.walkableAt(0, -5.5, 4), false, 'le dessus du mur est hors d\'atteinte');
  assert.equal(nav.walkableAt(50, 0), false, 'hors de la carte');

  const path = nav.path(0, 0, 0, 0, 0, -8);
  assert.ok(path && path.length >= 2);
  let length = 0;
  let px = 0;
  let pz = 0;
  for (const p of path) {
    assert.ok(nav.lineClear(px, pz, p.x, p.z), 'chaque tronçon est dégagé');
    length += Math.hypot(p.x - px, p.z - pz);
    px = p.x;
    pz = p.z;
  }
  assert.ok(length > 10 && length < 16, `longueur ${length}`);
  assert.ok(Math.hypot(px - 0, pz + 8) < 1, 'arrive à destination');
});

test('navigation : ligne droite quand rien ne gêne, et pas de chemin vers une zone isolée', () => {
  const world = new World(ARENA);
  const nav = new Nav(world.level);
  assert.equal(nav.path(-8, 0, 8, 8, 0, 8).length, 1);
  const island = new Nav(new World({ ...ARENA, boxes: [...ARENA.boxes, box(20, 24, -1, 0, 20, 24)] }).level);
  assert.equal(island.walkableAt(22, 22), false, 'l\'îlot séparé n\'est pas retenu');
});

test('navigation : monte un escalier, passe sous un toit, ignore le toit', () => {
  // estrade de 0,9 m atteinte par trois marches, et un toit sur poteaux à côté
  const map = {
    ...ARENA,
    boxes: [
      box(-10, 10, -1, 0, -10, 10, { sides: false }),
      box(2, 3, 0, 0.3, -2, 2), box(3, 4, 0, 0.6, -2, 2), box(4, 8, 0, 0.9, -2, 2),
      box(-8, -3, 3, 3.3, 3, 8), box(-8, -7.5, 0, 3, 3, 3.5),
    ],
  };
  const nav = new Nav(new World(map).level);
  assert.ok(nav.walkableAt(6, 0, 0.9), 'sur l\'estrade');
  assert.ok(nav.walkableAt(-5, 5, 0), 'sous le toit');
  assert.equal(nav.walkableAt(-5, 5, 3.3), false, 'pas sur le toit');
  const path = nav.path(0, 0, 0, 6, 0.9, 0);
  assert.ok(path);
  assert.equal(path.at(-1).y, Math.fround(0.9));
  let y = 0;
  for (const p of path) {
    assert.ok(p.y - y <= 0.31, 'une marche à la fois');
    y = p.y;
  }
  assert.equal(nav.lineClear(0, 0, 7, 7, 0), true);
  assert.equal(nav.lineClear(6, 5, 6, 0, 0), false, 'pas d\'accès par le côté de l\'estrade');
});

test('bot : seul, il peint le terrain et recharge son réservoir', () => {
  const { world, bots, run } = botWorld(ARENA, [1]);
  let refilled = false;
  let lowest = 100;
  run(40, () => {
    const a = bots[0].actor;
    lowest = Math.min(lowest, a.ink);
    if (lowest < 15 && a.ink > 80) refilled = true;
    assert.ok(a.alive, 'ne tombe pas de la carte');
  });
  assert.ok(world.paint.coverage()[1] > 0.3, `terrain peint ${world.paint.coverage()[1]}`);
  assert.ok(refilled, `réservoir au plus bas ${lowest}`);
});

test('bot : à sec et sans peinture alliée, il finit par se refaire une flaque', () => {
  const { bots, run } = botWorld(ARENA, [1]);
  bots[0].actor.ink = 0;
  let best = 0;
  run(5, () => { best = Math.max(best, bots[0].actor.ink); });
  assert.ok(best > 80, `réservoir remonté à ${best}`);
});

test('bot : élimine un adversaire immobile', () => {
  const { world, bots, run } = botWorld(ARENA, [1]);
  const target = world.addActor({ team: 2, weapon: WEAPONS.double });
  run(8);
  assert.ok(target.deaths >= 1, `vie de la cible ${target.hp}`);
  assert.ok(bots[0].actor.kills >= 1);
});

test('bot : un mur cache l\'adversaire', () => {
  const { world, bots, run } = botWorld(ARENA, [1]);
  world.addActor({ team: 2, weapon: WEAPONS.double, spawn: { pos: [0, 0, -8], yaw: 0 } });
  run(0.5);
  assert.equal(bots[0].enemy, null);
  assert.equal(bots[0].mode, 'paint');
});

test('bots : un match complet à 4 contre 4 sur la ferme', () => {
  const teams = [];
  for (const team of [1, 2]) for (let i = 0; i < MATCH.teamSize; i++) teams.push(team);
  const { world, bots, run } = botWorld(FERME, teams);
  world.startMatch({ duration: 90, countdown: 1 });
  const t0 = performance.now();
  run(92);
  const ms = performance.now() - t0;

  const result = world.match.result;
  assert.ok(result, 'le match est allé au bout');
  assert.ok(result.coverage[1] > 0.15 && result.coverage[2] > 0.15, `terrain ${result.coverage}`);
  let kills = 0;
  for (const bot of bots) {
    const a = bot.actor;
    assert.ok(Number.isFinite(a.pos.x + a.pos.y + a.pos.z));
    assert.ok(Math.abs(a.pos.x) < 30 && Math.abs(a.pos.z) < 30 && a.pos.y > -1);
    assert.ok(a.turf > 20, `chaque bot peint : ${a.turf} m²`);
    assert.ok(a.deaths <= 12);
    kills += a.kills;
  }
  assert.ok(kills >= 2, `éliminations ${kills}`);
  assert.ok(ms < 20000, `simulation en ${ms} ms`);
  console.log(`    92 s de match simulées en ${ms.toFixed(0)} ms — terrain ${result.coverage.slice(1).map((v) => (v * 100).toFixed(1)).join(' % / ')} %, ${kills} éliminations`);
});
