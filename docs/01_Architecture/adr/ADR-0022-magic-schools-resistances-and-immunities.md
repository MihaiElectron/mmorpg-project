# ADR-0022 — Magic schools, resistances and damage immunities

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
  - docs/01_Architecture/adr/ADR-0021-stat-resolution-pipeline.md
  - docs/01_Architecture/adr/ADR-0019-active-skills-v1.md
  - docs/01_Architecture/adr/ADR-0020-mastery-contextual-effects.md
- Used by: Project owner, backend developers, gameplay designers, Studio
  developers, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents:
  - docs/08_Gameplay/combat-resolution.md (§8, §9, §11.6, §11.7 hybride Planned)
  - STATUS.md
  - CLAUDE.md (Sécurité, Architecture Runtime)
  - docs/00_Project/glossary.md
- Related code (état actuel — AUCUNE modification par cet ADR) :
  - apps/api-gateway/src/active-skills/active-skills.constants.ts
    (`SKILL_DAMAGE_TYPES` physical|raw ; `SKILL_ATTACK_DEFENSE_KINDS` physical|magic)
  - apps/api-gateway/src/creatures/combat-damage.calculator.ts (`DamageType` physical|raw)
  - apps/api-gateway/src/creatures/combat-parryability.helper.ts (`isAttackParryable`)
  - apps/api-gateway/src/active-skills/entities/skill-definition.entity.ts
    (`damageType`, `attackDefenseKind`)
  - apps/api-gateway/src/active-skills/skill-cast.service.ts
  - apps/api-gateway/src/derived-stats/derived-stats.constants.ts
    (`magicalResistanceFire/Water/Air/Earth` — `calculatedOnly`, non consommées)
  - apps/api-gateway/src/characters/character-stats-calculator.ts
- Commits: N/A (ADR de décision — aucune implémentation)

---

## Context

Le combat repose aujourd'hui sur **deux axes indépendants** (audit préalable) :

- **`damageType`** (`physical | raw`) — axe de **mitigation** : `physical` applique
  l'armure de la cible (+ `armorPenetrationPercent` de l'attaquant), `raw` ignore
  armure et pénétration.
- **`attackDefenseKind`** (`physical | magic`) — axe de **nature défensive** :
  décide la **parabilité** (`physical` parable, `magic` non parable) et,
  conceptuellement, contre quel pipeline défensif l'attaque se résout.

Constat clé : **`magic` n'existe que sur l'axe `attackDefenseKind`**. Une attaque
« magique » inflige aujourd'hui des dégâts `physical` (réduits par l'armure) ou
`raw` (rien) — **aucune résistance magique n'est consommée**. Côté joueur, quatre
résistances élémentaires (`magicalResistanceFire/Water/Air/Earth`) sont **calculées
mais non branchées** (`calculatedOnly`) ; côté créature, **aucune résistance**.

Le pipeline générique de résolution de statistiques (**ADR-0021**) fournit déjà
`flat / percent_add / percent_multiply / override`, des **filtres** (source / tag /
signe / réduction), des **caps** (min/max), un **arrondi** configurable et une
**trace** — réutilisé pour les PV max créature (Lot 2/3).

Le besoin : introduire des **écoles magiques**, des **résistances** consommées par
les dégâts magiques, des **immunités** explicites, tout en restant compatible avec
le **modèle hybride `physical + raw` parallèle** déjà documenté comme **Planned**
(`combat-resolution.md` §11.7).

## Problem

Comment introduire les écoles magiques, les résistances (par école + globale) et
les immunités **sans** casser le contrat existant (`damageType`,
`attackDefenseKind`, `raw`, dégât minimum, hybride Planned), en **réutilisant
ADR-0021**, et en gardant le serveur seule autorité — le tout **sans les
implémenter maintenant** ?

## Decision drivers

- Séparer clairement mitigation, nature défensive et catégorie d'école.
- Réutiliser ADR-0021 (résistances = stats résolues et traçables).
- Ne pas conserver de « magie générique/legacy » sans école.
- Serveur autoritaire strict ; client/Studio n'ont jamais l'autorité.
- Rester compatible avec le modèle hybride multi-composantes (Planned).
- Ne rien implémenter : décision documentaire uniquement.

## Considered options

### Séparation `damageType` / `attackDefenseKind` / `magicSchool` (retenue)

Trois axes distincts (§Decision). Épouse la séparation déjà présente en code.

### Résistance magique globale seule (rejetée)

Une seule résistance magique, pas d'école. Rejetée : empêche les spécialisations
par école et le contenu élémentaire.

### École intégrée directement dans `damageType` (rejetée)

`damageType = fire | frost | …`. Rejetée : mélange **mitigation**, **catégorie
magique** et **règles ciblant toute la magie** ; casse « tous dégâts magiques ».

### Tags comme autorité métier (rejetés)

Écoles portées par des tags libres. Rejetés : typage insuffisant ; un tag
deviendrait une règle métier autoritaire. Les tags restent une **métadonnée**
(visuelle / filtrage), jamais un substitut de `magicSchool`.

### Composantes multiples immédiatement (non retenue en V1)

Modèle à `damageComponents[]` dès maintenant. Non retenue : surdimensionné ;
reste la **cible future** déjà partiellement documentée (hybride Planned §11.7).

### Pénétration magique (rejetée — gameplay)

Voir §11.

### Résistance à 100 % comme immunité (rejetée)

Incompatible avec le dégât minimum de 1, la traçabilité et la distinction
mitigation / annulation explicite (§9/§10).

## Decision

> **Statut : décision d'architecture et de gameplay figée dans cet ADR (Proposed).
> AUCUN code, migration, formule runtime ou Studio n'est modifié ici.**

### 1. Trois axes distincts

```text
damageType = physical | magic | raw
  → détermine la MITIGATION de la composante dommageable :
    physical → armure ; magic → résistance de l'école ; raw → aucune

attackDefenseKind = physical | magic
  → détermine les INTERACTIONS DÉFENSIVES (parade, esquive, blocage et règles
    déjà documentées §11.6/§11.7)

magicSchool = fire | water | air | earth | sacred | poison
  → CATÉGORISE un effet magique et sélectionne la résistance UNIQUEMENT pour les
    effets dommageables ; catégorise aussi les effets non dommageables (§12)
```

Le terme `physical` peut apparaître sur **plusieurs axes** avec des
**responsabilités distinctes** (mitigation vs interactions défensives) — ne jamais
les confondre. (État actuel du code : `damageType` = `physical | raw` et `magic`
n'est que sur `attackDefenseKind` ; cet ADR **décide** l'ajout futur de `magic` à
l'axe mitigation, sans l'implémenter.)

### 2. École obligatoire pour la magie

- Un **skill magique** (`attackDefenseKind: magic`) → **`magicSchool` obligatoire**.
- Un skill `physical` ou `raw` → `magicSchool` **null/interdit**.
- **Aucune magie générique ni legacy** n'est conservée.

Contenu existant à migrer (lot futur, pas ici) :

```text
Strike → damageType physical, aucune magicSchool
Heal   → effet magique, magicSchool sacred
```

Le backend et le Studio devront **refuser** un skill magique sans école — cet ADR
**ne code pas** cette validation.

### 3. Écoles initiales (validées)

```text
fire · water · air · earth · sacred · poison
```

Une **classe n'est jamais enfermée** dans une seule école : **chaque skill choisit
son école**. Exemples non contraignants — Druide (earth/water/air/poison, sacred
selon skill), Barde (physical pour certaines armes, air pour effets sonores
offensifs, sacred pour certains soins/protections). **Aucune école `bard`, `druid`
ou `sonic` en V1.**

### 4. Résistances par école + globale

Statistiques prévues (une par école) :

```text
magicResistanceFire · magicResistanceWater · magicResistanceAir
magicResistanceEarth · magicResistanceSacred · magicResistancePoison
```

Contribution transversale :

```text
magicResistanceGlobal
```

**Résistance effective d'une école** :

```text
résistance d'école
+ contributions de résistance magique globale
+ buffs d'école + buffs globaux
− debuffs
```

La **résistance magique globale n'est PAS une seconde mitigation** : c'est une
**contribution commune injectée dans la résolution de chaque résistance d'école**
(une seule mitigation finale par composante magique).

### 5. Résistances via le pipeline ADR-0021

Chaque résistance d'école est une **stat résolue** par le resolver partagé :

```text
base / contribution dérivée
→ contributions globales (magicResistanceGlobal)
→ équipement futur → buffs/debuffs futurs
→ filtres → flat → percent_add → percent_multiply → override
→ caps éventuels propres à la stat
→ arrondi
→ valeur finale autoritaire (traçable)
```

**Décision gameplay actuelle : AUCUN clamp automatique** de la valeur finale de
résistance. L'équilibrage (contenu, objets, buffs) se fait via le Studio. Le
resolver doit néanmoins **tracer toutes les contributions** (comme la trace PV max,
Lot 3). Le cache/invalidation suit le même patron que les PV max (mémoïsation +
invalidation sur changement de source).

### 6. Formule de mitigation

Résistances en **points de pourcentage** :

```text
resistanceMultiplier   = 1 − effectiveResistance / 100
damageAfterResistance  = damageBeforeResistance × resistanceMultiplier
```

Règles :
- résistance **positive** → réduction ; résistance **négative** → **vulnérabilité** ;
- **aucune pénétration magique** (§11) ;
- **aucune limitation automatique** de la résistance (pas de clamp, §5) ;
- une résistance `≥ 100` **n'est PAS une immunité** (l'immunité est explicite, §9) ;
- le résultat dommageable est soumis à la **règle de dégât minimum** (§7).

**Arrondi** : ne fige **aucun détail d'arrondi différent** de celui déjà utilisé
par le pipeline de combat — se conformer à l'**invariant entier** existant
(`combat-resolution.md` §9 : `finalDamage`/`hpAfter` entiers, aucun PV
fractionnaire persisté).

### 7. Dégât minimum

```text
une attaque dommageable réellement réussie, avec une valeur de dégâts initiale > 0,
inflige au minimum 1 dégât.
```

S'applique à **physical, magic et raw**. Le résultat peut être **0 uniquement** en
cas de : esquive, parade, attaque annulée, **immunité explicite**, **invulnérabilité
totale**, ou effet **configuré à zéro dégât**.

**Attaques à plusieurs composantes** : le point « minimum de 1 **par composante**
ou **sur le total** » n'est **pas** encore acté dans la documentation existante
(§11.7 ne le tranche pas) → **question ouverte** (voir Open questions). Ne pas
décider seul ici.

### 8. Raw et bleed

```text
bleed → damageType raw, magicSchool null
```

`raw` : ignore armure, ignore résistances magiques, ignore pénétration d'armure ;
**conserve les règles déjà documentées** (blocage / impact, §11.7) ; **soumis au
minimum de 1** lorsqu'il touche ; **annulable par une invulnérabilité totale** ;
**PAS annulé par une immunité magique**. Une future **immunité spécifique au bleed**
reste possible mais **hors périmètre**.

### 9. Immunités explicites (trois niveaux)

```text
immunité à une école   → bloque uniquement cette école magique
immunité magique       → bloque toutes les écoles magiques
invulnérabilité totale → bloque physical, magic ET raw
```

Une immunité produit **0 dégât** **avant** l'application du minimum de 1. Elle **ne
doit PAS** être représentée par une résistance numérique très élevée : c'est une
**annulation explicite** (candidate à un `override` du resolver ou à un flag
runtime dédié — représentation runtime précise : question ouverte).

### 10. Bouclier sacré

Le **Bouclier sacré** applique une **invulnérabilité totale temporaire**. Il bloque
`physical`, `magic`, `raw`, `bleed`, `poison`. Il **ne doit PAS** être modélisé
comme résistance `sacred`, ni résistance magique globale, ni résistance à 100 %.
Durée, dissipation et autres propriétés relèvent du **système de buffs futur**.

### 11. Aucune pénétration magique

Décision **définitive actuelle** : **aucune pénétration magique** (ni plate, ni
pourcentage, ni globale, ni par école).

Justification gameplay :
- les attaques magiques seront souvent **à distance** ;
- le focus collectif à distance rendrait la pénétration **frustrante** ;
- l'investissement défensif en résistance doit **conserver sa valeur** ;
- la pénétration d'armure **physique** peut garder une logique différente (contraintes du corps à corps).

Moyens alternatifs (contenu) : changer d'école, infliger du physique, infliger du
`raw`/`bleed`, dissiper les buffs, appliquer un **debuff de vulnérabilité visible**.

### 12. Soins et buffs magiques

`magicSchool` catégorise **aussi** les effets non dommageables (`Heal` → `sacred`,
`Bouclier sacré` → `sacred`). Mais :

```text
la résistance de la cible ne réduit JAMAIS la puissance d'un soin,
ni la puissance ou la durée d'un buff.
```

Les résistances sont consommées **uniquement** par les effets **dommageables**
magiques.

### 13. Modificateurs de soins (cadre conceptuel)

```text
soin de base
→ puissance de soin du lanceur
→ modificateurs de soins SORTANTS du lanceur (healingDone)
→ modificateurs de soins REÇUS par la cible (healingReceived)
→ arrondi
→ soin final
```

Deux familles distinctes prévues (**noms conformes aux conventions à confirmer**) :
`healingDone` (ex. debuff réduisant tous les soins produits ; bonus de soins
sortants) et `healingReceived` (ex. anti-heal réduisant les soins reçus ; bonus de
soins reçus). Ces effets **réutiliseront probablement ADR-0021**. **Non figés ici** :
stacking, formule, caps, persistance, ordre détaillé (questions ouvertes).

### 14. Dégâts hybrides et composantes parallèles

Cet ADR **reste compatible** avec `physical + raw`, `physical + magic`,
`magic + raw` et de futures composantes, **sans changer leur statut** : le modèle
hybride multi-composantes demeure **Planned** (`combat-resolution.md` §11.7 —
`damageType` est aujourd'hui un enum unique, aucune part parallèle implémentée).

Règle **déjà actée** (ne pas dupliquer) : les **composantes parallèles ne sont
appliquées que si l'attaque principale touche réellement** (parée/esquivée → aucune
part). Complément de contrat (cible, Planned), une fois l'impact validé :

```text
composante physical → mitigation par armure
composante magic    → mitigation par résistance de sa magicSchool
                      (résistance d'école + contributions globales)
composante raw      → aucune mitigation
```

- Une composante **annulée par une immunité** peut donner **0 indépendamment** des
  autres composantes.
- Chaque composante **conserve sa propre trace**.
- Exemple : `physical + magic:fire` qui touche → part physique réduite par l'armure ;
  part `fire` réduite par `magicResistanceFire + contributions globales`.

Ne pas transformer ce modèle en implémentation active tant que §11.7 le maintient
`Planned`.

### 15. Serveur autoritaire

Le client **ne fournit jamais** : `damageType`, `attackDefenseKind`, `magicSchool`,
résistance ciblée, résistance effective, coefficient de mitigation, immunité active,
dégâts finaux. Le serveur lit les **définitions persistées** et les **états runtime
autoritaires** ; le client ne transmet que l'**intention** minimale d'utiliser un
skill (contrat `skill:cast` existant, `parseSkillCastPayload` strict inchangé).

### 16. Studio futur (visualisation seulement)

Le Studio devra pouvoir **afficher** (sans aucun calcul autoritaire React) :
`damageType`, `attackDefenseKind`, `magicSchool`, résistance d'école, contributions
globales, buffs/debuffs, résistance effective, multiplicateur, dégâts avant/après
résistance, immunité éventuelle, **raison d'un résultat à 0**, application éventuelle
du minimum de 1. Réutilise le patron de **trace** (ADR-0021 / Lot 3), aucun nouvel
écran isolé imposé.

## Rationale

La séparation en trois axes prolonge la distinction déjà présente
(`damageType` vs `attackDefenseKind`) sans la casser ; l'école optionnelle évite de
mélanger mitigation et catégorie. Faire des résistances des **stats résolues**
(ADR-0021) fournit gratuitement filtres, override (immunité), caps optionnels et
trace, et réutilise le cache/invalidation éprouvé sur les PV max. La mitigation
**linéaire en pourcentage** est lisible pour le joueur et distincte de l'armure
**soustractive** (échelles indépendantes). Les immunités **explicites** (annulation)
restent distinctes des résistances **numériques** (mitigation) — condition de la
traçabilité et du dégât minimum.

## Consequences

### Positive

- Écoles et résistances extensibles, cohérentes avec ADR-0021.
- Effets « résistance magique générale » possibles via une contribution unique.
- Immunités traçables et distinctes de la mitigation.
- Serveur autoritaire préservé ; client/Studio en lecture seule.
- Compatible avec le futur hybride multi-composantes.

### Negative

- Nouvelles stats (6 résistances + globale) côté joueur ET créature → volume
  Studio / équipement / doc.
- Réconciliation nécessaire des 4 résistances existantes
  (`magicalResistanceFire/Water/Air/Earth`, `calculatedOnly`) avec les 6 écoles.
- Migration de contenu (`Strike`, `Heal`) et validation « magie ⇒ école ».
- Coexistence temporaire : `magic` déjà sur `attackDefenseKind`, à ajouter sur
  `damageType` lors de l'implémentation.

### Risks

- Sans clamp de résistance (§5), l'équilibrage repose entièrement sur le contenu.
- Représentation runtime des immunités non figée (question ouverte).
- Confusion `physical` multi-axes si la documentation/Studio n'est pas claire.

## Security impact

Toutes les valeurs de combat (type, école, résistance, immunité, dégâts) sont
résolues et validées **côté serveur**. Le Studio configure (définitions,
coefficients) via routes admin guardées ; il ne participe jamais à la résolution.
Le payload `skill:cast` ne peut ni fournir ni contourner ces règles.

## Performance impact

Les résistances suivent le patron **snapshot mémoïsé + invalidation ciblée**
(ADR-0021 / PV max) : pas de résolution par hit ni par tick ; le combat lit des
valeurs pré-résolues. Aucune affirmation chiffrée sans mesure.

## Migration and compatibility

Progressive (voir Conséquences et lots futurs). Les skills actuels restent intacts
tant que `magicSchool`/mitigation magique ne sont pas branchés (défauts `physical`,
`magicSchool` null). Aucune colonne n'est créée par cet ADR.

## Validation

- [x] Existing implementation analyzed (audit préalable).
- [x] Related ADRs reviewed (ADR-0021, ADR-0019, ADR-0020).
- [x] Security impact reviewed.
- [x] Performance impact reviewed.
- [ ] Human approval recorded.
- [ ] Related documentation aligned on implementation.

## Conséquences et lots futurs (découpe possible, non implémentée)

1. Types et contrat `magicSchool` (+ ajout `magic` à l'axe mitigation).
2. Migration propre de `Strike` (physical) et `Heal` (sacred).
3. Résistances joueur (implemented + globale).
4. Résistances créature (colonnes + dérivation + snapshot/invalidation).
5. Mitigation magique pure (calculateur, linéaire %, sans clamp).
6. Intégration `SkillDefinition` (`magicSchool` + validation « magie ⇒ école »).
7. Skill Editor Studio.
8. Snapshots et traces runtime des résistances.
9. Immunités (école / magique / invulnérabilité totale).
10. Bouclier sacré (via buffs futurs).
11. Modificateurs `healingDone` / `healingReceived`.
12. Feedback client (couleurs/icônes par école — métadonnée, aucune autorité).
13. Composantes hybrides futures (reste Planned).

## Open questions

Décisions **non encore validées** (à trancher par le responsable / lot ultérieur) :

- **Minimum de 1 par composante OU sur le total** pour une attaque hybride
  (non tranché dans la doc existante, §7/§14).
- Formule exacte et **stacking** de `healingDone` / `healingReceived` (+ caps,
  persistance, ordre).
- **Représentation runtime précise des immunités** (override resolver vs flag
  dédié vs propriété skill/cible).
- **Persistance** des buffs et immunités ; règles de **dispel**.
- Éventuelles **immunités spécifiques au bleed** ou à certains effets périodiques.
- **Comportement des dégâts périodiques** (DoT) vis-à-vis du minimum de 1.
- Réconciliation des 4 résistances élémentaires existantes avec les 6 écoles
  (renommage / mapping / sémantique points vs %).

Les décisions déjà validées ci-dessus **ne sont pas rouvertes** par ces questions.

## Non-goals

- Toute implémentation (backend, migration, Studio, frontend).
- Activation du modèle hybride multi-composantes (reste Planned, §14).
- Buffs/debuffs et immunités actifs.
- Pénétration magique (rejetée, §11).
- Clamp automatique des résistances (rejeté, §5).

## Related files

Voir `Related code` (Metadata). Aucun de ces fichiers n'est modifié par cet ADR.

## TODO

- [ ] Obtenir la validation humaine (passage `Decision status: Accepted`).
- [ ] Trancher les questions ouvertes avant l'implémentation.
- [ ] Aligner `combat-resolution.md` / glossaire lors de l'implémentation.
