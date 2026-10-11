// Capacités spéciales : la jauge se remplit en peignant, la touche dédiée la déclenche.

import { SPECIALS, SPECIAL_COST } from '../config/specials.js';

const TAU = Math.PI * 2;

export function updateSpecial(world, a, cmd, dt) {
  const pressed = cmd.special && !a.specialHeld;
  a.specialHeld = cmd.special;
  const kind = a.character.special;
  if (!kind) return;
  const s = SPECIALS[kind];

  if (a.specialT <= 0) {
    if (!pressed || a.gauge < SPECIAL_COST) return;
    a.gauge = 0;
    a.specialT = s.duration;
    a.specialState = { hit: new Set(), dist: 0 };
    world.events.emit('capacite:debut', { actor: a, kind });
  }

  UPDATE[kind](world, a, s, dt);
  a.specialT -= dt;
  if (a.specialT <= 0) endSpecial(world, a);
}

export function endSpecial(world, a) {
  if (a.specialState) world.events.emit('capacite:fin', { actor: a, kind: a.character.special });
  a.specialT = 0;
  a.forced = null;
  a.specialState = null;
}

const UPDATE = {
  // Ines : ruée en ligne droite, invulnérable, qui peint et bouscule
  ruee(world, a, s, dt) {
    const dx = -Math.sin(a.yaw);
    const dz = -Math.cos(a.yaw);
    a.forced = { x: dx * s.speed, z: dz * s.speed };
    a.invulnT = Math.max(a.invulnT, 0.15);
    const st = a.specialState;
    st.dist += s.speed * dt;
    while (st.dist >= s.splatEvery) {
      st.dist -= s.splatEvery;
      a.turf += world.paint.splat(a.pos.x, a.pos.y, a.pos.z, s.splatRadius, a.team, world.rng() * TAU);
      a.turf += world.cows.paintNear(a.pos.x, a.pos.y, a.pos.z, s.hitRadius, a.team);
    }
    for (const e of world.actors) {
      if (e.team === a.team || !e.alive || st.hit.has(e)) continue;
      if (Math.abs(e.pos.y - a.pos.y) > 1.5) continue;
      if (Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z) > s.hitRadius) continue;
      st.hit.add(e);
      if (e.damage(s.damage, a) && e.alive) {
        e.vel.x += dx * s.knockback;
        e.vel.z += dz * s.knockback;
        e.vel.y = 5;
        e.grounded = false;
      }
    }
  },

  // Louisa : tous les adversaires sont repérés tant que la capacité dure
  plan(world, a) {
    for (const e of world.actors) {
      if (e.team !== a.team && e.alive) e.revealedT = 0.25;
    }
  },

  // Emma : un cercle qui la suit, soigne les alliées et recharge leur peinture
  cercle(world, a, s, dt) {
    for (const ally of world.actors) {
      if (ally.team !== a.team || !ally.alive) continue;
      if (Math.hypot(ally.pos.x - a.pos.x, ally.pos.y - a.pos.y, ally.pos.z - a.pos.z) > s.radius) continue;
      ally.hp = Math.min(ally.maxHp, ally.hp + s.heal * dt);
      ally.ink = Math.min(ally.inkMax, ally.ink + s.ink * dt);
    }
  },
};
