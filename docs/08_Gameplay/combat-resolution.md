# Contrat de résolution des dégâts combat

## Metadata

- Status: Draft (contrat posé — V4-D0 ; maj V5-F / V5-G)
- Owner: Project
- Last updated: 2026-07-13
- Depends on: docs/08_Gameplay/masteries.md, STATUS.md
- Used by: Project owner, developers, gameplay designers, conversational assistants, repository-aware coding agents

## Scope

Ce document fige **l'ordre de résolution** d'un hit de combat. Il décrit un
contrat cible : une partie est **implémentée** aujourd'hui (stats finales
serveur, armure + `armorPenetrationPercent`, `damageType` physical/raw,
**critique**, **esquive**, **blocage**) ; le reste (flat/percent damage, curses,
résistances) est **Planned** et documenté ici pour que les ajouts futurs se
branchent au bon endroit sans casser l'existant.

Depuis **V5-F**, les **stats secondaires d'équipement** (esquive, blocage,
critique, précision, pénétration d'armure, etc.) alimentent le pipeline via le
canal de modificateurs dérivés (`DerivedStatModifiers`), au même titre que les
maîtrises — voir `docs/…` (équipement) et le calculateur de stats.

Depuis **V5-G**, **tous** les chemins de hit créature → joueur passent par le
resolver commun (`resolveCombatHit`), y compris l'**auto-attaque passive** de la
créature (auparavant un calcul legacy `max(baseAttack − defense, 1)` qui
ignorait esquive/blocage/critique) — voir la section « Chemins de hit ».

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

## 8. Chemins de hit actuels (Implemented)

Tous les chemins ci-dessous passent par le **même resolver** (`resolveCombatHit`
→ `calculateCombatDamage`). Aucun chemin de dégâts spécial.

| Chemin | Attaquant | Défenseur (stats appliquées) | Parade |
|---|---|---|---|
| Joueur → créature | stats finales joueur (physicalAttack, critique, `armorPenetrationPercent`, accuracy) | créature (`defenseTotal`) — pas d'esquive/blocage créature | — |
| Skill joueur → créature | montant du skill (+ critique/pénétration joueur) | créature (`defenseTotal`) | — |
| Skill créature → joueur | montant du skill + stats avancées créature (critique/accuracy/pénétration) | joueur : `defense`, `dodgeChance`, `blockChance`/`blockReductionPercent` | `canParry: false` |
| **Auto-attaque passive créature → joueur** | `attackPower` créature + stats avancées (critique/accuracy/pénétration) | joueur : `defense`, `dodgeChance`, `blockChance`/`blockReductionPercent` | `canParry: false` |
| Riposte créature → joueur | `attackPower` créature | joueur : `defense`, `dodgeChance`, `blockChance`, **`parryChance`** | `canParry` **selon reach mêlée** (`resolveMeleeWeaponReachWU`) |
| Contre-attaque joueur → créature | `counterAttackPower` joueur (+ critique/pénétration) | créature (`defenseTotal`) | `canParry: false` |

- L'application concrète créature → joueur (résolution + PV + events + mort) est
  centralisée dans `applyCreatureHitToPlayer` (skill damage **et** auto-attaque
  passive l'utilisent). L'auto-attaque passive passe `minimumDamage: 1`
  (préserve le plancher legacy) et `damageType: 'physical'`.
- Cooldown (`AUTO_ATTACK_COOLDOWN_MS`), portée (`MELEE_RANGE_WU`) et priorité
  d'action (heal → skill damage → auto-attaque) **inchangés** par V5-G.
- V5-G réutilise les **stats offensives créature déjà disponibles** (V5-D2) :
  `attackPower`, `criticalChance`, `criticalDamage`, `accuracy`,
  `armorPenetrationPercent`. Le **défenseur joueur** applique ses stats
  défensives : `defense`, `dodgeChance`, `blockChance`, `blockReductionPercent`.

### Parade sur l'auto-attaque passive — hors périmètre

La parade reste **volontairement désactivée** sur l'auto-attaque passive
créature → joueur (comme sur les skills créature) :

- `canParry: false` ;
- `parryChance` du joueur **ignoré** sur ce chemin (jamais `isParried`, jamais de
  contre-attaque déclenchée) ;
- seule la **riposte** (déclenchée quand le joueur attaque une créature en mêlée)
  évalue la parade, via une éligibilité de reach mêlée entrant/sortant.

Activer la parade en défense passive supposerait une règle dédiée de défense
active / reach entrant — **sujet futur séparé**, non décidé ici.

## 9. Invariant — dégâts et PV entiers (Implemented)

Les colonnes `health` (`creature`, `character`) sont **`INTEGER`** en base.
Le pipeline garantit donc :

- `finalDamage` **entier** ;
- `hpAfter` **entier** (arrondi de `hpBefore − finalDamage`, jamais négatif) ;
- **aucun PV fractionnaire n'est jamais persisté**.

Contexte : une valeur d'attaque dérivée fractionnaire (ex. `counterAttackPower`
non entier) produisait auparavant un `hpAfter` fractionnaire → rejet Postgres
(`22P02` sur colonne `INTEGER`) → l'écriture échouait, la créature/le joueur
restait sur une valeur fractionnaire en mémoire et **chaque hit suivant
ré-échouait** (symptômes « créature muette / combat muet »). L'arrondi entier
dans `calculateCombatDamage` (et sur `hpBefore`) supprime la cause et
auto-guérit un état déjà corrompu au hit suivant. Ce n'est **pas** un changement
d'équilibrage (sub-unité), mais l'invariant entier attendu par le schéma.

## 10. Stats de combat créature (Implemented / objectif)

### Stats avancées créature (Implemented — V5-D2)

Les `CreatureTemplate` peuvent porter des stats de combat avancées côté serveur,
en plus des stats de base (`baseHealth`/`baseAttack`/`baseArmor`) :

- `attackPower` / `defenseTotal` (dérivées runtime de `baseAttack`/`baseArmor`) ;
- `healingPower` ;
- `criticalChance` ;
- `criticalDamage` ;
- `accuracy` ;
- `armorPenetrationPercent`.

Ces stats sont **configurées dans le Studio** (Creature Editor) mais
**calculées et appliquées côté serveur** (runtime créature + `resolveCombatHit`).
Le client et le Studio ne calculent jamais les valeurs de combat : le Studio
configure et inspecte, le serveur reste autoritaire.

### Objectif d'architecture (direction)

L'objectif est de **rapprocher progressivement les créatures du modèle de
résolution des joueurs** :

- même resolver combat (`resolveCombatHit`) — déjà le cas pour tous les hits ;
- mêmes notions de stats offensives/défensives **quand elles sont pertinentes** ;
- même contrat **serveur-authoritative** ;
- Studio = configuration / inspection, jamais de calcul gameplay.

### Limites actuelles (à ne pas surinterpréter)

- Les créatures **n'ont pas encore** le modèle complet des joueurs : la symétrie
  des stats n'est **pas** garantie.
- Côté **défense créature**, `dodgeChance` / `blockChance` / `parryChance` sont
  **non supportés / hors périmètre** aujourd'hui (une créature ne peut ni
  esquiver, ni bloquer, ni parer un hit entrant). Les hits joueur → créature
  n'appliquent donc que `defenseTotal` + pénétration.
- La **parade passive du joueur** contre l'auto-attaque créature reste
  **désactivée** (voir §8).
- Aucune promesse que toutes les stats joueur soient déjà symétriques côté
  créature : l'extension se fait au rythme des hooks gameplay réels.

## État d'implémentation

| Élément | État |
|---|---|
| Stats finales serveur (attaque/défense/dérivées/maîtrises/équipement) | Implemented |
| Bloc défense : armure de base + `armorPenetrationPercent` (en dernier) | Implemented |
| `damageType` physical/raw (auto-attaque + skills) | Implemented |
| Bloc attaque : critique (`criticalChance`/`criticalDamage`, auto-attaque + skills) | Implemented |
| Défense : esquive (`dodgeChance`, `accuracy` la réduit), blocage (`blockChance`/`blockReductionPercent`) | Implemented |
| Auto-attaque passive créature → joueur via `resolveCombatHit` (V5-G) | Implemented |
| Stats secondaires d'équipement alimentant le pipeline (V5-F) | Implemented |
| Invariant entier : `finalDamage` / `hpAfter` entiers, aucun PV fractionnaire persisté | Implemented |
| Stats avancées créature (`healingPower`/`criticalChance`/`criticalDamage`/`accuracy`/`armorPenetrationPercent`) configurables Studio, appliquées serveur (V5-D2) | Implemented |
| Défense créature : esquive / blocage / parade (créature défenseur) | Planned (hors périmètre) |
| Parade sur auto-attaque passive (`canParry` en défense passive) | Planned (hors périmètre) |
| Bloc attaque : flat/percent damage modifiers | Planned |
| Bloc défense : bonus/malus d'armure, curses | Planned |
| Résistances, dégâts magical/elemental/poison | Planned |

## Références

- `apps/api-gateway/src/creatures/combat-damage.calculator.ts` (calculateur pur, arrondi entier).
- `apps/api-gateway/src/creatures/combat-hit.resolver.ts` (mapping attaquant/défenseur → hit).
- `apps/api-gateway/src/creatures/creatures.service.ts` (`applyCreatureHitToPlayer`, `doFighting` : skill + auto-attaque passive via resolver).
- `apps/api-gateway/src/characters/character-stats-calculator.ts` (stats finales + modificateurs dérivés équipement/maîtrises).
- docs/08_Gameplay/masteries.md (Mastery Effects, `armorPenetrationPercent`).
- STATUS.md (blocs V4-B0 / V4-C / V4-D0).
