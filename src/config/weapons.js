// Données des armes. La logique est dans sim/weapons.js.
// Les valeurs en [a, b] vont de la charge minimale à la charge complète.

export const WEAPONS = {
  // Ines : tir automatique de près, avec esquive
  double: {
    kind: 'auto',
    name: 'Double pistolet',
    interval: 0.11,         // secondes entre deux tirs
    inkCost: 0.9,
    damage: 30,
    hitRadius: 0.12,
    speed: 28,
    range: 9.5,             // au-delà, le projectile retombe
    gravity: 4,
    spreadDeg: 2.5,
    splatRadius: 0.8,
    trailEvery: 1.6,        // une goutte tombe au sol tous les N mètres parcourus
    trailRadius: 0.5,
    moveSpeedFiring: 0.8,
    dodge: { speed: 15, time: 0.2, inkCost: 7, cooldown: 0.7 },
  },

  // Louisa : on maintient pour charger, le tir part au relâchement
  charge: {
    kind: 'charge',
    name: 'Tir chargé',
    chargeTime: 0.75,
    minCharge: 0.15,
    cooldown: 0.2,
    range: [8, 24],
    damage: [35, 110],
    inkCost: [2.5, 12],
    hitRadius: 0.18,
    splatRadius: [0.55, 0.95],   // tache au point d'impact
    trailEvery: 0.9,             // et une traînée au sol sous le trait
    trailRadius: [0.5, 0.8],
    moveSpeedFiring: 0.65,
  },

  // Emma : on roule en maintenant le tir ; chaque appui projette d'abord une gerbe
  rouleau: {
    kind: 'roller',
    name: 'Rouleau',
    width: 2.0,
    stripeEvery: 0.3,       // une bande tous les N mètres parcourus
    inkPerMeter: 2.7,
    contactDps: 240,
    moveSpeedFiring: 0.85,
    fling: {
      count: 7,
      arcDeg: 50,
      inkCost: 8,
      cooldown: 0.6,
      damage: 26,
      hitRadius: 0.15,
      speed: 17,
      range: 4.2,
      gravity: 14,
      spreadDeg: 3,
      splatRadius: 0.7,
      trailEvery: 0.9,
      trailRadius: 0.45,
    },
  },
};
