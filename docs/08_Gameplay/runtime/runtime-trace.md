# Runtime Trace — Audit du calcul

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/08_Gameplay/runtime/README.md, docs/08_Gameplay/runtime/runtime-modifiers.md
- Used by: Project owner, developers, Claude Code
- Source files:
  - `apps/api-gateway/src/player-runtime/player-runtime.types.ts`
  - `apps/api-gateway/src/player-runtime/player-runtime.calculator.ts`

---

## 1. Qu'est-ce que la RuntimeTrace

La **RuntimeTrace** est l'audit complet d'un calcul de `DerivedStats`.
Elle répond à la question : pour chaque stat dérivée, quelle est sa valeur
de base, quel modifier a contribué combien, et quelle est la valeur finale ?

La trace est produite en même temps que les `DerivedStats`. Elle est portée
par le snapshot et consommée par le Studio — jamais recalculée côté Studio.

**Règle fondamentale :** tout modifier actif dans le calcul doit apparaître
dans la trace. Aucun modifier ne peut être appliqué silencieusement.

---

## 2. Structure de RuntimeTrace

```
RuntimeTrace
  stats: Partial<Record<StatKey, StatTrace>>
  modifierCount: number
  computedAt: Date
```

| Champ | Type | Description |
|---|---|---|
| `stats` | `Partial<Record<StatKey, StatTrace>>` | Trace par stat — seules les stats touchées sont présentes |
| `modifierCount` | `number` | Total de modifiers appliqués (toutes stats) |
| `computedAt` | `Date` | Horodatage exact du calcul |

`stats` est `Partial` : une stat non touchée par un modifier ne génère pas
d'entrée dans la trace. Cela évite une trace vide pour chaque stat même
quand aucun modifier ne la touche.

`computedAt` est identique à `snapshot.computedAt` — les deux désignent le
même instant de calcul.

---

## 3. Structure de StatTrace

`StatTrace` décrit le calcul complet pour une stat dérivée donnée.

```
StatTrace
  stat: StatKey
  baseValue: number
  modifiers: ModifierApplication[]
  finalValue: number
```

| Champ | Type | Description |
|---|---|---|
| `stat` | `StatKey` | Identifiant de la stat |
| `baseValue` | `number` | Valeur avant application de tout modifier |
| `modifiers` | `ModifierApplication[]` | Modifiers appliqués, dans l'ordre d'application |
| `finalValue` | `number` | Valeur après application de tous les modifiers actifs |

`finalValue` correspond exactement à la valeur exposée dans `DerivedStats`.
Si `finalValue` de la trace diffère de `DerivedStats`, c'est un bug.

---

## 4. Structure de ModifierApplication

`ModifierApplication` est l'enregistrement d'un modifier appliqué pendant le calcul.

```
ModifierApplication
  modifierId: string
  sourceType: ModifierSourceType
  sourceId: string
  sourceLabel: string
  operation: ModifierOperation
  value: number
  contribution: number
```

| Champ | Type | Description |
|---|---|---|
| `modifierId` | `string` | Identifiant du `RuntimeModifier` source |
| `sourceType` | `ModifierSourceType` | Mécanique de jeu à l'origine (équipement, buff…) |
| `sourceId` | `string` | Référence vers l'objet source |
| `sourceLabel` | `string` | Libellé lisible (affiché dans l'Inspector) |
| `operation` | `ModifierOperation` | `flat`, `percent_add`, ou `percent_multiply` |
| `value` | `number` | Valeur déclarée dans le modifier |
| `contribution` | `number` | Impact réel sur la stat finale |

`contribution` est l'effet observé sur la valeur finale, pas la valeur déclarée.
Pour un modifier `flat +20`, `contribution = 20`. Pour un modifier `percent_add +10%`
appliqué après flat, `contribution` reflète l'impact numérique réel en unités de stat.

---

## 5. Lecture d'une trace — exemple

Pour `maxHp = 130` avec baseValue 100, un flat +20 et un percent_add +10% :

```
StatTrace (maxHp)
  stat: 'maxHp'
  baseValue: 100
  modifiers:
    [0] modifierId: 'uuid-1'
        sourceType: 'equipment'
        sourceLabel: 'Iron Sword'
        operation: 'flat'
        value: 20
        contribution: 20          ← +20 points directs

    [1] modifierId: 'uuid-2'
        sourceType: 'buff'
        sourceLabel: 'Strength Potion'
        operation: 'percent_add'
        value: 10
        contribution: 12          ← +10% de 120 = +12 points

  finalValue: 132
```

Note : l'ordre des `ModifierApplication` dans `modifiers[]` suit l'ordre
d'application (flat → percent_add → percent_multiply), pas l'ordre
d'insertion dans les sources.

---

## 6. Contrat Studio SDK

La trace est la surface principale que le Studio utilise pour afficher
l'origine des stats sans recalculer.

Le Studio peut, depuis la trace seule :
- Lister toutes les sources de modifiers actifs pour chaque stat.
- Afficher la valeur de base et la valeur finale.
- Identifier quelle mécanique (sourceType) ou quel objet (sourceLabel)
  contribue le plus.
- Comparer `trace.modifierCount` et `snapshot.modifiers.length` pour
  détecter des incohérences.
- Ordonner les contributions pour identifier les modifiers les plus impactants.

Le Studio ne peut pas :
- Modifier la trace.
- Recalculer une stat depuis la trace.
- Ajouter une contribution manquante.

---

## 7. Relation entre modifiers et trace

Il existe une correspondance biunivoque entre :
- `snapshot.modifiers[]` — la liste plate de tous les `RuntimeModifier` actifs
- `snapshot.trace.stats[stat].modifiers[]` — les `ModifierApplication` par stat

Un modifier présent dans `snapshot.modifiers` qui touche `maxHp` apparaît dans
`snapshot.trace.stats.maxHp.modifiers`. Un modifier désactivé (`enabled: false`)
n'apparaît ni dans `snapshot.modifiers` ni dans la trace.

`snapshot.trace.modifierCount` doit être égal à `snapshot.modifiers.length`.

---

## 8. Règles d'intégrité

- Aucun modifier appliqué ne peut être absent de la trace.
- `finalValue` dans `StatTrace` doit correspondre exactement à la valeur
  exposée dans `DerivedStats` pour la même stat.
- `computedAt` dans `RuntimeTrace` est identique à `snapshot.computedAt`.
- `modifierCount` compte uniquement les modifiers actifs et appliqués —
  pas les modifiers `enabled: false`.
- La trace est produite une seule fois par `getRuntimeSnapshot()`. Elle n'est
  pas reconstruite côté client ou Studio.

---

## Related files

- [README](README.md) — index du répertoire runtime
- [Runtime Modifiers](runtime-modifiers.md) — structure des modifiers
- [Runtime Snapshot](runtime-snapshot.md) — snapshot complet
- [Runtime Inspector](runtime-inspector.md) — lecture de la trace dans le Studio
- `apps/api-gateway/src/player-runtime/player-runtime.types.ts`
- `apps/api-gateway/src/player-runtime/player-runtime.calculator.ts`
