// Copie locale d'un match joué sur le serveur. Elle ne simule rien d'elle-même, à deux exceptions près :
// le déplacement de notre propre héroïne, prédit tout de suite puis recalé sur ce que dit le serveur,
// et le vol des projectiles, purement visuel. Tout le reste est recopié des instantanés reçus,
// avec un léger retard qui permet de lisser le mouvement des autres entre deux instantanés.

import { World } from '../sim/world.js';
import { makeCommand } from '../core/command.js';
import { STEP } from '../config/tuning.js';
import { CHARACTERS } from '../config/characters.js';
import { MAPS } from '../config/maps/index.js';
import { EVENTS, PROJECTILE_SPECS, SNAPSHOT_EVERY, applyActorState, applySelf, encodeCommand, decodeCommand } from './protocol.js';

const DELAY = SNAPSHOT_EVERY * STEP * 2;   // retard d'affichage des autres : deux instantanés
const MAX_PENDING = 120;                   // commandes gardées en attente de confirmation (2 secondes)

// Écart entre deux angles, entre -π et π.
function turn(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Replica {
  // start : le message de début de match envoyé par le serveur
  constructor(start) {
    const world = new World(MAPS[start.map], { seed: 1 });
    for (const a of start.actors) {
      const actor = world.addActor({ team: a.team, character: CHARACTERS[a.character] });
      actor.puppet = true;
      actor.playerName = a.name;
      actor.offset = { x: 0, y: 0, z: 0 };   // écart visuel en cours de résorption après un recalage
    }
    world.startMatch(start.match);
    world.projectiles.ghost = true;
    this.world = world;
    this.player = world.actors[start.you] ?? null;
    this.playerIndex = start.you;
    this.snaps = [];
    this.playT = null;
    this.seq = 0;
    this.pending = [];
    this.goats = new Map();
  }

  // ---- réception ----

  receive(msg) {
    const d = msg.d;
    const { world } = this;
    const actors = world.actors;
    for (let i = 0; i + 5 < d.p.length; i += 6) world.paint.splat(d.p[i], d.p[i + 1], d.p[i + 2], d.p[i + 3], d.p[i + 4], d.p[i + 5]);
    // un onglet resté en arrière-plan ne fait plus voler ses projectiles : on ne les laisse pas s'accumuler
    if (world.projectiles.list.length > 200) world.projectiles.list.length = 0;
    for (const s of d.s) {
      const weapon = PROJECTILE_SPECS[s[7]];
      if (weapon) world.projectiles.spawn({ x: s[0], y: s[1], z: s[2], vx: s[3], vy: s[4], vz: s[5], team: s[6], weapon, owner: actors[s[8]] });
    }
    const m = world.match;
    [m.phase, m.countdown, m.remaining] = d.m;
    for (const [name, ...args] of d.e) {
      const codec = EVENTS[name];
      if (!codec) continue;
      const event = codec.read(args, actors);
      if (name === 'match:fin') m.result = event;
      world.events.emit(name, event);
    }
    this.snaps.push({ t: d.k * STEP, a: d.a, g: d.g, c: d.c });
    if (this.snaps.length > 12) this.snaps.shift();

    const player = this.player;
    if (!player || !msg.self) return;
    // recalage : on repart de l'état exact du serveur et on rejoue les commandes qu'il n'a pas encore vues
    const bx = player.pos.x, by = player.pos.y, bz = player.pos.z;
    applyActorState(player, d.a[this.playerIndex]);
    applySelf(player, msg.self);
    while (this.pending.length && this.pending[0].seq <= msg.self.ack) this.pending.shift();
    if (player.alive && m.phase === 'playing') for (const p of this.pending) player.step(p.cmd, STEP);
    const o = player.offset;
    o.x += bx - player.pos.x;
    o.y += by - player.pos.y;
    o.z += bz - player.pos.z;
    // un grand écart (retour au départ, bousculade) ne se lisse pas : on y va d'un coup
    if (Math.hypot(o.x, o.y, o.z) > 3) o.x = o.y = o.z = 0;
  }

  // ---- notre héroïne ----

  // À chaque pas de jeu : prédit le déplacement et renvoie le message à transmettre au serveur.
  command(input) {
    const player = this.player;
    if (!player) return null;
    const data = encodeCommand(input);
    const cmd = makeCommand();
    decodeCommand(data, cmd);   // exactement ce que le serveur lira
    const seq = ++this.seq;
    this.pending.push({ seq, cmd });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    if (player.alive && this.world.match.phase === 'playing') {
      player.step(cmd, STEP);
    } else {
      player.look(cmd);
      player.yaw = cmd.yaw;
      player.pitch = cmd.pitch;
    }
    return { t: 'cmd', s: seq, c: data };
  }

  // ---- les autres ----

  // À chaque image : place les autres actrices, les chèvres et les vaches entre deux instantanés.
  update(dt) {
    const snaps = this.snaps;
    if (!snaps.length) return;
    const newest = snaps[snaps.length - 1].t;
    const target = newest - DELAY;
    // l'horloge d'affichage suit celle du serveur, en accélérant ou ralentissant un peu pour ne pas dériver
    if (this.playT === null || Math.abs(target - this.playT) > 0.5) this.playT = target;
    else this.playT += dt * (1 + Math.max(-0.2, Math.min(0.2, (target - this.playT) * 2)));

    let i = snaps.length - 1;
    while (i > 0 && snaps[i - 1].t >= this.playT) i--;
    const s1 = snaps[i];
    const s0 = snaps[Math.max(0, i - 1)];
    const k = s1.t > s0.t ? Math.max(0, Math.min(1, (this.playT - s0.t) / (s1.t - s0.t))) : 1;
    const mix = (a, b) => a + (b - a) * k;

    const { world } = this;
    for (let n = 0; n < world.actors.length; n++) {
      const a = world.actors[n];
      const o = a.offset;
      const fade = Math.exp(-12 * dt);
      o.x *= fade;
      o.y *= fade;
      o.z *= fade;
      if (a === this.player) continue;
      const d0 = s0.a[n];
      const d1 = s1.a[n];
      applyActorState(a, d1);
      // une réapparition ne se parcourt pas : on saute directement à l'arrivée
      const jump = Math.hypot(d1[0] - d0[0], d1[1] - d0[1], d1[2] - d0[2]) > 6;
      a.pos.x = a.prev.x = jump ? d1[0] : mix(d0[0], d1[0]);
      a.pos.y = a.prev.y = jump ? d1[1] : mix(d0[1], d1[1]);
      a.pos.z = a.prev.z = jump ? d1[2] : mix(d0[2], d1[2]);
      a.yaw = d0[6] + turn(d0[6], d1[6]) * k;
      a.pitch = mix(d0[7], d1[7]);
    }

    for (let n = 0; n < world.cows.list.length && n < s1.c.length; n++) {
      const cow = world.cows.list[n];
      const c0 = s0.c[n] ?? s1.c[n];
      const c1 = s1.c[n];
      cow.pos.x = cow.prev.x = mix(c0[0], c1[0]);
      cow.pos.z = cow.prev.z = mix(c0[1], c1[1]);
      cow.yaw = c1[2];
      if (cow.team !== c1[3]) world.cows.paint(cow, c1[3]);
    }

    const list = world.goats.list;
    list.length = 0;
    for (const g1 of s1.g) {
      let goat = this.goats.get(g1[0]);
      if (!goat) {
        goat = { id: g1[0], team: g1[6], owner: world.actors[g1[7]], pos: { x: 0, y: 0, z: 0 }, prev: { x: 0, y: 0, z: 0 }, yaw: 0, climbing: false, seen: 0 };
        this.goats.set(goat.id, goat);
      }
      const g0 = s0.g.find((g) => g[0] === g1[0]) ?? g1;
      goat.pos.x = goat.prev.x = mix(g0[1], g1[1]);
      goat.pos.y = goat.prev.y = mix(g0[2], g1[2]);
      goat.pos.z = goat.prev.z = mix(g0[3], g1[3]);
      goat.yaw = g1[4];
      goat.climbing = g1[5] === 1;
      goat.seen = s1.t;
      list.push(goat);
    }
    for (const [id, goat] of this.goats) if (goat.seen < s1.t - 1) this.goats.delete(id);
  }
}
