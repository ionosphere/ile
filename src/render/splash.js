// Éclaboussures : des gouttes de peinture qui giclent à chaque impact et à chaque élimination.

import * as THREE from 'three';
import { TEAMS } from '../config/tuning.js';

const MAX = 360;
const GRAVITY = 16;

export class Splash {
  constructor(events) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.07, 6, 5),
      new THREE.MeshStandardMaterial({ roughness: 0.2 }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.colors = TEAMS.map((t) => (t ? new THREE.Color(t.color) : null));
    this.drops = [];
    this.matrix = new THREE.Matrix4();
    this.scale = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();

    events.on('impact', (e) => this.burst(e.x, e.y, e.z, e.nx, e.ny, e.nz, e.team, 6, 4.5));
    events.on('elimine', ({ actor, killer }) => {
      if (killer) this.burst(actor.pos.x, actor.pos.y + 0.8, actor.pos.z, 0, 1, 0, killer.team, 36, 7);
    });
    events.on('vache:peinte', ({ cow, team }) => this.burst(cow.pos.x, 1.2, cow.pos.z, 0, 1, 0, team, 16, 5));
  }

  // n gouttes projetées depuis un point, plutôt du côté de la normale (nx, ny, nz).
  burst(x, y, z, nx, ny, nz, team, n, speed) {
    for (let i = 0; i < n; i++) {
      if (this.drops.length >= MAX) this.drops.shift();
      const s = speed * (0.4 + Math.random() * 0.8);
      this.drops.push({
        x: x + nx * 0.05, y: y + ny * 0.05, z: z + nz * 0.05,
        vx: (nx * 0.7 + (Math.random() - 0.5) * 1.4) * s,
        vy: (ny * 0.7 + Math.random() * 0.9) * s,
        vz: (nz * 0.7 + (Math.random() - 0.5) * 1.4) * s,
        life: 0.35 + Math.random() * 0.35,
        size: 0.6 + Math.random() * 1.1,
        team,
      });
    }
  }

  update(dt) {
    const drops = this.drops;
    let n = 0;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.life -= dt;
      if (d.life <= 0) { drops.splice(i, 1); continue; }
      d.vy -= GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
    }
    for (const d of drops) {
      const s = d.size * Math.min(1, d.life * 5);
      this.matrix.compose(this.pos.set(d.x, d.y, d.z), this.quat, this.scale.set(s, s, s));
      this.mesh.setMatrixAt(n, this.matrix);
      this.mesh.setColorAt(n, this.colors[d.team]);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
