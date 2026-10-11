import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Nav } from '../src/ai/nav.js';
import { Bot } from '../src/ai/bot.js';
import { makeCommand } from '../src/core/command.js';
import { CHARACTERS, CHARACTER_IDS } from '../src/config/characters.js';
import { WEAPONS } from '../src/config/weapons.js';
import { SPECIALS, SPECIAL_COST } from '../src/config/specials.js';
import { PLAYER, STEP } from '../src/config/tuning.js';
import { ENCLOS as FERME } from '../src/config/maps/enclos.js';

const box = (x0, x1, y0, y1, z0, z1, extra) => ({ min: [x0, y0, z0], max: [x1, y1, z1], color: '#fff', ...extra });

// Grand sol nu de 60 × 60 m ; le joueur regarde vers -z.
const FIELD = {
  spawns: [null, [{ pos: [0, 0, 20], yaw: 0 }, { pos: [3, 0, 20], yaw: 0 }], [{ pos: [0, 0, 12], yaw: 0 }, { pos: [3, 0, 12], yaw: 0 }]],
  boxes: [box(-30, 30, -1, 0, -30, 30, { sides: false })],
};

function setup(id) {
  const world = new World(FIELD);
  const actor = world.addActor({ team: 1, character: CHARACTERS[id] });
  const cmd = makeCommand();
  const commands = [cmd];
  const run = (seconds, each) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      world.step(commands, STEP);
      each?.();
    }
  };
  run(PLAYER.spawnInvuln + 0.05);
  return { world, actor, cmd, commands, run };
}

// Ajoute un adversaire immobile, déjà vulnérable.
function enemyAt(world, x, z, character = undefined) {
  const e = world.addActor({ team: 2, character, spawn: { pos: [x, 0, z], yaw: 0 } });
  e.invulnT = 0;
  e.grounded = true;
  return e;
}

test('personnages : trois héroïnes aux statistiques distinctes', () => {
  assert.deepEqual(CHARACTER_IDS, ['ines', 'louisa', 'emma']);
  const speeds = [];
  for (const id of CHARACTER_IDS) {
    const { actor, cmd, run } = setup(id);
    const c = CHARACTERS[id];
    assert.equal(actor.hp, c.hp);
    assert.equal(actor.weapon, WEAPONS[c.weapon]);
    assert.ok(SPECIALS[c.special]);
    cmd.move.z = 1;
    run(1);
    speeds.push(Math.hypot(actor.vel.x, actor.vel.z));
    assert.ok(Math.abs(speeds.at(-1) - PLAYER.runSpeed * c.speed) < 0.01);
  }
  assert.ok(speeds[1] > speeds[0] && speeds[0] > speeds[2], 'Louisa > Ines > Emma');
  const emma = setup('emma').actor;
  const ines = setup('ines').actor;
  assert.ok(emma.height > ines.height && emma.hitRadius > ines.hitRadius, 'Emma est plus grande, donc plus facile à toucher');
});

test('Ines : l\'esquive remplace le saut quand elle tire en se déplaçant', () => {
  const { actor, cmd, run } = setup('ines');
  cmd.fire = true;
  cmd.move.x = 1;
  run(0.3);
  const ink = actor.ink;
  const x = actor.pos.x;
  cmd.jump = true;
  run(0.2);
  assert.equal(actor.pos.y, 0, 'reste au sol');
  assert.ok(actor.pos.x - x > 2.5, `glissade de ${actor.pos.x - x} m`);
  assert.ok(ink - actor.ink > WEAPONS.double.dodge.inkCost);
  cmd.fire = false;
  cmd.jump = false;
  run(0.5);
  cmd.jump = true;
  run(0.2);
  assert.ok(actor.pos.y > 0.5, 'sans tirer, Espace saute');
});

test('Louisa : le tir part au relâchement, plus loin et plus fort à pleine charge', () => {
  const shot = (hold) => {
    const { world, actor, cmd, run } = setup('louisa');
    const far = enemyAt(world, 0.55, 2, CHARACTERS.emma);    // à 18 m, dans l'axe du viseur
    cmd.fire = true;
    run(hold);
    assert.equal(world.paint.counts[1], 0, 'rien ne part tant qu\'on maintient');
    assert.equal(far.hp, far.maxHp);
    const ink = actor.ink;
    cmd.fire = false;
    run(0.1);
    return { far, world, spent: ink - actor.ink };
  };
  const full = shot(1.2);
  assert.equal(full.far.hp, full.far.maxHp - WEAPONS.charge.damage[1]);
  assert.ok(Math.abs(full.spent - WEAPONS.charge.inkCost[1]) < 0.01);
  assert.ok(full.world.paint.teamAt(0.6, 0, 10, 1, 1) === 1, 'traînée de peinture sous le trait');

  const weak = shot(0.2);
  assert.equal(weak.far.hp, weak.far.maxHp, 'un tir peu chargé ne porte pas à 18 m');
  assert.ok(weak.spent < full.spent / 2);
  assert.ok(weak.world.paint.counts[1] > 0 && weak.world.paint.counts[1] < full.world.paint.counts[1]);
});

test('Louisa : passer en chat annule la charge', () => {
  const { world, actor, cmd, run } = setup('louisa');
  cmd.fire = true;
  run(0.6);
  assert.ok(actor.charge > 0.5);
  cmd.cat = true;
  run(0.1);
  cmd.fire = false;
  cmd.cat = false;
  run(0.1);
  assert.equal(actor.charge, 0);
  assert.equal(world.paint.counts[1], 0);
});

test('Emma : le rouleau peint une large bande et écrase au contact', () => {
  const { world, actor, cmd, run } = setup('emma');
  const victim = enemyAt(world, 0, 14);
  cmd.fire = true;
  cmd.move.z = 1;
  run(0.5);
  assert.ok(actor.rolling);
  run(1.5);
  // bande d'au moins 2 m de large derrière elle
  for (const x of [-1, 0, 1]) assert.equal(world.paint.teamAt(x, 0, 11, 1, 1), 1, `peint en x = ${x}`);
  assert.equal(world.paint.teamAt(2.2, 0, 11, 1, 1), 0);
  assert.equal(victim.alive, false, 'l\'adversaire sur le passage est éliminé');
  assert.ok(actor.ink < 90);
});

test('Emma : un appui projette une gerbe en éventail', () => {
  const { world, actor, cmd, run } = setup('emma');
  cmd.fire = true;
  run(STEP);
  assert.equal(world.projectiles.list.length, WEAPONS.rouleau.fling.count);
  cmd.fire = false;
  run(1);
  assert.ok(Math.abs(PLAYER.inkMax - actor.ink - WEAPONS.rouleau.fling.inkCost) < 6);
  assert.ok(world.paint.counts[1] > 400, `cellules peintes ${world.paint.counts[1]}`);
  // la gerbe s'ouvre : de la peinture à gauche comme à droite, quelques mètres devant
  const painted = (x0, x1) => {
    for (let x = x0; x <= x1; x += 0.25) for (let z = 13; z <= 18; z += 0.25) if (world.paint.teamAt(x, 0, z, 1, 1) === 1) return true;
    return false;
  };
  assert.ok(painted(-3.5, -1.2) && painted(1.5, 3.5));
});

test('jauge : se remplit en peignant, se vide au déclenchement, garde la moitié après une élimination', () => {
  const { actor, cmd, run } = setup('ines');
  assert.equal(actor.gaugeRatio, 0);
  cmd.special = true;
  run(0.2);
  assert.equal(actor.specialT, 0, 'jauge vide : rien ne se passe');
  cmd.special = false;
  actor.addTurf(SPECIAL_COST / 2);
  assert.equal(actor.gaugeRatio, 0.5);
  actor.addTurf(SPECIAL_COST);
  assert.equal(actor.gaugeRatio, 1);
  actor.die();
  assert.equal(actor.gaugeRatio, 0.5);
});

test('Ines : la Charge fonce, peint, protège et bouscule', () => {
  const { world, actor, cmd, run } = setup('ines');
  const victim = enemyAt(world, 0, 12, CHARACTERS.emma);
  const events = [];
  world.events.on('capacite:debut', (e) => events.push(`debut ${e.kind}`));
  world.events.on('capacite:fin', (e) => events.push(`fin ${e.kind}`));
  actor.gauge = SPECIAL_COST;
  cmd.special = true;
  run(0.3);
  assert.ok(actor.forced && actor.invulnT > 0);
  assert.equal(actor.damage(50, victim), false, 'invulnérable pendant la ruée');
  run(SPECIALS.ruee.duration);
  assert.ok(20 - actor.pos.z > 18, `distance parcourue ${20 - actor.pos.z}`);
  assert.equal(victim.hp, victim.maxHp - SPECIALS.ruee.damage, 'touchée une seule fois');
  assert.ok(victim.pos.z < 11.5, 'et repoussée');
  assert.equal(world.paint.teamAt(0, 0, 8, 1, 1), 1);
  assert.equal(actor.forced, null);
  assert.equal(actor.gauge, 0);
  assert.deepEqual(events, ['debut ruee', 'fin ruee']);
});

test('Louisa : le Plan de bataille repère les adversaires le temps de la capacité', () => {
  const { world, actor, cmd, run } = setup('louisa');
  const enemy = enemyAt(world, 10, -20);
  const ally = world.addActor({ team: 1, character: CHARACTERS.emma });
  actor.gauge = SPECIAL_COST;
  cmd.special = true;
  run(1);
  assert.ok(enemy.revealedT > 0);
  assert.ok(ally.revealedT <= 0 && actor.revealedT <= 0);
  run(SPECIALS.plan.duration);
  assert.ok(enemy.revealedT <= 0);
});

test('Emma : le Cercle d\'entraide soigne et recharge les alliées proches, pas les autres', () => {
  const { world, actor, cmd, run } = setup('emma');
  const near = world.addActor({ team: 1, character: CHARACTERS.ines });   // à 3 m
  const far = world.addActor({ team: 1, character: CHARACTERS.louisa, spawn: { pos: [0, 0, -10], yaw: 0 } });
  const enemy = enemyAt(world, 0, 18);
  for (const a of [actor, near, far, enemy]) { a.hp = 20; a.ink = 0; a.sinceDamage = 0; a.sinceFire = 0; }
  actor.gauge = SPECIAL_COST;
  cmd.special = true;
  run(1);
  const healed = 20 + SPECIALS.cercle.heal;
  assert.ok(Math.abs(actor.hp - healed) < 1.5 && Math.abs(near.hp - healed) < 1.5, `vie ${actor.hp} / ${near.hp}`);
  assert.ok(near.ink > SPECIALS.cercle.ink * 0.9);
  assert.equal(far.hp, 20, 'trop loin');
  assert.equal(enemy.hp, 20, 'pas les adversaires');
});

// ---- bots ----

function botMatch(teams, { seconds = 60, seed = 3, map = FERME } = {}) {
  const world = new World(map, { seed });
  const nav = new Nav(world.level);
  const squads = [null, [], []];
  const bots = teams.map(([team, id]) => {
    const bot = new Bot(world, world.addActor({ team, character: CHARACTERS[id] }), nav, squads[team]);
    squads[team].push(bot);
    return bot;
  });
  world.startMatch({ duration: seconds, countdown: 0.5 });
  const used = new Set();
  world.events.on('capacite:debut', (e) => used.add(e.kind));
  const commands = [];
  for (let i = 0; i < (seconds + 1) / STEP; i++) {
    for (let b = 0; b < bots.length; b++) commands[b] = bots[b].command(STEP);
    world.step(commands, STEP);
  }
  return { world, bots, used };
}

test('bots : chaque héroïne peint, se bat et déclenche sa capacité', () => {
  const teams = [];
  for (const team of [1, 2]) for (const id of ['ines', 'louisa', 'emma', 'ines']) teams.push([team, id]);
  const { world, bots, used } = botMatch(teams, { seconds: 120 });
  assert.ok(world.match.result);
  for (const bot of bots) {
    const a = bot.actor;
    assert.ok(a.turf > 60, `${a.character.name} peint : ${a.turf.toFixed(0)} m²`);
    assert.ok(Math.abs(a.pos.x) < 30 && Math.abs(a.pos.z) < 30 && a.pos.y > -1);
  }
  assert.deepEqual([...used].sort(), ['cercle', 'plan', 'ruee']);
  const kills = bots.reduce((n, b) => n + b.actor.kills, 0);
  assert.ok(kills >= 4, `éliminations ${kills}`);
  for (const id of CHARACTER_IDS) {
    const got = bots.filter((b) => b.actor.character.id === id).reduce((n, b) => n + b.actor.kills, 0);
    assert.ok(got >= 1, `${id} élimine au moins une fois`);
  }
});
