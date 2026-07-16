# ADR-0021 — Pipeline partagé de résolution des statistiques

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-07-17
- Date proposed: 2026-07-17
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on:
  - docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md
  - docs/01_Architecture/adr/ADR-0020-mastery-contextual-effects.md
- Used by: Project owner, backend developers, gameplay designers, Studio
  developers, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents:
  - docs/08_Gameplay/combat-resolution.md
  - STATUS.md (blocs Progression V1, Mastery Effects V2, défenses créature V6-B)
  - CLAUDE.md (Architecture Runtime, Frontière Runtime / Admin, Sécurité)
- Related code (état actuel, à faire évoluer — aucune modification dans cet ADR) :
  - apps/api-gateway/src/player-runtime/runtime-compute.ts (moteur pur générique existant)
  - apps/api-gateway/src/player-runtime/player-runtime.types.ts (`RuntimeModifier`, `RuntimeTrace`, `PlayerRuntimeEffect`)
  - apps/api-gateway/src/characters/character-stats-calculator.ts (pipeline joueur, non migré en V1)
  - apps/api-gateway/src/derived-stats/entities/derived-stat-definition.entity.ts (catalogue + caps `minValue`/`maxValue`)
  - apps/api-gateway/src/creature-runtime/creature-runtime.calculator.ts (`resolveCombatStats`, secondaires inline, `maxHealthDerived`)
  - apps/api-gateway/src/creature-runtime/creature-runtime.types.ts
- Commits: N/A (ADR de décision — aucune implémentation)

---

## Context

Le projet possède aujourd'hui **plusieurs pipelines de statistiques distincts**,
confirmés par audit (session précédente) :

- `CharacterStatsCalculator` (`characters/character-stats-calculator.ts`) — le
  pipeline **réellement consommé par le combat joueur** : `base (primaires) →
  modifiers primaires → formules du catalogue DerivedStatDefinition (caps
  min/max) → modificateurs post-dérivés percent+flat (maîtrises)`.
- `RuntimeComputeEngine` (`player-runtime/runtime-compute.ts`) — un **socle pur
  générique déjà présent** (opérations `flat → percent_add → percent_multiply`,
  `priority`, `enabled`, `RuntimeTrace`), utilisé partiellement mais **non
  consommé par le combat joueur**.
- `CreatureRuntimeCalculator.resolveCombatStats`
  (`creature-runtime.calculator.ts`) — un **mélange** : trois stats via le moteur
  générique, mais les secondaires (esquive/blocage/parade/contre-attaque) et
  `maxHealthDerived` sont **calculés inline**, hors pipeline générique.
- `maxHealthDerived = baseHealth + vitality × coefficient` est aujourd'hui
  **informatif** (inspecteur uniquement) et **non activé** comme PV max effectif.

Il existe déjà **plusieurs représentations concurrentes des PV maximum** —
`baseHealth`, `maxHealth` (DTO), `maxHp` (runtime générique),
`maxHealthDerived` — qui coïncident aujourd'hui parce que `vitality = 0`, mais
qui **divergeraient dès l'ajout d'une seule source** de bonus.

Le besoin gameplay futur exige de représenter proprement : bonus/malus plats et
en pourcentage, multiplicateurs, overrides, caps, buffs/debuffs temporaires,
équipements, passifs, skills, effets de zone, ainsi que des **filtres et
neutralisations** (ignorer une source, ignorer un signe, réduire partiellement
une catégorie, immunité). Le pipeline actuel `flat/percent` ne couvre ni les
overrides, ni les caps génériques, ni les filtres, ni les tags, ni le stacking.

Sans décision, chaque nouvelle mécanique risque d'ajouter **une formule
concurrente de plus**, aggravant la dette des notions de PV max déjà multiples.

## Problem

Peut-on faire évoluer l'existant vers un **pipeline unique et traçable de
résolution des statistiques**, capable d'accueillir bonus, malus, filtres,
neutralisations, overrides et caps, **sans réécriture globale**, sans casser le
pipeline joueur en production, et sans introduire une seconde notion concurrente
de PV max ?

## Decision drivers

- Autorité serveur stricte (le client et le Studio n'ont jamais l'autorité).
- Réutiliser l'existant (`RuntimeComputeEngine`, `RuntimeModifier`,
  `RuntimeTrace`) plutôt que créer un framework parallèle.
- Traçabilité complète pour le Studio (explication du calcul, contributions
  appliquées **et** filtrées).
- Performance temps réel (pas de recalcul par hit ni par tick).
- Extensibilité contrôlée : couvrir les capacités V1 sans surconcevoir les
  règles hors périmètre (stacking complexe, persistance des buffs, caps PvP/PvE).
- Ne pas migrer le pipeline joueur dans le premier chantier.

## Considered options

### Socle pur partagé avec adapters propres à chaque domaine (retenue)

Un **resolver pur commun** gère les opérations génériques (contributions,
filtres, opérations, override, caps, arrondi, trace). Chaque domaine (joueur,
créature) conserve ses **formules, coefficients, définitions de stats, collecte
de sources et règles métier**, et fournit au resolver une valeur de base + une
liste de contributions. Extension du socle `RuntimeComputeEngine` existant.

### Deux moteurs indépendants alignés conceptuellement (rejetée)

Chaque domaine garde son propre calculateur mais adopte les mêmes concepts.
Rejetée : double maintenance, divergence garantie, deux implémentations des
filtres/override/caps à garder synchronisées.

### Moteur unique contenant aussi toutes les formules joueur/créature (rejetée)

Un seul moteur porte à la fois la résolution générique **et** les formules
métier. Rejetée : couplage fort, mélange des coefficients propres à chaque
domaine, perte de la séparation collecte/résolution.

### Activation directe de `maxHealthDerived` sans fondation (rejetée)

Rejetée : figerait une valeur inline, non composable, non arrondie et non
centralisée ; dette immédiate dès le premier bonus d'équipement/buff sur les PV.

### Mode legacy conditionnel (`base` vs `dérivé` selon config) (rejetée)

Rejetée : ambiguïté « vitalité = 0 » (legacy ou choix délibéré ?) irrésoluble ;
deux régimes de PV incohérents entre templates.

### Mode configurable `base | derived | hybrid` ajouté immédiatement (rejetée)

Rejetée pour la V1 : surconception (schéma + DTO + Studio + tests × 3) pour un
besoin que le socle pur partagé couvre déjà. Reste envisageable ultérieurement si un vrai
besoin émerge.

## Decision

Adopter un **socle pur partagé de résolution des statistiques, alimenté par des
adapters/collecteurs propres à chaque domaine** — extension du
`RuntimeComputeEngine` existant, pas un nouveau framework.

```text
collecteur joueur ─────┐
                       ├─→ resolver pur partagé → snapshot final serveur
collecteur créature ───┘
```

### 1. Trois responsabilités séparées

- **Collecte** (par domaine) : rassemble la valeur de base, les contributions
  dérivées et les modificateurs (équipement, skills, buffs, passifs, environnement)
  sous forme de contributions normalisées. Les formules et coefficients restent
  ici, propres au domaine.
- **Résolution** (socle pur partagé) : applique filtres, opérations, override,
  caps et arrondi dans un ordre invariant, et produit une trace.
- **Consommation** (combat, DTO, Studio) : lit **uniquement** la valeur finale et
  la trace du snapshot. Ne recalcule jamais.

### 2. Ordre de résolution validé

```text
valeur de base
→ contributions dérivées
→ collecte des modificateurs
→ filtres et neutralisations
→ contributions plates
→ pourcentages additifs
→ multiplicateurs
→ override prioritaire
→ caps (min/max)
→ arrondi final unique
→ valeur autoritaire
```

### 3. Snapshot + recalcul sur invalidation

```text
changement de source → invalidation → recalcul du snapshot → combat lit le snapshot
```

Le calcul **n'est jamais** effectué à chaque hit, à chaque tick, ni à chaque
lecture par le combat.

### 4. Convergence joueur différée

`CharacterStatsCalculator` **reste actif** et n'est **pas** migré dans le premier
chantier. La fondation doit rendre la convergence future possible sans l'imposer.

### 5. `maxHealthDerived` n'est plus une notion concurrente

`baseHealth` reste le **socle permanent** ; la Vitalité et les futures sources
deviennent des **contributions traçables**. Lors de la migration créature,
`maxHealthDerived` sera intégré comme **contribution / étape traçable** du
pipeline, et non comme second PV max.

## Modèle conceptuel minimal

Notions (noms indicatifs — les noms TypeScript définitifs suivront les
conventions du dépôt lors de l'implémentation) :

- **StatDefinition** — identité d'une statistique, sa valeur de base ou sa
  source brute, et ses bornes (caps). Le catalogue joueur `DerivedStatDefinition`
  en est déjà une forme.
- **StatContribution** — une contribution atomique à une stat (dérivée d'une
  primaire, bonus d'équipement, etc.).
- **StatModifier** — une contribution portant une **opération** et des
  **métadonnées** de source (extension de `RuntimeModifier` existant).
- **StatFilter** — une règle de neutralisation/réduction appliquée **avant** le
  calcul, retirant ou pondérant des contributions.
- **StatResolutionContext** — l'ensemble base + contributions + filtres + caps
  fourni au resolver pour une entité/stat.
- **StatResolutionResult** — la valeur finale autoritaire + la trace.
- **StatTrace** — la trace par stat (base, contributions appliquées,
  contributions filtrées, valeur avant caps, valeur finale). `RuntimeTrace` /
  `StatTrace` existants en sont la base.

### Opérations

- `flat` — addition directe (positive ou négative).
- `percent_add` — pourcentage additif (positif ou négatif), sommé puis appliqué
  une fois.
- `percent_multiply` — multiplicateur indépendant, appliqué séquentiellement.
- `override` — fixe la valeur, prioritaire, court-circuite les contributions
  additives/multiplicatives précédentes (interaction exacte avec les caps et
  entre overrides de même priorité : voir Open questions).

### Métadonnées de contribution

- `sourceType` — catégorie de source (`equipment`, `buff`, `debuff`, `passive`,
  `skill`, `environment`, …) ; l'ensemble existant de `ModifierSourceType` en est
  la base.
- `sourceId` — identité précise de la source.
- `tags` — marqueurs libres lus **uniquement** par l'étage filtres (format
  définitif : voir Open questions).
- `priority` — ordre d'application au sein d'une même opération (déjà présent).

### Filtres

Capacités à supporter en V1 (appliquées **avant** le calcul, en retirant ou
pondérant des contributions — jamais en trafiquant la valeur finale) :

- ignorer une **source** (par `sourceType` ou `sourceId`) ;
- ignorer un **tag** ;
- ignorer uniquement les contributions **positives** ;
- ignorer uniquement les contributions **négatives** ;
- **réduire partiellement** une catégorie de contributions (ex. −50 %).

### Cache et invalidation

- Un **snapshot par entité**, calculé à la demande et mis en cache.
- **Invalidation ciblée** sur changement de source : équipement ajouté/retiré,
  buff appliqué/expiré, passif activé/désactivé, primaire modifiée, coefficient
  modifié, configuration Studio modifiée.
- **Aucun recalcul par hit ni par tick.** Le combat lit le snapshot final.

### Trace Studio

Le Studio devra pouvoir afficher à terme, **sans aucune logique de résolution
côté client** : la valeur de base, les contributions dérivées, les modificateurs
**appliqués**, les modificateurs **filtrés** (avec source et raison du filtrage),
la valeur **avant caps** et la valeur **finale**. Le Studio consomme la trace
produite par le serveur ; il ne recalcule rien.

## Rationale

Le socle générique existe déjà et est partiellement partagé (joueur/créature) —
le socle pur partagé avec adapters propres à chaque domaine est une **extension
bornée** de l'existant, pas une réécriture. La
séparation collecte/résolution/consommation préserve les formules métier propres
à chaque domaine (conforme à la décision V6-B2 pour les créatures et au catalogue
`DerivedStatDefinition` pour le joueur) tout en centralisant les opérations
transverses (filtres, override, caps, arrondi, trace). Retirer une contribution
**avant** le calcul (plutôt que corriger le résultat) est la seule façon de
composer correctement pourcentages, multiplicateurs et caps, et de rester
traçable.

## Consequences

### Positive

- Extensibilité : bonus/malus, overrides, filtres et caps ajoutés une seule fois.
- Cohérence joueur/créature via un resolver commun.
- Traçabilité complète (contributions appliquées et filtrées) pour le Studio.
- Sécurité : résolution entièrement serveur, valeurs réseau limitées au rendu.
- Testabilité : moteur pur isolé, testable exhaustivement hors I/O.
- Neutralisations propres (par source/tag/signe/réduction) sans hack du résultat.
- Centralisation future de `maxHealth` : fin des notions concurrentes de PV max.

### Negative

- Migration progressive nécessaire ; **coexistence temporaire de deux pipelines
  joueur** (`CharacterStatsCalculator` + socle) jusqu'à la convergence (lot futur).
- Complexité ajoutée par l'étage de filtres.
- Gestion d'un cache par entité et de son invalidation.

### Risks

- Surconception si des capacités hors V1 (stacking complexe, persistance des
  buffs, caps PvP/PvE) sont introduites trop tôt.
- Divergence si l'invalidation du cache est incomplète (snapshot obsolète).
- Divergence persistante des notions de PV max tant que la migration créature
  (lot 2) n'a pas centralisé `maxHealth`.

## Security impact

Le serveur reste l'**unique autorité**. Le client et le Studio ne calculent
jamais les valeurs finales, ne fournissent pas de modificateurs autoritaires, ne
choisissent pas les filtres et ne contournent pas les caps. Les payloads réseau
ne servent qu'au rendu (valeurs et traces produites serveur). Les intentions
client (ex. `skill:cast`) restent strictement validées serveur, sans capacité
d'injecter des contributions ou des filtres.

## Performance impact

Le modèle **snapshot + invalidation ciblée** évite tout recalcul par hit ou par
tick ; le combat lit une valeur pré-résolue. Le coût d'un recalcul est un
parcours des contributions d'une entité, borné et déclenché uniquement sur
changement de source. Aucune affirmation chiffrée n'est faite sans mesure ; la
montée en charge (centaines/milliers de créatures) impose un cache par entité et
une invalidation précise, à valider par mesure lors de l'implémentation.

## Migration and compatibility

Migration **progressive et sans big bang** :

1. Fondation pure (aucune migration de domaine).
2. Migration créature (contribution Vitalité, centralisation `maxHealth`),
   activation des PV dérivés **seulement après validation**.
3. Studio créature (affichage du détail, aucune logique de résolution client).
4. Convergence joueur (**lot futur**, audit dédié, `DerivedStatDefinition`
   conservé).
5. Effets temporaires et stacking (**Planned**).

Les seeds actuels (`turkey`/`goblin`, vitalité 0) donnent `maxHealthDerived ==
baseHealth` : la future activation créature est un no-op pour le contenu
versionné, sans migration de schéma ni de contenu.

## Validation

- [x] Existing implementation analyzed.
- [x] Related ADRs reviewed (ADR-0004, ADR-0020).
- [x] Security impact reviewed.
- [x] Performance impact reviewed.
- [ ] Human approval recorded.
- [ ] Related documentation updated.

## Décisions techniques du Lot 1 (précédemment ouvertes)

Tranchées lors de l'implémentation de la fondation pure (Lot 1), au niveau du
resolver mono-stat `RuntimeComputeEngine.resolveStat` :

- **Politique d'arrondi configurable par statistique** : énumération
  `none | floor | round | ceil`, défaut `none`, appliquée **une seule fois** et
  **après les caps** (aucun arrondi intermédiaire). Le domaine choisit la
  politique par stat au moment de la collecte (ex. `maxHealth` utilisera
  probablement `floor` en Lot 2 — non implémenté ici).
- **Conflit d'overrides de même priorité** : l'override de **priorité la plus
  élevée gagne** ; plusieurs overrides actifs de **même priorité** pour une même
  statistique constituent une **erreur de configuration explicite et traçable**
  (`StatResolutionError` code `DUPLICATE_OVERRIDE_PRIORITY`). Aucun choix
  silencieux selon l'ordre du tableau.
- **Caps toujours appliqués après l'override** : ordre figé
  `override → caps → arrondi`. Aucun `bypassCaps` en V1 ; `min > max` rejeté
  (`INVALID_CAPS`).

## Open questions

Décisions **volontairement non figées** ici (à trancher par le responsable ou en
lot ultérieur) :

- Règles complexes de stacking (plus fort uniquement, limite de stacks,
  remplacement, rafraîchissement de durée, groupes d'exclusivité).
- Persistance des buffs/debuffs temporaires après redémarrage (aucune table
  conçue dans cet ADR).
- Migration complète du pipeline joueur.
- Caps contextuels PvP/PvE.
- Format définitif des tags.

L'ADR fixe l'**existence** des étapes (filtres, override, caps, trace) sans figer
les règles gameplay restantes.

## Non-goals

Hors périmètre de cet ADR et du premier chantier :

- Migration du pipeline joueur.
- Persistance des buffs/debuffs.
- Stacking complexe.
- Formules définitives d'équilibrage.
- Caps contextuels PvP/PvE.
- Implémentation Studio.
- Activation de `maxHealthDerived`.

## Security notes

Toute contribution, tout filtre et tout override sont résolus et validés côté
serveur. Le Studio est un client non fiable : il configure (définitions,
coefficients) via les routes admin, mais ne participe jamais à la résolution.

## Performance notes

Le snapshot par entité et l'invalidation ciblée sont les leviers principaux.
Éviter tout parcours complet des contributions par tick. Mesurer avant
d'optimiser davantage.

## Related files

Voir `Related code` (Metadata). Aucun de ces fichiers n'est modifié par cet ADR.

## TODO

- [ ] Obtenir la validation humaine (passage `Decision status: Accepted`).
- [ ] Lot 1 — fondation pure V1 (extension du moteur générique + filtres +
  override + caps + trace, tests purs).
- [ ] Lot 2 — migration créature + centralisation `maxHealth` (activation PV
  dérivés après validation).
- [ ] Lot 3 — Studio créature (affichage du détail).
- [ ] Lot 4 — convergence joueur (futur, audit dédié).
- [ ] Lot 5 — effets temporaires et stacking (Planned).
