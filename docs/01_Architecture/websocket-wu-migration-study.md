# Étude — Migration WebSocket vers WU

_Date : 2026-06-22_
_Mise à jour : 2026-06-24 — P0–P6 soldés_
_Branche : main_
_Portée : protocole WebSocket_

---

## État de la migration (2026-06-24)

| Phase | Description | État |
|---|---|---|
| P0 | `join_world` — supprimer fallback `payload.x/y` | **SOLDÉ** |
| P1 | `player_move` additif — backend WU-first, fallback x/y conservé | **SOLDÉ** |
| P2 | Frontend joueurs — `resolveScreen()` WU-first | **SOLDÉ** |
| P3 | Frontend animaux + ressources — `resolveScreen()` WU-first | **SOLDÉ** |
| P4 | `character_respawn` + `character_teleport` — WU + chunkX/Y | **SOLDÉ** |
| P4.5 | Supprimer `x/y` legacy de `character_respawn` + `character_teleport` | **SOLDÉ** |
| P5 | `player_move` WU-only — supprimer fallback `x/y` | **SOLDÉ** |
| P6 | Protocole admin WU — 6 événements admin en `worldX/worldY` | **SOLDÉ** |
| P7 | Drop colonnes legacy DB (`positionX/Y`, `animal.x/y`) | À faire |

---

---

## 1. Événements client → serveur contenant des coordonnées

| Événement | Payload coordonnées | Unité | Fichier serveur | Fonction | Note |
|---|---|---|---|---|---|
| `join_world` | `x?: number, y?: number` | Pixels | `world.gateway.ts:70` | `WorldService.joinPlayer` | Fallback seulement — ignoré si `worldX/Y` valides en DB |
| `player_move` | `x: number, y: number` | Pixels | `world.gateway.ts:107` | `WorldService.updatePlayer` | Émis depuis `WorldScene.syncLocalPlayer` toutes les 80 ms |
| `attack_animal` | aucune | — | `animals.gateway.ts:46` | `AnimalsService.attack` | Position joueur prise de `client.data.player.worldX/Y` |
| `interact_resource` | aucune | — | `resources.gateway.ts:83` | `ResourcesGateway.onInteract` | Position joueur prise de `client.data.player.worldX/Y` |
| `get_resources` | aucune | — | `resources.gateway.ts:78` | — | — |
| `get_animals` | aucune | — | `animals.gateway.ts:41` | — | — |
| `admin:spawn` | `x: number, y: number` | Pixels | `admin.gateway.ts:35` | `AnimalsService.createAdminSpawn` | Drag-and-drop depuis la map Phaser |
| `admin:teleport` | `x: number, y: number` | Pixels | `admin.gateway.ts:62` | `WorldService.teleportCharacter` | Commande console `/tp x y` |
| `admin:move_animal` | `x: number, y: number` | Pixels | `admin.gateway.ts:151` | `AnimalsService.moveAnimal` | Drag-and-drop animal sur la map |
| `admin:spawn_resource` | `x: number, y: number` | Pixels | `admin.gateway.ts:258` | `AdminService.createResource` | Drag-and-drop ressource sur la map |
| `admin:update_animal` | `fields.x?: number, fields.y?: number` | Pixels | `admin.gateway.ts:200` | `AnimalsService.adminUpdateAnimal` | Édition directe dans le panneau admin |
| `admin:update_resource` | `fields.x?: number, fields.y?: number` | Pixels | `admin.gateway.ts:344` | `AdminService.updateResource` | Édition directe dans le panneau admin |

### Détail `join_world`

```typescript
// WorldScene.js:449 — ce que le frontend envoie
this.socket.emit("join_world", {
  characterId: character.id,
  name: character.name,
  sex: character.sex,
  x: this.player.x,     // pixels du sprite Phaser
  y: this.player.y,
  direction: this.player.direction,
});
```

```typescript
// world.service.ts:222 — utilisation serveur (fallback uniquement)
playerX = character.positionX ?? payload.x ?? 400;
playerY = character.positionY ?? payload.y ?? 300;
// Le serveur préfère toujours worldX/Y en DB — payload.x/y n'intervient
// que si character.positionX/Y est NULL ET character.worldX/Y absent
```

---

## 2. Événements serveur → client contenant des coordonnées

### Joueurs

| Événement | Payload coordonnées | Unité | Consommateur frontend | Utilisation |
|---|---|---|---|---|
| `world_joined` | `player.x, player.y` + `player.worldX, player.worldY, player.mapId` | Pixels + WU | `WorldScene.js:387` | `player.setPosition(player.x, player.y)` |
| `player_joined` | `player.x, player.y` + WU | Pixels + WU | `WorldScene.js:398` → `upsertRemotePlayer` | `sprite.setPosition(player.x, player.y)` |
| `current_players` | `player[].x, player[].y` + WU | Pixels + WU | `WorldScene.js:382` → `upsertRemotePlayer` | `sprite.setPosition` + tween |
| `player_moved` | `player.x, player.y` + WU | Pixels + WU | `WorldScene.js:402` → `upsertRemotePlayer` | `tweens.add({ x: player.x, y: player.y })` |
| `player_left` | aucune | — | `WorldScene.js:406` | — |
| `character_respawn` | `x: number, y: number` | Pixels | `WorldScene.js:425` | `player.setPosition(data.x, data.y)` |
| `character_teleport` | `x: number, y: number` | Pixels | `WorldScene.js:417` | `player.setPosition(data.x, data.y)` + `centerOn` |
| `character_damaged` | aucune | — | `WorldScene.js:410` | — |

> **Remarque** : `world_joined`, `player_joined`, `current_players`, `player_moved` émettent déjà `worldX/Y/mapId` via le type `ConnectedPlayer`. Le frontend les ignore pour l'instant et utilise uniquement `x/y`.

### Animaux

| Événement | Payload coordonnées | Unité | Consommateur frontend | Utilisation |
|---|---|---|---|---|
| `animals` | `animal[].x, animal[].y` | Pixels | `WorldScene.js:312` → `renderAnimals` → `upsertAnimal` | `sprite.setPosition(animal.x, animal.y)` |
| `animal_update` | `animal.x, animal.y` | Pixels | `WorldScene.js:360` → `upsertAnimal` | `tweens.add({ x: animal.x, y: animal.y })` |
| `animal_hit` | `...AnimalDto` incluant `x, y` | Pixels | Non consommé dans WorldScene (gateway direct) | — |

### Ressources

| Événement | Payload coordonnées | Unité | Consommateur frontend | Utilisation |
|---|---|---|---|---|
| `resources` | `resource[].x, resource[].y` (entité complète) | Pixels | `WorldScene.js:308` → `renderResources` | `add.image(resource.x, resource.y, ...)` |
| `resource_update` | `x?, y?` (seulement sur `admin:spawn_resource`) | Pixels | `WorldScene.js:342` → `upsertResource` | `tweens.add({ x: resource.x, y: resource.y })` si x/y présents |
| `resource_loot` | aucune | — | `WorldScene.js:326` | — |
| `gather_tick` | aucune | — | `WorldScene.js:352` | — |
| `gather_stopped` | aucune | — | `WorldScene.js:356` | — |

---

## 3. `ConnectedPlayer` — état actuel des champs

```typescript
// world.service.ts:19
export type ConnectedPlayer = {
  socketId: string;
  characterId: string;
  name: string;
  sex?: string;

  // ── Vérité serveur ──────────────────────────────────────────────────────────
  worldX: number;   // WU — calculé depuis DB (worldX/Y) ou isoScreenToWorldWU(x,y)
  worldY: number;
  mapId: number;

  // ── Cache de rendu pixels — destinés uniquement au frontend ────────────────
  x: number;        // pixels Phaser — dérivé de wuToIsoScreenX(worldX, worldY)
  y: number;

  direction?: string;
};
```

### Rôle de chaque champ

| Champ | Rôle | Utilisé par logique métier | Utilisé par frontend |
|---|---|---|---|
| `worldX` | Vérité WU — portée, respawn, animaux | ✅ `attack()`, `isInRange()`, `AnimalsGateway`, `ResourcesGateway` | ✅ présent dans payload mais ignoré |
| `worldY` | idem | ✅ | ✅ présent mais ignoré |
| `mapId` | Filtre de map | ✅ `findNearestPlayer`, `respawnCharacter`, etc. | ✅ présent mais ignoré |
| `x` | Cache pixels | ⚠️ `resources.gateway.ts` MOVE_TOLERANCE uniquement | ✅ `upsertRemotePlayer`, `world_joined` |
| `y` | Cache pixels | ⚠️ `resources.gateway.ts` MOVE_TOLERANCE uniquement | ✅ idem |

**`x/y` ne sont plus utilisés pour la logique métier** (la seule exception est `MOVE_TOLERANCE` dans `resources.gateway.ts`, ligne 170). Ils existent uniquement pour satisfaire le frontend.

### Écriture de `x/y` côté serveur

| Fonction | Écrit `x/y` depuis | État |
|---|---|---|
| `joinPlayer` | `wuToIsoScreenX/Y(worldX, worldY)` ou fallback DB | Actif (cache pour frontend) |
| `updatePlayer` | `wuToIsoScreenX/Y(payload.worldX, payload.worldY)` | **P5 SOLDÉ** — plus de pixels du client |
| `respawnCharacter` | `wuToIsoScreenX/Y(newWX, newWY)` | Actif (cache pour frontend) |
| `teleportCharacter` | `wuToIsoScreenX/Y(worldX, worldY)` | **P6 SOLDÉ** — plus de pixels admin |

---

## 4. `player_move` — état P5 (WU-only, **SOLDÉ**)

### Payload (client → serveur)

```typescript
// WorldScene.js — après P5
const position = {
  worldX: Math.round(worldXY.worldX),
  worldY: Math.round(worldXY.worldY),
  mapId: DEFAULT_MAP_ID,
  direction: this.player.direction,
};
this.socket.emit("player_move", position);
```

Émis : au maximum toutes les 80 ms, uniquement si worldX, worldY ou direction ont changé.

### Validation (world.gateway.ts) — après P5

```typescript
if (!payload || typeof payload.worldX !== 'number' || typeof payload.worldY !== 'number') return;
```

### Traitement (world.service.ts `updatePlayer`) — après P5

```typescript
player.worldX = payload.worldX;
player.worldY = payload.worldY;
if (Number.isFinite(payload.mapId)) player.mapId = payload.mapId;
player.x = Math.round(wuToIsoScreenX(player.worldX, player.worldY));
player.y = Math.round(wuToIsoScreenY(player.worldX, player.worldY));
player.direction = payload.direction ?? player.direction;
```

`isoScreenToWorldWU` supprimé de `updatePlayer`. Le pixel cache est désormais dérivé côté serveur.

### Persistance

Non persisté immédiatement. Persisté via `persistPlayerPosition` lors du `handleDisconnect` (et lors d'un rejoin).

### Diffusion

```typescript
client.broadcast.emit('player_moved', player);  // ConnectedPlayer complet
```

Payload émis : `ConnectedPlayer` entier incluant `worldX/Y/mapId` ET `x/y`. Tous les autres clients reçoivent la mise à jour.

### Version WU-native proposée

**Payload client → serveur :**
```typescript
{
  worldX: number,
  worldY: number,
  mapId: number,
  direction?: string
}
```

**Conversion serveur :**
```typescript
// updatePlayer — version WU-native
player.worldX = payload.worldX;
player.worldY = payload.worldY;
player.mapId = payload.mapId;
player.x = Math.round(wuToIsoScreenX(payload.worldX, payload.worldY));
player.y = Math.round(wuToIsoScreenY(payload.worldX, payload.worldY));
player.direction = payload.direction ?? player.direction;
```

**Soldé P5 :** gains effectifs — `isoScreenToWorldWU` supprimé de `updatePlayer`, mapId transmis, pixel cache dérivé côté serveur.

---

## 5. Compatibilité — x/y pixels à conserver jusqu'à la migration frontend

### Événements devant conserver `x/y` pixels

| Événement | Raison | Consommateur bloquant |
|---|---|---|
| `world_joined` | `player.setPosition(player.x, player.y)` | `WorldScene.js:390` |
| `player_joined` | `sprite.setPosition(player.x, player.y)` + tween | `WorldScene.js:504` |
| `current_players` | `upsertRemotePlayer` avec `x/y` | `WorldScene.js:384` |
| `player_moved` | `tweens.add({ x: player.x, y: player.y })` | `WorldScene.js:489` |
| `character_respawn` | `player.setPosition(data.x, data.y)` | `WorldScene.js:430` |
| `character_teleport` | `player.setPosition(data.x, data.y)` + `centerOn` | `WorldScene.js:419` |
| `animals` | `sprite.setPosition(animal.x, animal.y)` | `WorldScene.js:701` |
| `animal_update` | `tweens.add({ x: animal.x, y: animal.y })` | `WorldScene.js:707` |
| `resources` | `add.image(resource.x, resource.y, ...)` | `WorldScene.js:650` |
| `resource_update` | `tweens.add({ x: resource.x, y: resource.y })` | `WorldScene.js:671` |

### Événements pouvant immédiatement passer en WU (ou déjà sans x/y)

| Événement | Statut | Action possible maintenant |
|---|---|---|
| `attack_animal` | Pas de coordonnées dans le payload | Déjà WU (position joueur via `client.data.player.worldX/Y`) |
| `interact_resource` | Pas de coordonnées dans le payload | Déjà WU |
| `character_damaged` | Pas de coordonnées | Rien à faire |
| `resource_loot` | Pas de coordonnées | Rien à faire |
| `gather_tick`, `gather_stopped` | Pas de coordonnées | Rien à faire |
| `player_left` | Pas de coordonnées | Rien à faire |
| `resource_update` (loot) | Pas de coordonnées (standard) | Rien à faire |
| `world_joined`, `player_joined`, `current_players`, `player_moved` | **Contiennent déjà `worldX/Y/mapId`** dans `ConnectedPlayer` | Le frontend peut commencer à les lire sans modification serveur |
| `join_world` (payload x/y) | Ignoré si character a worldX/Y en DB | Peut être supprimé côté gateway après suppression côté frontend |

> **Observation clé** : les événements joueurs (`world_joined`, `player_joined`, `current_players`, `player_moved`) transmettent **déjà** `worldX/Y/mapId` sans modification serveur nécessaire. La migration frontend peut commencer immédiatement à lire ces champs, en parallèle du `x/y` actuel.

---

## 6. Plan de migration — ✅ P0–P6 soldés

~~Objectif final~~ **Atteint** : le backend ne reçoit plus de coordonnées pixels dans les payloads WebSocket clients. Les pixels ne sont produits côté serveur que comme cache pour le frontend (`ConnectedPlayer.x/y`).

### ~~P0~~ — Nettoyage `join_world` — **SOLDÉ**

**Contexte** : la Phase 1 est terminée — tous les `character` en DB ont `worldX/Y/mapId`. Le fallback sur `payload.x/y` dans `joinPlayer` n'est plus jamais atteint en pratique.

**Ce qui change :**
1. `world.service.ts` : supprimer les lignes 222-223 (`playerX = character.positionX ?? payload.x ?? 400`)
2. `world.gateway.ts` : retirer `x?` et `y?` de `JoinWorldPayload`

**Impact frontend :** aucun — `join_world` continue d'envoyer `x/y` depuis `WorldScene.js:453`, mais le serveur les ignore désormais explicitement.

**Implémentation** : ~5 lignes. Sans risque.

---

### P1 — `player_move` : additive (serveur + frontend simultanés)

**Stratégie** : additive — le client envoie `{ x, y, worldX, worldY, mapId, direction }`. Le serveur préfère `worldX/Y` si présents, tombe sur l'ancienne conversion sinon.

**Serveur — `world.gateway.ts`** : étendre le type du payload.
**Serveur — `world.service.ts` `updatePlayer`** :
```typescript
if (Number.isFinite(payload.worldX) && Number.isFinite(payload.worldY)) {
  player.worldX = payload.worldX;
  player.worldY = payload.worldY;
  if (Number.isFinite(payload.mapId)) player.mapId = payload.mapId;
  player.x = Math.round(wuToIsoScreenX(payload.worldX, payload.worldY));
  player.y = Math.round(wuToIsoScreenY(payload.worldX, payload.worldY));
} else if (Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
  // fallback legacy
  ...
}
```

**Frontend — `WorldScene.syncLocalPlayer`** :
```javascript
const worldXY = isoScreenToWorldWU(position.x, position.y); // à importer
position.worldX = worldXY.worldX;
position.worldY = worldXY.worldY;
position.mapId = DEFAULT_MAP_ID;
```

**Rollback** : si le frontend ne peut pas être déployé, le serveur continue avec le fallback pixels.

---

### P2 — `player_move` : drop `x/y` (nettoyage, après validation de P1)

Une fois P1 stable en prod :
- Supprimer le fallback `isoScreenToWorldWU(payload.x, payload.y)` dans `updatePlayer`
- Supprimer `x/y` de la validation gateway
- Frontend : supprimer `x/y` du payload `player_move`

---

### P3 — Événements serveur joueurs : frontend lit `worldX/Y`

Les événements `world_joined`, `player_joined`, `current_players`, `player_moved` transmettent **déjà** `worldX/Y/mapId`.

**Frontend — `WorldScene.js`** :
- `world_joined` : remplacer `player.setPosition(player.x, player.y)` par `setPosition(wuToIsoScreenX(...), wuToIsoScreenY(...))`
- `upsertRemotePlayer` : utiliser `worldX/Y` pour calculer `x/y` localement
- `character_respawn` : remplacer `data.x/y` par calcul depuis `data.worldX/Y`
- `character_teleport` : idem

**Serveur — après frontend migré** :
- `character_respawn` : supprimer `x/y` du payload (garder `worldX/Y`)
- `character_teleport` : supprimer `{ x, y }`, émettre `{ worldX, worldY }`
- `ConnectedPlayer` : supprimer `x/y` du type — world.service.ts ne les calcule plus
- `resources.gateway.ts` : supprimer `MOVE_TOLERANCE` pixel check, remplacer par comparaison WU

---

### P4 — Événements serveur animaux : `AnimalDto` WU-first

**Serveur — `animals.service.ts` `toDto()`** : ajouter `worldX` et `worldY` au DTO (déjà disponibles dans `animal.worldX/Y`).

**Frontend — après ajout `worldX/Y` dans le DTO** :
- `upsertAnimal` : utiliser `worldX/Y` pour `tweens.add` et `setPosition`

**Serveur — après frontend migré** :
- `toDto()` : supprimer `x: animal.x, y: animal.y`
- `animal.x/y` deviennent des champs internes non émis

---

### P5 — Événements serveur ressources : `Resource` WU-first

**Serveur — `resources.service.ts` `findAll()`** : retourner un DTO incluant `worldX/Y` (colonnes déjà présentes).

**Frontend** : utiliser `worldX/Y` pour `add.image` et `tweens.add`.

**Serveur — après frontend migré** :
- Supprimer `x/y` du payload `resources` et `resource_update`

---

### P6 — Admin protocol WU (optionnel, basse priorité)

Les événements admin (`admin:spawn`, `admin:teleport`, `admin:move_animal`, `admin:spawn_resource`) envoient des pixels depuis le panneau Phaser. La migration nécessite :
- Que l'admin panel frontend calcule `worldX/Y` avant d'émettre
- Que les handlers gateway acceptent WU

Peut rester en pixels indéfiniment tant que le panneau admin est usage interne uniquement.

---

### P7 — Drop colonnes legacy DB (post-migration complète)

Après P1-P5 stables :
- `character.positionX/Y` : schéma migration TypeORM, supprimer double-write
- `animal.x/y` : supprimer des colonnes DB (calculés à la volée dans `toDto`)
- `resource.x/y` : idem

---

### Séquence recommandée

```
P0 (join_world cleanup — serveur seul)
   ↓
P1 (player_move additive — serveur + frontend)
   ↓
P2 (player_move drop x/y — nettoyage)
   ↓
P3 (frontend joueurs lit worldX/Y)     P4 (AnimalDto + frontend animaux)     P5 (resources)
   ↓                                        ↓                                      ↓
   P3 cleanup serveur                    P4 cleanup serveur                     P5 cleanup serveur
                         ↓
                   P6 (admin, optionnel)
                         ↓
                   P7 (drop colonnes DB)
```

P3, P4 et P5 sont indépendants entre eux et peuvent avancer en parallèle.
P6 est optionnel et peut rester en pixels.
P7 nécessite que P3+P4+P5 soient terminés et stables.

---

### Risques

| Risque | Étape | Mitigation |
|---|---|---|
| Frontend envoie des `worldX/Y` incorrects (drift projection) | P1 | Garde-fou serveur : valider `Number.isFinite` et plage WU |
| `mapId` non transmis → mauvais filtre de map | P1 | `DEFAULT_MAP_ID` pour la map unique actuelle ; à étendre avec multi-map |
| Drop x/y de ConnectedPlayer casse un consommateur non référencé | P3 | Grep exhaustif avant suppression |
| `resources` sans x/y : ressources mal positionnées si worldX/Y absents | P5 | Valider que 100% des ressources ont `worldX/Y` non null avant drop |
| `AnimalDto` sans x/y : animaux non positionnés si `animal.worldX/Y` null | P4 | Déjà validé : tous les animaux ont `worldX/Y` en mémoire (vérité depuis A4) |
