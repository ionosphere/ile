// Modèle des héroïnes : un corps aux proportions réalistes, articulé (hanches, genoux, épaules, coudes),
// habillé et coiffé d'après `look` (config/characters.js), animé par calcul. Regarde vers -Z.
// La couleur de l'équipe se lit sur le foulard, les brassards, les gants et le réservoir.
// Le visage reste générique : seules la coiffure, les lunettes et la tenue distinguent les héroïnes.

import * as THREE from 'three';

const HIP = 0.8;          // hauteur des hanches
const SHOULDER = 0.42;    // hauteur des épaules au-dessus des hanches
const ARM = 0.5;          // longueur du bras, de l'épaule à la main
const GRIP = 0.39;        // angle dont les bras se referment pour tenir une arme à deux mains
const ROLL = -0.67;       // inclinaison du rouleau posé au sol

const std = (color, roughness = 0.8, extra) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function limb(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// Rassemble des formes fixes en un seul maillage par matière : un personnage compte une centaine de
// formes, mais ne coûte ainsi que quelques dizaines d'objets à dessiner.
class Batch {
  constructor(parent) {
    this.parent = parent;
    this.byMaterial = new Map();
    this.dummy = new THREE.Object3D();
    this.normalMatrix = new THREE.Matrix3();
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
  }

  // t : { rx, ry, rz, sx, sy, sz } rotation et échelle de la forme ; t.puff : [x, y, z], centre d'un volume
  // dont la forme fait partie (ses normales s'en écartent, pour qu'un amas de boules s'éclaire comme une masse)
  add(geometry, material, x = 0, y = 0, z = 0, t = {}) {
    let bucket = this.byMaterial.get(material);
    if (!bucket) this.byMaterial.set(material, (bucket = { positions: [], normals: [], indices: [] }));
    const d = this.dummy;
    d.position.set(x, y, z);
    d.rotation.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    d.scale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    d.updateMatrix();
    this.normalMatrix.getNormalMatrix(d.matrix);
    const base = bucket.positions.length / 3;
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const v = this.v;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(d.matrix);
      bucket.positions.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(this.normalMatrix).normalize();
      if (t.puff) v.multiplyScalar(0.45).add(this.w.set(x - t.puff[0], y - t.puff[1], z - t.puff[2]).normalize()).normalize();
      bucket.normals.push(v.x, v.y, v.z);
    }
    if (geometry.index) for (let i = 0; i < geometry.index.count; i++) bucket.indices.push(base + geometry.index.getX(i));
    else for (let i = 0; i < pos.count; i++) bucket.indices.push(base + i);
    geometry.dispose();
    return this;
  }

  done() {
    for (const [material, bucket] of this.byMaterial) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
      geometry.setIndex(bucket.indices);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      this.parent.add(mesh);
    }
    this.byMaterial.clear();
  }
}

const sphere = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const tube = (top, bottom, length, sides = 10) => new THREE.CylinderGeometry(top, bottom, length, sides);
const capsule = (r, length) => new THREE.CapsuleGeometry(r, length, 4, 8);
const cube = (w, h, d) => new THREE.BoxGeometry(w, h, d);

const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

// Ramène un angle entre -π et π.
function wrapAngle(a) {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  else if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

// Suite pseudo-aléatoire à graine : les mêmes boucles à chaque fois.
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

// look : apparence de l'héroïne ; team : couleur de l'équipe ;
// carry : 'dual' (une arme dans chaque main), 'rifle' ou 'roller' (arme tenue à deux mains).
// Renvoie { group, weaponPivot, hands, animate(state, dt) }.
export function buildHuman(look, team, carry = 'dual') {
  const group = new THREE.Group();
  const twoHanded = carry !== 'dual';
  const skin = std(look.skin ?? '#efc5a4', 0.75);
  const top = std(look.topColor, 0.85);
  const topLight = std(new THREE.Color(look.topColor).lerp(new THREE.Color('#ffffff'), 0.14), 0.85);
  const inner = std(look.inner ?? '#f1efe9', 0.85);
  const pants = std(look.pants, 0.9);
  const hair = std(look.hairColor, 0.72);
  const tips = std(look.hairTips ?? look.hairColor, 0.72);
  const brow = std(new THREE.Color(look.hairColor).multiplyScalar(0.6), 0.8);
  const white = std('#f6f4ee', 0.6);
  const dark = std('#26211e', 0.5);
  const iris = std('#4a3424', 0.4);
  const lips = std('#b9675f', 0.6);
  const shoe = std(look.shoes ?? '#f2f1ec', 0.7);
  const trim = std(look.shoeTrim ?? '#26211e', 0.7);
  const sole = std('#dcd8cf', 0.9);
  const teamMat = std(team, 0.55);
  const metal = std('#c2a05c', 0.3, { metalness: 0.8 });

  const pelvis = limb(group, 0, HIP, 0);
  const bp = new Batch(pelvis);
  bp.add(sphere(0.135, 12, 8), pants, 0, -0.01, 0, { sx: 1.08, sy: 0.72, sz: 0.76 });
  bp.add(tube(0.134, 0.136, 0.05, 14), pants, 0, 0.035, 0, { sx: 1.1, sz: 0.72 });
  bp.add(tube(0.129, 0.129, 0.022, 14), dark, 0, 0.05, 0, { sx: 1.1, sz: 0.72 });
  bp.done();

  // jambes : cuisse, genou, mollet, chaussure. La coupe du pantalon change la silhouette.
  const cut = look.pantsCut ?? 'droit';
  const legs = [-1, 1].map((side) => {
    const hip = limb(pelvis, side * 0.085, -0.02, 0);
    const bh = new Batch(hip);
    bh.add(tube(cut === 'large' ? 0.082 : 0.078, cut === 'large' ? 0.066 : 0.054, 0.36), pants, 0, -0.18, 0);
    if (cut === 'cargo') bh.add(cube(0.03, 0.11, 0.1), pants, side * 0.062, -0.21, 0);
    bh.done();
    const knee = limb(hip, 0, -0.36, 0);
    const bk = new Batch(knee);
    bk.add(sphere(cut === 'large' ? 0.066 : 0.054), pants, 0, 0, 0);
    if (cut === 'large') bk.add(tube(0.066, 0.086, 0.35), pants, 0, -0.175, 0);
    else bk.add(tube(0.054, cut === 'cargo' ? 0.056 : 0.042, 0.35), pants, 0, -0.175, 0);
    bk.done();
    const foot = limb(knee, 0, -0.35, 0);
    const bf = new Batch(foot);
    bf.add(sphere(0.052, 10, 8), shoe, 0, -0.03, -0.045, { sx: 0.95, sy: 0.66, sz: 2.05 });
    bf.add(cube(0.094, 0.024, 0.215), sole, 0, -0.062, -0.045);
    bf.add(cube(0.1, 0.022, 0.05), trim, 0, -0.028, -0.03);
    bf.add(cube(0.1, 0.022, 0.03), trim, 0, -0.028, 0.035);
    bf.done();
    return { hip, knee, foot };
  });

  // buste : un volume de révolution, taille marquée, épaules plus larges
  const spine = limb(pelvis, 0, 0, 0);
  const profile = [[0, -0.02], [0.12, -0.02], [0.132, 0.03], [0.122, 0.1], [0.112, 0.16], [0.125, 0.26], [0.145, 0.36], [0.15, 0.42], [0.12, 0.455], [0.055, 0.475], [0, 0.478]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), top);
  torso.scale.set(1.1, 1, 0.7);
  torso.castShadow = true;
  spine.add(torso);

  const bs = new Batch(spine);
  bs.add(tube(0.04, 0.046, 0.1), skin, 0, 0.515, 0);
  if (look.top === 'sweat') {
    // sweat court : ourlet épais à la taille, tee-shirt qui dépasse, lignes imprimées sur la poitrine
    bs.add(tube(0.126, 0.134, 0.05, 14), top, 0, 0.135, 0, { sx: 1.1, sz: 0.72 });
    bs.add(tube(0.13, 0.132, 0.06, 14), inner, 0, 0.085, 0, { sx: 1.1, sz: 0.72 });
    bs.add(cube(0.1, 0.014, 0.006), white, 0, 0.365, -0.103);
    bs.add(cube(0.15, 0.018, 0.006), white, 0, 0.338, -0.101);
    bs.add(cube(0.07, 0.012, 0.006), white, 0, 0.314, -0.098);
  } else if (look.top === 'hoodie') {
    // sweat à capuche : long sur les hanches, poche ventrale, capuche dans le dos, cordons
    bs.add(tube(0.126, 0.142, 0.17, 14), top, 0, 0.055, 0, { sx: 1.1, sz: 0.72 });
    bs.add(cube(0.16, 0.075, 0.02), topLight, 0, 0.09, -0.098);
    bs.add(sphere(0.095), top, 0, 0.455, 0.08, { sx: 1.2, sy: 0.6, sz: 0.8 });
    for (const x of [-0.03, 0.03]) bs.add(tube(0.005, 0.005, 0.1, 5), white, x, 0.39, -0.106);
  } else {
    // bleu de travail : veste longue ouverte sur un haut sombre, col, boutons, poche de poitrine
    bs.add(tube(0.126, 0.146, 0.16, 14), top, 0, 0.05, 0, { sx: 1.1, sz: 0.72 });
    bs.add(cube(0.05, 0.3, 0.012), inner, 0, 0.3, -0.097, { rx: 0.07 });
    for (const x of [-1, 1]) bs.add(cube(0.05, 0.1, 0.014), topLight, x * 0.042, 0.42, -0.092, { rz: -x * 0.5 });
    for (const y of [0.1, 0.17, 0.24]) bs.add(tube(0.008, 0.008, 0.006, 6), metal, 0.036, y, -0.1, { rx: Math.PI / 2 });
    bs.add(cube(0.062, 0.058, 0.008), topLight, -0.075, 0.33, -0.1);
  }
  // foulard à la couleur de l'équipe, noué devant
  bs.add(new THREE.TorusGeometry(0.058, 0.021, 6, 14), teamMat, 0, 0.478, 0, { rx: Math.PI / 2, sy: 0.9 });
  bs.add(new THREE.ConeGeometry(0.045, 0.08, 4), teamMat, 0, 0.435, -0.09, { rx: Math.PI, sz: 0.35 });
  bs.add(tube(0.066, 0.066, 0.025), dark, 0, 0.415, 0.155);
  bs.done();

  // réservoir de peinture dans le dos : son niveau suit celui du réservoir de jeu
  const glass = new THREE.Mesh(tube(0.06, 0.06, 0.27, 12), std('#ffffff', 0.1, { transparent: true, opacity: 0.3 }));
  glass.position.set(0, 0.27, 0.155);
  spine.add(glass);
  const fill = limb(spine, 0, 0.14, 0.155);
  const paint = new THREE.Mesh(tube(0.05, 0.05, 0.26, 12), std(team, 0.3));
  paint.position.y = 0.13;
  fill.add(paint);

  // bras : épaule, coude, main gantée
  const rolled = look.sleeves === 'retroussees';
  const hands = [];
  const arms = [-1, 1].map((side) => {
    const shoulder = limb(spine, side * 0.185, SHOULDER, 0);
    const ba = new Batch(shoulder);
    ba.add(sphere(0.054), top, 0, 0, 0);
    ba.add(tube(0.048, 0.04, 0.25), top, 0, -0.125, 0);
    ba.add(tube(0.051, 0.049, 0.045), teamMat, 0, -0.11, 0);
    ba.done();
    const elbow = limb(shoulder, 0, -0.25, 0);
    const be = new Batch(elbow);
    be.add(sphere(0.041), top, 0, 0, 0);
    if (rolled) {
      be.add(tube(0.044, 0.044, 0.035), topLight, 0, -0.03, 0);
      be.add(tube(0.035, 0.03, 0.18), skin, 0, -0.125, 0);
    } else {
      be.add(tube(0.04, 0.034, 0.21), top, 0, -0.105, 0);
    }
    be.add(sphere(0.037), teamMat, 0, -0.245, 0, { sx: 0.9, sy: 1.2, sz: 0.75 });
    be.done();
    hands.push(limb(elbow, 0, -0.245, 0));
    return { shoulder, elbow };
  });

  // une arme tenue à deux mains pivote à hauteur d'épaule ; les bras la suivent
  const weaponPivot = limb(spine, 0, SHOULDER, 0);

  // tête
  const head = limb(spine, 0, 0.635, 0);
  const bh = new Batch(head);
  bh.add(sphere(0.1, 18, 14), skin, 0, 0, 0, { sy: 1.2, sz: 1.1 });
  bh.add(sphere(0.078, 14, 10), skin, 0, -0.055, -0.018, { sy: 0.9 });
  bh.add(sphere(0.013, 8, 6), skin, 0, -0.02, -0.108, { sx: 0.8, sy: 1.1 });
  bh.add(new THREE.TorusGeometry(0.022, 0.0045, 4, 8, Math.PI * 0.7), lips, 0, -0.052, -0.094, { rz: Math.PI * 1.15 });
  for (const x of [-1, 1]) {
    bh.add(sphere(0.022, 8, 6), skin, x * 0.098, -0.005, 0.01, { sx: 0.5, sz: 0.7 });
    bh.add(sphere(0.019, 10, 8), white, x * 0.04, 0.012, -0.096, { sx: 1.25, sy: 0.8, sz: 0.4 });
    bh.add(sphere(0.0105, 8, 6), iris, x * 0.04, 0.012, -0.1025, { sz: 0.4 });
    bh.add(cube(0.038, 0.005, 0.006), dark, x * 0.04, 0.0275, -0.101, { rz: -x * 0.08 });
    bh.add(cube(0.036, 0.007, 0.008), brow, x * 0.042, 0.046, -0.098, { rz: -x * 0.1 });
  }

  // coiffure : une calotte inclinée vers l'arrière, puis ce qui fait la silhouette
  const cap = (tilt) => bh.add(new THREE.SphereGeometry(0.104, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.53), hair, 0, 0.004, 0.006, { rx: tilt, sx: 1.04, sy: 1.22, sz: 1.12 });
  const lock = limb(head, 0, 0.02, 0.09);   // mèche qui balance : queue de cheval, longueurs ou boucles
  const lock2 = limb(lock, 0, -0.2, 0.06);
  const bl = new Batch(lock);
  const bl2 = new Batch(lock2);
  if (look.hair === 'queue') {
    // cheveux tirés en arrière, longue queue de cheval haute dont les pointes s'éclaircissent
    cap(0.52);
    lock.position.set(0, 0.085, 0.105);
    bl.add(sphere(0.03), std(look.accent, 0.6), 0, 0, 0.005);
    bl.add(capsule(0.034, 0.14), hair, 0, -0.1, 0.035, { rx: -0.3 });
    bl2.add(capsule(0.03, 0.15), hair, 0, -0.09, 0);
    bl2.add(capsule(0.023, 0.12), tips, 0, -0.24, 0.004);
  } else if (look.hair === 'lisse') {
    // cheveux longs et raides, raie au milieu : deux pans devant les épaules, une nappe dans le dos
    cap(0.42);
    for (const x of [-1, 1]) {
      bh.add(capsule(0.033, 0.2), hair, x * 0.099, -0.11, -0.03, { rx: 0.3, sx: 0.7, sz: 1.5 });
      bh.add(capsule(0.03, 0.16), tips, x * 0.108, -0.32, -0.103, { rx: 0.12, sx: 0.7, sz: 1.3 });
    }
    lock2.position.set(0, -0.3, 0.02);
    bl.add(sphere(0.1, 12, 10), hair, 0, -0.18, 0.02, { sy: 2.2, sz: 0.44 });
    bl2.add(sphere(0.092, 12, 10), tips, 0, -0.1, 0.012, { sy: 1.5, sz: 0.38 });
  } else {
    // boucles : un nuage de petites sphères, qui s'élargit vers les épaules
    cap(0.45);
    const rng = seeded(11);
    const curl = (batch, x, y, z, centre = [0, -0.02, 0.02]) => batch.add(sphere(0.03 + rng() * 0.017, 8, 6), rng() < 0.3 ? tips : hair, x, y, z, { puff: centre });
    for (const y of [0.118, 0.09, 0.055, 0.015, -0.03, -0.075, -0.12, -0.165, -0.2]) {
      const ring = y >= 0 ? 0.1 * Math.sqrt(Math.max(0.06, 1 - (y / 0.126) ** 2)) * 1.12 + 0.014 : 0.12 - y * 0.16;
      // le visage et le devant du cou restent dégagés
      const open = y > 0.07 ? 0 : y > 0 ? 0.9 : y > -0.1 ? 1.3 : 1.65;
      const span = Math.PI * 2 - open * 2;
      const count = Math.max(4, Math.round((ring * span) / 0.05));
      for (let i = 0; i < count; i++) {
        const ang = open + (span * (i + rng() * 0.6)) / count;   // 0 : devant
        curl(bh, Math.sin(ang) * ring * 1.02, y + (rng() - 0.5) * 0.03, 0.01 - Math.cos(ang) * ring * 1.12);
      }
    }
    lock.position.set(0, -0.12, 0.13);
    lock2.position.set(0, -0.09, 0.02);
    for (let i = 0; i < 6; i++) curl(bl, (rng() - 0.5) * 0.16, -rng() * 0.08, rng() * 0.04, [0, 0, -0.1]);
    for (let i = 0; i < 5; i++) curl(bl2, (rng() - 0.5) * 0.13, -rng() * 0.07, rng() * 0.03, [0, 0, -0.1]);
  }
  if (look.glasses) {
    // lunettes rondes à fine monture de métal
    for (const x of [-1, 1]) {
      bh.add(new THREE.TorusGeometry(0.029, 0.0035, 5, 18), metal, x * 0.04, 0.012, -0.108);
      bh.add(cube(0.004, 0.004, 0.11), metal, x * 0.086, 0.016, -0.055, { ry: -x * 0.25 });
    }
    bh.add(cube(0.024, 0.004, 0.004), metal, 0, 0.018, -0.11);
  }
  if (look.goggles) {
    // lunettes de protection d'atelier, relevées sur le front
    bh.add(new THREE.TorusGeometry(0.106, 0.006, 5, 20), dark, 0, 0.07, 0.004, { rx: Math.PI / 2 - 0.25, sy: 1.1 });
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.106, 0.106, 0.036, 14, 1, true, Math.PI - 1.05, 2.1),
      std('#e4f3ff', 0.08, { transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    visor.position.set(0, 0.078, -0.01);
    visor.rotation.x = -0.25;
    visor.scale.z = 1.1;
    head.add(visor);
  }
  bh.done();
  bl.done();
  bl2.done();

  let phase = 0;
  let time = Math.random() * 10;
  let twist = 0;       // le bassin se tourne vers la direction de marche
  let lean = 0;
  let roll = 0;
  let squash = 0;      // écrasement à l'atterrissage
  let wasGrounded = true;
  let sway = 0;
  // port de l'arme à deux mains quand on ne tire pas : fusil pointé vers le sol, rouleau posé devant soi
  const rest = carry === 'roller' ? ROLL : -0.6;
  if (twoHanded) weaponPivot.rotation.x = rest;
  return {
    group,
    weaponPivot,
    hands,
    // state : { speed, forward, side, grounded, aiming, firing, rolling, dashing, pitch, ink, hurt, vy }
    animate(state, dt) {
      time += dt;
      const run = state.grounded ? Math.min(1, state.speed / 5) : 0;
      // le bas du corps suit la direction de marche (pas chassés, marche arrière), le haut garde la visée
      const backward = state.forward < -0.5;
      const wantTwist = state.speed > 0.8 ? wrapAngle(Math.atan2(-state.side, backward ? -state.forward : state.forward)) : 0;
      twist = damp(twist, Math.max(-0.8, Math.min(0.8, wantTwist)), 10, dt);
      phase += state.speed * dt * (backward ? -2.1 : 2.1);
      const s = Math.sin(phase);
      const c = Math.cos(phase);

      // atterrissage : on s'écrase un instant
      if (state.grounded && !wasGrounded) squash = Math.min(0.22, Math.abs(state.vy) * 0.02 + 0.08);
      wasGrounded = state.grounded;
      squash = damp(squash, 0, 9, dt);

      pelvis.position.y = HIP - squash * 0.55 + Math.abs(c) * 0.045 * run - 0.02 * run - (state.dashing ? 0.1 : 0);
      pelvis.rotation.y = twist;
      roll = damp(roll, -state.side * 0.02 * (state.grounded ? 1 : 0), 8, dt);
      pelvis.rotation.z = roll + s * 0.05 * run;

      for (let i = 0; i < 2; i++) {
        const sign = i === 0 ? 1 : -1;
        const leg = legs[i];
        if (state.dashing) {
          // ruée : une jambe loin devant, l'autre loin derrière
          leg.hip.rotation.x = damp(leg.hip.rotation.x, sign * 1.1, 18, dt);
          leg.knee.rotation.x = damp(leg.knee.rotation.x, sign > 0 ? -0.3 : -1.2, 18, dt);
        } else if (state.grounded) {
          // foulée : la jambe se replie quand elle revient vers l'avant
          const hip = sign * s * 0.8 * run - squash * 1.2;
          const bend = Math.max(0, sign * c) * 1.3 * run + squash * 2.4 + 0.05;
          leg.hip.rotation.x = damp(leg.hip.rotation.x, hip, 22, dt);
          leg.knee.rotation.x = damp(leg.knee.rotation.x, -bend, 22, dt);
        } else {
          // en l'air : genoux remontés à la montée, jambes tendues à la descente
          const rising = state.vy > 0 ? 1 : 0.35;
          leg.hip.rotation.x = damp(leg.hip.rotation.x, (i === 0 ? 0.9 : 0.35) * rising, 10, dt);
          leg.knee.rotation.x = damp(leg.knee.rotation.x, (i === 0 ? -1.2 : -0.7) * rising, 10, dt);
        }
        leg.foot.rotation.x = damp(leg.foot.rotation.x, state.grounded ? Math.max(0, -sign * s) * 0.5 * run : 0.5, 18, dt);
      }

      // buste : penché vers l'avant en courant, contre-rotation, respiration au repos
      lean = damp(lean, state.dashing ? 0.6 : run * 0.14 * (backward ? -0.6 : 1) + squash * 0.8, 9, dt);
      spine.rotation.set(lean, -twist * 0.85 + s * 0.08 * run, -roll * 0.6);
      const breath = Math.sin(time * 1.7) * 0.012 * (1 - run);
      torso.scale.set(1.1 + breath, 1, 0.7 + breath * 1.4);

      const aimPitch = Math.max(-1.1, Math.min(1.1, state.pitch));
      const kick = state.firing ? Math.sin(time * 58) * 0.03 : 0;
      if (twoHanded) {
        // les deux mains tiennent l'arme : les bras suivent exactement son inclinaison
        let want = rest + (carry === 'roller' ? 0 : Math.sin(phase * 2) * 0.05 * run);
        if (carry === 'roller') {
          // au sol pour peindre, à peine soulevé pour projeter une gerbe, relevé pendant un saut
          want = state.rolling ? ROLL : !state.grounded && Math.abs(state.vy) > 1 ? -0.25 : state.aiming ? ROLL + 0.3 : ROLL;
        } else if (state.aiming) {
          want = aimPitch * 0.85;
        }
        weaponPivot.rotation.x = damp(weaponPivot.rotation.x, want - lean, 14, dt);
        for (let i = 0; i < 2; i++) {
          arms[i].shoulder.rotation.x = Math.PI / 2 + weaponPivot.rotation.x;
          arms[i].shoulder.rotation.z = i === 0 ? GRIP : -GRIP;
          arms[i].elbow.rotation.x = 0;
        }
      } else {
        // une arme dans chaque main : bras tendus vers la cible pour tirer, en balancier sinon
        for (let i = 0; i < 2; i++) {
          const sign = i === 0 ? 1 : -1;
          const arm = arms[i];
          let shoulder;
          let elbow;
          if (state.aiming) {
            shoulder = Math.PI / 2 + aimPitch * 0.85 - lean + kick * sign;
            elbow = 0.05;
          } else if (state.dashing) {
            shoulder = -0.9;
            elbow = 0.3;
          } else if (!state.grounded) {
            shoulder = 0.4 + (state.vy > 0 ? 0.5 : -0.2);
            elbow = 0.7;
          } else {
            shoulder = -sign * s * 0.75 * run;
            elbow = 0.2 + run * 0.9;
          }
          arm.shoulder.rotation.x = damp(arm.shoulder.rotation.x, shoulder, 16, dt);
          arm.shoulder.rotation.z = damp(arm.shoulder.rotation.z, (state.aiming ? 0.02 : 0.09) * (i === 0 ? -1 : 1), 10, dt);
          arm.elbow.rotation.x = damp(arm.elbow.rotation.x, elbow, 16, dt);
        }
      }

      // tête : suit le regard, reste droite quand le buste se penche
      head.rotation.x = damp(head.rotation.x, aimPitch * 0.4 - lean * 0.7, 12, dt);
      head.rotation.y = damp(head.rotation.y, twist * 0.1, 8, dt);

      // les cheveux traînent derrière le mouvement
      sway = damp(sway, Math.min(0.7, state.speed * 0.05) + (state.grounded ? 0 : -state.vy * 0.03), 6, dt);
      lock.rotation.x = sway + Math.sin(phase * 2) * 0.06 * run + Math.sin(time * 1.3) * 0.015 - head.rotation.x * 0.6;
      lock.rotation.z = -roll * 2 + s * 0.05 * run;
      lock2.rotation.x = sway * 0.7 + Math.sin(phase * 2 - 0.9) * 0.1 * run;

      fill.scale.y = Math.max(0.02, state.ink);
      top.emissive.setScalar(state.hurt * 0.5);
    },
  };
}

export { ARM, GRIP };
