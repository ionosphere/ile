// Traits de peinture du tir chargé : un éclair bref entre l'arme et le point d'impact.

import * as THREE from 'three';
import { TEAMS } from '../config/tuning.js';

const LIFE = 0.22;
const POOL = 8;

export class BeamView {
  constructor(events) {
    this.group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    this.beams = [];
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      mesh.visible = false;
      this.group.add(mesh);
      this.beams.push({ mesh, t: 0 });
    }
    this.next = 0;
    this.end = new THREE.Vector3();
    events.on('trait', (e) => this._show(e));
  }

  _show(e) {
    const beam = this.beams[this.next];
    this.next = (this.next + 1) % POOL;
    const { mesh } = beam;
    const length = Math.hypot(e.x1 - e.x0, e.y1 - e.y0, e.z1 - e.z0);
    const width = 0.05 + e.charge * 0.12;
    mesh.position.set((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, (e.z0 + e.z1) / 2);
    mesh.lookAt(this.end.set(e.x1, e.y1, e.z1));
    mesh.scale.set(width, width, length);
    mesh.material.color.set(TEAMS[e.team].color);
    mesh.visible = true;
    beam.t = LIFE;
  }

  update(dt) {
    for (const beam of this.beams) {
      if (beam.t <= 0) continue;
      beam.t -= dt;
      beam.mesh.material.opacity = Math.max(0, beam.t / LIFE);
      beam.mesh.visible = beam.t > 0;
    }
  }
}
