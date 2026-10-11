// Jeu à plusieurs : le salon, le match simulé par le serveur, et la copie qu'en tient chaque joueur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, cleanName } from '../server/room.mjs';
import { createGameServer } from '../server/index.mjs';
import { Replica } from '../src/net/replica.js';
import { makeCommand } from '../src/core/command.js';
import { decodeCommand, encodeCommand } from '../src/net/protocol.js';

// Fausse connexion : garde les messages reçus, décodés.
function fakeConn() {
  const conn = { inbox: [], send(text) { conn.inbox.push(JSON.parse(text)); } };
  return conn;
}
const last = (conn, type) => conn.inbox.filter((m) => m.t === type).at(-1);

test('les noms sont nettoyés', () => {
  assert.equal(cleanName('  Inès <b>'), 'Inès b');
  assert.equal(cleanName('<script>'), 'script');
  assert.equal(cleanName(''), 'Joueuse');
  assert.equal(cleanName(42), 'Joueuse');
  assert.equal(cleanName('x'.repeat(50)).length, 14);
});

test('une commande mal formée est refusée', () => {
  const cmd = makeCommand();
  assert.equal(decodeCommand([0, 0, NaN, 0, 0], cmd), false);
  assert.equal(decodeCommand([0, 0, 0, 0], cmd), false);
  assert.equal(decodeCommand('rm -rf', cmd), false);
  assert.equal(decodeCommand([5, -5, 1, 9, 1 | 4], cmd), true);
  assert.deepEqual([cmd.move.x, cmd.move.z, cmd.pitch, cmd.fire, cmd.cat, cmd.jump], [1, -1, 1.4, true, false, true]);
  const back = makeCommand();
  decodeCommand(encodeCommand(cmd), back);
  assert.deepEqual(back, cmd);
});

test('salon : équipes réparties, seul l\'hôte règle et lance', () => {
  const room = new Room('TEST', () => {});
  const a = fakeConn();
  const b = fakeConn();
  const pa = room.join(a, 'Ana');
  const pb = room.join(b, 'Bea');
  assert.equal(pa.team, 1);
  assert.equal(pb.team, 2, 'la deuxième joueuse va dans l\'autre équipe');
  assert.notEqual(pa.character, pb.character);
  assert.equal(last(b, 'room').players.length, 2);
  assert.equal(last(b, 'room').you, pb.id);

  room.handle(pb, { t: 'config', map: 'salon' });
  assert.equal(room.map, 'ferme', 'une invitée ne change pas la carte');
  room.handle(pb, { t: 'start' });
  assert.equal(room.state, 'lobby');
  room.handle(pa, { t: 'config', map: 'salon', difficulty: 'facile' });
  assert.equal(room.map, 'salon');
  room.handle(pa, { t: 'config', map: '__proto__', difficulty: 'constructor' });
  assert.equal(room.map, 'salon');
  assert.equal(room.difficulty, 'facile');
  room.handle(pb, { t: 'set', team: 1, character: 'emma' });
  assert.equal(pb.team, 1);
  assert.equal(pb.character, 'emma');
  room.handle(pb, { t: 'set', character: 'toString' });
  assert.equal(pb.character, 'emma');

  room.leave(pa);
  assert.equal(room.hostId, pb.id, 'l\'hôte parti, la suivante le remplace');
});

test('match en réseau : la copie du joueur suit le serveur', () => {
  const room = new Room('TEST', () => {});
  const a = fakeConn();
  const b = fakeConn();
  const pa = room.join(a, 'Ana');
  const pb = room.join(b, 'Bea');
  room.handle(pa, { t: 'set', character: 'ines' });
  room.handle(pb, { t: 'set', character: 'emma' });
  room.start({ manual: true, countdown: 0.1, duration: 30 });
  const world = room.game.world;
  assert.equal(world.actors.length, 8);
  assert.equal(room.game.bots.length, 6);

  const start = last(a, 'start');
  assert.equal(start.actors[start.you].name, 'Ana');
  const replica = new Replica(start);
  const replicaB = new Replica(last(b, 'start'));
  assert.equal(replicaB.player.team, 2);

  // Ana avance en tirant ; ses commandes arrivent au serveur avec 5 pas de retard, les instantanés aussi
  const input = makeCommand();
  input.yaw = replica.player.yaw;
  input.move.z = 1;
  input.fire = true;
  const toServer = [];
  const toClient = [];
  let read = 0;
  let readB = 0;
  let worst = 0;
  for (let tick = 0; tick < 60 * 12; tick++) {
    input.jump = tick % 90 === 0;
    input.cat = tick % 200 > 150;
    toServer.push(replica.command(input));
    if (toServer.length > 5) room.handle(pa, toServer.shift());
    room.step();
    while (read < a.inbox.length) toClient.push(a.inbox[read++]);
    while (toClient.length && (toClient[0].t !== 'snap' || toClient[0].d.k <= room.game.tick - 5)) {
      const msg = toClient.shift();
      if (msg.t === 'snap') replica.receive(msg);
    }
    while (readB < b.inbox.length) {
      const msg = b.inbox[readB++];
      if (msg.t === 'snap') replicaB.receive(msg);
    }
    replica.update(1 / 60);
    replicaB.update(1 / 60);
    // la prédiction reste proche de la position que le serveur atteindra
    if (tick > 60) {
      const o = replica.player.offset;
      worst = Math.max(worst, Math.hypot(o.x, o.y, o.z));
    }
  }
  assert.ok(pa.actor.turf > 20, `Ana a peint ${pa.actor.turf.toFixed(0)} m² sur le serveur`);
  assert.ok(worst < 1.5, `écart de prédiction ${worst.toFixed(2)} m`);

  // la peinture de Bea, à jour, est identique à celle du serveur ; celle d'Ana n'a que son retard
  assert.deepEqual(replicaB.world.paint.counts, world.paint.counts);
  assert.ok(Buffer.from(replicaB.world.paint.grid).equals(Buffer.from(world.paint.grid)), 'grilles de peinture identiques');
  const cov = world.paint.coverage();
  const covA = replica.world.paint.coverage();
  assert.ok(Math.abs(cov[1] - covA[1]) < 0.02);

  // les autres actrices sont affichées près de leur vraie position, avec un léger retard
  for (let i = 0; i < 8; i++) {
    if (i === replicaB.playerIndex) continue;
    const real = world.actors[i];
    const shown = replicaB.world.actors[i];
    assert.equal(shown.alive, real.alive);
    if (real.alive) assert.ok(Math.hypot(real.pos.x - shown.pos.x, real.pos.z - shown.pos.z) < 3.5, `actrice ${i}`);
  }

  // une joueuse qui part est remplacée par un bot, et le match va à son terme
  room.leave(pb);
  assert.equal(room.game.bots.length, 7);
  let ended = null;
  replica.world.events.on('match:fin', (r) => { ended = r; });
  for (let tick = 0; tick < 60 * 30 && room.game; tick++) {
    room.step();
    while (read < a.inbox.length) {
      const msg = a.inbox[read++];
      if (msg.t === 'snap') replica.receive(msg);
    }
  }
  assert.ok(ended, 'la fin du match est annoncée au joueur');
  assert.equal(room.state, 'lobby', 'retour au salon après le résultat');
  assert.equal(last(a, 'room').state, 'lobby');
});

test('serveur : fichiers publics seulement, salons par WebSocket', async () => {
  const { server, rooms } = createGameServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/src/main.js`)).status, 200);
    for (const path of ['/doc/personnage/louisa.jpg', '/server/index.mjs', '/tests/net.test.js', '/package.json', '/src/../doc/personnage/louisa.jpg', '/%2e%2e/%2e%2e/etc/passwd', '/.claude/settings.json']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }

    const open = async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/jeu`);
      const inbox = [];
      const waiters = [];
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        inbox.push(msg);
        for (const w of [...waiters]) if (w.test(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
      };
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
      const next = (test) => new Promise((resolve) => waiters.push({ test, resolve }));
      return { ws, inbox, next, send: (m) => ws.send(JSON.stringify(m)) };
    };
    const a = await open();
    const b = await open();
    a.send({ t: 'create', name: 'Ana' });
    const room = await a.next((m) => m.t === 'room');
    assert.match(room.code, /^[A-Z]{4}$/);
    b.send({ t: 'join', code: 'ZZZZZ', name: 'Bea' });
    assert.equal((await b.next((m) => m.t === 'error')).t, 'error');
    b.send({ t: 'join', code: room.code.toLowerCase(), name: 'Bea' });
    assert.equal((await b.next((m) => m.t === 'room')).players.length, 2);

    a.send({ t: 'start' });
    const start = await b.next((m) => m.t === 'start');
    assert.equal(start.actors.length, 8);
    const snap = await b.next((m) => m.t === 'snap');
    assert.equal(snap.d.a.length, 8);
    assert.ok(snap.self.ack >= 0);

    // un message démesuré ferme la connexion sans gêner les autres
    const closed = new Promise((r) => { b.ws.onclose = r; });
    const alone = a.next((m) => m.t === 'room' && m.players.length === 1);
    b.ws.send('x'.repeat(40000));
    await closed;
    await alone;
    a.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(rooms.size, 0, 'un salon vide disparaît');
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
