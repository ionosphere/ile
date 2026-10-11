// Ce qu'un acteur veut faire pendant un pas de simulation.
// Clavier, tactile et bots produisent tous cette même structure.

export function makeCommand() {
  return {
    move: { x: 0, z: 0 },   // x : droite, z : avant ; longueur 0 à 1
    yaw: 0,
    pitch: 0,
    fire: false,
    cat: false,
    jump: false,
    special: false,
    goats: false,
  };
}

export const IDLE = Object.freeze(makeCommand());
