// Tous les projectiles en un seul objet instancié : des gouttes brillantes, étirées dans le sens du vol.

import * as THREE from 'three';
import { TEAMS } from '../config/tuning.js';

const MAX = 256;

export class ProjectileView {
  constructor(projectiles) {
    this.projectiles = projectiles;
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.18 }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.dummy = new THREE.Object3D();
    this.colors = TEAMS.map((t) => (t ? new THREE.Color(t.color) : null));
  }

  update() {
    const list = this.projectiles.list;
    const n = Math.min(list.length, MAX);
    const d = this.dummy;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      d.position.set(p.x, p.y, p.z);
      d.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
      d.scale.set(0.85, 0.85, 1 + Math.hypot(p.vx, p.vy, p.vz) * 0.05);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.mesh.setColorAt(i, this.colors[p.team]);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
