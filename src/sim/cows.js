// Les vaches : elles suivent lentement leur trajet, gênent le passage et les tirs,
// et comptent comme du terrain pour l'équipe qui les a peintes en dernier.

import { COW } from '../config/animals.js';

export class Cows {
  constructor(world, defs) {
    this.world = world;
    this.cells = Math.round(COW.area / world.paint.cell ** 2);
    this.list = defs.map((d) => {
      const [x, z] = d.path[0];
      return { path: d.path, next: 1 % d.path.length, pos: { x, y: 0, z }, prev: { x, y: 0, z }, yaw: 0, team: 0, wait: 0 };
    });
    world.paint.addExtra(this.cells * this.list.length);
  }

  step(dt) {
    const { rng, actors } = this.world;
    for (const cow of this.list) {
      cow.prev.x = cow.pos.x;
      cow.prev.z = cow.pos.z;
      if (cow.wait > 0) { cow.wait -= dt; continue; }
      const [tx, tz] = cow.path[cow.next];
      let dx = tx - cow.pos.x;
      let dz = tz - cow.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.1) {
        cow.next = (cow.next + 1) % cow.path.length;
        cow.wait = COW.pause[0] + rng() * (COW.pause[1] - COW.pause[0]);
        continue;
      }
      dx /= d;
      dz /= d;
      cow.yaw = Math.atan2(-dx, -dz);
      // quelqu'un devant : la vache attend plutôt que de pousser
      let blocked = false;
      for (const a of actors) {
        if (!a.alive || a.pos.y > COW.height) continue;
        if (Math.hypot(a.pos.x - (cow.pos.x + dx * 0.9), a.pos.z - (cow.pos.z + dz * 0.9)) < 1) { blocked = true; break; }
      }
      if (blocked) continue;
      const move = Math.min(d, COW.speed * dt);
      cow.pos.x += dx * move;
      cow.pos.z += dz * move;
    }
  }

  // Peint la vache à la couleur d'une équipe. Renvoie la surface gagnée, en m².
  paint(cow, team) {
    if (cow.team === team) return 0;
    this.world.paint.moveExtra(cow.team, team, this.cells);
    cow.team = team;
    this.world.events.emit('vache:peinte', { cow, team });
    return COW.area;
  }

  // Première vache touchée le long du segment (dx, dy, dz), à une fraction t <= maxT.
  firstHit(x, y, z, dx, dy, dz, maxT, extra = 0) {
    let best = null;
    const dd = dx * dx + dz * dz;
    for (const cow of this.list) {
      const ox = x - cow.pos.x;
      const oz = z - cow.pos.z;
      const t = dd > 1e-12 ? Math.min(maxT, Math.max(0, -(ox * dx + oz * dz) / dd)) : 0;
      const cx = ox + dx * t;
      const cz = oz + dz * t;
      const r = COW.radius + extra;
      if (cx * cx + cz * cz > r * r) continue;
      const py = y + dy * t;
      if (py < 0 || py > COW.height + extra) continue;
      // t est le point le plus proche de l'axe : on recule jusqu'au bord de la vache
      const back = dd > 1e-12 ? Math.sqrt(Math.max(0, r * r - (cx * cx + cz * cz)) / dd) : 0;
      const enter = Math.max(0, t - back);
      if (!best || enter < best.t) best = { cow, t: enter };
    }
    return best;
  }

  // Peint toutes les vaches à moins de `radius` d'un point. Renvoie la surface gagnée.
  paintNear(x, y, z, radius, team) {
    let gained = 0;
    for (const cow of this.list) {
      if (Math.abs(y - cow.pos.y) > COW.height + 0.5) continue;
      if (Math.hypot(cow.pos.x - x, cow.pos.z - z) < radius + COW.radius) gained += this.paint(cow, team);
    }
    return gained;
  }

  // Repousse un acteur hors des vaches (appelé après les collisions avec le décor).
  pushOut(pos, radius, height) {
    for (const cow of this.list) {
      if (pos.y >= COW.height || pos.y + height <= 0) continue;
      const dx = pos.x - cow.pos.x;
      const dz = pos.z - cow.pos.z;
      const d = Math.hypot(dx, dz);
      const min = radius + COW.radius;
      if (d >= min) continue;
      if (d < 1e-6) { pos.x += min; continue; }
      pos.x += (dx / d) * (min - d);
      pos.z += (dz / d) * (min - d);
    }
  }
}
