// Niveaux de qualité graphique. Le niveau de départ dépend de l'appareil ; si l'affichage rame,
// on descend d'un cran tout seul. La simulation, elle, ne change jamais : seul le rendu s'allège.

export const QUALITY_LEVELS = [
  { id: 'basse', name: 'Basse', pixelRatio: 0.75, softPaint: false, detail: false, shadows: false, post: false },
  { id: 'moyenne', name: 'Moyenne', pixelRatio: 1, softPaint: true, detail: true, shadows: false, post: false },
  { id: 'haute', name: 'Haute', pixelRatio: 2, softPaint: true, detail: true, shadows: true, post: true },
];

const SLOW_FPS = 40;      // en dessous, on allège
const WINDOW = 2.5;       // secondes de mesure avant de décider

export class Quality {
  constructor(renderer, { coarse = false } = {}) {
    this.renderer = renderer;
    this.onChange = null;
    this.softPaint = { value: 1 };   // lus directement par le matériau du niveau
    this.detail = { value: 1 };      // matières texturées et relief
    this.setShadows = null;          // fournis par le rendu : activent ou coupent les ombres portées
    this.setPost = null;             // et la finition de l'image
    this.auto = true;
    this.frames = 0;
    this.time = 0;
    // un écran tactile part un cran plus bas : petits processeurs graphiques, grande densité de pixels
    this.initial = coarse ? 1 : 2;
    this.set(this.initial);
  }

  get level() {
    return QUALITY_LEVELS[this.index];
  }

  // Réglage du joueur : 'auto' (niveau selon l'appareil, ajusté si ça rame) ou l'identifiant d'un niveau.
  choose(id) {
    const index = QUALITY_LEVELS.findIndex((l) => l.id === id);
    this.auto = index < 0;
    this.set(this.auto ? this.initial : index);
  }

  set(index) {
    this.index = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, index));
    const level = this.level;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, level.pixelRatio));
    this.softPaint.value = level.softPaint ? 1 : 0;
    this.detail.value = level.detail ? 1 : 0;
    this.setShadows?.(level.shadows);
    this.setPost?.(level.post);
    this.frames = 0;
    this.time = 0;
    this.onChange?.(level);
  }

  // À appeler à chaque image affichée pendant le jeu, avec le temps écoulé.
  frame(dt) {
    if (!this.auto || this.index === 0) return;
    this.frames++;
    this.time += dt;
    if (this.time < WINDOW) return;
    const fps = this.frames / this.time;
    if (fps < SLOW_FPS) this.set(this.index - 1);
    this.frames = 0;
    this.time = 0;
  }
}
