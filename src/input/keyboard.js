// Clavier + souris. Les touches sont lues par position physique (event.code),
// donc ZQSD sur un clavier AZERTY et WASD sur un QWERTY sans réglage.

import { makeCommand } from '../core/command.js';

const PITCH_LIMIT = 1.35;

export class KeyboardMouse {
  constructor(canvas, { sensitivity = 0.0023, yaw = 0 } = {}) {
    this.canvas = canvas;
    this.sensitivity = sensitivity;
    this.scale = 1;         // réglage du joueur
    this.yaw = yaw;
    this.pitch = 0;
    this.keys = new Set();
    this.firing = false;
    this.cmd = makeCommand();
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (!this.locked) return;
      this.keys.add(e.code);
      e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this._release());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) this.lock();
      else if (e.button === 0) this.firing = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity * this.scale;
      this.pitch -= e.movementY * this.sensitivity * this.scale;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) this._release();
      this.onLockChange?.(this.locked);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  lock() {
    // le navigateur peut refuser (clic trop rapproché d'un Échap) : on reste alors en pause
    this.canvas.requestPointerLock?.()?.catch?.(() => {});
  }

  _release() {
    this.keys.clear();
    this.firing = false;
  }

  command() {
    const k = this.keys;
    const c = this.cmd;
    c.move.x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    c.move.z = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    c.yaw = this.yaw;
    c.pitch = this.pitch;
    c.fire = this.firing;
    c.cat = k.has('ShiftLeft') || k.has('ShiftRight');
    c.jump = k.has('Space');
    c.special = k.has('KeyE');
    c.goats = k.has('KeyF');
    return c;
  }
}
