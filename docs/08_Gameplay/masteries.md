# Masteries

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-07-11 (amendé Mastery Effects V2)
- Depends on: docs/01_Architecture/adr/ADR-0020-mastery-contextual-effects.md, docs/01_Architecture/adr/ADR-0018-class-mastery-progression.md, docs/01_Architecture/adr/ADR-0016-skills-rewards-runtime.md, STATUS.md
- Used by: Project owner, developers, gameplay designers, conversational assistants, repository-aware coding agents

## Scope

Ce document décrit l'état réel du système de maîtrises : progression,
prérequis (`requiredMasteries`) et modificateurs de stats (`effects`,
Mastery Effects V2).

Il ne décrit pas les skills actifs en détail (ADR-0019), ni les classes et
talents (ADR-0018, non implémentés), ni l'XP personnage.

## Définitions

- **Mastery** : progression spécialisée et passive du personnage (arme,
  métier, récolte, social…). Jamais une capacité activable.
- **MasteryDefinition** : définition serveur d'une maîtrise (catalogue) —
  `key` immuable, `name`, `category`, `maxLevel`, `baseXpPerLevel`,
  `xpCurveExponent`, `enabled`, `effects`.
- **PlayerMastery** : progression d'un personnage sur une maîtrise (`level`,
  `xp`). **Démarre au niveau 0** : le niveau affiché = nombre réel de
  coefficients d'effet appliqués, aucun niveau gratuit. Une maîtrise jamais
  pratiquée est présentée level 0 / xp 0 sans ligne en base.
- **requiredMasteries** : prérequis / verrouillage — `{ masteryKey: levelMin }`
  sur les items, skills et recettes.
- **effects** : bonus progressifs contextuels portés par la définition de
  maîtrise (ADR-0020).

## Séparation requiredMasteries / effects

Les deux mécanismes sont distincts et ne doivent jamais être confondus :

- `requiredMasteries` **ne donne aucun bonus**. Il autorise ou bloque une
  action : équiper un item, caster un skill, lancer un craft. Source unique :
  `MasteriesService.evaluateRequiredMasteries` / `hasRequiredMasteries`.
- `effects` **donne des bonus serveur** selon un contexte réel (arme équipée
  aujourd'hui ; armure, recette… demain). Il n'autorise ni ne bloque rien.

Utiliser `requiredMasteries` comme proxy de bonus est une alternative
explicitement rejetée par ADR-0020.

## Modificateurs de stats (effects) — Implemented (V2)

### Formule

```
bonus = level × coefficient
```

- **Level 0** (maîtrise jamais pratiquée) → **aucun bonus**.
- Level 1 → 1 coefficient ; level 3 → 3 coefficients.
- Exemple : level 3, value 5 en percent → **bonus = 3 × 5 = 15 %**.
- Clamps serveur par stat : **percent total ≤ 50 %**, **flat total ≤ 1000**,
  quelle que soit la configuration ou le nombre de maîtrises matchées.
- Coût d'XP : `baseXpPerLevel × (level + 1)^xpCurveExponent` (passer 0 → 1
  coûte `baseXpPerLevel`).

### Modèle `modifiers[]`

Chaque effet est une liste de modificateurs `{ stat, mode, value }` :

- `stat` : stat dérivée ciblable, whitelistée par la source serveur unique
  (`mastery-effect-targets`) ;
- `mode` : `percentPerLevel` (0–5 par niveau) ou `flatPerLevel` (0–100 par
  niveau) ;
- `value` : coefficient par niveau, borné par stat et par mode ;
- `context.weaponType` optionnel : présent → effet CONTEXTUEL consommé par
  les hooks weapon-based (stat `physicalAttack` seule autorisée) ; absent →
  effet PERMANENT appliqué au pipeline de stats du personnage.

Le format legacy V1 `combat.damagePercentPerLevel` est lu défensivement
(interprété comme `physicalAttack / percentPerLevel`) mais n'est plus jamais
généré à l'écriture.

### Stockage

- `mastery_definition.effects` — JSONB, `NOT NULL DEFAULT '{}'`.
- `{}` = aucun effet (valeur des maîtrises existantes et par défaut).
- **Écriture stricte** : stat/mode/value/bornes/doublons validés contre les
  targets serveur, rejet 400 de tout effet non supporté
  (`sanitizeMasteryEffects`). Aucun effet non supporté n'est persisté.
- **Lecture défensive** : une valeur corrompue en base est ignorée ou clampée,
  jamais levée — un catalogue sale ne casse pas un hit.

### Exemples de configuration

Effet permanent (sans contexte — appliqué aux stats du personnage) :

```json
{
  "effects": {
    "modifiers": [
      { "stat": "maxHealth", "mode": "percentPerLevel", "value": 2 }
    ]
  }
}
```

Effet contextuel arme (hooks weapon-based, `physicalAttack` uniquement) :

```json
{
  "effects": {
    "context": { "weaponType": "two_handed_sword" },
    "modifiers": [
      { "stat": "physicalAttack", "mode": "percentPerLevel", "value": 5 }
    ]
  }
}
```

Désactivation :

```json
{ "effects": {} }
```

### Stats ciblables — construites depuis les DerivedStatDefinition (V3-B)

Le catalogue des targets n'est **plus une liste statique** : il est **construit
à partir des `DerivedStatDefinition`** (source de vérité éditable dans le Studio
« Stats secondaires »), exposé par **`GET /admin/mastery-effect-targets`**
(builder pur `mastery-effect-targets.ts`, partagé avec la validation d'écriture).

Une stat dérivée est **ciblable** si et seulement si :

- `enabled` ;
- `masteryEligible` ;
- `runtimeStatus === 'implemented'` ;
- `allowedModifierModes` non vide.

Toute stat `disabled` / `calculatedOnly` / `notHooked` / sans mode n'est jamais
exposée (ni ciblable par sanitize, ni visible dans le Studio). Le **client et le
Studio ne calculent rien** : le Studio lit ce catalogue serveur, sans aucune
liste codée en dur.

Stats actuellement exposées (Implemented) : `physicalAttack`, `defense`,
`maxHealth`, `maxMana`, `maxEnergy`, `healthRegen`, `manaRegen`,
`energyRegen`, `healingPower`, `magicPower`, **`armorPenetrationPercent`** (V4-B0).

> `defensePenetration` (ancien modèle **plat**, V4-A) n'est **plus exposée**
> comme target : conservée en compatibilité seulement (`masteryEligible=false`,
> `runtimeStatus=calculatedOnly`, aucun mode) — voir « Résolution serveur ».

Stats futures NON exposées (Not implemented — aucun hook gameplay) : critique,
dodge, parry, block, accuracy, attackSpeed, movementSpeed, résistances, stun,
knockback, curses / `armorReductionPercent` (debuff cible), craft (succès/qualité).

### armorPenetrationPercent (V4-B0)

`armorPenetrationPercent` est une stat dérivée **système** offensive (bornée
0–100), ciblable comme **modificateur permanent** (jamais contextualisée
`weaponType` — le contexte arme reste réservé à `physicalAttack`). Elle **ignore
un pourcentage de l'armure de la cible** pour un hit **physique** ; elle ne
réduit pas l'armure globale de la cible et ne crée aucun debuff persistant.
Utile en `flatPerLevel` ou `percentPerLevel`.

```jsonc
{
  "effects": {
    "modifiers": [
      { "stat": "armorPenetrationPercent", "mode": "flatPerLevel", "value": 5 }
    ]
  }
}
```

Progression : `flatPerLevel` sur cette stat = **points de pourcentage** par
niveau — maîtrise niveau 3 × 5 = **+15 % de pénétration d'armure**. En combat
**physique** : `effectiveArmor = round(targetArmor × (1 − armorPenetrationPercent / 100))`
puis `finalDamage = max(0, rawDamage − effectiveArmor)` (armure effective jamais
négative). Les **dégâts `raw`** ignorent l'armure **et** la pénétration
(`finalDamage = rawDamage`). Consommée par l'**auto-attaque** joueur et les
**skills damage physiques** (le lanceur passe sa pénétration dérivée à
`applySkillDamage`).

Exemple : `rawDamage 100`, `armor 40`, `armorPenetrationPercent 50` →
`effectiveArmor 20` → `finalDamage 80`.

> V4-C : chaque skill damage porte un `damageType` (`physical` par défaut, ou
> `raw`). `armorPenetrationPercent` n'affecte que les skills **`physical`** ; un
> skill **`raw`** ignore armure et pénétration. La règle des Mastery Effects
> contextuels arme est inchangée : `contextualStats` reste `physicalAttack`
> uniquement.
>
> Ordre de résolution complet (bloc attaque / bloc défense, pénétration appliquée
> **en dernier**) : voir `docs/08_Gameplay/combat-resolution.md` (contrat V4-D0).

### Résolution serveur

- **`MasteryEffectsService`** est le point serveur unique de résolution ;
  les calculs sont des fonctions pures (`computeCombatMasteryEffects` pour le
  contextuel, `aggregateMasteryStatModifiers` pour le permanent).
- Les modificateurs **permanents** sont appliqués aux stats dérivées via
  `CharacterStatsCalculator.compute` sur tous les chemins : getMe, combat,
  skills damage/heal, respawn, join, tick de régénération, clamp de
  ressources à l'équipement.
- Le **client et le Studio ne calculent jamais** un bonus ni une éligibilité :
  le Studio édite la configuration via l'API admin HTTP, le serveur valide
  stat/mode/bornes/contexte et résout le contexte réel (arme équipée via
  `resolveEquippedWeaponType`, jamais fournie par le client).
- Les définitions `enabled` sont servies par un cache mémoire invalidé à
  chaque mutation du catalogue (CRUD HTTP et chemin socket admin).
- Maîtrise `enabled: false`, contexte non matché, effects vide, level 0 → 0.

## Contexte actuel : weaponType (combat à l'arme)

- **Auto-attaque** : le contexte est le `weaponType` de l'arme équipée
  (priorité arme à distance > mêlée). Bonus appliqué à l'attaque physique
  avant `calculateCombatDamage`.
- **Skill weapon-based** : `skill_definition.weaponType` (nullable) déclare
  « ce skill est compatible avec ce type d'arme ». Le bonus s'applique
  uniquement si l'arme équipée a **le même** weaponType, sur le montant final
  du skill (`effect.amount`) après `calculateSkillEffect`.
- `skill.weaponType = null` → **aucun bonus de maîtrise d'arme**, jamais
  (sorts, soins, utilitaires).
- `skill.weaponType` **n'impose pas l'arme pour caster** : sans l'arme
  correspondante, le cast reste autorisé avec bonus 0.

## Surfaces consommatrices

### Implemented (V2)

- **Permanents** : les stats des targets, appliquées partout où les stats
  dérivées sont consommées (combat, respawn, régénération, coûts/soins de
  skills, affichage `/characters/me`). Inclut **`armorPenetrationPercent`** (V4-B0) :
  ignore un % de l'armure de la cible (`effectiveArmor = round(armor × (1 − pct/100))`)
  dans `calculateCombatDamage`, sur l'auto-attaque et les skills damage physiques.
- **Contextuel arme** (`physicalAttack` seul) : auto-attaque
  (`CreaturesService.attack`) et skills offensifs weapon-based
  (`SkillCastService.castCreatureSkill`, effectType `damage`, targetMode
  `creature`, `weaponType` non null = arme équipée).

Validation runtime V1 (2026-07-11, formule et niveaux d'alors) : auto-attaque
16 → 18 avec effects `two_handed_sword`, 16 en mismatch `bow` ; skill
`test_strike` 52 → 57 en matching, 52 en mismatch. V2 validée manuellement
(valeur fixe prise en compte, aucun bonus sans épée équipée).

### Not implemented (futur)

Critique, dodge, parry, block, accuracy, attackSpeed, movementSpeed,
résistances, stun, knockback, succès/qualité de craft, récolte. Ces stats sont
volontairement **absentes des targets serveur** (refusées par sanitize,
invisibles dans le Studio) : elles seront ajoutées quand leur hook gameplay
existera (ADR-0020). Les heals et les skills self ne consomment jamais les
effets contextuels d'arme (ils bénéficient en revanche des permanents
`healingPower`/`maxHealth`).

## Limites connues

- Double cumul possible avec `skill.scaling.masteryCoefficients` (un skill
  peut déjà scaler additivement sur un niveau de maîtrise) — mécanismes
  distincts, à surveiller à l'équilibrage.
- Le mapping XP `COMBAT_WEAPON_MASTERY_MAP` (weaponType → mastery key pour
  l'XP de combat) est encore hardcodé dans `CreaturesService` — la relation
  weaponType ↔ mastery est encodée à deux endroits.
- Migrations versionnées (`AddEffectsToMasteryDefinition`,
  `AddWeaponTypeToSkillDefinition`, `StartPlayerMasteryAtLevelZero`) mais
  aucun runner prod ne les exécute — `synchronize: true` crée/ajuste les
  colonnes en dev uniquement (l'UPDATE level 1/xp 0 → 0 est manuel).
- Le module Studio « Maîtrises / Effets » est **livré** : création de
  maîtrise, édition des effets en tableau stat/mode/value, catalogue chargé
  depuis `GET /admin/mastery-effect-targets` (aucune liste frontend en dur) ;
  le Skill Editor expose `skill.weaponType`.
- `effects` n'est pas modifiable via le socket admin — volontaire (validation
  DTO HTTP).

## Références

- ADR-0020 — Mastery Effects as Contextual Server-Side Bonuses (décision).
- ADR-0018 §4–5 (vocabulaire, catégories), ADR-0016 (XP mastery), ADR-0019
  (skills actifs V1).
- STATUS.md — bloc « Masteries V1-D ».
- Code principal :
  - `apps/api-gateway/src/masteries/mastery-effect-targets.ts`
  - `apps/api-gateway/src/masteries/mastery-effects.calculator.ts`
  - `apps/api-gateway/src/masteries/mastery-effects.service.ts`
  - `apps/api-gateway/src/masteries/masteries.service.ts`
  - `apps/api-gateway/src/active-skills/skill-cast.service.ts`
  - `apps/api-gateway/src/creatures/creatures.service.ts`
  - `apps/api-gateway/src/characters/equipped-weapon.helper.ts`
