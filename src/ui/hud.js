// Affichage en jeu et écran de résultat. Lit l'état de la simulation, ne le modifie jamais.

import { TEAMS } from '../config/tuning.js';
import { SPECIALS } from '../config/specials.js';

const $ = (id) => document.getElementById(id);
const percent = (v) => `${(v * 100).toFixed(1).replace('.', ',')} %`;

export class Hud {
  constructor() {
    this.ink = $('ink-fill');
    this.timer = $('timer');
    this.scores = [null, $('score-1'), $('score-2')];
    this.vignette = $('vignette');
    this.banner = $('banner');
    this.status = $('status');
    this.crosshair = $('crosshair');
    this.special = $('special');
    this.specialFill = $('special-fill');
    this.specialName = $('special-name');
    this.goats = $('goats');
    this.touchSpecial = $('touch-special');
    this.touchGoats = $('touch-goats');
    this.goatsFill = $('goats-fill');
    this.pause = $('pause');
    this.select = $('select');
    this.results = $('results');
    this.tutorial = $('tutorial');
    this.settings = $('settings');
    this.lobby = $('lobby');
    this.bannerT = 0;
    this.applyPalette();
  }

  // Reporte les couleurs des équipes dans l'interface.
  applyPalette() {
    document.documentElement.style.setProperty('--team-1', TEAMS[1].color);
    document.documentElement.style.setProperty('--team-2', TEAMS[2].color);
  }

  // Un seul écran par-dessus le jeu à la fois : 'select', 'lobby', 'pause', 'results', 'tutorial', 'settings' ou aucun.
  show(screen) {
    this.select.classList.toggle('hidden', screen !== 'select');
    this.pause.classList.toggle('hidden', screen !== 'pause');
    this.results.classList.toggle('hidden', screen !== 'results');
    this.tutorial.classList.toggle('hidden', screen !== 'tutorial');
    this.settings.classList.toggle('hidden', screen !== 'settings');
    this.lobby.classList.toggle('hidden', screen !== 'lobby');
  }

  // Message bref au centre de l'écran.
  announce(text, seconds = 1.4) {
    this.banner.textContent = text;
    this.bannerT = seconds;
  }

  update(world, player, dt) {
    const match = world.match;
    this.ink.style.transform = `scaleY(${player.ink / player.inkMax})`;

    const cov = world.paint.coverage();
    this.scores[1].textContent = percent(cov[1]);
    this.scores[2].textContent = percent(cov[2]);

    const left = Math.ceil(match.remaining);
    this.timer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('urgent', match.phase === 'playing' && left <= 10);

    if (match.phase === 'countdown') {
      this.banner.textContent = String(Math.ceil(match.countdown));
      this.bannerT = 0.05;
    }
    this.bannerT -= dt;
    this.banner.classList.toggle('hidden', this.bannerT <= 0);

    this.vignette.style.opacity = player.alive ? (1 - player.hp / player.maxHp) * 0.85 : 0.6;
    const dead = !player.alive && match.phase === 'playing';
    this.status.classList.toggle('hidden', !dead);
    if (dead) this.status.textContent = `Éliminée · retour dans ${Math.ceil(player.respawnT)} s`;

    // anneau de charge autour du viseur
    this.crosshair.style.setProperty('--charge', player.charge.toFixed(3));
    this.crosshair.classList.toggle('charging', player.charge > 0);

    // lâcher de chèvres : commun à toutes, plus long à remplir
    this.goatsFill.style.transform = `scaleX(${player.goatRatio})`;
    this.goats.classList.toggle('ready', player.goatRatio >= 1);
    this.touchGoats.classList.toggle('ready', player.goatRatio >= 1);

    // jauge de capacité : se remplit en peignant, se vide pendant que la capacité agit
    const kind = player.character.special;
    this.special.classList.toggle('hidden', !kind);
    if (kind) {
      const active = player.specialT > 0;
      const ratio = active ? player.specialT / SPECIALS[kind].duration : player.gaugeRatio;
      this.specialFill.style.transform = `scaleX(${ratio})`;
      this.special.classList.toggle('ready', !active && ratio >= 1);
      this.touchSpecial.classList.toggle('ready', !active && ratio >= 1);
      this.special.classList.toggle('active', active);
      this.specialName.textContent = SPECIALS[kind].name;
    }
  }

  showResults(result, playerTeam) {
    const title = result.winner === 0 ? 'Égalité' : result.winner === playerTeam ? 'Victoire !' : 'Défaite';
    $('results-title').textContent = title;
    for (const team of [1, 2]) {
      $(`results-name-${team}`).textContent = TEAMS[team].name;
      $(`results-score-${team}`).textContent = percent(result.coverage[team]);
    }
    const total = result.coverage[1] + result.coverage[2] || 1;
    $('results-bar-1').style.flexGrow = Math.max(0.02, result.coverage[1] / total);
    $('results-bar-2').style.flexGrow = Math.max(0.02, result.coverage[2] / total);
  }
}
