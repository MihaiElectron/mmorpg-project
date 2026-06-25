# Runtime — Index

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/08_Gameplay/README.md, docs/07_Admin/studio-sdk.md
- Used by: Project owner, developers, Claude Code, tout agent IA travaillant sur ce projet

## Scope

Ce répertoire documente l'architecture **Entity Runtime** : la couche qui
calcule, en mémoire et côté serveur, les stats dérivées de toute entité du
monde à partir de ses sources de modifiers.

La documentation Runtime est distincte de la documentation Gameplay pure
(`docs/08_Gameplay/`) : elle décrit comment les règles sont appliquées en
mémoire, pas ce que les règles signifient pour un joueur.

---

## Documents de ce répertoire

| Document | Contenu |
|---|---|
| [runtime-entity.md](runtime-entity.md) | Architecture générique EntityRuntime — kinds, identité, contrats |
| [runtime-sources.md](runtime-sources.md) | RuntimeSource — pipelines de modifiers, SourceKind vs SourceType |
| [runtime-modifiers.md](runtime-modifiers.md) | RuntimeModifier — structure, opérations, pipeline de calcul |
| [runtime-trace.md](runtime-trace.md) | RuntimeTrace — audit du calcul, StatTrace, ModifierApplication |
| [runtime-snapshot.md](runtime-snapshot.md) | EntityRuntimeSnapshot / PlayerRuntimeSnapshot — surface Studio SDK |
| [runtime-inspector.md](runtime-inspector.md) | Runtime Inspector — panneau DevTools, couche API, règles Studio |

---

## Lecture recommandée

```
runtime-entity.md        ← contrats communs, kinds, identité
↓
runtime-sources.md       ← d'où viennent les modifiers
↓
runtime-modifiers.md     ← structure et pipeline de calcul
↓
runtime-trace.md         ← comment le calcul est audité
↓
runtime-snapshot.md      ← surface observable par le Studio
↓
runtime-inspector.md     ← comment le Studio consomme ces données
```

---

## Positionnement dans l'architecture globale

```
DB (Character, Equipment, Effects…)
        │
        ▼
  PlayerRuntimeService
  ┌─────────────────────────────┐
  │  buildSources()             │  ← EquipmentSource, EffectSource, DebugSource
  │  resolveModifiers(sources)  │  ← flatMap agnostique
  │  calculateDerived(base, mods)│  ← pipeline flat → %add → %mult
  │  buildTrace(…)              │  ← audit complet
  └─────────────────────────────┘
        │
        ▼
  PlayerRuntimeSnapshot         ← lecture seule — Studio SDK
        │
        ▼
  Runtime Inspector (DevTools)  ← observe, n'affecte pas le calcul
```

Le Runtime produit. Le Studio observe. Aucune logique de gameplay
ne vit dans le Studio ou dans l'Inspector.

---

## Règles fondamentales

1. **Serveur autoritatif.** Tout calcul Runtime se fait côté serveur.
   Le client ne calcule pas, ne reçoit pas de composants internes — uniquement
   le snapshot final.
2. **Lecture seule côté Studio.** Le Studio SDK consomme le snapshot sans le
   recalculer, sans le modifier, sans émettre d'événements.
3. **Traçabilité totale.** Chaque stat dérivée doit avoir une trace complète :
   valeur de base, contribution de chaque modifier, valeur finale.
4. **Sources opaques pour le calculator.** Le calculator reçoit une liste
   plate de `RuntimeModifier[]` sans connaître leur origine.
5. **Debug est isolé.** Les modifiers `sourceType='debug'` sont clairement
   identifiables dans la trace. Ils n'existent qu'en dev/admin, sans persistance.

---

## État d'implémentation

| Composant | État |
|---|---|
| EntityRuntimeSnapshot (contrat générique) | Implemented |
| PlayerRuntimeSnapshot (extends EntityRuntimeSnapshot) | Implemented |
| EquipmentSource | Implemented |
| EffectSource | Implemented (retourne [] — resolveEffects() vide en Phase 4) |
| DebugRuntimeSource | Implemented |
| RuntimeTrace / StatTrace | Implemented |
| RuntimeInspectorPanel | Implemented |
| CreatureRuntimeSnapshot | Planned |
| NpcRuntimeSnapshot | Planned |
| ResourceRuntimeSnapshot | Planned |
| BuildingRuntimeSnapshot | Planned |

---

## Related files

- [Studio SDK](../../07_Admin/studio-sdk.md)
- [DevTools Architecture](../../07_Admin/devtools-architecture.md)
- [Entity Architecture](../entity-architecture.md)
- [Entity Model](../entity-model.md)
- [Gameplay README](../README.md)
