# Masteries

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-07-11
- Depends on: docs/01_Architecture/adr/ADR-0020-mastery-contextual-effects.md, docs/01_Architecture/adr/ADR-0018-class-mastery-progression.md, docs/01_Architecture/adr/ADR-0016-skills-rewards-runtime.md, STATUS.md
- Used by: Project owner, developers, gameplay designers, conversational assistants, repository-aware coding agents

## Scope

Ce document décrit l'état réel du système de maîtrises : progression,
prérequis (`requiredMasteries`) et bonus contextuels (`effects`, Masteries
V1-D).

Il ne décrit pas les skills actifs en détail (ADR-0019), ni les classes et
talents (ADR-0018, non implémentés), ni l'XP personnage.

## Définitions

- **Mastery** : progression spécialisée et passive du personnage (arme,
  métier, récolte, social…). Jamais une capacité activable.
- **MasteryDefinition** : définition serveur d'une maîtrise (catalogue) —
  `key` immuable, `name`, `category`, `maxLevel`, `baseXpPerLevel`,
  `xpCurveExponent`, `enabled`, `effects`.
- **PlayerMastery** : progression d'un personnage sur une maîtrise (`level`,
  `xp`). Démarre à level 1. Une maîtrise jamais pratiquée est présentée
  level 1 / xp 0 sans ligne en base.
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

## Bonus contextuels (effects) — Implemented

### Formule

```
bonus = (level − 1) × percentPerLevel
```

- Level 1 (maîtrise jamais pratiquée) → **0 %**.
- Le `damagePercent` total est **clampé à 50 %** côté serveur, quelle que
  soit la configuration ou le nombre de maîtrises matchées.
- Seul **`combat.damagePercentPerLevel`** (borné 0–5 à l'écriture) est
  implémenté aujourd'hui.

### Stockage

- `mastery_definition.effects` — JSONB, `NOT NULL DEFAULT '{}'`.
- `{}` = aucun effet (valeur des maîtrises existantes et par défaut).
- **Écriture stricte** : clés whitelistées, types et bornes validés, rejet 400
  de tout effet non supporté (`sanitizeMasteryEffects`). Aucun effet non
  supporté n'est persisté.
- **Lecture défensive** : une valeur corrompue en base est ignorée ou clampée,
  jamais levée — un catalogue sale ne casse pas un hit.

### Exemple de configuration

```json
{
  "context": { "weaponType": "two_handed_sword" },
  "combat": { "damagePercentPerLevel": 5 }
}
```

Application : maîtrise level 3, `damagePercentPerLevel` 5 →
`bonus = (3 − 1) × 5 = 10 %`.

### Résolution serveur

- **`MasteryEffectsService`** est le point serveur unique de résolution ;
  le calcul est une fonction pure (`computeCombatMasteryEffects`).
- Le **client et le Studio ne calculent jamais** un bonus ni une éligibilité :
  le Studio édite la configuration via l'API admin HTTP, le serveur résout le
  contexte réel (arme équipée via `resolveEquippedWeaponType`, jamais fournie
  par le client).
- Les définitions `enabled` sont servies par un cache mémoire invalidé à
  chaque mutation du catalogue (CRUD HTTP et chemin socket admin).
- Maîtrise `enabled: false`, contexte non matché, effects vide → 0 %.

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

### Implemented

- Auto-attaque (`CreaturesService.attack`).
- Skills offensifs weapon-based (`SkillCastService.castCreatureSkill`,
  effectType `damage`, targetMode `creature`, `weaponType` non null).

Validation runtime (2026-07-11) : auto-attaque 16 → 18 avec effects
`two_handed_sword` (level 3, 5 %/niveau), 16 en mismatch `bow` ; skill
`test_strike` 52 → 57 en matching, 52 avec weaponType seul ou en mismatch.

### Not implemented (futur)

Critique, pénétration, stun, knockback, block, mitigation d'armure, bouclier,
succès de craft, qualité de craft, récolte. Ces clés sont volontairement
**absentes de la whitelist serveur** : elles seront ajoutées quand leur hook
gameplay existera (ADR-0020). Les heals et les skills self ne consomment
jamais les effets d'arme.

## Limites connues

- Double cumul possible avec `skill.scaling.masteryCoefficients` (un skill
  peut déjà scaler additivement sur un niveau de maîtrise) — mécanismes
  distincts, à surveiller à l'équilibrage.
- Le mapping XP `COMBAT_WEAPON_MASTERY_MAP` (weaponType → mastery key pour
  l'XP de combat) est encore hardcodé dans `CreaturesService` — la relation
  weaponType ↔ mastery est encodée à deux endroits.
- Migrations versionnées (`AddEffectsToMasteryDefinition`,
  `AddWeaponTypeToSkillDefinition`) mais aucun runner prod ne les exécute —
  `synchronize: true` crée les colonnes en dev uniquement.
- Le module Studio « Maîtrises / Effets » n'est pas encore implémenté —
  `effects` s'édite via `PATCH /admin/mastery-definitions/:key` ; le Skill
  Editor expose `skill.weaponType`.
- `effects` n'est pas modifiable via le socket admin — volontaire (validation
  DTO HTTP).

## Références

- ADR-0020 — Mastery Effects as Contextual Server-Side Bonuses (décision).
- ADR-0018 §4–5 (vocabulaire, catégories), ADR-0016 (XP mastery), ADR-0019
  (skills actifs V1).
- STATUS.md — bloc « Masteries V1-D ».
- Code principal :
  - `apps/api-gateway/src/masteries/mastery-effects.calculator.ts`
  - `apps/api-gateway/src/masteries/mastery-effects.service.ts`
  - `apps/api-gateway/src/masteries/masteries.service.ts`
  - `apps/api-gateway/src/active-skills/skill-cast.service.ts`
  - `apps/api-gateway/src/creatures/creatures.service.ts`
  - `apps/api-gateway/src/characters/equipped-weapon.helper.ts`
