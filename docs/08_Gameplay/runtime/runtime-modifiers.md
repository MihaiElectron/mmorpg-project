# Runtime Modifiers — Structure et pipeline de calcul

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/08_Gameplay/runtime/README.md, docs/08_Gameplay/runtime/runtime-sources.md
- Used by: Project owner, developers, Claude Code
- Source files:
  - `apps/api-gateway/src/player-runtime/player-runtime.types.ts`
  - `apps/api-gateway/src/player-runtime/player-runtime.calculator.ts`

---

## 1. Qu'est-ce qu'un RuntimeModifier

Un `RuntimeModifier` est l'unité atomique de modification d'une stat dérivée.
Il est :
- **data-driven** : aucun code ne doit connaître "Sword +10", "Rage Buff"
  ou "Fire Aura" — uniquement des valeurs et des métadonnées.
- **opaque pour le calculator** : le calculator reçoit une liste plate de
  modifiers sans connaître leur origine (équipement, buff, debug…).
- **totalement traçable** : chaque modifier est visible dans la `RuntimeTrace`.

---

## 2. Structure d'un RuntimeModifier

| Champ | Type | Description |
|---|---|---|
| `id` | `string` | Identifiant unique du modifier (UUID) |
| `sourceType` | `ModifierSourceType` | Mécanique de jeu à l'origine du modifier |
| `sourceId` | `string` | Identifiant de la source (item.id, effect.id…) |
| `sourceLabel` | `string` | Libellé lisible affiché dans la trace et l'Inspector |
| `targetStat` | `StatKey` | Stat dérivée ciblée |
| `operation` | `ModifierOperation` | Type d'opération |
| `value` | `number` | Valeur numérique de la modification |
| `priority` | `number` | Ordre d'application à l'intérieur d'une même opération |
| `enabled` | `boolean` | Modifier actif ou ignoré silencieusement |
| `reason` | `string?` | Documentation libre — aucun impact sur le calcul |

Un modifier avec `enabled: false` est ignoré silencieusement par le calculator
et exclu de la trace. Il ne génère aucune erreur.

---

## 3. StatKey — stats modifiables

`StatKey` est la liste des stats dérivées qui peuvent être ciblées par un modifier.

| StatKey | Description | État |
|---|---|---|
| `maxHp` | Points de vie maximum | Implemented |
| `attackPower` | Puissance d'attaque | Implemented |
| `defenseTotal` | Défense totale | Implemented |
| `attackRange` | Portée d'attaque | Implemented |
| `speed` | Vitesse de déplacement | Implemented (valeur DB absente — 0 par défaut) |
| `gatheringRange` | Portée de récolte | Implemented (valeur DB absente — 0 par défaut) |

Toute nouvelle stat dérivée devant être modifiable par un modifier doit être
ajoutée à `StatKey`. Sans cette déclaration, la stat ne peut pas être ciblée.

---

## 4. ModifierSourceType — origines d'un modifier

`ModifierSourceType` identifie quelle mécanique de jeu a produit un modifier
individuel. Il est distinct de `RuntimeSourceKind` (voir
[runtime-sources.md](runtime-sources.md#2-runtimesourcekind-vs-modifiersourcetype)).

| ModifierSourceType | Mécanique de jeu |
|---|---|
| `equipment` | Objet équipé (arme, armure, accessoire) |
| `buff` | Effet temporaire positif |
| `debuff` | Effet temporaire négatif |
| `talent` | Talent passif ou actif débloqué |
| `passive_skill` | Compétence passive de l'arbre de compétences |
| `aura` | Aura émise ou reçue depuis une entité proche |
| `mount` | Bonus de la monture équipée |
| `consumable` | Objet consommable (potion, nourriture…) |
| `event` | Événement de gameplay (zone spéciale, quête…) |
| `base` | Valeur de base calculée avant modifiers |
| `debug` | Modifier injecté manuellement en dev/admin |

Le calculator ne connaît aucune de ces valeurs — il traite uniquement `value`,
`operation`, `priority` et `enabled`.

---

## 5. ModifierOperation — pipeline de calcul

Les trois opérations sont appliquées dans un ordre strict, quel que soit l'ordre
d'arrivée des modifiers.

### Ordre d'application

```
1. flat          : baseValue + Σ(flat modifiers)
2. percent_add   : résultat × (1 + Σ(percent_add modifiers) / 100)
3. percent_multiply : résultat × Π(1 + percent_multiply_i / 100)
```

### Détail par opération

**flat** : addition directe à la valeur de base.
- Exemple : baseValue=100, modifier flat +20 → 120
- Tous les modifiers `flat` sont sommés avant d'être ajoutés.

**percent_add** : bonus addicitfs en pourcentage.
- Tous les modifiers `percent_add` sont sommés, puis appliqués en une seule fois.
- Exemple : +10% et +15% → ×1.25 (pas ×1.10×1.15)
- Appliqué sur le résultat après flat.

**percent_multiply** : multiplicateurs indépendants.
- Chaque modifier `percent_multiply` est appliqué séquentiellement.
- Exemple : +15% puis +10% → ×1.15 × 1.10 = ×1.265
- Appliqué sur le résultat après percent_add.
- Ordre d'application entre les `percent_multiply` : déterminé par `priority`.

### Rôle de priority

`priority` détermine l'ordre d'application à l'intérieur d'une même opération.
Un `priority` plus petit est appliqué en premier. Pour `flat` et `percent_add`,
l'ordre ne change pas le résultat final (addition commutative). Pour
`percent_multiply`, l'ordre est mathématiquement équivalent mais documenté via
`priority` pour cohérence et traçabilité.

---

## 6. PlayerRuntimeEffect — conteneur d'effets

`PlayerRuntimeEffect` est un conteneur pour un groupe de modifiers issus de la
même mécanique d'effet (buff, debuff, consommable, aura, événement).

### Structure

| Champ | Type | Description |
|---|---|---|
| `id` | `string` | Identifiant unique de l'effet |
| `sourceType` | `'buff'\|'debuff'\|'consumable'\|'aura'\|'event'` | Type d'effet |
| `sourceId` | `string` | Référence vers l'objet d'origine |
| `sourceLabel` | `string` | Libellé affiché |
| `modifiers` | `EffectModifierDef[]` | Modifications portées par cet effet |
| `enabled` | `boolean` | Effet actif ou ignoré |
| `startsAt` | `Date?` | Date de démarrage (futur) |
| `expiresAt` | `Date?` | Date d'expiration |
| `reason` | `string?` | Documentation libre |

### EffectModifierDef

Forme allégée d'un modifier à l'intérieur d'un effet. `id`, `sourceType` et
`sourceLabel` ne sont pas redéfinis — `effectToModifiers()` les hérite de l'effet
parent et les propage à chaque `RuntimeModifier` produit.

| Champ | Type | Description |
|---|---|---|
| `targetStat` | `StatKey` | Stat ciblée |
| `operation` | `ModifierOperation` | Type d'opération |
| `value` | `number` | Valeur |
| `priority` | `number?` | Ordre — défaut non défini (déterminé par le mapper) |

### État actuel (Phase 4)

`EffectSource` est implémentée et produit des `RuntimeModifier[]` correctement
depuis `PlayerRuntimeEffect[]`. Cependant, `resolveEffects()` dans
`PlayerRuntimeService` retourne `[]` — aucun effet réel n'est alimenté. La
source est opérationnelle mais vide.

---

## 7. Modifiers debug

Les modifiers avec `sourceType = 'debug'` sont des modifiers injectés
manuellement via les endpoints admin pour inspection ou test.

Règles spécifiques :
- Uniquement disponibles en dev/admin — les endpoints sont `@Roles(ADMIN)`.
- Aucune persistance — perdus au redémarrage du serveur.
- Toujours identifiables dans la trace grâce à `sourceType = 'debug'`.
- Visibles dans `snapshot.sources[kind='debug'].modifiers`.
- Gérés par `DebugModifierRegistry` (singleton injectable).

---

## 8. Règles d'intégrité

- Aucun modifier ne peut cibler une stat absente de `StatKey`.
- Un modifier ne modifie jamais directement `BaseStats` — uniquement le calcul
  de `DerivedStats`.
- Un modifier n'a aucun effet secondaire : il ne déclenche pas d'événement,
  ne modifie pas la DB, ne communique pas avec d'autres modifiers.
- Le champ `reason` est purement documentaire — il n'impacte jamais le calcul.
- Aucun modifier ne doit être "secret" ou "non traçable" — tout modifier actif
  apparaît dans la `RuntimeTrace`.

---

## Related files

- [README](README.md) — index du répertoire runtime
- [Runtime Sources](runtime-sources.md) — d'où viennent les modifiers
- [Runtime Trace](runtime-trace.md) — comment le calcul est audité
- `apps/api-gateway/src/player-runtime/player-runtime.types.ts`
- `apps/api-gateway/src/player-runtime/player-runtime.calculator.ts`
- `apps/api-gateway/src/player-runtime/effect-modifier.mapper.ts`
- `apps/api-gateway/src/player-runtime/equipment-modifier.mapper.ts`
