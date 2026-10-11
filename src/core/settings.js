// Réglages du joueur, gardés d'une visite à l'autre quand le navigateur le permet.

const KEY = 'ile.reglages';

const DEFAULTS = {
  volume: 0.7,          // 0 à 1
  mouse: 1,             // multiplicateur de sensibilité de la souris
  touch: 1,             // multiplicateur de sensibilité du tactile
  quality: 'auto',      // 'auto', 'basse', 'moyenne' ou 'haute'
  difficulty: 'normale', // niveau des bots adverses : 'facile', 'normale' ou 'difficile'
  autoFire: true,       // tir automatique au tactile
  colorblind: false,    // palette jaune / bleu
  tutorialSeen: false,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      for (const k of Object.keys(DEFAULTS)) {
        if (typeof saved[k] === typeof DEFAULTS[k]) this.values[k] = saved[k];
      }
    } catch {}
    this.listeners = [];
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch {}
    for (const fn of this.listeners) fn(key, value);
  }

  // fn(key, value) est appelé à chaque changement.
  onChange(fn) {
    this.listeners.push(fn);
  }
}
