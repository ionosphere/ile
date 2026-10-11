// Apparence des animaux : les vaches (blanches à taches, puis à la couleur de l'équipe qui les a peintes)
// et les chèvres du lâcher (brunes à cornes, foulard à la couleur de leur équipe).

import * as THREE from 'three';
import { TEAMS } from '../config/tuning.js';
import { buildCow, buildGoat } from './models.js';

// Tourne vers un cap par le plus court chemin.
function turnToward(current, target, amount) {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return current + d * amount;
}

export class CowViews {
  constructor(cows) {
    this.group = new THREE.Group();
    this.items = cows.list.map((cow) => {
      const model = buildCow();
      model.group.rotation.y = cow.yaw;
      this.group.add(model.group);
      return { cow, model, team: 0 };
    });
  }

  update(alpha, dt) {
    for (const it of this.items) {
      const { cow, model } = it;
      const g = model.group;
      g.position.set(cow.prev.x + (cow.pos.x - cow.prev.x) * alpha, 0, cow.prev.z + (cow.pos.z - cow.prev.z) * alpha);
      g.rotation.y = turnToward(g.rotation.y, cow.yaw, 1 - Math.exp(-3 * dt));
      const speed = dt > 0 ? Math.hypot(cow.pos.x - cow.prev.x, cow.pos.z - cow.prev.z) * 60 : 0;
      model.animate(speed, dt);
      if (it.team !== cow.team) {
        it.team = cow.team;
        model.setTeam(cow.team ? TEAMS[cow.team].color : null);
      }
    }
  }
}

export class GoatViews {
  constructor(goats) {
    this.goats = goats;
    this.group = new THREE.Group();
    this.views = new Map();
  }

  update(alpha, dt) {
    const alive = new Set(this.goats.list);
    for (const [goat, model] of this.views) {
      if (alive.has(goat)) continue;
      this.group.remove(model.group);
      model.group.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      this.views.delete(goat);
    }
    for (const goat of this.goats.list) {
      let model = this.views.get(goat);
      if (!model) {
        model = buildGoat(TEAMS[goat.team].color);
        this.group.add(model.group);
        this.views.set(goat, model);
      }
      const p = goat.pos;
      const q = goat.prev;
      model.group.position.set(q.x + (p.x - q.x) * alpha, q.y + (p.y - q.y) * alpha, q.z + (p.z - q.z) * alpha);
      // dressée contre le mur quand elle grimpe
      model.group.rotation.set(goat.climbing ? Math.PI / 2 : 0, goat.yaw, 0, 'YXZ');
      model.animate(dt, goat.climbing);
    }
  }
}
