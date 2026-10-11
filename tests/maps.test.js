import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Nav } from '../src/ai/nav.js';
import { Bot } from '../src/ai/bot.js';
import { makeCommand } from '../src/core/command.js';
import { MAPS, MAP_IDS } from '../src/config/maps/index.js';
import { CHARACTERS } from '../src/config/characters.js';
import { COW, GOATS } from '../src/config/animals.js';
import { MATCH, PLAYER, STEP } from '../src/config/tuning.js';

const box = (x0, x1, y0, y1, z0, z1, extra) => ({ min: [x0, y0, z0], max: [x1, y1, z1], color: '#fff', ...extra });

// Sol de 40 × 40 m, un mur de 3 m et une vache qui fait des allers-retours.
const FIELD = {
  spawns: [null, [{ pos: [0, 0, 10], yaw: 0 }], [{ pos: [0, 0, -10], yaw: Math.PI }]],
  boxes: [box(-20, 20, -1, 0, -20, 20, { sides: false }), box(-4, 4, 0, 3, -1, 0)],
  cows: [{ path: [[-6, 5], [6, 5]] }],
};

function setup(id = 'ines', map = FIELD) {
  const world = new World(map, { seed: 5 });
  const actor = world.addActor({ team: 1, character: CHARACTERS[id] });
  const cmd = makeCommand();
  const run = (seconds, each) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      world.step([cmd], STEP);
      each?.();
    }
  };
  return { world, actor, cmd, run };
}

// ---- les deux cartes ----

for (const id of MAP_IDS) {
  const map = MAPS[id];

  test(`carte « ${map.name} » : équitable et entièrement praticable`, () => {
    const world = new World(map);
    const nav = new Nav(world.level);
    assert.ok(world.paint.width <= 2048 && world.paint.height <= 2048, `atlas ${world.paint.width}×${world.paint.height}`);
    assert.equal(map.spawns[1].length, MATCH.teamSize);
    assert.equal(map.spawns[2].length, MATCH.teamSize);

    // chaque place de départ est au sol, dégagée, et reliée au camp d'en face
    const [ax, , az] = map.spawns[1][0].pos;
    for (const team of [1, 2]) {
      for (const s of map.spawns[team]) {
        assert.ok(nav.walkableAt(s.pos[0], s.pos[2], 0), `départ ${s.pos}`);
        assert.ok(nav.path(ax, 0, az, s.pos[0], 0, s.pos[2]), `chemin vers ${s.pos}`);
      }
    }

    // symétrie : le terrain vu d'un camp est le même que vu de l'autre
    world.paint.splat(6, 0, 12, 3, 1);
    world.paint.splat(-6, 0, -12, 3, 2);
    assert.ok(world.paint.counts[1] > 500);
    assert.equal(world.paint.counts[1], world.paint.counts[2]);
    for (const b of map.boxes) {
      assert.ok(map.boxes.some((o) => Math.abs(o.min[0] + b.max[0]) < 1e-9 && Math.abs(o.min[2] + b.max[2]) < 1e-9 && o.max[1] === b.max[1]), `boîte sans jumelle : ${b.min} → ${b.max}`);
    }

    // les trajets des vaches évitent le décor et les bases
    for (const cow of map.cows) {
      for (let i = 0; i < cow.path.length; i++) {
        const [x0, z0] = cow.path[i];
        const [x1, z1] = cow.path[(i + 1) % cow.path.length];
        for (let t = 0; t <= 1; t += 0.05) {
          const x = x0 + (x1 - x0) * t;
          const z = z0 + (z1 - z0) * t;
          assert.ok(nav.walkableAt(x, z, 0), `vache dans le décor en ${x.toFixed(1)}, ${z.toFixed(1)}`);
          for (const team of [1, 2]) for (const s of map.spawns[team]) assert.ok(Math.hypot(s.pos[0] - x, s.pos[2] - z) > 5);
        }
      }
    }
  });

  test(`carte « ${map.name} » : un match complet de bots`, () => {
    const world = new World(map, { seed: 11 });
    const nav = new Nav(world.level);
    const squads = [null, [], []];
    const bots = [];
    for (const team of [1, 2]) {
      for (const c of ['ines', 'louisa', 'emma', 'louisa']) {
        const bot = new Bot(world, world.addActor({ team, character: CHARACTERS[c] }), nav, squads[team]);
        squads[team].push(bot);
        bots.push(bot);
      }
    }
    world.startMatch({ duration: 120, countdown: 0.5 });
    let goats = 0;
    let peak = 0;
    world.events.on('chevres:lachees', () => goats++);
    const commands = [];
    while (world.match.phase !== 'ended') {
      for (let b = 0; b < bots.length; b++) commands[b] = bots[b].command(STEP);
      world.step(commands, STEP);
      peak = Math.max(peak, world.goats.list.length);
    }
    const { coverage } = world.match.result;
    assert.ok(coverage[1] > 0.2 && coverage[2] > 0.2, `terrain ${coverage}`);
    assert.ok(Math.abs(coverage[1] - coverage[2]) < 0.25, `match trop déséquilibré : ${coverage}`);
    for (const bot of bots) {
      const a = bot.actor;
      assert.ok(Number.isFinite(a.pos.x + a.pos.y + a.pos.z));
      assert.ok(a.turf > 60, `${a.character.name} peint ${a.turf.toFixed(0)} m²`);
    }
    assert.ok(goats >= 4, `lâchers de chèvres : ${goats}`);
    assert.ok(peak >= GOATS.count && peak <= GOATS.count * bots.length);
    assert.ok(world.cows.list.some((c) => c.team !== 0), 'au moins une vache a été peinte');
    console.log(`    ${map.name} : terrain ${(coverage[1] * 100).toFixed(1)} % / ${(coverage[2] * 100).toFixed(1)} %, ${goats} lâchers de chèvres`);
  });
}

test('ferme : on descend dans le bassin par les marches et on en ressort', () => {
  const { actor, cmd, run } = setup('ines', MAPS.ferme);
  actor.pos.x = 12;
  actor.pos.z = 0;
  cmd.yaw = Math.PI / 2;   // vers -x, vers le bassin
  cmd.move.z = 1;
  let lowest = 0;
  run(1.6, () => { lowest = Math.min(lowest, actor.pos.y); });
  assert.equal(lowest, -1.2);
  assert.ok(actor.grounded && Math.abs(actor.pos.x) < 4);
  run(1.5);
  assert.ok(actor.pos.x < -7 && actor.pos.y === 0, `ressortie en x = ${actor.pos.x}, y = ${actor.pos.y}`);
});

// ---- vaches ----

test('vache : suit son trajet, s\'arrête pour laisser passer', () => {
  const { world, actor, run } = setup();
  const cow = world.cows.list[0];
  run(3);
  assert.ok(cow.pos.x > -6 && cow.pos.x < 6 && cow.pos.z === 5, 'en route');
  const speed = (cow.pos.x + 6) / 3;
  assert.ok(Math.abs(speed - COW.speed) < 0.05, `vitesse ${speed}`);

  // une héroïne plantée devant elle : la vache attend
  actor.pos.x = cow.pos.x + 1.4;
  actor.pos.z = 5;
  const x = cow.pos.x;
  run(2);
  assert.ok(Math.abs(cow.pos.x - x) < 0.01);
  actor.pos.z = 12;
  run(1);
  assert.ok(cow.pos.x > x + 1, 'puis repart');
});

test('vache : bloque le passage et les tirs, et se fait peindre', () => {
  const { world, actor, cmd, run } = setup();
  const cow = world.cows.list[0];
  cow.path = [[0, 5]];
  cow.next = 0;
  cow.pos.x = 0;
  const enemy = world.addActor({ team: 2, character: CHARACTERS.emma, spawn: { pos: [0.5, 0, 2], yaw: 0 } });
  run(PLAYER.spawnInvuln + 0.1);
  const total = world.paint.scorable + world.cows.cells;
  assert.equal(world.paint.coverage()[1], 0);

  cmd.fire = true;
  cmd.pitch = -0.1;
  run(0.6);
  assert.equal(cow.team, 1);
  assert.equal(enemy.hp, enemy.maxHp, 'la vache protège ce qui est derrière elle');
  assert.ok(world.paint.coverage()[1] >= world.cows.cells / total);

  cmd.fire = false;
  cmd.move.z = 1;
  run(2);
  assert.ok(actor.pos.z > 5 + COW.radius, `arrêtée par la vache en z = ${actor.pos.z}`);

  // l'autre équipe la repeint : le terrain change de camp
  const before = world.paint.coverage()[1];
  world.cows.paint(cow, 2);
  assert.ok(world.paint.coverage()[1] < before);
  assert.ok(world.paint.coverage()[2] >= world.cows.cells / total);
});

// ---- chèvres ----

test('chèvres : la jauge se remplit en peignant et la touche F en lâche trois', () => {
  const { world, actor, cmd, run } = setup('louisa');
  run(0.3);
  cmd.goats = true;
  run(0.2);
  assert.equal(world.goats.list.length, 0, 'jauge vide');
  cmd.goats = false;
  actor.addTurf(GOATS.cost);
  assert.equal(actor.goatRatio, 1);
  run(0.1);
  cmd.goats = true;
  run(0.1);
  assert.equal(world.goats.list.length, GOATS.count);
  assert.equal(actor.goatRatio, 0);
});

test('chèvres : peignent pendant 10 secondes, grimpent aux murs, puis disparaissent', () => {
  const { world, actor, cmd, run } = setup('emma');
  run(0.3);
  actor.goatGauge = GOATS.cost;
  cmd.goats = true;
  const turf = actor.turf;
  let highest = 0;
  run(GOATS.duration - 0.2, () => {
    for (const g of world.goats.list) {
      highest = Math.max(highest, g.pos.y);
      assert.ok(Math.abs(g.pos.x) <= 20 && Math.abs(g.pos.z) <= 20, 'ne quittent pas la carte');
    }
  });
  assert.equal(world.goats.list.length, GOATS.count);
  assert.ok(actor.turf - turf > 120, `terrain peint par les chèvres : ${(actor.turf - turf).toFixed(0)} m²`);
  assert.ok(highest >= 3, `hauteur atteinte ${highest} : elles passent par-dessus le mur de 3 m`);
  assert.equal(actor.goatGauge, 0, 'leur peinture ne recharge pas un nouveau lâcher');
  assert.ok(actor.gauge > 0, 'mais elle compte pour la capacité');
  const wall = [-3, -1, 1, 3].some((x) => world.paint.teamAt(x, 1.5, 0, 2, 1) === 1 || world.paint.teamAt(x, 1.5, -1, 2, -1) === 1);
  assert.ok(wall, 'le mur est peint');
  run(0.5);
  assert.equal(world.goats.list.length, 0);
});
