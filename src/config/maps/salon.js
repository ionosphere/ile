// Le salon de l'agriculture : un hall d'exposition, d'après les photos de référence.
// Scène centrale coupée par un grand écran, rangées de cubes-sièges, deux stands et des mange-debout.
// Seules deux marques réelles y figurent, à la demande du porteur du projet : Ekylibre et La Ferme Digitale.

import { box, mirror, mirrorCows, mirrorSigns, spawns, surfaces } from './util.js';

const C = surfaces({
  parquet: ['#c9a877', 'parquet'],
  cloison: ['#2b303b', 'cloison'],
  scene: ['#3a3f4a', 'moquette'],
  ecran: ['#16b8a6', 'ecran'],
  cubeSombre: ['#1d2430', 'tissu'],
  cubeClair: ['#a8d5ba', 'tissu'],
  blanc: ['#f4f1ea', 'cloison'],
  bois: ['#a67c4e', 'bois'],
  comptoir: ['#d8b98a', 'bois'],
  table: ['#ece6da', 'lisse'],
});

// Trois rangées de cubes-sièges de 90 cm devant la scène.
const cubes = [];
[7, 9.6, 12.2].forEach((z, row) => {
  [-6, -3.6, -1.2, 1.2, 3.6, 6].forEach((x, col) => {
    cubes.push(box(x - 0.45, x + 0.45, 0, 0.9, z, z + 0.9, (row + col) % 2 ? C.cubeClair : C.cubeSombre));
  });
});

const table = (x, z) => box(x - 0.4, x + 0.4, 0, 1.1, z - 0.4, z + 0.4, C.table);

const half = [
  // cloisons du hall
  box(-30, 30, 0, 5, 25.4, 26, C.cloison),
  box(29.4, 30, 0, 5, 0, 25.4, C.cloison),
  box(-30, -29.4, 0, 5, 0, 25.4, C.cloison),

  // marche de la scène
  box(-8, 8, 0, 0.3, 3, 4, C.scene),

  ...cubes,

  // stand Ekylibre : cloison de fond, retour et comptoir
  box(14, 26, 0, 3.5, 19, 19.3, C.blanc),
  box(25.7, 26, 0, 3.5, 13, 19, C.blanc),
  box(17, 20, 0, 1.1, 14, 15, C.comptoir),
  box(14, 14.3, 0, 3.5, 13, 13.3, C.blanc),          // fronton sur deux poteaux
  box(14, 26, 2.9, 3.5, 13, 13.3, C.blanc),

  // stand La Ferme Digitale : portique en bois et cloison de fond
  box(-25, -24, 0, 5, 9, 10, C.bois),
  box(-12, -11, 0, 5, 9, 10, C.bois),
  box(-25, -11, 4, 5, 9, 10, C.bois),
  box(-27, -10, 0, 3.5, 20, 20.3, C.bois),
  box(-27, -26.7, 0, 3.5, 14, 20, C.bois),

  // mange-debout
  table(9, 18.5), table(-5, 18.5), table(22, 7), table(-18, 14.5), table(12, 9),
];

export const SALON = {
  id: 'salon',
  name: "Le salon de l'agriculture",
  blurb: 'Scène, cubes et stands',
  // hall éclairé par des projecteurs au plafond
  theme: {
    sky: ['#343b48', '#566070'], fog: null, exposure: 1.05, indoor: true, clouds: 0,
    hemi: 1.25, sun: 2.3, sunColor: '#fff6e8', sunDir: [0.25, 1, 0.18],
  },
  decor: 'salon',
  spawns: spawns(22.5, [0, -3, 3, -6]),
  boxes: [
    box(-30, 30, -1, 0, -26, 26, C.parquet, { sides: false }),
    ...mirror(half),
    box(-8, 8, 0, 0.6, -3, 3, C.scene),          // scène
    box(-5, 5, 0.6, 5, -0.3, 0.3, C.ecran),      // grand écran
  ],
  cows: mirrorCows([{ path: [[-9, 15.6], [11, 15.6]] }]),
  // enseignes : texte plaqué sur un mur ; yaw 0 regarde vers +z, π vers -z
  signs: mirrorSigns([
    { text: 'Ekylibre', x: 20, y: 2.5, z: 18.97, yaw: Math.PI, width: 6, height: 1.5, color: '#1d2430', background: '#ffffff' },
    { text: 'Ekylibre', x: 20, y: 3.2, z: 12.97, yaw: Math.PI, width: 5, height: 0.56, color: '#1d2430', background: '#ffffff' },
    { text: 'Ekylibre', x: 20, y: 3.2, z: 13.33, yaw: 0, width: 5, height: 0.56, color: '#1d2430', background: '#ffffff' },
    { text: 'LA FERME DIGITALE', x: -18, y: 4.5, z: 8.97, yaw: Math.PI, width: 12, height: 0.8, color: '#ffffff', background: '#7a5a3a' },
    { text: 'LA FERME DIGITALE', x: -18, y: 4.5, z: 10.03, yaw: 0, width: 12, height: 0.8, color: '#ffffff', background: '#7a5a3a' },
  ]),
};
