// Démarrage : assemble simulation, entrées, rendu, son et affichage, puis lance la boucle.

import { Group } from 'three';
import { STEP, MATCH, DIFFICULTY, ALLY_LEVEL, setPalette } from './config/tuning.js';
import { CHARACTERS, CHARACTER_IDS } from './config/characters.js';
import { SPECIALS } from './config/specials.js';
import { MAPS, MAP_IDS } from './config/maps/index.js';
import { GOATS } from './config/animals.js';
import { createLoop } from './core/loop.js';
import { Settings } from './core/settings.js';
import { World } from './sim/world.js';
import { Nav } from './ai/nav.js';
import { Bot } from './ai/bot.js';
import { KeyboardMouse } from './input/keyboard.js';
import { TouchControls } from './input/touch.js';
import { createRenderer } from './render/renderer.js';
import { Quality } from './render/quality.js';
import { PaintTexture } from './render/paintTexture.js';
import { createLevelView } from './render/levelView.js';
import { ActorView } from './render/actorView.js';
import { ProjectileView } from './render/projectileView.js';
import { BeamView } from './render/beamView.js';
import { CowViews, GoatViews } from './render/animalViews.js';
import { createSigns } from './render/signs.js';
import { createDecor } from './render/decor.js';
import { Splash } from './render/splash.js';
import { CameraRig } from './render/camera.js';
import { GameAudio } from './audio/audio.js';
import { wireAudio } from './audio/wire.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { buildSelect, buildMapChoice, buildDifficultyChoice } from './ui/select.js';
import { buildTutorial, buildSettings } from './ui/panels.js';
import { buildLobby } from './ui/lobby.js';
import { NetClient } from './net/client.js';
import { Replica } from './net/replica.js';
import { makeCommand } from './core/command.js';

const $ = (id) => document.getElementById(id);

// Derniers choix (héroïne, carte), gardés d'une visite à l'autre quand le navigateur le permet.
function load(key, valid, fallback) {
  try {
    const id = localStorage.getItem(key);
    if (valid[id]) return id;
  } catch {}
  return fallback;
}
function save(key, id) {
  try { localStorage.setItem(key, id); } catch {}
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Composition des équipes : les trois héroïnes de chaque côté, plus une quatrième au hasard.
function lineup(playerId) {
  const others = CHARACTER_IDS.filter((id) => id !== playerId);
  return [
    null,
    [playerId, ...others, pick(CHARACTER_IDS)],
    [...CHARACTER_IDS, pick(CHARACTER_IDS)],
  ];
}

function boot() {
  const settings = new Settings();
  setPalette(settings.get('colorblind'));

  const coarse = matchMedia('(pointer: coarse)').matches;
  const { renderer, scene, camera, setTheme, setShadows, setPost, render } = createRenderer($('app'), { coarse });
  const quality = new Quality(renderer, { coarse });
  quality.setShadows = setShadows;
  quality.setPost = setPost;
  setShadows(quality.level.shadows);
  setPost(quality.level.post);
  quality.onChange = () => dispatchEvent(new Event('resize'));   // la taille du rendu dépend de la densité de pixels
  const input = new KeyboardMouse(renderer.domElement);
  // le tactile écrit le regard dans le même objet que la souris
  const touch = new TouchControls($('touch'), input);
  const audio = new GameAudio();
  const hud = new Hud();
  const minimap = new Minimap($('minimap'));

  let mode = 'keyboard';   // devient 'touch' au premier doigt posé, redevient 'keyboard' à la première touche
  let game = null;
  let choice = load('ile.heroine', CHARACTERS, CHARACTER_IDS[0]);
  let mapId = load('ile.carte', MAPS, MAP_IDS[0]);
  let screen = 'select';   // 'select' → 'play' → 'results' ; à plusieurs : 'lobby' → 'play' → 'results' → 'lobby'
  let modal = null;        // 'tutorial' ou 'settings', par-dessus l'écran courant
  let paused = true;

  // ---- réglages ----

  const applySetting = (key, value) => {
    if (key === 'volume') audio.setVolume(value);
    else if (key === 'mouse') input.scale = value;
    else if (key === 'touch') touch.scale = value;
    else if (key === 'autoFire') touch.autoFire = value;
    else if (key === 'quality') quality.choose(value);
    else if (key === 'colorblind') {
      setPalette(value);
      hud.applyPalette();
      // derrière le menu, le décor se refait tout de suite ; en plein match, au prochain
      if (screen !== 'play') newGame();
    }
  };
  for (const key of ['volume', 'mouse', 'touch', 'autoFire', 'quality']) applySetting(key, settings.get(key));
  settings.onChange(applySetting);

  // ---- partie ----

  // Une partie en solo : un monde neuf, deux équipes, des bots partout sauf à la place du joueur.
  function newGame() {
    const map = MAPS[mapId];
    const world = new World(map, { seed: Date.now() });
    // le joueur d'abord : il prend la place 0 de son équipe et la commande 0
    const teams = lineup(choice);
    for (const team of [1, 2]) {
      for (let i = 0; i < MATCH.teamSize; i++) world.addActor({ team, character: CHARACTERS[teams[team][i]] });
    }
    const player = world.actors[0];
    world.startMatch(MATCH);

    // tous les autres acteurs sont des bots, regroupés par équipe pour se répartir le terrain
    const nav = new Nav(world.level);
    const squads = [null, [], []];
    const enemyLevel = DIFFICULTY[settings.get('difficulty')] ?? DIFFICULTY[ALLY_LEVEL];
    const bots = world.actors.slice(1).map((actor) => {
      const bot = new Bot(world, actor, nav, squads[actor.team], actor.team === player.team ? DIFFICULTY[ALLY_LEVEL] : enemyLevel);
      squads[actor.team].push(bot);
      return bot;
    });
    document.body.classList.remove('net');
    mount(world, player, { bots, net: null });
  }

  // Une partie à plusieurs : le monde est une copie de celui du serveur (voir net/replica.js).
  function netGame(start) {
    const replica = new Replica(start);
    document.body.classList.add('net');
    mount(replica.world, replica.player ?? replica.world.actors[0], { bots: [], net: replica });
  }

  // Les objets de rendu, le son et les annonces d'une partie, solo ou à plusieurs.
  function mount(world, player, { bots, net: replica }) {
    if (game) {
      scene.remove(game.root);
      game.root.traverse((o) => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      });
      game.paintTexture.texture.dispose();
    }
    const map = world.map;
    const root = new Group();
    const paintTexture = new PaintTexture(world.paint);
    root.add(createLevelView(world.paint, paintTexture, quality));
    const views = world.actors.map((a) => new ActorView(a, player.team, a === player));
    for (const v of views) root.add(v.group);
    const projectileView = new ProjectileView(world.projectiles);
    root.add(projectileView.mesh);
    const beamView = new BeamView(world.events);
    root.add(beamView.group);
    const cowViews = new CowViews(world.cows);
    const goatViews = new GoatViews(world.goats);
    const splash = new Splash(world.events);
    root.add(cowViews.group, goatViews.group, splash.mesh, createSigns(map.signs), createDecor(map));
    scene.add(root);
    setTheme(map.theme);
    minimap.attach(world, player);

    // à plusieurs, on annonce le prénom de la joueuse plutôt que le nom de son héroïne
    const nameOf = (actor) => actor.playerName ?? actor.character.name;
    world.events.on('match:debut', () => hud.announce('Peins !'));
    world.events.on('elimine', ({ actor, killer }) => {
      if (killer === player) hud.announce(`${nameOf(actor)} éliminée`);
      else if (actor === player) hud.announce(killer ? `Touchée par ${nameOf(killer)}` : 'Tombée !');
    });
    world.events.on('capacite:debut', ({ actor, kind }) => {
      if (actor === player) hud.announce(`${SPECIALS[kind].name} !`);
      else if (kind === 'plan' && actor.team !== player.team) hud.announce('Tu es repérée !');
    });
    world.events.on('chevres:lachees', ({ actor }) => {
      if (actor === player) hud.announce(`${GOATS.name} !`);
    });
    world.events.on('match:fin', (result) => {
      hud.showResults(result, player.team);
      screen = 'results';
      refresh();
      document.exitPointerLock?.();
    });
    const audioTick = wireAudio(audio, world, player);

    input.yaw = player.yaw;
    input.pitch = 0;
    game = {
      world, player, root, paintTexture, views, playerView: views[world.actors.indexOf(player)], projectileView, beamView, cowViews, goatViews, splash,
      rig: new CameraRig(camera, world.level), bots, net: replica, audioTick, commands: [],
    };
  }

  // ---- écrans ----

  // Quel écran recouvre le jeu : un panneau (tutoriel, réglages), la sélection, les résultats, la pause, ou rien.
  function refresh() {
    hud.show(modal ?? (screen === 'play' ? (paused ? 'pause' : null) : screen));
    document.body.classList.toggle('playing', screen === 'play' && !paused && !modal);
  }
  const setPaused = (value) => {
    paused = value;
    refresh();
  };
  // Reprend le jeu : au tactile directement, à la souris en la capturant
  // (si le navigateur refuse la capture, l'écran de pause reste affiché).
  function resume() {
    if (mode === 'touch') {
      touch.reset();
      setPaused(false);
      // plein écran à l'horizontale quand l'appareil le permet
      document.documentElement.requestFullscreen?.().then(() => window.screen.orientation?.lock?.('landscape')).catch(() => {});
    } else {
      input.lock();
    }
  }
  function play() {
    newGame();
    screen = 'play';
    setPaused(true);
    resume();
  }
  function quit() {
    if (game.net) net.send({ t: 'leave' });
    screen = 'select';
    newGame();
    refresh();
  }

  // ---- jeu à plusieurs ----

  const net = new NetClient();
  const lobby = buildLobby($('lobby-panel'), {
    create: (name) => enterRoom({ t: 'create', name }),
    join: (code, name) => enterRoom({ t: 'join', code, name }),
    set: (patch) => net.send({ t: 'set', ...patch }),
    config: (patch) => net.send({ t: 'config', ...patch }),
    start: () => net.send({ t: 'start' }),
    leave() {
      net.send({ t: 'leave' });
      if (game.net) newGame();
      screen = 'select';
      refresh();
    },
  });
  async function enterRoom(request) {
    lobby.busy('Connexion…');
    try {
      await net.connect();
      net.send(request);
    } catch {
      lobby.showEntry('Le serveur de jeu ne répond pas. Le jeu à plusieurs demande de lancer « node server/index.mjs ».');
    }
  }
  net.onMessage = (msg) => {
    if (msg.t === 'snap') {
      if (game.net) game.net.receive(msg);
    } else if (msg.t === 'room') {
      lobby.showRoom(msg);
      // fin de match : tout le monde revient au salon
      if (msg.state === 'lobby' && game.net && (screen === 'play' || screen === 'results')) {
        document.exitPointerLock?.();
        screen = 'lobby';
        refresh();
      }
    } else if (msg.t === 'start') {
      netGame(msg);
      screen = 'play';
      setPaused(true);
      resume();
    } else if (msg.t === 'error') {
      lobby.showEntry(msg.message);
    }
  };
  net.onClose = () => {
    lobby.showEntry('La liaison avec le serveur est perdue.');
    if (game.net) {
      document.exitPointerLock?.();
      newGame();
    }
    if (screen !== 'select') screen = 'lobby';
    refresh();
  };
  const idle = makeCommand();

  const setMode = (next) => {
    if (mode === next) return;
    mode = next;
    document.body.classList.toggle('touch', mode === 'touch');
  };
  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') setMode('touch');
    audio.unlock();   // le navigateur n'autorise le son qu'après un geste
  }, true);
  addEventListener('keydown', () => {
    // retour au clavier : sans souris capturée, le jeu se met en pause
    if (mode === 'touch' && screen === 'play' && !paused) setPaused(true);
    setMode('keyboard');
  });
  // un clic sur un bouton du menu s'entend
  addEventListener('click', (e) => { if (e.target.closest?.('button')) audio.play('clic'); }, true);

  input.onLockChange = (locked) => { if (mode === 'keyboard') setPaused(!locked); };
  // au tactile, le doigt qui met en pause produit aussi un clic sur l'écran de pause : on l'ignore
  let pausedAt = 0;
  hud.pause.addEventListener('click', (e) => {
    if (e.target.closest('button') || performance.now() - pausedAt < 400) return;
    resume();
  });
  touch.onPause = () => {
    pausedAt = performance.now();
    setPaused(true);
  };

  // tutoriel : proposé d'office avant le tout premier match
  const openTutorial = buildTutorial($('tutorial-panel'));
  const showTutorial = (then) => {
    modal = 'tutorial';
    refresh();
    openTutorial(() => {
      settings.set('tutorialSeen', true);
      modal = null;
      refresh();
      then?.();
    });
  };
  buildSettings($('settings-panel'), settings, () => {
    modal = null;
    refresh();
  });
  const showSettings = () => {
    modal = 'settings';
    refresh();
  };

  buildSelect($('cards'), (id) => {
    choice = id;
    save('ile.heroine', id);
    if (settings.get('tutorialSeen')) play();
    else showTutorial(play);
  });
  // le choix de la carte recharge le décor derrière le menu
  buildMapChoice($('maps'), mapId, (id) => {
    mapId = id;
    save('ile.carte', id);
    newGame();
  });
  buildDifficultyChoice($('levels'), settings.get('difficulty'), (id) => settings.set('difficulty', id));
  $('open-lobby').addEventListener('click', () => {
    screen = 'lobby';
    lobby.showEntry();
    refresh();
  });
  $('open-tutorial').addEventListener('click', () => showTutorial());
  $('open-settings').addEventListener('click', showSettings);
  $('pause-settings').addEventListener('click', showSettings);
  $('pause-quit').addEventListener('click', quit);
  $('replay').addEventListener('click', play);
  $('change').addEventListener('click', quit);

  newGame();
  // arrivée par un lien d'invitation : on ouvre directement l'écran du jeu à plusieurs
  if (new URLSearchParams(location.search).has('salon')) {
    screen = 'lobby';
    lobby.showEntry();
  }
  refresh();

  createLoop({
    dt: STEP,
    step(dt) {
      if (game.net) {
        // à plusieurs, le match ne s'arrête pas : en pause, on envoie « ne rien faire »
        if (screen !== 'play') return;
        let cmd = idle;
        if (!paused && !modal) cmd = mode === 'touch' ? touch.command(game.world, game.player, dt) : input.command();
        idle.yaw = input.yaw;
        idle.pitch = input.pitch;
        const msg = game.net.command(cmd);
        if (msg) net.send(msg);
        game.world.projectiles.step(dt);
        return;
      }
      if (paused || screen !== 'play' || modal) return;
      game.commands[0] = mode === 'touch' ? touch.command(game.world, game.player, dt) : input.command();
      for (let i = 0; i < game.bots.length; i++) game.commands[i + 1] = game.bots[i].command(dt);
      game.world.step(game.commands, dt);
    },
    render(alpha, dt) {
      const running = screen === 'play' && (game.net !== null || (!paused && !modal));
      const a = running ? alpha : 1;
      if (game.net) game.net.update(dt);
      for (const v of game.views) v.update(a, dt, !quality.level.shadows);
      game.projectileView.update();
      game.beamView.update(dt);
      game.cowViews.update(a, dt);
      game.goatViews.update(a, dt);
      game.splash.update(dt);
      game.rig.update(game.playerView, game.player, dt);
      game.paintTexture.update(renderer);
      render();
      hud.update(game.world, game.player, dt);
      minimap.update(dt);
      if (running) {
        game.audioTick();
        quality.frame(dt);
      }
    },
  }).start();

  // accès depuis la console du navigateur, pour le réglage
  window.ile = {
    get world() { return game.world; },
    get player() { return game.player; },
    get bots() { return game.bots; },
    get net() { return game.net; },
    input,
    touch,
    audio,
    renderer,
    quality,
    settings,
    setPaused,
    // lance une partie sans passer par les menus : ile.start('emma', 'salon')
    start(id = choice, map = mapId) {
      choice = id;
      mapId = map;
      newGame();
      screen = 'play';
      modal = null;
      setPaused(false);
    },
  };
}

try {
  boot();
} catch (err) {
  const box = $('boot-error');
  box.textContent = `Le jeu n'a pas pu démarrer : ${err.message}`;
  box.style.display = 'block';
  throw err;
}
