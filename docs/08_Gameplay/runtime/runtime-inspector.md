# Runtime Inspector — Panneau DevTools Studio SDK

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/08_Gameplay/runtime/runtime-snapshot.md, docs/07_Admin/devtools-architecture.md, docs/07_Admin/studio-sdk.md
- Used by: Project owner, developers, Claude Code
- Source files:
  - `apps/client/src/components/DevTools/modules/PlayerRuntime/RuntimeInspectorPanel.tsx`
  - `apps/client/src/components/DevTools/modules/PlayerRuntime/runtimeApi.ts`
  - `apps/client/src/components/DevTools/modules/PlayerRuntime/modifierForm.ts`
  - `apps/client/src/components/DevTools/modules/PlayerRuntime/player-runtime.types.ts`
  - `apps/client/src/components/DevTools/modules/PlayerRuntime/RuntimeInspector.scss`

---

## 1. Rôle du Runtime Inspector

Le **Runtime Inspector** est le panneau DevTools qui observe les modifiers
actifs d'un personnage connecté et permet à un administrateur d'injecter des
modifiers debug.

Il est la surface Studio SDK côté frontend : il lit, affiche, et demande des
actions via les endpoints API — il ne calcule rien.

**Règle fondamentale :** le Runtime Inspector n'est jamais autoritatif sur les
stats. Tout ce qu'il affiche est issu du snapshot produit par le serveur.

---

## 2. Positionnement dans le DevTools

Le Runtime Inspector est un module du panneau DevTools (`DevToolsPanel.tsx`).
Il vit sous :

```
DevToolsPanel
  └── RuntimeStatsPanel       ← stats dérivées actuelles (lecture seule)
  └── RuntimeInspectorPanel   ← sources, modifiers, debug
```

Il est accessible uniquement depuis le HUD DevTools admin-only (`GameLayout`).
L'accès est protégé côté serveur : les endpoints debug sont `@Roles(ADMIN)`.
Le panneau ne vérifie pas lui-même le rôle — la UI est déjà derrière un
garde admin.

---

## 3. Composants internes

`RuntimeInspectorPanel.tsx` contient quatre composants génériques définis dans
le même fichier. Aucun composant ne connaît un endpoint spécifique — ils reçoivent
des données et des callbacks.

### SectionBar

Barre de section avec label, badge optionnel et slot enfants.

```
SectionBar
  label: string
  badge?: string
  spaced?: boolean
  children?: ReactNode
```

Utilisée comme en-tête de chaque section (Equipment, Modifiers actifs, Ajouter).

### ModifierRow

Affiche un `RuntimeModifier` en ligne horizontale.

```
ModifierRow
  modifier: RuntimeModifier
```

Champs affichés : `sourceLabel`, stat traduite (STAT_LABELS), opération traduite
(OP_LABELS), valeur avec signe. Le `reason` est affiché en `title` (tooltip).

### ModifierList

Liste de modifiers avec section bar et bouton Clear optionnel.

```
ModifierList
  modifiers: RuntimeModifier[]
  label?: string                 // défaut : "Modifiers actifs"
  onClear?: () => void           // si absent, pas de bouton Clear
  emptyLabel: string
```

Générique — prend des `RuntimeModifier[]` sans connaître leur origine.
Utilisée deux fois : pour les modifiers équipement (sans Clear) et pour les
modifiers debug (avec Clear).

### ModifierForm

Formulaire d'ajout de modifier debug.

```
ModifierForm
  onSubmit: (input: ModifierFormInput) => Promise<void>
  disabled: boolean
  error: string | null
```

Champs : stat (select), opération (select), valeur (number), label (text
optionnel), reason (text optionnel). Ne connaît pas l'endpoint ni le `characterId`.

---

## 4. Couche API — runtimeApi.ts

`runtimeApi.ts` est la couche d'accès API isolée du panneau. Sans dépendance
React, testable avec `vi.stubGlobal('fetch', ...)`.

| Fonction | Description | Endpoint |
|---|---|---|
| `fetchSnapshot()` | Snapshot du personnage connecté | `GET /player-runtime/me/snapshot` |
| `addDebugModifier(entityId, input)` | Ajouter un modifier debug | `POST /player-runtime/debug/modifiers` |
| `clearDebugModifiers(entityId)` | Supprimer tous les modifiers debug | `DELETE /player-runtime/debug/modifiers/:entityId` |
| `listDebugModifiers(entityId)` | Lister les modifiers debug actifs | `GET /player-runtime/debug/modifiers/:entityId` |

**Note sur entityId :** Le paramètre est nommé `entityId` dans la couche API
pour rester générique. Le body de `addDebugModifier` envoie `{ characterId: entityId, ... }`
car l'endpoint backend est player-specific et attend `characterId`. Pour un
joueur, `entityId === characterId`.

Authentification : `Authorization: Bearer <token>` depuis `localStorage`.

---

## 5. Helpers purs — modifierForm.ts

`modifierForm.ts` concentre la logique pure utilisée par le panneau, testable
sans React.

| Fonction | Description |
|---|---|
| `validateModifierValue(raw: string)` | Parse une string en nombre valide ou `null` |
| `getDebugModifiers(snapshot)` | Extrait `snapshot.sources[kind='debug'].modifiers` |
| `getEquipmentModifiers(snapshot)` | Extrait `snapshot.sources[kind='equipment'].modifiers` |
| `formatModifierSummary(modifier)` | Libellé court (sourceLabel + stat + op + valeur) |
| `formatModifierCount(count)` | Libellé de badge ("aucun" / "1" / "N") |

`getDebugModifiers` et `getEquipmentModifiers` partagent un helper privé
`getSourceModifiers(snapshot, kind)` qui filtre `snapshot.sources` par kind.

---

## 6. Types frontend — player-runtime.types.ts

Le panneau n'importe aucun type depuis le backend NestJS. Tous les types
sont redéfinis dans `player-runtime.types.ts` — miroir frontend fidèle au
backend.

Types principaux :

| Type | Rôle |
|---|---|
| `PlayerRuntimeSnapshot` | Snapshot complet, avec `entityId`, `entityKind`, `characterId` |
| `RuntimeModifier` | Modifier individuel |
| `RuntimeSourceEntry` | Vue source dans le snapshot (`kind + modifiers[]`) |
| `RuntimeTrace` | Trace complète du calcul |
| `StatTrace` | Trace par stat |
| `ModifierApplication` | Contribution d'un modifier dans la trace |
| `ModifierFormInput` | Données du formulaire d'ajout debug |

Constantes exposées :

| Constante | Description |
|---|---|
| `STAT_KEYS` | Tableau ordonné des StatKey |
| `STAT_LABELS` | Labels lisibles par StatKey (`maxHp` → `"Max HP"`) |
| `OP_LABELS` | Labels courts par opération (`flat` → `"flat"`) |
| `OP_DISPLAY` | Labels formulaire par opération (`flat` → `"Flat"`) |

---

## 7. Sections du panneau — état actuel

### Section Equipment (Implemented)

Affiche les modifiers issus de `snapshot.sources[kind='equipment'].modifiers`.

- Lecture seule — pas de formulaire, pas de bouton Clear.
- Si aucun équipement avec modificateur : message "Aucun équipement avec modificateurs."

### Section Debug (Implemented)

Affiche les modifiers issus de `snapshot.sources[kind='debug'].modifiers`.

- Bouton "Clear all" : supprime tous les modifiers debug du personnage.
- Message vide si aucun modifier debug actif.

### Formulaire debug (Implemented)

Permet d'ajouter un modifier debug via `addDebugModifier(snapshot.entityId, input)`.

- Stat : select parmi `STAT_KEYS`
- Opération : select parmi `ModifierOperation`
- Valeur : input number (requis, validé par `validateModifierValue`)
- Label : text optionnel (affiché dans la section debug)
- Reason : text optionnel (affiché en tooltip sur la `ModifierRow`)

Après soumission réussie : refresh automatique du snapshot via `fetchSnapshot()`.

### Sections futures (Planned)

| Section | Alimentation |
|---|---|
| Effects / Buffs | `snapshot.sources[kind='effect'].modifiers` (quand `EffectSource` est alimentée) |
| Talents | `snapshot.sources[kind='talent'].modifiers` |
| Passive Skills | `snapshot.sources[kind='passive_skill'].modifiers` |
| Auras | `snapshot.sources[kind='aura'].modifiers` |

Toutes ces sections pourront être ajoutées en réutilisant `ModifierList` sans
modifier les composants existants — le seul ajout nécessaire sera la fonction
`getXxxModifiers(snapshot)` correspondante dans `modifierForm.ts`.

---

## 8. Styles — RuntimeInspector.scss

BEM block : `rt-inspector`

Accent visuel : violet (`rgba(160, 100, 220, ...)`) — réservé à la section debug
pour signaler visuellement les modifiers non-gameplay.

Éléments principaux :

| Classe | Élément |
|---|---|
| `rt-inspector__section-bar` | Barre de section |
| `rt-inspector__section-label` | Label de la section |
| `rt-inspector__section-badge` | Badge compteur `(N)` |
| `rt-inspector__clear-btn` | Bouton Clear all |
| `rt-inspector__modifier-row` | Ligne de modifier |
| `rt-inspector__modifier-label` | sourceLabel |
| `rt-inspector__modifier-stat` | Stat ciblée |
| `rt-inspector__modifier-op` | Opération |
| `rt-inspector__modifier-value` | Valeur avec signe |
| `rt-inspector__form` | Formulaire debug |
| `rt-inspector__error` | Message d'erreur formulaire |

---

## 9. Flux de données — cycle complet

```
Utilisateur admin
  │  ouvre l'Inspector / clique Rafraîchir
  ▼
fetchSnapshot()
  → GET /player-runtime/me/snapshot
  → server: buildSources → resolveModifiers → calculateDerived → buildTrace
  → PlayerRuntimeSnapshot (readonly)
  ▼
RuntimeInspectorPanel
  getEquipmentModifiers(snapshot) → ModifierList (Equipment)
  getDebugModifiers(snapshot) → ModifierList (Debug) + ModifierForm
  ▼
[Admin] ModifierForm.onSubmit(input)
  → addDebugModifier(snapshot.entityId, input)
  → POST /player-runtime/debug/modifiers
  → DebugModifierRegistry.add(characterId, modifier)
  → fetchSnapshot()     ← refresh automatique
  ▼
[Admin] ModifierList.onClear()
  → clearDebugModifiers(snapshot.entityId)
  → DELETE /player-runtime/debug/modifiers/:entityId
  → DebugModifierRegistry.clear(characterId)
  → fetchSnapshot()     ← refresh automatique
```

---

## 10. Règles d'intégrité du Studio

Le Runtime Inspector respecte les règles Studio SDK suivantes :

1. **Jamais autoritatif.** Toute modification de modifier passe par une requête
   serveur — jamais par une mutation locale de `snapshot`.
2. **Jamais de recalcul.** Les stats affichées viennent toujours du snapshot
   serveur — le panneau ne recalcule pas `derivedStats` depuis `baseStats` et
   `modifiers`.
3. **Jamais de modifier non traçable.** Les modifiers debug ajoutés via le
   formulaire apparaissent dans la trace serveur lors du prochain `fetchSnapshot()`.
4. **entityId, pas characterId.** Le panneau utilise `snapshot.entityId` pour
   appeler les fonctions API — pas `snapshot.characterId`. Le body envoyé au
   serveur contient `characterId: entityId` car l'endpoint est player-specific.
5. **Sources opaques.** Le panneau ne connaît pas l'implémentation de
   `EquipmentSource` ou `DebugRuntimeSource`. Il lit uniquement les données
   exposées dans `snapshot.sources`.

---

## Related files

- [README](README.md) — index du répertoire runtime
- [Runtime Snapshot](runtime-snapshot.md) — structure du snapshot
- [Runtime Sources](runtime-sources.md) — pipelines de modifiers
- [Runtime Modifiers](runtime-modifiers.md) — structure des modifiers
- [Studio SDK](../../07_Admin/studio-sdk.md) — architecture Studio SDK
- [DevTools Architecture](../../07_Admin/devtools-architecture.md)
- `apps/client/src/components/DevTools/modules/PlayerRuntime/RuntimeInspectorPanel.tsx`
- `apps/client/src/components/DevTools/modules/PlayerRuntime/runtimeApi.ts`
- `apps/client/src/components/DevTools/modules/PlayerRuntime/modifierForm.ts`
- `apps/client/src/components/DevTools/modules/PlayerRuntime/player-runtime.types.ts`
- `apps/api-gateway/src/player-runtime/player-runtime.controller.ts`
