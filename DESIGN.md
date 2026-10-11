# ILE — Architecture

Version 1 — 10 octobre 2026. Répond à [SPEC.md](SPEC.md).

## 1. Choix structurants

| # | Décision | Raison |
|---|---|---|
| D1 | **Three.js en modules ES, sans étape de build.** Three.js est copié dans `vendor/` et chargé par importmap. | Site statique (N6). La machine de développement a Node 22 mais pas npm, donc pas de bundler. Serveur local : `python3 -m http.server`. |
| D2 | **Simulation à pas fixe (60 Hz), rendu interpolé.** | Physique et équilibrage identiques sur un PC à 144 Hz et un téléphone à 30 images/s (N1, N3). |
| D3 | **La peinture vit dans une grille côté CPU, qui est la seule source de vérité.** La texture affichée en est dérivée. | Le score, la vitesse, les dégâts, l'escalade et les bots lisent tous la peinture : une lecture de grille est instantanée, relire une texture GPU ne l'est pas. |
| D4 | **Le monde est fait de boîtes alignées sur les axes, plus des rampes.** Pas de moteur physique. | Collisions, lancers de rayon et placement de la peinture deviennent simples et rapides, y compris sur mobile. |
| D5 | **Joueur et bots sont le même objet `Acteur`, piloté par une `Commande` d'entrée.** Clavier, tactile et IA produisent tous la même structure. | Les bots jouent les trois héroïnes sans code dupliqué (F12). Un futur mode en ligne ou la manette se branchent au même endroit. |
| D6 | **Personnages, armes, capacités et carte sont des données**, pas du code. | L'équilibrage (N3) se fait en modifiant des chiffres dans un seul fichier. |
| D7 | **La simulation ne connaît ni le rendu, ni le son, ni l'interface.** Elle émet des événements ; les autres couches écoutent. | La logique de jeu se teste dans Node sans navigateur (`node --test`). |
| D8 | **Menus et affichage en jeu en HTML/CSS** par-dessus le canvas 3D. | Texte net, mise en page adaptative et boutons tactiles sans effort (F13–F16, N4). |

## 2. Vue d'ensemble

```
            ┌────────────────────── ENTRÉES ──────────────────────┐
            │  clavier/souris     tactile         IA des bots     │
            └───────┬────────────────┬─────────────────┬──────────┘
                    └────────── Commande ──────────────┘
                                     │
┌────────────────────────── SIMULATION (pas fixe) ──────────────────────────┐
│  Acteurs ── Armes ── Projectiles ── Capacités ── Vaches ── Match (chrono) │
│      │                    │                         │                     │
│      └── Collisions ──────┴──── Grille de peinture ─┘                     │
│                    (boîtes du niveau)                                     │
└───────────────┬──────────────────────────────────────┬────────────────────┘
                │ état (lu à chaque image)             │ événements
        ┌───────▼────────┐                 ┌───────────▼───────────┐
        │     RENDU      │                 │  SON · EFFETS · HUD   │
        │ scène, caméra, │                 │ minimap, jauges,      │
        │ texture peinte │                 │ écrans de menu        │
        └────────────────┘                 └───────────────────────┘
```

Règle de dépendance : les flèches ne remontent jamais. La simulation n'importe rien du rendu, du son ni de l'interface.

## 3. Organisation des fichiers

```
ile/
├── index.html
├── vendor/three/            Three.js (copie figée)
├── assets/                  portraits, sons, polices
├── styles/ui.css
├── src/
│   ├── main.js              démarrage, machine à états des écrans
│   ├── config/
│   │   ├── tuning.js        physique, peinture, match (toutes les constantes)
│   │   ├── characters.js    Ines, Louisa, Emma
│   │   ├── weapons.js       double pistolet, tir chargé, rouleau
│   │   ├── specials.js      Charge, Plan de bataille, Cercle d'entraide
│   │   └── maps/ferme.js    boîtes, rampes, bases, trajets des vaches, points de passage
│   ├── core/                boucle à pas fixe, bus d'événements, maths, réglages
│   ├── sim/                 AUCUNE dépendance au navigateur
│   │   ├── world.js         état complet d'un match
│   │   ├── level.js         boîtes + index spatial, lancers de rayon
│   │   ├── paint.js         grille de peinture, score
│   │   ├── actor.js         déplacement, formes, vie, peinture, réapparition
│   │   ├── weapons.js       logique de tir par type d'arme
│   │   ├── projectiles.js   trajectoires, impacts
│   │   ├── specials.js      les trois capacités
│   │   ├── cows.js          déplacement et état peint des vaches
│   │   └── match.js         décompte, chrono, fin, résultat
│   ├── ai/
│   │   ├── nav.js           graphe de points de passage, recherche de chemin
│   │   └── bot.js           choix d'objectif, visée, production de Commande
│   ├── input/
│   │   ├── keyboard.js      clavier + souris (verrouillage du pointeur)
│   │   └── touch.js         joystick virtuel, zone de visée, boutons
│   ├── render/
│   │   ├── renderer.js      scène, lumières, niveaux de qualité
│   │   ├── levelView.js     maillages du niveau + matériau peint
│   │   ├── paintTexture.js  grille → texture, par zones modifiées
│   │   ├── actorView.js     héroïnes, chats, vaches
│   │   ├── camera.js        caméra à l'épaule
│   │   └── fx.js            éclaboussures, traînées, zones de capacité
│   ├── audio/audio.js       Web Audio
│   └── ui/                  menu, sélection, HUD, minimap, résultats, tutoriel, réglages
└── tests/                   tests Node de src/sim et src/ai
```

## 4. Composants clés

### 4.1 Boucle et états du jeu

Machine à états des écrans :

```
Démarrage → Menu ⇄ Réglages / Tutoriel
              ↓
          Sélection du personnage → Match → Résultats → Menu
                                     │
                    Décompte → En jeu → Terminé      (Pause possible en jeu)
```

À chaque image : lire les entrées → avancer la simulation par pas de 1/60 s (0 à 4 pas selon le temps écoulé) → dessiner en interpolant entre les deux derniers états. La pause arrête simplement les pas.

### 4.2 Commande (le point de jonction, D5)

Une `Commande` décrit ce qu'un acteur veut faire pendant un pas :

| Champ | Contenu |
|---|---|
| `move` | direction voulue (x, z), longueur 0 à 1 |
| `yaw`, `pitch` | orientation de la visée |
| `fire`, `fireReleased` | tir maintenu / relâché (le relâchement déclenche le tir chargé) |
| `cat` | forme chat maintenue |
| `jump` | saut |
| `special` | déclenchement de la capacité |

Trois producteurs : `keyboard.js`, `touch.js`, `bot.js`. L'acteur ne sait pas lequel le pilote.

### 4.3 Peinture (D3) — le cœur du jeu

**Grille.** Chaque face peignable (dessus et côtés des boîtes, rampes) reçoit un rectangle dans un atlas unique. Une cellule mesure environ 12 cm et contient un octet : 0 = vierge, 1 = équipe A, 2 = équipe B. Un second tableau ne garde que les cellules qui comptent pour le score (le sol praticable, pas les murs).

**Opérations.**
- `splat(position, normale, rayon, équipe, forme)` : peint un disque irrégulier (ou une bande pour le rouleau) et renvoie la surface gagnée, qui alimente la jauge de capacité (F11).
- `teamAt(position, normale)` : équipe sous un point. Utilisé par les acteurs (vitesse, dégâts, recharge, escalade) et par les bots.
- `coverage()` : pourcentages par équipe, tenus à jour à chaque `splat` et non recalculés.

**Affichage.** La grille est copiée dans une texture, uniquement sur les rectangles modifiés pendant l'image. Le matériau du niveau lit cette texture avec un second jeu de coordonnées et lisse les bords pour obtenir des taches arrondies plutôt que des carrés. La résolution de la texture dépend du niveau de qualité ; la grille de jeu, elle, ne change jamais (N1 sans toucher à N3).

**Vaches (F18).** Une vache n'est pas dans la grille. Elle porte une seule valeur `équipe`, modifiée par tout impact, et ajoute une surface fixe au score de son propriétaire.

### 4.4 Niveau et collisions (D4)

`level.js` charge la liste de boîtes et de rampes de `maps/ferme.js` et les range dans une grille spatiale 2D. Il offre : lancer de rayon (projectiles, visée, ligne de vue des bots), résolution capsule-contre-boîtes (acteurs, vaches), et requête de sol sous un point.

La grange, les enclos, les bottes de foin, le tracteur et le silo (F19) sont tous des assemblages de boîtes pour la collision, habillés par des maillages décoratifs côté rendu.

### 4.5 Acteur

Un acteur porte : position, vitesse, forme (`humaine` ou `chat`), vie, réservoir de peinture, jauge de capacité, équipe, référence à son personnage, état de son arme, état de réapparition.

À chaque pas : lire la `Commande` → choisir la forme → calculer la vitesse cible selon la forme et la peinture sous les pieds → intégrer et résoudre les collisions → appliquer dégâts de peinture adverse, régénération et recharge → faire tirer l'arme → mettre à jour la capacité.

Règles de forme (F6–F8) :

| Situation | Effet |
|---|---|
| Chat dans sa peinture | vitesse maximale, recharge rapide, peu visible |
| Chat contre un mur peint à sa couleur | monte le long du mur |
| Chat hors peinture | lent |
| N'importe quelle forme dans la peinture adverse | très lent, dégâts plafonnés |
| Forme humaine | peut tirer ; recharge lente après un délai |

### 4.6 Personnages, armes, capacités (D6)

`characters.js` ne contient que des données : nom, portrait, multiplicateurs (vitesse, vie, taille), identifiant d'arme, identifiant de capacité, poids de comportement pour l'IA.

| | Ines | Louisa | Emma |
|---|---|---|---|
| Vitesse | ×1,0 | ×1,15 | ×0,88 |
| Vie | 120 | 80 | 140 |
| Taille | ×1,0 | ×1,0 | ×1,15 |
| Arme | `double` | `charge` | `rouleau` |
| Capacité | `ruee` | `plan` | `cercle` |

Ces valeurs sont des points de départ pour l'équilibrage.

**Armes** : trois types, chacun une fonction de `sim/weapons.js` paramétrée par `config/weapons.js`.
- `double` : tir automatique à courte portée, dispersion, pas d'esquive latérale sur double appui.
- `charge` : la puissance, la portée et la largeur du trait de peinture croissent avec la durée de maintien ; tir instantané en ligne droite au relâchement.
- `rouleau` : en avançant, peint une bande large et blesse au contact ; un appui bref projette une gerbe devant soi.

**Capacités** : chacune a `start`, `update`, `end` et une durée.
- `ruee` (Ines) : déplacement forcé en ligne droite, invulnérabilité, traînée peinte, recul des ennemis touchés.
- `plan` (Louisa) : pose un drapeau `révélé` sur tous les ennemis ; le rendu et la minimap l'utilisent pour les afficher à travers les murs.
- `cercle` (Emma) : zone attachée à Emma ; chaque pas, soigne les alliés à l'intérieur et recharge leur peinture.

### 4.7 IA des bots (F12)

**Navigation.** `ferme.js` fournit un graphe de points de passage posés à la main (y compris les rampes et les murs à escalader). Recherche de chemin A* sur ce graphe, puis déplacement direct vers le point suivant avec évitement local.

**Décision.** Toutes les demi-secondes environ, le bot note quelques objectifs et prend le meilleur :

| Objectif | Monte quand… |
|---|---|
| Peindre | une zone proche est vierge ou adverse |
| Attaquer | un ennemi est visible et à portée de son arme |
| Se replier | vie ou peinture basse → rejoint sa peinture en forme chat |
| Soutenir | un allié proche est blessé (fort pour Emma) |
| Capacité | la jauge est pleine et la situation s'y prête |

Les poids par personnage (`characters.js`) donnent aux bots le caractère de leur héroïne : Ines attaque, Louisa garde ses distances, Emma reste près des alliés.

**Crédibilité.** Temps de réaction, erreur de visée et champ de vision limités, réglés par un niveau de difficulté unique.

### 4.8 Vaches

Chaque vache suit une boucle de points de passage définie dans la carte, lentement, avec des pauses. Les trajets évitent par construction les bases et les passages uniques ; si une vache est bloquée par un acteur, elle attend plutôt que de pousser (critère d'acceptation « ne bloque jamais durablement »).

### 4.9 Entrées

**Clavier/souris (F14).** ZQSD et flèches, souris pour viser avec verrouillage du pointeur, clic gauche pour tirer, Maj pour la forme chat, Espace pour sauter, E pour la capacité. Touches reconfigurées selon la position physique, donc compatibles AZERTY et QWERTY.

**Tactile (F15).** Moitié gauche : joystick virtuel flottant. Moitié droite : glisser pour viser. Boutons : tir, chat, saut, capacité. Deux aides réservées au tactile : légère assistance à la visée et, en option, tir automatique quand un ennemi est dans le viseur.

Le mode est détecté au premier contact (touche ou doigt) et peut basculer en cours de partie.

### 4.10 Rendu

- **Caméra** à l'épaule, qui évite les murs par lancer de rayon et s'abaisse en forme chat.
- **Héroïnes** : modèles stylisés à faible nombre de polygones, construits à partir d'un gabarit commun et de paramètres par personnage (taille, coiffure, couleurs, accessoire). Les portraits 2D de l'écran de sélection sont des dessins d'après photos (N8) ; aucune photo n'entre dans le dépôt.
- **Chats** : un modèle commun, teinté et accessoirisé selon l'héroïne (F17).
- **Trois niveaux de qualité** (N1) : résolution d'affichage, ombres, résolution de la texture de peinture, nombre de particules. Choix automatique au démarrage selon l'appareil, puis ajustement si la cadence chute ; réglable à la main.

### 4.11 Interface, son, sauvegarde

- **HUD** (F13) : chrono, barre de score des deux équipes, jauge de peinture, jauge de capacité, minimap dessinée sur un petit canvas 2D à partir de la grille de peinture.
- **Écrans** : accueil, sélection (trois cartes personnage : portrait, rôle, arme, capacité), réglages, tutoriel en quelques panneaux, résultats avec pourcentages (F3).
- **Son** : Web Audio, sons courts déclenchés par les événements de la simulation, démarré au premier geste de l'utilisateur.
- **Sauvegarde** : réglages et dernier personnage choisi dans `localStorage`. Aucun compte, aucune donnée envoyée (N2, N6).
- **Textes** en français, regroupés dans un seul fichier.

## 5. Événements émis par la simulation

| Événement | Écouté par |
|---|---|
| `tir`, `impact` | effets, son |
| `peinture` (rectangle modifié) | texture de peinture, minimap |
| `touché`, `éliminé`, `réapparu` | effets, son, HUD |
| `capacité:prête`, `capacité:début`, `capacité:fin` | HUD, effets, son |
| `vache:peinte` | rendu des vaches, son |
| `match:décompte`, `match:début`, `match:fin` | écrans, son |

## 6. Couverture des exigences

| Exigences | Composant |
|---|---|
| F1–F4 match | `sim/match.js`, `sim/actor.js` (réapparition), `ui/results` |
| F5–F8 peinture | `sim/paint.js`, `sim/actor.js`, `render/paintTexture.js` |
| F9–F12 personnages | `config/characters.js`, `sim/weapons.js`, `sim/specials.js`, `ai/bot.js`, `ui/select` |
| F13–F16 interface | `ui/`, `input/` |
| F17–F20 univers | `render/actorView.js`, `sim/cows.js`, `config/maps/ferme.js` |
| N1 performance | pas fixe (D2), boîtes (D4), niveaux de qualité |
| N2 chargement | pas de build, peu de ressources, modèles construits par le code |
| N3 équilibrage | données centralisées (D6), simulation testable (D7) |
| N6 statique | D1 |

Extensions prévues sans refonte : manette (un quatrième producteur de `Commande`), autres cartes (un fichier de plus dans `maps/`), en ligne (remplacer les bots par des `Commande` reçues du réseau).

## 7. Risques

| Risque | Parade |
|---|---|
| La peinture coûte trop cher sur téléphone | Grille CPU légère ; seule la résolution de la texture baisse. À valider en premier. |
| L'escalade des murs en forme chat est délicate à rendre agréable | Limitée aux faces verticales de boîtes ; prototypée dès l'étape 2. |
| Bots peu crédibles ou coincés | Points de passage posés à la main, détection de blocage avec recalcul du chemin. |
| Viser au tactile est difficile | Assistance à la visée et tir automatique optionnel. |
| Trois héroïnes déséquilibrées | Matchs bots contre bots lancés en accéléré dans Node pour comparer les taux de victoire. |

## 8. Ordre de construction

1. **Socle** : boucle à pas fixe, niveau en boîtes, un acteur qui court et saute, caméra, clavier/souris.
2. **Peinture** : grille, texture, une arme, forme chat, nage et escalade. C'est le point de validation du jeu : si cette étape est agréable, le reste suit.
3. **Match** : équipes, vie, élimination, réapparition, chrono, score, résultats.
4. **Bots** : navigation puis décision.
5. **Trois héroïnes** : les trois armes, les trois capacités, écran de sélection.
6. **Ferme** : carte définitive, vaches, décor.
7. **Tactile** et niveaux de qualité, tests sur téléphone.
8. **Finition** : avatars d'après photos, son, tutoriel, réglages, équilibrage.

## 9. Jeu à plusieurs (ajouté après la version solo)

La simulation n'ayant aucune dépendance au navigateur, elle tourne telle quelle sur un serveur Node, qui fait foi.

- **Serveur** (`server/`) : `index.mjs` distribue le site et accepte les WebSockets sur `/jeu` ; `ws.mjs` est une implémentation minimale du protocole, sans dépendance ; `room.mjs` tient un salon et son match (un `World`, des `Bot` aux places libres, 60 pas par seconde).
- **Protocole** (`src/net/protocol.js`, partagé) : messages JSON. Chaque joueur envoie une Commande numérotée par pas. Le serveur envoie 20 instantanés par seconde : état des actrices, chèvres et vaches, plus les taches de peinture, projectiles tirés et événements survenus depuis le précédent.
- **Peinture** : le serveur n'envoie pas la grille, mais la liste des taches, arrondies avant d'être peintes. Chaque appareil les rejoue dans le même ordre sur sa propre grille, qui reste identique à celle du serveur (vérifié par un test).
- **Copie locale** (`src/net/replica.js`) : un `World` dont les actrices sont des « marionnettes ». Le rendu, le son et l'interface le lisent exactement comme en solo. Notre héroïne est déplacée tout de suite par prédiction, puis recalée à chaque instantané (retour à l'état du serveur, puis rejeu des commandes qu'il n'a pas encore traitées) ; les autres sont interpolées avec deux instantanés de retard. Les projectiles volent localement pour l'œil seulement.
- **Ce qui vient d'Internet est vérifié** : forme et bornes des commandes, valeurs autorisées pour carte, héroïne et difficulté, prénoms nettoyés, taille et débit des messages, nombre de salons et de connexions.

Limites assumées : un seul processus (salons en mémoire), pas de reprise après déconnexion (un bot prend la place), pas d'arrivée en cours de match (on attend le suivant au salon), pas de compensation de latence pour les tirs (le serveur juge avec la position qu'il connaît).
