// Toutes les constantes de sensation de jeu. Rien ici n'importe quoi que ce soit.
// Unités : mètres, secondes.

export const STEP = 1 / 60;

export const PLAYER = {
  radius: 0.38,
  height: 1.45,
  catHeight: 0.55,

  runSpeed: 7.0,
  catDrySpeed: 3.4,       // chat hors peinture
  swimSpeed: 13.5,        // chat dans sa peinture
  enemyPaintSpeed: 2.2,
  climbSpeed: 8.6,
  climbExitVel: 4.5,      // vitesse verticale gardée en quittant un mur

  accelGround: 70,
  accelAir: 18,
  accelSwim: 74,
  accelCatDry: 34,
  accelEnemyPaint: 30,

  jumpVel: 8.4,
  swimJumpVel: 9.4,
  gravity: 25,
  fallGravityMul: 1.2,
  maxFall: 40,
  jumpBuffer: 0.13,       // un saut pressé juste avant d'atterrir part à l'atterrissage
  coyoteTime: 0.12,       // ... et juste après avoir quitté un rebord
  stepHeight: 0.3,        // marche franchie sans sauter

  inkMax: 100,
  inkRefillSwim: 42,      // par seconde, chat dans sa peinture
  inkRefillHuman: 9,      // par seconde, forme humaine après le délai
  inkRefillDelay: 0.9,

  hp: 100,
  enemyPaintDps: 20,      // dégâts par seconde dans la peinture adverse ...
  enemyPaintDamageCap: 40, // ... qui ne font jamais descendre sous (hp - plafond)
  regenDelay: 1.3,
  regenRate: 22,
  regenRateSwim: 60,
  respawnTime: 5,
  spawnInvuln: 1.6,
  deathSplatRadius: 1.8,  // tache laissée par le vainqueur à l'endroit de l'élimination

  fallDeathY: -8,
};

export const MATCH = {
  duration: 180,
  countdown: 3,
  teamSize: 4,
};

// Niveau des bots adverses (réglage « Difficulté »). Les coéquipières jouent toujours au niveau `ALLY_LEVEL`.
//   skill : précision et vivacité (0 à 1) ; reaction : secondes avant de riposter ; spread : dispersion du tir ;
//   pace : part du temps où le bot agit ; patience : secondes d'attente avant d'utiliser une jauge pleine.
export const DIFFICULTY = {
  facile: { name: 'Facile', skill: 0.15, reaction: 0.9, spread: 2.2, pace: 0.62, patience: 10 },
  normale: { name: 'Normale', skill: 0.3, reaction: 0.6, spread: 1.6, pace: 0.75, patience: 5 },
  difficile: { name: 'Difficile', skill: 0.45, reaction: 0.35, spread: 1.25, pace: 0.9, patience: 2 },
};
export const ALLY_LEVEL = 'normale';

// Origine du rayon de visée, relative aux pieds. La caméra est placée sur cette même droite,
// donc le viseur au centre de l'écran désigne bien le point visé par la simulation.
export const AIM = {
  height: 1.6,
  side: 0.55,
  range: 60,
  minDist: 3,
};

export const CAMERA = {
  dist: 4.0,
  fov: 70,
  catDrop: 0.6,           // la caméra s'abaisse en forme chat
  wallMargin: 0.25,
};

// Commandes tactiles.
export const TOUCH = {
  stickRadius: 52,        // pixels de course de la manette virtuelle
  sensitivity: 0.0055,    // radians par pixel glissé
  assistAngle: 0.2,       // cône (radians) dans lequel le viseur est attiré vers un adversaire
  assistRate: 3.5,        // force de l'attraction
  autoFire: true,
  autoFireAngle: 0.07,
};

export const PAINT = {
  cell: 0.125,
  atlasWidth: 1024,
  maxPlaneDist: 0.35,     // une tache n'atteint pas une face plus éloignée que ça
};

// Dans la grille de peinture : 0 = vierge, 1 et 2 = équipes.
export const TEAMS = [
  null,
  { name: 'Coquelicot', color: '#ff5233' },
  { name: 'Bleuet', color: '#2f6bff' },
];

const PALETTES = {
  normal: [['Coquelicot', '#ff5233'], ['Bleuet', '#2f6bff']],
  // jaune contre bleu : lisible avec les formes courantes de daltonisme
  colorblind: [['Tournesol', '#ffd21a'], ['Bleuet', '#2a52ff']],
};

// Change les noms et couleurs des équipes. Prend effet sur ce qui est construit ensuite (prochain match).
export function setPalette(colorblind) {
  const palette = PALETTES[colorblind ? 'colorblind' : 'normal'];
  for (const team of [1, 2]) {
    TEAMS[team].name = palette[team - 1][0];
    TEAMS[team].color = palette[team - 1][1];
  }
}
