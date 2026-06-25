# Runtime Snapshot — Surface observable Studio SDK

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/08_Gameplay/runtime/README.md, docs/08_Gameplay/runtime/runtime-trace.md, docs/07_Admin/studio-sdk.md
- Used by: Project owner, developers, Claude Code
- Source files:
  - `apps/api-gateway/src/player-runtime/entity-runtime.types.ts`
  - `apps/api-gateway/src/player-runtime/runtime-source.ts`
  - `apps/api-gateway/src/player-runtime/player-runtime.types.ts`
  - `apps/api-gateway/src/player-runtime/player-runtime.service.ts`

---

## 1. Rôle du snapshot

Le **snapshot** est le seul objet que le Studio SDK expose au Studio.
Il contient tout ce dont le Studio a besoin pour afficher l'état complet
d'une entité sans recalculer quoi que ce soit.

Un snapshot est :
- **Immutable** — lecture seule (`readonly` sur tous les champs)
- **Autosuffisant** — aucune requête supplémentaire n'est nécessaire
- **Horodaté** — `computedAt` identifie l'instant du calcul
- **Cohérent** — `modifiers`, `sources[].modifiers` et `trace` décrivent les mêmes données

---

## 2. EntityRuntimeSnapshot — contrat générique

`EntityRuntimeSnapshot<TBase, TDerived>` est le contrat commun à tout snapshot
d'Entity Runtime.

| Champ | Type | Description |
|---|---|---|
| `entityId` | `string` | UUID de l'entité en DB |
| `entityKind` | `EntityRuntimeKind` | Kind discriminant (player, creature…) |
| `name` | `string` | Nom de l'entité |
| `mapId` | `number?` | Carte courante (optionnel) |
| `worldX` | `number?` | Position WU (optionnel) |
| `worldY` | `number?` | Position WU (optionnel) |
| `baseStats` | `TBase` | Stats brutes issues de la DB |
| `derivedStats` | `TDerived` | Stats calculées après modifiers |
| `sources` | `ReadonlyArray<{kind: string; modifiers: ReadonlyArray<RuntimeModifier>}>` | Modifiers par pipeline |
| `modifiers` | `ReadonlyArray<RuntimeModifier>` | Liste plate de tous les modifiers actifs |
| `trace` | `RuntimeTrace` | Audit complet du calcul |
| `computedAt` | `Date` | Horodatage du calcul |

`sources[].kind` est typé `string` dans l'interface générique pour éviter une
dépendance circulaire avec `runtime-source.ts`. Les implémentations concrètes
utilisent `RuntimeSourceKind`.

Les paramètres génériques `TBase` et `TDerived` permettent de typer précisément
les stats selon le kind d'entité :
- Pour un joueur : `EntityRuntimeSnapshot<BaseStats, DerivedStats>`
- Pour une créature future : `EntityRuntimeSnapshot<CreatureBaseStats, CreatureDerivedStats>`

---

## 3. PlayerRuntimeSnapshot — implémentation Player

`PlayerRuntimeSnapshot` est la première implémentation concrète de
`EntityRuntimeSnapshot`.

Elle étend le contrat générique avec :

| Champ spécifique | Type | Description |
|---|---|---|
| `entityKind` | `'player'` | Valeur fixe — discrimine TypeScript |
| `characterId` | `string` | Alias pour `entityId` — backward-compat APIs player-specific |
| `sources` | `ReadonlyArray<{kind: RuntimeSourceKind; modifiers: ...}>` | Sources typées avec `RuntimeSourceKind` |

**entityId === characterId** pour un joueur. Les deux champs sont exposés :
- `entityId` : utilisé par le Studio SDK générique et le Runtime Inspector
- `characterId` : utilisé par les APIs player-specific (endpoints debug, events Socket.IO)

### BaseStats (Player)

Stats directement issues de `Character` en DB — jamais calculées ni extrapolées.

| Champ | Type | Description |
|---|---|---|
| `level` | `number` | Niveau du personnage |
| `health` | `number` | PV actuels |
| `maxHealth` | `number` | PV maximum base (avant modifiers) |
| `attack` | `number` | Attaque de base |
| `defense` | `number` | Défense de base |
| `experience` | `number` | Expérience actuelle |

### DerivedStats (Player)

Stats calculées depuis `BaseStats` + modifiers actifs.

| Champ | Type | Description | État |
|---|---|---|---|
| `maxHp` | `number` | PV maximum après modifiers équipement | Implemented |
| `attackPower` | `number` | Puissance d'attaque finale | Implemented |
| `defenseTotal` | `number` | Défense totale finale | Implemented |
| `attackRange` | `number` | Portée d'attaque | Implemented |
| `speed` | `number` | Vitesse de déplacement | Implemented (0 par défaut — pas de valeur DB) |
| `gatheringRange` | `number` | Portée de récolte | Implemented (0 par défaut — pas de valeur DB) |

---

## 4. Construction du snapshot — getRuntimeSnapshot()

`PlayerRuntimeService.getRuntimeSnapshot(characterId)` est le point unique
de production d'un `PlayerRuntimeSnapshot`.

Étapes internes (ordre) :
1. Lecture `Character` + `CharacterEquipment` + effets actifs depuis la DB.
2. `buildSources(character)` → `[EquipmentSource, EffectSource, DebugSource]`
3. `resolveModifiers(sources)` → liste plate `RuntimeModifier[]`
4. `calculateDerived(base, modifiers)` → `DerivedStats` + `RuntimeTrace`
5. Construction du snapshot avec `entityId = character.id`, `entityKind = 'player'`.

Retourne `null` si le personnage n'existe pas.

---

## 5. Cohérence interne du snapshot

Le snapshot contient trois vues sur les mêmes données :

| Vue | Description |
|---|---|
| `snapshot.modifiers` | Liste plate — tous les modifiers actifs |
| `snapshot.sources[i].modifiers` | Groupé par pipeline |
| `snapshot.trace.stats[stat].modifiers` | Groupé par stat ciblée |

Ces trois vues sont cohérentes : un modifier présent dans `modifiers` est
présent dans la vue source correspondante et dans la trace de la stat qu'il cible.

`snapshot.modifiers.length === snapshot.trace.modifierCount` doit toujours être vrai.

---

## 6. RuntimeSourceSnapshot — snapshot de source uniquement

`RuntimeSourceSnapshot` est un sous-ensemble du `PlayerRuntimeSnapshot`,
utilisé dans certains événements (`RuntimeCreatedEvent`) pour transporter
uniquement la vue sources + trace sans les stats.

| Champ | Description |
|---|---|
| `characterId` | Alias player-specific |
| `sources` | Sources groupées avec leurs modifiers |
| `trace` | Trace complète |
| `computedAt` | Horodatage |

Ce type est player-specific (utilise `characterId`). Un futur refactoring
pourrait le généraliser via `entityId`.

---

## 7. Snapshots futurs (Planned)

Pour les prochains Entity Runtime, chaque implémentation doit produire un
snapshot qui étend `EntityRuntimeSnapshot` :

| Snapshot | Kind | Champs spécifiques envisagés |
|---|---|---|
| `CreatureRuntimeSnapshot` | `'creature'` | `aiState`, `aggroRadius`, `leashRadius`, `respawnAt` |
| `NpcRuntimeSnapshot` | `'npc'` | `dialogueState`, `questIds`, `inventoryIds` |
| `ResourceRuntimeSnapshot` | `'resource'` | `remainingLoots`, `respawnAt`, `durability` |
| `BuildingRuntimeSnapshot` | `'building'` | `ownerId`, `productionRate`, `storageCapacity` |

Ces champs spécifiques ne feront pas partie de `EntityRuntimeSnapshot` — ils
restent dans chaque snapshot concret.

---

## 8. Règles du Studio SDK sur le snapshot

Le Studio peut :
- Lire tous les champs du snapshot.
- Afficher `sources`, `modifiers`, `trace`, `baseStats`, `derivedStats`.
- Comparer deux snapshots pour détecter une évolution de stat.
- Utiliser `computedAt` pour ordonner des snapshots chronologiquement.

Le Studio ne peut pas :
- Modifier un champ du snapshot.
- Recalculer `derivedStats` depuis `baseStats` et `modifiers`.
- Appeler `getModifiers()` directement sur une source.
- Produire un nouveau snapshot — c'est le rôle exclusif du service Runtime.

---

## 9. Endpoint REST pour le snapshot joueur

| Route | Description | Auth |
|---|---|---|
| `GET /player-runtime/me/snapshot` | Snapshot du personnage connecté | JWT (joueur) |
| `GET /player-runtime/:characterId/snapshot` | Snapshot par ID | JWT admin |

Le frontend Runtime Inspector consomme `/player-runtime/me/snapshot` via
`runtimeApi.fetchSnapshot()`. L'endpoint résout `characterId` depuis le JWT.

---

## Related files

- [README](README.md) — index du répertoire runtime
- [Runtime Entity](runtime-entity.md) — EntityRuntimeSnapshot, contrats génériques
- [Runtime Sources](runtime-sources.md) — construction des sources
- [Runtime Trace](runtime-trace.md) — structure de la trace
- [Runtime Inspector](runtime-inspector.md) — consommation Studio
- `apps/api-gateway/src/player-runtime/entity-runtime.types.ts`
- `apps/api-gateway/src/player-runtime/runtime-source.ts`
- `apps/api-gateway/src/player-runtime/player-runtime.service.ts`
- `apps/api-gateway/src/player-runtime/player-runtime.controller.ts`
