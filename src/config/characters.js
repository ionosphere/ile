// Les héroïnes. Uniquement des données : l'équilibrage se fait ici et dans weapons.js / specials.js.
// `look` décrit l'avatar d'après les photos de référence : coiffure et couleur des cheveux (hair, hairColor,
// hairTips pour les pointes), lunettes, haut (top : 'sweat' court, 'hoodie' à capuche, 'bleu' de travail),
// coupe du pantalon (pantsCut : 'large', 'cargo', 'droit'), chaussures. Le visage, lui, reste générique :
// les héroïnes sont des personnes réelles.

export const CHARACTERS = {
  ines: {
    id: 'ines',
    name: 'Ines',
    role: 'Fonceuse',
    speed: 1.0,
    hp: 120,
    scale: 1.0,
    weapon: 'double',
    special: 'ruee',
    weaponText: 'Tir rapide de près. Espace en tirant : esquive.',
    specialText: 'Fonce droit devant, invulnérable, en peignant tout sur son passage.',
    stats: { vitesse: 2, vie: 2, portee: 1 },
    look: {
      accent: '#ffd23f', hair: 'queue', hairColor: '#4a3223', hairTips: '#8a6645', glasses: true,
      top: 'sweat', topColor: '#1c1d23', inner: '#f1efe9', pants: '#cdd2d8', pantsCut: 'large', shoes: '#f3f2ee', shoeTrim: '#1c1d23',
    },
    // sight : distance de repérage ; engage : distance d'attaque ; near/far : distance tenue face à la cible
    ai: { sight: 16, engage: 11, near: 2.5, far: 6, retreatHp: 0.25 },
  },
  louisa: {
    id: 'louisa',
    name: 'Louisa',
    role: 'Tacticienne',
    speed: 1.15,
    hp: 80,
    scale: 1.0,
    weapon: 'charge',
    special: 'plan',
    weaponText: 'Maintiens pour charger, relâche : un trait de peinture à longue portée.',
    specialText: 'Révèle tous les adversaires à ton équipe, même derrière les murs.',
    stats: { vitesse: 3, vie: 1, portee: 3 },
    look: {
      accent: '#34c38f', hair: 'boucles', hairColor: '#c4874a', hairTips: '#dcab6c', goggles: true,
      top: 'bleu', topColor: '#2c5cb0', inner: '#1c1d23', sleeves: 'retroussees', pants: '#8fb0d4', pantsCut: 'cargo', shoes: '#f6f3f0', shoeTrim: '#e7679a',
    },
    ai: { sight: 24, engage: 20, near: 9, far: 16, retreatHp: 0.5 },
  },
  emma: {
    id: 'emma',
    name: 'Emma',
    role: 'Protectrice',
    speed: 0.88,
    hp: 140,
    scale: 1.15,
    weapon: 'rouleau',
    special: 'cercle',
    weaponText: 'Avance en maintenant le tir pour peindre large. Un clic projette une gerbe.',
    specialText: 'Soigne les alliées autour d\'elle et recharge leur peinture.',
    stats: { vitesse: 1, vie: 3, portee: 1 },
    look: {
      accent: '#b57bff', hair: 'lisse', hairColor: '#9c7040', hairTips: '#c69b5f',
      top: 'hoodie', topColor: '#1b1c21', pants: '#93a4b9', pantsCut: 'droit', shoes: '#f4f4f2', shoeTrim: '#c9c9c9',
    },
    ai: { sight: 16, engage: 9, near: 0, far: 0, retreatHp: 0.3, staysClose: true },
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);

// Personnage neutre, pour les essais et les tests qui ne portent pas sur une héroïne.
export const NEUTRAL = {
  id: 'neutre',
  name: 'Neutre',
  speed: 1,
  hp: 100,
  scale: 1,
  weapon: 'double',
  special: null,
  look: { accent: '#ffffff', hair: 'queue', hairColor: '#4a342a', top: 'sweat', topColor: '#22252e', pants: '#555c66' },
  ai: { sight: 16, engage: 10, near: 3.5, far: 7, retreatHp: 0.4 },
};
