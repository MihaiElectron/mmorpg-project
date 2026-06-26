# Plan de migration — Système de coordonnées WU

## Métadonnées

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md,
  docs/01_Architecture/adr/ADR-0002-entity-positioning.md,
  docs/01_Architecture/adr/ADR-0003-movement-authority.md
- Used by: Project owner, developers, conversational assistants,
  repository-aware coding agents

---

## Décision de référence

`worldX` et `worldY` sont des entiers signés en **World Units (WU)**.
`1 tile logique = 1024 WU`.
`mapId` est obligatoire dans toute position persistée ou diffusée.

Les positions en pixels Phaser ne doivent plus être stockées en base ni
transportées comme valeurs canoniques dans les payloads Socket.IO.

Ce document est un plan de migration — aucun code ne doit être modifié en
dehors des phases définies ci-dessous et sans validation humaine préalable.

---

## 1. Fichiers backend impactés

### Entités TypeORM (colonnes à renommer + mapId à ajouter)

| Fichier | Colonnes actuelles | Action requise |
|---|---|---|
| `src/characters/entities/character.entity.ts` | `positionX INT`, `positionY INT` | Renommer → `worldX`, `worldY`; ajouter `mapId` |
| `src/creatures/entities/creature.entity.ts` | `x INT`, `y INT` | Renommer → `worldX`, `worldY`; ajouter `mapId` |
| `src/resources/entities/resource.entity.ts` | `x INT`, `y INT` | Renommer → `worldX`, `worldY`; ajouter `mapId` |
| `src/creatures/entities/creature-spawn.entity.ts` | `spawnX INT`, `spawnY INT` | Renommer → `worldX`, `worldY`; ajouter `mapId` |
| `src/world/entities/respawn-point.entity.ts` | `x INT`, `y INT`, `radius INT` | Renommer → `worldX`, `worldY`; `radius` → `worldRadius`; ajouter `mapId` |
| `src/creatures/entities/creature-template.entity.ts` | `patrolRadius INT`, `speedMin INT`, `speedMax INT`, `aggroRadius INT` | Colonnes GameplayData — valeurs à recalibrer en WU/WU/s (pas de renommage obligatoire, mais les valeurs seront incorrectes) |

### Services et gateways (logique de position)

| Fichier | Raison |
|---|---|
| `src/world/world.service.ts` | Type `ConnectedPlayer` (`x`, `y`); toutes les méthodes positionnelles: `joinPlayer`, `updatePlayer`, `persistPlayerPosition`, `respawnCharacter`, `teleportCharacter`; seed du `RespawnPoint` en (600, 300) |
| `src/world/world.gateway.ts` | Payloads `player_move` (`{ x, y, direction }`), types `JoinWorldPayload` (`x?`, `y?`) |
| `src/creatures/creatures.service.ts` | Toute la logique de mouvement AI (`doPatrolMovement`, `doFighting`, `doEscaping`); constantes `MELEE_RANGE`, `RANGED_RANGE_DEFAULT`; seed des templates avec coordonnées pixel; `createAdminSpawn` |
| `src/creatures/creatures.gateway.ts` | Utilise `player.x`, `player.y` pour la vérification de portée d'attaque |
| `src/resources/resources.gateway.ts` | Constante `RESOURCE_INTERACT_RANGE = 100`; `MOVE_TOLERANCE = 4`; méthode `isInRange` basée sur `Math.hypot` en pixels |
| `src/admin/admin.gateway.ts` | Payloads `admin:spawn` et `admin:teleport` avec `{ x, y }`; rendu des coordonnées dans les messages de retour |
| `src/admin/admin.service.ts` | Potentiellement impacté si des positions sont manipulées dans des réponses HTTP |

### Fichiers backend NON impactés

- `src/auth/auth.service.ts`
- `src/characters/character.service.ts` (CRUD sans position)
- `src/inventory/inventory.service.ts`
- `src/items/item.service.ts`
- `src/users/user.service.ts`
- `src/world/loot.service.ts`
- `src/app.service.ts`
- `src/common/ws-auth.service.ts`

---

## 2. Fichiers frontend impactés

| Fichier | Raison |
|---|---|
| `src/phaser/core/WorldScene.js` | **Impact majeur.** Toutes les positions Phaser → WU: `syncLocalPlayer` émet `{ x, y }` → `{ worldX, worldY }`; `joinWorld` émet `x`, `y`; réception de `world_joined`, `player_moved`, `character_teleport`, `character_respawn`, `creatures`, `creature_update` avec `x`/`y`; rendu des sprites à `player.x`, `player.y`; world bounds hardcodés (2000×2000); `TILEMAP_TEST_OFFSET_X = 936` (temporaire) |
| `src/phaser/player/Player.js` | `this.speed = 100` (px/s) — doit être recalibré en WU/s une fois le module WU disponible |
| `src/phaser/player/PlayerController.js` | `tileSize = 32` pour le pathfinding (grid `player.x / tileSize`); `arrivalThreshold = 8` (pixels); waypoints centrés sur `waypoint.x * 32 + 16`; distance de poursuite en combat: `dist > 60` |
| `src/phaser/world/MapLoader.js` | `this.tileSize = 32` — sera aligné sur la grille WU, mais le rôle du MapLoader reste le rendu client |
| `src/components/CoordinatesLayer/CoordinatesLayer.jsx` | Affiche `player.x`, `player.y` (Phaser pixels). Après migration, devra afficher les coordonnées WU converties, ou conserver l'affichage pixel pour le debug |
| `src/phaser/admin/admin.actions.ts` | `spawnCreature(templateKey, x, y)` et `teleportCharacter(characterId, x, y)` transmettent des pixels; devront transmettre des WU |
| `src/components/AdminPanel/AdminPanel.tsx` | Drag-and-drop vers la map: transmet `{ x, y }` en pixels Phaser via `admin:spawn`; devra convertir en WU avant d'émettre |

### Fichiers frontend NON impactés

- `src/phaser/admin/commandParser.ts`
- `src/phaser/admin/commandRegistry.ts` (contient `/tp`, `/spawn` — les coords passent par `admin.actions.ts`)
- `src/phaser/utils/depth.js`
- `src/phaser/utils/pathfinding.js`
- `src/phaser/core/BootScene.js`
- `src/phaser/core/PreloadScene.js`
- `src/store/character.store.js`
- `src/store/actionPanel.store.ts`
- `src/store/devtools.store.ts`
- `src/store/items.store.ts`

---

## 3. Entités TypeORM impactées — récapitulatif

| Entité | Table | Colonnes position actuelles | Cible |
|---|---|---|---|
| `Character` | `character` | `positionX`, `positionY` | `worldX`, `worldY`, `mapId` |
| `Creature` | `creatures` | `x`, `y` | `worldX`, `worldY`, `mapId` |
| `Resource` | `resources` | `x`, `y` | `worldX`, `worldY`, `mapId` |
| `CreatureSpawn` | `creature_spawn` | `spawnX`, `spawnY` | `worldX`, `worldY`, `mapId` |
| `RespawnPoint` | `respawn_point` | `x`, `y` | `worldX`, `worldY`, `mapId` |

`CreatureTemplate` (table `creature_template`) ne porte pas de coordonnées au
sens spatial, mais ses colonnes `patrolRadius`, `speedMin`, `speedMax`,
`aggroRadius` devront être recalibrées en WU/WU/s (valeurs numériques, pas de
renommage de colonne imposé).

---

## 4. Payloads WebSocket à migrer

### Client → Serveur

| Événement | Payload actuel | Payload cible |
|---|---|---|
| `player_move` | `{ x, y, direction? }` | `{ worldX, worldY, direction? }` |
| `join_world` | `{ characterId, name, sex?, x?, y?, direction? }` | `{ characterId, name, sex?, mapId, worldX?, worldY?, direction? }` |
| `admin:spawn` | `{ templateKey, x, y }` | `{ templateKey, mapId, worldX, worldY }` |
| `admin:teleport` | `{ characterId, x, y }` | `{ characterId, mapId, worldX, worldY }` |

Les événements `attack_creature` et `interact_resource` ne transportent pas de
coordonnées dans leur payload — le serveur utilise la position en mémoire du
joueur (`client.data.player`). Ils ne sont pas affectés structurellement, mais
la position en mémoire (`player.x`, `player.y`) devra avoir été migrée.

### Serveur → Client

| Événement | Champs position actuels | Champs cibles |
|---|---|---|
| `world_joined` | `player.x`, `player.y` | `player.worldX`, `player.worldY`, `player.mapId` |
| `player_joined` | `player.x`, `player.y` | idem |
| `player_moved` | `player.x`, `player.y` | idem |
| `current_players` | tableau de players avec `x`, `y` | tableau avec `worldX`, `worldY`, `mapId` |
| `character_teleport` | `{ x, y }` | `{ mapId, worldX, worldY }` |
| `character_respawn` | `{ characterId, x, y, health, maxHealth }` | `{ characterId, mapId, worldX, worldY, health, maxHealth }` |
| `creatures` | tableau de `CreatureDto` avec `x`, `y` | tableau avec `worldX`, `worldY`, `mapId` |
| `creature_update` | `CreatureDto` avec `x`, `y` | `worldX`, `worldY`, `mapId` |
| `resources` | tableau avec `x`, `y` | tableau avec `worldX`, `worldY`, `mapId` |

---

## 5. Constantes gameplay à recalibrer en WU

Ces constantes sont actuellement en unités pixel-équivalentes. Elles devront
être recalibrées après la migration des coordonnées, via gameplay testing.

### Backend — `src/creatures/creatures.service.ts`

| Constante | Valeur actuelle (px) | Rôle |
|---|---|---|
| `MELEE_RANGE` | `60` | Portée de mêlée joueur et creature |
| `RANGED_RANGE_DEFAULT` | `300` | Portée à distance par défaut |

### Backend — `src/resources/resources.gateway.ts`

| Constante | Valeur actuelle (px) | Rôle |
|---|---|---|
| `RESOURCE_INTERACT_RANGE` | `100` | Portée de récolte |
| `MOVE_TOLERANCE` | `4` | Déplacement autorisé entre deux ticks de récolte |

### Backend — seeds dans `CreaturesService.seedTemplates()`

Ces valeurs sont stockées en base via `upsert`. La recalibration nécessite une
mise à jour de la seed **et** une migration des valeurs déjà présentes en DB.

| Template | Colonne | Valeur actuelle (px / px/s) |
|---|---|---|
| turkey | `patrolRadius` | 200 |
| turkey | `speedMin` | 25 |
| turkey | `speedMax` | 60 |
| turkey | `aggroRadius` | 50 |
| goblin | `patrolRadius` | 150 |
| goblin | `speedMin` | 40 |
| goblin | `speedMax` | 80 |
| goblin | `aggroRadius` | 120 |

### Backend — `WorldService.onModuleInit()`

| Valeur | Actuelle | Rôle |
|---|---|---|
| Seed `RespawnPoint` | `x=600, y=300, radius=20` | Point de respawn par défaut |
| Fallback position joueur | `x=400, y=300` | Si `positionX/Y` est null |

### Frontend — `Player.js`, `PlayerController.js`, `WorldScene.js`

| Fichier | Constante | Valeur actuelle | Rôle |
|---|---|---|---|
| `Player.js` | `this.speed` | `100` (px/s) | Vitesse de déplacement joueur |
| `PlayerController.js` | `tileSize` | `32` (px) | Grille pathfinding; à remplacer par `TILE_SIZE_WU / TILE_DISPLAY_PX` |
| `PlayerController.js` | `arrivalThreshold` | `8` (px) | Seuil d'arrivée waypoint; exprimer en WU |
| `WorldScene.js` | distance de poursuite | `60` (px) | `dist > 60` dans `startAutoAttack` |
| `WorldScene.js` | world bounds | `2000, 2000` (px) | À recalculer en WU après définition de la taille de map |

---

## 6. Ordre recommandé de migration, phase par phase

```
Phase 0 — Prérequis non-code (bloquants)
Phase 1 — Module central de coordonnées
Phase 2 — Entités statiques (resource, creature_spawn, respawn_point)
Phase 3 — Type ConnectedPlayer et service monde
Phase 4 — Entité character
Phase 5 — Entité creature + logique AI
Phase 6 — Payloads WebSocket (server → client)
Phase 7 — Frontend rendering
Phase 8 — Recalibration des constantes gameplay
```

Chaque phase doit être validée avant la suivante. Une migration partielle est
plus risquée qu'une migration bloquée.

---

## 7. Détail des phases

---

### Phase 0 — Prérequis non-code

**Objectif** : résoudre les questions ouvertes qui bloquent toute conversion
numérique. Aucune modification de code dans cette phase.

**Décisions à prendre** :

1. **Offset tilemap final** : `TILEMAP_TEST_OFFSET_X = 936` est un placeholder
   temporaire dans `WorldScene.js`. La valeur finale de l'origine pixel de la
   map test doit être fixée avant toute conversion px → WU. Sans cette valeur,
   les seeds et les positions hardcodées (RespawnPoint, fallback joueur) ne
   peuvent pas être converties correctement.

2. **Métrique de distance gameplay** : la méthode `isInRange` dans
   `resources.gateway.ts` et les comparaisons de distance dans
   `creatures.service.ts` utilisent `Math.hypot` (Euclidienne pixels). Après
   migration, le serveur opérera en WU. Faut-il garder la distance Euclidienne
   en WU, ou passer à Chebyshev (max absolu) qui est un carré — plus adapté
   à la grille isométrique ? Cette décision change les valeurs de calibration.

3. **INTEGER vs BIGINT** : pour ce projet, les maps actuelles (64×64 tiles max)
   donnent `64 × 1024 = 65 536 WU` par côté, largement dans les limites int32
   (max ≈ 2,1 milliards). `INTEGER` (int32) est recommandé. Confirmer si des
   mondes dépassant 2 millions de tuiles par axe sont envisagés.

4. **mapId par défaut** : aucune table `map` n'existe. Toutes les entités
   actuelle sont sur une seule map implicite. Décider quelle valeur (`1`, `'main'`,
   `'default'`) sera utilisée comme `mapId` par défaut pendant la migration.
   Cette valeur sera hardcodée temporairement jusqu'à l'implémentation d'une
   vraie table map.

5. **Format collision serveur** : le serveur n'a actuellement aucune grille de
   collisions. La validation de walkabilité (prévue dans ADR-0003) nécessite
   que le serveur ait accès aux données de collision Tiled. Ce n'est pas
   requis pour la migration des coordonnées, mais c'est un prérequis pour la
   phase de validation serveur des déplacements.

**Fichiers concernés** : aucun (décisions documentaires et architecturales).

**Risques** : démarrer la migration sans ces décisions force des valeurs
provisoires qui devront être rechangées, doublant le travail.

**Critères de validation** : les 5 décisions listées sont prises et consignées
dans ADR-0001 ou dans un ADR complémentaire.

**Tests manuels** : aucun.

---

### Phase 1 — Module central de coordonnées

**Objectif** : créer les deux modules de conversion (backend TypeScript, frontend
JavaScript) avant tout usage. Aucun code existant ne les importe encore.

**Description** : voir section 10 — Proposition de module central. La création
du module sans aucun import est sans risque et permet de valider les formules
en isolation via des tests unitaires.

**Fichiers concernés** :

- Nouveau : `apps/api-gateway/src/world/world-coordinates.ts`
- Nouveau : `apps/client/src/phaser/world/world-coordinates.js`

**Risques** :

- Erreur dans les formules (bit ops, projection) non détectée sans tests. Les
  tests unitaires sont obligatoires avant de passer à la phase 2.

**Critères de validation** :

- Le module compile sans erreur (`npm run build` dans `apps/api-gateway`).
- Tests unitaires couvrent : `tileXFromWU`, `chunkXFromWU`, `localTileXFromWU`,
  `subTileXFromWU`, `tileToWU`, `tileCenterWU`, `wuToScreenX`, `wuToScreenY`,
  `screenToWUX`, `screenToWUY`.
- Cas limites couverts : `worldX = 0`, `worldX = 1023` (sub-tile max),
  `worldX = 1024` (première tile pleine), valeurs négatives.

**Tests manuels** : aucun (couverture par tests unitaires).

---

### Phase 2 — Migration entités statiques

**Objectif** : migrer les entités qui ne bougent pas à l'exécution —
`resource`, `creature_spawn`, `respawn_point`. Ce sont les moins risquées car
leur position n'est modifiée qu'en seed ou via l'outil admin.

**Fichiers concernés** :

- `src/resources/entities/resource.entity.ts` — renommer `x`, `y` → `worldX`, `worldY`; ajouter `mapId`
- `src/creatures/entities/creature-spawn.entity.ts` — renommer `spawnX`, `spawnY` → `worldX`, `worldY`; ajouter `mapId`
- `src/world/entities/respawn-point.entity.ts` — renommer `x`, `y` → `worldX`, `worldY`; `radius` → `worldRadius`; ajouter `mapId`
- `src/creatures/creatures.service.ts` — mise à jour des accès `a.spawn.spawnX` → `a.spawn.worldX`, seed des positions en WU
- `src/world/world.service.ts` — seed du `RespawnPoint` en WU, mise à jour des accès `nearest.x` → `nearest.worldX`
- `src/admin/admin.gateway.ts` — mise à jour des payloads de ressources émis vers le client

**Valeurs de seed à recalculer** : les positions des ressources et spawns sont
actuellement injectées via drag-and-drop admin (coordonnées pixel Phaser). Leur
conversion en WU dépend de l'offset final de la tilemap (Phase 0).

**Risques** :

- `synchronize: true` en dev : TypeORM renommera les colonnes en DROP + ADD,
  ce qui efface les données existantes. Sauvegarder ou réinitialiser la DB avant
  cette phase.
- Accès résiduels à `creature.spawn.spawnX` dans `creatures.service.ts` — à
  auditer exhaustivement avant merge.

**Critères de validation** :

- `npm run build` passe sans erreur.
- Redémarrage du backend : les entités statiques sont seedées avec des valeurs
  WU cohérentes.
- Les ressources et spawns sont visibles à leur position attendue dans Phaser
  (côté client, la conversion px ← WU doit être active dans le rendu).

**Tests manuels** :

- Vérifier dans le panneau admin que les ressources et animaux apparaissent aux
  positions attendues.
- Spawn d'une créature via drag-and-drop : vérifier que la position WU stockée
  correspond à la position visuelle.

---

### Phase 3 — Type ConnectedPlayer et service monde

**Objectif** : migrer la représentation en mémoire des joueurs connectés
(`ConnectedPlayer` dans `world.service.ts`).

**Fichiers concernés** :

- `src/world/world.service.ts` — renommer `x`, `y` dans `ConnectedPlayer` et `JoinedPlayer` → `worldX`, `worldY`; ajouter `mapId`; mettre à jour toutes les méthodes qui lisent/écrivent ces champs; mettre à jour `persistPlayerPosition`
- `src/world/world.gateway.ts` — `JoinWorldPayload` et `handlePlayerMove`
- `src/creatures/creatures.gateway.ts` — `player.x`, `player.y` dans `onAttackCreature`
- `src/resources/resources.gateway.ts` — `player.x`, `player.y` dans les sessions de récolte

**Note** : `creatures.service.ts` lit aussi `p.x`, `p.y` via `findNearestPlayer`. À
mettre à jour en même temps.

**Risques** :

- `ConnectedPlayer` est utilisé dans plusieurs gateways — une mise à jour
  partielle du type fera échouer la compilation. L'avantage : TypeScript
  détectera les accès résiduels à `x`/`y` après renommage.
- La session de récolte (`GatherSession`) mémorise `lastX`, `lastY`. À renommer
  en même temps.

**Critères de validation** :

- `npm run build` passe sans erreur TypeScript.
- Un joueur peut se connecter et sa position est correctement persistée en DB
  au format WU.

**Tests manuels** :

- Connexion avec un personnage, déplacement, déconnexion, reconnexion : vérifier
  que la position est restaurée correctement.
- Démarrer une récolte, se déplacer, vérifier que la session est annulée.

---

### Phase 4 — Entité Character

**Objectif** : migrer les colonnes `positionX`, `positionY` de l'entité
`Character`.

**Fichiers concernés** :

- `src/characters/entities/character.entity.ts` — renommer `positionX` → `worldX` (défaut en WU), `positionY` → `worldY`; ajouter `mapId`
- `src/world/world.service.ts` — accès à `character.positionX` → `character.worldX`; fallback `positionX ?? 400` → `worldX ?? FALLBACK_WU`

**Attention** : `synchronize: true` va supprimer les colonnes `positionX` /
`positionY` et créer `worldX` / `worldY` avec les valeurs par défaut. Toutes
les positions des personnages existants seront réinitialisées. C'est acceptable
en développement; à anticiper en pré-production.

**Risques** :

- Perte des positions sauvegardées au redémarrage (uniquement en dev avec
  `synchronize: true`).
- La valeur par défaut doit être en WU (par exemple, la position de la tilemap
  test au centre de la map en WU, pas en pixels).

**Critères de validation** :

- Un personnage se reconnecte à la position correcte en WU.
- Le fallback (personnage sans position) le place sur la map à une position
  visible.

**Tests manuels** :

- Créer un personnage, se déplacer, se déconnecter, vérifier la position
  restaurée.
- Tester le respawn : vérifier que la position WU du point de respawn est
  correctement utilisée.

---

### Phase 5 — Entité Creature + logique AI

**Objectif** : migrer les colonnes `x`, `y` de l'entité `Creature` et toute la
logique de mouvement AI dans `creatures.service.ts`.

**Fichiers concernés** :

- `src/creatures/entities/creature.entity.ts` — renommer `x`, `y` → `worldX`, `worldY`; ajouter `mapId`
- `src/creatures/creatures.service.ts` — toute la logique de mouvement (`doPatrolMovement`, `doFighting`, `doEscaping`), `toDto`, `findNearestPlayer`, `createAdminSpawn`, accès aux champs `creature.x`, `creature.spawn.spawnX`

**Note** : les constantes `MELEE_RANGE`, `RANGED_RANGE_DEFAULT`, `patrolRadius`,
`speedMin`, `speedMax`, `aggroRadius` ne sont **pas** recalibrées dans cette
phase — elles gardent leur valeur pixel provisoirement pour préserver le
comportement observable pendant la migration. La recalibration est en Phase 8.

**Risques** :

- Les calculs de distance (`Math.hypot`) et de déplacement (`creature.x + dirX * speed * dt`)
  doivent être convertis pour opérer en WU. Sans recalibration des constantes,
  les distances seront incorrectes mais le code sera fonctionnel.
- Risque de régression sur le comportement AI : les 15 tests Jest de
  `CreaturesService` doivent passer après migration.

**Critères de validation** :

- `npm run test -- creatures.service` — tous les tests verts.
- `npm run build` sans erreur.
- Les animaux patrouillent, agressent et fuient dans la scène.

**Tests manuels** :

- Observer le comportement de patrouille d'un turkey et d'un goblin.
- Attaquer un creature, vérifier l'aggro, la poursuite, la fuite.
- Vérifier le respawn d'un creature tué.

---

### Phase 6 — Payloads WebSocket (server → client)

**Objectif** : mettre à jour tous les événements émis par le serveur pour
qu'ils transportent `worldX`, `worldY`, `mapId` au lieu de `x`, `y`.

**Fichiers concernés** :

- `src/world/world.service.ts` — `character_respawn`, `character_teleport`
- `src/world/world.gateway.ts` — `world_joined`, `player_joined`, `player_moved`, `current_players`
- `src/creatures/creatures.service.ts` — `CreatureDto` (`x`, `y` → `worldX`, `worldY`, `mapId`)
- `src/creatures/creatures.gateway.ts` — `creatures`, `creature_update`
- `src/resources/resources.gateway.ts` — `resources`, `resource_update`

**Note** : cette phase est le point de rupture avec le client existant. Client et
serveur doivent être déployés ensemble ou une stratégie de compatibilité
temporaire doit être activée (voir section 8).

**Risques** :

- Déploiement non atomique client/serveur : si le client attend `x`/`y` et que
  le serveur émet `worldX`/`worldY`, tous les sprites se positionnent à (0, 0).
  C'est immédiatement visible.

**Critères de validation** :

- Les sprites de joueurs distants, animaux et ressources apparaissent aux
  bonnes positions dans Phaser.

**Tests manuels** :

- Deux fenêtres de navigateur connectées : vérifier que le joueur distant
  apparaît à la bonne position et se déplace correctement.
- Un creature se déplace : vérifier la correspondance position serveur / sprite.

---

### Phase 7 — Frontend rendering

**Objectif** : mettre à jour le client pour recevoir et émettre des WU, et
convertir via le module `world-coordinates.js`.

**Fichiers concernés** :

- `src/phaser/core/WorldScene.js` — `syncLocalPlayer`, `joinWorld`, handlers `world_joined`, `player_moved`, `character_teleport`, `character_respawn`, positionnement des sprites avec conversion WU → pixel via `wuToScreenX/Y`
- `src/phaser/player/PlayerController.js` — `tileSize = 32` → utiliser `tileXFromWU`; `arrivalThreshold` → WU
- `src/phaser/world/MapLoader.js` — `tileSize = 32` → aligner sur le rendu WU si nécessaire
- `src/phaser/admin/admin.actions.ts` — conversion Phaser px → WU avant émission de `admin:spawn` et `admin:teleport`
- `src/components/AdminPanel/AdminPanel.tsx` — drag-and-drop : convertir la position Phaser en WU avant émission
- `src/components/CoordinatesLayer/CoordinatesLayer.jsx` — afficher les coordonnées en WU (ou en tiles lisibles) plutôt qu'en pixels Phaser bruts

**Risques** :

- Le `TILEMAP_TEST_OFFSET_X = 936` est l'origin pixel de la map dans Phaser.
  Si cet offset change, toutes les conversions WU ↔ pixel seront décalées.
  L'origin doit être passé en paramètre à `wuToScreenX/Y`, pas hardcodé.
- Le `PlayerController` utilise `tileSize = 32` pour aligner la grille
  pathfinder. Après migration, la grille pathfinder opère en indices de tiles
  WU (`worldX >> 10`). La taille visuelle des tiles reste 32 px mais elle
  n'est plus une constante de logique.

**Critères de validation** :

- `npm run build` dans `apps/client` passe sans erreur.
- Le joueur se déplace et sa position est bien reflétée sur le serveur.
- Les ressources et animaux apparaissent aux bonnes positions visuelles.

**Tests manuels** :

- Vérifier le positionnement visuel des tiles de terrain vs les positions des entités.
- Vérifier que `CoordinatesLayer` affiche des valeurs cohérentes avec la position tile attendue.
- Cliquer pour se déplacer : vérifier que le pathfinding fonctionne.
- Drag-and-drop admin : vérifier que la créature spawnée apparaît à la bonne position.

---

### Phase 8 — Recalibration des constantes gameplay

**Objectif** : remplacer les valeurs pixel-équivalentes par des valeurs en WU
calibrées via gameplay testing. Cette phase ne modifie pas l'architecture — elle
ajuste des nombres.

**Fichiers concernés** :

- `src/creatures/creatures.service.ts` — `MELEE_RANGE`, `RANGED_RANGE_DEFAULT`, seeds `patrolRadius`, `speedMin`, `speedMax`, `aggroRadius`
- `src/resources/resources.gateway.ts` — `RESOURCE_INTERACT_RANGE`, `MOVE_TOLERANCE`
- `src/world/world.service.ts` — seed `RespawnPoint` en WU
- `src/phaser/player/Player.js` — `this.speed` en WU/s
- `src/phaser/player/PlayerController.js` — `arrivalThreshold` en WU
- `src/phaser/core/WorldScene.js` — distance de poursuite combat

**Approche** : repartir des valeurs actuelles en pixels et les convertir
approximativement via la projection, puis affiner par test. La distance
Euclidienne en WU n'est pas proportionnelle à la distance visuelle (voir
`docs/08_Gameplay/world-units-study.md`). Les valeurs de calibration doivent
être validées en jeu.

**Critères de validation** :

- Un joueur peut récolter une ressource en s'approchant à une distance visuelle
  raisonnable.
- Un creature commence à agresser à une distance agréable pour le gameplay.
- La vitesse de déplacement du joueur semble naturelle.

**Tests manuels** :

- Mesurer visuellement les portées de récolte et d'aggro.
- Comparer la vitesse du joueur à celle des animaux (turkey vs goblin).

---

## 8. Stratégie de compatibilité temporaire

La Phase 6 (payloads serveur) et la Phase 7 (client) constituent le point de
rupture : le serveur ne peut pas émettre `worldX`/`worldY` si le client attend
encore `x`/`y`.

**Option recommandée : double-champ temporaire (durée limitée)**

Pendant une fenêtre de transition courte (une session de développement), le
serveur émet les deux formats simultanément :

```
// Payload de transition (temporaire, à supprimer après validation)
{
  x: worldX,        // compat ancien client
  y: worldY,        // compat ancien client
  worldX: worldX,   // nouveau champ
  worldY: worldY,   // nouveau champ
  mapId: mapId,
}
```

Cette fenêtre permet de valider le client migré sans casser le rendu pendant
le développement. Elle doit être supprimée dès que le client est validé —
laisser les deux champs en production serait une dette permanente.

**Durée maximale** : une journée de développement. Si la transition dure
plus longtemps, cela indique un problème dans la migration client.

**Alternative : feature flag (non recommandée)**

Un flag serveur activant `worldX`/`worldY` à la place de `x`/`y` est plus
propre mais ajoute de la complexité. À éviter pour une équipe solo.

---

## 9. Stratégie pour éviter les constantes magiques

Les opérations WU (`>> 10`, `& 1023`, `>> 16`, `* 1024`, `/ 16`, `/ 32`) ne
doivent jamais être inline dans le code applicatif.

**Règle** : tout code qui extrait un tile index, un chunk index, un sub-tile
offset, ou qui convertit WU ↔ pixel, **doit appeler une fonction nommée**
exportée par le module central. Les opérations bit sont dans le module ; le
code métier ne connaît pas `1024`.

Exemples d'usages interdits :

```ts
// ❌ Interdit — constante magique inline
const tileX = worldX >> 10;
const chunkX = worldX >> 16;
const sub = worldX & 1023;
const screenX = origin.x + (worldX - worldY) / 16;
```

Exemples d'usages autorisés :

```ts
// ✅ Autorisé — appel de fonction nommée
import { tileXFromWU, chunkXFromWU, wuToScreenX } from './world-coordinates';
const tileX   = tileXFromWU(worldX);
const chunkX  = chunkXFromWU(worldX);
const screenX = wuToScreenX(worldX, worldY, mapOrigin);
```

Si la constante `1024` ou les bits `>> 10` apparaissent dans le code en dehors
du module de coordonnées, c'est un défaut de revue à corriger immédiatement.

---

## 10. Proposition de module central de coordonnées

### Localisation

| Environnement | Chemin suggéré |
|---|---|
| Backend NestJS | `apps/api-gateway/src/world/world-coordinates.ts` |
| Frontend Phaser | `apps/client/src/phaser/world/world-coordinates.js` |

Les deux modules doivent exporter exactement les mêmes fonctions avec les mêmes
signatures (noms et comportement identiques). Cela facilite l'implémentation
d'un futur shared package si le monorepo evolue.

### Fonctions à exporter (sans code)

**Conversions WU → grille de tiles**

- `tileXFromWU(worldX)` — index de tile global sur l'axe X
- `tileYFromWU(worldY)` — index de tile global sur l'axe Y
- `chunkXFromWU(worldX)` — index de chunk sur l'axe X
- `chunkYFromWU(worldY)` — index de chunk sur l'axe Y
- `localTileXFromWU(worldX)` — index de tile dans son chunk (0 à CHUNK_SIZE − 1)
- `localTileYFromWU(worldY)` — idem axe Y
- `subTileXFromWU(worldX)` — offset sub-tile (0 à TILE_SIZE_WU − 1)
- `subTileYFromWU(worldY)` — idem axe Y

**Conversions grille de tiles → WU**

- `tileToWU(tileIndex)` — convertit un index de tile en WU (coin nord-ouest)
- `tileCenterWU(tileIndex)` — centre d'un tile en WU (tile × 1024 + 512)

**Projection WU → pixel Phaser (client uniquement)**

- `wuToScreenX(worldX, worldY, originX)` — coordonnée pixel X dans la scène Phaser
- `wuToScreenY(worldX, worldY, originY)` — coordonnée pixel Y dans la scène Phaser

**Projection inverse pixel Phaser → WU (client uniquement, pointeur)**

- `screenToWUX(screenX, screenY, originX, originY)` — worldX en WU (arrondi)
- `screenToWUY(screenX, screenY, originX, originY)` — worldY en WU (arrondi)

**Distance gameplay (décision métrique requise en Phase 0)**

- `distanceWU(ax, ay, bx, by)` — distance entre deux points en WU selon la
  métrique retenue (Euclidienne ou Chebyshev); signature stable, implémentation
  à choisir après Phase 0

**Constantes à exporter**

- `TILE_SIZE_WU = 1024`
- `CHUNK_SIZE = 64`
- `CHUNK_SIZE_WU = 65536`
- `HALF_TILE_W = 64` (px, dépend du format de tile)
- `HALF_TILE_H = 32` (px, dépend du format de tile)

### Points d'attention

- Les fonctions de projection (WU → pixel) dépendent de l'origin de la map.
  L'origin doit être passé en paramètre, jamais hardcodé dans le module.
- Le module doit être pur (pas d'import Phaser, NestJS, TypeORM). Il n'a que
  des dépendances vers ses propres constantes.
- La version backend peut être testée avec Jest. La version client peut être
  testée avec Vitest ou Jest (sans Phaser).

---

## 11. Points bloquants avant toute modification réelle

Les éléments suivants doivent être décidés en Phase 0. Tout démarrage de code
avant leur résolution produit du travail à refaire.

### 11.1 Offset tilemap final

`TILEMAP_TEST_OFFSET_X = 936` dans `WorldScene.js` est marqué comme
temporaire. Toute conversion de coordonnée pixel → WU nécessite cet offset
comme paramètre d'origin. Tant que l'offset est provisoire, les seeds de
positions en WU seront également provisoires.

**Décision requise** : quelle est la coordonnée pixel Phaser du vertex nord de
la tile (0, 0) pour chaque map du projet ?

### 11.2 Métrique de distance gameplay

`isInRange` dans `resources.gateway.ts` et les comparaisons dans
`creatures.service.ts` utilisent `Math.hypot` (distance Euclidienne). En WU
isométrique, la distance Euclidienne WU ne correspond pas à la distance visuelle
à l'écran (voir `docs/08_Gameplay/world-units-study.md`). Les options sont :

- **Euclidienne WU** : identique à l'actuel, cohérente avec les formules
  physiques, mais la portée visuelle dépend de la direction.
- **Chebyshev WU** (`max(|Δx|, |Δy|)`) : portée visuelle en losange isométrique,
  plus intuitive en jeu isométrique.
- **Euclidienne pixel projetée** : recalculer la distance dans l'espace
  isométrique; plus coûteux mais correspond à la perception du joueur.

**Décision requise** avant de calibrer `MELEE_RANGE`, `RESOURCE_INTERACT_RANGE`
et `aggroRadius`.

### 11.3 INTEGER vs BIGINT

Pour la taille actuelle du projet (map de quelques centaines de tiles par côté),
`INTEGER` (int32, max ≈ 2,1 milliards de WU ≈ 2 millions de tiles par axe) est
amplement suffisant. `BIGINT` n'est utile que pour des mondes de taille
continentale.

**Décision recommandée** : `INTEGER`. À confirmer avant les migrations de Phase 2.

### 11.4 mapId par défaut

Aucune entité n'a de `mapId` actuellement. Pendant la migration, toutes les
entités existantes doivent recevoir un `mapId` par défaut.

**Décision requise** : valeur du `mapId` de la map initiale. Options : `1`
(int FK vers une future table `map`) ou `'default'` (string). Le type de la
colonne `mapId` en dépend.

### 11.5 Format collision serveur

Le serveur ne possède actuellement aucune grille de collisions. La validation
de walkabilité (ADR-0003, Phase B du plan de mouvement) est bloquée sur cette
absence. La migration de coordonnées peut être faite sans collision serveur,
mais la validation serveur des déplacements joueurs ne peut pas être activée
avant que le serveur ait accès aux données Tiled.

**Non bloquant pour les Phases 1-8**, mais à planifier en parallèle.

---

## Checklist de départ

Avant d'écrire la première ligne de code :

- [ ] Phase 0 : offset tilemap final décidé et consigné
- [ ] Phase 0 : métrique de distance retenue
- [ ] Phase 0 : `INTEGER` vs `BIGINT` confirmé
- [ ] Phase 0 : `mapId` par défaut défini
- [ ] DB sauvegardée (ou réinitialisée proprement) avant Phase 2
- [ ] Tests unitaires existants de `CreaturesService` tous verts avant Phase 5
- [ ] Module central créé et testé unitairement avant Phase 2

---

## Related files

- [ADR-0001 — Système de coordonnées monde](adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Positionnement des entités](adr/ADR-0002-entity-positioning.md)
- [ADR-0003 — Autorité serveur sur le mouvement](adr/ADR-0003-movement-authority.md)
- [Movement Model](../../docs/08_Gameplay/movement-model.md)
- [World Units Study](../../docs/08_Gameplay/world-units-study.md)
- [Client Server Boundaries](client-server-boundaries.md)
- [STATUS.md](../../STATUS.md)
