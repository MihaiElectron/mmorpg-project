# Contrat de résolution des dégâts combat

## Metadata

- Status: Draft (contrat posé — V4-D0 ; maj V5-F / V5-G ; contrat V6-B ; défenses créature V6-B3→V6-B6, contre-attaque V6-B7 et flags défensifs par skill Implemented ; PV max dérivé créature Lot 2 / ADR-0021 Implemented, §11.9 ; effets périodiques/immunités/lifecycle cadrés Planned, §12 / ADR-0022)
- Owner: Project
- Last updated: 2026-07-17 (référence ADR-0022 — écoles magiques / résistances / immunités ; §12 effets périodiques, immunités multi-sources, lifecycle & attribution — cadrage Planned)
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

## 11. Contrat V6-B — modèle de combat créature (défenses livrées V6-B3→V6-B6)

Cette section **fige la direction cible** du modèle de combat créature. Le **socle
défensif** (primaires, secondaires dérivées, esquive/blocage/parade créature,
typage de nature d'attaque) est désormais **Implemented** (V6-B1→V6-B6, détail
§11.7). Le **PV max dérivé** (`maxHealthDerived`) est désormais **Implemented**
(Lot 2, ADR-0021 — voir §11.9). Les points restants (`counterAttackPower` actif,
résistances/boucliers magiques) restent **Planned**.

### 11.1 État actuel (exact — mis à jour V6-B6)

- Quand une créature **attaque**, elle passe par `resolveCombatHit` (auto-attaque
  passive, skill, riposte) — comme le joueur (§8).
- Quand une créature **défend** (joueur → créature, skill joueur → créature,
  contre-attaque), le bloc `defender` applique désormais **`defenseTotal`**
  (+ `armorPenetrationPercent` attaquant) **ET** les secondaires défensives
  dérivées : **parade** puis **esquive** puis **blocage** (détail §11.7).
- `canDodge` = `dodgeChance > 0`, `canBlock` = `blockChance > 0 && blockReductionPercent > 0`,
  `canParry` = `parryChance > 0` (`CreatureRuntimeCalculator.resolveCombatStats`,
  exposé par l'inspector). **Ne sont plus figés à `false`.**
- Les créatures ont **10 stats primaires** (V6-B1) et leurs **secondaires dérivées**
  (V6-B2, coefficients configurables Studio V6-B2.5). Les stats avancées offensives
  existent depuis V5-D2 (`criticalChance`/`criticalDamage`/`accuracy`/
  `armorPenetrationPercent`/`healingPower`).
- Les **skills créature** existent via `CreatureTemplateSkill` + catalogue skills.
- La **parade passive du joueur** contre l'auto-attaque créature reste
  **désactivée** (`canParry: false` dans `applyCreatureHitToPlayer`, §8) — inchangé
  (V6-B6 active la parade **créature défenseur**, pas la parade passive joueur).

### 11.2 Décision cible (produit)

**Objectif** : rapprocher le modèle de combat créature de celui du joueur. À terme,
les créatures auront :

- leurs **propres skills** configurables (extension du modèle de capacités existant) ;
- des **stats primaires** créature ;
- des **stats secondaires** créature (dérivées des primaires) ;
- des **stats défensives** créature futures :
  - `dodgeChance` ;
  - `blockChance` ;
  - `blockReductionPercent` ;
  - `parryChance` ;
  - éventuellement `counterAttackPower` (si validé plus tard).

**Invariants** :
- Réutiliser le **même pipeline** `resolveCombatHit` (mapping défenseur créature ↔
  défenseur joueur) — pas de chemin de dégâts parallèle.
- Le **serveur reste seul responsable** des calculs gameplay ; le client ne calcule
  jamais ces valeurs.
- Le **Studio** permet de **configurer et inspecter** ces skills/stats — jamais de calcul.
- Point d'insertion : le bloc `defender` fourni à `resolveCombatHit` pour les hits
  **joueur → créature** (aujourd'hui `{ defense: defenseTotal, dodgeChancePercent: 0 }`),
  alimenté par `resolveCombatStats` (aujourd'hui `canDodge/canBlock/canParry: false`).

### 11.3 Questions ouvertes (le « comment », pas le « si »)

La décision d'AVOIR ces stats est prise (§11.2). Restent à trancher les modalités :

1. **Stockage** : colonnes `CreatureTemplate`, un champ JSON de stats, ou un
   **catalogue** type `DerivedStatDefinition` (comme le joueur) ? Impacte migrations,
   Studio et le canal RuntimeModifier.
2. **Dérivation** : comment calculer les **secondaires à partir des primaires**
   créature (coefficients façon joueur ? table propre aux créatures ?).
3. **Formules** : quelles formules pour dodge/block/parry créature (réutiliser
   `calculateCombatDamage`/`resolveCombatHit` tel quel, en alimentant le `defender`).
4. **Limites / caps** : quels clamps appliquer (ex. cap d'esquive/blocage/parade)
   pour éviter l'invulnérabilité.
5. **Équilibrage** : comment équilibrer dodge/block/parry côté créature (par famille
   de créature ? par niveau ?).
6. **Conditions de parade** : arme, type d'attaque entrant, reach — sachant que les
   créatures **n'ont pas d'équipement** : quelle règle d'éligibilité ?
7. **Types d'attaque** : faut-il introduire `melee` / `ranged` / `magic` **avant** la
   parade (la parade a du sens surtout en mêlée) ?
8. **Studio** : comment exposer proprement skills + primaires + secondaires +
   défenses créature (édition/inspection) sans surcharger l'UI ?

> Règle transverse : aucune de ces modalités ne doit introduire un **client**
> calculant une défense/stat, ni un chemin de dégâts spécial hors `resolveCombatHit`.

### 11.4 Séquence prudente proposée (petits lots)

- **V6-B1 — modèle de stats PRIMAIRES créature** : **Implemented** — 10 primaires
  (stockage, Studio config/inspection) ; aucun effet combat tant que non dérivé.
- **V6-B2 — stats SECONDAIRES créature dérivées** : **Implemented** — dérivation
  primaires → secondaires ; coefficients configurables Studio (V6-B2.5) ; inspection.
- **V6-B3 — esquive créature défenseur** (`dodgeChance`) : **Implemented** — branchée
  dans le `defender` de `resolveCombatHit` (hits joueur → créature), `canDodge` = `dodgeChance > 0`,
  esquive effective `clamp(dodgeChance − accuracy, 0, 100)` ; tests symétriques aux tests joueur.
- **V6-B4 — blocage créature défenseur** (`blockChance` / `blockReductionPercent`) :
  **Implemented** — `canBlock` = `blockChance > 0 && blockReductionPercent > 0`, blocage
  `physical` uniquement après l'armure, `raw` non bloqué, esquive prioritaire.
- **V6-B5 — nature défensive de l'attaque** : **Implemented** — `SkillDefinition.attackDefenseKind`
  (`physical`/`magic`, défaut physical), helper pur `isAttackParryable`, Studio Skills
  « Nature défensive ». Contrat fonctionnel figé §11.6.
- **V6-B6 — parade créature défenseur** (`parryChance`) : **Implemented** — gate
  `creatureStats.canParry && isAttackParryable({ attackDefenseKind, damageType })`,
  `parryChancePercent` passé au `defender` ; `isParried` propagé (hit principal + skills).
  La **parade passive joueur** reste hors périmètre (§8).

Chaque lot : périmètre unique, branché via `resolveCombatStats` / le `defender` de
`resolveCombatHit`, sans changer les formules du calculateur pur, avec tests de
non-régression + tests de la nouvelle capacité.

### 11.5 Hors périmètre de CE document

Ce contrat **ne code rien** : pas de skills/primaires/secondaires créature, pas
d'esquive/blocage/parade créature, pas de nouvelle migration, pas de nouvelle stat
DB, pas de changement de formule, pas de changement d'IA, pas de changement
frontend obligatoire, aucune activation immédiate de dodge/block/parry. Il fixe
uniquement la **direction produit** et les points d'insertion. **Documentation
seulement.**

### 11.6 Contrat de parade — nature d'attaque, ranged, magie, enchantements

**Statut : Implemented (V6-B5/V6-B6)** pour la parabilité pilotée par la **nature
défensive** (`physical` parable — même `damageType: raw` — / `magic` non parable)
et la parade créature (`isAttackParryable` aligné, commit `d81ea80`).
**Planned** : le **modèle hybride physical + raw parallèle** (§11.7) et le pipeline
défensif magique (résistances/écoles/boucliers), enchantements/procs. Cette section
**fige le contrat fonctionnel** de la parade et reste la référence. **`raw` n'est PAS
une nature défensive : il n'empêche jamais la parade ni l'esquive.**

#### 11.6.1 Ce que la parade pare

La parade s'applique aux **attaques physiques**, quelle que soit la **portée** :

- attaque physique de **mêlée** — parable ;
- attaque physique à **distance** (projectile physique : flèche, carreau, lame de
  lancer) — **parable**.

> **Règle « ranged physique parable ».** Une attaque à distance n'est **pas**
> automatiquement non parable. Ce qui décide de la parabilité n'est **pas la
> portée** (melee/ranged) mais la **nature défensive** de l'attaque : un
> projectile **physique** peut être paré ; seul un **sort magique pur** ne l'est
> pas (§11.6.2).

#### 11.6.2 Ce que la parade NE pare pas — le sort magique pur

Un **sort magique pur** :

- **ignore complètement** le calcul de parade (jamais `isParried`) ;
- ne peut **pas** être paré par une arme ;
- relève d'un **pipeline défensif distinct**, à traiter plus tard :
  - résistance magique générale ;
  - résistance de l'**école magique** correspondante ;
  - futurs **boucliers magiques / divins / paladin** ;
  - autres défenses spécialisées.

> **Règle « sort magique pur non parable ».** Une arme ne pare jamais un sort
> magique pur. La parade et les défenses magiques sont deux pipelines séparés.

#### 11.6.3 Attaque physique enchantée — l'enchantement suit l'impact

Une attaque physique (mêlée **ou** ranged) peut porter un **enchantement magique**
attaché (proc de feu, dégât magique additionnel, poison magique, etc.). Cet effet
est **dépendant de l'impact physique** :

- si l'attaque physique **touche** → l'impact physique s'applique, **puis**
  l'enchantement attaché s'applique ;
- si l'attaque physique est **parée** → l'impact physique est **annulé** **et**
  l'enchantement magique attaché **ne s'applique pas**.

> **Règle « enchantement annulé si support physique paré ».** Parer le support
> physique annule **tout** ce qui dépend de cet impact — y compris l'enchantement
> magique porté. Vaut identiquement pour mêlée enchantée et ranged enchanté.
>
> Distinction clé : un **enchantement porté par une attaque physique** dépend de
> l'impact (donc annulable par parade) ; un **sort magique pur** est une attaque
> magique autonome (non parable, §11.6.2). Ce n'est pas la présence de magie qui
> décide, mais **le support** qui la transporte.

#### 11.6.4 Séparation conceptuelle (3 axes indépendants)

Trois notions **distinctes**, à ne pas confondre dans le futur modèle :

1. **Portée** : `melee` / `ranged` — *où* l'attaque atteint sa cible. N'influence
   **pas** seule la parabilité.
2. **Nature défensive** : `physical weapon` / `physical projectile` / `magic spell`
   (pur) / futures `divine` / etc. — *contre quel pipeline défensif* l'attaque est
   résolue. **C'est cet axe qui décide de la parabilité** (physique ⇒ parable ;
   magie pure ⇒ non parable).
3. **Effets attachés** : enchantement, poison, proc magique, saignement… — *quoi
   d'autre* s'applique **après** un impact réussi. Dépendent de l'impact du support.

#### 11.6.5 Ordre conceptuel de résolution (futur)

1. La **parade** est évaluée **avant** les effets attachés, sur les attaques de
   nature **physique** (mêlée ou ranged).
2. Si la **parade réussit** : l'impact physique est annulé ; **tous les effets
   attachés dépendants de cet impact** (enchantement magique, poison, proc…) **ne
   s'appliquent pas**.
3. Les **sorts magiques purs** ne passent **jamais** par ce point : ils suivent un
   **pipeline défensif magique** distinct (résistances / boucliers magiques),
   spécifié ultérieurement.

> Cohérence avec l'ordre actuel du calculateur (`calculateCombatDamage`) : parade
> → esquive → critique → armure → blocage. La parade reste la **première** barrière
> défensive ; ce contrat précise seulement **quelles attaques** y sont éligibles
> (physique, toute portée) et **ce qui tombe avec elle** (effets attachés à l'impact).

### 11.7 Défenses créature défenseur — Implemented (V6-B3→V6-B6)

Socle défensif créature livré. Les créatures défenseurs (hits **joueur → créature** :
auto-attaque, skill, contre-attaque) appliquent, via le `defender` de
`resolveCombatHit`, l'ordre du calculateur **parade → esquive → critique → armure →
blocage** (inchangé). Aucune modification de `calculateCombatDamage` ni de
`resolveCombatHit`.

**Esquive (V6-B3)**
- Active quand `dodgeChance > 0` (`canDodge`).
- Esquive effective **réduite par l'`accuracy` de l'attaquant** :
  `clamp(dodgeChance − accuracy, 0, 100)`.
- Ordre : **après la parade**, **avant** critique/armure/blocage. Esquivé → dégâts 0.

**Blocage (V6-B4)**
- Actif quand `blockChance > 0` **et** `blockReductionPercent > 0` (`canBlock`).
- **`physical` uniquement** ; **`raw` ignore le blocage**.
- Appliqué **après l'armure**, sur les dégâts restants ;
  `finalDamage = round(dmg × (1 − blockReductionPercent/100))`.
- **L'esquive reste prioritaire** sur le blocage.

**Parade (V6-B6)**
- Active quand `parryChance > 0` (`canParry`) **et** l'attaque est **parable**.
- **La parabilité dépend UNIQUEMENT de `attackDefenseKind`** (jamais de `damageType`) :
  - `attackDefenseKind: physical` → **parable**, **même si `damageType: raw`** ;
  - `attackDefenseKind: magic` → **non parable** (sort pur, §11.6.2) ;
  - la **portée** (melee/ranged) ne change **jamais** la parabilité.
- `raw` **n'empêche pas** la parade : `raw` est une règle de **mitigation** (voir
  « Typage d'attaque »), pas une nature défensive.
- **Prioritaire sur esquive, critique, armure, blocage** (résolue en premier).
- Parée → **dégâts 0** (physique **et** part `raw` éventuelle), et **aucun effet
  attaché dépendant de l'impact** (procs : quand ils existeront).
- `isParried` propagé jusqu'au client (`COMBAT_EVENT`, hit principal + skills) →
  affichage « Parade ».

**Typage d'attaque (V6-B5) — deux axes indépendants**
- **`attackDefenseKind`** = **nature défensive** (`physical` / `magic`) → **seul axe
  décidant la parabilité** (`physical` parable, `magic` non parable). La portée
  n'entre jamais en jeu : « ranged » ne veut **pas** dire « non parable ».
- **`damageType`** = **mitigation des dégâts** (`physical` / `raw`). `raw` = *true
  damage* : **quand l'attaque touche**, les dégâts `raw` **ignorent l'armure, les
  résistances aux dégâts et le blocage**. `raw` **n'a aucun effet** sur la parade ni
  sur l'esquive : une attaque `physical`+`raw` peut être **parée ou esquivée**
  (auquel cas **rien** ne s'applique).
- **Ne pas confondre les deux axes.** `physical`/`magic` = *contre quoi on se
  défend* ; `physical`/`raw` = *comment les dégâts sont mitigés une fois qu'ils
  touchent*.
- `SkillDefinition.attackDefenseKind` éditable au Studio Skills (« Nature défensive »).

**Cas hybride `physical` (nature) + `raw` (mitigation) — modèle cible (Planned)**
- **Parée** → aucune partie ne s'applique.
- **Esquivée** → aucune partie ne s'applique.
- **Touche et bloquée** → la **part physique** est calculée avec armure + blocage ;
  la **part `raw`** s'applique **en parallèle** comme dégât fixe **non réduit**.
- **Touche sans blocage** → la part physique suit son calcul normal ; la part `raw`
  s'**ajoute** comme dégât fixe.
- **État code (Implemented)** : la **parabilité** est alignée sur ce contrat
  (`isAttackParryable` décide par `attackDefenseKind` seul — `physical` parable même
  en `raw`, `magic` non parable ; commit `d81ea80`).
- **Reste Planned** : la **structure hybride** en deux parts. Le code modélise
  aujourd'hui `damageType` comme un **enum unique** `physical | raw` (une attaque est
  soit entièrement physique, soit entièrement `raw`), **sans part `raw` parallèle** à
  une part physique. Le modèle « part physique mitigée + part `raw` fixe simultanées »
  ci-dessus est le **contrat cible** ; son implémentation (multi-composants) n'est pas
  encore faite.

**Inspector runtime créature** : Esquive / Blocage / Parade affichés Active(X %)/Inactive
selon `canDodge`/`canBlock`/`canParry`.

**Restent informatifs (non actifs)** : `counterAttackPower` créature (exposé par
l'inspector, sans effet runtime — activation non décidée). Le **PV max dérivé**
n'est plus informatif : il est **actif** (Lot 2, §11.9).

**Encore Planned** : résistances magiques, boucliers magiques/divins/paladin,
enchantements/procs (pipeline défensif magique distinct, §11.6.2/§11.6.5). Le
**cadrage** des écoles magiques (`magicSchool`), des résistances par école +
globale, de la mitigation magique (linéaire %, sans clamp), des immunités (école /
magique / invulnérabilité totale) et de la non-pénétration magique est **figé en
Draft/Proposed dans ADR-0022** (`docs/01_Architecture/adr/ADR-0022-magic-schools-resistances-and-immunities.md`) —
aucune implémentation. Point non tranché : **minimum de 1 par composante ou sur le
total** pour une attaque hybride (question ouverte ADR-0022, cohérente avec le
statut Planned du modèle hybride §11.7).

### 11.9 PV max dérivé créature — Implemented (Lot 2, ADR-0021)

Les PV maximum EFFECTIFS d'une créature sont résolus par le **pipeline générique
de résolution des statistiques** (`RuntimeComputeEngine.resolveStat`, Lot 1), via
le point unique `CreatureRuntimeCalculator.resolveMaxHealth` :

```text
base          = template.baseHealth  (socle configuré, jamais modifié)
contribution  = vitality × maxHealthPerVitality  (flat, tags derived/vitality/health)
cap minimum   = 1
arrondi       = floor (une seule fois, après cap)
→ maxHealth autoritaire (serveur)
```

- **`baseHealth`** reste le **socle configuré** du template ; la **Vitalité**
  devient une **contribution traçable**. **`maxHealth`** est la **valeur finale
  autoritaire** — `maxHealthDerived` n'est plus qu'un **alias** de `maxHealth`
  (plus de seconde notion concurrente de PV max).
- **Tous** les chemins lisent cette valeur : spawn, seed d'instance, boot serveur,
  respawn (auto/force-respawn/redémarrage), soin (clamp), modification admin
  (clamp serveur), seuil de fuite (garde anti-division par zéro), difficulté.
- **Baisse du max** (baseHealth/Vitalité modifiés) → PV courants **clampés**
  immédiatement (`refreshTemplateInMemory`) et au redémarrage. **Hausse** → PV
  courants **inchangés** (jamais de soin automatique).
- **DTO/réseau** : `maxHealth`, `runtimeStats.maxHp` et `CreatureCombatStats.maxHealth`
  portent la **même** valeur finale. Le **client et le Studio ne recalculent
  jamais** les PV max — ils affichent la valeur serveur.
- **Trace Studio (Lot 3)** : `getRuntimeCombatInfo`
  (`GET /admin/creatures/:id/runtime-combat`, admin-guardé) expose
  `maxHealthTrace` — sérialisation du **même `StatResolutionResult` mémoïsé** que
  la valeur autoritaire (jamais un recalcul séparé) : socle `baseValue`
  (= `baseHealth`), contexte (`vitality`, `maxHealthPerVitality`), contributions
  **appliquées** et **filtrées**, `afterFlat/afterPercentAdd/afterPercentMultiply/
  afterOverride`, `beforeCaps`, `caps` (min 1 / max), `afterCaps`, `roundingPolicy`
  (`floor`), `overrideApplied`, `finalValue`. Le Studio (`CreatureRuntimeInspector`)
  **affiche** ces valeurs (helper pur `creatureMaxHealthTrace`, aucun recalcul de
  formule) et ne présente plus `maxHealthDerived` comme une statistique
  indépendante (alias déprécié = `maxHealth`). Valeur et trace sont **invalidées
  ensemble** (même snapshot). Filtres/buffs/équipement encore non branchés.
- **Snapshot mémoïsé (pas de recalcul par tick)** : le résultat COMPLET de
  `resolveStat` (`StatResolutionResult`) est **mémoïsé par `templateKey`** dans
  `CreaturesService` (étend le mécanisme per-template `combatAbilityCache`). Le pipeline n'est reconstruit **qu'au premier
  accès ou après invalidation** — le tick IA de fuite, le DTO broadcast, les hits
  combat et les soins lisent le snapshot. Le combat reçoit la valeur mémoïsée
  (`resolveCombatStats(..., precomputedMaxHealth)`), il ne la recalcule pas.
  **Granularité par template justifiée** : les sources (`baseHealth`, `vitality`,
  coefficient `maxHealthPerVitality`) sont strictement communes à toutes les
  instances (les debug modifiers ne sont pas branchés sur le PV max). Le
  coefficient `maxHealthPerVitality` est **global** (une config pour tous les
  templates). Quand des effets per-instance (buffs, Lot 5) impacteront le PV max,
  la granularité passera par instance.
- **Invalidation** : `invalidateMaxHealthCache(templateKey?)` — appelée sur édition
  de template (`refreshTemplateInMemory`, `invalidateAbilitiesCache`, qui changent
  `baseHealth`/`vitality`). **Édition Studio du coefficient global
  `maxHealthPerVitality`** (`PATCH /admin/creatures/secondary-coefficients`,
  admin-guardé) → `AdminService` déclenche
  `CreaturesService.recalculateAllMaxHealthAfterCoefficientChange()` **uniquement
  si ce coefficient change** : invalidation globale du snapshot, recalcul de
  toutes les créatures vivantes, **clamp des PV en cas de baisse** (persisté),
  **PV inchangés en cas de hausse** (jamais de soin), **diffusion `creature_update`**
  pour tout max modifié (DTO = nouveau max ; aucune émission si max inchangé,
  ex. Vitalité 0). Les créatures **mortes** sont ignorées (jamais ressuscitées,
  `respawnAt` intact ; prochain respawn au nouveau max). Serveur autoritaire : le
  client n'envoie qu'une valeur de configuration validée (type/finitude/bornes
  DTO), jamais le `maxHealth` calculé. Au redémarrage, le snapshot se reconstruit
  depuis les données persistées (aucune colonne ajoutée) et les PV persistés
  supérieurs au max sont clampés.
- **Non branché en V1** : filtres, buffs/debuffs, équipement créature (contributions
  futures qui s'ajouteront au même `resolveStat`). Le **pipeline joueur n'est PAS
  migré** (reste `CharacterStatsCalculator`).
- **Debug modifiers `maxHp`** : **n'affectent pas** le PV max autoritaire (une
  seule valeur ; le respawn/soin/clamp/barre client sont désormais cohérents).
  L'inspection DevTools d'un modifier `maxHp` reste servie par le snapshot dédié
  **`CreatureRuntimeService.getRuntimeSnapshot`** (inchangé) — ce n'était donc pas
  une régression mais la suppression d'un artefact d'inspection incohérent (la
  barre bougeait alors que le max réel ne bougeait pas).
- **Compatibilité** : Vitalité 0 (seeds turkey/goblin) → `maxHealth = baseHealth`
  (no-op). Aucune migration de schéma ni de contenu.

### 11.8 Flags défensifs par skill — Implemented (Lot A/B/C)

Chaque `SkillDefinition` porte **3 flags serveur** qui décident si le défenseur
(créature) peut esquiver / bloquer / parer **ce skill précis**. Commits :
`08e498a` (modèle + migration + DTO), `f84f04d` (pipeline combat), `74ca25e` (Studio).

**Décision gameplay** : les skills ne sont **pas parables par défaut** — la parade
**annule** le hit (0 dégât, pas de réduction) et peut déclencher une contre-attaque ;
la rendre systématique nuirait à l'impact (visuel/sonore) des skills et à la lisibilité.
La parade d'un skill est donc **opt-in**. Esquive et blocage restent **actifs par
défaut** pour les skills de dégâts. Les **soins** ne sont pas concernés.

| Flag | Défaut | Effet si `false` |
|---|---|---|
| `canBeDodged` | **true** | le skill ne peut **pas** être esquivé (`dodgeChancePercent → 0`) |
| `canBeBlocked` | **true** | le skill ne peut **pas** être bloqué (`blockChancePercent → 0`) |
| `canBeParried` | **false** | le skill ne peut **pas** être paré (`canParry → false`) |

**Règle de parabilité effective d'un skill** (defender de `applySkillDamage`) :
```
canParry = canBeParried
           && creatureStats.canParry            (parryChance créature > 0)
           && isAttackParryable({ attackDefenseKind, damageType })
```
- `canBeParried: false` → **jamais paré**, même `physical`.
- `canBeParried: true` → parade soumise à la **nature** : `physical` parable ; `magic`
  **non parable** ; `raw` ne change **pas** la parabilité (c'est une mitigation).
- **`physical` + `raw`** : parable **seulement si `canBeParried: true`**, non parable
  si `false` ; `raw` reste une règle de **mitigation** quand l'attaque touche (ignore
  armure/résistances/blocage), sans effet sur parade/esquive.

**Contre-attaque créature sur skill** (`creatureCounterAttack`) : déclenchée
**uniquement si le skill est réellement paré** (`damageResult.isParried === true`).
Donc **jamais** sur esquive, **jamais** sur blocage, **jamais** sur skill non parable
(`canBeParried: false`), **jamais** sur `magic`. Gatée aussi par `counterAttackPower > 0`.

**Serveur autoritaire** : les 3 flags sont lus depuis le `SkillDefinition` **en base**
(`SkillCastService`). Le payload runtime `skill:cast` **ne peut pas** les fournir ni
les override (`parseSkillCastPayload` strict) ; ils ne se configurent que via l'**admin
Studio** (Skill Editor, désactivés pour les soins). `applySkillDamage` applique des
defaults sûrs (dodge/block true, parry false) si appelé sans flags.

**Encore Planned** : modèle hybride `physical` + `raw` parallèle (§11.7), résistances
magiques, boucliers magiques/divins/paladin, équilibrage fin des valeurs.

## 12. Effets périodiques (DoT), immunités multi-sources, lifecycle & attribution — Planned (ADR-0022)

**Statut : `Planned` — cadrage opérationnel uniquement.** Aucun DoT runtime, poison,
bleed, `stackingGroup`, immunité multi-sources, déconnexion différée, timer d'effet,
`healingDone`/`healingReceived` ni attribution différée n'est implémenté. Les
décisions **durables** (écoles, résistances, immunités, non-pénétration, soins) sont
figées dans **ADR-0022** ; cette section porte les **règles opérationnelles** du
moteur temporel. Serveur autoritaire : le client n'affiche que les événements reçus.

### 12.1 Minimum de dégâts sur une attaque hybride (décidé)

Chaque composante non annulée est mitigée séparément — `physical` → armure ;
`magic` → résistance de la `magicSchool` + contributions `magicResistanceGlobal` ;
`raw` → aucune mitigation — puis **additionnée**, le **total arrondi** (invariant
entier §9), et le **minimum de 1 appliqué UNE seule fois au total** (jamais par
composante). Exemple : `physical 0,3 + magic 0,2 + raw 0` = `0,5` → **1**. Résultat
**0** si : esquive, parade, attaque annulée, invulnérabilité totale, **toutes** les
composantes dommageables immunisées, ou aucune composante avec dégâts initiaux > 0.
Le modèle multi-composantes reste `Planned` (§11.7).

### 12.2 Modificateurs de soins `healingDone` / `healingReceived` (décidé)

```text
finalHeal = max(0, floor(
  calculatedHeal × (1 + healingDone/100) × (1 + healingReceived/100)
))
```

`healingDone` = modificateurs du **lanceur** (soins produits) ; `healingReceived` =
modificateurs de la **cible** (soins reçus). `0` = neutre ×1 ; contributions d'une
même famille **additionnées** avant leur multiplicateur ; les deux familles
**multipliées entre elles** ; anti-heal total → **0** soin ; un soin négatif ne
devient **jamais** un dégât ; **aucune résistance magique** n'intervient sur un soin ;
la `magicSchool` d'un soin est une **classification**, pas une mitigation. Stacking :
§12.7. (ADR-0022 §13.)

### 12.3 Poison & bleed — catégories

- **Poison** : `damageType = magic`, `magicSchool = poison`. Chaque tick utilise les
  défenses **actuelles** de la cible : `magicResistancePoison + magicResistanceGlobal
  + buffs/debuffs actuels`. Annulable par immunité **poison**, **magique** ou
  **totale**.
- **Bleed** : `damageType = raw`, `magicSchool = null`. Ignore armure, résistances
  magiques et **immunité magique** ; annulable seulement par **invulnérabilité
  totale** ; **minimum 1 par tick valide** ; une future immunité spécifique au bleed
  reste possible (hors périmètre, §Open questions ADR-0022).

### 12.4 Application initiale d'un DoT

Le DoT n'est appliqué **que si l'impact initial est pleinement validé** :

```text
esquive / parade                → aucun dégât, aucun DoT
blocage                         → dégâts directs réduits, AUCUN DoT
invulnérabilité totale          → aucun dégât, aucun DoT
immunité correspondant au DoT   → aucun DoT
impact normal                   → dégâts directs éventuels + DoT appliqué
```

Une fois appliqué, le DoT **ne dépend plus** des jets défensifs de l'impact initial.

### 12.5 Ticks d'un DoT actif

Les ticks : **ne peuvent pas** être esquivés, parés ni bloqués ; **ne critiquent
jamais** ; **relisent** les défenses/résistances/vulnérabilités/immunités **actuelles
de la cible** ; **ne relisent pas** les stats offensives actuelles du lanceur
(snapshot, §12.6). Chaque tick valide avec dégâts initiaux > 0 inflige **au minimum
1**. Résultat **0** uniquement si : immunité correspondante, invulnérabilité totale,
effet expiré, effet dissipé, ou tick configuré à `0`.

### 12.6 Snapshot offensif du DoT

À l'**application** : la puissance offensive, les coefficients offensifs et bonus
pertinents du lanceur, et l'**identité de la source** sont **figés**. À chaque
**tick** : on utilise ce snapshot offensif et on **relit uniquement l'état défensif
courant de la cible**. Conséquences : un buff/debuff **ultérieur** du lanceur, un
changement d'équipement, la **mort** ou la **déconnexion** du lanceur → **aucun
effet** sur le DoT actif. Une **réapplication** produit un **nouveau** snapshot
offensif.

### 12.7 Cadence des ticks

À l'application : **aucun tick immédiat** ; le 1er tick arrive après un **intervalle
complet**. Ex. `durée 6 s, intervalle 2 s` → ticks à `t=2, 4, 6`. Nombre de ticks
**déterministe** ; **aucun tick partiel** ; `duration < tickInterval` → aucun tick ;
une dissipation avant le prochain intervalle **empêche** le tick. Les dégâts
**immédiats** du skill sont une composante **différente** du DoT.

### 12.8 Réapplication par le même lanceur

Même effet + même lanceur → **durée renouvelée** à sa valeur complète, **snapshot
offensif remplacé**, **cadence conservée**, **aucun tick immédiat supplémentaire**.
Ex. un poison qui doit tick dans `0,5 s`, réappliqué → durée renouvelée, puissance
remplacée, prochain tick toujours dans `0,5 s`, **aucun tick bonus**.

### 12.9 Immunité acquise après application

```text
DoT actif + immunité acquise → effet conservé, ticks ANNULÉS, durée continue de s'écouler
immunité expire avant le DoT → ticks reprennent à la cadence normale
                               aucun tick manqué rattrapé, aucun dégât rétroactif
```

La **suppression complète** exige une action distincte : dispel, antidote, purge,
soin de blessure, mort/disparition (§12.11/§12.14).

### 12.10 Stacking (`stackingGroup`)

Chaque effet statistique déclare `stackingGroup` et `priority`. Règles :
même `effectDefinition` + même lanceur → **rafraîchissement** (contrat de l'effet) ;
**même `stackingGroup`** → **une seule contribution active** ; `stackingGroup`
différents → **cumul autorisé**. Sélection de l'actif d'un groupe : **priorité la
plus élevée**, puis **application la plus ancienne**. Les effets **neutralisés**
restent présents, poursuivent leur durée, restent traçables, et **redeviennent
actifs** si l'effet prioritaire disparaît. Le stacking se base sur `stackingGroup`,
**pas** uniquement sur la statistique modifiée. **DoT de lanceurs différents** →
**instances indépendantes** (sources/snapshots/durées/ticks distincts).

### 12.11 Dispel

Chaque effet pourra déclarer `isDispellable: true|false` et
`dispelCategory: magic|poison|bleed|curse|none`. En V1 : une dissipation réussie
**retire l'effet complet** (dispel magique, antidote, soin de blessure, purification).
Le Bouclier sacré pourra être dispellable ou non selon sa définition. Règles fines
de dispel offensif/défensif : `Open questions` (ADR-0022).

### 12.12 Redémarrage serveur

En V1 : un redémarrage **supprime tous les effets temporaires en mémoire** (buffs,
debuffs, poison, bleed, immunités temporaires). **Aucune persistance PostgreSQL** des
effets temporaires en V1 (non présenté comme impossibilité future).

### 12.13 Déconnexion / reconnexion

- **Lanceur d'un DoT déconnecté** → le DoT déjà appliqué **continue** (snapshot
  offensif et **attribution** conservés) ; la présence du lanceur n'est plus requise.
- **Receveur déconnecté** → **personnage maintenu dans le monde 30 s** (même règle
  en/hors combat, avec ou sans DoT) : reste **ciblable**, reçoit dégâts directs et
  **ticks de DoT**, peut **mourir**, conserve buffs/debuffs/états, suit le lifecycle
  normal de mort. Après 30 s vivant → **retiré du monde** + effets temporaires
  mémoire **supprimés** (aucune restauration au chargement suivant).
- **Reconnexion pendant les 30 s** → reprise de la **même entité** (mêmes PV,
  position, état de combat, effets actifs), **aucun nouveau spawn, aucun doublon**.
  Après disparition → **chargement normal**, aucun effet temporaire restauré. Une
  **mort survenue pendant les 30 s n'est jamais annulée** par la reconnexion.

> Le maintien d'entité 30 s après déconnexion n'existe **pas** aujourd'hui (l'état
> joueur est retiré immédiatement, position persistée) → règle **entièrement
> `Planned`**.

### 12.14 Effets et mort (`removeOnDeath`)

Propriété `removeOnDeath: true|false`, **défaut `true`**. À la mort de la cible :
buffs/debuffs/poison/bleed/immunités temporaires **supprimés**, **aucun tick
ultérieur**, respawn **sans effets temporaires**. Exceptions futures possibles
(`removeOnDeath=false`, non implémentées) : malédiction persistante, pénalité de
mort, blessure durable, effet de résurrection. La **mort du lanceur ne supprime
pas** les DoT actifs sur d'autres cibles.

### 12.15 Attribution & aggro

- **Identité de source** (conceptuelle, noms à aligner) : `sourceCharacterId`,
  `sourceEntityId`, `effectDefinitionId`, `applicationId`, `appliedAt`.
- **Kill par DoT** → attribué au **lanceur initial** ; contribution, **XP** et
  **éligibilité au butin** suivent les **règles normales existantes**, même si le
  lanceur est mort/déconnecté/disparu. Récompenses produites **une seule fois** (pas
  de nouveau système de récompenses différées ici — voir le contrat existant, à
  préciser si besoin).
- **Aggro** : chaque tick génère sa menace **au nom du lanceur initial**. Lanceur
  présent et ciblable → peut devenir cible ; **lanceur mort/disparu** → menace
  historique conservée si nécessaire mais **non sélectionnable** comme cible active.
  Un DoT ne doit **jamais** maintenir une créature en poursuite vers une entité
  inexistante : la créature choisit une autre cible valide ou quitte le combat selon
  les règles existantes.

### 12.16 Serveur autoritaire

Le client **ne fournit jamais** : puissance snapshotée, résistance effective,
immunité, résultats des ticks, cadence/prochain tick, état de stacking, attribution
du kill, dégâts finaux. Le serveur lit : définition de l'effet, source/cible
autoritaires, snapshots runtime, timers autoritaires. Le frontend **affiche** les
événements reçus. (ADR-0022.)

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
| Créature : primaires (V6-B1) + secondaires dérivées (V6-B2, coefficients Studio V6-B2.5) | Implemented |
| Défense créature : esquive (`dodgeChance`, `accuracy` la réduit, V6-B3) en défenseur (hits joueur → créature) | Implemented |
| Défense créature : blocage (`blockChance`/`blockReductionPercent`, physical, après armure, V6-B4) | Implemented |
| Nature défensive d'attaque : `SkillDefinition.attackDefenseKind` (physical/magic) + `isAttackParryable` + Studio (V6-B5) | Implemented |
| Défense créature : parade (`parryChance`, parabilité pilotée par `attackDefenseKind` nature physical/magic, prioritaire, `isParried` propagé, V6-B6) | Implemented |
| Contrat de parade : parabilité par nature défensive (physical parable même si raw ; magic non parable ; ranged physique parable ; §11.6/§11.7) | Implemented (`isAttackParryable` aligné, `d81ea80`) — modèle hybride physical+raw parallèle reste Planned (§11.7) |
| Contre-attaque créature sur parade (`creatureCounterAttack`, auto-attaque + skill, `counterAttackPower`, gatée `isParried`, joueur `canParry:false` anti-récursion, V6-B7) | Implemented |
| Flags défensifs par skill : `canBeDodged`/`canBeBlocked` (défaut true) + `canBeParried` (défaut false, opt-in) — serveur autoritaire, Studio, §11.8 | Implemented |
| Créature : PV max dérivé (`maxHealthDerived`) actif comme `maxHealth` autoritaire via `resolveStat` (base + Vitalité, cap 1, floor ; spawn/respawn/soin/fuite/admin/DTO alignés) — Lot 2, ADR-0021, §11.9 | Implemented |
| Créature : `counterAttackPower` actif en défense | Planned (`counterAttackPower` désormais actif via contre-attaque V6-B7 ; activation défensive dédiée non décidée) |
| Parade sur auto-attaque passive (`canParry` en défense passive) | Planned (hors périmètre) |
| Bloc attaque : flat/percent damage modifiers | Planned |
| Bloc défense : bonus/malus d'armure, curses | Planned |
| Résistances magiques / boucliers magiques-divins, dégâts magical/elemental/poison, enchantements/procs | Planned (cadrage figé : ADR-0022 écoles/résistances/immunités, Draft/Proposed) |
| Minimum de 1 sur le total hybride ; `healingDone`/`healingReceived` (§12.1/§12.2) | Planned (cadrage, ADR-0022 §7/§13) |
| DoT (poison/bleed), ticks, snapshot offensif, cadence, réapplication (§12.3–12.9) | Planned (cadrage §12) |
| Immunités multi-sources (`scope/school/sources[]`, snapshot runtime) (§9 ADR-0022 / §12.9) | Planned |
| Stacking (`stackingGroup`/priorité), dispel complet V1 (§12.10/§12.11) | Planned |
| Lifecycle effets : redémarrage wipe, déconnexion 30 s, reconnexion même entité, `removeOnDeath=true` (§12.12–12.14) | Planned |
| Attribution kill/XP/butin & aggro d'un DoT (§12.15) | Planned |

## Références

- `apps/api-gateway/src/creatures/combat-damage.calculator.ts` (calculateur pur, arrondi entier).
- `apps/api-gateway/src/creatures/combat-hit.resolver.ts` (mapping attaquant/défenseur → hit).
- `apps/api-gateway/src/creatures/creatures.service.ts` (`applyCreatureHitToPlayer`, `doFighting` : skill + auto-attaque passive via resolver).
- `apps/api-gateway/src/characters/character-stats-calculator.ts` (stats finales + modificateurs dérivés équipement/maîtrises).
- docs/08_Gameplay/masteries.md (Mastery Effects, `armorPenetrationPercent`).
- STATUS.md (blocs V4-B0 / V4-C / V4-D0).
