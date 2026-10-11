// Serveur du jeu : distribue les fichiers du site et héberge les salons de jeu à plusieurs.
// Lancement : node server/index.mjs   (variable PORT pour changer de port, 8080 par défaut)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptWebSocket } from './ws.mjs';
import { Room } from './room.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Seuls ces fichiers et dossiers sont distribués : ni les photos de référence (doc/), ni les tests, ni le serveur.
const PUBLIC = ['index.html', 'styles', 'src', 'vendor'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const MAX_ROOMS = 100;
const MAX_CONNECTIONS = 400;
const MAX_PER_ADDRESS = 12;
const MESSAGES_PER_SECOND = 150;         // une commande par pas de jeu (60), avec de la marge
const IDLE_ROOM_MS = 30 * 60 * 1000;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function createGameServer() {
  const rooms = new Map();
  const perAddress = new Map();
  let connections = 0;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/sante') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ salons: rooms.size, connexions: connections }));
        return;
      }
      let path = decodeURIComponent(url.pathname);
      if (path === '/') path = '/index.html';
      const rel = normalize(path).replace(/^[/\\]+/, '');
      const first = rel.split(sep)[0];
      if (rel.includes('..') || rel.includes('\0') || !PUBLIC.includes(first)) {
        res.writeHead(404).end('Introuvable');
        return;
      }
      const file = join(ROOT, rel);
      if (!(await stat(file)).isFile()) throw new Error('pas un fichier');
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': first === 'vendor' ? 'public, max-age=86400' : 'no-cache',
        'x-content-type-options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404).end('Introuvable');
    }
  });

  const newCode = () => {
    for (let tries = 0; tries < 50; tries++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
      if (!rooms.has(code)) return code;
    }
    return null;
  };

  server.on('upgrade', (req, socket) => {
    const address = req.headers['x-forwarded-for']?.split(',')[0].trim() || socket.remoteAddress || '?';
    // une page d'un autre site n'a pas à ouvrir de salon ici
    const origin = req.headers.origin;
    const sameSite = !origin || (() => { try { return new URL(origin).host === req.headers.host; } catch { return false; } })();
    if (req.url !== '/jeu' || !sameSite || connections >= MAX_CONNECTIONS || (perAddress.get(address) ?? 0) >= MAX_PER_ADDRESS) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const conn = acceptWebSocket(req, socket);
    if (!conn) return;
    connections++;
    perAddress.set(address, (perAddress.get(address) ?? 0) + 1);

    let room = null;
    let player = null;
    let budget = MESSAGES_PER_SECOND;
    let budgetAt = Date.now();
    const error = (message) => conn.send(JSON.stringify({ t: 'error', message }));
    const quit = () => {
      if (room && player) room.leave(player);
      room = null;
      player = null;
    };

    conn.onMessage = (text) => {
      // débit limité : un client qui inonde est déconnecté
      const now = Date.now();
      if (now - budgetAt >= 1000) { budget = MESSAGES_PER_SECOND; budgetAt = now; }
      if (--budget < 0) { conn.close(); return; }
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

      if (msg.t === 'create') {
        quit();
        const code = rooms.size < MAX_ROOMS ? newCode() : null;
        if (!code) { error('Trop de salons ouverts pour le moment. Réessaie dans un instant.'); return; }
        room = new Room(code, (r) => rooms.delete(r.code));
        rooms.set(code, room);
        player = room.join(conn, msg.name);
      } else if (msg.t === 'join') {
        quit();
        const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
        const target = rooms.get(code);
        if (!target) { error('Ce salon n\'existe pas. Vérifie le code.'); return; }
        player = target.join(conn, msg.name);
        if (!player) { error('Ce salon est complet.'); return; }
        room = target;
      } else if (msg.t === 'leave') {
        quit();
      } else if (room && player) {
        room.handle(player, msg);
      }
    };
    conn.onClose = () => {
      quit();
      connections--;
      const n = (perAddress.get(address) ?? 1) - 1;
      if (n > 0) perAddress.set(address, n);
      else perAddress.delete(address);
    };
  });

  // les salons oubliés ne restent pas ouverts indéfiniment
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (now - room.touched < IDLE_ROOM_MS) continue;
      for (const p of [...room.players]) p.conn.close();
    }
  }, 60 * 1000);
  sweep.unref();
  server.on('close', () => clearInterval(sweep));

  return { server, rooms };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  const { server } = createGameServer();
  server.listen(port, () => console.log(`ILE : http://127.0.0.1:${port}/  (jeu à plusieurs sur le même port)`));
}
