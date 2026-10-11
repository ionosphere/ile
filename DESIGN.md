# ILE — Architecture

Version 2 — 11 octobre 2026. Décrit le jeu tel qu'il est construit ; répond à [SPEC.md](SPEC.md).

## 1. Choix structurants

| # | Décision | Raison |
|---|---|---|
| D1 | **Three.js en modules ES, sans étape de build ni dépendance.** Three.js est copié dans `vendor/` et chargé par importmap ; le serveur n'utilise que la bibliothèque standard de Node. | Rien à installer : `node server/index.mjs` suffit. Le solo reste un site statique. |
| D2 | **Simulation à pas fixe (60 par seconde), rendu interpolé.** | Physique et équilibrage identiques sur un PC à 144 Hz et un téléphone à 30 images par seconde (N1, N3). |
| D3 | **La peinture vit dans une grille d'octets, seule source de vérité.** La texture affichée en est dérivée. | Le score, la vitesse, les dégâts, l'escalade et les bots lisent tous la peinture : lire une grille est instantané, relire une texture ne l'est pas. |
| D4 | **Le monde est fait de boîtes alignées sur les axes.** Les pentes sont des escaliers de marches de 30 cm, franchies sans sauter. Pas de moteur physique. | Collisions, lancers de rayon et placement de la peinture restent simples et rapides, y compris sur téléphone. |
| D5 | **Joueuse et bots sont le même objet `Actor`, piloté par une `Commande`.** Clavier, tactile, bots et réseau produisent tous la même structure. | Les bots jouent les trois héroïnes sans code dupliqué (F12), et le jeu à plusieurs s'est branché au même endroit (F23). |
| D6 | **Héroïnes, armes, capacités, animaux, cartes et niveaux de difficulté sont des données**, dans `src/config/`. | L'équilibrage (N3) se fait en modifiant des chiffres. |
| D7 | **La simulation ne connaît ni le rendu, ni le son, ni l'interface, ni le navigateur.** Elle émet des événements ; les autres couches écoutent. | Elle se teste dans Node (`node --test`) et tourne telle quelle sur le serveur de jeu. |
| D8 | **Menus et affichage en jeu en HTML/CSS** par-dessus le canvas 3D. | Texte net, mise en page adaptative et boutons tactiles (F13–F16, N4). |
| D9 | **Tout le visuel et tout le son sont fabriqués par le programme** : matières, personnages, animaux, décor, sons. | Aucune image ni modèle à télécharger (N2), et aucune photo dans le jeu (N8). |
| D10 | **À plusieurs, le serveur fait foi.** Chaque appareil tient une copie du match, prédit sa propre héroïne et interpole les autres. | Un seul arbitre, donc pas de triche par l'appareil ni de désaccord entre joueurs. |

## 2. Vue d'ensemble

```
            ┌──────────────────────── ENTRÉES ────────────────────────┐
            │  clavier/souris     tactile      bots      réseau       │
            └───────┬───────────────┬───────────┬──────────┬──────────┘
                    └────────────── Commande ──────────────┘
                                       │
┌─────────────────────────── SIMULATION (pas fixe) ───────────────────────────┐
│  Actrices ─ Armes ─ Projectiles ─ Capacités ─ Vaches ─ Chèvres ─ Match      │
│      │                  │                        │                          │
│      └── Collisions ────┴─── Grille de peinture ─┘                          │
│                  (boîtes du niveau)                                         │
└───────────────┬───────────────────────────────────────┬─────────────────────┘
                │ état (lu à chaque image)              │ événements
        ┌───────▼────────┐                  ┌───────────▼───────────┐
        │     RENDU      │                  │   SON · EFFETS · HUD  │
        └────────────────┘                  └───────────────────────┘
```

Les flèches ne remontent jamais : la simulation n'importe rien du rendu, du son ni de l'interface.

En solo, la simulation tourne dans le navigateur. À plusieurs, elle tourne sur le serveur, et le navigateur affiche une copie (section 5).

## 3. Organisation des fichiers

```
ile/
├── index.html
├── styles/ui.css
├── vendor/three/            Three.js r160 (copie figée)
├── Dockerfile               image de mise en ligne
├── server/                  serveur Node, sans dépendance
│   ├── index.mjs            fichiers du site, WebSockets sur /jeu, garde-fous
│   ├── ws.mjs               protocole WebSocket minimal
│   └── room.mjs             un salon et son match
├── src/
│   ├── main.js              démarrage, écrans, boucle, assemblage d'une partie
│   ├── config/
│   │   ├── tuning.js        physique, match, visée, tactile, peinture, équipes, difficulté
│   │   ├── characters.js    Ines, Louisa, Emma : stats, apparence (`look`), réglages de bot
│   │   ├── weapons.js       double pistolet, tir chargé, rouleau
│   │   ├── specials.js      Charge, Plan de bataille, Cercle d'entraide
│   │   ├── animals.js       vaches, lâcher de chèvres
│   │   └── maps/            ferme.js, salon.js, enclos.js (carte d'essai des tests), util.js
│   ├── core/                boucle à pas fixe, événements, Commande, réglages enregistrés
│   ├── sim/                 AUCUNE dépendance au navigateur
│   │   ├── world.js         état complet d'un match
│   │   ├── level.js         boîtes, lancers de rayon, collisions
│   │   ├── paint.js         grille de peinture, score
│   │   ├── actor.js         déplacement, formes, vie, réservoir, réapparition
│   │   ├── weapons.js       logique de tir par type d'arme
│   │   ├── projectiles.js   trajectoires, impacts
│   │   ├── specials.js      les trois capacités
│   │   ├── cows.js          vaches
│   │   ├── goats.js         lâcher de chèvres
│   │   └── match.js         décompte, chrono, résultat
│   ├── ai/
│   │   ├── nav.js           grille de navigation à étages, calculée d'après le niveau ; A*
│   │   └── bot.js           peindre, attaquer, recharger ; production de Commande
│   ├── net/
│   │   ├── protocol.js      format des messages, partagé avec le serveur
│   │   ├── client.js        liaison WebSocket
│   │   └── replica.js       copie locale d'un match joué sur le serveur
│   ├── input/               keyboard.js (clavier, souris), touch.js (manette virtuelle, boutons)
│   ├── render/
│   │   ├── renderer.js      scène, ciel, lumières, ombres
│   │   ├── post.js          finition de l'image (halo, vignettage)
│   │   ├── quality.js       niveaux de qualité, baisse automatique
│   │   ├── levelView.js     maillage du niveau, matières calculées, peinture
│   │   ├── paintTexture.js  grille → texture, par zones modifiées
│   │   ├── human.js         héroïnes : corps articulé, tenue, coiffure, animation
│   │   ├── models.js        chats, vaches, chèvres
│   │   ├── actorView.js     héroïne ou chat, arme, repères
│   │   ├── animalViews.js   vaches et chèvres
│   │   ├── decor.js         campagne autour de la ferme, hall du salon
│   │   ├── signs.js         enseignes des stands
│   │   ├── projectileView.js, beamView.js, splash.js
│   │   └── camera.js        caméra à l'épaule
│   ├── audio/               audio.js (sons synthétisés), wire.js (branchement sur les événements)
│   └── ui/                  hud.js, minimap.js, select.js, lobby.js, panels.js (tutoriel, réglages)
├── tests/                   tests Node : simulation, bots, héroïnes, cartes, réseau
├── tools/                   balance.mjs (matchs de bots en accéléré), avatars.html (planche des héroïnes)
└── doc/                     photos de référence — jamais publiées, absentes du dépôt
```

## 4. Composants clés

### 4.1 Boucle et écrans

```
Sélection (carte, difficulté, héroïne) ──► Match ──► Résultats ──► Sélection
        │                                    ▲
        └─► Salon (à plusieurs) ─────────────┘──► Résultats ──► Salon
Tutoriel et Réglages s'ouvrent par-dessus l'écran courant. Pause possible en match.
```

À chaque image : lire les entrées, avancer la simulation par pas de 1/60 s (0 à 4 pas), dessiner en interpolant entre les deux derniers états. En solo, la pause arrête les pas ; à plusieurs, le match continue et la joueuse en pause ne fait rien.

### 4.2 Commande (D5)

| Champ | Contenu |
|---|---|
| `move` | direction voulue (x : droite, z : avant), longueur 0 à 1 |
| `yaw`, `pitch` | orientation du regard |
| `fire` | tir maintenu (le relâchement déclenche le tir chargé) |
| `cat` | forme chat maintenue |
| `jump` | saut ; en tirant au double pistolet, esquive |
| `special` | capacité de l'héroïne |
| `goats` | lâcher de chèvres |

### 4.3 Peinture (D3)

**Grille.** Chaque face peignable des boîtes (dessus, et côtés pour celles qui le permettent) occupe un rectangle dans un atlas unique. Une cellule mesure 12,5 cm et contient un octet : 0 vierge, 1 ou 2 l'équipe. Seuls les dessus comptent pour le score ; les cellules recouvertes par une autre boîte ne comptent pas et ne se peignent pas.

**Opérations.** `splat(x, y, z, rayon, équipe, graine)` peint une tache irrégulière sur toutes les faces proches et renvoie la surface gagnée, qui alimente les jauges. `teamAt(...)` donne l'équipe sous un point. `coverage()` donne les parts de terrain, tenues à jour à chaque tache.

**Affichage.** La grille est copiée dans une texture, uniquement sur le rectangle modifié. Le matériau du niveau la lit, lisse et fait onduler les bords, et rend la peinture brillante, avec un bourrelet sur son pourtour.

**Vaches.** Une vache n'est pas dans la grille : elle porte une équipe et ajoute une surface fixe au score de celle-ci (`paint.extra`).

### 4.4 Niveau et collisions (D4)

Une carte est une liste de boîtes colorées, décrite pour une moitié et complétée par symétrie. La couleur d'une boîte désigne aussi sa matière (béton, pierre, tuiles…). `level.js` offre le lancer de rayon et la collision d'un cylindre contre les boîtes, avec franchissement des marches. Les toits sont des gradins de boîtes : on peut y monter et les peindre.

### 4.5 Actrice

À chaque pas : lire la Commande, mettre à jour capacité et chèvres, choisir la forme, faire tirer l'arme, calculer la vitesse selon la forme et la peinture sous les pieds, déplacer et résoudre les collisions, puis mettre à jour réservoir et vie.

| Situation | Effet |
|---|---|
| Chat dans sa peinture | vitesse maximale, recharge rapide, vie qui remonte vite, peu visible |
| Chat contre un mur peint à sa couleur | grimpe |
| Chat hors peinture | lent |
| Dans la peinture adverse | très lent, dégâts plafonnés |
| Forme humaine | peut tirer ; recharge lente après un délai |

### 4.6 Héroïnes, armes, capacités, chèvres (D6)

| | Ines | Louisa | Emma |
|---|---|---|---|
| Vitesse | ×1,0 | ×1,15 | ×0,88 |
| Vie | 120 | 80 | 140 |
| Taille | ×1,0 | ×1,0 | ×1,15 |
| Arme | double pistolet (tir automatique, esquive) | tir chargé (trait instantané) | rouleau (bande large, gerbe à l'appui) |
| Capacité | Charge : ruée invulnérable qui peint et bouscule | Plan de bataille : révèle les adversaires | Cercle d'entraide : soigne et recharge les alliées |

Deux jauges se remplissent en peignant : celle de la capacité (150 m²) et celle du lâcher de chèvres (170 m²), commun aux trois. Les trois chèvres courent 10 secondes, peignent sous leurs pattes et grimpent aux murs.

### 4.7 Bots (F12, F22)

**Navigation.** `nav.js` calcule seul, d'après les boîtes du niveau, une grille de cases praticables sur plusieurs étages, n'en garde que la plus grande partie d'un seul tenant, et y cherche les chemins par A*.

**Décision.** Trois modes : peindre (vers une zone qui n'est pas à son équipe, en se répartissant entre coéquipières), attaquer (une adversaire visible et à portée de son arme), recharger (réservoir ou vie bas : rejoindre sa peinture en chat). Les réglages `ai` de chaque héroïne lui donnent son caractère : Ines va au contact, Louisa garde ses distances, Emma reste près des alliées.

**Niveau.** `DIFFICULTY` (dans `tuning.js`) règle la précision, le temps de réaction, la dispersion du tir, la part du temps passée à hésiter et l'attente avant d'utiliser une jauge pleine. Le choix du joueur s'applique aux adversaires ; les coéquipières jouent en Normale.

### 4.8 Animaux

Les vaches suivent lentement une boucle de points définie dans la carte, avec des pauses, et attendent plutôt que de pousser quelqu'un. Elles arrêtent les tirs et prennent la couleur de la dernière équipe qui les a touchées.

### 4.9 Entrées

**Clavier/souris.** ZQSD ou flèches, souris capturée pour viser, clic pour tirer, Maj forme chat, Espace saut, E capacité, F chèvres. Les touches sont lues par position physique, donc AZERTY et QWERTY fonctionnent sans réglage.

**Tactile.** Manette virtuelle à gauche, glisser à droite pour viser, boutons pour le reste. Deux aides : le viseur est légèrement attiré vers les adversaires, et le tir peut partir seul quand l'une d'elles est dedans.

Le mode bascule au premier doigt posé ou à la première touche.

### 4.10 Rendu (D9)

- **Lumière** : soleil avec ombres portées, ciel à nuages calculé, reflets tirés d'une image floue du ciel, tons ajustés à la façon d'une pellicule.
- **Matières** : dessinées par le programme d'affichage du niveau (béton rainuré, moellons, planches, tôle, tuiles, parquet…), estompées au loin pour ne pas scintiller ; les murs s'assombrissent vers leur pied.
- **Héroïnes** (`human.js`) : corps aux proportions réalistes, articulé aux hanches, genoux, épaules et coudes. `look` décrit la coiffure, les lunettes, le haut, la coupe du pantalon et les chaussures, d'après les photos. Le visage est le même pour les trois (N8). L'équipe se lit sur le foulard, les brassards, les gants, le réservoir, l'arme et un repère au-dessus de la tête. Les formes fixes d'un même membre sont fusionnées en un seul maillage par matière.
- **Animation** : calculée, par couches (foulée, rotation du bassin, buste, bras qui tiennent l'arme, tête, cheveux). Les chèvres galopent, les vaches broutent, les chats trottent et bondissent.
- **Qualité** : Basse (aspect simple), Moyenne (matières, ombre de contact sous les personnages), Haute (ombres portées, halo et vignettage). Choix selon l'appareil, baisse automatique si l'affichage rame, réglable à la main.

### 4.11 Interface, son, sauvegarde

- **HUD** : chrono, score des deux équipes, réservoir, jauges de capacité et de chèvres, minimap tirée de la grille de peinture, annonces.
- **Écrans** : sélection (cartes, difficulté, trois fiches d'héroïne à portrait dessiné), salon du jeu à plusieurs, pause, résultats, tutoriel, réglages.
- **Son** : Web Audio, sons synthétisés déclenchés par les événements, atténués avec la distance.
- **Sauvegarde** : réglages, dernière héroïne, dernière carte et prénom dans le stockage du navigateur. Aucun compte.

## 5. Jeu à plusieurs (D10)

- **Serveur** : `index.mjs` distribue `index.html`, `styles/`, `src/` et `vendor/`, rien d'autre, et accepte les WebSockets sur `/jeu`. `room.mjs` tient un salon (joueuses, équipes, carte, difficulté, hôte) et son match : un `World`, des `Bot` aux places libres, 60 pas par seconde.
- **Protocole** : messages JSON. Chaque joueuse envoie une Commande numérotée par pas. Le serveur envoie 20 instantanés par seconde : état des actrices, des chèvres et des vaches, plus les taches de peinture, les projectiles tirés et les événements survenus depuis le précédent.
- **Peinture** : le serveur n'envoie pas la grille mais la liste des taches, arrondies avant d'être peintes. Chaque appareil les rejoue dans le même ordre : sa grille reste identique à celle du serveur, ce qu'un test vérifie.
- **Copie locale** (`replica.js`) : un `World` dont les actrices sont des marionnettes. Le rendu, le son et l'interface le lisent exactement comme en solo. Notre héroïne est déplacée tout de suite par prédiction, puis recalée à chaque instantané : retour à l'état du serveur, rejeu des commandes qu'il n'a pas encore traitées, écart visuel résorbé en douceur. Les autres sont interpolées avec deux instantanés de retard. Les projectiles volent localement, pour l'œil seulement.
- **Ce qui vient d'Internet est vérifié** : forme et bornes des commandes, valeurs autorisées pour la carte, l'héroïne et la difficulté, prénoms nettoyés, taille et débit des messages, origine de la page, nombre de salons et de connexions.

Limites assumées : un seul processus (salons en mémoire) ; pas de reprise après déconnexion (un bot prend la place) ; pas d'arrivée en cours de match (on attend le suivant au salon) ; pas de compensation de latence pour les tirs (le serveur juge avec la position qu'il connaît) ; ni compte ni modération.

## 6. Événements émis par la simulation

| Événement | Écouté par |
|---|---|
| `tir`, `trait`, `impact` | effets, son |
| `esquive`, `reservoir_vide` | son |
| `touche`, `elimine`, `reapparu` | effets, son, annonces |
| `capacite:debut`, `capacite:fin` | annonces, son |
| `chevres:lachees` | annonces, son |
| `vache:peinte` | effets, son |
| `match:debut`, `match:fin` | écrans, son |

À plusieurs, le serveur relaie ces événements dans les instantanés et la copie locale les réémet.

## 7. Couverture des exigences

| Exigences | Composants |
|---|---|
| F1–F4 match | `sim/match.js`, `sim/actor.js`, `ui/hud.js` |
| F5–F8 peinture | `sim/paint.js`, `sim/actor.js`, `render/paintTexture.js`, `render/levelView.js` |
| F9–F12 héroïnes | `config/characters.js`, `sim/weapons.js`, `sim/specials.js`, `ai/bot.js`, `ui/select.js` |
| F13–F16 interface | `ui/`, `input/` |
| F17–F21 univers | `render/human.js`, `render/models.js`, `sim/cows.js`, `sim/goats.js`, `config/maps/` |
| F22 difficulté | `config/tuning.js` (`DIFFICULTY`), `ai/bot.js` |
| F23 jeu à plusieurs | `server/`, `src/net/`, `ui/lobby.js` |
| N1 performance | pas fixe (D2), boîtes (D4), `render/quality.js` |
| N2 chargement | pas de build, rien à télécharger hors code (D1, D9) |
| N3 équilibrage | données centralisées (D6), `tools/balance.mjs` |
| N6 hébergement | D1, `Dockerfile` |
| N8 vie privée | D9, `.gitignore`, `.dockerignore`, liste de fichiers distribués du serveur |

## 8. Vérification

- `node --test` : 59 tests sur la simulation, les bots, les héroïnes, les cartes et le réseau (dont un match complet serveur + copie locale, et un salon par vraie connexion).
- `node tools/balance.mjs` : matchs de bots en accéléré pour comparer les héroïnes et mesurer chaque difficulté.
- `tools/avatars.html` : planche des trois héroïnes, pour régler leur apparence.

Non couvert par des tests automatiques : l'affichage lui-même, la fluidité sur de vrais appareils, la sensation de jeu avec une latence réelle.

## 9. Pistes

Manette (un producteur de Commande de plus), autres cartes (un fichier dans `maps/`), reprise après déconnexion, compensation de latence pour les tirs, plusieurs processus serveur.
