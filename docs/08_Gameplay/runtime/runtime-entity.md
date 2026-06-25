# Runtime Entity — Architecture générique

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/08_Gameplay/runtime/README.md, docs/08_Gameplay/entity-architecture.md
- Used by: Project owner, developers, Claude Code
- Source files:
  - `apps/api-gateway/src/player-runtime/entity-runtime.types.ts`
  - `apps/api-gateway/src/player-runtime/runtime-source.ts`

---

## 1. Qu'est-ce qu'un Entity Runtime

Un **Entity Runtime** est la représentation calculée en mémoire d'une entité
du monde à un instant T. Il ne persiste pas en DB. Il est reconstruit à la
demande à partir des sources existantes (DB, état en mémoire).

Un Entity Runtime encapsule :
- l'identité de l'entité (entityId, entityKind, name, position optionnelle)
- ses stats de base (issues de la DB)
- ses stats dérivées (calculées après application des modifiers)
- ses sources de modifiers (par pipeline)
- la trace complète du calcul

Le terme "Runtime" insiste sur le fait que cet objet n'existe qu'à l'exécution.
Modifier la DB (Character, Equipment…) invalide le Runtime de cette entité.

---

## 2. EntityRuntimeKind

`EntityRuntimeKind` est la discrimination fondamentale : elle identifie quel
type d'entité du monde est représentée par un Runtime.

| Kind | Entité | Spécificités propres |
|---|---|---|
| `player` | Personnage joueur | equipment, inventory, skills, account, isConnected, socketId |
| `creature` | Créature IA | aiState, aggroRadius, leashPoint, respawnTimer |
| `npc` | PNJ | dialogues, quêtes, marchandises |
| `resource` | Ressource de récolte | remainingLoots, lootPool, respawnAt, durability |
| `building` | Bâtiment | owner, production, storage |

Ces spécificités ne font pas partie du contrat commun (`EntityRuntimeSnapshot`).
Elles sont portées par les snapshots concrets de chaque kind.

La constante `ENTITY_RUNTIME_KINDS` (tableau des 5 kinds) est disponible pour
validation et itération côté code.

---

## 3. EntityRuntimeIdentity

`EntityRuntimeIdentity` est l'identité commune à tout Entity Runtime.

| Champ | Type | Description |
|---|---|---|
| `entityId` | `string` | UUID de l'entité en DB |
| `entityKind` | `EntityRuntimeKind` | Kind discriminant |
| `name` | `string` | Nom affiché |
| `mapId` | `number?` | Carte courante — optionnel (contextes headless, tests) |
| `worldX` | `number?` | Position WU — optionnel |
| `worldY` | `number?` | Position WU — optionnel |

La position est optionnelle car certains Entity Runtime (ressource fixe,
bâtiment) n'ont pas de position dynamique, et certains contextes (tests
unitaires) ne l'exposent pas.

---

## 4. EntityRuntimeService

`EntityRuntimeService<TSnapshot>` est le contrat minimum que tout service
Entity Runtime doit respecter.

```
EntityRuntimeService
  └── getRuntimeSnapshot(entityId: string): Promise<TSnapshot | null>
```

- `getRuntimeSnapshot` est l'unique méthode obligatoire.
- Retourne `null` si l'entité n'existe pas ou n'est pas accessible.
- Ne lance pas d'exception pour une entité inconnue — retourne `null`.

### Implémentations actuelles (Implemented)

| Service | Snapshot | État |
|---|---|---|
| `PlayerRuntimeService` | `PlayerRuntimeSnapshot` | Implemented |

### Implémentations futures (Planned)

| Service | Snapshot | État |
|---|---|---|
| `CreatureRuntimeService` | `CreatureRuntimeSnapshot` | Planned |
| `NpcRuntimeService` | `NpcRuntimeSnapshot` | Planned |
| `ResourceRuntimeService` | `ResourceRuntimeSnapshot` | Planned |
| `BuildingRuntimeService` | `BuildingRuntimeSnapshot` | Planned |

---

## 5. PlayerRuntime — première implémentation

`PlayerRuntimeSnapshot` est la première et, à ce stade, unique implémentation
de `EntityRuntimeSnapshot`.

Elle étend le contrat générique avec :
- `entityKind: 'player'` — valeur fixe, discrimine au niveau du type TypeScript
- `characterId: string` — alias pour `entityId`, conservé pour les APIs
  player-specific (endpoints debug, events Socket.IO)

La valeur de `entityId` est toujours égale à `characterId` pour un joueur.

### Résumé de `PlayerRuntimeService`

| Méthode | Rôle |
|---|---|
| `getPlayerRuntime(characterId)` | Lit Character + Equipment + Effects depuis la DB |
| `getRuntimeStats(characterId)` | Retourne BaseStats + DerivedStats |
| `getRuntimeSnapshot(characterId)` | Produit le PlayerRuntimeSnapshot complet |
| `recalculateRuntime(characterId)` | Reconstruit le snapshot et émet l'événement |
| `addDebugModifier(characterId, input)` | Injecte un modifier debug via DebugModifierRegistry |
| `clearDebugModifiers(characterId)` | Supprime tous les modifiers debug de ce personnage |
| `listDebugModifiers(characterId)` | Liste les modifiers debug actifs |

### Méthodes internes importantes

| Méthode | Rôle |
|---|---|
| `buildSources(character)` | Construit EquipmentSource, EffectSource, DebugSource |
| `resolveModifiers(sources)` | flatMap agnostique — ne connaît aucun type de source |
| `calculateDerived(base, modifiers)` | Délègue au `PlayerRuntimeCalculator` |
| `resolveEffects(character)` | Retourne [] actuellement (Phase 4 — pas d'effets réels) |

---

## 6. EntityRuntimeEventBase

`EntityRuntimeEventBase` est la base commune de tout événement Entity Runtime.

| Champ | Type | Description |
|---|---|---|
| `entityId` | `string` | UUID de l'entité concernée |
| `entityKind` | `EntityRuntimeKind` | Kind discriminant |
| `computedAt` | `Date` | Horodatage de l'événement |

Les événements player-specific (`runtime-events.ts`) étendent cette base avec :
- `entityKind: 'player'` fixe
- `characterId` : alias pour `entityId` (backward-compat APIs player-specific)

### Types d'événements génériques (Planned)

| Type | Description |
|---|---|
| `entity_runtime_created` | Première construction du Runtime pour cette entité |
| `entity_runtime_updated` | Reconstruction après changement de source |
| `entity_modifier_added` | Nouveau modifier devenu actif |
| `entity_modifier_removed` | Modifier retiré |
| `entity_derived_stats_updated` | Stats dérivées recalculées |

Les événements génériques ne sont pas émis actuellement. Les événements
player-specific (`runtime_created`, `modifier_added`, etc.) sont définis dans
`runtime-events.ts` mais ne sont pas encore émis sur un bus — ils existent
uniquement en tant que contrats de type.

---

## 7. Règles d'extension

Pour implémenter un nouveau Entity Runtime (ex. Creature) :

1. Définir `CreatureBaseStats` et `CreatureDerivedStats` dans un fichier
   `creature-runtime.types.ts` propre au domaine.
2. Définir `CreatureRuntimeSnapshot extends EntityRuntimeSnapshot<CreatureBaseStats, CreatureDerivedStats>`
   avec `entityKind: 'creature'` et les champs spécifiques à la créature.
3. Implémenter `CreatureRuntimeService implements EntityRuntimeService<CreatureRuntimeSnapshot>`.
4. Déclarer les sources de modifiers propres aux créatures (ex. `AiStateSource`,
   `ZoneAuraSource`) en implémentant `RuntimeSource`.
5. Ne pas ajouter les champs creature-specific dans `EntityRuntimeSnapshot` —
   ils restent dans `CreatureRuntimeSnapshot`.

---

## 8. Règles d'intégrité

- `EntityRuntimeSnapshot` est en lecture seule — `readonly` sur tous les champs.
- Aucune méthode de mutation dans un snapshot — c'est un value object.
- `entityId` est toujours un UUID de DB valide — jamais un identifiant synthétique
  ou un index numérique.
- `entityKind` est fixé à la construction et ne change jamais.
- Un Entity Runtime ne persiste jamais en DB — il est recalculé à la demande.

---

## Related files

- [README](README.md) — index du répertoire runtime
- [Runtime Snapshot](runtime-snapshot.md) — structure complète du snapshot
- [Runtime Sources](runtime-sources.md) — pipelines de modifiers
- [Entity Architecture](../entity-architecture.md) — architecture conceptuelle des entités
- `apps/api-gateway/src/player-runtime/entity-runtime.types.ts`
- `apps/api-gateway/src/player-runtime/runtime-source.ts`
- `apps/api-gateway/src/player-runtime/player-runtime.service.ts`
- `apps/api-gateway/src/player-runtime/player-runtime.types.ts`
