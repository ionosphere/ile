# ILE

Jeu de peinture à la ferme, en 3D dans le navigateur : Ines, Louisa et Emma, 4 contre 4 avec des bots, sur deux cartes.

- [SPEC.md](SPEC.md) : ce que le jeu doit faire.
- [DESIGN.md](DESIGN.md) : comment il est construit.

## Lancer le jeu

Aucune installation : il suffit de Node 22 ou plus récent.

```
node server/index.mjs
```

Puis ouvrir http://127.0.0.1:8080/ (ou l'adresse de l'ordinateur sur le réseau local, depuis un téléphone). `PORT=3000 node server/index.mjs` change de port.

Ce serveur distribue le site et héberge le jeu à plusieurs. Il ne distribue que `index.html`, `styles/`, `src/` et `vendor/` : ni `doc/`, ni les tests, ni son propre code.

Le jeu en solo fonctionne aussi comme simple site statique (`python3 -m http.server 8080`, par exemple), mais sans le jeu à plusieurs.

## Jouer à plusieurs

Sur l'écran d'accueil, « Jouer à plusieurs » : l'un crée un salon et donne son code de quatre lettres (ou le lien) aux autres, qui le rejoignent. Chacun choisit son équipe et son héroïne ; l'hôte (★) choisit la carte et le niveau des bots, puis lance le match. Jusqu'à 8 joueurs, 4 par équipe ; les places libres sont tenues par des bots. Une joueuse qui part en plein match est remplacée par un bot.

Le match est simulé sur le serveur (`server/room.mjs`), qui envoie 20 instantanés par seconde. Chaque appareil prédit le déplacement de sa propre héroïne et affiche les autres avec un dixième de seconde de retard (`src/net/replica.js`). Le format des messages est dans `src/net/protocol.js`.

## Tests et équilibrage

```
node --test                       # simulation, bots, cartes
node tools/balance.mjs 16 120     # matchs de bots en accéléré : qui gagne, qui peint, qui élimine, et l'effet de chaque difficulté
```

## Où régler quoi

| Quoi | Fichier |
|---|---|
| Vitesses, saut, vie, réservoir, durée du match, tactile, niveaux de difficulté des bots | `src/config/tuning.js` |
| Les trois héroïnes (stats, apparence, comportement des bots) | `src/config/characters.js` |
| Armes | `src/config/weapons.js` |
| Capacités spéciales | `src/config/specials.js` |
| Vaches et chèvres | `src/config/animals.js` |
| Cartes | `src/config/maps/` |

Dans la console du navigateur, `ile.start('emma', 'salon')` lance un match sans passer par les menus.

## Rendu

Tout est fabriqué par le programme, sans image ni modèle à télécharger : les matières (béton rainuré, pierre, tuiles, tôle, parquet…) sont calculées dans `src/render/levelView.js`, les héroïnes sont assemblées et animées dans `src/render/human.js` (tenue et coiffure décrites par `look` dans `characters.js`), les animaux dans `src/render/models.js`, le décor hors terrain (maison, arbres, hangar, plafond du hall) est dans `src/render/decor.js`. Trois niveaux de qualité (`src/render/quality.js`) : seul le niveau Haute affiche les ombres portées et la finition de l'image (halo lumineux, vignettage, dans `src/render/post.js`), et le niveau Basse coupe les matières.

`tools/avatars.html` affiche les trois héroïnes côte à côte pour régler leur apparence. Le serveur du jeu ne distribue pas `tools/` : lancer `python3 -m http.server 8090` à côté, puis ouvrir http://127.0.0.1:8090/tools/avatars.html?pose=course&vue=face (poses `repos`, `course`, `tir`, `rouleau` ; vues `face`, `dos`, `profil`, `trois`).

## Mise en ligne

Le dépôt contient un `Dockerfile` : l'image lance `node server/index.mjs` sur le port 8080 et ne contient que le jeu.

Avec Dokploy : créer une application à partir du dépôt, type de construction « Dockerfile », port 8080, puis lui attacher un domaine. Les WebSockets passent par le même port et le même domaine (chemin `/jeu`) ; en HTTPS le jeu utilise `wss` de lui-même. `/sante` renvoie le nombre de salons et de connexions.

Limites à connaître :

- Les salons vivent dans la mémoire d'un seul processus : une seule instance, et un redéploiement interrompt les matchs en cours.
- Garde-fous intégrés : 100 salons, 400 connexions, 12 connexions par adresse, messages limités en taille et en débit. Il n'y a ni compte ni modération : toute personne qui a l'adresse peut créer un salon.

**Ne jamais publier `doc/`** : il contient les photos de référence de personnes réelles. Le `.gitignore` et le `.dockerignore` l'excluent, et le serveur refuse de le distribuer. `.claude/` est exclu de la même façon.
