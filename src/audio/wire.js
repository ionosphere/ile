// Branche les sons sur les événements d'une partie. Les sons des autres s'atténuent avec la distance.

const HEARING = 34;   // mètres au-delà desquels on n'entend plus rien

export function wireAudio(audio, world, player) {
  const { events } = world;
  // 1 pour soi, puis de moins en moins fort avec la distance
  const near = (x, z) => {
    const d = Math.hypot(x - player.pos.x, z - player.pos.z);
    return Math.max(0, 1 - d / HEARING) ** 2;
  };
  const from = (actor) => (actor === player ? 1 : near(actor.pos.x, actor.pos.z) * 0.7);

  events.on('tir', ({ actor }) => audio.play(actor.weapon.kind === 'roller' ? 'gerbe' : 'tir', from(actor)));
  events.on('trait', ({ actor }) => audio.play('trait', from(actor)));
  events.on('impact', (e) => audio.play('tache', near(e.x, e.z) * 0.6));
  events.on('esquive', ({ actor }) => audio.play('esquive', from(actor)));
  events.on('reservoir_vide', ({ actor }) => { if (actor === player) audio.play('vide'); });
  events.on('touche', ({ actor }) => { if (actor === player) audio.play('touche'); });
  events.on('elimine', ({ actor, killer }) => {
    if (actor === player) audio.play('eliminee');
    else if (killer === player) audio.play('elimination');
  });
  events.on('capacite:debut', ({ actor }) => audio.play('capacite', from(actor)));
  events.on('chevres:lachees', ({ actor }) => audio.play('chevres', from(actor)));
  events.on('vache:peinte', ({ cow }) => audio.play('vache', near(cow.pos.x, cow.pos.z)));
  events.on('match:debut', () => audio.play('depart'));
  events.on('match:fin', () => audio.play('fin'));

  // Sons liés à l'état plutôt qu'à un événement : décompte, et jauges qui viennent de se remplir.
  let lastCount = 0;
  let specialReady = false;
  let goatsReady = false;
  return function tick() {
    const match = world.match;
    const count = match.phase === 'countdown' ? Math.ceil(match.countdown) : 0;
    if (count !== lastCount && count > 0) audio.play('decompte');
    lastCount = count;
    const s = player.gaugeRatio >= 1 && player.specialT <= 0;
    const g = player.goatRatio >= 1;
    if ((s && !specialReady) || (g && !goatsReady)) audio.play('pret');
    specialReady = s;
    goatsReady = g;
  };
}
