// Un acteur : joueur ou bot, piloté par une Commande. Ne sait pas qui la produit.

import { PLAYER } from '../config/tuning.js';
import { SPECIAL_COST, SPECIAL_KEPT_ON_DEATH } from '../config/specials.js';
import { updateWeapon } from './weapons.js';
import { updateSpecial, endSpecial } from './specials.js';
import { updateGoatTrigger } from './goats.js';
import { GOATS } from '../config/animals.js';

export class Actor {
  constructor(world, { team, spawn, character, weapon }) {
    this.world = world;
    this.team = team;
    this.spawn = spawn;
    this.character = character;
    this.weapon = weapon;
    this.maxHp = character.hp;
    this.inkMax = PLAYER.inkMax;
    this.hitRadius = PLAYER.radius * character.scale;

    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.turf = 0;            // m² peints depuis le début du match
    this.gauge = 0;           // m² accumulés vers la capacité spéciale
    this.goatGauge = 0;       // m² accumulés vers le lâcher de chèvres
    this.goatsHeld = false;
    this.kills = 0;
    this.deaths = 0;
    this.specialHeld = false;
    this.revealedT = 0;
    // Marionnette : sur l'appareil d'un joueur en réseau, l'acteur ne fait que prédire son propre
    // déplacement ; tirs, capacités, vie et réservoir sont décidés par le serveur.
    this.puppet = false;
    this._reset();
  }

  _reset() {
    const [x, y, z] = this.spawn.pos;
    this.pos.x = this.prev.x = x;
    this.pos.y = this.prev.y = y;
    this.pos.z = this.prev.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = this.spawn.yaw;
    this.pitch = 0;
    this.form = 'human';
    this.grounded = false;
    this.climbing = false;
    this.submerged = false;
    this.wall = null;
    this.alive = true;
    this.hp = this.maxHp;
    this.invulnT = PLAYER.spawnInvuln;
    this.sinceDamage = 99;
    this.respawnT = 0;
    this.ink = this.inkMax;
    this.sinceFire = 99;
    // arme
    this.firing = false;
    this.rolling = false;
    this.triggerHeld = false;
    this.cooldown = 0;
    this.charge = 0;
    this.rollDist = 0;
    this.stepX = 0;
    this.stepZ = 0;
    this.dodgeT = 0;
    this.dodgeCd = 0;
    this.dodgeX = 0;
    this.dodgeZ = 0;
    // capacité spéciale
    this.specialT = 0;
    this.specialState = null;
    this.forced = null;       // vitesse imposée par une capacité
    // saut
    this.jumpHeld = false;
    this.jumpBufferT = 0;
    this.coyoteT = 0;
  }

  get height() {
    return this.form === 'cat' ? PLAYER.catHeight : PLAYER.height * this.character.scale;
  }

  // Jauge de capacité, de 0 à 1.
  get gaugeRatio() {
    return Math.min(1, this.gauge / SPECIAL_COST);
  }

  // Jauge du lâcher de chèvres, de 0 à 1.
  get goatRatio() {
    return Math.min(1, this.goatGauge / GOATS.cost);
  }

  // Crédite du terrain peint. La jauge de capacité ne monte pas pendant que la capacité est active ;
  // le terrain peint par les chèvres (goats = false) ne recharge pas un nouveau lâcher.
  addTurf(area, goats = true) {
    this.turf += area;
    if (this.specialT <= 0) this.gauge = Math.min(SPECIAL_COST, this.gauge + area);
    if (goats) this.goatGauge = Math.min(GOATS.cost, this.goatGauge + area);
  }

  // Hors du temps de jeu (décompte, fin de match) : on peut regarder autour de soi, rien d'autre.
  look(cmd) {
    this.prev.x = this.pos.x;
    this.prev.y = this.pos.y;
    this.prev.z = this.pos.z;
    if (!this.alive) return;
    this.yaw = cmd.yaw;
    this.pitch = cmd.pitch;
    this.firing = false;
    this.rolling = false;
  }

  // Renvoie true si le coup a porté.
  damage(amount, attacker) {
    if (!this.alive || this.invulnT > 0) return false;
    this.hp -= amount;
    this.sinceDamage = 0;
    this.world.events.emit('touche', { actor: this, attacker });
    if (this.hp <= 0) this.die(attacker);
    return true;
  }

  die(killer = null) {
    if (!this.alive) return;
    endSpecial(this.world, this);
    this.alive = false;
    this.hp = 0;
    this.firing = false;
    this.rolling = false;
    this.climbing = false;
    this.submerged = false;
    this.charge = 0;
    this.gauge *= SPECIAL_KEPT_ON_DEATH;
    this.goatGauge *= SPECIAL_KEPT_ON_DEATH;
    this.respawnT = PLAYER.respawnTime;
    this.deaths++;
    if (killer) {
      killer.kills++;
      killer.addTurf(this.world.paint.splat(this.pos.x, this.pos.y, this.pos.z, PLAYER.deathSplatRadius, killer.team, this.world.rng() * 6.28));
    }
    this.world.events.emit('elimine', { actor: this, killer });
  }

  step(cmd, dt) {
    const P = PLAYER;
    const { level, paint } = this.world;
    const { pos, vel } = this;
    this.prev.x = pos.x;
    this.prev.y = pos.y;
    this.prev.z = pos.z;
    if (this.revealedT > 0) this.revealedT -= dt;

    if (!this.alive) {
      if (this.puppet) return;
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this._reset();
        this.world.events.emit('reapparu', { actor: this });
      }
      return;
    }

    this.yaw = cmd.yaw;
    this.pitch = cmd.pitch;
    if (!this.puppet) {
      updateSpecial(this.world, this, cmd, dt);
      updateGoatTrigger(this.world, this, cmd);
    }
    const forced = this.forced;
    this.form = cmd.cat && !forced ? 'cat' : 'human';
    const cat = this.form === 'cat';

    // direction voulue, dans le repère du monde
    let mx = cmd.move.x;
    let mz = cmd.move.z;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const wx = cy * mx - sy * mz;
    const wz = -sy * mx - cy * mz;

    const under = this.grounded ? paint.teamAt(pos.x, pos.y, pos.z, 1, 1) : 0;
    const onOwn = under === this.team;
    const onEnemy = under !== 0 && !onOwn;

    const wasClimbing = this.climbing;
    this.climbing = cat && this._canClimb(wx, wz);
    // fin d'escalade : un petit bond suffit pour passer le rebord sans survoler le mur
    if (wasClimbing && !this.climbing && vel.y > P.climbExitVel) vel.y = P.climbExitVel;
    this.submerged = cat && (this.climbing || (this.grounded && onOwn));

    // la gâchette avant la vitesse : tirer ralentit
    if (this.puppet) this.firing = !cat && cmd.fire && !forced;
    else updateWeapon(this.world, this, cmd, dt);

    // esquive : un saut pressé en tirant devient une glissade dans la direction du déplacement
    const dodge = this.weapon.dodge;
    this.dodgeCd -= dt;
    if (dodge && cmd.jump && !this.jumpHeld && this.firing && this.grounded && ml > 0.1 && this.dodgeCd <= 0 && this.ink >= dodge.inkCost) {
      this.dodgeT = dodge.time;
      this.dodgeCd = dodge.cooldown;
      this.dodgeX = (wx / Math.hypot(wx, wz)) * dodge.speed;
      this.dodgeZ = (wz / Math.hypot(wx, wz)) * dodge.speed;
      this.jumpHeld = true;   // l'appui est consommé, pas de saut
      if (!this.puppet) {
        this.ink -= dodge.inkCost;
        this.world.events.emit('esquive', { actor: this });
      }
    }

    if (forced) {
      vel.x = forced.x;
      vel.z = forced.z;
    } else if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      vel.x = this.dodgeX;
      vel.z = this.dodgeZ;
    } else {
      let speed;
      let accel;
      if (this.climbing) {
        speed = P.swimSpeed * 0.6;
        accel = P.accelSwim;
      } else if (this.grounded && onEnemy) {
        speed = P.enemyPaintSpeed;
        accel = P.accelEnemyPaint;
      } else if (cat) {
        speed = this.submerged ? P.swimSpeed : P.catDrySpeed;
        accel = this.submerged ? P.accelSwim : P.accelCatDry;
      } else {
        speed = P.runSpeed * (this.firing ? this.weapon.moveSpeedFiring : 1);
        accel = P.accelGround;
      }
      speed *= this.character.speed;
      if (!this.grounded && !this.climbing) {
        // en l'air on garde son élan (un saut hors de la peinture reste rapide)
        speed = Math.max(speed, Math.hypot(vel.x, vel.z));
        accel = P.accelAir;
      }
      const ddx = wx * speed - vel.x;
      const ddz = wz * speed - vel.z;
      const dl = Math.hypot(ddx, ddz);
      const maxDelta = accel * dt;
      const k = dl > maxDelta ? maxDelta / dl : 1;
      vel.x += ddx * k;
      vel.z += ddz * k;
    }

    // saut : tampon avant l'atterrissage, tolérance après un rebord
    if (cmd.jump && !this.jumpHeld) this.jumpBufferT = P.jumpBuffer;
    this.jumpHeld = cmd.jump;
    this.coyoteT = this.grounded ? P.coyoteTime : this.coyoteT - dt;
    if (this.jumpBufferT > 0 && this.coyoteT > 0 && !this.climbing && !forced) {
      vel.y = this.submerged ? P.swimJumpVel : P.jumpVel;
      this.grounded = false;
      this.coyoteT = 0;
      this.jumpBufferT = 0;
    }
    this.jumpBufferT -= dt;

    if (this.climbing) {
      vel.y = P.climbSpeed;
    } else {
      vel.y -= P.gravity * (vel.y < 0 ? P.fallGravityMul : 1) * dt;
      if (vel.y < -P.maxFall) vel.y = -P.maxFall;
    }

    // déplacement et collisions : horizontal puis vertical
    const h = this.height;
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    this.wall = level.collideHorizontal(pos, P.radius, h, P.stepHeight, this.grounded);
    if (this.wall) {
      const vn = vel.x * this.wall.nx + vel.z * this.wall.nz;
      if (vn < 0) {
        vel.x -= vn * this.wall.nx;
        vel.z -= vn * this.wall.nz;
      }
    }
    this.world.cows.pushOut(pos, P.radius, h);
    const prevY = pos.y;
    pos.y += vel.y * dt;
    const res = level.collideVertical(pos, prevY, P.radius, h, vel.y);
    this.grounded = !!res.ground;
    if (res.ground || res.ceiling) vel.y = 0;
    // déplacement réel de ce pas, lu par le rouleau au pas suivant
    this.stepX = pos.x - this.prev.x;
    this.stepZ = pos.z - this.prev.z;
    if (this.puppet) return;

    // réservoir de peinture
    this.sinceFire += dt;
    if (this.submerged) this.ink += P.inkRefillSwim * dt;
    else if (!cat && !this.firing && this.sinceFire > P.inkRefillDelay) this.ink += P.inkRefillHuman * dt;
    if (this.ink > this.inkMax) this.ink = this.inkMax;

    // vie : la peinture adverse ronge jusqu'à un plancher, puis on récupère après un répit
    this.invulnT -= dt;
    this.sinceDamage += dt;
    const floor = this.maxHp - P.enemyPaintDamageCap;
    if (this.grounded && onEnemy && this.invulnT <= 0 && this.hp > floor) {
      this.hp = Math.max(floor, this.hp - P.enemyPaintDps * dt);
      this.sinceDamage = 0;
    } else if (this.sinceDamage > P.regenDelay && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + (this.submerged ? P.regenRateSwim : P.regenRate) * dt);
    }

    if (pos.y < P.fallDeathY) this.die();
  }

  // Un chat grimpe s'il pousse franchement contre un mur peint à sa couleur.
  _canClimb(wx, wz) {
    const w = this.wall;
    if (!w || w.flat < 0.9) return false;
    if (-(wx * w.nx + wz * w.nz) < 0.3) return false;
    const axis = Math.abs(w.nx) > Math.abs(w.nz) ? 0 : 2;
    const sign = (axis === 0 ? w.nx : w.nz) > 0 ? 1 : -1;
    const px = this.pos.x - w.nx * PLAYER.radius;
    const pz = this.pos.z - w.nz * PLAYER.radius;
    return this.world.paint.teamAt(px, this.pos.y + 0.25, pz, axis, sign) === this.team;
  }
}
