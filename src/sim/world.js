// L'état complet d'une partie. Aucune dépendance au navigateur : tourne aussi dans Node pour les tests.

import { Events } from '../core/events.js';
import { IDLE } from '../core/command.js';
import { Level } from './level.js';
import { Paint } from './paint.js';
import { Actor } from './actor.js';
import { Projectiles } from './projectiles.js';
import { Match } from './match.js';
import { Cows } from './cows.js';
import { Goats } from './goats.js';
import { NEUTRAL } from '../config/characters.js';
import { WEAPONS } from '../config/weapons.js';

export class World {
  constructor(map, { seed = 1, paint } = {}) {
    this.map = map;
    this.events = new Events();
    this.rng = mulberry32(seed);
    this.level = new Level(map);
    this.paint = new Paint(this.level, paint);
    this.projectiles = new Projectiles(this);
    this.cows = new Cows(this, map.cows ?? []);
    this.goats = new Goats(this);
    this.actors = [];
    this.time = 0;
    this.match = null;      // sans match, la simulation tourne librement
    for (const s of map.prepaint ?? []) this.paint.splat(s.p[0], s.p[1], s.p[2], s.r, s.team, s.p[0] + s.p[2]);
  }

  // Par défaut, l'acteur prend la première place de départ libre de son équipe.
  // `weapon` ne sert qu'à imposer une autre arme que celle du personnage.
  addActor({ team, character = NEUTRAL, weapon = WEAPONS[character.weapon], spawn }) {
    const taken = this.actors.filter((a) => a.team === team).length;
    const actor = new Actor(this, { team, character, weapon, spawn: spawn ?? this.map.spawns[team][taken] });
    this.actors.push(actor);
    return actor;
  }

  startMatch(options) {
    this.match = new Match(this, options);
    return this.match;
  }

  // commands[i] pilote actors[i] ; une commande absente vaut « ne rien faire ».
  step(commands, dt) {
    if (this.match) {
      this.match.step(dt);
      if (this.match.phase !== 'playing') {
        for (let i = 0; i < this.actors.length; i++) this.actors[i].look(commands[i] ?? IDLE);
        return;
      }
    }
    for (let i = 0; i < this.actors.length; i++) this.actors[i].step(commands[i] ?? IDLE, dt);
    this.projectiles.step(dt);
    this.cows.step(dt);
    this.goats.step(dt);
    this.time += dt;
  }
}

// Générateur pseudo-aléatoire à graine, pour des parties reproductibles.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
