// Données des animaux : les vaches qui déambulent, et les chèvres du coup spécial commun.

export const COW = {
  radius: 0.85,
  height: 1.5,
  speed: 1.3,
  pause: [2, 5],      // secondes d'arrêt à chaque étape du trajet
  area: 6,            // m² de terrain que vaut une vache peinte
};

export const GOATS = {
  name: 'Lâcher de chèvres',
  cost: 170,          // m² à peindre pour remplir la jauge
  count: 3,
  duration: 10,
  speed: 8.5,
  climbSpeed: 7,
  radius: 0.35,
  height: 0.8,
  splatRadius: 1.0,
  splatEvery: 0.45,   // une tache tous les N mètres
  turnEvery: 0.9,     // secondes entre deux changements de cap
  maxDrop: 6,         // hauteur dont une chèvre accepte de sauter
};
