// Commandes tactiles : manette virtuelle à gauche, visée au doigt à droite, boutons d'action.
// Deux aides réservées au tactile : une légère assistance à la visée et un tir automatique
// quand un adversaire est dans le viseur.

import { makeCommand } from '../core/command.js';
import { AIM, TOUCH } from '../config/tuning.js';

const PITCH_LIMIT = 1.35;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function wrap(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class TouchControls {
  // layer : la couche plein écran qui reçoit les doigts ; look : l'objet qui porte yaw et pitch
  constructor(layer, look) {
    this.layer = layer;
    this.look = look;
    this.cmd = makeCommand();
    this.autoFire = TOUCH.autoFire;
    this.scale = 1;         // réglage de sensibilité du joueur
    this.onPause = null;
    this.stick = layer.querySelector('#stick');
    this.knob = layer.querySelector('#stick-knob');
    this.catButton = layer.querySelector('[data-action="cat"]');
    this.pointers = new Map();   // doigt → rôle
    this.reset();

    layer.addEventListener('pointerdown', (e) => this._down(e));
    layer.addEventListener('pointermove', (e) => this._move(e));
    layer.addEventListener('pointerup', (e) => this._up(e));
    layer.addEventListener('pointercancel', (e) => this._up(e));
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  reset() {
    this.pointers.clear();
    this.moveX = 0;
    this.moveZ = 0;
    this.held = { fire: false, jump: false, special: false, goats: false };
    this.cat = false;
    this.stick.classList.add('hidden');
    this.catButton.setAttribute('aria-pressed', 'false');
  }

  _down(e) {
    e.preventDefault();
    this.layer.setPointerCapture?.(e.pointerId);
    const action = e.target.closest?.('[data-action]')?.dataset.action;
    if (action === 'pause') {
      this.onPause?.();
      return;
    }
    const p = { role: 'look', x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
    if (action === 'cat') {
      // bascule : difficile de maintenir un bouton en plus de viser et de se déplacer
      this.cat = !this.cat;
      this.catButton.setAttribute('aria-pressed', String(this.cat));
      p.role = 'button';
    } else if (action === 'fire') {
      // le bouton de tir sert aussi à viser : on glisse le doigt sans le lever
      this.held.fire = true;
      this.cat = false;
      this.catButton.setAttribute('aria-pressed', 'false');
      p.role = 'fire';
    } else if (action) {
      this.held[action] = true;
      p.role = action;
    } else if (e.clientX < innerWidth * 0.45 && ![...this.pointers.values()].some((q) => q.role === 'stick')) {
      p.role = 'stick';
      this.stick.classList.remove('hidden');
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.knob.style.transform = 'translate(-50%, -50%)';
    }
    this.pointers.set(e.pointerId, p);
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (p.role === 'stick') {
      const r = TOUCH.stickRadius;
      let sx = (e.clientX - p.startX) / r;
      let sy = (e.clientY - p.startY) / r;
      const len = Math.hypot(sx, sy);
      if (len > 1) { sx /= len; sy /= len; }
      this.moveX = sx;
      this.moveZ = -sy;
      this.knob.style.transform = `translate(calc(-50% + ${sx * r}px), calc(-50% + ${sy * r}px))`;
    } else if (p.role === 'look' || p.role === 'fire') {
      this.look.yaw -= dx * TOUCH.sensitivity * this.scale;
      this.look.pitch = clamp(this.look.pitch - dy * TOUCH.sensitivity * this.scale * 0.8, -PITCH_LIMIT, PITCH_LIMIT);
    }
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.role === 'stick') {
      this.moveX = 0;
      this.moveZ = 0;
      this.stick.classList.add('hidden');
    } else if (p.role in this.held) {
      this.held[p.role] = false;
    }
  }

  command(world, player, dt) {
    const c = this.cmd;
    c.move.x = this.moveX;
    c.move.z = this.moveZ;
    c.cat = this.cat;
    c.jump = this.held.jump;
    c.special = this.held.special;
    c.goats = this.held.goats;
    c.fire = this.held.fire;

    const target = player.alive && !this.cat ? this._target(world, player) : null;
    if (target) {
      // le viseur est attiré vers l'adversaire le plus proche de sa ligne de mire
      const pull = 1 - Math.exp(-TOUCH.assistRate * dt);
      this.look.yaw += target.yawError * pull;
      this.look.pitch += target.pitchError * pull;
      // tir automatique, sauf pour le tir chargé qui demande de choisir son moment
      if (this.autoFire && player.weapon.kind !== 'charge' && target.angle < TOUCH.autoFireAngle) c.fire = true;
    }
    c.yaw = this.look.yaw;
    c.pitch = this.look.pitch;
    return c;
  }

  // Adversaire visible le plus proche du viseur, s'il est dans le cône d'assistance.
  _target(world, player) {
    const range = player.character.ai.engage + 2;
    let best = null;
    for (const e of world.actors) {
      if (e.team === player.team || !e.alive || e.submerged) continue;
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.5) continue;
      const yaw = Math.atan2(-dx, -dz) + Math.asin(Math.min(1, AIM.side / Math.max(d, AIM.side)));
      const pitch = Math.atan2(e.pos.y + e.height * 0.6 - (player.pos.y + AIM.height), d);
      const yawError = wrap(yaw - this.look.yaw);
      const pitchError = pitch - this.look.pitch;
      const angle = Math.hypot(yawError, pitchError);
      if (angle > TOUCH.assistAngle || (best && angle >= best.angle)) continue;
      const ox = player.pos.x, oy = player.pos.y + 1.3, oz = player.pos.z;
      const ty = e.pos.y + e.height * 0.6 - oy;
      const len = Math.hypot(dx, ty, dz);
      if (world.level.raycast(ox, oy, oz, dx / len, ty / len, dz / len, len)) continue;
      best = { yawError, pitchError, angle };
    }
    return best;
  }
}
