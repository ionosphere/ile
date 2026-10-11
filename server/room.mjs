// Un salon : des joueurs qui choisissent équipe et héroïne, puis un match simulé ici, sur le serveur.
// Les places laissées libres sont tenues par des bots. Entre deux matchs, on revient au salon.

import { World } from '../src/sim/world.js';
import { Nav } from '../src/ai/nav.js';
import { Bot } from '../src/ai/bot.js';
import { makeCommand } from '../src/core/command.js';
import { STEP, MATCH, DIFFICULTY, ALLY_LEVEL } from '../src/config/tuning.js';
import { CHARACTERS, CHARACTER_IDS } from '../src/config/characters.js';
import { MAPS, MAP_IDS } from '../src/config/maps/index.js';
import {
  SNAPSHOT_EVERY, MAX_PLAYERS, NAME_MAX, EVENTS,
  decodeCommand, encodeActor, encodeSelf, encodeGoat, encodeCow, encodeProjectile, roundSplat,
} from '../src/net/protocol.js';

const QUEUE_MAX = 8;          // commandes en attente par joueur ; au-delà, on rattrape le retard
const RESULTS_SECONDS = 8;    // temps d'affichage du résultat avant le retour au salon
const MAX_CATCH_UP = 5;       // pas de simulation rattrapés d'un coup après un à-coup du serveur

export function cleanName(name) {
  if (typeof name !== 'string') return 'Joueuse';
  // lettres, chiffres, espaces et quelques signes : rien qui puisse perturber un affichage
  const clean = name.normalize('NFC').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, NAME_MAX);
  return clean || 'Joueuse';
}

export class Room {
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.players = [];        // { id, name, team, character, conn, actor, queue, cmd, ack }
    this.nextId = 1;
    this.hostId = 0;
    this.map = MAP_IDS[0];
    this.difficulty = 'normale';
    this.state = 'lobby';     // 'lobby' ou 'playing'
    this.game = null;
    this.timer = null;
    this.touched = Date.now();
  }

  // ---- salon ----

  join(conn, name) {
    if (this.players.length >= MAX_PLAYERS) return null;
    const count = [0, 0, 0];
    for (const p of this.players) count[p.team]++;
    const taken = new Set(this.players.map((p) => p.character));
    const player = {
      id: this.nextId++,
      name: cleanName(name),
      team: count[2] < count[1] ? 2 : 1,
      character: CHARACTER_IDS.find((id) => !taken.has(id)) ?? CHARACTER_IDS[0],
      conn,
      actor: null,
      queue: [],
      cmd: makeCommand(),
      ack: 0,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    this.touched = Date.now();
    this.broadcastRoom();
    return player;
  }

  leave(player) {
    const i = this.players.indexOf(player);
    if (i < 0) return;
    this.players.splice(i, 1);
    // en plein match, un bot reprend l'héroïne de la joueuse partie
    if (this.game && player.actor) this._addBot(player.actor);
    player.actor = null;
    if (!this.players.length) {
      this._stop();
      this.onEmpty(this);
      return;
    }
    if (this.hostId === player.id) this.hostId = this.players[0].id;
    this.broadcastRoom();
  }

  // Message d'un joueur, déjà décodé. Tout y est vérifié : il vient d'Internet.
  handle(player, msg) {
    this.touched = Date.now();
    if (msg.t === 'cmd') {
      if (this.state !== 'playing' || !player.actor || !Number.isInteger(msg.s)) return;
      const cmd = makeCommand();
      if (!decodeCommand(msg.c, cmd)) return;
      player.queue.push({ seq: msg.s, cmd });
      if (player.queue.length > QUEUE_MAX) player.queue.splice(0, player.queue.length - 2);
    } else if (msg.t === 'set') {
      if (this.state !== 'lobby') return;
      if (msg.team === 1 || msg.team === 2) {
        const size = this.players.filter((p) => p.team === msg.team && p !== player).length;
        if (size < MATCH.teamSize) player.team = msg.team;
      }
      if (typeof msg.character === 'string' && Object.hasOwn(CHARACTERS, msg.character)) player.character = msg.character;
      this.broadcastRoom();
    } else if (msg.t === 'config') {
      if (this.state !== 'lobby' || player.id !== this.hostId) return;
      if (typeof msg.map === 'string' && Object.hasOwn(MAPS, msg.map)) this.map = msg.map;
      if (typeof msg.difficulty === 'string' && Object.hasOwn(DIFFICULTY, msg.difficulty)) this.difficulty = msg.difficulty;
      this.broadcastRoom();
    } else if (msg.t === 'start') {
      if (this.state === 'lobby' && player.id === this.hostId) this.start();
    } else if (msg.t === 'ping') {
      if (Number.isFinite(msg.n)) player.conn.send(JSON.stringify({ t: 'pong', n: msg.n }));
    }
  }

  broadcastRoom() {
    const base = {
      t: 'room', code: this.code, host: this.hostId, map: this.map, difficulty: this.difficulty, state: this.state,
      players: this.players.map((p) => ({ id: p.id, name: p.name, team: p.team, character: p.character })),
    };
    for (const p of this.players) p.conn.send(JSON.stringify({ ...base, you: p.id }));
  }

  // ---- match ----

  start(options = {}) {
    const map = MAPS[this.map];
    const world = new World(map, { seed: Date.now() });
    // chaque équipe : ses joueuses d'abord, puis des bots jusqu'à quatre, en variant les héroïnes
    const lineup = [];
    for (const team of [1, 2]) {
      const humans = this.players.filter((p) => p.team === team).slice(0, MATCH.teamSize);
      const used = humans.map((p) => p.character);
      for (const p of humans) lineup.push({ team, character: p.character, player: p });
      for (let i = humans.length; i < MATCH.teamSize; i++) {
        const character = CHARACTER_IDS.find((id) => !used.includes(id)) ?? CHARACTER_IDS[(i + team) % CHARACTER_IDS.length];
        used.push(character);
        lineup.push({ team, character, player: null });
      }
    }
    for (const slot of lineup) slot.actor = world.addActor({ team: slot.team, character: CHARACTERS[slot.character] });
    world.startMatch({ duration: options.duration ?? MATCH.duration, countdown: options.countdown ?? MATCH.countdown });

    const game = {
      world, nav: new Nav(world.level), squads: [null, [], []], bots: [], commands: [],
      tick: 0, splats: [], shots: [], events: [], endT: 0, last: performance.now(), acc: 0,
    };
    this.game = game;
    this.state = 'playing';

    // tout ce qui devra être rejoué chez les joueurs est noté au passage
    const splat = world.paint.splat.bind(world.paint);
    world.paint.splat = (x, y, z, r, team, seed = 0) => {
      const op = roundSplat(x, y, z, r, team, seed);
      game.splats.push(...op);
      return splat(...op);
    };
    world.projectiles.onSpawn = (p) => game.shots.push(encodeProjectile(p, world.actors));
    for (const [name, codec] of Object.entries(EVENTS)) {
      world.events.on(name, (e) => game.events.push([name, ...codec.write(e ?? {}, world.actors)]));
    }

    // des joueuses dans une seule équipe : leurs coéquipières jouent au niveau habituel, comme en solo
    const humanTeams = new Set(this.players.map((p) => p.team));
    for (const p of this.players) {
      p.actor = null;
      p.queue.length = 0;
      p.ack = 0;
      p.cmd = makeCommand();
    }
    for (const slot of lineup) {
      if (slot.player) {
        slot.player.actor = slot.actor;
        slot.player.cmd.yaw = slot.actor.yaw;
      } else {
        const ally = humanTeams.size === 1 && humanTeams.has(slot.team);
        this._addBot(slot.actor, ally ? ALLY_LEVEL : this.difficulty);
      }
    }

    const actors = lineup.map((s) => ({ team: s.team, character: s.character, name: s.player?.name ?? null }));
    const match = { duration: world.match.remaining, countdown: world.match.countdown };
    for (const p of this.players) {
      p.conn.send(JSON.stringify({ t: 'start', map: this.map, actors, match, you: p.actor ? world.actors.indexOf(p.actor) : -1 }));
    }
    this.broadcastRoom();
    if (options.manual) return;   // les tests font avancer le match eux-mêmes
    this.timer = setInterval(() => this._pump(), 1000 / 120);
  }

  _addBot(actor, level = this.difficulty) {
    const g = this.game;
    const bot = new Bot(g.world, actor, g.nav, g.squads[actor.team], DIFFICULTY[level]);
    g.squads[actor.team].push(bot);
    g.bots.push(bot);
  }

  // Appelé souvent : fait avancer la simulation du temps réellement écoulé.
  _pump() {
    const g = this.game;
    if (!g) return;
    const now = performance.now();
    g.acc = Math.min(g.acc + (now - g.last) / 1000, STEP * MAX_CATCH_UP);
    g.last = now;
    while (g.acc >= STEP && this.game) {
      g.acc -= STEP;
      this.step();
    }
  }

  // Un pas de simulation, et un instantané de temps en temps.
  step() {
    const g = this.game;
    const { world } = g;
    const commands = g.commands;
    for (let i = 0; i < world.actors.length; i++) commands[i] = undefined;
    for (const bot of g.bots) commands[world.actors.indexOf(bot.actor)] = bot.command(STEP);
    for (const p of this.players) {
      if (!p.actor) continue;
      // une commande par pas ; s'il n'en est pas arrivé, la dernière reste valable
      const next = p.queue.shift();
      if (next) {
        p.cmd = next.cmd;
        p.ack = next.seq;
      }
      commands[world.actors.indexOf(p.actor)] = p.cmd;
    }
    world.step(commands, STEP);
    g.tick++;
    if (g.tick % SNAPSHOT_EVERY === 0) this._snapshot();

    if (world.match.phase === 'ended') {
      g.endT += STEP;
      if (g.endT >= RESULTS_SECONDS) this._stop();
    }
  }

  _snapshot() {
    const g = this.game;
    const { world } = g;
    const m = world.match;
    const shared = JSON.stringify({
      k: g.tick,
      m: [m.phase, Math.round(m.countdown * 100) / 100, Math.round(m.remaining * 100) / 100],
      a: world.actors.map(encodeActor),
      g: world.goats.list.map((goat) => encodeGoat(goat, world.actors)),
      c: world.cows.list.map(encodeCow),
      p: g.splats,
      s: g.shots,
      e: g.events,
    });
    g.splats = [];
    g.shots = [];
    g.events = [];
    const head = `{"t":"snap","d":${shared}`;
    for (const p of this.players) {
      p.conn.send(p.actor ? `${head},"self":${JSON.stringify(encodeSelf(p.actor, p.ack))}}` : `${head}}`);
    }
  }

  _stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (!this.game) return;
    this.game = null;
    this.state = 'lobby';
    for (const p of this.players) p.actor = null;
    if (this.players.length) this.broadcastRoom();
  }
}
