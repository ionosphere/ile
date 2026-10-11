// Navigation des bots : une grille calculée à partir des boîtes du niveau, et une recherche de chemin A*.
// Chaque case peut porter plusieurs étages (le sol sous un toit, et le toit). Un nœud est un couple
// (case, étage) ; on passe d'un nœud à son voisin quand la marche ne dépasse pas ce qu'on monte sans sauter.
// Seule la plus grande zone d'un seul tenant est gardée : les bots ne grimpent pas, donc ils n'iront
// jamais sur un toit ou une botte de foin.

import { PLAYER } from '../config/tuning.js';

const SQRT2 = Math.SQRT2;
const LAYERS = 3;
const STEP_UP = PLAYER.stepHeight + 0.02;

export class Nav {
  constructor(level, { cell = 0.75, radius = 0.5 } = {}) {
    this.cell = cell;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of level.boxes) {
      x0 = Math.min(x0, b.min[0]); x1 = Math.max(x1, b.max[0]);
      z0 = Math.min(z0, b.min[2]); z1 = Math.max(z1, b.max[2]);
    }
    this.x0 = x0;
    this.z0 = z0;
    this.nx = Math.ceil((x1 - x0) / cell);
    this.nz = Math.ceil((z1 - z0) / cell);
    this.cells = this.nx * this.nz;
    const n = this.cells * LAYERS;
    this.walk = new Uint8Array(n);
    this.h = new Float32Array(n);     // hauteur du sol de chaque nœud

    // 1. surfaces où l'on tient debout : un dessus de boîte, sans rien qui gêne au-dessus
    for (let c = 0; c < this.cells; c++) {
      const x = this.cx(c);
      const z = this.cz(c);
      const tops = [];
      for (const b of level.boxes) {
        if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue;
        if (!tops.includes(b.max[1])) tops.push(b.max[1]);
      }
      tops.sort((a, b) => a - b);
      let layer = 0;
      for (const top of tops) {
        if (layer >= LAYERS) break;
        let free = true;
        for (const b of level.boxes) {
          if (b.min[1] >= top + PLAYER.height) continue;
          // une surface recouvrant celle-ci, même d'une simple marche, la rend inutilisable
          const inside = x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2];
          if (inside && b.max[1] > top + 1e-3) { free = false; break; }
          if (b.max[1] <= top + STEP_UP + 0.03) continue;
          const dx = x - Math.min(Math.max(x, b.min[0]), b.max[0]);
          const dz = z - Math.min(Math.max(z, b.min[2]), b.max[2]);
          if (dx * dx + dz * dz < radius * radius) { free = false; break; }
        }
        if (!free) continue;
        const i = layer * this.cells + c;
        this.walk[i] = 1;
        this.h[i] = top;
        layer++;
      }
    }

    // 2. ne garder que la plus grande zone d'un seul tenant
    const zone = new Int32Array(n).fill(-1);
    let best = -1;
    let bestSize = 0;
    let zones = 0;
    const stack = [];
    for (let i = 0; i < n; i++) {
      if (!this.walk[i] || zone[i] >= 0) continue;
      let size = 0;
      zone[i] = zones;
      stack.push(i);
      while (stack.length) {
        const cur = stack.pop();
        size++;
        this._neighbors(cur, (j) => {
          if (zone[j] < 0) { zone[j] = zones; stack.push(j); }
        });
      }
      if (size > bestSize) { bestSize = size; best = zones; }
      zones++;
    }
    this.open = [];                   // nœuds praticables
    for (let i = 0; i < n; i++) {
      if (this.walk[i] && zone[i] !== best) this.walk[i] = 0;
      if (this.walk[i]) this.open.push(i);
    }

    this._g = new Float32Array(n);
    this._from = new Int32Array(n);
    this._state = new Uint8Array(n);   // 0 : jamais vu, 1 : à explorer, 2 : exploré
  }

  cx(i) { return this.x0 + (((i % this.cells) % this.nx) + 0.5) * this.cell; }
  cz(i) { return this.z0 + (Math.floor((i % this.cells) / this.nx) + 0.5) * this.cell; }

  // Appelle visit(j, diagonale) pour chaque nœud voisin atteignable à pied.
  _neighbors(i, visit) {
    const { nx, nz, cells, walk, h } = this;
    const c = i % cells;
    const ix = c % nx;
    const iz = Math.floor(c / nx);
    const hi = h[i];
    const at = (jx, jz) => {
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) return -1;
      const cj = jz * nx + jx;
      for (let l = 0; l < LAYERS; l++) {
        const j = l * cells + cj;
        if (walk[j] && Math.abs(h[j] - hi) <= STEP_UP) return j;
      }
      return -1;
    };
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const j = at(ix + dx, iz + dz);
        if (j < 0) continue;
        // pas de diagonale qui rase un coin
        if (dx && dz && (at(ix + dx, iz) < 0 || at(ix, iz + dz) < 0)) continue;
        visit(j, dx !== 0 && dz !== 0);
      }
    }
  }

  // Nœud praticable de la case contenant le point, à la hauteur la plus proche de y (ou -1).
  node(x, z, y = 0, tolerance = 0.6) {
    const ix = Math.floor((x - this.x0) / this.cell);
    const iz = Math.floor((z - this.z0) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    const c = iz * this.nx + ix;
    let best = -1;
    let bestD = tolerance;
    for (let l = 0; l < LAYERS; l++) {
      const i = l * this.cells + c;
      if (!this.walk[i]) continue;
      const d = Math.abs(this.h[i] - y);
      if (d <= bestD) { bestD = d; best = i; }
    }
    return best;
  }

  walkableAt(x, z, y = 0) {
    return this.node(x, z, y) >= 0;
  }

  // Nœud praticable le plus proche du point, ou -1.
  nearest(x, z, y = 0, maxRing = 10) {
    for (let ring = 0; ring <= maxRing; ring++) {
      let best = -1;
      let bestD = Infinity;
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const px = x + dx * this.cell;
          const pz = z + dz * this.cell;
          const j = this.node(px, pz, y, 3);
          if (j < 0) continue;
          const d = (this.cx(j) - x) ** 2 + (this.cz(j) - z) ** 2 + (this.h[j] - y) ** 2 * 4;
          if (d < bestD) { bestD = d; best = j; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  randomNode(rng) {
    return this.open[Math.floor(rng() * this.open.length)];
  }

  // Vrai si l'on peut marcher en ligne droite d'un point à l'autre, en partant de la hauteur y.
  lineClear(xa, za, xb, zb, y = 0) {
    const d = Math.hypot(xb - xa, zb - za);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.4)));
    let height = y;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const i = this.node(xa + (xb - xa) * t, za + (zb - za) * t, height, s === 0 ? 0.6 : STEP_UP);
      if (i < 0) return false;
      height = this.h[i];
    }
    return true;
  }

  // Chemin entre deux points, comme liste de { x, y, z } déjà simplifiée, ou null.
  path(xa, ya, za, xb, yb, zb) {
    const start = this.nearest(xa, za, ya);
    const goal = this.nearest(xb, zb, yb);
    if (start < 0 || goal < 0) return null;
    const { nx, cells, _g: g, _from: from, _state: state } = this;
    state.fill(0);
    const gx = (goal % cells) % nx;
    const gz = Math.floor((goal % cells) / nx);
    const heuristic = (i) => {
      const c = i % cells;
      const dx = Math.abs((c % nx) - gx);
      const dz = Math.abs(Math.floor(c / nx) - gz);
      return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    };
    const open = [start];
    g[start] = 0;
    from[start] = -1;
    state[start] = 1;

    while (open.length) {
      let bi = 0;
      let bf = Infinity;
      for (let k = 0; k < open.length; k++) {
        const f = g[open[k]] + heuristic(open[k]);
        if (f < bf) { bf = f; bi = k; }
      }
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) break;
      state[cur] = 2;
      this._neighbors(cur, (j, diagonal) => {
        if (state[j] === 2) return;
        const cost = g[cur] + (diagonal ? SQRT2 : 1);
        if (state[j] === 1 && cost >= g[j]) return;
        g[j] = cost;
        from[j] = cur;
        if (state[j] === 0) { state[j] = 1; open.push(j); }
      });
    }
    if (state[goal] === 0) return null;

    const nodes = [];
    for (let i = goal; i >= 0; i = from[i]) nodes.push(i);
    nodes.reverse();

    // simplification : on vise à chaque fois le point le plus lointain atteignable en ligne droite
    const point = (i) => ({ x: this.cx(i), y: this.h[i], z: this.cz(i) });
    const points = [];
    let anchor = 0;
    while (anchor < nodes.length - 1) {
      let next = anchor + 1;
      const a = nodes[anchor];
      for (let k = nodes.length - 1; k > anchor + 1; k--) {
        const b = nodes[k];
        if (Math.abs(this.h[b] - this.h[a]) < 0.05 && this.lineClear(this.cx(a), this.cz(a), this.cx(b), this.cz(b), this.h[a])) { next = k; break; }
      }
      points.push(point(nodes[next]));
      anchor = next;
    }
    if (!points.length) points.push(point(goal));
    return points;
  }
}
