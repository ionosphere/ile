# ILE — Spécification des exigences

Version 2 — 11 octobre 2026 (deux cartes, lâcher de chèvres, marques autorisées)

## Objectif

ILE est un shooter de peinture 3D jouable dans le navigateur, en solo avec des bots, publié pour un public large. Le joueur choisit entre Ines, Louisa et Emma (dont les initiales forment le nom du jeu), qui ont chacune une arme, des stats et une capacité spéciale propres. Le jeu fonctionne sur ordinateur (clavier/souris) et sur téléphone ou tablette (tactile).

Le jeu s'inspire du genre « guerre de territoire à la peinture » (référence : INKWAVE — Turf Riot, https://inkwave-aah.pages.dev/), dans un univers original : la ferme.

## Exigences fonctionnelles

### Match

- **F1.** Un match oppose deux équipes de 4 : le joueur, 3 bots alliés et 4 bots adverses.
- **F2.** Le match dure un temps limité (3 minutes comme point de départ) et l'équipe qui a peint le plus de surface gagne.
- **F3.** Un écran de résultat affiche le pourcentage de terrain de chaque équipe.
- **F4.** Un joueur éliminé réapparaît à sa base après quelques secondes.

### Peinture et déplacement

- **F5.** Tirer peint le sol et les murs à la couleur de son équipe.
- **F6.** Le joueur peut passer en forme « chat » dans sa propre peinture : il va plus vite, recharge sa peinture et grimpe aux murs peints.
- **F7.** La peinture adverse ralentit et blesse.
- **F8.** Le réservoir de peinture est limité, ce qui oblige à alterner tir et forme chat.

### Personnages

- **F9.** Un écran de sélection présente les trois personnages avec leur rôle, leur arme et leur capacité.
- **F10.** Chaque personnage a une arme principale différente, des stats différentes (vitesse, vie, portée) et une capacité spéciale.
- **F11.** La capacité spéciale se charge en peignant du terrain et se déclenche avec une touche dédiée.
- **F12.** Les bots utilisent eux aussi les trois personnages, dans les deux équipes, distingués par la couleur d'équipe.

| Personnage | Caractère | Rôle et stats | Arme | Capacité spéciale |
|---|---|---|---|---|
| **Ines** | Peur de rien, fonceuse | Attaquante de mêlée : vitesse moyenne, vie élevée, courte portée | Double pistolet à peinture, avec esquive | **Charge** : ruée en ligne droite qui peint une traînée, bouscule les ennemis et la rend insensible aux dégâts pendant la course |
| **Louisa** | Réfléchie, rapide | Tacticienne mobile : la plus rapide (course et forme chat), vie faible, longue portée | Tir chargé précis | **Plan de bataille** : révèle tous les ennemis sur la minimap et à travers les murs pour toute l'équipe pendant quelques secondes |
| **Emma** | Grande, empathique, aide les autres | Soutien : silhouette plus grande, la plus résistante, la plus lente | Rouleau qui peint large et ouvre le terrain aux alliés | **Cercle d'entraide** : zone autour d'elle qui soigne les alliés et recharge leur peinture |

Note d'équilibrage : la grande taille d'Emma la rend plus facile à toucher, ce que compense sa vie élevée.

### Interface et contrôles

- **F13.** L'affichage en jeu montre le chrono, la jauge de peinture, la jauge de capacité, le score de terrain et une minimap.
- **F14.** Au clavier/souris : déplacement, visée, tir, forme chat, saut, capacité spéciale et lâcher de chèvres.
- **F15.** Au tactile : joystick virtuel de déplacement, zone de visée et boutons pour tir, forme chat, saut et capacité.
- **F16.** Le menu comprend jouer, choisir son personnage et sa carte, les réglages (sensibilité, volume, mode daltonien) et un court tutoriel.

### Univers

- **F17.** La forme de nage est un chat : chaque héroïne se transforme en chat pour filer dans sa peinture et grimper aux murs peints. Les trois chats se distinguent visuellement (couleur ou accessoire repris de l'avatar).
- **F18.** Des vaches se déplacent lentement sur chaque carte. Elles bloquent les tirs et le passage, et peuvent être peintes : une vache peinte compte comme terrain pour l'équipe tant qu'elle n'est pas repeinte.
- **F19.** Deux cartes, inspirées des photos fournies, au choix du joueur avant le match :
  - **La ferme** : cour en béton, stabulations ouvertes (toits sur poteaux), grange en pierre, puits, abri à chèvres, remorque, grand chêne et bassin creusé au centre.
  - **Le salon de l'agriculture** : hall d'exposition avec scène et grand écran, rangées de cubes-sièges, stands à cloisons et mange-debout.
- **F20.** La matière est de la peinture colorée, avec une palette par équipe et un mode daltonien.
- **F21. Lâcher de chèvres** : un coup spécial commun aux trois héroïnes, en plus de leur capacité propre. Une seconde jauge, plus lente, se remplit en peignant ; la touche F lâche alors trois chèvres qui courent pendant 10 secondes, peignent sous leurs pattes et grimpent aux murs.
- **F22. Difficulté** : le joueur choisit le niveau des bots adverses (Facile, Normale, Difficile) sur l'écran de sélection ; les coéquipières jouent toujours au niveau Normale. Le choix est gardé d'une visite à l'autre.
- **F23. Jeu à plusieurs** : en plus du solo, jusqu'à 8 joueurs (4 par équipe) se retrouvent dans un salon par un code de quatre lettres ou un lien, chacun sur son appareil, sur le réseau local ou par Internet. Chacun choisit son équipe et son héroïne ; l'hôte choisit la carte et le niveau des bots et lance le match. Les places libres, et celle d'une joueuse qui part, sont tenues par des bots. Ce mode demande le serveur Node du projet ; le solo reste jouable en site statique.

## Exigences non fonctionnelles

- **N1. Performance** : 60 images/s sur un ordinateur portable courant et au moins 30 sur un téléphone milieu de gamme, avec une qualité graphique réglable.
- **N2. Chargement** : le jeu est jouable en moins de 10 secondes sur une connexion correcte, sans installation ni compte.
- **N3. Équilibrage** : aucun des trois personnages ne doit dominer nettement les deux autres contre les bots.
- **N4. Accessibilité** : une palette daltonien est disponible et le texte reste lisible sur petit écran.
- **N5. Originalité** : le nom, les visuels, les sons et le code sont originaux. On s'inspire du genre sans reprendre les éléments de Splatoon (noms, personnages calamars, termes d'armes) ni le code d'INKWAVE. Deux marques réelles apparaissent sur les stands du salon, à la demande du porteur du projet : Ekylibre et La Ferme Digitale. Aucune autre marque visible sur les photos n'est reprise.
- **N6. Hébergement** : le solo est un site statique, sans serveur. Le jeu à plusieurs (F23) demande le serveur Node du projet, sans dépendance, livré aussi en image Docker.
- **N7. Langue** : interface en français uniquement.
- **N8. Avatars et vie privée** : Ines, Louisa et Emma sont des personnes réelles. Leurs avatars sont des dessins stylisés d'après photos ; les photos ne sont ni publiées ni intégrées au jeu. Au moins l'une d'elles est mineure : les avatars évoquent une coiffure et une tenue, pas un visage. Les photos de référence (dossier `doc/`) ne doivent pas être mises en ligne avec le jeu.

## Critères d'acceptation

- Un nouveau joueur lance un match en moins de 3 clics depuis l'accueil.
- Les trois personnages se jouent de façon visiblement différente dès la première minute : un joueur qui teste les trois décrit spontanément trois façons de jouer (foncer, viser, soutenir).
- Un match complet se déroule sans blocage sur ordinateur et sur téléphone, jusqu'à l'écran de résultat.
- Les bots peignent, passent en forme chat, combattent et utilisent leur capacité de façon crédible.
- La capacité d'Emma a un effet visible sur les alliés, y compris les bots.
- Les vaches ne bloquent jamais durablement un passage obligé ni un point de réapparition.

## Hors périmètre pour la première version

Le multijoueur en ligne, un mode boss, d'autres cartes que les deux prévues, la manette et la progression (déblocages, cosmétiques) sont exclus. L'architecture ne doit toutefois pas empêcher de les ajouter plus tard.

## Références visuelles (dossier `doc/`, hors publication)

- **Emma** : cheveux longs et lisses, châtain clair.
- **Louisa** : cheveux bouclés blond vénitien, souvent attachés ; bleu de travail.
- **Ines** : lunettes, cheveux longs attachés.
- **Animaux** : vaches en déambulation sur les cartes ; chèvres brunes à cornes pour le lâcher de chèvres.

## En attente

- L'accord de La Ferme Digitale pour l'usage de son nom avant toute mise en ligne publique, s'il n'est pas déjà acquis.
- Le contenu de la vidéo `doc/personnage/ile_chevres.mp4`, qui n'a pas pu être consultée.

## Référence technique (observée sur INKWAVE, à titre indicatif)

- Rendu Three.js sans moteur, modules ES, site statique.
- Valeurs de sensation de jeu : course 6 m/s, nage 11,8 m/s, 2,9 m/s en forme réduite hors peinture, 1,9 m/s dans la peinture adverse ; 100 points de vie ; réapparition en 5,5 s ; recharge de peinture 42/s en nage.
