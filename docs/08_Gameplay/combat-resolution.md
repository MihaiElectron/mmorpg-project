# Contrat de résolution des dégâts combat

## Metadata

- Status: Draft (contrat posé — V4-D0)
- Owner: Project
- Last updated: 2026-07-12
- Depends on: docs/08_Gameplay/masteries.md, STATUS.md
- Used by: Project owner, developers, gameplay designers, conversational assistants, repository-aware coding agents

## Scope

Ce document fige **l'ordre de résolution** d'un hit de combat, AVANT d'ajouter
critique, block, esquive, résistances ou curses. Il décrit un contrat cible :
seule une partie est **implémentée** aujourd'hui (armure, `armorPenetrationPercent`,
`damageType` physical/raw) ; le reste est **Planned** et documenté ici pour que
les ajouts futurs se branchent au bon endroit sans casser l'existant.

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

Ordre **cible** (seul `baseDamage` est actif aujourd'hui ; le reste est Planned) :

```
baseDamage
  + flatDamageModifiers        (futur)
  × percentDamageModifiers      (futur)
  × criticalMultiplier          (futur, si le hit critique)
= attackPowerFinal
```

Règles :

- Le **critique appartient au bloc attaque**, jamais au bloc défense.
- `criticalChancePercent` détermine SI le hit critique ; `criticalDamagePercent`
  détermine le multiplicateur (ex. `criticalDamagePercent = 50` → dégâts × 1.5).
- Tout bonus de dégâts futur (flat/percent) s'applique **ici**, pas dans la défense.

État actuel : `attackPowerFinal` = attaque physique dérivée (auto-attaque) ou
montant de skill calculé serveur. Aucun critique/flat/percent branché encore.

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

## 6. Stats critiques (Planned — non implémenté)

- **`criticalChancePercent`** : chance de critique, clamp 0–100 ; sources
  possibles = stats primaires, équipement, maîtrises, buffs futurs.
- **`criticalDamagePercent`** : bonus de dégâts critiques (ex. `50` → × 1.5) ;
  mêmes sources.

Se branchera dans le **bloc attaque** (étape 2), jamais dans la défense.

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
| Bloc attaque : critique, flat/percent damage | Planned |
| Bloc défense : bonus/malus d'armure, curses | Planned |
| Résistances, block, esquive, dégâts magical/elemental/poison | Planned |

## Références

- `apps/api-gateway/src/creatures/combat-damage.calculator.ts` (calculateur pur).
- `apps/api-gateway/src/characters/character-stats-calculator.ts` (stats finales).
- docs/08_Gameplay/masteries.md (Mastery Effects, `armorPenetrationPercent`).
- STATUS.md (blocs V4-B0 / V4-C / V4-D0).
