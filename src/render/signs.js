// Enseignes : un texte dessiné sur un panneau, plaqué contre un mur de la carte.

import * as THREE from 'three';

const PX_PER_M = 96;

export function createSigns(signs) {
  const group = new THREE.Group();
  for (const s of signs) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(s.width * PX_PER_M);
    canvas.height = Math.round(s.height * PX_PER_M);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // le texte occupe la hauteur du panneau, et se resserre s'il est trop long
    let size = canvas.height * 0.62;
    ctx.font = `700 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    const widest = canvas.width * 0.88;
    const measured = ctx.measureText(s.text).width;
    if (measured > widest) {
      size *= widest / measured;
      ctx.font = `700 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    }
    ctx.fillStyle = s.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = s.yaw;
    group.add(mesh);
  }
  return group;
}
