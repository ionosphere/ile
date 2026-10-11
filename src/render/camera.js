// Caméra à l'épaule. Elle se tient sur la droite de visée de la simulation (voir AIM),
// se rapproche quand un mur s'interpose et s'abaisse en forme chat.

import { AIM, CAMERA } from '../config/tuning.js';

export class CameraRig {
  constructor(camera, level) {
    this.camera = camera;
    this.level = level;
    this.drop = 0;
  }

  update(view, actor, dt) {
    const sy = Math.sin(actor.yaw);
    const cy = Math.cos(actor.yaw);
    const sp = Math.sin(actor.pitch);
    const cp = Math.cos(actor.pitch);
    const fx = -sy * cp, fy = sp, fz = -cy * cp;

    this.drop += ((actor.form === 'cat' ? CAMERA.catDrop : 0) - this.drop) * (1 - Math.exp(-10 * dt));
    const p = view.group.position;
    const px = p.x + cy * AIM.side;
    const py = p.y + AIM.height - this.drop;
    const pz = p.z - sy * AIM.side;

    // recule depuis le dessus de la tête, sans traverser le décor
    const hx = p.x, hy = py, hz = p.z;
    let dx = px - fx * CAMERA.dist - hx;
    let dy = py - fy * CAMERA.dist - hy;
    let dz = pz - fz * CAMERA.dist - hz;
    const len = Math.hypot(dx, dy, dz);
    dx /= len; dy /= len; dz /= len;
    const hit = this.level.raycast(hx, hy, hz, dx, dy, dz, len + CAMERA.wallMargin);
    const d = hit ? Math.max(0.3, hit.t - CAMERA.wallMargin) : len;

    this.camera.position.set(hx + dx * d, hy + dy * d, hz + dz * d);
    this.camera.rotation.set(actor.pitch, actor.yaw, 0);
  }
}
