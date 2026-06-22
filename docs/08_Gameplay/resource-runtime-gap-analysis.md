# Gap Analysis — Resources : Architecture vs Implémentation

## Metadata

- Status: Draft
- Owner: Project
- Created: 2026-06-23
- Reference: docs/08_Gameplay/resource-architecture.md
- Code audité: apps/api-gateway/src/resources/, apps/api-gateway/src/admin/, apps/client/src/phaser/core/WorldScene.js, apps/client/src/components/ActionPanel/, apps/client/src/components/AdminPanel/

---

## 1. Architecture actuelle

### Modèle de données

**`resource.entity.ts`**

| Champ | Type | Rôle |
|---|---|---|
| `id` | UUID | Identifiant unique de l'instance |
| `type` | string | Ex : "dead_tree", "ore" |
| `x` | int | Position screen pixels (legacy) |
| `y` | int | Position screen pixels (legacy) |
| `worldX` | int nullable | Position WU (migration P2, nullable) |
| `worldY` | int nullable | Position WU (migration P2, nullable) |
| `mapId` | int nullable | Identifiant de la map (nullable) |
| `state` | 'alive' \| 'dead' | LifeState binaire |
| `remainingLoots` | int | Charges restantes (défaut : 9999) |

**`resource-template.entity.ts`**

| Champ | Type | Rôle |
|---|---|---|
| `id` | UUID | Identifiant du template |
| `type` | string (unique) | Ex : "dead_tree", "ore" |
| `defaultRemainingLoots` | int | Charges initiales (défaut : 9999) |

Templates seedés : `dead_tree` et `ore`, tous deux avec `defaultRemainingLoots: 9999`.

---

### Runtime

**`resources.service.ts`**

- `onModuleInit` — upsert des templates au démarrage.
- `findAll()` — retourne toutes les instances.
- `findOne(id)` — récupère une instance par id.
- `consumeLoot(id)` — décrémente `remainingLoots`, passe `state` à `'dead'` quand 0.
- `markGathered(id)` — force state='dead', remainingLoots=0.
- `getDefaultRemainingLoots(type)` — lit le template, fallback 9999.

**`resources.gateway.ts`**

- Gather session : cycle 3 s (`GATHER_INTERVAL_MS`), un timer par socket.
- Distance WU via `chebyshevDistanceWU` (`RESOURCE_INTERACT_RANGE_WU = 1600`).
- Détection de mouvement : `Math.abs(player.x - session.lastX) > MOVE_TOLERANCE` (4 px legacy — dette documentée).
- `server.emit('resource_update', ...)` — broadcast global, pas de rooms.
- Loot via `loot.service.generateLoot(resource.type)`.

**`loot.service.ts`**

Switch codé en dur :
```
dead_tree → { itemId: 'wooden_stick', quantity: 1 }
ore       → { itemId: 'iron_ore',     quantity: 1 }
default   → { itemId: 'unknown',      quantity: 0 }
```
Aucun pool, aucune probabilité, aucune plage de quantité.

---

### Studio (Admin)

**`admin.gateway.ts`** — événements Resources :

| Événement | Action |
|---|---|
| `admin:spawn_resource` | Crée une instance (x/y pixels convertis en WU côté serveur) |
| `admin:delete_resource` | Hard delete DB |
| `admin:update_resource` | Modifie x, y, remainingLoots, state |
| `admin:update_resource_template` | Modifie defaultRemainingLoots |

**`admin.service.ts`** : CRUD direct DB (ResourceRepository). `createResource` reçoit x/y pixels, convertit en WU via `isoScreenToWorldWU`, assigné `mapId=DEFAULT_MAP_ID`.

**`AdminPanel.tsx`** : hiérarchie templates → instances, drag-and-drop map, édition inline, suppression. Réactif au `resource_update`.

---

### Interactions

**Client (ActionPanel.tsx)**

```
socket.emit("interact_resource", { targetId, characterId })
```

**Serveur**

1. Vérifie `payload.targetId` (string UUID).
2. Lit le `player` de `client.data` (posé par `join_world`).
3. Vérifie état de la resource et distance WU.
4. Lance le cycle gather (timer 3 s).
5. À chaque tick : revalide mouvement, distance, état.
6. Génère loot → `inventory.addItem` → `consumeLoot`.
7. Émet `resource_loot` au client, `resource_update` à tous.

---

### Sockets

| Événement | Émetteur | Destinataire | Rôle |
|---|---|---|---|
| `get_resources` | Client | Serveur | Demande la liste initiale |
| `resources` | Serveur | Client connecté | Liste complète des resources |
| `interact_resource` | Client | Serveur | Intent de récolte |
| `gather_tick` | Serveur | Client | Signal feedback visuel (barre de progression) |
| `gather_stopped` | Serveur | Client | Fin du cycle (déplacé, hors portée, épuisé) |
| `resource_loot` | Serveur | Client | Résultat du loot |
| `resource_update` | Serveur | TOUS | Mise à jour état/charges d'une resource |

---

### Persistance

- TypeORM `synchronize: true` — auto-création et migration des tables.
- Resources persistées en PostgreSQL, table `resources`.
- Templates persistés, table `resource_templates`.
- Aucun état volatile séparé de la DB.
- Aucun respawn timer persisté (inexistant).

---

## 2. Correspondance avec resource-architecture.md

### Concepts fondamentaux (§3)

| Concept | État | Notes |
|---|---|---|
| **Resource Type** | △ | `type` (string) existe — pas de taxonomie formelle (raw_wood, ore_iron) |
| **Template** | △ | `ResourceTemplate` existe — manque : loot pool, timer respawn, biome, rareté, capacités |
| **Resource Node** | ✗ | Absent — pas de couche Template → Node → Instance |
| **Instance** | △ | `Resource` existe — manque : Lifecycle séparé, node_member, override template par instance |
| **State** | △ | `state: 'alive' \| 'dead'` — LifeState binaire uniquement, pas d'`inactive`, pas d'états internes |
| **Quantity / Remaining Loots** | ✓ | `remainingLoots` décrémenté côté serveur, client non autorisé |
| **Interaction** | △ | Cycle gather implémenté et anti-cheat valide — manque : outil requis, compétence |
| **Ownership** | ✗ | Absent |
| **Visibility** | ✗ | Absent — resources toujours visibles si state='alive' |
| **Persistence** | ✓ | PostgreSQL via TypeORM |

### Cycle de vie (§4)

| Concept | État | Notes |
|---|---|---|
| **LifeState alive/dead** | △ | Binaire — pas d'`inactive`, pas d'états internes (being_harvested, hidden…) |
| **Lifecycle active/removed/destroyed** | ✗ | Absent — une resource "morte" reste en DB à state='dead' indéfiniment, ou est hard-deleted |
| **Parcours standard avec respawn** | ✗ | Aucun timer de respawn — les resources mortes restent mortes |
| **Parcours régénération** | ✗ | Absent |
| **Parcours maturité** | ✗ | Absent |
| **Parcours transformation sur place** | ✗ | Absent |
| **Parcours destruction définitive** | △ | `admin:delete_resource` supprime en DB, mais sans workflow Lifecycle formel |

### Capacités (§5)

| Capacité | État | Notes |
|---|---|---|
| `transform` | △ | worldX/Y présents, x/y pixels encore là (migration P2 faite, P5 non) |
| `harvestable` | △ | remainingLoots ok — pas d'outil requis, pas de durée configurable par template |
| `loot` | △ | Fonctionne — loot pool hardcodé dans LootService, pas dans le template |
| `respawn` | ✗ | Absent — aucun timer, aucun spawn point associé |
| `persistence` | ✓ | Implémenté |
| `validation` | ✗ | Absent |
| `bounds` | ✗ | Absent |
| `collision` | ✗ | Absent |
| `inventory` | ✗ | Non applicable actuellement (resource ne contient pas d'items) |
| `quest` | ✗ | Absent |
| `ownership` | ✗ | Absent |

### Loot et extraction (§7)

| Concept | État | Notes |
|---|---|---|
| **Loot produit par interaction** | ✓ | Fonctionne |
| **Loot dans template** | ✗ | LootService hardcodé, pas dans ResourceTemplate |
| **Loot déterministe vs probabiliste** | ✗ | Toujours 1 item fixe, aucun pool |
| **Quantité variable** | ✗ | Toujours quantity=1 |
| **Chaîne matière (loot → item → crafting)** | △ | Loot → item inventaire ok, crafting absent |

### Transformation (§8)

| Concept | État | Notes |
|---|---|---|
| **Formes de transformation** | ✗ | Absent — récolte uniquement |
| **Transformation sur place** | ✗ | Absent |
| **Remplacement par nouvelle instance** | ✗ | Absent |

### Respawn et Régénération (§9)

| Concept | État | Notes |
|---|---|---|
| **Respawn (disparition → réapparition)** | ✗ | **Absent** — lacune critique fonctionnelle |
| **Régénération (reconstitution sans disparaître)** | ✗ | Absent |
| **Timer configurable par template** | ✗ | Pas de champ `respawnTimerSeconds` dans ResourceTemplate |
| **Spawn Point associé** | ✗ | Aucun lien Resource → RespawnPoint |

### Autorité (§10)

| Concept | État | Notes |
|---|---|---|
| **Runtime autoritatif sur l'état** | ✓ | Client n'écrit jamais l'état |
| **Runtime autoritatif sur le loot** | ✓ | Client ne décide pas le loot |
| **Validation distance** | ✓ | WU via chebyshevDistanceWU |
| **Client exprime une intention** | ✓ | interact_resource est un intent |

### Studio (§11)

| Concept | État | Notes |
|---|---|---|
| **Resource Overlay** | ✗ | Absent dans DevTools |
| **Resource Inspector** | ✗ | Inspector WOM universel non implémenté |
| **Resource Editor** | △ | AdminPanel : édition partielle (x, y, remainingLoots, state, defaultRemainingLoots) |
| **Console `/spawn`** | △ | `admin:spawn_resource` fonctionne — coordonnées en pixels legacy |
| **Console `/deplete`** | ✗ | Absent |
| **Console `/respawn`** | ✗ | Absent (respawn inexistant) |
| **Console `/reset_zone`** | ✗ | Absent |
| **Console `/set_quantity`** | △ | Possible via `admin:update_resource { fields: { remainingLoots: N } }` |
| **Resource Monitoring** | ✗ | Absent |
| **Resource Automation** | ✗ | Absent |

### Validation (§12)

| Règle | État |
|---|---|
| Position invalide (hors bounds) | ✗ |
| Superposition | ✗ |
| Template absent ou invalide | ✗ |
| Biome incompatible | ✗ |
| Quantité incohérente | ✗ |
| Ownership incohérent | N/A (ownership absent) |
| Respawn invalide | N/A (respawn absent) |
| Accessibilité bloquée | ✗ |

---

## 3. Dette technique

### Dettes existantes (déjà dans STATUS.md)

- **`MOVE_TOLERANCE` en pixels** — détection de mouvement pendant la récolte encore en `player.x/y` (4 px legacy). Faible criticité — anti-exploit seulement.
- **`x/y` legacy dans l'entité Resource** — colonnes encore présentes, utilisées par le Studio pour l'affichage. Suppression prévue en P5-P7.

### Dettes identifiées par cet audit

**Lacune critique :**

- **Aucun respawn** — une resource épuisée reste `state='dead'` indéfiniment. Le monde ne se régénère pas. Aucun timer, aucun spawn point, aucun pipeline. C'est la plus grande lacune fonctionnelle du domaine Resources.

**Lacunes importantes :**

- **LootService hardcodé** — le loot n'est pas défini dans le template mais dans un switch codé en dur. Ajouter un type de resource = toucher le code. Pas de pool, pas de probabilité, pas de quantité variable.
- **Template sous-spécifié** — `ResourceTemplate` ne contient que `defaultRemainingLoots`. Manque : `respawnTimerSeconds`, `lootPool`, `biome`, `rarity`. Toute évolution réelle des Resources nécessite d'enrichir le template.
- **LifeState binaire sans Lifecycle** — il est impossible de distinguer "resource morte en attente de respawn" (removed) de "resource détruite définitivement" (destroyed). Le modèle d'état plat bloque l'implémentation du respawn propre.
- **`defaultRemainingLoots: 9999`** — valeur irréaliste qui désactive de fait le système de dépletion pour les deux templates actuels.
- **`admin:spawn_resource` reçoit des pixels** — position en coordonnées screen transmise depuis le drag-and-drop. La conversion est faite côté serveur, mais le payload ne reflète pas encore le système WU.

**Lacunes mineures :**

- **Pas d'états internes** — `being_harvested`, `hidden`, `partially_depleted` non modélisés. Blocage futur si deux joueurs tentent de récolter simultanément.
- **Broadcast global** — `server.emit('resource_update')` diffuse à tous les clients. Scalabilité à revoir avec les rooms.
- **Pas de validation** — aucune vérification de position, superposition, ou cohérence template lors de la création d'une resource.
- **Studio sans overlay** — le DevTools ne sait pas que les Resources existent. Aucun accès depuis les modules DevTools actuels.

---

## 4. Changements nécessaires

### Importance : Important

| # | Changement | Justification |
|---|---|---|
| I-1 | Ajouter `respawnTimerSeconds` dans `ResourceTemplate` | Prérequis du respawn |
| I-2 | Implémenter le pipeline de respawn dans `ResourcesService` | Lacune critique — le monde ne régénère pas |
| I-3 | Remplacer le loot hardcodé par un loot pool dans `ResourceTemplate` | Toute nouvelle resource nécessite actuellement une modif de code |
| I-4 | Corriger `defaultRemainingLoots: 9999` → valeurs réalistes pour les templates seedés | La dépletion est actuellement désactivée de fait |

### Importance : Moyen

| # | Changement | Justification |
|---|---|---|
| M-1 | Ajouter un champ `lifecycle` ou `deletedAt` à `Resource` pour distinguer removed/destroyed | Nécessaire pour un respawn propre sans hard-delete |
| M-2 | Corriger `MOVE_TOLERANCE` en WU dans `resources.gateway.ts` | Cohérence avec la migration WU P2 |
| M-3 | Passer les coordonnées de `admin:spawn_resource` en WU | Aligner le protocole Studio avec ADR-0001 |
| M-4 | Ajouter overlay Resources minimal dans DevTools | Visibilité Studio des Resources |

### Importance : Faible

| # | Changement | Justification |
|---|---|---|
| F-1 | Ajouter `state: 'being_harvested'` ou lock session côté modèle | Évite les conflits multi-joueurs sur une même resource |
| F-2 | Ajouter validation de base à la création (template existe, position valide) | Cohérence des données |
| F-3 | Émettre `resource_update` dans la room de la map plutôt qu'en broadcast global | Préparation scalabilité |
| F-4 | Exposer Resources dans le DevTools module World (lecture seule) | Cohérence avec l'architecture Studio |

---

## 5. Plan de migration

Principe : aucune modification destructive. Chaque étape est autonome et committable seule.

### Étape 0 — Correction préalable (non bloquante)

Corriger `defaultRemainingLoots: 9999` → `dead_tree: 3`, `ore: 5` dans le seed.  
Indépendant de tout le reste. Rend la dépletion opérationnelle immédiatement.

### Étape 1 — Template enrichi (prérequis du respawn)

Ajouter dans `ResourceTemplate` :
- `respawnTimerSeconds: number` (défaut : 120)
- Aucun autre champ pour l'instant.

Pas de migration DB manuelle nécessaire (`synchronize: true`). Le service lit le timer avant de lancer le respawn.

### Étape 2 — Respawn minimal (le plus petit diff utile)

Dans `ResourcesService` :

- Quand `consumeLoot` passe une resource à `state='dead'`, armer un `setTimeout` avec le `respawnTimerSeconds` du template.
- Au timeout : remettre `state='alive'`, `remainingLoots = defaultRemainingLoots`, persister.
- Émettre `resource_update` avec le nouvel état via le gateway.

Pas de Lifecycle, pas de `removed` : juste un timer en mémoire. Simple, fonctionnel, réversible.

**Risque :** si le serveur redémarre entre la mort et le respawn, le timer est perdu. Solution future : persister `respawnAt` en DB. À noter comme dette acceptable pour la première version.

### Étape 3 — Loot pool dans le template

Ajouter dans `ResourceTemplate` :
- `lootPool: string` — sérialisé en JSON (`[{ itemId: "wooden_stick", minQty: 1, maxQty: 3, probability: 1.0 }]`).

`LootService.generateLoot(resource.type)` remplacé par `LootService.generateLootFromPool(template.lootPool)`.  
L'ancienne logique de fallback reste jusqu'à ce que tous les templates aient un loot pool.

### Étape 4 — Correction MOVE_TOLERANCE en WU

Dans `resources.gateway.ts` : remplacer la comparaison `player.x/y` par `chebyshevDistanceWU(currentPosition, sessionPosition)`.  
Dette de la migration P2. Autonome, testable isolément.

### Étape 5 — Overlay Resources dans DevTools (lecture seule)

Nouveau composant `ResourceOverlay` dans `components/DevTools/modules/World/`.  
Affiche les Resources actives sur la carte (position, type, état, charges).  
Lecture seule, pas d'interaction. Utilise le bridge DevTools existant.

### Étapes futures (non planifiées ici)

- Ajout du Lifecycle formel (removed / destroyed) pour distinguer mort temporaire et définitive.
- Persistance du `respawnAt` en DB pour survie aux redémarrages.
- Resource Node (quota, densité écologique).
- Maturité et régénération.
- Validation des Resources (position, template, superposition).
- Rooms Socket.IO pour scaler les `resource_update`.

---

## 6. Ce qui ne doit surtout pas être modifié

| Zone stable | Raison |
|---|---|
| `Resource.id` (UUID) | Identifiant stable référencé par le frontend, le Studio, les sessions gather |
| `Resource.type` (string) | Utilisé comme clé de texture côté Phaser (`this.textures.exists(resource.type)`) |
| `Resource.state` ('alive' \| 'dead') | Consommé par `renderResources` (filtre `state === 'alive'`), `AdminPanel`, `resource_update` |
| `Resource.remainingLoots` | Logique de dépletion fonctionnelle et correcte |
| `Resource.worldX/Y/mapId` | Migration WU P2 déjà en place, stable |
| Cycle gather (timer 3 s, distance WU, movement check) | Anti-cheat validé, ne pas toucher |
| `resources.gateway.ts` — événements socket existants | Contrat client/serveur stable (`interact_resource`, `resource_loot`, `resource_update`, `gather_tick`, `gather_stopped`) |
| `WorldScene.js` — `renderResources`, `upsertResource`, `removeResource` | Intégration Phaser stable et correcte |
| `AdminPanel.tsx` — resource section | Fonctionnel pour le Studio actuel |
| `ResourcesModule` — structure NestJS | Correcte, ne pas refactorer |

---

## 7. Proposition d'ordre d'implémentation

```
Étape 0 — Seed réaliste (dead_tree: 3, ore: 5)
   │  Effort : minimal / Risque : nul
   │
   ▼
Étape 1 — Template + respawnTimerSeconds
   │  Effort : faible / Risque : faible
   │
   ▼
Étape 2 — Respawn en mémoire (setTimeout)
   │  Effort : moyen / Risque : faible (timer volatile, acceptable)
   │  → Monde jouable, les resources réapparaissent
   │
   ▼
Étape 3 — Loot pool dans template
   │  Effort : moyen / Risque : faible (fallback conservé)
   │  → Resources configurables sans toucher le code
   │
   ▼
Étape 4 — MOVE_TOLERANCE en WU
   │  Effort : faible / Risque : nul
   │
   ▼
Étape 5 — Overlay DevTools (lecture seule)
   │  Effort : moyen / Risque : nul (lecture seule)
   │
   ▼
[Futures] Lifecycle, respawnAt persisté, Node, Maturité, Validation
```

---

## Risques détectés

| Risque | Niveau | Mitigation |
|---|---|---|
| Timer respawn perdu au redémarrage serveur | Moyen | Acceptable en dev. Persister `respawnAt` en étape future. |
| Migration `lootPool` JSON mal formé | Faible | Validation à l'upsert + fallback hardcodé conservé pendant la transition |
| `MOVE_TOLERANCE` en pixels — faux positifs selon résolution | Faible | Corriger en étape 4, documenter en attendant |
| `server.emit` global — montée en charge | Important à terme | Rooms par map à prévoir, pas urgent maintenant |
| `defaultRemainingLoots: 9999` — dépletion inactive | Actuel | Corrigé en étape 0 |

---

## Fichiers associés

- [Resource Architecture](resource-architecture.md)
- [Entity Architecture](entity-architecture.md)
- [World Object Model](world-object-model.md)
- [MMORPG Studio — Vision](../07_Admin/mmorpg-studio.md)
- [STATUS.md](../../STATUS.md) — dette MOVE_TOLERANCE, P4/P5 protocole WU
