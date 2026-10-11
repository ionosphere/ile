// Jeu à plusieurs : l'écran où l'on crée ou rejoint un salon, puis le salon lui-même
// (équipes, héroïnes, carte, difficulté des bots) jusqu'au lancement du match par l'hôte.

import { CHARACTERS, CHARACTER_IDS } from '../config/characters.js';
import { MAPS, MAP_IDS } from '../config/maps/index.js';
import { DIFFICULTY, TEAMS, MATCH } from '../config/tuning.js';
import { NAME_MAX } from '../net/protocol.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// Rangée de boutons dont un seul est enfoncé ; inactive si `locked`.
function choice(items, current, locked, onPick) {
  const row = el('div', 'lobby-choice');
  for (const [id, name] of items) {
    const b = button('map', name, () => onPick(id));
    b.setAttribute('aria-pressed', String(id === current));
    b.disabled = locked && id !== current;
    row.append(b);
  }
  return row;
}

function savedName() {
  try { return localStorage.getItem('ile.nom') ?? ''; } catch { return ''; }
}

// actions : { create(name), join(code, name), set(patch), config(patch), start(), leave() }
// Renvoie { showEntry(message), showRoom(room), busy(text) }.
export function buildLobby(panel, actions) {
  const invited = new URLSearchParams(location.search).get('salon')?.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) ?? '';

  function showEntry(message) {
    const name = el('input');
    name.type = 'text';
    name.id = 'lobby-name';
    name.maxLength = NAME_MAX;
    name.placeholder = 'Ton prénom';
    name.value = savedName();
    name.autocomplete = 'off';
    const nameLabel = el('label', null, 'Ton prénom');
    nameLabel.htmlFor = name.id;
    const code = el('input');
    code.type = 'text';
    code.id = 'lobby-code';
    code.maxLength = 4;
    code.placeholder = 'CODE';
    code.value = invited;
    code.autocomplete = 'off';
    code.autocapitalize = 'characters';
    const codeLabel = el('label', null, 'Code du salon');
    codeLabel.htmlFor = code.id;

    const who = () => {
      const value = name.value.trim();
      try { localStorage.setItem('ile.nom', value); } catch {}
      return value;
    };
    const join = button('button', 'Rejoindre', () => actions.join(code.value, who()));
    const create = button('button', 'Créer un salon', () => actions.create(who()));
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join.click(); });

    const fields = el('div', 'lobby-entry');
    const joinRow = el('div', 'lobby-join');
    joinRow.append(code, join);
    fields.append(nameLabel, name, create, el('div', 'lobby-or', 'ou'), codeLabel, joinRow);
    const note = el('p', 'lobby-note', message ?? 'Crée un salon et donne son code aux autres, ou entre le code qu\'on t\'a donné. Les places libres sont tenues par des bots.');
    if (message) note.classList.add('error');
    panel.replaceChildren(el('h2', null, 'Jouer à plusieurs'), note, fields, button('button quiet', 'Retour', actions.leave));
    (invited ? name : name.value ? code : name).focus?.();
  }

  function busy(text) {
    panel.replaceChildren(el('h2', null, 'Jouer à plusieurs'), el('p', 'lobby-note', text));
  }

  function showRoom(room) {
    const me = room.players.find((p) => p.id === room.you);
    const host = room.you === room.host;
    const playing = room.state === 'playing';

    const head = el('div', 'lobby-head');
    const link = `${location.origin}/?salon=${room.code}`;
    const copy = button('button quiet', 'Copier le lien', async () => {
      try {
        await navigator.clipboard.writeText(link);
        copy.textContent = 'Lien copié';
      } catch {
        copy.textContent = link;   // presse-papiers indisponible : on affiche le lien à recopier
      }
    });
    head.append(el('span', 'lobby-code-label', 'Salon'), el('strong', 'lobby-code', room.code), copy);

    const teams = el('div', 'lobby-teams');
    for (const team of [1, 2]) {
      const box = el('div', `lobby-team team-${team}`);
      box.append(el('h3', null, TEAMS[team].name));
      const members = room.players.filter((p) => p.team === team);
      for (const p of members) {
        const row = el('div', 'lobby-player');
        row.append(el('span', 'lobby-player-name', p.name + (p.id === room.host ? ' ★' : '')), el('span', 'lobby-player-hero', CHARACTERS[p.character]?.name ?? ''));
        if (p.id === room.you) row.classList.add('me');
        box.append(row);
      }
      for (let i = members.length; i < MATCH.teamSize; i++) box.append(el('div', 'lobby-player bot', 'Bot'));
      if (me && me.team !== team && members.length < MATCH.teamSize && !playing) {
        box.append(button('button quiet', 'Passer dans cette équipe', () => actions.set({ team })));
      }
      teams.append(box);
    }

    const options = el('div', 'lobby-options');
    if (me) {
      options.append(el('span', 'choice-label', 'Ton héroïne'), choice(CHARACTER_IDS.map((id) => [id, CHARACTERS[id].name]), me.character, playing, (character) => actions.set({ character })));
    }
    options.append(el('span', 'choice-label', 'Carte'), choice(MAP_IDS.map((id) => [id, MAPS[id].name]), room.map, !host || playing, (map) => actions.config({ map })));
    options.append(el('span', 'choice-label', 'Bots'), choice(Object.entries(DIFFICULTY).map(([id, d]) => [id, d.name]), room.difficulty, !host || playing, (difficulty) => actions.config({ difficulty })));

    const foot = el('div', 'menu-row');
    if (playing) foot.append(el('p', 'lobby-note', 'Un match est en cours. Tu joueras le suivant.'));
    else if (host) foot.append(button('button', 'Lancer le match', actions.start));
    else foot.append(el('p', 'lobby-note', 'L\'hôte (★) choisit la carte et lance le match.'));
    foot.append(button('button quiet', 'Quitter le salon', actions.leave));

    panel.replaceChildren(head, teams, options, foot);
  }

  return { showEntry, showRoom, busy };
}
