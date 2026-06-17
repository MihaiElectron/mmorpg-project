# CLAUDE.md

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
- `animals`: animaux chassables.

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
- Trois gateways Socket.IO independantes coexistent sur le namespace par
  defaut: `WorldGateway` (deplacement des joueurs, gathering avec timer
  serveur, anti-cheat par distance), `ResourcesGateway` (recolte instantanee
  des ressources) et `AnimalsGateway` (combat contre les animaux). Elles ne
  sont pas isolees par room: `server.emit` broadcast a tous les clients
  connectes, a surveiller en montee en charge (cf. Performance Temps Reel).
- `WorldService.checkInteraction` (verification de distance joueur/objet) est
  la seule barriere anti-cheat sur les interactions au sol. Toute nouvelle
  interaction doit reutiliser ou etendre ce garde-fou plutot que faire
  confiance aux coordonnees envoyees par le client.
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

## Securite Et Robustesse

- Valider les payloads entrants, surtout WebSocket et HTTP.
- Ne jamais faire confiance au client pour les degats, positions critiques,
  inventaire, loot, autorisations ou ownership.
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
