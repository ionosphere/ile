// Déroulement d'un match : décompte, temps de jeu, puis résultat figé.

export class Match {
  constructor(world, { duration, countdown }) {
    this.world = world;
    this.phase = 'countdown';   // 'countdown' → 'playing' → 'ended'
    this.countdown = countdown;
    this.remaining = duration;
    this.result = null;
  }

  step(dt) {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'playing';
        this.world.events.emit('match:debut');
      }
    } else if (this.phase === 'playing') {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        this.remaining = 0;
        this.phase = 'ended';
        const coverage = this.world.paint.coverage();
        // égalité parfaite : winner vaut 0
        const winner = coverage[1] > coverage[2] ? 1 : coverage[2] > coverage[1] ? 2 : 0;
        this.result = { coverage, winner };
        this.world.events.emit('match:fin', this.result);
      }
    }
  }
}
