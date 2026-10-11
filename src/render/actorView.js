// Apparence d'un acteur, en forme humaine et en forme chat.
// La coiffure, les lunettes, la tenue et l'arme identifient l'héroïne ; le foulard, les brassards, les gants,
// le réservoir et un repère au-dessus de la tête portent la couleur de l'équipe.
// Le chat a le pelage de la couleur de ses cheveux.

import * as THREE from 'three';
import { TEAMS } from '../config/tuning.js';
import { SPECIALS } from '../config/specials.js';
import { buildCat } from './models.js';
import { buildHuman, ARM, GRIP } from './human.js';

const std = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });

export class ActorView {
  // viewerTeam : l'équipe du joueur, pour n'afficher les repères que sur ses adversaires.
  // self : c'est l'héroïne du joueur, qui n'a pas besoin de repère d'équipe.
  constructor(actor, viewerTeam, self = false) {
    this.actor = actor;
    this.viewerTeam = viewerTeam;
    this.group = new THREE.Group();
    const look = actor.character.look;
    const color = TEAMS[actor.team].color;

    const kind = actor.weapon.kind;
    this.human = buildHuman(look, color, kind === 'charge' ? 'rifle' : kind === 'roller' ? 'roller' : 'dual');
    this.human.group.scale.setScalar(actor.character.scale);
    this.weapon = buildWeapon(kind, std('#2c2622', 0.5), std(color, 0.35), this.human);
    this.group.add(this.human.group);
    if (!self) {
      // petit repère à la couleur de l'équipe, pour reconnaître de loin alliées et adversaires
      const tag = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 4), new THREE.MeshBasicMaterial({ color }));
      tag.rotation.x = Math.PI;
      tag.position.y = 1.86;
      this.human.group.add(tag);
    }

    this.cat = buildCat(look, color);
    this.group.add(this.cat.group);

    // remous autour du chat qui nage dans sa peinture
    this.ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.42, 20),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.position.y = 0.03;
    this.group.add(this.ripple);

    // ombre de contact, pour les niveaux de qualité sans ombres portées
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.025;
    this.group.add(this.blob);

    // Cercle d'entraide : zone au sol qui suit l'héroïne
    if (actor.character.special === 'cercle') {
      const r = SPECIALS.cercle.radius;
      this.circle = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false }));
      const rim = new THREE.Mesh(new THREE.RingGeometry(r - 0.18, r, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false }));
      this.circle.add(disc, rim);
      this.circle.rotation.x = -Math.PI / 2;
      this.circle.position.y = 0.08;
      this.group.add(this.circle);
    }

    // repère visible à travers les murs quand l'acteur est révélé par le Plan de bataille
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: '#ffe14d', depthTest: false, transparent: true }));
    this.marker.renderOrder = 10;
    this.group.add(this.marker);

    this.state = {};
    this.catYaw = actor.yaw;
    this.sink = 0;
    this.tilt = 0;
    this.time = 0;
  }

  // alpha : position entre l'état précédent (0) et l'état courant (1) de la simulation ;
  // blob : affiche l'ombre de contact (quand les ombres portées sont coupées)
  update(alpha, dt, blob = false) {
    const a = this.actor;
    this.time += dt;
    this.group.visible = a.alive;
    if (!a.alive) return;
    const x = a.prev.x + (a.pos.x - a.prev.x) * alpha;
    const y = a.prev.y + (a.pos.y - a.prev.y) * alpha;
    const z = a.prev.z + (a.pos.z - a.prev.z) * alpha;
    // en réseau, un recalage de position se résorbe en douceur plutôt que d'un coup
    const o = a.offset;
    if (o) this.group.position.set(x + o.x, y + o.y, z + o.z);
    else this.group.position.set(x, y, z);

    const cat = a.form === 'cat';
    const speed = Math.hypot(a.vel.x, a.vel.z);
    this.human.group.visible = !cat;
    this.cat.group.visible = cat;
    if (!cat) {
      this.human.group.rotation.y = a.yaw;
      // vitesse dans le repère du regard : vers l'avant et vers la droite
      const sy = Math.sin(a.yaw);
      const cy = Math.cos(a.yaw);
      this.state.speed = speed;
      this.state.forward = -a.vel.x * sy - a.vel.z * cy;
      this.state.side = a.vel.x * cy - a.vel.z * sy;
      this.state.grounded = a.grounded;
      this.state.vy = a.vel.y;
      this.state.aiming = a.firing || a.charge > 0;
      this.state.firing = a.firing && a.weapon.kind === 'auto';
      this.state.rolling = a.rolling === true;
      this.state.dashing = a.forced !== null;
      this.state.pitch = a.pitch;
      this.state.ink = a.ink / a.inkMax;
      this.state.hurt = Math.max(0, 1 - a.sinceDamage * 5);
      this.human.animate(this.state, dt);
      this.weapon.update(a);
    } else {
      // le chat regarde où il va, s'enfonce dans sa peinture et se redresse contre un mur
      if (a.climbing && a.wall) this.catYaw = Math.atan2(a.wall.nx, a.wall.nz);
      else if (speed > 0.5) this.catYaw = Math.atan2(-a.vel.x, -a.vel.z);
      this.cat.animate({ speed, submerged: a.submerged }, dt);
    }
    const ease = 1 - Math.exp(-14 * dt);
    const swimming = cat && a.submerged && !a.climbing;
    this.sink += ((swimming ? 0.24 : 0) - this.sink) * ease;
    this.tilt += ((cat && a.climbing ? Math.PI / 2 : 0) - this.tilt) * ease;
    this.cat.group.rotation.set(this.tilt, this.catYaw, 0, 'YXZ');
    this.cat.group.position.y = -this.sink;

    this.ripple.visible = swimming;
    this.blob.visible = blob && a.grounded && !swimming;
    if (swimming) {
      const pulse = (this.time * 1.6) % 1;
      this.ripple.scale.setScalar(0.8 + pulse * (1 + speed * 0.06));
      this.ripple.material.opacity = 0.55 * (1 - pulse);
    }
    if (this.circle) {
      this.circle.visible = a.specialT > 0;
      this.circle.scale.setScalar(1 + Math.sin(this.time * 4) * 0.02);
    }
    this.marker.visible = a.revealedT > 0 && a.team !== this.viewerTeam;
    this.marker.position.y = a.height + 0.55 + Math.sin(this.time * 5) * 0.06;
    this.marker.rotation.y = this.time * 3;
  }
}

function part(geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

// Chaque arme : ses objets, accrochés aux mains ou au pivot d'épaule du modèle, et une fonction qui l'anime.
// Le pivot regarde vers -Z ; les deux mains s'y rejoignent à `reach` mètres devant l'épaule.
function buildWeapon(kind, dark, team, human) {
  const pivot = human.weaponPivot;
  const reach = ARM * Math.cos(GRIP);
  const add = (parent, geometry, material, x, y, z) => {
    const mesh = part(geometry, material, x, y, z);
    parent.add(mesh);
    return mesh;
  };
  if (kind === 'charge') {
    // fusil long : le réservoir au bout grossit avec la charge
    add(pivot, new THREE.BoxGeometry(0.055, 0.075, 0.85), dark, 0, 0.005, -reach - 0.2);
    add(pivot, new THREE.BoxGeometry(0.05, 0.11, 0.24), dark, 0, -0.03, -reach + 0.3);
    add(pivot, new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), dark, 0, 0.065, -reach - 0.05).rotation.x = Math.PI / 2;
    add(pivot, new THREE.SphereGeometry(0.05, 10, 8), team, 0, -0.06, -reach - 0.15);
    const tip = add(pivot, new THREE.SphereGeometry(0.06, 12, 10), team, 0, 0.005, -reach - 0.66);
    return { update: (a) => tip.scale.setScalar(1 + a.charge * 1.6) };
  }
  if (kind === 'roller') {
    // rouleau à long manche : posé au sol devant soi pour peindre, dressé sinon
    const end = -1.72;
    add(pivot, new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), dark, 0, 0, -0.9).rotation.x = Math.PI / 2;
    add(pivot, new THREE.BoxGeometry(1.46, 0.03, 0.03), dark, 0, 0, end + 0.22);
    for (const x of [-0.72, 0.72]) add(pivot, new THREE.BoxGeometry(0.03, 0.03, 0.24), dark, x, 0, end + 0.11);
    const drum = add(pivot, new THREE.CylinderGeometry(0.15, 0.15, 1.4, 16), team, 0, 0, end);
    drum.rotation.z = Math.PI / 2;
    return { update: (a) => { if (a.rolling) drum.rotation.x += Math.hypot(a.vel.x, a.vel.z) * 0.1; } };
  }
  // deux pistolets à réservoir, un dans chaque main : le canon prolonge l'avant-bras
  for (const hand of human.hands) {
    add(hand, new THREE.BoxGeometry(0.045, 0.2, 0.07), dark, 0, -0.07, -0.035);
    add(hand, new THREE.CylinderGeometry(0.014, 0.014, 0.06, 6), dark, 0, -0.19, -0.035);
    add(hand, new THREE.SphereGeometry(0.045, 10, 8), team, 0, -0.03, -0.09);
  }
  return { update() {} };
}
