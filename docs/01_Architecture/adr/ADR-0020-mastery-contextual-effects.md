# ADR-0020 — Mastery Effects as Contextual Server-Side Bonuses

## Metadata

- Status: Accepted
- Decision status: Accepted
- Owner: Project
- Last updated: 2026-07-11
- Date proposed: 2026-07-11
- Date accepted: 2026-07-11
- Approved by: Project owner
- Approval reference: Chaîne Masteries V1-D implémentée, testée unitairement
  (82 suites / 1953 tests backend) et validée en runtime (2026-07-11)
- Depends on:
  - docs/01_Architecture/adr/ADR-0018-class-mastery-progression.md
  - docs/01_Architecture/adr/ADR-0019-active-skills-v1.md
  - docs/01_Architecture/adr/ADR-0016-skills-rewards-runtime.md
  - docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md
- Used by: Project owner, backend developers, gameplay designers, Studio
  developers, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents:
  - STATUS.md (bloc « Masteries V1-D »)
  - CLAUDE.md (Sécurité, Architecture Runtime)
- Related code:
  - apps/api-gateway/src/masteries/mastery-effect-targets.ts (source unique des stats ciblables — V2)
  - apps/api-gateway/src/masteries/mastery-effects.calculator.ts (sanitize + compute purs)
  - apps/api-gateway/src/masteries/mastery-effects.service.ts (résolution serveur)
  - apps/api-gateway/src/masteries/masteries.service.ts (CRUD + cache définitions)
  - apps/api-gateway/src/masteries/entities/mastery-definition.entity.ts (colonne `effects`)
  - apps/api-gateway/src/active-skills/entities/skill-definition.entity.ts (colonne `weaponType`)
  - apps/api-gateway/src/active-skills/skill-cast.service.ts (bonus skills weapon-based)
  - apps/api-gateway/src/creatures/creatures.service.ts (bonus auto-attaque)
  - apps/api-gateway/src/characters/equipped-weapon.helper.ts (contexte arme équipée)
  - apps/api-gateway/src/migrations/1784332800000-AddEffectsToMasteryDefinition.ts
  - apps/api-gateway/src/migrations/1784419200000-AddWeaponTypeToSkillDefinition.ts
- Commits: 5432eb1, b357a21, cd65900, d40865a, 6b16cd7, c2e404d (V1) ; 6611c3e, 307c834, a6b3157 (Amendement V2)

---

## Context

Avant V1-D, les maîtrises (`MasteryDefinition` / `PlayerMastery`, ADR-0016 et
ADR-0018 §4–5) servaient exclusivement à :

- la **progression** : XP et level par personnage (`applyMasteryXpInTx`,
  `calculateMasteryXp`) ;
- le **verrouillage** : `requiredMasteries` sur les items, skills et recettes
  (prérequis de niveau minimum, centralisés dans
  `MasteriesService.evaluateRequiredMasteries`).

Le besoin gameplay réel dépasse le verrouillage : une maîtrise doit accorder
des **bonus progressifs contextuels** — « +X % de dégâts avec une dague par
niveau de maîtrise dague », plus tard « +X % de blocage avec bouclier »,
« +X % de réussite en forge », etc.

Le projet impose le serveur autoritatif (CLAUDE.md, ADR-0003) : aucun calcul
client ne décide d'un bonus. ADR-0018 §4 prévoyait que les masteries
contribuent via des `RuntimeSource` / `RuntimeModifier` traçables ; ADR-0018
reste cependant Draft avec un non-goal « pas d'implémentation ».

## Problem

Où stocker les effets, qui les calcule, et comment relier un effet à son
contexte matériel (arme équipée, pièce d'armure, recette) sans dupliquer la
logique dans chaque domaine consommateur ni transformer les maîtrises en
sous-partie des skills ?

## Decision drivers

- Serveur autoritatif, zéro calcul client.
- Séparation stricte : prérequis (`requiredMasteries`) ≠ bonus (`effects`).
- Les maîtrises sont **transversales** : combat, craft, défense, social.
- Chemin chaud : le bonus combat est résolu à chaque hit d'auto-attaque et à
  chaque cast de skill — le calcul doit être pur, testable et sans I/O inutile.
- Extensibilité : nouveaux contextes et nouveaux effets sans refonte.
- Cohérence avec les patterns existants : JSONB whitelisté (`item.statBonuses`,
  `skill.scaling`), calculateurs purs (`calculateCombatDamage`,
  `calculateSkillEffect`, `computeCraftSuccessRate`), cache de config
  (`DerivedStatsService`).

## Considered options

### Option A — JSONB `effects` sur `mastery_definition` + service de résolution dédié (retenue)

Les effets vivent sur la définition de maîtrise ; un calculateur pur et un
service serveur unique les résolvent selon le contexte réel fourni par le
domaine appelant.

### Option B — Table relationnelle `mastery_effect`

Rejetée en V1 : aucune requête SQL par effet, lecture toujours par définition
entière, catalogue minuscule et cacheable. Complexité sans bénéfice.

### Option C — Bonus portés par les skills (ou `appliesTo` dans effects)

Rejetée : ferait des maîtrises une sous-partie des skills. Un sort magique ou
un heal n'a aucune raison de porter la configuration d'un bonus d'arme, et le
bonus doit exister pour l'auto-attaque sans aucun skill.

### Option D — `requiredMasteries` comme proxy de bonus

Rejetée : `requiredMasteries` est un verrou sémantique. Le confondre avec un
lien d'arme produirait des bonus involontaires (un sort exigeant une maîtrise
recevrait son bonus d'arme).

## Decision

### 1. Modèle (amendé V2)

- Les effets de maîtrises sont stockés dans **`mastery_definition.effects`**
  (JSONB, `NOT NULL DEFAULT '{}'`). `{}` = aucun effet.
- Structure V2 — liste générique de modificateurs :

  ```json
  {
    "context":   { "weaponType": "two_handed_sword" },
    "modifiers": [
      { "stat": "physicalAttack", "mode": "percentPerLevel", "value": 5 }
    ]
  }
  ```

  - `stat` : clé d'une stat dérivée ciblable, whitelistée par la **source
    serveur unique `mastery-effect-targets.ts`** (10 stats branchées gameplay :
    physicalAttack, defense, maxHealth, maxMana, maxEnergy, healthRegen,
    manaRegen, energyRegen, healingPower, magicPower) ;
  - `mode` : `percentPerLevel` (0–5/niveau) ou `flatPerLevel` (0–100/niveau) ;
  - `value` : coefficient par niveau, borné par stat et par mode (bornes
    portées par le target serveur) ;
  - `context` optionnel : présent → modificateurs CONTEXTUELS consommés par
    les hooks weapon-based (stat `physicalAttack` seule autorisée) ; absent →
    modificateurs PERMANENTS appliqués au pipeline de stats du personnage.
- **Écriture stricte** : `sanitizeMasteryEffects` valide stat/mode/value/
  bornes/doublons via les targets, exige `physicalAttack` seul avec un
  contexte, et rejette tout le reste en 400. Aucun effet non supporté n'est
  persisté. Le format legacy V1 `combat.damagePercentPerLevel` est **accepté
  en entrée et converti** : l'écriture ne produit plus que `modifiers[]`.
- **Lecture défensive** : les valeurs corrompues sont ignorées ou clampées,
  jamais levées — un catalogue sale ne casse pas un hit. Le legacy est lu
  comme un modifier `physicalAttack / percentPerLevel`.

### 2. Résolution (amendé V2)

- **`MasteryEffectsService`** est le point serveur unique de résolution.
  Les calculs sont des fonctions pures (`computeCombatMasteryEffects` pour le
  contextuel, `aggregateMasteryStatModifiers` pour le permanent).
- Formule : **`bonus = level × coefficient`**. **`PlayerMastery` démarre au
  niveau 0** : level 0 (maîtrise jamais pratiquée) = aucun bonus, le niveau
  affiché = nombre réel de coefficients appliqués (level 3 × 5 = 15 %). Coût
  d'XP : `baseXpPerLevel × (level + 1)^xpCurveExponent`.
- Clamps serveur par stat : **percent total ≤ 50**, **flat total ≤ 1000**,
  quel que soit le nombre de maîtrises matchées ou la configuration.
- Les modificateurs PERMANENTS sont appliqués aux stats dérivées via
  `CharacterStatsCalculator.compute` (étage post-dérivées
  `applyDerivedStatModifiers`, plancher 0, jamais NaN/Infinity) sur tous les
  chemins consommateurs : getMe, combat, skills damage/heal, respawn, join,
  tick de régénération, clamp de ressources à l'équipement.
- Maîtrise `enabled: false`, contexte non matché, effets vides → 0.
- Les définitions sont servies par un cache mémoire
  (`MasteriesService.getEnabledMasteryDefinitions`), invalidé à chaque
  mutation du catalogue (CRUD HTTP **et** chemin socket admin).

### 3. Contexte

- Les domaines consommateurs **fournissent le contexte, jamais la propriété** :
  un skill ne « possède » pas une maîtrise.
- Contexte V1 : `weaponType` (combat à l'arme). Le weaponType équipé est
  résolu **côté serveur** par `resolveEquippedWeaponType(equipment)`
  (priorité arme à distance > mêlée) — jamais fourni par le client.
- `skill_definition.weaponType` (nullable) signifie seulement : « ce skill est
  un skill d'arme compatible avec ce type d'arme ». `null` = jamais de bonus
  de maîtrise d'arme. Ce champ **n'impose pas** l'arme pour caster.
- Contextes futurs prévus (non implémentés) : `armorType`, bouclier,
  `craftCategory` / recettes, pipeline de défense.

### 4. Surfaces consommatrices

- **Implémentées (V2)** :
  - modificateurs permanents : les 10 stats des targets, appliquées au
    pipeline de stats (voir §2) ;
  - contextuel arme : auto-attaque (`CreaturesService.attack`) — attaque
    effective `round(physicalAttack × (1 + percent/100) + flat)` avant
    `calculateCombatDamage` ; skills weapon-based
    (`SkillCastService.castCreatureSkill`, `skill.weaponType` = arme équipée)
    — montant boosté après `calculateSkillEffect`, avant `applySkillDamage`.
- **Futures (Not implemented)** : critique, dodge, parry, block, accuracy,
  attackSpeed, movementSpeed, résistances, stun, knockback, succès/qualité de
  craft. Ces stats sont volontairement **absentes de `mastery-effect-targets`**
  (donc refusées par sanitize et invisibles dans le Studio) : elles seront
  ajoutées quand leur hook gameplay existera — on ne stocke pas de promesses
  mortes.

### 5. Studio

- Le Studio **édite la configuration** via l'API admin HTTP
  (`PATCH /admin/mastery-definitions/:key`, `PATCH /admin/skill-definitions/:key`)
  et **ne calcule jamais** un bonus ni une éligibilité.
- Le chemin socket admin rejette `effects` volontairement (whitelist du
  handler) — l'édition des effets passe par le DTO HTTP validé.
- `SkillsModule` expose uniquement `skill.weaponType`.
- **Le module Studio « Maîtrises / Effets » est livré (V2)** : création de
  maîtrise, édition des `effects` en tableau stat/mode/value, catalogue des
  stats/modes/bornes chargé depuis **`GET /admin/mastery-effect-targets`** —
  aucune liste codée en dur côté frontend, sauvegarde bloquée si le catalogue
  ne charge pas, aucun calcul de bonus côté client.

### 6. Relation avec ADR-0018 (déviation contrôlée)

V1-D **ne passe pas** par le pipeline générique `RuntimeSource` /
`RuntimeModifier` / `RuntimeTrace` prévu par ADR-0018 §4. C'est une
**déviation volontaire, contrôlée et documentée** — pas un oubli :

- le bonus est résolu sur un chemin chaud (chaque hit / chaque cast) : un
  calculateur pur dédié, sans allocation de modifiers ni écriture de trace,
  est plus simple et plus performant ;
- la surface V1-D est minuscule (`damagePercentPerLevel` seul) : un pipeline
  générique serait une abstraction sans second usage (règle projet) ;
- ADR-0018 reste Draft avec un non-goal « pas d'implémentation ».

Quand ADR-0018 sera concrétisé (amplifications temporaires de masteries par
des skills, overcap 1001–2000, traçabilité RuntimeTrace), la résolution pourra
migrer vers le pipeline générique **sans changer le modèle de données** :
`mastery_definition.effects` et la sémantique contextuelle restent valides.
Cette déviation ne doit jamais être masquée dans la documentation.

## Amendement V2 (2026-07-11)

La décision de fond est inchangée (bonus contextuels serveur, JSONB whitelisté,
séparation prérequis/bonus, les domaines fournissent le contexte). L'amendement
généralise le modèle après validation runtime de la V1 :

- **Modèle** : `combat.damagePercentPerLevel` (mono-effet) → **`modifiers[]`**
  génériques (`stat`/`mode`/`value`), modes `percentPerLevel` et
  `flatPerLevel`. Le legacy est lu défensivement, plus jamais généré.
- **Progression** : `PlayerMastery` démarre au **niveau 0** ; formule
  `(level − 1) × perLevel` → **`level × coefficient`** (migration
  `StartPlayerMasteryAtLevelZero`).
- **Application** : au-delà du contextuel arme, les modificateurs sans
  contexte sont appliqués aux stats dérivées dans
  `CharacterStatsCalculator.compute` (tous les chemins consommateurs).
- **Source unique** : `mastery-effect-targets.ts` porte stats/modes/bornes/
  statut runtime, consommée par sanitize ET exposée via
  `GET /admin/mastery-effect-targets` ; le Studio la consomme (plus de liste
  frontend en dur).
- **Studio** : module « Maîtrises / Effets » livré (création + tableau).

Commits : 6611c3e, 307c834, a6b3157.

## Rationale

- La séparation prérequis / bonus suit la sémantique réelle du gameplay et
  évite les bonus involontaires.
- Porter les effets par la **définition de maîtrise** rend le système
  transversal : l'auto-attaque, les skills et les futurs pipelines craft /
  défense consomment la même configuration sans la dupliquer.
- Écriture stricte + lecture défensive est le compromis éprouvé du projet pour
  le JSONB de configuration (mêmes patterns que `skill.scaling`).
- Le clamp serveur est indispensable : `maxLevel` par défaut vaut 100 et
  ADR-0018 prévoit des caps à 1000 — aucune configuration ne doit pouvoir
  produire un multiplicateur absurde.

## Consequences

### Positives

- Séparation claire entre prérequis (`requiredMasteries`) et bonus (`effects`).
- Serveur autoritatif de bout en bout ; aucune logique client.
- Système extensible par ajout de clés whitelistées (contextes et effets).
- Compatible auto-attaque et skills aujourd'hui, craft / défense / armure demain.
- Le Studio édite la configuration sans jamais calculer le gameplay.
- Calcul pur intégralement testé (sanitize, compute, branchements).

### Négatives / dettes

- Migrations versionnées mais non exécutées par un runner prod
  (`AddEffectsToMasteryDefinition`, `AddWeaponTypeToSkillDefinition`) —
  `synchronize: true` crée les colonnes en dev uniquement.
- (Amendé V2) Dix stats supportées via `modifiers[]` ; critique / dodge /
  parry / block / accuracy / vitesses / résistances / stun / craft non
  implémentés (hors targets).
- Double cumul possible avec `skill.scaling.masteryCoefficients` (un skill
  peut déjà scaler additivement sur un niveau de maîtrise) — mécanismes
  distincts, à surveiller à l'équilibrage.
- Le mapping XP `COMBAT_WEAPON_MASTERY_MAP` (weaponType → mastery key pour
  l'XP de combat) reste hardcodé dans `CreaturesService` : la relation
  weaponType ↔ mastery est encodée à deux endroits (`effects.context` étant
  l'autre). Candidate à une unification future.
- (Soldée V2) ~~Le module Studio « Maîtrises / Effets » n'est pas encore
  implémenté~~ — livré (création + tableau, targets serveur).
- `effects` non éditable via le socket admin — volontaire (validation DTO
  HTTP), mais à connaître.

## Security impact

- Aucun payload client n'entre dans la résolution : contexte (arme équipée)
  et niveaux proviennent de l'état serveur.
- Le JSONB est validé strictement à l'écriture (whitelist, bornes, format) et
  borné à la lecture (clamp) — un admin compromis ne peut pas produire un
  multiplicateur supérieur à +50 %.

## Performance impact

- Définitions servies depuis un cache mémoire invalidé sur mutation (pattern
  `DerivedStatsService`) — zéro SELECT de catalogue par hit.
- Auto-attaque : une lecture des niveaux du personnage par hit (rate-limitée
  par le cooldown d'attaque). Skill cast : réutilise les niveaux déjà chargés
  pour les prérequis/scaling — zéro lecture supplémentaire.
