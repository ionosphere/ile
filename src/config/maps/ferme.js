// La ferme, d'après sa vue aérienne : une mare bordée de béton au milieu d'une bande d'herbe ; de part et
// d'autre, une cour avec une longue stabulation ouverte au toit de tôle rouillée, prolongée en équerre par
// une aile en pierre couverte de tuiles ; en face, l'atelier et le hangar de la recyclerie, ouvert sur la
// cour ; un potager en planches, un chemin de terre, des piles de bois, un grand chêne.
// La carte est symétrique par demi-tour : chaque camp a la même cour. Les toits ne s'atteignent qu'en grimpant.

import { box, mirror, mirrorCows, mirrorSigns, spawns, surfaces } from './util.js';

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
  haie: ['#3f7a36', 'feuillage'],
  terre: ['#b59c76', 'terre'],
  salade: ['#6f9c4a', 'culture'],
  poireau: ['#8fb85a', 'culture'],
  labour: ['#80603f', 'culture'],
  toleRouille: ['#8c6450', 'tole'],
  planche: ['#c99c62', 'bois'],
  eau: ['#4c7d74', 'eau'],
  bleu: ['#3f6fa8', 'lisse'],
  ocre: ['#c98a3a', 'lisse'],
  blanc: ['#e6e2d8', 'lisse'],
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
  // sol : potager en planches et chemin de terre à l'ouest, herbe autour de la mare, béton de la cour
  box(-32, -28, -2.2, 0, 5, 15, C.salade),
  box(-28, -24, -2.2, 0, 5, 15, C.labour),
  box(-24, -20, -2.2, 0, 5, 15, C.poireau),
  box(-20, -16, -2.2, 0, 5, 15, C.salade),
  box(-16, -10, -2.2, 0, 5, 15, C.terre),
  box(-32, -10, -2.2, 0, 15, 38, C.terre),
  box(-10, 32, -2.2, 0, 5, 12, C.herbe),
  box(-10, 32, -2.2, 0, 12, 38, C.beton),
  box(7, 32, -2.2, 0, -5, 5, C.herbe),

  // mare : trois marches à chaque bout, bords droits sur les longueurs
  box(6, 7, -2.2, -0.3, -5, 5, C.marche),
  box(5, 6, -2.2, -0.6, -5, 5, C.marche),
  box(4, 5, -2.2, -0.9, -5, 5, C.marche),

  // enceinte : muret de pierre derrière la base, haies sur les côtés
  box(-32, 32, 0, 2.4, 37.4, 38, C.muret),
  box(31.4, 32, 0, 2.4, 0, 37.4, C.haie),
  box(-32, -31.4, 0, 2.4, 0, 37.4, C.haie),

  // longue stabulation ouverte : toit de tôle rouillée sur poteaux, bardage au fond, cornadis, foin
  box(19, 29.4, 4, 4.3, 13, 26, C.toleRouille),
  post(19, 13, 4), post(19, 19.25, 4), post(19, 25.5, 4),
  post(24, 13, 4), post(24, 19.25, 4),
  box(29, 29.4, 0, 4, 13, 26, C.bardage),
  box(23.8, 24.2, 0, 1.1, 14.5, 18.5, C.bois),
  box(23.8, 24.2, 0, 1.1, 20.5, 25, C.bois),
  box(26, 27.4, 0, 1.2, 15, 16.4, C.foin),
  box(27.4, 28.8, 0, 1.2, 15, 16.4, C.foin),
  box(26.7, 28.1, 1.2, 2.4, 15, 16.4, C.foin),
  ...roof(19, 29.4, 13, 26, 4.3, 3, C.toleRouille, 'z'),

  // aile en pierre, en équerre au bout de la stabulation, sous son toit de tuiles
  box(11, 29.4, 0, 4.6, 26, 32, C.pierre),
  ...roof(10.6, 29.8, 25.6, 32.4, 4.6, 4, C.tuile),

  // atelier en parpaings, à l'ouest de la cour
  box(-30.5, -24, 0, 4.8, 17, 25, C.parpaing),
  ...roof(-30.9, -23.6, 16.6, 25.4, 4.8, 3, C.toleRouille, 'z'),

  // hangar de la recyclerie : ouvert sur la cour, étagères d'objets à l'intérieur
  box(-31, -15, 3.6, 3.9, 28, 36.4, C.tole),
  box(-31, -15, 3, 3.6, 28, 28.3, C.bardage),
  post(-31, 28, 3), post(-23.25, 28, 3), post(-15.5, 28, 3),
  box(-31, -15, 0, 3.6, 36, 36.4, C.bardage),
  box(-31, -30.6, 0, 3.6, 28.3, 36, C.bardage),
  box(-29, -25, 0, 1.9, 34.8, 35.6, C.planche),
  box(-22.5, -17.5, 0, 1.9, 34.8, 35.6, C.planche),
  box(-28.5, -27.3, 0, 1.1, 31, 32.2, C.bleu),
  box(-27.3, -26.1, 0, 0.8, 31, 32.2, C.ocre),
  box(-21.5, -20.1, 0, 1.3, 31.2, 32.2, C.blanc),
  box(-20.1, -18.9, 0, 0.9, 31.2, 32.2, C.bleu),
  ...roof(-31, -15, 28, 36.4, 3.9, 2, C.tole),

  // puits, sous son petit toit, dans l'herbe
  box(-9, -7.4, 0, 1, 7, 8.6, C.pierre),
  box(-9, -8.85, 1, 2.1, 7, 7.15, C.bois),
  box(-7.55, -7.4, 1, 2.1, 7, 7.15, C.bois),
  box(-9, -8.85, 1, 2.1, 8.45, 8.6, C.bois),
  box(-7.55, -7.4, 1, 2.1, 8.45, 8.6, C.bois),
  ...roof(-9.3, -7.1, 6.7, 8.9, 2.1, 2, C.tuile),

  // muret bas du potager, avec un passage
  box(-16.4, -16, 0, 0.9, 5, 9, C.muret),
  box(-16.4, -16, 0, 0.9, 11.5, 15, C.muret),

  // abri à chèvres, devant la base
  box(2, 7, 0, 2.2, 29.6, 30, C.parpaing),
  box(2, 2.4, 0, 2.2, 27, 29.6, C.parpaing),
  box(6.6, 7, 0, 2.2, 27, 29.6, C.parpaing),
  box(1.6, 7.4, 2.2, 2.5, 26.6, 30.4, C.tuile),
  box(1.6, 7.4, 2.5, 2.8, 27.7, 29.3, C.tuile),

  // piles de planches dans la cour, et barrière de contention
  box(-7, -2, 0, 0.9, 21.5, 23.3, C.planche),
  box(-6.6, -3, 0.9, 1.5, 21.7, 23.1, C.planche),
  box(8, 13, 0, 0.7, 16.5, 18, C.planche),
  box(2, 9, 0, 1.1, 20.8, 21.2, C.bois),

  // remorque, sur le chemin
  box(-14, -10, 0, 1.6, 30, 32.2, C.rouille),

  // grand chêne, au bord de la mare
  box(14.4, 15.6, 0, 5, 7.6, 8.8, C.tronc),
  box(12, 18, 5, 7.5, 5.2, 11.2, C.feuillage),

  // botte de foin près de la mare
  box(9, 10.4, 0, 1.2, 6, 7.4, C.foin),
];

export const FERME = {
  id: 'ferme',
  name: 'La ferme',
  blurb: 'Cours, stabulations, recyclerie et mare',
  // soir d'été : soleil bas et doré, longues ombres
  theme: {
    sky: ['#4f88cf', '#f1dcb8'], fog: [120, 320], exposure: 0.95, clouds: 0.8,
    hemi: 1.0, sun: 2.6, sunColor: '#ffd9a3', sunDir: [0.62, 0.5, 0.34],
  },
  decor: 'ferme',
  spawns: spawns(34, [0, -3, 3, -6]),
  boxes: [
    ...mirror(half),
    box(-7, 7, -2.2, -1.2, -5, 5, C.eau),   // fond de la mare
  ],
  // trajets des vaches : [x, z] au niveau du sol, parcourus en boucle
  cows: [
    { path: [[-11.5, 9.6], [11.5, 9.6], [11.5, -9.6], [-11.5, -9.6]] },
    ...mirrorCows([{ path: [[-8, 14.5], [16, 14.5]] }]),
  ],
  signs: mirrorSigns([
    { text: 'RECYCLERIE', x: -23, y: 3.3, z: 27.97, yaw: Math.PI, width: 7, height: 0.5, color: '#ffffff', background: '#3f7a36' },
  ]),
};
