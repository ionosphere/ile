// Ce que le serveur et les appareils des joueurs se disent pendant un match. Partagé par les deux côtés.
//
// Le serveur fait tourner la vraie simulation. Plusieurs fois par seconde, il envoie un « instantané » :
// l'état des actrices, des chèvres et des vaches, plus tout ce qui s'est produit depuis le précédent
// (taches de peinture, projectiles tirés, événements). Chaque appareil rejoue ces taches sur sa propre
// grille de peinture, qui reste ainsi identique à celle du serveur.

import { WEAPONS } from '../config/weapons.js';

export const SNAPSHOT_EVERY = 3;      // pas de simulation entre deux instantanés (20 par seconde)
export const MAX_PLAYERS = 8;
export const NAME_MAX = 14;

// Les caractéristiques de vol d'un projectile, désignées par un numéro.
export const PROJECTILE_SPECS = [];
for (const w of Object.values(WEAPONS)) {
  if (w.speed) PROJECTILE_SPECS.push(w);
  if (w.fling) PROJECTILE_SPECS.push(w.fling);
}

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---- commandes ----

const BITS = ['fire', 'cat', 'jump', 'special', 'goats'];

export function encodeCommand(cmd) {
  let bits = 0;
  for (let i = 0; i < BITS.length; i++) if (cmd[BITS[i]]) bits |= 1 << i;
  return [r2(cmd.move.x), r2(cmd.move.z), cmd.yaw, cmd.pitch, bits];
}

// Écrit dans `cmd` une commande reçue. Renvoie false si elle est mal formée (rien n'est alors modifié).
export function decodeCommand(data, cmd) {
  if (!Array.isArray(data) || data.length !== 5) return false;
  for (const v of data) if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  const [mx, mz, yaw, pitch, bits] = data;
  if (Math.abs(yaw) > 1e5) return false;
  cmd.move.x = Math.max(-1, Math.min(1, mx));
  cmd.move.z = Math.max(-1, Math.min(1, mz));
  cmd.yaw = yaw;
  cmd.pitch = Math.max(-1.4, Math.min(1.4, pitch));
  for (let i = 0; i < BITS.length; i++) cmd[BITS[i]] = (bits & (1 << i)) !== 0;
  return true;
}

// ---- actrices ----

const CAT = 1, GROUNDED = 2, CLIMBING = 4, SUBMERGED = 8, ALIVE = 16, FIRING = 32, ROLLING = 64, FORCED = 128;

export function encodeActor(a) {
  const bits = (a.form === 'cat' ? CAT : 0) | (a.grounded ? GROUNDED : 0) | (a.climbing ? CLIMBING : 0) | (a.submerged ? SUBMERGED : 0)
    | (a.alive ? ALIVE : 0) | (a.firing ? FIRING : 0) | (a.rolling ? ROLLING : 0) | (a.forced ? FORCED : 0);
  return [
    r3(a.pos.x), r3(a.pos.y), r3(a.pos.z), r2(a.vel.x), r2(a.vel.y), r2(a.vel.z), r3(a.yaw), r3(a.pitch), bits,
    r2(a.hp), r2(a.ink), r2(a.charge), r2(a.gauge), r2(a.goatGauge), r2(Math.max(0, a.specialT)), r2(Math.max(0, a.revealedT)),
    r2(Math.max(0, a.respawnT)), r2(Math.min(9, a.sinceDamage)), Math.round(a.turf), a.kills, a.deaths,
    a.climbing && a.wall ? r2(a.wall.nx) : 0, a.climbing && a.wall ? r2(a.wall.nz) : 0,
  ];
}

// Tout sauf la position et le regard, qui sont interpolés à part.
export function applyActorState(a, d) {
  const bits = d[8];
  a.form = bits & CAT ? 'cat' : 'human';
  a.grounded = (bits & GROUNDED) !== 0;
  a.climbing = (bits & CLIMBING) !== 0;
  a.submerged = (bits & SUBMERGED) !== 0;
  a.alive = (bits & ALIVE) !== 0;
  a.firing = (bits & FIRING) !== 0;
  a.rolling = (bits & ROLLING) !== 0;
  a.forced = bits & FORCED ? (a.forced ?? { x: 0, z: 0 }) : null;
  a.vel.x = d[3];
  a.vel.y = d[4];
  a.vel.z = d[5];
  a.hp = d[9];
  a.ink = d[10];
  a.charge = d[11];
  a.gauge = d[12];
  a.goatGauge = d[13];
  a.specialT = d[14];
  a.revealedT = d[15];
  a.respawnT = d[16];
  a.sinceDamage = d[17];
  a.turf = d[18];
  a.kills = d[19];
  a.deaths = d[20];
  a.wall = a.climbing ? { nx: d[21], nz: d[22], flat: 1 } : null;
}

// État exact de l'actrice d'un joueur, pour qu'il recale sa prédiction de déplacement.
export function encodeSelf(a, ack) {
  return {
    ack,
    p: [a.pos.x, a.pos.y, a.pos.z],
    v: [a.vel.x, a.vel.y, a.vel.z],
    b: (a.form === 'cat' ? CAT : 0) | (a.grounded ? GROUNDED : 0) | (a.climbing ? CLIMBING : 0) | (a.submerged ? SUBMERGED : 0) | (a.jumpHeld ? 16 : 0) | (a.firing ? FIRING : 0),
    w: a.wall ? [a.wall.nx, a.wall.nz, a.wall.flat] : null,
    j: [a.jumpBufferT, a.coyoteT],
    d: a.dodgeT > 0 || a.dodgeCd > 0 ? [a.dodgeT, a.dodgeCd, a.dodgeX, a.dodgeZ] : null,
    f: a.forced ? [a.forced.x, a.forced.z] : null,
  };
}

export function applySelf(a, s) {
  [a.pos.x, a.pos.y, a.pos.z] = s.p;
  [a.vel.x, a.vel.y, a.vel.z] = s.v;
  a.form = s.b & CAT ? 'cat' : 'human';
  a.grounded = (s.b & GROUNDED) !== 0;
  a.climbing = (s.b & CLIMBING) !== 0;
  a.submerged = (s.b & SUBMERGED) !== 0;
  a.jumpHeld = (s.b & 16) !== 0;
  a.firing = (s.b & FIRING) !== 0;
  a.wall = s.w ? { nx: s.w[0], nz: s.w[1], flat: s.w[2] } : null;
  [a.jumpBufferT, a.coyoteT] = s.j;
  if (s.d) [a.dodgeT, a.dodgeCd, a.dodgeX, a.dodgeZ] = s.d;
  else a.dodgeT = a.dodgeCd = 0;
  a.forced = s.f ? { x: s.f[0], z: s.f[1] } : null;
}

// ---- animaux ----

export const encodeGoat = (g, actors) => [g.id, r2(g.pos.x), r2(g.pos.y), r2(g.pos.z), r2(g.yaw), g.climbing ? 1 : 0, g.team, actors.indexOf(g.owner)];
export const encodeCow = (c) => [r2(c.pos.x), r2(c.pos.z), r2(c.yaw), c.team];

// ---- peinture et projectiles ----

// Arrondit une tache avant de la peindre : le serveur et les appareils peignent ainsi exactement la même.
export const roundSplat = (x, y, z, r, team, seed) => [r3(x), r3(y), r3(z), r3(r), team, r2(seed)];

export const encodeProjectile = (p, actors) => [r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vy), r2(p.vz), p.team, PROJECTILE_SPECS.indexOf(p.weapon), actors.indexOf(p.owner)];

// ---- événements ----

// Pour chaque événement de la simulation à relayer : comment l'écrire (les actrices deviennent des numéros)
// et comment le relire.
const idx = (actors, a) => (a ? actors.indexOf(a) : -1);
const at = (actors, i) => (i >= 0 ? actors[i] : null);
export const EVENTS = {
  tir: { write: (e, A) => [idx(A, e.actor)], read: (d, A) => ({ actor: at(A, d[0]) }) },
  esquive: { write: (e, A) => [idx(A, e.actor)], read: (d, A) => ({ actor: at(A, d[0]) }) },
  reservoir_vide: { write: (e, A) => [idx(A, e.actor)], read: (d, A) => ({ actor: at(A, d[0]) }) },
  reapparu: { write: (e, A) => [idx(A, e.actor)], read: (d, A) => ({ actor: at(A, d[0]) }) },
  'chevres:lachees': { write: (e, A) => [idx(A, e.actor)], read: (d, A) => ({ actor: at(A, d[0]) }) },
  touche: { write: (e, A) => [idx(A, e.actor), idx(A, e.attacker)], read: (d, A) => ({ actor: at(A, d[0]), attacker: at(A, d[1]) }) },
  elimine: { write: (e, A) => [idx(A, e.actor), idx(A, e.killer)], read: (d, A) => ({ actor: at(A, d[0]), killer: at(A, d[1]) }) },
  'capacite:debut': { write: (e, A) => [idx(A, e.actor), e.kind], read: (d, A) => ({ actor: at(A, d[0]), kind: d[1] }) },
  'capacite:fin': { write: (e, A) => [idx(A, e.actor), e.kind], read: (d, A) => ({ actor: at(A, d[0]), kind: d[1] }) },
  trait: {
    write: (e, A) => [idx(A, e.actor), e.team, r2(e.charge), r2(e.x0), r2(e.y0), r2(e.z0), r2(e.x1), r2(e.y1), r2(e.z1)],
    read: (d, A) => ({ actor: at(A, d[0]), team: d[1], charge: d[2], x0: d[3], y0: d[4], z0: d[5], x1: d[6], y1: d[7], z1: d[8] }),
  },
  impact: {
    write: (e, A) => [r2(e.x), r2(e.y), r2(e.z), e.nx, e.ny, e.nz, e.team, idx(A, e.actor)],
    read: (d, A) => ({ x: d[0], y: d[1], z: d[2], nx: d[3], ny: d[4], nz: d[5], team: d[6], actor: at(A, d[7]) ?? undefined }),
  },
  'match:debut': { write: () => [], read: () => undefined },
  'match:fin': { write: (e) => [e.coverage, e.winner], read: (d) => ({ coverage: d[0], winner: d[1] }) },
};
