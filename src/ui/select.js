// Écran de sélection : une carte par héroïne, construite à partir de config/characters.js.

import { CHARACTERS, CHARACTER_IDS } from '../config/characters.js';
import { WEAPONS } from '../config/weapons.js';
import { SPECIALS } from '../config/specials.js';
import { MAPS, MAP_IDS } from '../config/maps/index.js';
import { DIFFICULTY } from '../config/tuning.js';

const STATS = [['vitesse', 'Vitesse'], ['vie', 'Vie'], ['portee', 'Portée']];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Portrait stylisé : la coiffure, les lunettes et la tenue de l'héroïne, sans traits du visage.
function portraitSvg(look) {
  const h = look.hairColor;
  const t = look.hairTips ?? h;
  const skin = '#efc5a4';
  let back = '';
  let front = '';
  let extra = '';
  if (look.hair === 'queue') {
    back = `<path d="M40 12c13 1 16 15 12 30l-6 10-3-9c4-10 3-19-5-25z" fill="${h}"/><path d="M52 42l-6 10-2-6c3-2 6-3 8-4z" fill="${t}"/>`;
    front = `<path d="M19.5 26c0-11 6-17 12.5-17s12.5 6 12.5 17c-2-7-6-11-12.5-11s-10.5 4-12.5 11z" fill="${h}"/>`;
  } else if (look.hair === 'boucles') {
    const curls = [[14, 44, 6], [15, 35, 6.5], [16, 26, 6.5], [20, 17, 6.5], [27, 11, 6.5], [35, 10, 6.5], [43, 14, 6.5], [47, 22, 6.5], [49, 31, 6.5], [50, 40, 6], [49, 48, 5.5], [15, 51, 5.5]];
    back = curls.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 3 === 1 ? t : h}"/>`).join('');
    front = `<path d="M20 25c2-9 8-13 12-13s10 4 12 13c-4-5-8-7-12-7s-8 2-12 7z" fill="${h}"/>`;
  } else {
    back = `<path d="M17 28c0-13 6-20 15-20s15 7 15 20v30H17z" fill="${h}"/><path d="M17 46h7v14h-7zM40 46h7v14h-7z" fill="${t}"/>`;
    front = `<path d="M19 30c0-13 6-20 13-20s13 7 13 20c-2-9-6-13-13-14-7 1-11 5-13 14z" fill="${h}"/><path d="M19 30c0 8 0 16 2 24h4c-3-8-4-16-3-25zM45 30c0 8 0 16-2 24h-4c3-8 4-16 3-25z" fill="${h}"/>`;
  }
  if (look.glasses) extra += '<g fill="none" stroke="#b89a5c" stroke-width="1.3"><circle cx="26.5" cy="29" r="4.8"/><circle cx="37.5" cy="29" r="4.8"/><path d="M31.3 29h1.400"/></g>';
  if (look.goggles) extra += '<rect x="21" y="15.5" width="22" height="5.5" rx="2.7" fill="#e4f3ff" fill-opacity="0.75" stroke="#26211e" stroke-width="1"/>';
  let outfit = `<path d="M11 64c0-12 9-18 21-18s21 6 21 18z" fill="${look.topColor}"/>`;
  if (look.top === 'bleu') outfit += `<path d="M28 46h8l-2 18h-4z" fill="${look.inner}"/><path d="M24 46l8 9-6 3zM40 46l-8 9 6 3z" fill="${look.topColor}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="0.8"/>`;
  else if (look.top === 'hoodie') outfit += `<path d="M22 47c3 5 17 5 20 0l2 3c-5 6-19 6-24 0z" fill="#ffffff" fill-opacity="0.14"/><path d="M29 52v9M35 52v9" stroke="#f6f4ee" stroke-width="1.1"/>`;
  else outfit += '<path d="M26 56h12M24 59.5h16" stroke="#f6f4ee" stroke-width="1.6"/>';
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="32" fill="${look.accent}"/>
    <clipPath id="clip-${look.hair}"><circle cx="32" cy="32" r="32"/></clipPath>
    <g clip-path="url(#clip-${look.hair})">
      ${back}
      ${outfit}
      <rect x="28.5" y="38" width="7" height="10" rx="3" fill="${skin}"/>
      <ellipse cx="32" cy="28.5" rx="11" ry="13" fill="${skin}"/>
      ${front}
      ${extra}
    </g>
  </svg>`;
}

// onPick(id) est appelé quand le joueur choisit une héroïne.
export function buildSelect(container, onPick) {
  container.replaceChildren();
  for (const id of CHARACTER_IDS) {
    const c = CHARACTERS[id];
    const card = el('button', 'card');
    card.type = 'button';
    card.style.setProperty('--accent', c.look.accent);

    const head = el('div', 'card-head');
    const portrait = el('span', 'portrait');
    portrait.innerHTML = portraitSvg(c.look);
    head.append(portrait);
    const title = el('div');
    title.append(el('div', 'card-name', c.name), el('div', 'card-role', c.role));
    head.append(title);
    card.append(head);

    const stats = el('div', 'stats');
    for (const [key, label] of STATS) {
      stats.append(el('span', 'stat-label', label));
      const pips = el('span', 'pips');
      pips.setAttribute('aria-label', `${c.stats[key]} sur 3`);
      for (let i = 1; i <= 3; i++) pips.append(el('i', i <= c.stats[key] ? 'on' : ''));
      stats.append(pips);
    }
    card.append(stats);

    card.append(el('div', 'card-item', WEAPONS[c.weapon].name), el('p', 'card-text', c.weaponText));
    card.append(el('div', 'card-item', `Capacité : ${SPECIALS[c.special].name}`), el('p', 'card-text', c.specialText));

    card.addEventListener('click', () => onPick(id));
    container.append(card);
  }
}

// Une rangée de boutons dont un seul est enfoncé. items : [{ id, name, blurb }]. onPick(id) à chaque changement.
function buildChoice(container, items, current, onPick) {
  container.replaceChildren();
  const buttons = items.map(({ id, name, blurb }) => {
    const button = el('button', 'map');
    button.type = 'button';
    button.append(el('span', 'map-name', name));
    if (blurb) button.append(el('span', 'map-blurb', blurb));
    button.setAttribute('aria-pressed', String(id === current));
    button.addEventListener('click', () => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
      onPick(id);
    });
    container.append(button);
    return button;
  });
}

export function buildMapChoice(container, current, onPick) {
  buildChoice(container, MAP_IDS.map((id) => ({ id, name: MAPS[id].name, blurb: MAPS[id].blurb })), current, onPick);
}

// Niveau des adversaires.
export function buildDifficultyChoice(container, current, onPick) {
  buildChoice(container, Object.entries(DIFFICULTY).map(([id, d]) => ({ id, name: d.name })), current, onPick);
}
