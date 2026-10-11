// Le lâcher de chèvres, coup spécial commun à toutes les héroïnes : trois chèvres courent quelques
// secondes, peignent sous leurs pattes et grimpent aux murs qu'elles rencontrent.

import { PLAYER } from '../config/tuning.js';
import { GOATS } from '../config/animals.js';

const TAU = Math.PI * 2;

// Déclenchement par un acteur : la touche dédiée, quand la jauge est pleine.
export function updateGoatTrigger(world, a, cmd) {
  const pressed = cmd.goats && !a.goatsHeld;
  a.goatsHeld = cmd.goats;
  if (!pressed || a.goatGauge < GOATS.cost) return;
  a.goatGauge = 0;
  world.goats.release(a);
}

export class Goats {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.nextId = 1;
  }

  release(owner) {
    for (let i = 0; i < GOATS.count; i++) {
      const yaw = owner.yaw + ((i - (GOATS.count - 1) / 2) * TAU) / 5;
      this.list.push({
        id: this.nextId++,
        owner,
        team: owner.team,
        pos: { x: owner.pos.x - Math.sin(yaw) * 0.9, y: owner.pos.y + 0.1, z: owner.pos.z - Math.cos(yaw) * 0.9 },
        prev: { x: owner.pos.x, y: owner.pos.y, z: owner.pos.z },
        yaw,
        vy: 0,
        t: GOATS.duration,
        turnT: GOATS.turnEvery,
        dist: 0,
        grounded: false,
        climbing: false,
      });
    }
    this.world.events.emit('chevres:lachees', { actor: owner });
  }

  step(dt) {
    const G = GOATS;
    const { level, paint, rng, cows } = this.world;
    const list = this.list;
    for (let n = list.length - 1; n >= 0; n--) {
      const g = list[n];
      const p = g.pos;
      g.prev.x = p.x;
      g.prev.y = p.y;
      g.prev.z = p.z;
      g.t -= dt;
      if (g.t <= 0 || p.y < PLAYER.fallDeathY) { list.splice(n, 1); continue; }

      g.turnT -= dt;
      if (g.turnT <= 0 && g.grounded) {
        g.yaw = this._pickHeading(g);
        g.turnT = G.turnEvery * (0.7 + rng() * 0.6);
      }
      let dx = -Math.sin(g.yaw);
      let dz = -Math.cos(g.yaw);
      // au bord du vide, ou d'une chute trop haute : demi-tour
      if (g.grounded && !level.raycast(p.x + dx * 0.9, p.y + 0.5, p.z + dz * 0.9, 0, -1, 0, G.maxDrop + 0.5)) {
        g.yaw += Math.PI * (0.7 + rng() * 0.6);
        dx = -Math.sin(g.yaw);
        dz = -Math.cos(g.yaw);
      }

      p.x += dx * G.speed * dt;
      p.z += dz * G.speed * dt;
      const wall = level.collideHorizontal(p, G.radius, G.height, PLAYER.stepHeight, g.grounded);
      const wasClimbing = g.climbing;
      g.climbing = !!wall && wall.flat > 0.9 && dx * wall.nx + dz * wall.nz < -0.3;
      if (g.climbing) {
        // face au mur, pour monter droit au lieu de glisser le long
        g.yaw = Math.atan2(wall.nx, wall.nz);
        g.vy = G.climbSpeed;
        g.dist += G.climbSpeed * dt;
      } else {
        if (wasClimbing && g.vy > 4) g.vy = 4;   // petit bond pour passer le rebord
        g.vy = Math.max(-PLAYER.maxFall, g.vy - PLAYER.gravity * dt);
        g.dist += Math.hypot(p.x - g.prev.x, p.z - g.prev.z);
      }
      const prevY = p.y;
      p.y += g.vy * dt;
      const res = level.collideVertical(p, prevY, G.radius, G.height, g.vy);
      g.grounded = !!res.ground;
      if (res.ground) g.vy = 0;
      if (res.ceiling) {
        // un surplomb bloque l'escalade : elle repart dans l'autre sens
        g.vy = 0;
        g.yaw += Math.PI;
      }

      // peint le sol sous ses pattes, ou le mur qu'elle grimpe
      while (g.dist >= G.splatEvery) {
        g.dist -= G.splatEvery;
        const x = g.climbing ? p.x - wall.nx * G.radius : p.x;
        const z = g.climbing ? p.z - wall.nz * G.radius : p.z;
        let area = 0;
        if (g.climbing || g.grounded) area = paint.splat(x, p.y + (g.climbing ? 0.3 : 0), z, G.splatRadius, g.team, rng() * TAU);
        area += cows.paintNear(p.x, p.y, p.z, 0.3, g.team);
        // le terrain compte pour celle qui a lâché les chèvres, sans recharger un nouveau lâcher
        g.owner.addTurf(area, false);
      }
    }
  }

  // Cap vers du terrain qui n'est pas encore à son équipe.
  _pickHeading(g) {
    const { paint, rng } = this.world;
    let best = g.yaw;
    let bestScore = -Infinity;
    for (let k = 0; k < 8; k++) {
      const yaw = rng() * TAU;
      const dx = -Math.sin(yaw);
      const dz = -Math.cos(yaw);
      let score = rng() * 0.3;
      if (paint.teamAt(g.pos.x + dx * 2.5, g.pos.y, g.pos.z + dz * 2.5, 1, 1) !== g.team) score += 0.5;
      if (paint.teamAt(g.pos.x + dx * 5, g.pos.y, g.pos.z + dz * 5, 1, 1) !== g.team) score += 1;
      if (score > bestScore) { bestScore = score; best = yaw; }
    }
    return best;
  }
}
