# Étude — Migration WU du système Resources

_Rédigé le 2026-06-22. Lecture seule — aucune modification de code._  
_Périmètre : `resources.gateway.ts`, `resources.service.ts`, `resource.entity.ts`,_  
_`admin.gateway.ts` (sections resource), `admin.service.ts`, `WorldScene.js`, `ActionPanel.tsx`._

---

## 1. Flux complet

### 1.1 Affichage initial

1. À la connexion, `ResourcesGateway.handleConnection` appelle `sendResources(client)`.
2. `ResourcesService.findAll()` lit la table `resources` (TypeORM, `repo.find()`) — renvoie l'intégralité des colonnes, dont `x`, `y`, `worldX`, `worldY`, `mapId`.
3. Le serveur émet `resources` → objet `Resource[]` brut (pas de DTO, pas de projection).
4. `WorldScene.renderResources()` filtre `state === 'alive'` et positionne chaque sprite à `resource.x, resource.y` via `this.add.image(resource.x, resource.y, textureKey)`.
5. Chaque ressource est ajoutée à `this.interactionTargets` comme cible cliquable (`kind: "resource"`).

### 1.2 Déclenchement de l'interaction

1. Le joueur clique sur un sprite de ressource dans Phaser.
2. `WorldScene` détecte la cible via `this.interactionTargets.find(t => t.sprite.getBounds().contains(x, y))`.
3. `actionPanel.store` ouvre le panneau React avec la cible.
4. Le joueur clique sur "gathering" dans `ActionPanel.tsx`.
5. `ActionPanel` émet `interact_resource → { targetId }` via `window.game.socket`.
   - Note : `characterId` est aussi envoyé dans le payload actuel (`{ targetId, characterId: character.id }`) mais n'est pas utilisé côté serveur — le serveur lit l'identité depuis `client.data.player`.

### 1.3 Vérification initiale (serveur)

`ResourcesGateway.onInteract` :

1. Lit `player = client.data.player` (type `PlayerData` — contient `x`, `y` en pixels, sans `worldX/Y`).
2. Vérifie qu'une session gather n'est pas déjà active. Si même cible → ignore. Si autre cible → annule l'ancienne.
3. Charge la ressource depuis DB (`findOne`).
4. Vérifie `state !== 'dead' && remainingLoots > 0`.
5. Vérifie la portée via `isInRange(player, resource)` — **check en pixels** (voir §3).
6. Démarre le cycle : `startGatherCycle(client, targetId, player.x, player.y)`.

### 1.4 Cycle de récolte

`startGatherCycle` :
1. Émet `gather_tick → { targetId, duration: 3000 }` — feedback visuel immédiat côté client.
2. Arme un `setTimeout(3000ms)` qui appellera `runGatherCycle`.

`runGatherCycle` (exécuté après 3 s) :
1. Vérifie que la session est toujours active et que le client est connecté.
2. Charge `client.data.player` — **contrôle de mouvement** en pixels (voir §3).
3. Recharge la ressource depuis DB.
4. **Re-vérifie la portée** via `isInRange(player, resource)` — **double check en pixels**.
5. Génère le loot (`LootService.generateLoot(resource.type)`).
6. Ajoute le loot à l'inventaire (`InventoryService.addItem`).
7. Consomme une charge (`consumeLoot`) : décrémente `remainingLoots`, passe à `state: 'dead'` si 0.
8. Émet `resource_loot → { itemId, lootItemId, quantity, total, item }` au récolteur seulement.
9. Émet `resource_update → { id, state, remainingLoots }` à **tous** (`server.emit`).
10. Si `state !== 'dead'` : relance `startGatherCycle` (cycle continu).
11. Si `state === 'dead'` : annule la session (`gather_stopped`).

### 1.5 Disparition

Quand `remainingLoots = 0`, `consumeLoot` retourne `{ state: 'dead', ... }`.  
`resource_update { state: 'dead' }` est broadcasté.  
`WorldScene.onResourceUpdate` : si `state === 'dead'` → `removeResource(id)`.  
`removeResource` supprime le sprite et retire la cible de `interactionTargets`.

### 1.6 Régénération

**Non implémentée.** Une fois morte, une ressource reste `dead` en DB. Il n'existe pas de timer de respawn pour les ressources. La méthode `markGathered()` dans `ResourcesService` (qui marque `state: 'dead', remainingLoots: 0`) n'est pas appelée dans le flux principal — `consumeLoot()` gère la transition elle-même.

### 1.7 Spawn admin

Via le panneau admin (drag-and-drop ou commande `/spawn`) :
1. `admin.gateway.ts:onSpawnResource` reçoit `{ type, x, y }` en pixels Phaser.
2. `adminService.createResource(type, x, y)` : `repo.save({ type, x, y, remainingLoots })` — **WU non calculés, colonnes `worldX/Y/mapId` restent NULL**.
3. Émet `resource_update → { id, type, x, y, state, remainingLoots }` à tous les clients.
4. `WorldScene.onResourceUpdate` : si `data.x !== undefined` → `upsertResource(data)` → positionne le sprite à `data.x, data.y`.

---

## 2. Coordonnées à chaque étape

| Étape | Source x/y | Unité | worldX/Y disponible ? |
|---|---|---|---|
| `findAll()` → `resources` payload | `resource.x`, `resource.y` (DB) | pixels Phaser | Oui dans l'entité (nullable) — non utilisé |
| Positionnement sprite `renderResources` | `resource.x`, `resource.y` | pixels Phaser | Non utilisé |
| `interactionTargets` — cible cliquable | sprite Phaser bounds (px) | pixels écran | Non applicable |
| `interact_resource` payload (C→S) | aucune — seulement `targetId` | — | — |
| `player` dans `onInteract` | `client.data.player.x/y` | pixels Phaser | Non disponible dans `PlayerData` |
| `isInRange(player, resource)` | `player.x/y`, `resource.x/y` | pixels Phaser | Non utilisé |
| `session.lastX/Y` (move check) | `player.x/y` | pixels Phaser | Non disponible |
| `consumeLoot` → `resource_update` | aucune (seulement state) | — | — |
| Spawn admin → DB | `Math.round(x)`, `Math.round(y)` | pixels Phaser | NULL (non calculé) |
| Update admin → `resource_update` | `resource.x`, `resource.y` | pixels Phaser | Non envoyé |
| `removeResource` / disparition | aucune coord | — | — |

**Résumé** : le système Resources est **entièrement en pixels Phaser** côté serveur. Les colonnes WU (`worldX`, `worldY`, `mapId`) existent dans l'entité et sont envoyées au client dans le payload `resources` initial (car `findAll()` retourne l'entité brute), mais elles ne sont ni lues ni écrites par aucune logique runtime.

---

## 3. Vérifications de distance

### 3.1 Inventaire complet

| Fichier | Fonction | Ligne(s) | Usage | Unité actuelle | Unité cible |
|---|---|---|---|---|---|
| `resources.gateway.ts` | `isInRange()` | 244–249 | Portée joueur/ressource avant gather | pixels (Euclidean `Math.hypot`) | WU (Chebyshev `chebyshevDistanceWU`) |
| `resources.gateway.ts` | `onInteract()` | 121 | Check portée à l'ouverture du cycle | pixels | WU |
| `resources.gateway.ts` | `runGatherCycle()` | 185 | Re-check portée à chaque tick (anti-cheat) | pixels | WU |
| `resources.gateway.ts` | `runGatherCycle()` | 167–169 | Détection de mouvement (MOVE_TOLERANCE) | pixels (abs diff) | WU (abs diff en WU) |

### 3.2 Constantes impliquées

| Constante | Valeur actuelle | Unité | Fichier | Équivalent WU |
|---|---|---|---|---|
| `RESOURCE_INTERACT_RANGE` | `100` | pixels Euclidean | `resources.gateway.ts:25` | TBD — calibration gameplay requise |
| `MOVE_TOLERANCE` | `4` | pixels (diff abs par axe) | `resources.gateway.ts:31` | TBD — calibration gameplay requise |
| `GATHER_INTERVAL_MS` | `3000` | millisecondes | `resources.gateway.ts:28` | Inchangé (temporel) |

### 3.3 Détails de `isInRange()`

```typescript
// resources.gateway.ts:244-249
private isInRange(
  player: { x: number; y: number },
  target: { x: number; y: number },
): boolean {
  const distance = Math.hypot(target.x - player.x, target.y - player.y);
  return distance <= RESOURCE_INTERACT_RANGE;
}
```

**Problème** : `player` est typé `{ x: number; y: number }` directement depuis `PlayerData` — il n'a pas accès à `worldX/Y`. Même si la ressource avait ses colonnes WU renseignées, la position joueur resterait en pixels.

**Problème secondaire** : `Math.hypot` donne une distance Euclidienne dans l'espace pixel Phaser. En isométrique, cette distance n'est pas symétrique dans l'espace monde (un déplacement N/S et E/W d'une tuile ne produisent pas le même delta pixel). La métrique cible est Chebyshev WU.

### 3.4 Détails du contrôle de mouvement

```typescript
// resources.gateway.ts:167-169
const moved =
  Math.abs(player.x - session.lastX) > MOVE_TOLERANCE ||
  Math.abs(player.y - session.lastY) > MOVE_TOLERANCE;
```

**Remarque** : `session.lastX/Y` est initialisé depuis `player.x/y` au démarrage du cycle (ligne 126, 241). Ce check est intentionnellement plus laxiste que `isInRange` : il laisse une petite tolérance de 4 px pour le jitter réseau/interpolation, sans recharger la DB.

---

## 4. Événements WebSocket

### 4.1 Gameplay (ResourcesGateway)

| Événement | Direction | Émetteur | Récepteur | Payload | Coordonnées |
|---|---|---|---|---|---|
| `get_resources` | C→S | Client (connexion / reconnexion) | `onGetResources` | aucun | — |
| `resources` | S→C | `sendResources` (connexion) | `WorldScene` | `Resource[]` brut (inclut `x`, `y`, `worldX?`, `worldY?`, `mapId?`) | pixels Phaser + WU nullable |
| `interact_resource` | C→S | `ActionPanel.tsx` | `onInteract` | `{ targetId: string, characterId: string }` | aucune |
| `gather_tick` | S→C | `startGatherCycle` | `WorldScene` | `{ targetId: string, duration: number }` | aucune |
| `resource_loot` | S→C | `runGatherCycle` | `WorldScene` (inventaire) | `{ itemId, lootItemId, quantity, total, item }` | aucune |
| `resource_update` | S→C | `runGatherCycle` (loot) | `WorldScene` (tous) | `{ id, state, remainingLoots }` | aucune |
| `gather_stopped` | S→C | `cancelGathering` | `WorldScene` | `{ targetId: string, reason: string }` | aucune |

**Note** : `resource_update` dans le flux loot normal **ne transporte pas de coordonnées**. `WorldScene` branche sur `data.x !== undefined` pour appeler `upsertResource` — cette branche est uniquement activée par les événements admin.

### 4.2 Admin (AdminGateway → server.emit)

| Événement | Émetteur | Payload | Coordonnées |
|---|---|---|---|
| `admin:spawn_resource` (C→S) | AdminPanel | `{ type, x, y }` | pixels Phaser |
| `admin:delete_resource` (C→S) | `ActionPanel.tsx` | `{ id }` | aucune |
| `admin:update_resource` (C→S) | AdminPanel | `{ id, fields: { x?, y?, state?, remainingLoots? } }` | `x/y` pixels Phaser |
| `admin:update_resource_template` (C→S) | AdminPanel | `{ type, fields }` | aucune |
| `resource_update` (S→C, spawn) | `onSpawnResource` | `{ id, type, x, y, state, remainingLoots }` | pixels Phaser |
| `resource_update` (S→C, delete) | `onDeleteResource` | `{ id, state: 'dead', deleted: true }` | aucune |
| `resource_update` (S→C, update) | `onUpdateResource` | `{ id, type, x, y, state, remainingLoots }` | pixels Phaser |

**Note importante** : `admin:update_resource` autorise `x`, `y` dans `numericAllowed` mais **n'inclut pas `worldX/Y/mapId`** — un repositionnement admin laisse les colonnes WU désynchronisées.

---

## 5. Base de données

### 5.1 Table `resources`

| Colonne | Type TypeORM | Nullable | Valeur par défaut | Usage runtime |
|---|---|---|---|---|
| `id` | `uuid` | non | auto | Clé primaire |
| `type` | `varchar` | non | — | `dead_tree`, `ore` |
| `x` | `int` | non | — | Position Phaser X (pixels) — lue par gateway et frontend |
| `y` | `int` | non | — | Position Phaser Y (pixels) — lue par gateway et frontend |
| `worldX` | `int` | oui | `null` | **Jamais lu ni écrit au runtime** |
| `worldY` | `int` | oui | `null` | **Jamais lu ni écrit au runtime** |
| `mapId` | `int` | oui | `null` | **Jamais lu ni écrit au runtime** |
| `state` | `varchar` | non | `'alive'` | Lu et écrit par `consumeLoot` et admin |
| `remaining_loots` | `int` | non | `9999` | Lu et écrit par `consumeLoot` |

### 5.2 Table `resource_templates`

| Colonne | Type | Nullable | Usage |
|---|---|---|---|
| `id` | `uuid` | non | Clé primaire |
| `type` | `varchar` | non | `dead_tree`, `ore` (unique) |
| `default_remaining_loots` | `int` | non | Valeur par défaut à la création |

Pas de colonne de position — les templates ne portent pas de coordonnées.

### 5.3 État des colonnes WU après Phase 1

Après le backfill exécuté (Phase 1), les colonnes `worldX/Y/mapId` des ressources existantes sont **renseignées**. Cependant :

- **Spawn admin** (`createResource`) : `worldX/Y/mapId` non calculés → `NULL` après spawn.
- **Update admin** (`updateResource`) : `worldX/Y/mapId` non mis à jour si `x/y` changent → divergence DB.
- **Runtime** : jamais écrits (pas de double-écriture comme pour `character`).

En conséquence, toute ressource créée ou déplacée **après le backfill** aura à nouveau des colonnes WU à `NULL`.

---

## 6. Frontend

### 6.1 Coordonnées utilisées

| Lieu | Fichier | Usage | Unité | Conversion WU nécessaire ? |
|---|---|---|---|---|
| `renderResources()` | `WorldScene.js:650` | `this.add.image(resource.x, resource.y, ...)` | pixels Phaser (depuis payload) | Oui, après migration protocole |
| `upsertResource()` — tween | `WorldScene.js:671` | `x: resource.x, y: resource.y` | pixels Phaser | Oui, après migration protocole |
| `upsertResource()` — création | `WorldScene.js:676` | `this.add.image(resource.x, resource.y, ...)` | pixels Phaser | Oui, après migration protocole |
| `interactionTargets` — sélection | `WorldScene.js:285` | `t.sprite.getBounds().contains(x, y)` | pixels écran Phaser | Non applicable (Phaser interne) |
| `removeResource()` | `WorldScene.js:769` | suppression sprite par id | — | Non applicable |
| `startGatherIndicator` | `WorldScene.js:588` | cercle sur sprite resource | pixels Phaser | Non applicable (suit le sprite) |

### 6.2 Où les conversions devront être faites (après migration protocole)

Quand le payload `resources` transportera `worldX/Y` au lieu de (ou en plus de) `x/y` :

1. `WorldScene.renderResources` : convertir `wuToIsoScreenX(resource.worldX, resource.worldY)` → coordonnées Phaser avant `add.image()`.
2. `WorldScene.upsertResource` : idem pour le tween de déplacement.
3. Aucun changement nécessaire pour `removeResource`, `interactionTargets`, ni `gather_stopped`.

La conversion WU → pixels est disponible dans `world-coordinates.ts` via `wuToIsoScreenX(worldX, worldY)` et `wuToIsoScreenY(worldX, worldY)`. Le frontend devra importer ou recoder ces formules.

---

## 7. Plan de migration

Découpage en étapes indépendantes et ordonnées. **Aucun code modifié ici.**

### Étape R0 — Prérequis : exposer `worldX/Y/mapId` dans `client.data.player`

**Bloquant pour R2 et R3.** Sans cette étape, `isInRange()` ne peut pas utiliser les WU joueur.

- `world-socket.ts` : ajouter `worldX: number; worldY: number; mapId: number` à `PlayerData`.
- `world.gateway.ts` : dans `handleMessage('player_move')`, mettre à jour `client.data.player` avec `worldX/Y/mapId` du `ConnectedPlayer`.
- `world.service.ts:updatePlayer` : déjà fait pour `ConnectedPlayer`; répercuter dans `client.data.player`.
- Impact : zéro changement visible côté gameplay. Purement interne.

### Étape R1 — Double-écriture admin : WU lors du spawn/update

**Indépendant de R0.** Évite que les ressources créées après le backfill perdent leurs colonnes WU.

- `admin.service.ts:createResource` : calculer `isoScreenToWorldWU(x, y)` et persister `worldX`, `worldY`, `mapId = DEFAULT_MAP_ID`.
- `admin.gateway.ts:onUpdateResource` : si `x` ou `y` sont dans `fields`, recalculer et écrire `worldX/Y/mapId` avec les nouvelles coordonnées.
- Tests : vérifier qu'après un spawn admin, les colonnes WU sont non-NULL.

### Étape R2 — Migrer `isInRange()` vers Chebyshev WU

**Dépend de R0 (worldX/Y dans PlayerData) et du backfill (resources worldX/Y non-NULL).**

- `resources.gateway.ts` : remplacer `isInRange(player, resource)` par `chebyshevDistanceWU(playerWU, resourceWU) <= RESOURCE_INTERACT_RANGE_WU`.
- Définir `RESOURCE_INTERACT_RANGE_WU` — valeur issue de la calibration gameplay (remplace les 100 px).
- La signature de `isInRange` doit accepter `{ worldX: number; worldY: number }` pour les deux arguments.
- Fallback défensif : si `resource.worldX == null`, refuser l'interaction (log + return false) plutôt que laisser passer un check NaN.

### Étape R3 — Migrer le contrôle de mouvement vers WU

**Dépend de R0.**

- `resources.gateway.ts` : `GatherSession` stocke `lastWX: number; lastWY: number` en plus de `lastX/Y`.
- `startGatherCycle` reçoit `worldX, worldY` en plus de `x, y`.
- `runGatherCycle` : `moved = chebyshevDistanceWU({worldX: player.worldX, worldY: player.worldY}, {worldX: session.lastWX, worldY: session.lastWY}) > MOVE_TOLERANCE_WU`.
- Définir `MOVE_TOLERANCE_WU` — calibration gameplay.

### Étape R4 — Migration protocole `resources` payload (optionnel)

**Dépend de R1 (WU non-NULL pour toutes les ressources).** N'est pas un prérequis de R2/R3.

- `ResourcesService.findAll()` : retourner une projection `ResourceDto` incluant `worldX/Y/mapId` validés.
- `resource_update` admin : inclure `worldX/Y/mapId` dans le broadcast de spawn/update.
- Côté client (`WorldScene`) : lire `worldX/Y` et convertir avec `wuToIsoScreenX/Y()` pour positionner les sprites.
- Rétrocompatibilité : conserver `x/y` en parallèle le temps de la transition (comme pour les autres entités).

### Étape R5 — Suppression des colonnes legacy (future)

**Dépend de R4 validé en production.**

- Retirer `x`, `y` des payloads WebSocket.
- Envisager une migration TypeORM pour supprimer les colonnes `x`, `y` de la table `resources` (hors scope Phase 2).

---

## Synthèse des dépendances

```
R0 (expose worldX/Y dans PlayerData)
  └─→ R2 (isInRange WU)
  └─→ R3 (MOVE_TOLERANCE WU)

R1 (double-écriture admin WU)
  └─→ R2 (prérequis : resources.worldX non-NULL)
  └─→ R4 (migration protocole — optionnel)

R4 (protocole worldX/Y dans resources payload)
  └─→ R5 (suppression colonnes legacy — future)
```

**Ordre recommandé pour Phase 2** : R0 → R1 → R2 → R3. R4 et R5 sont reportables.

---

## Risques identifiés

| Risque | Impact | Mitigation |
|---|---|---|
| Ressource créée/déplacée après backfill avec `worldX/Y = NULL` | `isInRange` WU bloquerait l'interaction | Fallback défensif dans R2 : refuser si WU NULL avec log explicite |
| `RESOURCE_INTERACT_RANGE_WU` mal calibré | Portée trop grande (tricherie) ou trop petite (frustration) | Calibration empirique sur la map isométrique avant activation |
| `PlayerData` sans `worldX/Y` | Gateway ne peut pas faire de check WU joueur | R0 obligatoire avant R2 |
| `server.emit('resource_update')` broadcast global | Acceptable maintenant, dette scalabilité | Rooms/zones à prévoir (dette existante commune à toutes les gateways) |
| Admin peut changer `x/y` sans mettre à jour `worldX/Y` | Divergence DB jusqu'à R1 | R1 corrige ce cas |
