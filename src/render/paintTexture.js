// Tire de la grille de peinture la texture affichée, en n'envoyant au GPU que la zone modifiée.
// Canal rouge = équipe 1, canal vert = équipe 2 ; le filtrage linéaire arrondit les bords des taches.

import * as THREE from 'three';

export class PaintTexture {
  constructor(paint) {
    this.paint = paint;
    this.data = new Uint8Array(paint.width * paint.height * 4);
    this.texture = new THREE.DataTexture(this.data, paint.width, paint.height, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.origin = new THREE.Vector2();
    this._convert(0, 0, paint.width - 1, paint.height - 1, this.data, paint.width, 0, 0);
    this.texture.needsUpdate = true;
    paint.takeDirty();
  }

  update(renderer) {
    const d = this.paint.takeDirty();
    if (!d) return;
    const w = d.x1 - d.x0 + 1;
    const h = d.y1 - d.y0 + 1;
    const patch = new Uint8Array(w * h * 4);
    this._convert(d.x0, d.y0, d.x1, d.y1, patch, w, d.x0, d.y0);
    // la copie complète reste à jour au cas où le GPU redemanderait toute la texture
    this._convert(d.x0, d.y0, d.x1, d.y1, this.data, this.paint.width, 0, 0);
    const src = new THREE.DataTexture(patch, w, h, THREE.RGBAFormat);
    renderer.copyTextureToTexture(this.origin.set(d.x0, d.y0), src, this.texture);
  }

  _convert(x0, y0, x1, y1, out, outWidth, ox, oy) {
    const { grid, width } = this.paint;
    for (let y = y0; y <= y1; y++) {
      let o = ((y - oy) * outWidth + (x0 - ox)) * 4;
      let g = y * width + x0;
      for (let x = x0; x <= x1; x++, o += 4, g++) {
        const t = grid[g];
        out[o] = t === 1 ? 255 : 0;
        out[o + 1] = t === 2 ? 255 : 0;
      }
    }
  }
}
