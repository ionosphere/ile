// Outils d'écriture des cartes. Une carte est symétrique par demi-tour autour de son centre :
// on décrit la moitié de l'équipe 1 (z > 0) et `mirror` fabrique celle de l'équipe 2.

// Matière de chaque couleur de la carte (béton, herbe, pierre…), lue par le rendu pour texturer les surfaces.
// La simulation ne s'en sert pas.
export const SURFACE = new Map();

// Déclare une palette : { nom: [couleur, matière] }. Renvoie { nom: couleur }.
export function surfaces(def) {
  const colors = {};
  for (const [name, [color, pattern]] of Object.entries(def)) {
    colors[name] = color;
    SURFACE.set(color, pattern);
  }
  return colors;
}

export const box = (x0, x1, y0, y1, z0, z1, color, extra) => ({ min: [x0, y0, z0], max: [x1, y1, z1], color, ...extra });

const flipBox = (b) => ({ ...b, min: [-b.max[0], b.min[1], -b.max[2]], max: [-b.min[0], b.max[1], -b.min[2]] });

// Chaque boîte, suivie de sa jumelle tournée d'un demi-tour.
export const mirror = (boxes) => boxes.flatMap((b) => [b, flipBox(b)]);

export const mirrorSigns = (signs) => signs.flatMap((s) => [s, { ...s, x: -s.x, z: -s.z, yaw: s.yaw + Math.PI }]);

export const mirrorCows = (cows) => cows.flatMap((c) => [c, { ...c, path: c.path.map(([x, z]) => [-x, -z]) }]);

// Places de départ : celles de l'équipe 1, et leurs jumelles pour l'équipe 2.
export function spawns(z, xs) {
  return [
    null,
    xs.map((x) => ({ pos: [x, 0, z], yaw: 0 })),
    xs.map((x) => ({ pos: [-x, 0, -z], yaw: Math.PI })),
  ];
}
