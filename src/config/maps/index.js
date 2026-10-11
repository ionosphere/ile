// Les cartes jouables, dans l'ordre où le menu les propose.

import { FERME } from './ferme.js';
import { SALON } from './salon.js';

export const MAPS = { ferme: FERME, salon: SALON };
export const MAP_IDS = Object.keys(MAPS);
