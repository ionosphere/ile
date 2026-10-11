// Minimap : le terrain vu de dessus, avec la peinture, les alliées, les vaches
// et les adversaires repérées par le Plan de bataille.

import { TEAMS } from '../config/tuning.js';

const PX_PER_M = 2.5;
const REFRESH = 0.25;   // secondes entre deux relectures de la peinture

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
  }

  // À appeler à chaque nouvelle partie : prépare, pour chaque pixel, la cellule de peinture qu'il montre.
  attach(world, player) {
    this.world = world;
    this.player = player;
    const { paint, level } = world;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of level.boxes) {
      x0 = Math.min(x0, b.min[0]); x1 = Math.max(x1, b.max[0]);
      z0 = Math.min(z0, b.min[2]); z1 = Math.max(z1, b.max[2]);
    }
    this.x0 = x0;
    this.z0 = z0;
    const w = (this.w = Math.round((x1 - x0) * PX_PER_M));
    const h = (this.h = Math.round((z1 - z0) * PX_PER_M));
    this.canvas.width = w;
    this.canvas.height = h;
    this.image = this.ctx.createImageData(w, h);
    this.cell = new Int32Array(w * h).fill(-1);
    this.base = new Uint8Array(w * h * 3);
    this.colors = [null, rgb(TEAMS[1].color), rgb(TEAMS[2].color)];

    // le dessus le plus haut sous chaque pixel
    const tops = paint.faces.filter((f) => f.axis === 1).sort((a, b) => b.plane - a.plane);
    for (let j = 0; j < h; j++) {
      const z = z0 + (j + 0.5) / PX_PER_M;
      for (let i = 0; i < w; i++) {
        const x = x0 + (i + 0.5) / PX_PER_M;
        const k = j * w + i;
        for (const f of tops) {
          if (x < f.u0 || x >= f.u1 || z < f.v0 || z >= f.v1) continue;
          const ci = Math.min(f.w - 1, Math.floor((x - f.u0) / paint.cell));
          const cj = Math.min(f.h - 1, Math.floor((z - f.v0) / paint.cell));
          const idx = (f.ay + cj) * paint.width + f.ax + ci;
          if (!(paint.flags[idx] & 1)) continue;
          this.cell[k] = idx;
          const c = rgb(f.box.color);
          // fond assombri, pour que la peinture ressorte
          this.base[k * 3] = c[0] * 0.55;
          this.base[k * 3 + 1] = c[1] * 0.55;
          this.base[k * 3 + 2] = c[2] * 0.55;
          break;
        }
      }
    }
    this.t = 0;
    this._paint();
  }

  _paint() {
    const { grid } = this.world.paint;
    const data = this.image.data;
    const n = this.w * this.h;
    for (let k = 0; k < n; k++) {
      const idx = this.cell[k];
      const team = idx >= 0 ? grid[idx] : 0;
      const o = k * 4;
      if (team) {
        const c = this.colors[team];
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2];
      } else {
        data[o] = this.base[k * 3]; data[o + 1] = this.base[k * 3 + 1]; data[o + 2] = this.base[k * 3 + 2];
      }
      data[o + 3] = idx >= 0 ? 255 : 0;
    }
  }

  update(dt) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = REFRESH;
      this._paint();
    }
    const { ctx, world, player } = this;
    ctx.putImageData(this.image, 0, 0);
    const px = (x) => (x - this.x0) * PX_PER_M;
    const pz = (z) => (z - this.z0) * PX_PER_M;

    for (const cow of world.cows.list) {
      ctx.fillStyle = cow.team ? TEAMS[cow.team].color : '#ffffff';
      ctx.strokeStyle = '#1d2430';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(px(cow.pos.x) - 2.5, pz(cow.pos.z) - 2.5, 5, 5);
      ctx.fill();
      ctx.stroke();
    }
    for (const a of world.actors) {
      if (!a.alive || a === player) continue;
      const ally = a.team === player.team;
      // une adversaire n'apparaît que repérée
      if (!ally && a.revealedT <= 0) continue;
      ctx.fillStyle = ally ? '#ffffff' : '#ffe14d';
      ctx.strokeStyle = '#1d2430';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ally) ctx.arc(px(a.pos.x), pz(a.pos.z), 3.5, 0, Math.PI * 2);
      else ctx.rect(px(a.pos.x) - 4, pz(a.pos.z) - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
    }
    // la joueuse : une flèche dans le sens du regard
    if (player.alive) {
      ctx.save();
      ctx.translate(px(player.pos.x), pz(player.pos.z));
      ctx.rotate(-player.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1d2430';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5.5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5.5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}
