# Contrat de résolution des dégâts combat

## Metadata

- Status: Draft (contrat posé — V4-D0)
- Owner: Project
- Last updated: 2026-07-12
- Depends on: docs/08_Gameplay/masteries.md, STATUS.md
- Used by: Project owner, developers, gameplay designers, conversational assistants, repository-aware coding agents

## Scope

Ce document fige **l'ordre de résolution** d'un hit de combat, AVANT d'ajouter
block, esquive, résistances ou curses. Il décrit un contrat cible : une partie
est **implémentée** aujourd'hui (stats finales serveur, armure +
`armorPenetrationPercent`, `damageType` physical/raw, **critique**) ; le reste
(flat/percent damage, curses, block/esquive/résistances) est **Planned** et
documenté ici pour que les ajouts futurs se branchent au bon endroit sans
casser l'existant.

Règle transverse : **le serveur est autoritaire**. Le client et le Studio ne
calculent jamais les dégâts finaux — ils configurent et affichent.

## Vue d'ensemble des phases

```
1. Stats finales serveur   → toutes les stats du hit sont figées
2. Bloc attaque            → attackPowerFinal (offensif, dont critique futur)
3. Bloc défense            → armorAfterPenetration (défensif, pénétration EN DERNIER)
4/5. Résolution            → physical (attaque − armure) | raw (attaque brute)
```

## 1. Phase — stats finales serveur (Implemented)

Le serveur calcule TOUTES les stats finales avant le hit, via
`CharacterStatsCalculator.compute` (source : `derived-stats` + maîtrises +
équipement) :

- stats primaires ;
- stats dérivées (dont `physicalAttack`, `defense`, `armorPenetrationPercent`) ;
- équipement ;
- maîtrises (Mastery Effects permanents) ;
- buffs — **Planned** ;
- passifs — **Planned**.

Le client et le Studio **ne calculent jamais** les dégâts finaux ni une
éligibilité.

## 2. Bloc attaque — puissance offensive du hit

Ordre **cible** (le **critique est actif** ; flat/percent restent Planned) :

```
baseDamage
  + flatDamageModifiers        (futur)
  × percentDamageModifiers      (futur)
  × criticalMultiplier          (Implemented — si le hit critique)
= attackPowerFinal
```

Règles :

- Le **critique appartient au bloc attaque**, jamais au bloc défense, et
  s'applique **avant** la soustraction d'armure.
- `criticalChance` (stat dérivée, %) détermine SI le hit critique : roll serveur
  `[0, 1)`, critique si `roll < criticalChance / 100` (ex. `25` = 25 %).
- `criticalDamage` (stat dérivée, multiplicateur total en %) détermine le
  multiplicateur (ex. `150` → dégâts × 1.5).
- Tout bonus de dégâts futur (flat/percent) s'appliquera **ici**, pas dans la défense.

Formule (Implemented) :

```
isCritical       = criticalChance > 0 && roll < criticalChance / 100
attackPowerFinal = isCritical ? round(baseDamage × criticalDamage / 100) : baseDamage
```

Exemple :

```
baseDamage = 100 ; criticalDamage = 150 ; hit critique = oui
attackPowerFinal = round(100 × 1.5) = 150
```

RNG **serveur uniquement** (`Math.random` en runtime, injectable pour des tests
déterministes) — le client et le Studio ne décident jamais du critique.
`criticalChance = 0` → jamais de critique (`attackPowerFinal = baseDamage`).
Auto-attaque et skills damage passent tous par ce bloc.

## 3. Bloc défense — armure effective de la cible

Ordre **cible** (seul `baseArmor`/`defenseTotal` est actif ; le reste est Planned) :

```
baseArmor / defenseTotal
  + flatArmorBonuses            (futur)
  - flatArmorReductions         (futur — curses / debuffs)
  × percentArmorModifiers        (futur)
= armorAfterBuffsDebuffs

puis, EN DERNIER seulement :
armorAfterPenetration = armorAfterBuffsDebuffs × (1 - armorPenetrationPercent / 100)
```

### Règle critique : la pénétration s'applique EN DERNIER

`armorPenetrationPercent` **ne modifie pas l'armure globale** de la cible et ne
crée aucun debuff : elle ignore un pourcentage de l'armure **restante** pour ce
hit uniquement, une fois tous les bonus/malus d'armure appliqués.

Exemple (armure 100, curse future −30, pénétration 50 %) :

```
Bon ordre :   100 − 30 = 70   ; 70 × 0.5 = 35   → armure effective 35
Mauvais ordre : 100 × 0.5 = 50 ; 50 − 30 = 20   → 20 (À ÉVITER)
```

État actuel : pas de bonus/malus d'armure → `armorAfterBuffsDebuffs = defenseTotal`,
puis `armorAfterPenetration = round(defenseTotal × (1 − armorPenetrationPercent/100))`
(implémenté dans `calculateCombatDamage`, arrondi entier, jamais négatif).

## 4. Résolution `physical` (Implemented)

```
finalDamage = max(0, attackPowerFinal - armorAfterPenetration)
```

`physical` utilise : bloc attaque + bloc défense + `armorPenetrationPercent`.

## 5. Résolution `raw` (Implemented)

```
finalDamage = attackPowerFinal
```

`raw` ignore : armure, `armorPenetrationPercent`, réductions d'armure futures.

Compatibilité bloc attaque : **par défaut, `raw` ignore le bloc défense mais
reste compatible avec les modificateurs du bloc attaque** (critique / bonus de
dégâts futurs), sauf règle contraire décidée plus tard.

## 6. Stats critiques (Implemented)

- **`criticalChance`** : chance de critique en pourcentage (ex. `25` = 25 %),
  clamp 0–100. Stat dérivée système `implemented` + `masteryEligible`, exposée
  comme Mastery Effect **target permanente** (jamais contextuelle `weaponType`).
- **`criticalDamage`** : multiplicateur critique total en pourcentage (ex. `150`
  → × 1.5), baseValue 150. Même statut (target permanente).

Sources : stats primaires (coefficients), équipement, maîtrises, buffs futurs.
Branchées dans le **bloc attaque** (étape 2), jamais dans la défense.
`contextualStats` reste exactement `['physicalAttack']`.

## 7. Curses / réductions d'armure (Planned — futur séparé)

- `armorReductionFlat` / `armorReductionPercent` : probablement un **debuff
  temporaire sur la cible** (distinct de `armorPenetrationPercent`, propriété de
  l'attaquant/du hit).
- Durée : non décidée. Règles de stack : non décidées.
- Se branchera dans le **bloc défense** AVANT la pénétration (étape 3).
- Hors scope actuel.

## État d'implémentation

| Élément | État |
|---|---|
| Stats finales serveur (attaque/défense/dérivées/maîtrises/équipement) | Implemented |
| Bloc défense : armure de base + `armorPenetrationPercent` (en dernier) | Implemented |
| `damageType` physical/raw (auto-attaque + skills) | Implemented |
| Bloc attaque : critique (`criticalChance`/`criticalDamage`, auto-attaque + skills) | Implemented |
| Bloc attaque : flat/percent damage modifiers | Planned |
| Bloc défense : bonus/malus d'armure, curses | Planned |
| Résistances, block, esquive, dégâts magical/elemental/poison | Planned |

## Références

- `apps/api-gateway/src/creatures/combat-damage.calculator.ts` (calculateur pur).
- `apps/api-gateway/src/characters/character-stats-calculator.ts` (stats finales).
- docs/08_Gameplay/masteries.md (Mastery Effects, `armorPenetrationPercent`).
- STATUS.md (blocs V4-B0 / V4-C / V4-D0).
