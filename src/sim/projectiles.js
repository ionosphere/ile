// Projectiles de peinture : vol tendu jusqu'à la portée de l'arme, puis chute.
// Chaque projectile laisse tomber des gouttes en route et fait une tache à l'impact.

const TAU = Math.PI * 2;

export class Projectiles {
  constructor(world) {
    this.world = world;
    this.list = [];
    // Fantômes : sur l'appareil d'un joueur en réseau, les projectiles volent pour l'œil seulement ;
    // taches, dégâts et impacts viennent du serveur.
    this.ghost = false;
  }

  spawn(p) {
    p.dist = 0;
    p.age = 0;
    p.trail = this.world.rng() * p.weapon.trailEvery;
    this.list.push(p);
    this.onSpawn?.(p);
  }

  step(dt) {
    const { level, paint, events, rng, cows } = this.world;
    const list = this.list;
    for (let n = list.length - 1; n >= 0; n--) {
      const p = list[n];
      const w = p.weapon;
      if (p.dist > w.range) {
        const drag = Math.max(0, 1 - 5 * dt);
        p.vx *= drag;
        p.vz *= drag;
        p.vy -= 30 * dt;
      } else {
        p.vy -= w.gravity * dt;
      }

      const dx = p.vx * dt, dy = p.vy * dt, dz = p.vz * dt;
      const len = Math.hypot(dx, dy, dz);
      const hit = len > 1e-9 ? level.raycast(p.x, p.y, p.z, dx / len, dy / len, dz / len, len) : null;
      // un adversaire sur la trajectoire, avant le décor, encaisse le tir
      let reach = hit ? hit.t / len : 1;
      const cow = cows.firstHit(p.x, p.y, p.z, dx, dy, dz, reach, w.hitRadius);
      if (cow) reach = cow.t;
      const victim = firstActorHit(this.world, p.team, p.x, p.y, p.z, dx, dy, dz, reach, w.hitRadius);
      if (this.ghost) {
        if (victim || cow || hit || p.age > 4 || p.y < -10) { list.splice(n, 1); continue; }
        p.x += dx;
        p.y += dy;
        p.z += dz;
        p.dist += len;
        p.age += dt;
        continue;
      }
      if (victim) {
        const f = victim.t;
        victim.actor.damage(w.damage, p.owner);
        events.emit('impact', { x: p.x + dx * f, y: p.y + dy * f, z: p.z + dz * f, nx: 0, ny: 1, nz: 0, team: p.team, actor: victim.actor });
        list.splice(n, 1);
        continue;
      }
      if (cow) {
        p.owner.addTurf(cows.paint(cow.cow, p.team));
        events.emit('impact', { x: p.x + dx * cow.t, y: p.y + dy * cow.t, z: p.z + dz * cow.t, nx: 0, ny: 1, nz: 0, team: p.team });
        list.splice(n, 1);
        continue;
      }
      if (hit) {
        const f = hit.t / len;
        const hx = p.x + dx * f, hy = p.y + dy * f, hz = p.z + dz * f;
        p.owner.addTurf(paint.splat(hx, hy, hz, w.splatRadius, p.team, rng() * TAU));
        events.emit('impact', { x: hx, y: hy, z: hz, nx: hit.nx, ny: hit.ny, nz: hit.nz, team: p.team });
        list.splice(n, 1);
        continue;
      }

      p.x += dx;
      p.y += dy;
      p.z += dz;
      p.dist += len;
      p.age += dt;
      p.trail += len;
      if (p.trail >= w.trailEvery) {
        p.trail -= w.trailEvery;
        const down = level.raycast(p.x, p.y, p.z, 0, -1, 0, 8);
        if (down) p.owner.addTurf(paint.splat(p.x, p.y - down.t, p.z, w.trailRadius, p.team, rng() * TAU));
      }
      if (p.age > 4 || p.y < -10) list.splice(n, 1);
    }
  }
}

// Premier adversaire vivant de l'équipe `team` touché le long du segment (dx, dy, dz), à une fraction t <= maxT.
export function firstActorHit(world, team, x, y, z, dx, dy, dz, maxT, hitRadius) {
  let best = null;
  const dd = dx * dx + dz * dz;
  for (const a of world.actors) {
    if (a.team === team || !a.alive) continue;
    const ox = x - a.pos.x;
    const oz = z - a.pos.z;
    const t = dd > 1e-12 ? Math.min(maxT, Math.max(0, -(ox * dx + oz * dz) / dd)) : 0;
    const cx = ox + dx * t;
    const cz = oz + dz * t;
    const r = a.hitRadius + hitRadius;
    if (cx * cx + cz * cz > r * r) continue;
    const py = y + dy * t;
    if (py < a.pos.y - hitRadius || py > a.pos.y + a.height + hitRadius) continue;
    if (!best || t < best.t) best = { actor: a, t };
  }
  return best;
}
