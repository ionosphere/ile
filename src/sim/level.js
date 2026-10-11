// Le niveau : une liste de boîtes alignées sur les axes, avec lancers de rayon et collisions.
// Le nombre de boîtes est petit, donc on les parcourt toutes ; un index spatial s'ajoutera
// ici sans changer l'interface si la carte grossit.

const SKIN = 0.03;

export class Level {
  constructor(map) {
    this.boxes = map.boxes.map((b, id) => ({ id, min: b.min, max: b.max, color: b.color, sides: b.sides !== false }));
  }

  // Rayon de direction normalisée (dx, dy, dz). Renvoie le premier impact ou null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const o = [ox, oy, oz];
    const d = [dx, dy, dz];
    let best = null;
    for (const b of this.boxes) {
      let tEnter = -Infinity;
      let tExit = Infinity;
      let axis = -1;
      let hit = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-9) {
          if (o[k] <= b.min[k] || o[k] >= b.max[k]) { hit = false; break; }
          continue;
        }
        let t1 = (b.min[k] - o[k]) / d[k];
        let t2 = (b.max[k] - o[k]) / d[k];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tEnter) { tEnter = t1; axis = k; }
        if (t2 < tExit) tExit = t2;
        if (tEnter > tExit) { hit = false; break; }
      }
      // tEnter < 0 : origine dans la boîte ou boîte derrière, on l'ignore
      if (!hit || tEnter < 0 || tEnter > maxDist) continue;
      if (!best || tEnter < best.t) best = { t: tEnter, box: b, axis, sign: d[axis] > 0 ? -1 : 1 };
    }
    if (best) {
      best.nx = best.axis === 0 ? best.sign : 0;
      best.ny = best.axis === 1 ? best.sign : 0;
      best.nz = best.axis === 2 ? best.sign : 0;
    }
    return best;
  }

  // Repousse un cylindre vertical (pieds en p, rayon r, hauteur h) hors des boîtes, à l'horizontale.
  // Monte les petites marches si canStep. Renvoie le contact mural le plus franc, ou null.
  collideHorizontal(p, r, h, stepHeight, canStep) {
    let contact = null;
    for (const b of this.boxes) {
      if (b.max[1] <= p.y + 0.05 || b.min[1] >= p.y + h) continue;
      const cx = Math.min(Math.max(p.x, b.min[0]), b.max[0]);
      const cz = Math.min(Math.max(p.z, b.min[2]), b.max[2]);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      const reach = r + SKIN;
      if (d2 >= reach * reach) continue;

      if (canStep && d2 < r * r && b.max[1] - p.y <= stepHeight + 1e-6) {
        p.y = b.max[1];
        continue;
      }

      let nx, nz, dist;
      if (d2 > 1e-10) {
        dist = Math.sqrt(d2);
        nx = dx / dist;
        nz = dz / dist;
      } else {
        // centre à l'intérieur : on sort par le côté le plus proche
        const left = p.x - b.min[0];
        const right = b.max[0] - p.x;
        const near = p.z - b.min[2];
        const far = b.max[2] - p.z;
        const m = Math.min(left, right, near, far);
        nx = m === left ? -1 : m === right ? 1 : 0;
        nz = nx !== 0 ? 0 : m === near ? -1 : 1;
        dist = -m;
      }
      if (dist < r) {
        p.x += nx * (r - dist);
        p.z += nz * (r - dist);
      }
      const flat = Math.max(Math.abs(nx), Math.abs(nz));
      if (!contact || flat > contact.flat) contact = { nx, nz, flat, box: b };
    }
    return contact;
  }

  // Après le déplacement vertical : pose le cylindre sur le sol traversé ou l'arrête sous un plafond.
  collideVertical(p, prevY, r, h, vy) {
    let ground = null;
    let ceiling = false;
    const rr = r * 0.92;   // légèrement réduit pour ne pas s'accrocher aux murs que l'on longe
    for (const b of this.boxes) {
      const cx = Math.min(Math.max(p.x, b.min[0]), b.max[0]);
      const cz = Math.min(Math.max(p.z, b.min[2]), b.max[2]);
      const dx = p.x - cx;
      const dz = p.z - cz;
      if (dx * dx + dz * dz >= rr * rr) continue;
      if (vy <= 0 && prevY >= b.max[1] - 0.01 && p.y <= b.max[1]) {
        p.y = b.max[1];
        ground = b;
      } else if (vy > 0 && prevY + h <= b.min[1] + 0.01 && p.y + h >= b.min[1]) {
        p.y = b.min[1] - h;
        ceiling = true;
      }
    }
    return { ground, ceiling };
  }
}
