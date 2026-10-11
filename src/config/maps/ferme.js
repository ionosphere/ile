// La ferme : une cour d'élevage, d'après les photos de référence.
// Cour en béton autour d'un bassin creusé, stabulations ouvertes, grange en pierre, puits,
// abri à chèvres, remorque et grand chêne. Les toits ne s'atteignent qu'en grimpant.

import { box, mirror, mirrorCows, spawns, surfaces } from './util.js';

const C = surfaces({
  beton: ['#a9a295', 'beton'],
  herbe: ['#7fb04f', 'herbe'],
  pierre: ['#a39d8f', 'pierre'],
  muret: ['#a09a8c', 'pierre'],
  bois: ['#a8743f', 'bois'],
  tole: ['#8795a6', 'tole'],
  bardage: ['#5f7fa8', 'tole'],
  poteau: ['#8a4b33', 'bois'],
  foin: ['#e3c25a', 'foin'],
  parpaing: ['#c9c5bd', 'parpaing'],
  tuile: ['#c96a45', 'tuile'],
  rouille: ['#b5553a', 'metal'],
  bache: ['#4a5560', 'bache'],
  marche: ['#d9dde0', 'lisse'],
  tronc: ['#6b4a32', 'ecorce'],
  feuillage: ['#4f8a3c', 'feuillage'],
});

// Toit à deux pentes fait de gradins de 30 cm : on peut y monter, le peindre et s'y tenir,
// ce qu'un toit en biais purement décoratif ne permettrait pas. `ridge` : axe du faîtage ('x' ou 'z').
function roof(x0, x1, z0, z1, y, tiers, color, ridge = 'x') {
  const out = [];
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const dx = ridge === 'x' ? 0 : ((x1 - x0) / 2) * t;
    const dz = ridge === 'x' ? ((z1 - z0) / 2) * t : 0;
    out.push(box(x0 + dx, x1 - dx, y + i * 0.3, y + (i + 1) * 0.3, z0 + dz, z1 - dz, color));
  }
  return out;
}

// Poteau carré de 50 cm, de la hauteur du toit qu'il porte.
const post = (x, z, h) => box(x, x + 0.5, 0, h, z, z + 0.5, C.poteau);

const half = [
  // sol : herbe côté grange, béton ailleurs, ouvert au centre pour le bassin
  box(-32, -10, -2.2, 0, 5, 38, C.herbe),
  box(-10, 32, -2.2, 0, 5, 38, C.beton),
  box(7, 32, -2.2, 0, -5, 5, C.beton),

  // bassin : trois marches à chaque bout, parois droites sur les longueurs
  box(6, 7, -2.2, -0.3, -5, 5, C.marche),
  box(5, 6, -2.2, -0.6, -5, 5, C.marche),
  box(4, 5, -2.2, -0.9, -5, 5, C.marche),

  // muret d'enceinte
  box(-32, 32, 0, 2.4, 37.4, 38, C.muret),
  box(31.4, 32, 0, 2.4, 0, 37.4, C.muret),
  box(-32, -31.4, 0, 2.4, 0, 37.4, C.muret),

  // stabulation ouverte : toit de tôle sur poteaux, bardage au fond, cornadis au milieu
  box(13, 29, 4, 4.3, 9, 25, C.tole),
  post(13, 9, 4), post(13, 16.75, 4), post(13, 24.5, 4),
  post(20.75, 9, 4), post(20.75, 16.75, 4), post(20.75, 24.5, 4),
  box(28.6, 29, 0, 4, 9, 25, C.bardage),
  box(14, 19.5, 0, 1.1, 16.8, 17.2, C.bois),
  box(22, 28.6, 0, 1.1, 16.8, 17.2, C.bois),
  box(24, 25.4, 0, 1.2, 20, 21.4, C.foin),
  box(25.4, 26.8, 0, 1.2, 20, 21.4, C.foin),
  box(24.7, 26.1, 1.2, 2.4, 20, 21.4, C.foin),
  ...roof(13, 29, 10.5, 23.5, 4.3, 3, C.tole),

  // grange en pierre et son appentis
  box(-29, -17, 0, 6, 14, 26, C.pierre),
  ...roof(-29.4, -16.6, 13.6, 26.4, 6, 5, C.tuile),
  box(-17, -13, 0, 2.6, 17, 24, C.bois),
  // toit de l'appentis : une seule pente, adossée à la grange
  box(-17, -12.7, 2.6, 2.75, 16.7, 24.3, C.tuile),
  box(-17, -14.4, 2.75, 3.05, 16.7, 24.3, C.tuile),
  box(-17, -15.7, 3.05, 3.35, 16.7, 24.3, C.tuile),

  // puits, sous son petit toit
  box(-9, -7.4, 0, 1, 11, 12.6, C.pierre),
  box(-9, -8.85, 1, 2.1, 11, 11.15, C.bois),
  box(-7.55, -7.4, 1, 2.1, 11, 11.15, C.bois),
  box(-9, -8.85, 1, 2.1, 12.45, 12.6, C.bois),
  box(-7.55, -7.4, 1, 2.1, 12.45, 12.6, C.bois),
  ...roof(-9.3, -7.1, 10.7, 12.9, 2.1, 2, C.tuile),

  // abri à chèvres, devant la base
  box(3, 8, 0, 2.2, 29.6, 30, C.parpaing),
  box(3, 3.4, 0, 2.2, 27, 29.6, C.parpaing),
  box(7.6, 8, 0, 2.2, 27, 29.6, C.parpaing),
  box(2.6, 8.4, 2.2, 2.5, 26.6, 30.4, C.tuile),
  box(2.6, 8.4, 2.5, 2.8, 27.7, 29.3, C.tuile),

  // remorque
  box(-6, -2, 0, 1.6, 19, 21.2, C.rouille),

  // grand chêne
  box(-22.6, -21.4, 0, 5, 8, 9.2, C.tronc),
  box(-25, -19, 5, 7.5, 5.6, 11.6, C.feuillage),

  // botte de foin près du bassin
  box(9, 10.4, 0, 1.2, 6, 7.4, C.foin),
];

export const FERME = {
  id: 'ferme',
  name: 'La ferme',
  blurb: 'Cour, stabulations et bassin',
  // ciel d'été en fin de matinée
  theme: {
    sky: ['#3f86d6', '#c3def4'], fog: [110, 300], exposure: 0.92, clouds: 1,
    hemi: 0.95, sun: 2.4, sunColor: '#fff0d2', sunDir: [0.55, 0.78, 0.38],
  },
  decor: 'ferme',
  spawns: spawns(34, [0, -3, 3, -6]),
  boxes: [
    ...mirror(half),
    box(-7, 7, -2.2, -1.2, -5, 5, C.bache),   // fond du bassin
  ],
  // trajets des vaches : [x, z] au niveau du sol, parcourus en boucle
  cows: [
    { path: [[-11.5, 9], [11.5, 9], [11.5, -9], [-11.5, -9]] },
    ...mirrorCows([{ path: [[-12, 15], [10, 15]] }]),
  ],
  signs: [],
};
