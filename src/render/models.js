// Modèles des animaux (et de la forme chat des héroïnes), assemblés à partir de formes simples et animés
// par calcul. Tous regardent vers -Z. Les héroïnes elles-mêmes sont dans human.js.

import * as THREE from 'three';

const std = (color, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness });

function part(geometry, material, x, y, z, parent) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent?.add(m);
  return m;
}

// Membre articulé : un groupe dont l'origine est l'articulation, le membre pendant en dessous.
function limb(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---- chat ----

export function buildCat(look, team) {
  const group = new THREE.Group();
  const fur = std(look.hairColor, 0.95);
  const light = std('#f6efe2', 0.95);
  const dark = std('#2c2622', 0.6);
  const teamMat = std(team, 0.7);

  const body = part(new THREE.CapsuleGeometry(0.13, 0.34, 4, 10), fur, 0, 0.25, 0.04, group);
  body.rotation.x = Math.PI / 2;
  part(new THREE.SphereGeometry(0.105, 10, 8), light, 0, 0.2, -0.1, group).scale.set(0.9, 0.7, 1.2);   // poitrail clair

  const head = limb(group, 0, 0.37, -0.3);
  part(new THREE.SphereGeometry(0.14, 14, 10), fur, 0, 0, 0, head).scale.set(1.05, 0.92, 1);
  part(new THREE.SphereGeometry(0.06, 8, 6), light, 0, -0.04, -0.11, head);
  part(new THREE.SphereGeometry(0.02, 6, 5), std('#d9838a'), 0, -0.02, -0.165, head);
  for (const x of [-0.06, 0.06]) {
    part(new THREE.SphereGeometry(0.024, 8, 6), dark, x, 0.03, -0.12, head);
    const ear = part(new THREE.ConeGeometry(0.055, 0.11, 4), fur, x * 1.5, 0.14, 0, head);
    ear.rotation.z = -x * 3;
  }
  if (look.glasses) {
    for (const x of [-0.06, 0.06]) part(new THREE.TorusGeometry(0.04, 0.009, 6, 12), dark, x, 0.03, -0.135, head);
  }
  // foulard à la couleur de l'équipe
  const scarf = part(new THREE.TorusGeometry(0.115, 0.035, 8, 14), teamMat, 0, 0.3, -0.2, group);
  scarf.rotation.x = Math.PI / 2 - 0.5;

  const legs = [[-0.08, -0.14], [0.08, -0.14], [-0.08, 0.2], [0.08, 0.2]].map(([x, z]) => {
    const leg = limb(group, x, 0.17, z);
    part(new THREE.CylinderGeometry(0.035, 0.03, 0.17, 6), fur, 0, -0.085, 0, leg);
    return leg;
  });

  // queue en trois tronçons, le bout à la couleur de l'équipe
  const tail = [];
  let parent = limb(group, 0, 0.3, 0.3);
  for (let i = 0; i < 3; i++) {
    part(new THREE.CylinderGeometry(0.028, 0.032, 0.17, 6), i === 2 ? teamMat : fur, 0, 0.085, 0, parent);
    tail.push(parent);
    if (i < 2) parent = limb(parent, 0, 0.17, 0);
  }
  tail[0].rotation.x = 0.9;

  let phase = 0;
  let time = 0;
  return {
    group,
    animate(state, dt) {
      time += dt;
      phase += state.speed * dt * 3.6;
      const stride = Math.min(1, state.speed / 3) * (state.submerged ? 0 : 1);
      // petit trot à faible allure, bonds (pattes avant puis arrière) quand il file
      const bound = Math.min(1, Math.max(0, (state.speed - 4) / 4)) * stride;
      const swing = Math.sin(phase) * 0.9 * stride;
      const back = Math.sin(phase + 2.4) * 0.9 * stride;
      const mix = (a, b) => a + (b - a) * bound;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = mix(-swing, swing);
      legs[2].rotation.x = mix(-swing, back);
      legs[3].rotation.x = mix(swing, back);
      body.position.y = 0.25 + Math.max(0, Math.sin(phase)) * 0.06 * bound;
      body.rotation.x = Math.PI / 2 + Math.cos(phase) * 0.12 * bound;
      tail[1].rotation.x = -0.5 + Math.sin(time * 4) * 0.25;
      tail[2].rotation.x = -0.4 + Math.sin(time * 4 + 1) * 0.3;
      tail[1].rotation.z = Math.sin(time * 3) * 0.4;
      head.rotation.x = Math.sin(phase * 2) * 0.05 * stride;
    },
  };
}

// ---- vache ----

// Renvoie { group, setTeam(color | null), animate(speed, dt) }.
export function buildCow() {
  const group = new THREE.Group();
  const coat = std('#f3efe6', 0.9);
  const patch = std('#2b2622', 0.9);
  const pink = std('#eeb1a5', 0.7);
  const horn = std('#e8dcc0', 0.6);
  const hoof = std('#2b2622', 0.8);

  const body = part(new THREE.CapsuleGeometry(0.42, 0.85, 6, 14), coat, 0, 1.02, 0.05, group);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 1.05);
  // taches : des calottes sombres qui affleurent le pelage
  for (const [x, y, z, r] of [[0.3, 1.2, 0.25, 0.3], [-0.33, 1.05, -0.25, 0.26], [0.1, 1.38, -0.45, 0.2], [-0.2, 1.32, 0.5, 0.24], [0.36, 0.95, -0.4, 0.2]]) {
    part(new THREE.SphereGeometry(r, 10, 8), patch, x * 0.93, y, z, group).scale.set(0.55, 0.6, 1);
  }
  part(new THREE.SphereGeometry(0.16, 10, 8), pink, 0, 0.62, 0.38, group);   // pis

  const head = limb(group, 0, 1.25, -0.82);
  part(new THREE.SphereGeometry(0.24, 12, 10), coat, 0, 0, -0.12, head).scale.set(0.95, 1, 1.25);
  part(new THREE.SphereGeometry(0.17, 10, 8), pink, 0, -0.1, -0.4, head).scale.set(1, 0.8, 0.9);
  part(new THREE.SphereGeometry(0.11, 8, 6), patch, 0.13, 0.08, -0.16, head).scale.set(0.6, 1, 1);
  for (const x of [-0.11, 0.11]) {
    part(new THREE.SphereGeometry(0.03, 8, 6), hoof, x, 0.06, -0.32, head);
    const h = part(new THREE.ConeGeometry(0.035, 0.18, 6), horn, x * 1.5, 0.24, -0.02, head);
    h.rotation.z = -x * 4;
    const ear = part(new THREE.SphereGeometry(0.07, 8, 6), coat, x * 2.3, 0.12, 0, head);
    ear.scale.set(1.3, 0.5, 0.8);
  }

  const legs = [[-0.24, -0.5], [0.24, -0.5], [-0.24, 0.55], [0.24, 0.55]].map(([x, z]) => {
    const leg = limb(group, x, 0.72, z);
    part(new THREE.CylinderGeometry(0.085, 0.065, 0.62, 8), coat, 0, -0.31, 0, leg);
    part(new THREE.CylinderGeometry(0.075, 0.08, 0.1, 8), hoof, 0, -0.67, 0, leg);
    return leg;
  });
  const tail = limb(group, 0, 1.3, 0.72);
  part(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), coat, 0, -0.3, 0, tail);
  part(new THREE.SphereGeometry(0.05, 6, 5), patch, 0, -0.62, 0, tail);
  tail.rotation.x = -0.25;

  let phase = 0;
  let time = 0;
  const white = new THREE.Color('#f3efe6');
  return {
    group,
    // Peinte, la vache prend la couleur de l'équipe ; ses taches restent visibles en plus foncé.
    setTeam(color) {
      if (color) {
        coat.color.set(color);
        patch.color.set(color).multiplyScalar(0.45);
      } else {
        coat.color.copy(white);
        patch.color.set('#2b2622');
      }
    },
    animate(speed, dt) {
      time += dt;
      phase += speed * dt * 3.2;
      const swing = Math.sin(phase) * 0.35 * Math.min(1, speed);
      legs[0].rotation.x = swing;
      legs[3].rotation.x = swing;
      legs[1].rotation.x = -swing;
      legs[2].rotation.x = -swing;
      tail.rotation.z = Math.sin(time * 2.2) * 0.35;
      // à l'arrêt, elle broute
      head.rotation.x += ((speed < 0.1 ? -0.55 : 0) - head.rotation.x) * (1 - Math.exp(-2 * dt));
    },
  };
}

// ---- chèvre ----

export function buildGoat(team) {
  const group = new THREE.Group();
  const coat = std('#7a4e2e', 0.95);
  const belly = std('#b08a62', 0.95);
  const dark = std('#3d2716', 0.9);
  const horn = std('#d9cdb0', 0.6);

  // tout le corps tangue autour du centre, pattes comprises
  const torso = limb(group, 0, 0.5, 0);
  const body = part(new THREE.CapsuleGeometry(0.15, 0.36, 4, 10), coat, 0, 0, 0.02, torso);
  body.rotation.x = Math.PI / 2;
  part(new THREE.SphereGeometry(0.13, 8, 6), belly, 0, -0.06, 0.02, torso).scale.set(0.9, 0.7, 2);
  part(new THREE.BoxGeometry(0.06, 0.03, 0.56), dark, 0, 0.155, 0.02, torso);   // raie du dos

  const neck = limb(torso, 0, 0.08, -0.24);
  part(new THREE.CylinderGeometry(0.07, 0.09, 0.24, 8), coat, 0, 0.1, 0, neck);
  const head = limb(neck, 0, 0.24, 0);
  part(new THREE.SphereGeometry(0.1, 10, 8), coat, 0, 0, -0.03, head).scale.set(0.9, 1, 1.25);
  part(new THREE.BoxGeometry(0.1, 0.09, 0.14), dark, 0, -0.04, -0.15, head);
  part(new THREE.ConeGeometry(0.03, 0.12, 5), dark, 0, -0.14, -0.13, head).rotation.x = Math.PI;   // barbiche
  const ears = [];
  for (const x of [-0.045, 0.045]) {
    // cornes recourbées vers l'arrière, en deux tronçons
    const h = limb(head, x, 0.08, 0.02);
    h.rotation.x = -0.5;
    part(new THREE.CylinderGeometry(0.02, 0.028, 0.14, 6), horn, 0, 0.07, 0, h);
    const tip = limb(h, 0, 0.14, 0);
    tip.rotation.x = -0.7;
    part(new THREE.ConeGeometry(0.02, 0.13, 6), horn, 0, 0.065, 0, tip);
    const ear = limb(head, x * 2.3, 0.03, 0.02);
    part(new THREE.SphereGeometry(0.035, 6, 5), coat, x * 0.6, 0, 0, ear).scale.set(1.5, 0.45, 0.8);
    ears.push(ear);
    part(new THREE.SphereGeometry(0.016, 6, 5), std('#1a1512'), x * 1.3, 0.03, -0.12, head);
  }
  // foulard à la couleur de l'équipe
  part(new THREE.TorusGeometry(0.095, 0.03, 6, 12), std(team, 0.7), 0, 0.03, 0, neck).rotation.x = Math.PI / 2;

  // pattes en deux segments : [épaule ou hanche, genou]
  const legs = [[-0.09, -0.17], [0.09, -0.17], [-0.09, 0.2], [0.09, 0.2]].map(([x, z]) => {
    const upper = limb(torso, x, -0.1, z);
    part(new THREE.CylinderGeometry(0.04, 0.032, 0.2, 6), coat, 0, -0.1, 0, upper);
    const lower = limb(upper, 0, -0.2, 0);
    part(new THREE.CylinderGeometry(0.03, 0.024, 0.19, 6), coat, 0, -0.095, 0, lower);
    part(new THREE.CylinderGeometry(0.03, 0.032, 0.05, 6), dark, 0, -0.195, 0, lower);
    return { upper, lower };
  });
  const tail = limb(torso, 0, 0.14, 0.3);
  part(new THREE.ConeGeometry(0.04, 0.12, 5), coat, 0, 0.05, 0, tail);
  tail.rotation.x = -0.6;

  let phase = Math.random() * 6;
  return {
    group,
    // climbing : la chèvre escalade un mur, les pattes moulinent plus court
    animate(dt, climbing = false) {
      phase += dt * (climbing ? 26 : 19);
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      // galop : les deux pattes avant ensemble, les deux arrière en opposition, avec une phase en l'air
      const reach = climbing ? 0.55 : 1.0;
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        const lag = (i % 2) * 0.35;
        const a = Math.sin(phase + (front ? 0 : Math.PI * 0.85) + lag);
        const b = Math.cos(phase + (front ? 0 : Math.PI * 0.85) + lag);
        legs[i].upper.rotation.x = a * reach;
        legs[i].lower.rotation.x = (front ? -1 : 1) * Math.max(0, front ? b : -b) * 1.3 * reach - (front ? 0 : 0.25);
      }
      torso.position.y = 0.5 + Math.max(0, s) * 0.11;
      torso.rotation.x = c * 0.16;
      neck.rotation.x = 0.5 - c * 0.22;
      head.rotation.x = -0.5 + c * 0.12;
      tail.rotation.x = -0.6 + s * 0.4;
      ears[0].rotation.z = 0.2 + s * 0.35;
      ears[1].rotation.z = -0.2 - s * 0.35;
    },
  };
}
