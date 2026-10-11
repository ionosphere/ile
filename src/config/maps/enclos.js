// Enclos d'essai : petite carte simple qui sert aux tests de déplacement, de peinture et de bots.

const C = {
  herbe: '#8fbf5a',
  bois: '#b9793f',
  grange: '#b5402f',
  foin: '#e3c25a',
  pierre: '#b9b3a6',
  silo: '#cfd6da',
  cloture: '#f1ead9',
};

const box = (x0, x1, y0, y1, z0, z1, color, extra) => ({ min: [x0, y0, z0], max: [x1, y1, z1], color, ...extra });

export const ENCLOS = {
  id: 'enclos',
  name: "Enclos d'essai",
  theme: { sky: ['#3f86d6', '#c3def4'], fog: [110, 300], exposure: 0.92, clouds: 1, hemi: 0.62, sun: 2.5, sunColor: '#fff0d2', sunDir: [0.55, 0.78, 0.38] },
  // spawns[équipe][place] ; la place 0 de l'équipe 1 est celle du joueur
  spawns: [
    null,
    [0, -3, 3, -6].map((x) => ({ pos: [x, 0, 22], yaw: 0 })),
    [0, 3, -3, 6].map((x) => ({ pos: [x, 0, -22], yaw: Math.PI })),
  ],
  boxes: [
    box(-30, 30, -1, 0, -30, 30, C.herbe, { sides: false }),

    // clôture d'enceinte
    box(-30, 30, 0, 2.4, -30, -29.4, C.cloture),
    box(-30, 30, 0, 2.4, 29.4, 30, C.cloture),
    box(-30, -29.4, 0, 2.4, -29.4, 29.4, C.cloture),
    box(29.4, 30, 0, 2.4, -29.4, 29.4, C.cloture),

    // grange
    box(-18, -8, 0, 5, -6, 4, C.grange),

    // mur d'escalade face au point de départ
    box(-4, 4, 0, 4, 9, 9.7, C.bois),

    // bottes de foin, en escalier
    box(6, 7.4, 0, 0.3, 14, 15.4, C.foin),
    box(7.4, 8.8, 0, 1.2, 14, 15.4, C.foin),
    box(8.8, 10.2, 0, 2.4, 14, 15.4, C.foin),
    box(8.8, 10.2, 0, 1.2, 15.4, 16.8, C.foin),
    box(-9, -7.6, 0, 1.2, 15, 16.4, C.foin),
    box(-3, -1.6, 0, 1.2, -3, -1.6, C.foin),
    box(2, 3.4, 0, 1.2, -5, -3.6, C.foin),

    // silo
    box(14, 18, 0, 8, -14, -10, C.silo),

    // passerelle entre deux piliers de pierre
    box(10, 12, 0, 3, 0, 2, C.pierre),
    box(18, 20, 0, 3, 0, 2, C.pierre),
    box(12, 18, 2.6, 3, 0, 2, C.bois),

    // estrade basse
    box(-6, 0, 0, 0.3, -16, -12, C.bois),
  ],
  // taches posées avant le match : { p: [x, y, z], r, team }
  prepaint: [
    ...[21.5, 20, 18.5, 17, 15.5, 14, 12.5, 11, 10].map((z) => ({ p: [0, 0, z], r: 1.3, team: 1 })),
    ...[0.4, 1.1, 1.8, 2.5, 3.2, 3.8].map((y) => ({ p: [0, y, 9.7], r: 1.1, team: 1 })),
    { p: [0, 4, 9.35], r: 1.2, team: 1 },
    { p: [-8, 0, 20], r: 2.2, team: 2 },
    { p: [-10.5, 0, 21.5], r: 1.8, team: 2 },
  ],
};
