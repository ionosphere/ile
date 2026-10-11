// Logique de tir, paramétrée par config/weapons.js. Trois types : 'auto', 'charge' et 'roller'.

import { AIM, PLAYER } from '../config/tuning.js';
import { firstActorHit } from './projectiles.js';

const TAU = Math.PI * 2;
const lerp = (range, t) => range[0] + (range[1] - range[0]) * t;

export function updateWeapon(world, a, cmd, dt) {
  const w = a.weapon;
  a.cooldown -= dt;
  if (a.cooldown < -dt) a.cooldown = -dt;
  const held = a.form === 'human' && cmd.fire && !a.forced;
  const pressed = held && !a.triggerHeld;
  a.triggerHeld = held;
  a.firing = false;
  a.rolling = false;

  if (w.kind === 'auto') auto(world, a, w, held);
  else if (w.kind === 'charge') charge(world, a, w, held, cmd, dt);
  else if (w.kind === 'roller') roller(world, a, w, held, pressed, dt);
}

// ---- tir automatique ----

function auto(world, a, w, held) {
  a.firing = held;
  if (!held || a.cooldown > 0) return;
  if (a.ink < w.inkCost) {
    a.cooldown = 0.25;
    world.events.emit('reservoir_vide', { actor: a });
    return;
  }
  a.ink -= w.inkCost;
  a.sinceFire = 0;
  a.cooldown += w.interval;
  const dir = aimDirection(world, a);
  shoot(world, a, w, dir);
  world.events.emit('tir', { actor: a });
}

// ---- tir chargé ----

function charge(world, a, w, held, cmd, dt) {
  if (held && a.cooldown <= 0 && a.ink >= w.inkCost[0]) {
    a.firing = true;
    a.sinceFire = 0;
    a.charge = Math.min(1, a.charge + dt / w.chargeTime);
    return;
  }
  // relâcher la gâchette tire ; passer en chat ou être emportée annule la charge
  if (a.charge >= w.minCharge && a.form === 'human' && !cmd.fire && !a.forced) beam(world, a, w, a.charge);
  a.charge = 0;
}

function beam(world, a, w, c) {
  const { level, paint, rng, events } = world;
  a.ink = Math.max(0, a.ink - lerp(w.inkCost, c));
  a.sinceFire = 0;
  a.cooldown = w.cooldown;

  const m = muzzle(a);
  const dir = aimDirection(world, a, m);
  let end = lerp(w.range, c);
  let wall = level.raycast(m.x, m.y, m.z, dir.x, dir.y, dir.z, end);
  if (wall) end = wall.t;
  // une vache sur le trait l'arrête et se fait peindre
  const cow = world.cows.firstHit(m.x, m.y, m.z, dir.x * end, dir.y * end, dir.z * end, 1, w.hitRadius);
  if (cow) {
    end *= cow.t;
    wall = null;
  }
  const victim = firstActorHit(world, a.team, m.x, m.y, m.z, dir.x * end, dir.y * end, dir.z * end, 1, w.hitRadius);
  if (victim) {
    end *= victim.t;
    victim.actor.damage(lerp(w.damage, c), a);
  } else if (cow) {
    a.addTurf(world.cows.paint(cow.cow, a.team));
  } else if (wall) {
    a.addTurf(paint.splat(m.x + dir.x * end, m.y + dir.y * end, m.z + dir.z * end, lerp(w.splatRadius, c), a.team, rng() * TAU));
  }
  // traînée au sol sous le trait
  const r = lerp(w.trailRadius, c);
  for (let s = 1.2; s < end; s += w.trailEvery) {
    const x = m.x + dir.x * s, y = m.y + dir.y * s, z = m.z + dir.z * s;
    const down = level.raycast(x, y, z, 0, -1, 0, 5);
    if (down) a.addTurf(paint.splat(x, y - down.t, z, r, a.team, rng() * TAU));
  }
  events.emit('trait', {
    actor: a, team: a.team, charge: c,
    x0: m.x, y0: m.y, z0: m.z,
    x1: m.x + dir.x * end, y1: m.y + dir.y * end, z1: m.z + dir.z * end,
  });
}

// ---- rouleau ----

function roller(world, a, w, held, pressed, dt) {
  const f = w.fling;
  if (pressed && a.cooldown <= 0 && a.ink >= f.inkCost) {
    a.ink -= f.inkCost;
    a.sinceFire = 0;
    a.cooldown = f.cooldown;
    const pitch = Math.max(a.pitch, -0.2) + 0.12;
    for (let i = 0; i < f.count; i++) {
      const off = ((i / (f.count - 1) - 0.5) * f.arcDeg * Math.PI) / 180;
      shoot(world, a, f, angles(a.yaw + off, pitch));
    }
    world.events.emit('tir', { actor: a });
  }
  if (!held) return;
  a.firing = true;
  // le rouleau touche le sol une fois la gerbe partie
  if (a.cooldown > f.cooldown * 0.5 || !a.grounded || a.ink <= 0) return;
  a.rolling = true;

  let dx = a.stepX;
  let dz = a.stepZ;
  const moved = Math.hypot(dx, dz);
  if (moved > 1e-4) {
    dx /= moved;
    dz /= moved;
    a.sinceFire = 0;
    a.ink = Math.max(0, a.ink - moved * w.inkPerMeter);
    a.rollDist += moved;
    while (a.rollDist >= w.stripeEvery) {
      a.rollDist -= w.stripeEvery;
      // une bande posée en travers du déplacement
      const n = 4;
      const half = w.width / 2;
      const r = half / n + 0.35;
      for (let i = 0; i < n; i++) {
        const off = -half + (half * 2 * (i + 0.5)) / n;
        a.addTurf(world.paint.splat(a.pos.x + dx * 0.6 - dz * off, a.pos.y, a.pos.z + dz * 0.6 + dx * off, r, a.team, world.rng() * TAU));
      }
    }
  } else {
    dx = -Math.sin(a.yaw);
    dz = -Math.cos(a.yaw);
  }

  // écrase les adversaires au contact, et peint les vaches
  const cx = a.pos.x + dx * 0.7;
  const cz = a.pos.z + dz * 0.7;
  a.addTurf(world.cows.paintNear(cx, a.pos.y, cz, w.width / 2, a.team));
  for (const e of world.actors) {
    if (e.team === a.team || !e.alive) continue;
    if (Math.abs(e.pos.y - a.pos.y) > 1.2) continue;
    if (Math.hypot(e.pos.x - cx, e.pos.z - cz) < w.width / 2 + e.hitRadius) e.damage(w.contactDps * dt, a);
  }
}

// ---- outils communs ----

function angles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

// Bouche de l'arme, à hauteur d'épaule.
function muzzle(a) {
  const sy = Math.sin(a.yaw);
  const cy = Math.cos(a.yaw);
  return { x: a.pos.x + cy * 0.3 - sy * 0.45, y: a.pos.y + PLAYER.height * 0.78, z: a.pos.z - sy * 0.3 - cy * 0.45 };
}

// Direction de la bouche de l'arme vers le point que désigne le viseur.
function aimDirection(world, a, m = muzzle(a)) {
  const f = angles(a.yaw, a.pitch);
  const ex = a.pos.x + Math.cos(a.yaw) * AIM.side;
  const ey = a.pos.y + AIM.height;
  const ez = a.pos.z - Math.sin(a.yaw) * AIM.side;
  const hit = world.level.raycast(ex, ey, ez, f.x, f.y, f.z, AIM.range);
  const dist = Math.max(AIM.minDist, hit ? hit.t : AIM.range);
  const dx = ex + f.x * dist - m.x;
  const dy = ey + f.y * dist - m.y;
  const dz = ez + f.z * dist - m.z;
  const len = Math.hypot(dx, dy, dz);
  return { x: dx / len, y: dy / len, z: dz / len };
}

// Lance un projectile dans une direction, avec la dispersion de l'arme.
function shoot(world, a, spec, dir) {
  const sy = Math.sin(a.yaw);
  const cy = Math.cos(a.yaw);
  const spread = Math.tan((spec.spreadDeg * Math.PI) / 180);
  const s1 = (world.rng() * 2 - 1) * spread;
  const s2 = (world.rng() * 2 - 1) * spread;
  // dispersion sur la droite et le haut du regard
  const dx = dir.x + cy * s1;
  const dy = dir.y + s2;
  const dz = dir.z - sy * s1;
  const len = Math.hypot(dx, dy, dz);
  const m = muzzle(a);
  world.projectiles.spawn({
    x: m.x, y: m.y, z: m.z,
    vx: (dx / len) * spec.speed, vy: (dy / len) * spec.speed, vz: (dz / len) * spec.speed,
    owner: a,
    team: a.team,
    weapon: spec,
  });
}
