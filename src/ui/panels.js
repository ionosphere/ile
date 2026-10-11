// Tutoriel et réglages : deux panneaux construits ici, affichés par-dessus le menu ou la pause.

import { QUALITY_LEVELS } from '../render/quality.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Chaque étape : un titre, puis le texte pour le clavier et celui pour le tactile.
const STEPS = [
  {
    title: 'Peins le terrain',
    keys: 'Vise à la souris et maintiens le clic gauche. Au bout de 3 minutes, l\'équipe qui a peint le plus de terrain gagne.',
    touch: 'Glisse le pouce droit pour viser et maintiens Peindre. Au bout de 3 minutes, l\'équipe qui a peint le plus de terrain gagne.',
  },
  {
    title: 'Deviens chat',
    keys: 'Maintiens Maj : en chat, tu files dans ta peinture, tu grimpes aux murs peints à ta couleur et ton réservoir se recharge. La peinture adverse te ralentit et te blesse.',
    touch: 'Touche Chat : tu files dans ta peinture, tu grimpes aux murs peints à ta couleur et ton réservoir se recharge. La peinture adverse te ralentit et te blesse.',
  },
  {
    title: 'Deux jauges à remplir',
    keys: 'Peindre remplit deux jauges. E déclenche la capacité de ton héroïne. F lâche trois chèvres qui peignent et grimpent partout pendant 10 secondes.',
    touch: 'Peindre remplit deux jauges. Capacité déclenche le pouvoir de ton héroïne. Chèvres en lâche trois, qui peignent et grimpent partout pendant 10 secondes.',
  },
  {
    title: 'Les vaches comptent',
    keys: 'Une vache peinte vaut du terrain pour ton équipe, jusqu\'à ce que l\'autre équipe la repeigne. Elle arrête aussi les tirs : sers-t\'en comme abri.',
    touch: 'Une vache peinte vaut du terrain pour ton équipe, jusqu\'à ce que l\'autre équipe la repeigne. Elle arrête aussi les tirs : sers-t\'en comme abri.',
  },
];

// Remplit le panneau du tutoriel. Renvoie open(onDone) : affiche la première étape, puis appelle onDone à la fin.
export function buildTutorial(panel) {
  const title = el('h2');
  const keys = el('p', 'only-keys');
  const touch = el('p', 'only-touch');
  const dots = el('div', 'dots');
  const next = el('button', 'button');
  next.type = 'button';
  const skip = el('button', 'button quiet', 'Passer');
  skip.type = 'button';
  panel.replaceChildren(title, keys, touch, dots, next, skip);

  let step = 0;
  let done = null;
  const show = () => {
    const s = STEPS[step];
    title.textContent = s.title;
    keys.textContent = s.keys;
    touch.textContent = s.touch;
    dots.replaceChildren(...STEPS.map((_, i) => el('i', i === step ? 'on' : '')));
    next.textContent = step === STEPS.length - 1 ? 'C\'est parti' : 'Suivant';
  };
  next.addEventListener('click', () => {
    if (step < STEPS.length - 1) {
      step++;
      show();
    } else {
      done?.();
    }
  });
  skip.addEventListener('click', () => done?.());

  return (onDone) => {
    step = 0;
    done = onDone;
    show();
  };
}

// Remplit le panneau des réglages et le relie à l'objet Settings. onClose est appelé par le bouton Fermer.
export function buildSettings(panel, settings, onClose) {
  const rows = el('div', 'settings');

  const slider = (label, key, min, max, step, format) => {
    const id = `set-${key}`;
    const lab = el('label', null, label);
    lab.htmlFor = id;
    const input = el('input');
    input.type = 'range';
    input.id = id;
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = settings.get(key);
    const out = el('output', null, format(settings.get(key)));
    input.addEventListener('input', () => {
      settings.set(key, Number(input.value));
      out.textContent = format(Number(input.value));
    });
    const row = el('div', 'setting');
    row.append(lab, input, out);
    return row;
  };

  const toggle = (label, key, className) => {
    const id = `set-${key}`;
    const input = el('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = settings.get(key);
    input.addEventListener('change', () => settings.set(key, input.checked));
    const lab = el('label', null, label);
    lab.htmlFor = id;
    const row = el('div', `setting check ${className ?? ''}`);
    row.append(input, lab);
    return row;
  };

  const percent = (v) => `${Math.round(v * 100)} %`;
  const times = (v) => `× ${v.toFixed(1).replace('.', ',')}`;
  rows.append(slider('Volume', 'volume', 0, 1, 0.05, percent));
  const mouse = slider('Sensibilité de la souris', 'mouse', 0.3, 2.5, 0.1, times);
  mouse.classList.add('only-keys');
  const touch = slider('Sensibilité du tactile', 'touch', 0.3, 2.5, 0.1, times);
  touch.classList.add('only-touch');
  rows.append(mouse, touch);

  const quality = el('div', 'setting');
  const qLabel = el('label', null, 'Qualité graphique');
  qLabel.htmlFor = 'set-quality';
  const select = el('select');
  select.id = 'set-quality';
  for (const [value, name] of [['auto', 'Automatique'], ...QUALITY_LEVELS.map((l) => [l.id, l.name])]) {
    const option = el('option', null, name);
    option.value = value;
    select.append(option);
  }
  select.value = settings.get('quality');
  select.addEventListener('change', () => settings.set('quality', select.value));
  quality.append(qLabel, select);
  rows.append(quality);

  rows.append(toggle('Tir automatique quand une adversaire est dans le viseur', 'autoFire', 'only-touch'));
  rows.append(toggle('Couleurs pour daltoniens (jaune et bleu), au prochain match', 'colorblind'));

  const close = el('button', 'button', 'Fermer');
  close.type = 'button';
  close.addEventListener('click', onClose);
  panel.replaceChildren(el('h2', null, 'Réglages'), rows, close);
}
