# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Guide pour Claude Code dans ce repository. Ce fichier est versionne afin de
partager les conventions de travail du projet.

@STATUS.md

## Projet

Ce repository est un projet MMORPG web temps reel qui vise une base technique
professionnelle, robuste et moderne. L'objectif est de construire une experience
interactive capable de monter progressivement vers des centaines puis milliers
de joueurs connectes, avec une attention constante aux performances, a la
securite, a la maintenabilite et a la clarte des commits.

## Stack

- Monorepo npm workspaces.
- Frontend: React, Vite, Zustand, Phaser, Socket.IO client, SCSS.
- Backend: NestJS, TypeScript, TypeORM, Socket.IO gateways.
- Base de donnees: PostgreSQL.
- Infrastructure locale: Docker Compose avec PostgreSQL, Redis et RabbitMQ.
- Temps reel: gateways WebSocket NestJS pour monde, ressources, animaux et
  interactions joueurs.

## Base de donnees

La base principale est PostgreSQL (`mmorpgdb`). En developpement, TypeORM utilise
actuellement `synchronize: true`, ce qui cree et ajuste les tables automatiquement
au demarrage du backend.

Tables metier attendues selon l'etat actuel:

- `user`: comptes joueurs.
- `character`: personnages, stats et position persistante.
- `character_equipment`: equipement porte par les personnages.
- `inventory`: inventaires des personnages.
- `item`: objets.
- `resources`: ressources de recolte sur la map.
- `creatures`: animaux chassables.
- `world_item`: objets deposes au sol (state: spawned/picked/expired, ownerCharacterId nullable).
- `personal_loot_entitlement`: fondation des droits de butin personnel (module `rewards`,
  status ground/mailed/claimed/expired/cancelled, unicite killId+characterId+rewardRollId).
  **Socle Lot 1 non branche** : aucun kill/WorldItem/inventaire/mailbox ne l'utilise encore.

Toute evolution de schema doit rester explicite, prudente et justifiee. Pour une
approche production, privilegier des migrations TypeORM plutot que
`synchronize: true`.

## Commandes

Reference rapide. Le README contient le detail des routes HTTP et des
evenements Socket.IO.

Backend, depuis `apps/api-gateway`:

- `npm run start:dev` - API NestJS en watch mode (port 3000, Swagger sur `/api/docs`)
- `npm run build` - build NestJS
- `npm run lint` - ESLint avec autofix
- `npm run test` - tous les tests unitaires Jest
- `npm run test -- auth.service` - un seul fichier de test (filtre par chemin/nom)
- `npm run test -- -t "nom du test"` - un seul test par son nom
- `npm run test:e2e` - tests end-to-end (`test/jest-e2e.json`)
- `npm run test:cov` - couverture
- `npm run make:entity` - generateur CLI interactif (entite + DTO + service +
  controller + module + seed) dans `tools/cli`

Frontend, depuis `apps/client`:

- `npm run dev` - serveur Vite (port 5173)
- `npm run build` - build production
- `npm run lint` - ESLint
- `npm run preview` - previsualisation du build

Infrastructure, depuis la racine:

- `docker compose -f docker/docker-compose.yml up -d` - Postgres/Redis/RabbitMQ
- `docker compose -f docker/docker-compose.yml down`

## Architecture

### Backend (NestJS)

- `app.module.ts` charge TypeORM avec
  `entities: [__dirname + '/**/*.entity.{ts,js}']`: toute nouvelle entite est
  auto-detectee, pas besoin de l'enregistrer manuellement quelque part.
- Quatre gateways Socket.IO independantes coexistent sur le namespace par
  defaut: `WorldGateway` (deplacement des joueurs, gathering avec timer
  serveur, anti-cheat par distance), `ResourcesGateway` (recolte instantanee
  des ressources), `CreaturesGateway` (combat contre les animaux) et
  `WorldItemsGateway` (objets au sol: drop/pickup). `WorldGateway` et
  `ResourcesGateway` broadcastent encore via `server.emit` (dette scalabilite);
  `WorldItemsGateway` utilise des rooms Socket.IO via `getMapRoomId(mapId)`
  (`src/common/socket-rooms.ts`) — pattern a adopter pour les nouveaux evenements.
- `WorldService.checkInteraction` (verification de distance joueur/objet) et
  `chebyshevDistanceWU` (`src/common/world-coordinates.ts`) sont les barrières
  anti-cheat de distance. `WorldItemService.pickupItem` est la reference pour
  les operations transactionnelles avec verrou pessimiste (`pessimistic_write`):
  charge l'entite sous verrou, verifie etat/map/owner/expiration/distance,
  modifie l'inventaire, change l'etat, commit — tout dans une seule transaction
  DataSource. Reutiliser ce pattern pour toute operation critique similaire.
- Le generateur `npm run make:entity` (`tools/cli/`) scaffold un domaine
  complet (entite, DTOs, service, controller, module, seed) de facon
  coherente avec les conventions existantes; preferable a l'ecriture manuelle
  pour un nouveau domaine.
- Garder les gateways WebSocket simples: deleguer la logique metier et la
  persistance aux services.
- Garder les entities TypeORM claires et coherentes avec le schema PostgreSQL.

### Frontend (React + Phaser)

- Un seul socket Socket.IO est cree dans `WorldPage.jsx` et attache a
  `phaserGameRef.current.socket` (expose aussi via `window.game.socket`). Ce
  socket unique recoit les evenements des trois gateways backend:
  `WorldScene` l'utilise pour le monde/gathering, et des composants React
  (ex: `ActionPanel`) y emettent directement via `window.game.socket` plutot
  que via un store.
- Les stores Zustand (`character.store.js`, etc.) utilisent un singleton
  attache a `window.__GLOBAL_CHARACTER_STORE__` pour rester partages entre
  les scenes Phaser et les composants React malgre des cycles de
  montage/demontage differents. Ne pas instancier un store Zustand "classique"
  pour un etat qui doit etre lu a la fois par Phaser et React.
- Le mouvement du joueur (`PlayerController.js`) gere trois modes: clavier
  (override immediat), clic simple (pathfinding via `scene.pathfinder` +
  `scene.collisionGrid`, grille de tiles 32px) et glisser-maintenir (steering
  direct vers le pointeur, sans pathfinding). La position locale n'est
  synchronisee au serveur (`player_move`) que si elle a change, au plus
  toutes les 80ms (`WorldScene.syncLocalPlayer`).
- `WorldScene.interactionTargets` liste les objets cliquables (ressources,
  animaux); un clic resout d'abord une cible interactive avant de declencher
  un deplacement, et ouvre le panneau React (`actionPanel.store`) plutot que
  d'agir directement sur le socket.
- Phaser gere le rendu monde, les sprites et les interactions map; React gere
  les panneaux et interfaces.
- Ne pas introduire de grosse UI ou nouvelle librairie sans validation
  prealable.

## Tests

- **Encodage dans les specs** : l'editeur convertit les guillemets simples
  droits `'` (U+0027) en guillemets courbes `'` `'` (U+2018/U+2019) lorsqu'ils
  sont ecrits via des outils d'edition. Ces caracteres ne sont pas valides comme
  delimiteurs de chaine en TypeScript et cassent les suites de tests. Utiliser
  des guillemets doubles `"..."` dans le code des nouveaux tests (descriptions
  `it()`et valeurs de chaines dans les fixtures). Les guillemets courbes en tant
  que contenu (apostrophes) a l'interieur d'une chaine delimitee par `'` droits
  sont acceptes par ts-jest.

- Un fichier `*.spec.ts` doit toujours contenir une vraie suite de tests
  (`describe`/`it`); ne jamais laisser un spec vide ou dupliquant une classe
  de production sans test reel.
- Co-localiser chaque spec avec le code teste (`xxx.service.spec.ts` a cote
  de `xxx.service.ts`).
- Mocker les dependances externes (Repository, services, JwtService) plutot
  que d'appeler une vraie DB ou API dans un test unitaire.
- Apres une modification de service, verifier au minimum avec
  `npm run test -- <nom-du-fichier>` avant de proposer un commit.
- Supprimer explicitement les specs obsoletes ou orphelins plutot que de les
  laisser cohabiter avec une nouvelle suite.

## Principes De Travail

- Restreindre les actions strictement a ce qui est demande.
- Fonctionner etape par etape.
- Produire des changements petits, lisibles et faciles a committer.
- Eviter les refactorings larges ou opportunistes sans validation prealable.
- Ne jamais masquer une dette technique importante: la signaler clairement.
- Quand une meilleure solution ou une legere modification utile apparait,
  la proposer avant de l'appliquer si elle depasse la demande initiale.
- Toujours proteger les changements existants de l'utilisateur.
- Privilegier la suppression des duplications architecturales avant l'ajout de
  nouvelles fonctionnalites.
- Une nouvelle abstraction ne doit etre creee que si elle est destinee a etre
  reutilisee par au moins deux domaines du projet.

## Principes D'Architecture

Les decisions d'architecture sont documentees dans
`docs/01_Architecture/adr/`.

Avant d'introduire une nouvelle mecanique metier (combat, skills, IA,
economie, quetes, batiments, etc.), consulter les ADR concernees et respecter
les decisions deja etablies.

En particulier, l'ADR Runtime-Driven Architecture constitue la reference pour
toute mecanique produisant des statistiques, effets ou etats runtime.

Ne jamais contourner une architecture existante en introduisant un systeme
parallele lorsqu'une solution coherente peut etre construite sur les fondations
deja presentes.

La documentation technique (`docs/`) est la source de verite pour
l'architecture. `STATUS.md` decrit uniquement l'etat courant du projet.

## Frontiere Runtime / Admin

**Regle : `WorldScene` ne doit jamais appeler un endpoint `/admin/*`.**

Les routes `/admin/*` sont reservees au Studio SDK et aux DevTools. Elles
peuvent creer, modifier, supprimer, inspecter et diagnostiquer. Elles ne
doivent pas etre necessaires au client joueur pour rendre ou utiliser le monde.

Toute donnee necessaire au fonctionnement normal du jeu cote joueur doit etre
exposee via :

- une route runtime lecture seule (authentifiee ou publique selon besoin) ;
- ou un evenement socket runtime (ex: `get_resources`, `crafting_station_update`) ;
- jamais via `/admin/*`.

Exemples concernes : buildings visibles sur la carte, crafting stations / forge,
ressources, creatures, PNJ, points d'interaction, objets du monde requis par
`WorldScene`.

Avant d'ajouter un `fetch` dans `WorldScene` ou un composant joueur, verifier :

1. L'endpoint cible est-il sous `/admin/` ? Si oui, creer un endpoint runtime.
2. Le joueur peut-il recevoir la donnee via socket a la connexion ? Si oui, preferer le socket.
3. La donnee contient-elle des informations sensibles reservees admin ? Si oui, filtrer cote serveur.

**Regle : pour toute action admin ciblant un joueur connecte, utiliser
`ConnectedPlayer.worldX/worldY/mapId` comme source de position.**

La DB represente la position persistee (derniere deconnexion), pas la position
live. Si le joueur est hors ligne, fallback DB acceptable. Si connecte, la DB
peut etre obsolete de plusieurs minutes de deplacement.

Cas concernes : teleportation vers joueur, inspection position, follow, kick
avec position contextuelle, debug distance, deplacement force.

Regressions historiques corrigees (audit 2026-07-06) : `loadBuildings()` /
`loadCraftingStations()` appellent desormais les endpoints runtime
(`/buildings/world-objects`, `/crafting/stations/world-objects`) et
`admin:teleport` lit la position live du `ConnectedPlayer` (fallback DB si
hors ligne). Exception restante : `WorldScene.redrawCreatureSpawnOverlay()`
fetch `/admin/creature-spawns/world-objects` depuis la scene joueur (overlay
DevTools) — a deplacer hors de la scene ou exposer en runtime read-only.

## Architecture Runtime

Le Runtime constitue l'une des fondations principales du projet.

Toute mecanique modifiant l'etat d'une entite doit s'integrer a l'architecture
Runtime existante avant d'introduire un nouveau systeme.

Avant toute nouvelle mecanique gameplay ou nouveau domaine,
verifier si elle doit s'integrer a :

- EntityRuntime
- RuntimeSource
- RuntimeModifier
- RuntimeTrace
- RuntimeSnapshot
- RuntimeInspector

Ne jamais dupliquer une logique deja presente dans le Runtime.

Le Runtime calcule.

Le Studio SDK observe, explique et manipule de maniere controlee.

Le frontend ne recalcule jamais les valeurs metier.

Toute nouvelle RuntimeEntity doit reutiliser les contrats generiques avant
d'introduire des extensions specifiques.

## Evolution De L'Architecture

Avant d'introduire une nouvelle abstraction ou un nouveau domaine :

1. Verifier si une architecture equivalente existe deja.
2. Privilegier son extension plutot que la creation d'un systeme parallele.
3. Si une nouvelle abstraction est necessaire, justifier son existence.
4. Verifier qu'elle pourra etre reutilisee par au moins deux domaines.
5. Documenter la decision si elle modifie durablement l'architecture.

Avant de creer un nouveau domaine, verifier si une extension coherente de
l'architecture existante est possible.

La creation d'un nouveau sous-systeme doit rester exceptionnelle et etre
justifiee par une ADR lorsqu'elle impacte durablement l'architecture.

Le projet privilegie une architecture evolutive, coherente et observable plutot
qu'une accumulation de mecaniques independantes.

## Documentation

La documentation fait partie integrante du projet.

Toute fonctionnalite importante doit etre accompagnee de la mise a jour de la
documentation concernee avant le commit.

Selon le scope, mettre a jour si necessaire :

- STATUS.md
- docs/README.md
- ADR
- documentation d'architecture
- documentation Gameplay
- documentation Studio SDK
- documentation Runtime

Ne jamais documenter une fonctionnalite comme implementee si elle est seulement
planifiee.

Utiliser explicitement les statuts :

- Implemented
- Planned
- Deprecated
- Removed
- Not verified

La documentation doit toujours refleter l'etat reel du code.

Toute documentation doit etre mise a jour dans le meme commit que le code
qu'elle decrit.

## Securite Et Robustesse

- Valider les payloads entrants, surtout WebSocket et HTTP.
- Ne jamais faire confiance au client pour les degats, positions critiques,
  inventaire, loot, autorisations ou ownership.
- Mouvement joueur : le client propose, le serveur valide/corrige
  (`WorldService.updatePlayer`, ADR-0003). Ne jamais reintroduire un
  `player_move` accepte sans validation.
- Garder les calculs metier cote serveur.
- Verifier l'appartenance d'une ressource/personnage/action quand c'est
  pertinent.
- Eviter les operations destructrices sans demande explicite.
- Preferer des APIs typees et des DTOs/guards/type guards aux `any`.
- Gerer les erreurs reseau, DB et temps reel de facon explicite.

## Performance Temps Reel

Le projet vise du temps reel interactif a grande echelle. Les choix doivent
preparer la montee en charge:

- Eviter les broadcasts inutiles.
- Debouncer/throttler les positions et evenements frequents.
- Envoyer des deltas plutot que des etats complets quand le volume augmente.
- Garder une source de verite serveur.
- Penser rooms/zones/chunks de map pour limiter les emissions aux joueurs
  concernes.
- Eviter les boucles couteuses par tick cote serveur.
- Preparer la separation future par services ou workers si necessaire.

## Workflow Attendu

1. Lire le code concerne avant d'agir.
2. Faire le changement minimal coherent avec l'architecture existante.
3. Verifier avec les commandes adaptees (voir section Commandes):
   - backend: `npm run build` (et `npm run test` si la logique metier change)
   - frontend: `npm run build`
   - lint cible si une erreur ESLint est mentionnee
4. Resumer les fichiers modifies et les limites connues.
5. Proposer un nom de commit en francais au format:
   `type(scope): description courte`

Exemples:

- `fix(world): sauvegarder la position des personnages`
- `feat(chasse): ajouter les animaux chassables`
- `style(world): corriger le formatage du gateway`

## Gestion Du Contexte

- Jamais de `cat` sur fichiers >50 lignes: utiliser Read avec offset/limit.
- Toujours filtrer les sorties bash via `head`, `tail`, ou `grep`.
- Lancer `/compact` des que le contexte depasse 70%.

## Rappel Important

Ce projet doit rester professionnel: robuste, lisible, securise, evolutif. Les
solutions rapides sont acceptables seulement si elles sont clairement bornees et
si le chemin vers une solution scalable reste visible.
