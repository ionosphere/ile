// Liaison avec le serveur de jeu : une connexion WebSocket et des messages JSON.

export class NetClient {
  constructor() {
    this.ws = null;
    this.onMessage = null;   // (message décodé) => void
    this.onClose = null;     // () => void, quand la liaison est perdue ou refusée
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Ouvre la liaison si nécessaire. La promesse échoue si le serveur de jeu ne répond pas.
  connect() {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/jeu`);
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        resolve();
      };
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        this.onMessage?.(msg);
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        if (opened) this.onClose?.();
        else reject(new Error('serveur de jeu injoignable'));
      };
    });
  }

  send(msg) {
    if (this.connected) this.ws.send(JSON.stringify(msg));
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}
