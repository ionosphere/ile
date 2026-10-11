// Un bot : observe le monde et produit une Commande, exactement comme le clavier.
// Trois modes : peindre le terrain, attaquer un adversaire visible, se replier pour recharger.
// Le personnage joué (arme, capacité, réglages `ai`) donne à chaque bot son caractère.

import { makeCommand } from '../core/command.js';
import { AIM } from '../config/tuning.js';
import { SPECIALS } from '../config/specials.js';

const SIGHT_SUBMERGED = 4;   // un chat dans sa peinture ne se voit que de près
const LOOK_AHEAD = [2.5, 4.5, 6.5];

export class Bot {
  // squad : les bots de la même équipe, pour ne pas viser la même zone.
  // Niveau (voir DIFFICULTY dans tuning.js) :
  //   skill : 0 (maladroit) à 1 (précis) ; reaction : secondes avant de riposter ; spread : dispersion du tir ;
  //   pace : part du temps où le bot agit (le reste, il hésite sur place) ; patience : secondes d'attente
  //   avant d'utiliser une jauge pleine.
  constructor(world, actor, nav, squad, { skill = 0.5, reaction = 0.45 - 0.3 * skill, spread = 1, pace = 1, patience = 0 } = {}) {
    this.world = world;
    this.actor = actor;
    this.nav = nav;
    this.squad = squad;
    this.skill = skill;
    this.reaction = reaction;
    this.spread = spread;
    this.pace = pace;
    this.patience = patience;
    this.ai = actor.character.ai;
    this.cmd = makeCommand();
    this.cmd.yaw = actor.yaw;
    this._restart();
  }

  _restart() {
    this.mode = 'paint';
    this.goal = null;
    this.path = null;
    this.goalT = 0;
    this.enemy = null;
    this.seenT = 0;
    this.thinkT = 0;
    this.errT = 0;
    this.errYaw = 0;
    this.errPitch = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.stuckT = 0;
    this.stuckX = this.actor.pos.x;
    this.stuckZ = this.actor.pos.z;
    this.jumpT = 0;
    this.refuge = null;
    this.refugeT = 0;
    this.reflingT = 0;
    this.readyT = 0;      // temps écoulé avec la jauge pleine
    this.goatReadyT = 0;
    this.workT = 3;        // temps d'activité avant la prochaine hésitation
    this.restT = 0;
    this.time = 0;
  }

  command(dt) {
    const a = this.actor;
    const c = this.cmd;
    c.move.x = 0;
    c.move.z = 0;
    c.fire = false;
    c.cat = false;
    c.jump = false;
    c.special = false;
    c.goats = false;
    const match = this.world.match;
    if (!a.alive || (match && match.phase !== 'playing')) {
      if (!a.alive) this._restart();
      c.yaw = a.yaw;
      c.pitch = a.pitch;
      return c;
    }
    this.time += dt;

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this._think();
      this.thinkT = 0.22 + this.world.rng() * 0.1;
    }

    // chaque mode fixe la direction de marche (repère du monde), le point visé et la gâchette
    this.wantYaw = c.yaw;
    this.wantPitch = 0;
    this.walkX = 0;
    this.walkZ = 0;
    this.wantFire = false;
    this.aligned = true;
    this.needCharge = 0.6;
    if (a.forced) this._ride();
    else if (this.mode === 'attack') this._attack(dt);
    else if (this.mode === 'refill') this._refill(dt);
    else this._paint(dt);
    // un bot peu aguerri s'arrête régulièrement pour hésiter : il ne tire plus et n'avance plus
    const idle = this._hesitates(dt);
    if (idle) {
      this.walkX = 0;
      this.walkZ = 0;
      this.wantFire = false;
    }
    c.fire = this._trigger(dt);
    this._special(dt);
    // le lâcher de chèvres part quand il est prêt, hors des moments où l'on recharge
    this.goatReadyT = a.goatRatio >= 1 ? this.goatReadyT + dt : 0;
    c.goats = this.goatReadyT > this.patience && this.mode !== 'refill' && this.time % 1 < 0.5;

    // le regard tourne à vitesse limitée
    const turn = (5 + 6 * this.skill) * dt;
    c.yaw += clamp(wrap(this.wantYaw - c.yaw), -turn, turn);
    c.pitch += clamp(this.wantPitch - c.pitch, -turn, turn);

    // direction de marche ramenée dans le repère du regard
    const sy = Math.sin(c.yaw);
    const cy = Math.cos(c.yaw);
    c.move.x = this.walkX * cy - this.walkZ * sy;
    c.move.z = -this.walkX * sy - this.walkZ * cy;

    this._unstick(dt);
    return c;
  }

  // ---- décision ----

  _think() {
    const a = this.actor;
    const enemy = this._nearestVisibleEnemy();
    if (enemy && enemy === this.enemy) this.seenT += 0.25;
    else this.seenT = 0;
    this.enemy = enemy;
    const dist = enemy ? Math.hypot(enemy.pos.x - a.pos.x, enemy.pos.z - a.pos.z) : Infinity;
    const reacted = this.seenT >= this.reaction;

    const refilling = this.mode === 'refill';
    const hp = a.hp / a.maxHp;
    const needRefill = a.ink < 12 || hp < this.ai.retreatHp || (refilling && (a.ink < 85 || hp < 0.85));
    // acculé, un bot qui a encore de quoi tirer se défend
    const cornered = enemy && dist < 7 && a.ink >= 25 && hp >= this.ai.retreatHp;

    let mode = 'paint';
    if (needRefill && !cornered) mode = 'refill';
    else if (enemy && reacted && dist <= this.ai.engage) mode = 'attack';
    if (mode !== this.mode) {
      this.mode = mode;
      this.path = null;
      if (mode !== 'paint') this.goal = null;
    }
  }

  _nearestVisibleEnemy() {
    const a = this.actor;
    const { level } = this.world;
    let best = null;
    let bestD = this.ai.sight;
    for (const e of this.world.actors) {
      if (e.team === a.team || !e.alive) continue;
      const dx = e.pos.x - a.pos.x;
      const dy = e.pos.y + e.height * 0.6 - (a.pos.y + 1.3);
      const dz = e.pos.z - a.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d >= bestD || d < 1e-6) continue;
      // un adversaire repéré par le Plan de bataille ne peut plus se cacher dans sa peinture
      if (e.submerged && d > SIGHT_SUBMERGED && e.revealedT <= 0) continue;
      if (level.raycast(a.pos.x, a.pos.y + 1.3, a.pos.z, dx / d, dy / d, dz / d, d)) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  // ---- peindre ----

  _paint(dt) {
    const a = this.actor;
    const { paint } = this.world;
    const kind = a.weapon.kind;
    this.goalT -= dt;
    const arrived = this.goal && Math.hypot(this.goal.x - a.pos.x, this.goal.z - a.pos.z) < 1.5;
    if (!this.goal || arrived || this.goalT <= 0 || !this.path) this._pickPaintGoal();
    if (!this._followPath()) return;

    // regarde devant soi, à la recherche du premier bout de terrain qui n'est pas à son équipe
    let target = 0;
    for (const d of LOOK_AHEAD) {
      const x = a.pos.x + this.walkX * d;
      const z = a.pos.z + this.walkZ * d;
      if (this.nav.walkableAt(x, z, a.pos.y) && paint.teamAt(x, a.pos.y, z, 1, 1) !== a.team) { target = d; break; }
    }
    const heading = Math.atan2(-this.walkX, -this.walkZ);
    this.wantYaw = heading;
    this.wantPitch = -0.15;

    if (kind === 'roller') {
      // le rouleau peint sous ses pieds : il suffit d'avancer en le tenant baissé
      const near = paint.teamAt(a.pos.x + this.walkX, a.pos.y, a.pos.z + this.walkZ, 1, 1) !== a.team;
      if ((near || target === LOOK_AHEAD[0]) && a.ink >= 12) {
        this.wantFire = true;
        return;
      }
    } else if (target && a.ink >= 12) {
      if (kind === 'charge') {
        // un trait chargé peint loin devant : on vise le sol à bonne distance
        this._aimAt(a.pos.x + this.walkX * 10, a.pos.y, a.pos.z + this.walkZ * 10);
        this.aligned = Math.abs(wrap(this.wantYaw - this.cmd.yaw)) < 0.2 && Math.abs(this.wantPitch - this.cmd.pitch) < 0.1;
      } else {
        // léger balayage pour élargir la bande peinte
        this._aimAt(a.pos.x + this.walkX * target, a.pos.y, a.pos.z + this.walkZ * target);
        this.wantYaw += Math.sin(this.time * 5) * 0.3;
      }
      this.wantFire = true;
      return;
    }
    // rien à peindre devant : on file en chat si la voie est à notre couleur
    const ahead = paint.teamAt(a.pos.x + this.walkX * 2, a.pos.y, a.pos.z + this.walkZ * 2, 1, 1);
    if (!target && a.grounded && ahead === a.team && paint.teamAt(a.pos.x, a.pos.y, a.pos.z, 1, 1) === a.team) this.cmd.cat = true;
  }

  _pickPaintGoal() {
    const a = this.actor;
    const { paint, rng } = this.world;
    const nav = this.nav;
    let best = -1;
    let bestScore = -Infinity;
    for (let k = 0; k < 28; k++) {
      const i = nav.randomNode(rng);
      const x = nav.cx(i);
      const z = nav.cz(i);
      const owner = paint.teamAt(x, nav.h[i], z, 1, 1);
      if (owner === a.team) continue;
      let score = -Math.hypot(x - a.pos.x, z - a.pos.z) * 0.07 + (owner ? 0.6 : 0) + rng() * 0.5;
      for (const mate of this.squad) {
        if (mate === this) continue;
        if (mate.goal && Math.hypot(mate.goal.x - x, mate.goal.z - z) < 7) score -= 0.8;
        // un soutien préfère peindre près de ses coéquipières
        if (this.ai.staysClose && mate.actor.alive) score -= Math.hypot(mate.actor.pos.x - x, mate.actor.pos.z - z) * 0.012;
      }
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) best = nav.randomNode(rng);
    this.goal = { x: nav.cx(best), y: nav.h[best], z: nav.cz(best) };
    this.goalT = 9;
    this.path = this._pathTo(this.goal);
    if (!this.path) this.goal = null;
  }

  // Avance le long du chemin courant. Renvoie false s'il n'y a plus rien à suivre.
  _followPath() {
    const a = this.actor;
    while (this.path && this.path.length) {
      const p = this.path[0];
      const dx = p.x - a.pos.x;
      const dz = p.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) { this.path.shift(); continue; }
      this.walkX = dx / d;
      this.walkZ = dz / d;
      return true;
    }
    this.path = null;
    return false;
  }

  // ---- attaquer ----

  _attack(dt) {
    const a = this.actor;
    const e = this.enemy;
    if (!e || !e.alive) { this.mode = 'paint'; return; }
    const { rng } = this.world;
    const kind = a.weapon.kind;
    const dx = e.pos.x - a.pos.x;
    const dz = e.pos.z - a.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-6;

    // vise le torse, en anticipant le déplacement, avec une erreur qui change de temps en temps
    this.errT -= dt;
    if (this.errT <= 0) {
      const spread = (0.02 + (1 - this.skill) * 0.09) * this.spread * (kind === 'charge' ? 0.35 : 1);
      this.errYaw = (rng() * 2 - 1) * spread;
      this.errPitch = (rng() * 2 - 1) * spread * 0.6;
      this.errT = 0.3 + rng() * 0.2;
    }
    const lead = a.weapon.speed ? (dist / a.weapon.speed) * this.skill : 0;
    this._aimAt(e.pos.x + e.vel.x * lead, e.pos.y + e.height * 0.6, e.pos.z + e.vel.z * lead);
    this.wantYaw += this.errYaw;
    this.wantPitch += this.errPitch;

    // tourne autour de sa cible en gardant la distance qui convient à son arme
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafe = -this.strafe;
      this.strafeT = 0.6 + rng() * 0.8;
      // une esquive de temps en temps, pour qui en a une
      if (a.weapon.dodge && rng() < 0.35) this.jumpT = 0.05;
    }
    const fx = dx / dist;
    const fz = dz / dist;
    const advance = dist > this.ai.far ? 1 : dist < this.ai.near ? -1 : 0;
    const side = kind === 'roller' ? this.strafe * 0.25 : this.strafe;
    let wx = fx * advance - fz * side;
    let wz = fz * advance + fx * side;
    // sans quitter le terrain praticable
    if (!this.nav.walkableAt(a.pos.x + wx * 1.2, a.pos.z + wz * 1.2, a.pos.y)) {
      this.strafe = -this.strafe;
      wx = fx * advance + fz * side;
      wz = fz * advance - fx * side;
    }
    const l = Math.hypot(wx, wz) || 1;
    this.walkX = wx / l;
    this.walkZ = wz / l;

    const off = Math.abs(wrap(this.wantYaw - this.cmd.yaw));
    this.wantFire = dist < this.ai.engage + 0.5;
    if (kind === 'charge') {
      this.aligned = off < 0.05 && Math.abs(this.wantPitch - this.cmd.pitch) < 0.05;
      this.needCharge = dist < 6 ? 0.35 : 0.9;
    } else if (kind === 'roller') {
      // relâche brièvement la gâchette pour projeter une nouvelle gerbe à portée
      this.reflingT -= dt;
      if (dist < 5.5 && off < 0.4 && this.reflingT <= 0) {
        this.reflingT = 0.9;
        this.wantFire = false;
      }
    } else {
      this.aligned = off < 0.14;
    }
  }

  // ---- recharger ----

  _refill(dt) {
    const a = this.actor;
    const { paint } = this.world;
    const onOwn = a.grounded && paint.teamAt(a.pos.x, a.pos.y, a.pos.z, 1, 1) === a.team;
    if (onOwn) {
      // à l'abri dans sa peinture : le réservoir et la vie remontent vite
      this.cmd.cat = true;
      this.refuge = null;
      return;
    }
    if (a.ink >= 10) {
      // assez pour une flaque : on peint à ses pieds et on avance dedans
      this.wantYaw = this.cmd.yaw;
      this.wantPitch = -1.25;
      this.wantFire = this.cmd.pitch < -1;
      this.needCharge = 0.2;
      this.walkX = -Math.sin(this.cmd.yaw) * 0.5;
      this.walkZ = -Math.cos(this.cmd.yaw) * 0.5;
      return;
    }
    // réservoir à sec : rejoindre la peinture alliée la plus proche, sinon attendre que ça remonte
    this.refugeT -= dt;
    if (this.refugeT <= 0) {
      this.refugeT = 1;
      this.refuge = this._nearestOwnPaint();
      this.path = this.refuge ? this._pathTo(this.refuge) : null;
    }
    if (this.path && this._followPath()) {
      this.wantYaw = Math.atan2(-this.walkX, -this.walkZ);
      this.wantPitch = -0.15;
    }
  }

  _nearestOwnPaint() {
    const a = this.actor;
    const nav = this.nav;
    const { paint } = this.world;
    for (let ring = 1; ring <= 14; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const j = nav.node(a.pos.x + dx * nav.cell, a.pos.z + dz * nav.cell, a.pos.y, 1.5);
          if (j >= 0 && paint.teamAt(nav.cx(j), nav.h[j], nav.cz(j), 1, 1) === a.team) return { x: nav.cx(j), y: nav.h[j], z: nav.cz(j) };
        }
      }
    }
    return null;
  }

  _pathTo(p) {
    const a = this.actor;
    return this.nav.path(a.pos.x, a.pos.y, a.pos.z, p.x, p.y, p.z);
  }

  // ---- gâchette et capacité ----

  // Traduit « je veux tirer » en appuis sur la gâchette, selon le type d'arme.
  _trigger() {
    const a = this.actor;
    const w = a.weapon;
    if (!this.wantFire) return false;
    if (w.kind === 'charge') {
      if (a.ink < w.inkCost[0]) return false;
      // on maintient jusqu'à la charge voulue, puis on relâche une fois la cible dans le viseur
      return !(a.charge >= this.needCharge && this.aligned);
    }
    if (w.kind === 'roller') return true;
    return this.aligned && a.ink >= w.inkCost;
  }

  _special(dt) {
    const a = this.actor;
    const kind = a.character.special;
    if (!kind || a.specialT > 0 || a.gaugeRatio < 1) { this.readyT = 0; return; }
    this.readyT += dt;
    if (this.readyT < this.patience) return;
    const e = this.enemy;
    const dist = e ? Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z) : Infinity;
    let go = false;
    if (kind === 'ruee') {
      // sur un adversaire à portée de ruée, sinon pour ouvrir un couloir de peinture
      const facing = Math.abs(wrap(this.wantYaw - this.cmd.yaw)) < 0.3;
      go = (this.mode === 'attack' && dist > 3 && dist < 14 && facing) || (this.mode === 'paint' && this.readyT > 5 && this._clearAhead(12));
    } else if (kind === 'plan') {
      go = this.readyT > 0.5;
    } else if (kind === 'cercle') {
      const r = SPECIALS.cercle.radius;
      let hurt = a.hp < a.maxHp * 0.6;
      for (const mate of this.world.actors) {
        if (mate.team !== a.team || !mate.alive || mate === a) continue;
        if (mate.hp < mate.maxHp * 0.6 && Math.hypot(mate.pos.x - a.pos.x, mate.pos.z - a.pos.z) < r) hurt = true;
      }
      go = hurt || this.readyT > 10;
    }
    this.cmd.special = go;
  }

  // Emportée par sa ruée : garde le cap sur sa cible, ou tout droit.
  _ride() {
    const a = this.actor;
    const e = this.enemy;
    if (e && e.alive && this.mode === 'attack') this.wantYaw = Math.atan2(-(e.pos.x - a.pos.x), -(e.pos.z - a.pos.z));
    else this.wantYaw = this.cmd.yaw;
  }

  _clearAhead(distance) {
    const a = this.actor;
    const dx = -Math.sin(this.cmd.yaw);
    const dz = -Math.cos(this.cmd.yaw);
    return this.nav.lineClear(a.pos.x, a.pos.z, a.pos.x + dx * distance, a.pos.z + dz * distance, a.pos.y);
  }

  // Alterne activité et hésitation selon `pace`. Renvoie true pendant une hésitation.
  _hesitates(dt) {
    if (this.pace >= 1 || this.cmd.cat) return false;
    if (this.restT > 0) {
      this.restT -= dt;
      return true;
    }
    this.workT -= dt;
    if (this.workT <= 0) {
      const { rng } = this.world;
      this.workT = 2 + rng() * 3;
      this.restT = this.workT * (1 / this.pace - 1) * (0.6 + rng() * 0.8);
    }
    return false;
  }

  // ---- outils ----

  // Oriente le regard pour que le rayon de visée (décalé sur la droite, voir AIM) passe par le point.
  _aimAt(x, y, z) {
    const a = this.actor;
    const dx = x - a.pos.x;
    const dz = z - a.pos.z;
    const d = Math.hypot(dx, dz) || 1e-6;
    this.wantYaw = Math.atan2(-dx, -dz) + Math.asin(Math.min(1, AIM.side / Math.max(d, AIM.side)));
    this.wantPitch = clamp(Math.atan2(y - (a.pos.y + AIM.height), d), -1.3, 1.3);
  }

  // Un bot qui veut avancer mais ne bouge plus saute et change de plan.
  _unstick(dt) {
    const a = this.actor;
    const c = this.cmd;
    if (this.jumpT > 0) {
      this.jumpT -= dt;
      c.jump = true;
    }
    const wantsToMove = Math.hypot(this.walkX, this.walkZ) > 0.3 && !c.cat;
    this.stuckT += dt;
    if (this.stuckT < 1) return;
    const moved = Math.hypot(a.pos.x - this.stuckX, a.pos.z - this.stuckZ);
    if (wantsToMove && moved < 0.3 && this.mode !== 'refill') {
      this.jumpT = 0.1;
      this.goal = null;
      this.path = null;
      this.strafe = -this.strafe;
    }
    this.stuckT = 0;
    this.stuckX = a.pos.x;
    this.stuckZ = a.pos.z;
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Ramène un angle entre -π et π.
function wrap(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a < -Math.PI) a += Math.PI * 2;
  return a;
}
