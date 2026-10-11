import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { makeCommand } from '../src/core/command.js';
import { WEAPONS } from '../src/config/weapons.js';
import { MATCH, PLAYER, STEP } from '../src/config/tuning.js';
import { ENCLOS as FERME } from '../src/config/maps/enclos.js';

const box = (x0, x1, y0, y1, z0, z1, extra) => ({ min: [x0, y0, z0], max: [x1, y1, z1], color: '#fff', ...extra });

// Sol de 20 × 20 m avec un mur de 4 m de haut devant le point de départ (z de -6 à -5).
function arena(extraBoxes = []) {
  return {
    spawns: [null, [{ pos: [0, 0, 0], yaw: 0 }, { pos: [0, 0, 6], yaw: 0 }], [{ pos: [-6, 0, 0], yaw: 0 }, { pos: [-8, 0, 6], yaw: 0 }]],
    boxes: [box(-10, 10, -1, 0, -10, 10, { sides: false }), box(-3, 3, 0, 4, -6, -5), ...extraBoxes],
  };
}

function setup(map = arena()) {
  const world = new World(map);
  const actor = world.addActor({ team: 1, weapon: WEAPONS.double });
  const cmd = makeCommand();
  const run = (seconds, each) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      world.step([cmd], STEP);
      each?.();
    }
  };
  run(0.2);   // se poser au sol
  return { world, actor, cmd, run };
}

const paintWall = (world, team) => {
  for (let y = 0.2; y < 4; y += 0.4) world.paint.splat(0, y, -5, 0.8, team);
};

test('peinture : une tache colore le sol et compte dans le score', () => {
  const { world } = setup();
  assert.equal(world.paint.teamAt(5, 0, 5, 1, 1), 0);
  const gained = world.paint.splat(5, 0, 5, 1, 1);
  assert.equal(world.paint.teamAt(5, 0, 5, 1, 1), 1);
  assert.ok(gained > 1.5 && gained < Math.PI, `surface gagnée ${gained}`);
  const cov = world.paint.coverage();
  assert.ok(Math.abs(cov[1] - gained / 394) < 1e-3);
  assert.equal(world.paint.splat(5, 0, 5, 1, 1), 0, 'repeindre sa propre couleur ne rapporte rien');
});

test('peinture : repeindre par-dessus retire le terrain à l\'adversaire', () => {
  const { world } = setup();
  world.paint.splat(5, 0, 5, 1, 1, 0.3);
  world.paint.splat(5, 0, 5, 1, 2, 0.3);
  assert.equal(world.paint.teamAt(5, 0, 5, 1, 1), 2);
  assert.equal(world.paint.counts[1], 0);
});

test('peinture : le sol sous une boîte ne compte pas', () => {
  const { world } = setup();
  const area = world.paint.scorable * world.paint.cell ** 2;
  // sol 400 m² moins l'emprise du mur (6 m²), plus le dessus du mur (6 m²)
  assert.ok(Math.abs(area - 400) < 0.5, `surface comptée ${area}`);
  world.paint.splat(0, 0, -5.5, 0.3, 1);
  assert.equal(world.paint.counts[1], 0);
});

test('peinture : une tache ne traverse pas un mur', () => {
  const { world } = setup();
  world.paint.splat(0, 2, -5, 0.9, 1);
  assert.equal(world.paint.teamAt(0, 2, -5, 2, 1), 1, 'face touchée');
  assert.equal(world.paint.teamAt(0, 2, -6, 2, -1), 0, 'face opposée');
});

test('peinture : la zone modifiée est signalée une seule fois', () => {
  const { world } = setup();
  world.paint.takeDirty();
  world.paint.splat(5, 0, 5, 1, 1);
  const d = world.paint.takeDirty();
  assert.ok(d && d.x1 > d.x0 && d.y1 > d.y0);
  assert.equal(world.paint.takeDirty(), null);
});

test('niveau : le lancer de rayon trouve le mur et sa normale', () => {
  const { world } = setup();
  const hit = world.level.raycast(0, 1, 0, 0, 0, -1, 50);
  assert.ok(Math.abs(hit.t - 5) < 1e-9);
  assert.deepEqual([hit.nx, hit.ny, hit.nz], [0, 0, 1]);
  assert.equal(world.level.raycast(0, 1, 0, 0, 0, 1, 50), null);
});

test('acteur : se pose au sol et court à sa vitesse de course', () => {
  const { actor, cmd, run } = setup();
  assert.ok(actor.grounded);
  assert.equal(actor.pos.y, 0);
  cmd.move.x = 1;
  run(1);
  assert.ok(Math.abs(Math.hypot(actor.vel.x, actor.vel.z) - PLAYER.runSpeed) < 0.01);
  assert.ok(actor.pos.x > 5 && Math.abs(actor.pos.z) < 1e-6);
});

test('acteur : saute puis retombe', () => {
  const { actor, cmd, run } = setup();
  cmd.jump = true;
  let top = 0;
  run(1.5, () => { top = Math.max(top, actor.pos.y); });
  assert.ok(top > 1.2 && top < 1.6, `hauteur de saut ${top}`);
  assert.ok(actor.grounded, 'un seul saut par appui');
});

test('acteur : un mur l\'arrête', () => {
  const { actor, cmd, run } = setup();
  cmd.move.z = 1;
  run(2);
  assert.ok(Math.abs(actor.pos.z - (-5 + PLAYER.radius)) < 0.01, `z = ${actor.pos.z}`);
  assert.equal(actor.pos.y, 0);
});

test('acteur : monte une petite marche sans sauter, pas une grande', () => {
  const low = setup(arena([box(2, 4, 0, 0.3, -1, 1)]));
  low.cmd.move.x = 1;
  low.run(0.5);
  assert.equal(low.actor.pos.y, 0.3);

  const high = setup(arena([box(2, 4, 0, 0.8, -1, 1)]));
  high.cmd.move.x = 1;
  high.run(0.5);
  assert.equal(high.actor.pos.y, 0);
  assert.ok(high.actor.pos.x < 2);
});

test('chat : rapide dans sa peinture, lent ailleurs', () => {
  const speedOn = (team) => {
    const s = setup();
    if (team) for (let x = 0; x <= 9; x += 0.5) s.world.paint.splat(x, 0, 0, 0.8, team);
    s.cmd.cat = true;
    s.cmd.move.x = 1;
    s.run(0.5);
    return Math.hypot(s.actor.vel.x, s.actor.vel.z);
  };
  assert.ok(Math.abs(speedOn(1) - PLAYER.swimSpeed) < 0.01);
  assert.ok(Math.abs(speedOn(0) - PLAYER.catDrySpeed) < 0.01);
  assert.ok(Math.abs(speedOn(2) - PLAYER.enemyPaintSpeed) < 0.01);
});

test('chat : grimpe un mur peint à sa couleur et arrive en haut', () => {
  const { world, actor, cmd, run } = setup();
  paintWall(world, 1);
  cmd.cat = true;
  cmd.move.z = 1;
  let top = 0;
  let landedOnTop = false;
  run(3, () => {
    top = Math.max(top, actor.pos.y);
    if (actor.grounded && actor.pos.y === 4) landedOnTop = true;
  });
  assert.ok(top >= 4, `hauteur atteinte ${top}`);
  assert.ok(landedOnTop, 'se pose sur le dessus du mur');
});

test('chat : ne grimpe ni un mur vierge ni un mur adverse', () => {
  for (const team of [0, 2]) {
    const { world, actor, cmd, run } = setup();
    if (team) paintWall(world, team);
    cmd.cat = true;
    cmd.move.z = 1;
    let top = 0;
    run(2, () => { top = Math.max(top, actor.pos.y); });
    assert.equal(top, 0);
  }
});

test('chat : retombe si la peinture s\'arrête à mi-hauteur', () => {
  const { world, actor, cmd, run } = setup();
  for (let y = 0.2; y < 1.6; y += 0.4) world.paint.splat(0, y, -5, 0.8, 1);
  cmd.cat = true;
  cmd.move.z = 1;
  let top = 0;
  run(3, () => { top = Math.max(top, actor.pos.y); });
  assert.ok(top > 1 && top < 4, `hauteur atteinte ${top}`);
});

test('arme : tirer peint le sol devant soi et vide le réservoir', () => {
  const { world, actor, cmd, run } = setup();
  cmd.yaw = Math.PI / 2;   // dos au mur, vers -x
  cmd.pitch = -0.25;
  cmd.fire = true;
  run(1);
  assert.ok(actor.ink < PLAYER.inkMax - 5);
  assert.ok(world.paint.counts[1] > 100, `cellules peintes ${world.paint.counts[1]}`);
  assert.ok(actor.turf > 1);
  assert.equal(world.paint.teamAt(1, 0, 0, 1, 1), 0, 'rien derrière soi');
});

test('arme : le tir part vers le point visé', () => {
  const { world, actor, cmd, run } = setup();
  cmd.fire = true;   // vise le mur à hauteur du regard
  run(0.6);
  assert.equal(world.paint.teamAt(0.5, 1.6, -5, 2, 1), 1);
  assert.ok(actor.ink < PLAYER.inkMax);
});

test('arme : le chat ne tire pas, et le réservoir vide bloque le tir', () => {
  const { world, actor, cmd, run } = setup();
  cmd.fire = true;
  cmd.cat = true;
  run(0.5);
  assert.equal(world.projectiles.list.length, 0);
  assert.equal(actor.ink, PLAYER.inkMax);

  cmd.cat = false;
  actor.ink = 0;
  run(0.5);
  assert.equal(world.projectiles.list.length, 0);
});

test('réservoir : se recharge vite en nageant, lentement à pied', () => {
  const swim = setup();
  swim.world.paint.splat(0, 0, 0, 1.5, 1);
  swim.actor.ink = 0;
  swim.cmd.cat = true;
  swim.run(1);
  assert.ok(Math.abs(swim.actor.ink - PLAYER.inkRefillSwim) < 1.5);

  const walk = setup();
  walk.actor.ink = 0;
  walk.run(1);
  assert.ok(Math.abs(walk.actor.ink - PLAYER.inkRefillHuman) < 0.5);
});

test('carte : la ferme se charge et le départ mène au mur d\'escalade', () => {
  const world = new World(FERME);
  const actor = world.addActor({ team: 1, weapon: WEAPONS.double });
  const cmd = makeCommand();
  cmd.cat = true;
  cmd.move.z = 1;
  let top = 0;
  let landedOnTop = false;
  for (let i = 0; i < 4 / STEP; i++) {
    world.step([cmd], STEP);
    top = Math.max(top, actor.pos.y);
    if (actor.grounded && actor.pos.y === 4) landedOnTop = true;
  }
  assert.ok(top >= 4 && top < 4.6, `hauteur atteinte ${top}`);
  assert.ok(landedOnTop, 'se pose sur le mur de 70 cm sans le survoler');
  assert.ok(world.paint.width <= 1024 && world.paint.height <= 2048, `atlas ${world.paint.width}×${world.paint.height}`);
});

// ---- match, vie, élimination ----

// Le joueur regarde vers -x, où se tient un adversaire immobile à 6 m.
function duel() {
  const s = setup();
  const enemy = s.world.addActor({ team: 2, weapon: WEAPONS.double });
  s.cmd.yaw = Math.PI / 2;
  s.run(PLAYER.spawnInvuln + 0.05);
  return { ...s, enemy };
}

test('combat : les tirs blessent puis éliminent, et le vainqueur peint l\'endroit', () => {
  const { world, actor, enemy, cmd, run } = duel();
  const seen = [];
  world.events.on('elimine', (e) => seen.push(e));
  cmd.fire = true;
  cmd.pitch = -0.08;
  run(0.35);
  assert.ok(enemy.hp < PLAYER.hp && enemy.alive, `vie de l'adversaire ${enemy.hp}`);
  run(1);
  assert.equal(enemy.alive, false);
  assert.equal(actor.kills, 1);
  assert.equal(enemy.deaths, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].killer, actor);
  assert.equal(world.paint.teamAt(-6, 0, 0, 1, 1), 1);
});

test('combat : pas de tir ami, et un mur protège', () => {
  const s = setup();
  const ally = s.world.addActor({ team: 1, weapon: WEAPONS.double, spawn: { pos: [-4, 0, 0], yaw: 0 } });
  const hidden = s.world.addActor({ team: 2, weapon: WEAPONS.double, spawn: { pos: [0, 0, -8], yaw: 0 } });
  s.run(PLAYER.spawnInvuln);
  s.cmd.fire = true;
  s.cmd.yaw = Math.PI / 2;
  s.run(0.8);
  assert.equal(ally.hp, PLAYER.hp);
  s.cmd.yaw = 0;   // vers le mur, l'adversaire est derrière
  s.cmd.pitch = -0.1;
  s.run(0.8);
  assert.equal(hidden.hp, PLAYER.hp);
});

test('combat : invulnérable juste après être réapparue', () => {
  const s = setup();
  const enemy = s.world.addActor({ team: 2, weapon: WEAPONS.double });
  assert.equal(enemy.damage(50, s.actor), false);
  s.run(PLAYER.spawnInvuln + 0.05);
  assert.equal(enemy.damage(50, s.actor), true);
  assert.equal(enemy.hp, 50);
});

test('élimination : on réapparaît à sa base, réservoir et vie pleins', () => {
  const { world, actor, cmd, run } = setup();
  cmd.move.x = 1;
  run(0.5);
  actor.ink = 10;
  actor.die();
  const before = { ...actor.pos };
  run(PLAYER.respawnTime - 0.2);
  assert.equal(actor.alive, false);
  assert.deepEqual({ ...actor.pos }, before, 'immobile tant qu\'on est éliminée');
  run(0.4);
  assert.ok(actor.alive);
  assert.ok(Math.abs(actor.pos.x) < 1.5);
  assert.equal(actor.hp, PLAYER.hp);
  assert.ok(actor.ink > 99);
  assert.equal(world.projectiles.list.length, 0);
});

test('vie : la peinture adverse blesse jusqu\'à un plancher, puis la vie remonte', () => {
  const { world, actor, run } = setup();
  run(PLAYER.spawnInvuln);
  world.paint.splat(0, 0, 0, 1.5, 2);
  run(4);
  assert.equal(actor.hp, PLAYER.hp - PLAYER.enemyPaintDamageCap);
  world.paint.splat(0, 0, 0, 1.6, 1);
  run(PLAYER.regenDelay + 0.5);
  assert.ok(actor.hp > PLAYER.hp - PLAYER.enemyPaintDamageCap + 5 && actor.hp < PLAYER.hp);
  run(3);
  assert.equal(actor.hp, PLAYER.hp);
});

test('match : décompte, jeu, puis victoire de l\'équipe qui a le plus peint', () => {
  const world = new World(arena());
  const actor = world.addActor({ team: 1, weapon: WEAPONS.double });
  world.addActor({ team: 2, weapon: WEAPONS.double });
  const match = world.startMatch({ duration: 1.2, countdown: 1 });
  const events = [];
  world.events.on('match:debut', () => events.push('debut'));
  world.events.on('match:fin', (r) => events.push(r));
  const cmd = makeCommand();
  cmd.move.z = 1;
  cmd.fire = true;
  cmd.yaw = -Math.PI / 2;   // vers +x, dos à l'adversaire
  cmd.pitch = -0.3;
  const run = (seconds) => { for (let i = 0; i < Math.round(seconds / STEP); i++) world.step([cmd], STEP); };

  run(0.9);
  assert.equal(match.phase, 'countdown');
  assert.equal(actor.pos.x, 0, 'figée pendant le décompte');
  assert.equal(actor.yaw, cmd.yaw, 'mais libre de regarder autour');
  assert.equal(world.projectiles.list.length, 0);

  run(0.6);
  assert.equal(match.phase, 'playing');
  assert.ok(actor.pos.x > 2, `x = ${actor.pos.x}`);

  run(1);
  assert.equal(match.phase, 'ended');
  assert.equal(match.remaining, 0);
  assert.equal(match.result.winner, 1);
  assert.ok(match.result.coverage[1] > 0 && match.result.coverage[2] === 0);
  assert.equal(events[0], 'debut');
  assert.equal(events[1], match.result);

  const frozen = { x: actor.pos.x, painted: world.paint.counts[1] };
  run(1);
  assert.equal(actor.pos.x, frozen.x, 'tout est figé après la fin');
  assert.equal(world.paint.counts[1], frozen.painted, 'et le score ne bouge plus');
});

test('match : la ferme accueille deux équipes complètes sans chevauchement', () => {
  const world = new World(FERME);
  for (const team of [1, 2]) for (let i = 0; i < MATCH.teamSize; i++) world.addActor({ team, weapon: WEAPONS.double });
  for (let i = 0; i < 30; i++) world.step([], STEP);
  for (const a of world.actors) {
    assert.ok(a.grounded && a.pos.y === 0);
    for (const b of world.actors) {
      if (a !== b) assert.ok(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 2 * PLAYER.radius);
    }
  }
});
