// Serveur WebSocket minimal (RFC 6455), sans dépendance : poignée de main, trames de texte, ping, fermeture.
// Suffisant pour le jeu : messages JSON courts, pas de compression.

import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 16 * 1024;        // un client n'a rien de plus long à dire
const MAX_BACKLOG = 2 * 1024 * 1024;  // au-delà, le client ne suit plus : on le déconnecte

// Répond à une demande de passage en WebSocket. Renvoie la connexion, ou null si la demande est invalide.
export function acceptWebSocket(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  return new Connection(socket);
}

export class Connection {
  constructor(socket) {
    this.socket = socket;
    this.open = true;
    this.onMessage = null;   // (texte) => void
    this.onClose = null;
    this.buffer = Buffer.alloc(0);
    this.parts = [];         // morceaux d'un message fragmenté
    this.partsSize = 0;
    socket.on('data', (chunk) => this._data(chunk));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }

  send(text) {
    if (!this.open) return;
    if (this.socket.writableLength > MAX_BACKLOG) { this.close(); return; }
    this.socket.write(frame(0x1, Buffer.from(text)));
  }

  close() {
    if (!this.open) return;
    try { this.socket.write(frame(0x8, Buffer.alloc(0))); } catch {}
    this.socket.destroy();
    this._closed();
  }

  _closed() {
    if (!this.open) return;
    this.open = false;
    this.onClose?.();
  }

  _data(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.open) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let length = b[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (b.length < 4) return;
        length = b.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        // aucun message légitime n'atteint cette taille
        this.close();
        return;
      }
      // un navigateur masque toujours ses trames ; les bits réservés ne servent qu'aux extensions, refusées
      if (!masked || (b[0] & 0x70) !== 0 || length > MAX_MESSAGE) { this.close(); return; }
      if (b.length < offset + 4 + length) return;
      const mask = b.subarray(offset, offset + 4);
      const payload = Buffer.from(b.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buffer = b.subarray(offset + 4 + length);

      if (opcode === 0x8) { this.close(); return; }
      if (opcode === 0x9) { this.socket.write(frame(0xa, payload)); continue; }
      if (opcode === 0xa) continue;
      if (opcode !== 0x0 && opcode !== 0x1) { this.close(); return; }   // pas de binaire
      this.parts.push(payload);
      this.partsSize += payload.length;
      if (this.partsSize > MAX_MESSAGE) { this.close(); return; }
      if (!fin) continue;
      const text = Buffer.concat(this.parts).toString('utf8');
      this.parts = [];
      this.partsSize = 0;
      this.onMessage?.(text);
    }
  }
}

function frame(opcode, payload) {
  const n = payload.length;
  let head;
  if (n < 126) {
    head = Buffer.from([0x80 | opcode, n]);
  } else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}
