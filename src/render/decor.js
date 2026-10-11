// Décor : tout ce qui habille une carte sans compter pour le jeu. Rien ici n'a de collision,
// donc tout est placé hors d'atteinte : autour de l'enceinte, au plafond, ou plaqué contre un mur.

import * as THREE from 'three';
import { createSigns } from './signs.js';

const std = (color, roughness = 0.9, extra) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

// Générateur à graine : le même décor à chaque partie.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mesh(geometry, material, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

const block = (w, h, d, material, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y + h / 2, z);

// Toit à deux pentes : un prisme triangulaire posé à la hauteur y, faîtage le long de l'axe x.
function gable(w, d, h, material, x, y, z) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geometry.translate(0, 0, -w / 2);
  geometry.rotateY(Math.PI / 2);
  return mesh(geometry, material, x, y, z);
}

// Masse de feuillage : une boule bosselée, plus sombre en dessous qu'au-dessus.
function foliage(rng, r, color) {
  const geometry = new THREE.IcosahedronGeometry(r, 2);
  const pos = geometry.attributes.position;
  const colors = [];
  const base = new THREE.Color(color);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const ox = rng() * 10;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // bosses : la même valeur pour les sommets confondus, calculée à partir de la direction
    const d = v.clone().normalize();
    const bump = Math.sin(d.x * 5.1 + ox) * Math.sin(d.y * 4.3 + ox * 1.7) * Math.sin(d.z * 4.7 + ox * 0.6);
    v.multiplyScalar(1 + bump * 0.22);
    v.y *= 0.82;
    pos.setXYZ(i, v.x, v.y, v.z);
    c.copy(base).multiplyScalar(0.62 + 0.5 * (d.y * 0.5 + 0.5) + bump * 0.18);
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Arbre : un tronc, deux branches maîtresses et des masses de feuillage.
function tree(rng, x, z, scale = 1) {
  const g = new THREE.Group();
  const h = (3.5 + rng() * 2.5) * scale;
  const bark = std('#5f4330', 1);
  g.add(mesh(new THREE.CylinderGeometry(0.2 * scale, 0.36 * scale, h, 8), bark, 0, h / 2, 0));
  for (const side of [-1, 1]) {
    const branch = mesh(new THREE.CylinderGeometry(0.09 * scale, 0.16 * scale, h * 0.5, 6), bark, side * h * 0.14, h * 0.92, 0);
    branch.rotation.z = -side * 0.6;
    g.add(branch);
  }
  const color = ['#5f9c48', '#6dab52', '#538f45', '#77a84a'][Math.floor(rng() * 4)];
  const leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const r = (i === 0 ? 2.3 : 1.1 + rng() * 1.1) * scale;
    const ang = rng() * 6.28;
    const off = i === 0 ? 0 : (1.3 + rng() * 0.9) * scale;
    g.add(mesh(foliage(rng, r, color), leaf, Math.cos(ang) * off, h + r * 0.35 + (i === 0 ? 0.8 : rng() * 1.6) * scale, Math.sin(ang) * off));
  }
  g.position.set(x, 0, z);
  g.rotation.y = rng() * 6.28;
  return g;
}

// Pose chaque objet et son jumeau tourné d'un demi-tour, comme les cartes elles-mêmes.
function twice(group, build) {
  const a = build();
  const b = build();
  b.rotation.y += Math.PI;
  b.position.set(-b.position.x, b.position.y, -b.position.z);
  group.add(a, b);
}

// ---- la ferme ----

function ferme() {
  const g = new THREE.Group();
  const rng = seeded(7);

  // campagne : une grande prairie, des champs en damier, des collines au loin
  // (percée à l'emplacement de la cour, pour ne pas recouvrir le bassin creusé)
  const land = new THREE.Shape();
  land.absarc(0, 0, 420, 0, Math.PI * 2);
  const yard = new THREE.Path();
  yard.moveTo(-31.9, -37.9);
  yard.lineTo(31.9, -37.9);
  yard.lineTo(31.9, 37.9);
  yard.lineTo(-31.9, 37.9);
  yard.closePath();
  land.holes.push(yard);
  const meadow = mesh(new THREE.ShapeGeometry(land, 24), std('#7aa850', 1), 0, -0.06, 0, false);
  meadow.rotation.x = -Math.PI / 2;
  meadow.receiveShadow = true;
  g.add(meadow);
  const crops = ['#d9c56a', '#8fb85a', '#a98a55', '#c9d27a', '#6f9c4a', '#b9a05c'];
  for (let i = 0; i < 26; i++) {
    const ang = rng() * 6.28;
    const dist = 90 + rng() * 240;
    const field = mesh(new THREE.PlaneGeometry(40 + rng() * 70, 30 + rng() * 60), std(crops[i % crops.length], 1), Math.cos(ang) * dist, -0.04 + i * 0.0005, Math.sin(ang) * dist, false);
    field.rotation.x = -Math.PI / 2;
    field.rotation.z = rng() * 3;
    g.add(field);
  }
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * 6.28 + rng() * 0.3;
    const hill = mesh(new THREE.SphereGeometry(70 + rng() * 60, 16, 8), std(i % 2 ? '#6c9a58' : '#7fa86a', 1), Math.cos(ang) * 330, -30, Math.sin(ang) * 330, false);
    hill.scale.y = 0.35 + rng() * 0.2;
    g.add(hill);
  }

  // arbres et haies autour de l'enceinte
  for (let i = 0; i < 44; i++) {
    const ang = rng() * 6.28;
    const dist = 52 + rng() * 80;
    const x = Math.cos(ang) * dist * 0.85;
    const z = Math.sin(ang) * dist;
    if (Math.abs(x) < 36 && Math.abs(z) < 42) continue;
    g.add(tree(rng, x, z, 0.9 + rng() * 0.8));
  }
  const hedge = std('#3f7a36', 1);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) g.add(mesh(new THREE.IcosahedronGeometry(2.2 + rng(), 1), hedge, side * (37 + rng() * 2), 1.2, -34 + i * 8.5 + rng() * 2));
  }

  twice(g, () => {
    const half = new THREE.Group();

    // la maison : crépi blanc, volets verts, toit de tuiles, aile basse (d'après la photo)
    const wall = std('#efe9dc', 0.95);
    const tile = std('#b9603e', 0.85);
    const shutter = std('#8fae8a', 0.8);
    const glass = std('#2a3540', 0.25);
    const house = new THREE.Group();
    house.add(block(11, 6.4, 7, wall, 0, 0, 0));
    house.add(gable(11.6, 7.8, 2.6, tile, 0, 6.4, 0));
    house.add(block(0.8, 1.8, 0.8, std('#8a5a44', 0.9), 3.4, 7.6, 0.6));
    house.add(block(12, 3.4, 6, wall, 11.5, 0, 0.3));
    house.add(gable(12.6, 6.8, 1.9, tile, 11.5, 3.4, 0.3));
    for (const floor of [1.1, 4.0]) {
      for (const x of [-3.6, 0, 3.6]) {
        if (floor < 2 && x === 0) {
          house.add(block(1.2, 2.3, 0.08, std('#5a4634', 0.8), x, 0, -3.54));   // porte
          continue;
        }
        house.add(block(1.0, 1.5, 0.06, glass, x, floor, -3.53));
        house.add(block(0.5, 1.5, 0.06, shutter, x - 0.78, floor, -3.54));
        house.add(block(0.5, 1.5, 0.06, shutter, x + 0.78, floor, -3.54));
      }
    }
    for (const x of [8, 11.5, 15]) {
      house.add(block(0.9, 1.3, 0.06, glass, x, 1.0, -2.73));
      house.add(block(0.45, 1.3, 0.06, shutter, x - 0.7, 1.0, -2.74));
      house.add(block(0.45, 1.3, 0.06, shutter, x + 0.7, 1.0, -2.74));
    }
    house.position.set(-16, 0, 51);
    half.add(house);

    // un hangar ouvert à côté, comme les stabulations
    const post = std('#8a4b33', 0.85);
    const roof = std('#8795a6', 0.45, { metalness: 0.4 });
    const hangar = new THREE.Group();
    hangar.add(block(18, 0.25, 11, roof, 0, 5, 0));
    for (const x of [-8.6, 0, 8.6]) for (const z of [-5, 5]) hangar.add(block(0.4, 5, 0.4, post, x, 0, z));
    hangar.add(block(18, 4.6, 0.2, std('#5f7fa8', 0.5, { metalness: 0.3 }), 0, 0, 5.3));
    const bale = std('#e3c25a', 1);
    for (let i = 0; i < 7; i++) hangar.add(block(1.4, 1.2, 1.4, bale, -6 + (i % 4) * 1.5, i > 3 ? 1.2 : 0, 2.5));
    hangar.position.set(48, 0, 16);
    hangar.rotation.y = -Math.PI / 2;
    half.add(hangar);

    // un tracteur rouge garé dehors
    const tractor = new THREE.Group();
    const red = std('#c23a2b', 0.45, { metalness: 0.2 });
    const tyre = std('#22201e', 0.95);
    tractor.add(block(1.3, 0.9, 2.6, red, 0, 0.9, -0.6));
    tractor.add(block(1.5, 1.5, 1.5, std('#2c3238', 0.3), 0, 1.4, 1.1));
    tractor.add(block(1.6, 0.12, 1.7, red, 0, 2.9, 1.1));
    for (const x of [-0.85, 0.85]) {
      const big = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.5, 16), tyre, x, 0.95, 1.2);
      big.rotation.z = Math.PI / 2;
      const small = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14), tyre, x * 0.9, 0.5, -1.6);
      small.rotation.z = Math.PI / 2;
      tractor.add(big, small);
    }
    tractor.add(block(0.12, 1.1, 0.12, std('#333', 0.6), 0.45, 1.8, -1.2));
    tractor.position.set(-41, 0, 6);
    tractor.rotation.y = 0.5;
    half.add(tractor);

    // habillage plaqué sur les bâtiments de la cour : porte et fenêtres de la grange, roues de la remorque
    const barnDoor = std('#5a4634', 0.9);
    half.add(block(3, 3.4, 0.06, barnDoor, -24.5, 0, 13.96));
    half.add(block(1, 1, 0.06, std('#2a2f33', 0.4), -20.2, 3.6, 13.96));
    half.add(block(1, 1, 0.06, std('#2a2f33', 0.4), -27.4, 3.6, 13.96));
    for (const x of [-5.1, -2.9]) {
      for (const z of [18.94, 21.26]) {
        const wheel = mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 14), tyre, x, 0.46, z);
        wheel.rotation.x = Math.PI / 2;
        half.add(wheel);
      }
    }
    // le chêne : des masses de feuilles autour de sa ramure, sans dépasser le dessus où l'on peut monter
    const leaf = std('#4f8a3c', 1);
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * 6.28;
      half.add(mesh(new THREE.IcosahedronGeometry(1.5 + rng() * 0.6, 1), leaf, -22 + Math.cos(ang) * 3.1, 5.9 + rng() * 0.5, 8.6 + Math.sin(ang) * 3.1));
    }
    return half;
  });
  return g;
}

// ---- le salon ----

function salon() {
  const g = new THREE.Group();
  const rng = seeded(11);
  const dark = std('#5d6675', 0.9);
  const steel = std('#3a3f48', 0.4, { metalness: 0.7 });
  const lamp = new THREE.MeshBasicMaterial({ color: '#fff3d0' });
  const green = std('#4f8a3c', 1);

  // le hall : murs hauts et plafond technique, bien au-dessus des cloisons
  const ceiling = mesh(new THREE.PlaneGeometry(64, 56), std('#5d6675', 0.9, { emissive: '#39404d' }), 0, 11, 0, false);
  ceiling.rotation.x = Math.PI / 2;
  g.add(ceiling);
  g.add(block(64, 6, 0.6, dark, 0, 5, 26.3), block(64, 6, 0.6, dark, 0, 5, -26.3));
  g.add(block(0.6, 6, 56, dark, 30.3, 5, 0), block(0.6, 6, 56, dark, -30.3, 5, 0));
  const outside = mesh(new THREE.PlaneGeometry(200, 200), std('#15171c', 1), 0, -0.05, 0, false);
  outside.rotation.x = -Math.PI / 2;
  g.add(outside);

  // poutres métalliques, projecteurs et plantes suspendues (d'après les photos)
  for (const z of [-19, -6.5, 6.5, 19]) g.add(block(60, 0.35, 0.35, steel, 0, 8.2, z));
  for (const x of [-22, -7.5, 7.5, 22]) g.add(block(0.35, 0.35, 52, steel, x, 8.6, 0));
  for (const z of [-19, -6.5, 6.5, 19]) {
    for (let x = -26; x <= 26; x += 6.5) {
      const spot = mesh(new THREE.ConeGeometry(0.28, 0.5, 10), std('#15171c', 0.5), x, 7.85, z, false);
      g.add(spot, mesh(new THREE.CircleGeometry(0.24, 10), lamp, x, 7.59, z, false));
      g.children[g.children.length - 1].rotation.x = Math.PI / 2;
      if (rng() < 0.45) g.add(mesh(new THREE.IcosahedronGeometry(0.5 + rng() * 0.5, 1), green, x + 1.6, 7.6 - rng() * 0.6, z, false));
    }
  }

  // grande enseigne suspendue au-dessus de la scène, lisible des deux camps
  g.add(createSigns([
    { text: 'LA FERME DIGITALE', x: 0, y: 6.9, z: 0.4, yaw: 0, width: 16, height: 1.6, color: '#ffffff', background: '#1f6b4c' },
    { text: 'LA FERME DIGITALE', x: 0, y: 6.9, z: -0.4, yaw: Math.PI, width: 16, height: 1.6, color: '#ffffff', background: '#1f6b4c' },
  ]));
  g.add(block(0.12, 2.2, 0.12, steel, -7, 7.6, 0), block(0.12, 2.2, 0.12, steel, 7, 7.6, 0));

  twice(g, () => {
    const half = new THREE.Group();
    // kakémonos accrochés en hauteur le long du hall
    half.add(createSigns([
      { text: 'Ekylibre', x: 29.95, y: 6.6, z: 12, yaw: -Math.PI / 2, width: 9, height: 2.2, color: '#1d2430', background: '#ffffff' },
      { text: 'LA FERME DIGITALE', x: -29.95, y: 6.6, z: 12, yaw: Math.PI / 2, width: 12, height: 1.6, color: '#ffffff', background: '#1f6b4c' },
    ]));
    // plantes vertes posées sur les cloisons des stands
    for (const [x, z] of [[14.6, 19.15], [25.4, 19.15], [-26.4, 20.15], [-10.6, 20.15]]) {
      half.add(mesh(new THREE.IcosahedronGeometry(0.55, 1), green, x, 3.9, z));
    }
    return half;
  });
  return g;
}

const BUILDERS = { ferme, salon };

// Renvoie le décor d'une carte (un groupe vide si elle n'en a pas).
export function createDecor(map) {
  return BUILDERS[map.decor]?.() ?? new THREE.Group();
}
