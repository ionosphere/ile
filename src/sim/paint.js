// La peinture : une grille d'octets (0 = vierge, 1 et 2 = équipes) qui fait foi pour tout le jeu.
// Chaque face peignable du niveau occupe un rectangle dans un atlas unique ; le rendu en tire sa texture.

import { PAINT } from '../config/tuning.js';

const PAINTABLE = 1;
const SCORABLE = 2;

export class Paint {
  constructor(level, { cell = PAINT.cell, atlasWidth = PAINT.atlasWidth, maxPlaneDist = PAINT.maxPlaneDist } = {}) {
    this.cell = cell;
    this.maxPlaneDist = maxPlaneDist;
    this.faces = buildFaces(level, cell);
    const { width, height } = packFaces(this.faces, atlasWidth);
    this.width = width;
    this.height = height;
    this.grid = new Uint8Array(width * height);
    this.flags = new Uint8Array(width * height);
    this.counts = [0, 0, 0];
    this.extra = [0, 0, 0];   // terrain hors grille (les vaches), en cellules, par équipe
    this.dirty = null;
    this._markFlags(level);
  }

  _markFlags(level) {
    const { cell, width, flags } = this;
    for (const f of this.faces) {
      const bits = f.axis === 1 ? PAINTABLE | SCORABLE : PAINTABLE;
      for (let j = 0; j < f.h; j++) flags.fill(bits, (f.ay + j) * width + f.ax, (f.ay + j) * width + f.ax + f.w);

      // les cellules recouvertes par une autre boîte ne sont ni peignables ni comptées
      const probe = f.plane + f.sign * 0.03;
      for (const b of level.boxes) {
        if (b === f.box || probe <= b.min[f.axis] || probe >= b.max[f.axis]) continue;
        const i0 = Math.max(0, Math.ceil((b.min[f.ua] - f.u0) / cell - 0.5));
        const i1 = Math.min(f.w - 1, Math.floor((b.max[f.ua] - f.u0) / cell - 0.5));
        const j0 = Math.max(0, Math.ceil((b.min[f.va] - f.v0) / cell - 0.5));
        const j1 = Math.min(f.h - 1, Math.floor((b.max[f.va] - f.v0) / cell - 0.5));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) flags[(f.ay + j) * width + f.ax + i] = 0;
        }
      }
    }
    let scorable = 0;
    for (let k = 0; k < flags.length; k++) if (flags[k] & SCORABLE) scorable++;
    this.counts[0] = scorable;
    this.scorable = scorable;
  }

  // Peint une tache irrégulière autour d'un point, sur toutes les faces proches qui lui font face.
  // Renvoie la surface de terrain gagnée, en m².
  splat(x, y, z, r, team, seed = 0) {
    const { cell, width, grid, flags, counts } = this;
    const p = [x, y, z];
    let gained = 0;
    for (const f of this.faces) {
      const d = (p[f.axis] - f.plane) * f.sign;
      if (d < -0.02 || d > this.maxPlaneDist || d >= r) continue;
      const rr = Math.sqrt(r * r - Math.max(d, 0) ** 2);
      const pu = p[f.ua];
      const pv = p[f.va];
      if (pu + rr < f.u0 || pu - rr > f.u1 || pv + rr < f.v0 || pv - rr > f.v1) continue;

      const i0 = Math.max(0, Math.floor((pu - rr - f.u0) / cell));
      const i1 = Math.min(f.w - 1, Math.floor((pu + rr - f.u0) / cell));
      const j0 = Math.max(0, Math.floor((pv - rr - f.v0) / cell));
      const j1 = Math.min(f.h - 1, Math.floor((pv + rr - f.v0) / cell));
      let changed = false;
      for (let j = j0; j <= j1; j++) {
        const dv = f.v0 + (j + 0.5) * cell - pv;
        for (let i = i0; i <= i1; i++) {
          const du = f.u0 + (i + 0.5) * cell - pu;
          const ang = Math.atan2(dv, du);
          const lim = rr * (0.84 + 0.16 * Math.sin(ang * 3 + seed) * Math.cos(ang * 5 + seed * 1.7));
          if (du * du + dv * dv > lim * lim) continue;
          const idx = (f.ay + j) * width + f.ax + i;
          const fl = flags[idx];
          if (!(fl & PAINTABLE)) continue;
          const old = grid[idx];
          if (old === team) continue;
          grid[idx] = team;
          changed = true;
          if (fl & SCORABLE) {
            counts[old]--;
            counts[team]++;
            gained++;
          }
        }
      }
      if (changed) this._markDirty(f.ax + i0, f.ay + j0, f.ax + i1, f.ay + j1);
    }
    return gained * cell * cell;
  }

  // Équipe peinte sous un point, sur une face d'orientation donnée (axis 0/1/2, sign ±1).
  teamAt(x, y, z, axis, sign) {
    const p = [x, y, z];
    for (const f of this.faces) {
      if (f.axis !== axis || f.sign !== sign || Math.abs(p[axis] - f.plane) > 0.15) continue;
      const pu = p[f.ua];
      const pv = p[f.va];
      if (pu < f.u0 || pu > f.u1 || pv < f.v0 || pv > f.v1) continue;
      const i = Math.min(f.w - 1, Math.floor((pu - f.u0) / this.cell));
      const j = Math.min(f.h - 1, Math.floor((pv - f.v0) / this.cell));
      const idx = (f.ay + j) * this.width + f.ax + i;
      if (this.flags[idx] & PAINTABLE) return this.grid[idx];
    }
    return 0;
  }

  // Part du terrain peinte par chaque équipe (0 à 1), indexée par numéro d'équipe.
  coverage() {
    const e = this.extra;
    const n = this.scorable + e[0] + e[1] + e[2] || 1;
    return [(this.counts[0] + e[0]) / n, (this.counts[1] + e[1]) / n, (this.counts[2] + e[2]) / n];
  }

  // Terrain compté sans être dans la grille : d'abord vierge, puis déplacé d'une équipe à l'autre.
  addExtra(cells) {
    this.extra[0] += cells;
  }

  moveExtra(from, to, cells) {
    this.extra[from] -= cells;
    this.extra[to] += cells;
  }

  _markDirty(x0, y0, x1, y1) {
    const d = this.dirty;
    if (!d) {
      this.dirty = { x0, y0, x1, y1 };
    } else {
      if (x0 < d.x0) d.x0 = x0;
      if (y0 < d.y0) d.y0 = y0;
      if (x1 > d.x1) d.x1 = x1;
      if (y1 > d.y1) d.y1 = y1;
    }
  }

  // Rectangle de l'atlas modifié depuis le dernier appel (bornes incluses), ou null.
  takeDirty() {
    const d = this.dirty;
    this.dirty = null;
    return d;
  }
}

function buildFaces(level, cell) {
  const faces = [];
  const add = (box, axis, sign, ua, va) => {
    const u0 = box.min[ua];
    const u1 = box.max[ua];
    const v0 = box.min[va];
    const v1 = box.max[va];
    faces.push({
      box, axis, sign, ua, va, u0, u1, v0, v1,
      plane: sign > 0 ? box.max[axis] : box.min[axis],
      w: Math.max(1, Math.ceil((u1 - u0) / cell - 1e-6)),
      h: Math.max(1, Math.ceil((v1 - v0) / cell - 1e-6)),
      ax: 0,
      ay: 0,
    });
  };
  for (const box of level.boxes) {
    add(box, 1, 1, 0, 2);
    if (!box.sides) continue;
    add(box, 0, 1, 2, 1);
    add(box, 0, -1, 2, 1);
    add(box, 2, 1, 0, 1);
    add(box, 2, -1, 0, 1);
  }
  return faces;
}

// Rangement par étagères, avec une cellule de marge pour que le lissage ne déborde pas d'une face à l'autre.
function packFaces(faces, atlasWidth) {
  const width = Math.max(atlasWidth, ...faces.map((f) => f.w + 2));
  const order = [...faces].sort((a, b) => b.h - a.h);
  let x = 1;
  let y = 1;
  let shelf = 0;
  for (const f of order) {
    if (x + f.w + 1 > width) {
      x = 1;
      y += shelf + 1;
      shelf = 0;
    }
    f.ax = x;
    f.ay = y;
    x += f.w + 1;
    if (f.h > shelf) shelf = f.h;
  }
  return { width, height: y + shelf + 1 };
}
