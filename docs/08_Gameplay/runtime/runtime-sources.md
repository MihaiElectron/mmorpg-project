# Runtime Sources — Pipelines de modifiers

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/08_Gameplay/runtime/README.md, docs/08_Gameplay/runtime/runtime-modifiers.md
- Used by: Project owner, developers, Claude Code
- Source files:
  - `apps/api-gateway/src/player-runtime/runtime-source.ts`
  - `apps/api-gateway/src/player-runtime/player-runtime.service.ts`

---

## 1. Qu'est-ce qu'une RuntimeSource

Une **RuntimeSource** est un pipeline qui produit une liste de `RuntimeModifier[]`
à partir d'une catégorie de données de jeu (équipement, effets, talents, debug…).

Elle implémente le contrat :

```
RuntimeSource
  readonly kind: RuntimeSourceKind
  getModifiers(): RuntimeModifier[]
```

**Règles fondamentales :**
- Aucune I/O — transformation en mémoire uniquement.
- `getModifiers()` est appelé à chaque calcul. Aucune mise en cache dans la source.
- La source ne sait pas ce que le calculator fera de ses modifiers.
- Le calculator ne sait pas d'où viennent les modifiers — il reçoit une liste plate.

---

## 2. RuntimeSourceKind vs ModifierSourceType

Ces deux concepts sont souvent confondus — ils opèrent à des niveaux différents.

| Concept | Niveau | Rôle | Exemples |
|---|---|---|---|
| `RuntimeSourceKind` | Pipeline (agrégateur) | Quel pipeline a produit la liste de modifiers | `equipment`, `effect`, `debug` |
| `ModifierSourceType` | Modifier individuel | Quelle mécanique de jeu a produit CE modifier | `equipment`, `buff`, `debuff`, `talent`, `aura` |

**Exemple :** `EffectSource` a le kind `effect`. Elle peut produire des
modifiers avec `sourceType = 'buff'`, `sourceType = 'debuff'`, ou
`sourceType = 'aura'` selon le type d'effet qu'elle traite.

La distinction est importante car le Studio utilise `kind` pour grouper les
modifiers par pipeline dans l'Inspector, et `sourceType` pour identifier
l'origine individuelle de chaque modifier dans la trace.

---

## 3. Sources implémentées

### EquipmentSource (Implemented)

Convertit `CharacterEquipment[]` en `RuntimeModifier[]`.

- Kind : `equipment`
- Délègue à `equipmentToModifiers()` — aucune logique dupliquée dans la source.
- Chaque pièce d'équipement qui modifie une stat produit un modifier distinct.
- `sourceType` des modifiers produits : `equipment`

### EffectSource (Implemented — retourne [] en Phase 4)

Convertit `PlayerRuntimeEffect[]` en `RuntimeModifier[]`.

- Kind : `effect`
- Délègue à `effectToModifiers()`.
- `effectToModifiers()` filtre les effets désactivés (`enabled: false`) et
  expirés (`expiresAt` passé).
- `resolveEffects()` dans `PlayerRuntimeService` retourne `[]` actuellement.
  Cette source existe mais ne produit aucun modifier tant que `resolveEffects()`
  n'est pas alimenté par des effets réels.
- `sourceType` des modifiers produits : `buff`, `debuff`, `consumable`, `aura`, ou `event`
  (selon le type de `PlayerRuntimeEffect`)

### DebugRuntimeSource (Implemented)

Injecte des `RuntimeModifier[]` arbitraires en mémoire — usage dev/admin uniquement.

- Kind : `debug`
- Alimentée par `RuntimeDebugRegistry` (injectable, `Map<entityId, RuntimeModifier[]>` — générique, une instance par module Runtime).
- Par défaut : retourne `[]` si aucun modifier n'a été ajouté.
- Les modifiers sont perdus au redémarrage du serveur — aucune persistance.
- `sourceType` des modifiers : `debug` — clairement identifiable dans la trace.
- Les endpoints d'ajout/suppression sont `@Roles(UserRole.ADMIN)`.

---

## 4. Sources planifiées (Planned)

| Source | Kind | Alimentation future |
|---|---|---|
| `TalentSource` | `talent` | Talents actifs du personnage |
| `PassiveSkillSource` | `passive_skill` | Skills passifs débloqués |
| `AuraSource` | `aura` | Auras émises ou reçues depuis entités proches |
| `MountSource` | `mount` | Bonus de la monture équipée |
| `ZoneSource` | `zone` | Effets de zone (WU) sur la position courante |

Ces sources sont référencées dans `RuntimeSourceKind` mais n'ont pas encore de
classe d'implémentation.

---

## 5. Ordre de construction des sources — buildSources()

`PlayerRuntimeService.buildSources(character)` est le point unique de
construction des sources concrètes. Son ordre détermine l'ordre dans lequel
les sources apparaissent dans `snapshot.sources[]`.

Ordre actuel (Implemented) :
1. `EquipmentSource` — modifiers d'équipement
2. `EffectSource` — modifiers d'effets actifs (retourne [] en Phase 4)
3. `DebugRuntimeSource` — modifiers debug injectés en mémoire

**Règle :** Tout ajout de source passe par `buildSources()`. Aucune source
n'est construite ailleurs.

---

## 6. resolveModifiers — agnosticisme total

`PlayerRuntimeService.resolveModifiers(sources)` est un `flatMap` agnostique :

```
resolveModifiers(sources: RuntimeSource[]): RuntimeModifier[]
  → sources.flatMap(s => s.getModifiers())
```

Il ne sait pas ce qu'est une `EquipmentSource`, un `EffectSource` ou un
`DebugRuntimeSource`. Il reçoit un tableau de sources, appelle `getModifiers()`
sur chacune, et aplatit le résultat.

Cette contrainte est volontaire : elle garantit que tout nouveau type de source
est automatiquement intégré au calcul sans modifier `resolveModifiers`.

---

## 7. Studio SDK — visibilité des sources

Le Studio voit les sources via `snapshot.sources[]` :

```
snapshot.sources: ReadonlyArray<{
  kind: RuntimeSourceKind;
  modifiers: ReadonlyArray<RuntimeModifier>;
}>
```

Le Studio peut :
- Grouper les modifiers par `kind` (Equipment / Effects / Debug).
- Lire les modifiers et leurs contributions dans la trace.
- Compter les modifiers par pipeline.

Le Studio ne peut pas :
- Appeler `getModifiers()` directement.
- Ajouter ou supprimer des modifiers (sauf via les endpoints debug admin).
- Connaître l'implémentation interne de chaque source.

---

## 8. Règles d'extension

Pour ajouter une nouvelle source de modifiers :

1. Créer une classe qui implémente `RuntimeSource` avec un kind distinct
   (`talent`, `passive_skill`, `aura`, `mount`, ou `zone`).
2. La classe reçoit ses données en constructeur — aucune injection de service
   dans la source elle-même.
3. Ajouter la construction de la source dans `buildSources()` uniquement.
4. Ne pas modifier `resolveModifiers()`.
5. Définir un `ModifierSourceType` adapté pour les modifiers produits si
   nécessaire (ajouter à l'union dans `player-runtime.types.ts`).

---

## Related files

- [README](README.md) — index du répertoire runtime
- [Runtime Modifiers](runtime-modifiers.md) — structure et pipeline de calcul
- [Runtime Entity](runtime-entity.md) — contrats génériques
- `apps/api-gateway/src/player-runtime/runtime-source.ts`
- `apps/api-gateway/src/player-runtime/player-runtime.service.ts`
- `apps/api-gateway/src/player-runtime/equipment-modifier.mapper.ts`
- `apps/api-gateway/src/player-runtime/effect-modifier.mapper.ts`
- `apps/api-gateway/src/player-runtime/debug-modifier.registry.ts`
