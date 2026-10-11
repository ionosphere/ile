// Données des capacités spéciales. La logique est dans sim/specials.js.

// Surface à peindre (m²) pour remplir la jauge.
export const SPECIAL_COST = 150;
// Part de la jauge conservée quand on est éliminée.
export const SPECIAL_KEPT_ON_DEATH = 0.5;

export const SPECIALS = {
  // Ines
  ruee: {
    name: 'Charge',
    duration: 1.1,
    speed: 20,
    splatRadius: 1.25,
    splatEvery: 0.5,
    hitRadius: 1.4,
    damage: 70,
    knockback: 11,
  },
  // Louisa
  plan: {
    name: 'Plan de bataille',
    duration: 7,
  },
  // Emma
  cercle: {
    name: "Cercle d'entraide",
    duration: 8,
    radius: 6,
    heal: 30,       // points de vie par seconde
    ink: 25,        // peinture par seconde
  },
};
