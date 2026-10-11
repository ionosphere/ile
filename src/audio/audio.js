// Sons du jeu, entièrement fabriqués par le navigateur (Web Audio) : aucun fichier à télécharger.
// Chaque son est une petite recette d'oscillateurs et de bruit filtré.

const MIN_GAP = 0.035;   // secondes entre deux déclenchements du même son

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.last = new Map();
  }

  // Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur : à appeler sur un clic.
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const length = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, length, length);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // gain : 0 à 1, par exemple selon la distance.
  play(name, gain = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || gain <= 0.02 || this.volume <= 0) return;
    const t = ctx.currentTime;
    if (t - (this.last.get(name) ?? -1) < MIN_GAP) return;
    this.last.set(name, t);
    SOUNDS[name]?.(this, t, gain);
  }

  // Une note : forme d'onde, fréquence de départ et d'arrivée, durée.
  tone(t, { type = 'sine', from, to = from, dur, gain, attack = 0.005, vibrato = 0, vibratoDepth = 0 }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = vibrato;
      depth.gain.value = vibratoDepth;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Un souffle de bruit filtré.
  burst(t, { filter = 'bandpass', freq, to = freq, q = 1, dur, gain }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to !== freq) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}

const SOUNDS = {
  tir(a, t, g) {
    a.burst(t, { freq: 1500, to: 500, q: 1.2, dur: 0.07, gain: 0.5 * g });
    a.tone(t, { type: 'triangle', from: 520, to: 240, dur: 0.06, gain: 0.18 * g });
  },
  tache(a, t, g) {
    a.burst(t, { filter: 'lowpass', freq: 900, to: 220, dur: 0.11, gain: 0.45 * g });
  },
  trait(a, t, g) {
    a.tone(t, { type: 'sawtooth', from: 1300, to: 180, dur: 0.22, gain: 0.22 * g });
    a.burst(t, { freq: 2600, to: 600, q: 0.8, dur: 0.2, gain: 0.4 * g });
  },
  gerbe(a, t, g) {
    a.burst(t, { filter: 'highpass', freq: 500, to: 1800, dur: 0.18, gain: 0.5 * g });
  },
  esquive(a, t, g) {
    a.burst(t, { freq: 500, to: 2400, q: 0.7, dur: 0.16, gain: 0.35 * g });
  },
  touche(a, t, g) {
    a.tone(t, { type: 'square', from: 170, to: 80, dur: 0.1, gain: 0.3 * g });
  },
  elimination(a, t, g) {
    a.tone(t, { type: 'triangle', from: 660, dur: 0.1, gain: 0.3 * g });
    a.tone(t + 0.09, { type: 'triangle', from: 990, dur: 0.16, gain: 0.3 * g });
  },
  eliminee(a, t, g) {
    a.tone(t, { type: 'triangle', from: 440, to: 300, dur: 0.16, gain: 0.32 * g });
    a.tone(t + 0.14, { type: 'triangle', from: 300, to: 160, dur: 0.3, gain: 0.32 * g });
  },
  capacite(a, t, g) {
    a.tone(t, { type: 'sawtooth', from: 260, to: 1040, dur: 0.38, gain: 0.2 * g });
    a.tone(t + 0.3, { type: 'triangle', from: 1040, dur: 0.25, gain: 0.28 * g });
  },
  chevres(a, t, g) {
    // trois bêlements décalés
    for (let i = 0; i < 3; i++) {
      a.tone(t + i * 0.16, { type: 'sawtooth', from: 430 + i * 45, to: 360 + i * 30, dur: 0.38, gain: 0.16 * g, attack: 0.03, vibrato: 13, vibratoDepth: 28 });
    }
  },
  vache(a, t, g) {
    a.tone(t, { type: 'sawtooth', from: 150, to: 108, dur: 0.7, gain: 0.2 * g, attack: 0.08, vibrato: 5, vibratoDepth: 4 });
  },
  vide(a, t, g) {
    a.tone(t, { type: 'square', from: 110, dur: 0.05, gain: 0.14 * g });
  },
  pret(a, t, g) {
    a.tone(t, { type: 'sine', from: 880, dur: 0.09, gain: 0.22 * g });
    a.tone(t + 0.08, { type: 'sine', from: 1320, dur: 0.16, gain: 0.22 * g });
  },
  decompte(a, t, g) {
    a.tone(t, { type: 'sine', from: 660, dur: 0.12, gain: 0.3 * g });
  },
  depart(a, t, g) {
    a.tone(t, { type: 'sine', from: 1320, dur: 0.4, gain: 0.32 * g });
  },
  fin(a, t, g) {
    a.tone(t, { type: 'sine', from: 1900, to: 1750, dur: 0.75, gain: 0.26 * g, attack: 0.02, vibrato: 22, vibratoDepth: 60 });
  },
  clic(a, t, g) {
    a.tone(t, { type: 'triangle', from: 560, dur: 0.05, gain: 0.2 * g });
  },
};
