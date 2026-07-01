# ADR-0016 — Skills & Rewards Runtime Architecture

## Metadata

- Status: Accepted
- Decision status: Accepted
- Owner: Project
- Last updated: 2026-07-01
- Date proposed: 2026-07-01
- Date accepted: 2026-07-01
- Approved by: Mihai Radulescu
- Approval reference: Session 2026-07-01
- Depends on:
  - docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md
  - docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md
  - docs/01_Architecture/adr/ADR-0010-object-runtime-model.md
  - docs/01_Architecture/adr/ADR-0011-item-materialization-pipeline.md
  - docs/01_Architecture/adr/ADR-0012-gameplay-architecture.md
  - docs/01_Architecture/adr/ADR-0014-equipment-runtime-v2.md
  - docs/01_Architecture/adr/ADR-0015-inventory-container-architecture.md
  - docs/01_Architecture/client-server-boundaries.md
  - docs/10_AI/implementation-rules.md
- Used by: Project owner, backend developers, gameplay designers,
  repository-aware coding agents
- Supersedes: Mécaniques d'XP ad hoc par domaine (ResourcesGateway, CreaturesService, CraftingService)
- Superseded by: None
- Related documents:
  - docs/08_Gameplay/item-taxonomy.md
  - docs/08_Gameplay/object-runtime-architecture.md
  - docs/09_Workflow/runtime-roadmap.md
  - docs/09_Workflow/technical-debt.md
- Related code:
  - apps/api-gateway/src/skills/skills.service.ts
  - apps/api-gateway/src/skills/entities/player-skill.entity.ts
  - apps/api-gateway/src/skills/entities/skill-definition.entity.ts
  - apps/api-gateway/src/creatures/creatures.service.ts
  - apps/api-gateway/src/creatures/entities/creature-template.entity.ts
  - apps/api-gateway/src/resources/resources.gateway.ts
  - apps/api-gateway/src/crafting/crafting.service.ts
  - apps/api-gateway/src/game-config/game-config.entity.ts (Phase 1.5)
  - apps/api-gateway/src/game-config/game-config.service.ts (Phase 1.5)
  - apps/api-gateway/src/progression/progression.service.ts (Phase 1.5)

---

## Context

Runtime V2 est complet au 2026-06-29. Les fondations suivantes sont stables :

- `ItemTransferService` (20 transitions, 10 domaines)
- `ItemMaterializationService` (unique créateur d'`ItemInstance`)
- `EconomyService` (wallet bronze, ledger)
- `LootService` (pur, synchrone)
- `SkillsService` (formules pures, helpers transactionnels, 30 tests)
- `PlayerSkill` / `SkillDefinition` (9 skills seedés au boot)

L'XP est déjà branchée sur trois domaines — récolte, combat, craft — mais de façon
fragmentée : `KILL_XP = 10` est une constante hardcodée, le combat crédite hors
transaction, aucune distribution de groupe n'existe, aucun mécanisme de chance de
succès n'est implémenté sur la récolte, et aucun système d'Encounter ne délimite la
propriété d'un combat.

Cette ADR définit l'architecture définitive du système XP, Skills et Rewards, valable
pour tous les domaines gameplay présents et futurs : combat, récolte, craft, quêtes,
événements, réputation, métiers, guildes, raids, PvP.

---

## Règle d'autorité — contrainte architecturale permanente

**Le serveur est l'unique autorité sur toute décision de progression et de récompense.**

Cette règle est non négociable et s'applique à toute implémentation présente ou future
relevant de cette ADR :

- L'Encounter Runtime est créé, mis à jour et détruit exclusivement côté serveur.
- L'éligibilité aux récompenses est calculée exclusivement côté serveur.
- Le ContributionScore est calculé exclusivement côté serveur.
- La distribution XP et loot est calculée exclusivement côté serveur.
- Le roll de successChance est effectué exclusivement côté serveur.
- Aucun payload client ne peut influencer : la quantité d'XP, le loot accordé,
  le mode de distribution, l'éligibilité d'un participant, le résultat d'un roll.

Le client reçoit uniquement le résultat final :
- `skill_update` — niveau, XP, `leveledUp` (skill spécifique)
- `character_xp_update` — level, experience, nextLevelXp, leveledUp (progression globale personnage)
- `inventory_update` — loot accordé
- `gather_result { success }` — résultat de la récolte
- `encounter_update` — état observable de l'Encounter (optionnel, lecture seule)

Toute violation de cette règle est un bug d'architecture, pas un choix de conception.

---

## Problem

Sans décision architecturale explicite, chaque domaine gameplay risque de :

1. Accorder l'XP hors transaction — risque de crédit sans effet validé.
2. Hardcoder des paramètres de récompense — impossible à équilibrer via Studio.
3. Créer des systèmes de contribution parallèles — incohérence entre domaines.
4. Utiliser `Math.random()` directement — non injectable, non testable, non reproductible.
5. Bloquer le joueur par un prérequis de niveau — choix de game design non tranché.
6. Disperser la logique de récompense dans des gateways — non testable, non auditable.
7. Accorder la totalité de l'XP au dernier attaquant — injuste, exploitable.
8. Ne pas définir de propriétaire de combat — plusieurs groupes farm la même créature.
9. Exclure les healers, buffers et tanks des récompenses — démotivation des rôles de soutien.

---

## Decision drivers

- Le serveur est l'unique autorité sur toute progression, récompense et résultat.
- L'XP et les récompenses sont des mutations persistantes, pas des stats dérivées —
  elles n'entrent pas dans `EntityRuntimeSnapshot`.
- `RewardService` est le seul point de coordination des récompenses. Les gateways
  orchestrent ; elles ne calculent pas.
- Toute mécanique aléatoire passe par `RandomService` — jamais `Math.random()` direct.
- Aucun paramètre de récompense n'est hardcodé. Tout est configurable via templates
  et `GameConfig`.
- Le joueur n'est jamais bloqué par son niveau — le niveau influence le résultat,
  pas l'accès à la tentative.
- Les healers, buffers et tanks participent aux récompenses via leur `ContributionScore`.
- Les formules de pondération sont configurables dans le Studio — l'équilibrage ne
  nécessite pas de modification de code.

---

## Decision

### 1. Encounter Runtime

Chaque créature engagée dans un combat possède un **Encounter Runtime** créé lors du
premier engagement. L'Encounter est une donnée exclusivement en mémoire serveur.
Il n'est jamais persisté en base de données.

```
Encounter {
  encounterId      : string          // UUID généré à la création
  creatureId       : string          // créature concernée
  ownerType        : PLAYER | PARTY  // type de propriétaire
  ownerId          : string          // characterId ou partyId
  state            : LOCKED | PUBLIC // politique d'accès en cours
  startedAt        : number          // timestamp ms
  lastActivityAt   : number          // dernière action de combat (ms)
  participants     : Map<characterId, Contribution>
}
```

L'Encounter vit dans `CreaturesService` sous la forme :
```
Map<creatureId, Encounter>
```

L'Encounter est détruit dans les cas suivants (tous configurables) :

| Condition | Paramètre Studio | Défaut |
|---|---|---|
| Créature morte | — (systématique) | — |
| Reset IA (leash, fuite) | — (systématique) | — |
| Timeout d'inactivité | `encounterBreakTimeout` (secondes) | 30 s |
| Distance trop grande | `encounterBreakDistanceWU` (WU) | 3 000 WU |
| Tous les membres éligibles morts | — (systématique) | — |
| Tous les membres ont quitté la zone | `encounterBreakDistanceWU` | 3 000 WU |
| Abandon explicite (futur) | — | — |

Quand un Encounter est détruit sans mort de créature, la créature regagne ses HP
progressivement (comportement de régénération — Phase 2+).

### 2. Encounter Lock

Le premier attaquant crée l'Encounter et en devient le propriétaire.

```
Premier attack_creature reçu par CreaturesService pour creatureId X :
  si aucun Encounter n'existe pour X :
    encounter = new Encounter()
    encounter.ownerType = character.partyId ? PARTY : PLAYER
    encounter.ownerId   = character.partyId ?? character.id
    encounter.state     = LOCKED
    encounters.set(X, encounter)
```

**State LOCKED** (par défaut) :

- Seuls le propriétaire (joueur ou membres du groupe propriétaire) peuvent enregistrer
  des contributions et participer aux récompenses.
- Les autres joueurs peuvent attaquer la créature si la politique de la créature
  (`encounterEnabled = false`) le permet, mais leurs contributions ne sont pas
  enregistrées et ils ne reçoivent aucune récompense.
- C'est le comportement standard pour éviter le loot-tagging et le griefing.

**State PUBLIC** :

- Déclenché si `xpPolicy = PUBLIC` ou `lootPolicy = PUBLIC` sur le template.
- Tous les attaquants éligibles peuvent enregistrer des contributions.
- Utilisé pour les boss mondiaux, les events, le PvP de zone.

**Transition LOCKED → PUBLIC** :

Elle ne peut être déclenchée que par le template (`xpPolicy = PUBLIC` ou
`lootPolicy = PUBLIC`). Elle est irréversible dans la durée de vie de l'Encounter.

### 3. Politique XP — xpPolicy

Configurée par `xpPolicy` sur `CreatureTemplate`. Détermine qui reçoit de l'XP.

```
enum XpPolicy {
  SOLO         = 'SOLO',
  GROUP_SHARED = 'GROUP_SHARED',
  PUBLIC       = 'PUBLIC',
}
```

**SOLO** — uniquement le propriétaire individuel.

Si `encounter.ownerType = PLAYER`, seul `encounter.ownerId` reçoit l'XP.
Les autres membres du groupe éventuel sont exclus des récompenses XP.
Adapté aux créatures personnelles, aux quêtes solo, aux instances privées.

**GROUP_SHARED** — tous les membres éligibles du groupe propriétaire.

Si `encounter.ownerType = PARTY`, l'XP est distribuée à tous les membres éligibles
du groupe présents dans le rayon et respectant les conditions d'éligibilité.
Si `ownerType = PLAYER`, comportement identique à `SOLO`.
C'est le mode recommandé pour le PvE en groupe.

**PUBLIC** — tous les participants éligibles, quel que soit leur groupe.

L'Encounter passe automatiquement en `state = PUBLIC`.
Tout joueur ayant un `ContributionScore > 0` et respectant les conditions d'éligibilité
reçoit une part d'XP proportionnelle à son score.
Adapté aux boss mondiaux, aux events de serveur, aux zones de conflit.

### 4. Politique Loot — lootPolicy

Configurée par `lootPolicy` sur `CreatureTemplate`. **Indépendante de `xpPolicy`.**

```
enum LootPolicy {
  SOLO         = 'SOLO',
  GROUP_SHARED = 'GROUP_SHARED',
  PUBLIC       = 'PUBLIC',
}
```

**Matérialisation du loot selon lootPolicy — décision fixée :**

| Mode | Comportement `LootDistributor` |
|---|---|
| `SOLO` | Un seul set de loot matérialisé pour le propriétaire uniquement |
| `GROUP_SHARED` | Un seul set de loot partagé — `LootDistributor` distribue chaque `LootEntry` à un bénéficiaire via round-robin ou random pick parmi les éligibles |
| `PUBLIC` | Une copie individuelle du set de loot matérialisée pour chaque participant éligible |

Justification : `GROUP_SHARED` évite l'inflation économique (le groupe reçoit ce qu'une
créature aurait produit, pas N fois). `PUBLIC` compense la concurrence ouverte —
chaque participant reçoit son propre set, ce qui est économiquement inflationniste
mais justifié par la nature de l'événement (boss mondial, event de serveur).

**Exemples de combinaisons :**

| Créature | xpPolicy | lootPolicy | Justification |
|---|---|---|---|
| Créature classique | `GROUP_SHARED` | `GROUP_SHARED` | PvE coopératif standard |
| Boss mondial | `PUBLIC` | `PUBLIC` | Événement ouvert — chacun reçoit |
| Créature d'event | `PUBLIC` | `SOLO` | XP collective, mais loot personnel |
| Créature de quête solo | `SOLO` | `SOLO` | Instance dédiée — propriétaire unique |
| Boss de raid | `GROUP_SHARED` | `GROUP_SHARED` | Réservé au groupe — loot distribué en interne |

Toutes les combinaisons sont valides. Aucune contrainte n'est imposée entre les deux
politiques — c'est un choix de game design par template.

### 5. ContributionScore — rôles et pondération

Le `ContributionScore` est le score composite qui détermine la part de chaque
participant dans la distribution. Il est calculé **exclusivement côté serveur**,
jamais exposé en détail au client.

```
score = (damage  × damageWeight)
      + (healing × healingWeight)
      + (tanking × tankingWeight)
      + (buffs   × buffWeight)
      + (debuffs × debuffWeight)
      + (objective × objectiveWeight)
```

Les poids sont configurables dans `GameConfig` sous `ContributionWeights` :

| Poids | Type | Défaut Phase 1 | Description |
|---|---|---|---|
| `damageWeight` | `float` | `1.00` | Dégâts infligés à la cible |
| `healingWeight` | `float` | `0.90` | Soins utiles restaurés sur des alliés blessés |
| `tankingWeight` | `float` | `0.80` | Dégâts absorbés quand la créature cible le tank |
| `buffWeight` | `float` | `0.60` | Score de buffs bénéfiques actifs pendant le combat |
| `debuffWeight` | `float` | `0.70` | Score de debuffs appliqués sur la cible |
| `objectiveWeight` | `float` | `1.00` | Participation à un objectif (PvP, capture, escorte) |

**En Phase 1**, seul `damage` est alimenté. Les autres champs de `Contribution` sont
initialisés à 0. Le `ContributionScore` en Phase 1 est donc identique à `damage`.
L'architecture est déjà prête — aucune modification structurelle ne sera nécessaire
quand les autres rôles seront implémentés.

**Règles d'intégrité du score :**

- Le `healing` ne compte que s'il restaure des HP réellement perdus (pas de soins
  sur un personnage à pleine santé).
- Le `buffWeight` ne compte que si le buff est actif au moment de l'attaque de la créature
  sur un allié (buff utile, pas simplement appliqué).
- Le `tanking` ne compte que si la créature cible activement le tank (aggro réelle).
- Le `damage` sur des invocations ou des miroirs peut être ignoré selon configuration
  (`countSummonDamage` sur le template — futur).

Ces règles empêchent l'exploitation du score par des actions superficielles
(soin de 1 HP, buff d'une fraction de seconde).

### 6. Contribution — structure extensible

La structure `Contribution` est conçue pour durer plusieurs années.

```
Contribution {
  characterId   : string

  // Valeurs brutes — accumulées pendant le combat
  damage        : number   // Phase 1 — actif
  healing       : number   // Phase 2+
  tanking       : number   // Phase 2+
  buffs         : number   // Phase 2+
  debuffs       : number   // Phase 2+
  objective     : number   // Phase 3+

  // Score composite — recalculé à chaque flush ou inspection
  score         : number   // calculé par ContributionScoreCalculator

  // Métadonnées
  lastContributionAt : number   // timestamp ms — pour timeout
  isEligible         : boolean  // calculé par filterEligibleContributors
  exclusionReason    : string | null  // raison d'exclusion (pour DevTools)
}
```

`ContributionTracker` vit dans `EncounterRuntime` via `encounter.participants`.
`flush(creatureId)` calcule les scores, filtre les éligibles, vide l'Encounter et
retourne `Contribution[]`. Un double appel retourne `[]`.

### 7. RewardService — orchestrateur sans logique métier propre

`RewardService` est un **orchestrateur transactionnel**. Il ne contient pas de logique
métier propre. Il délègue à des Distributeurs spécialisés.

```
Action réussie (ou échouée avec récompense partielle)
        ↓
DomainService.onActionComplete()
        ↓
RewardService.applyRewards(manager, context: RewardContext): RewardResult
        ↓
    ├── XpDistributor.distribute(manager, context)
    ├── LootDistributor.distribute(manager, context)
    ├── EconomyDistributor.distribute(manager, context)
    ├── ReputationDistributor.distribute(manager, context)   ← futur
    ├── QuestDistributor.distribute(manager, context)        ← futur
    └── AchievementDistributor.distribute(manager, context)  ← futur
```

**Règles d'architecture pour RewardService :**

- `RewardService` reçoit toujours un `EntityManager` — il n'ouvre jamais sa propre
  transaction.
- Les Distributeurs reçoivent le même `EntityManager` — toutes les récompenses sont
  dans la même transaction que l'action déclencheuse.
- Les Distributeurs futurs sont injectés optionnellement. `RewardService` ignore ceux
  qui ne sont pas disponibles.
- Chaque Distributeur retourne ses propres événements. `RewardService` agrège dans
  `RewardResult`.
- Un Distributeur ne communique jamais avec un autre. Toute dépendance croisée passe
  par `RewardService`.

### 8. RewardContext — contrat d'entrée

```
RewardContext {
  trigger              : RewardTrigger       // KILL | GATHER | CRAFT | QUEST | EVENT | PVP
  encounter            : Encounter | null    // null pour récolte, craft, etc.
  contributions        : Contribution[]      // déjà filtrées et scorées
  xpPolicy             : XpPolicy            // SOLO | GROUP_SHARED | PUBLIC
  lootPolicy           : LootPolicy          // SOLO | GROUP_SHARED | PUBLIC
  distributionMode     : XpDistributionMode  // PROPORTIONAL | GROUP_SHARE | LAST_HIT
  skillKey             : string | null
  baseXpAmount         : number
  lootEntries          : LootEntry[]
  baseGoldAmount       : number
  groupBonusPercent    : number              // multiplicateur groupe (1.0 = sans bonus)
  xpRateMultiplier     : number              // lu depuis GameConfig
  minimumContributionPercent : number        // seuil d'exclusion (0.0 = désactivé)
}
```

```
enum RewardTrigger {
  KILL    = 'KILL',
  GATHER  = 'GATHER',
  CRAFT   = 'CRAFT',
  QUEST   = 'QUEST',
  EVENT   = 'EVENT',
  PVP     = 'PVP',
}
```

### 9. Contribution minimale — MinimumContributionPercent

Un participant dont le score représente moins de `minimumContributionPercent` du score
total peut être exclu des récompenses.

```
totalScore = Σ contributions[i].score
ratio_i    = contributions[i].score / totalScore

si ratio_i < minimumContributionPercent
  → isEligible = false
  → exclusionReason = 'score_below_minimum'
```

Ce seuil protège contre l'exploitation du score via des contributions symboliques
(soin de 1 HP, buff d'une seconde).

Configurable dans `GameConfig` :
- `minimumContributionPercent` — défaut `0.01` (1%) — `0.0` désactive la règle.

### 10. Expiration des contributions — ContributionTimeoutSeconds

Un contributeur dont la dernière contribution remonte à plus de
`contributionTimeoutSeconds` est exclu de la récompense, même s'il a infligé des
dégâts plus tôt.

Un joueur actif contribue continuellement (chaque attaque, soin ou buff met à jour
`lastContributionAt`). Un joueur qui cesse toute activité pendant une durée
supérieure au timeout devient non éligible.

Configurable par créature dans `CreatureTemplate.contributionTimeoutSeconds` (défaut 120 s).
Également remontable comme défaut global dans `GameConfig`.

### 11. Distribution XP — trois modes

#### PROPORTIONAL (recommandé par défaut)

Chaque contributeur éligible reçoit une fraction de l'XP proportionnelle à son score.

```
totalScore = Σ contributions[i].score
xpFinal    = baseXpAmount × xpRateMultiplier
xp_i       = xpFinal × (contributions[i].score / totalScore)
```

Juste et non exploitable par le kill-steal. Un healer avec un score de 40% reçoit
40% de l'XP même s'il n'a infligé aucun dégât.

#### GROUP_SHARE

Tous les membres éligibles du groupe propriétaire reçoivent une XP identique,
augmentée par le bonus groupe.

```
xpFinal      = baseXpAmount × xpRateMultiplier × groupBonusPercent
xp_i         = xpFinal / eligibleCount
```

Encourage la coopération. Le multiplicateur compense le partage — chaque membre
reçoit potentiellement plus qu'en solo. Nécessite un système de groupe formalisé
(Phase sociale). En Phase 1, fallback sur `PROPORTIONAL` si aucun groupe actif.

#### LAST_HIT

La totalité de l'XP est accordée au personnage ayant porté le coup fatal.

```
lastHitter      = contributeur du coup qui a fait passer health ≤ 0
xp_lastHitter   = baseXpAmount × xpRateMultiplier
xp_autres       = 0
```

Style compétitif ou PvP. Incite au kill-steal — déconseillé pour le PvE coopératif.
À réserver aux modes de jeu qui le justifient explicitement.

**Mode supprimé — WINNER :** Ce mode (totalité de l'XP au contributeur majoritaire)
est définitivement supprimé. Il était ambigu (majorité en dégâts ≠ vainqueur logique)
et exploitable (51% prend tout). `LAST_HIT` couvre l'intention compétitive.

```
enum XpDistributionMode {
  PROPORTIONAL = 'PROPORTIONAL',
  GROUP_SHARE  = 'GROUP_SHARE',
  LAST_HIT     = 'LAST_HIT',
}
```

### 12. Récolte — aucun blocage par niveau

Le niveau de skill n'empêche jamais une tentative de récolte.

Le joueur peut toujours essayer. Le niveau de skill influence :
- La probabilité de succès (`successChance`)
- La quantité récoltée (Phase 3)
- La qualité du loot (Phase 4)
- Le temps de récolte (Phase 4)
- L'XP gagnée

Le champ `requiredSkillLevel` est supprimé de `ResourceTemplate`.
À sa place : `recommendedSkillLevel` — informatif uniquement, jamais vérifié serveur.

**Formule successChance :**

```
successChance = clamp(
    successChanceMin
    + (successChanceMax - successChanceMin)
      × min(1.0, playerSkillLevel / difficultyLevel),
    successChanceMin,
    successChanceMax
)
```

- `difficultyLevel` ∈ [1, 100] — configurable sur `ResourceTemplate`
- `successChanceMin` — plancher garanti (ex: 20%)
- `successChanceMax` — plafond configurable (ex: 95%)

Le roll est effectué par `RandomService` côté serveur uniquement. Le client reçoit
uniquement `gather_result { success }` — jamais la valeur du roll ni la probabilité.

### 13. failureRewardMode — comportement d'échec configurable

```
enum FailureRewardMode {
  NONE         = 'NONE',         // aucune récompense
  XP_ONLY      = 'XP_ONLY',     // XP d'échec uniquement
  PARTIAL_LOOT = 'PARTIAL_LOOT', // sous-ensemble aléatoire du loot normal
  CUSTOM       = 'CUSTOM',       // loot pool dédié à l'échec
}
```

| Template | failureRewardMode | failureXpReward | Résultat d'un échec |
|---|---|---|---|
| Arbre de bois | `XP_ONLY` | 2 | 2 XP, aucun bois |
| Filon d'or | `PARTIAL_LOOT` | 5 | 5 XP + 1–2 pierres |
| Pierre rare | `CUSTOM` | 1 | 1 XP + pool dédié (gravier, poussière) |
| Herbe banale | `NONE` | 0 | Rien |

### 14. RandomService — service centralisé

Toute mécanique aléatoire du gameplay passe par `RandomService`. `Math.random()` est
interdit dans les services de jeu.

**Source aléatoire selon l'environnement — décision fixée :**

| Environnement | Source | Seed |
|---|---|---|
| Production | `crypto.randomInt` / `crypto.getRandomValues` — non prédictible | Aucune seed exposée |
| Tests unitaires | Générateur déterministe injecté | Fixée par le test (toujours succès, toujours échec, séquence fixe) |
| Debug / simulation Studio | `Math.random()` seedé via `seedrandom` | Configurable par l'admin pour reproduire une séquence |

La seed de debug/simulation est réservée à l'admin et ne peut pas être activée par un joueur.
En production, la source est non prédictible — aucun joueur ne peut anticiper ou
influencer le résultat d'un roll.

**Responsabilités :**

- Source injectable — `RandomService` est remplacé en test par un générateur déterministe.
- Helpers typés : `float()`, `int(min, max)`, `roll(chance)`, `pick(array)`.
- Statistiques de distribution en mode debug — pour l'équilibrage et la validation des taux.

En Phase 1, `RandomService` encapsule `Math.random()` en production (accepté le temps
que la dépendance `crypto` soit configurée). L'interface est stable — le swap de source
ne nécessite aucun changement dans les services consommateurs.

### 15. Character Progression — XP globale personnage

`Character.level` et `Character.experience` constituent la progression **globale** du personnage. Ils sont distincts des `PlayerSkill` (progression par domaine).

**Sources d'XP globale (toutes activités futures) :**

```
enum ProgressionSource {
  COMBAT      = 'COMBAT',
  RESOURCE    = 'RESOURCE',
  CRAFT       = 'CRAFT',
  QUEST       = 'QUEST',
  EXPLORATION = 'EXPLORATION',
  EVENT       = 'EVENT',
  ADMIN       = 'ADMIN',
}
```

**`ProgressionService`** — service générique couvrant toutes les sources présentes et futures :

```
ProgressionService.applyCharacterXpInTx(
  characterId : string,
  amount      : number,
  source      : ProgressionSource,
  manager     : EntityManager,
): Promise<{ level: number; experience: number; nextLevelXp: number; leveledUp: boolean }>
```

Règles :
- `amount <= 0` → retourne l'état courant sans mutation
- XP plafonnée à `characterMaxLevel` (lu depuis `GameConfig`)
- Level-up en cascade si plusieurs niveaux sont franchis en un seul appel
- La source `ProgressionSource` est tracée à des fins d'audit et de statistiques

**Formule (pilotée par `GameConfig.Progression`) :**

```
nextLevelXp(level) = round(characterBaseXpPerLevel × level ^ characterXpCurveExponent)
```

Les paramètres ne sont pas hardcodés — ils sont lus depuis `GameConfig` en mémoire (cache après le premier appel au démarrage).

**Séparation skill / personnage :**

| | XP skill (`PlayerSkill`) | XP personnage (`Character`) |
|---|---|---|
| Entité cible | `PlayerSkill` par `skillDefinitionId` | `Character.experience` + `Character.level` |
| Service | `SkillsService.applyXpInTx()` | `ProgressionService.applyCharacterXpInTx()` |
| Courbe | Paramètres de `SkillDefinition` | Paramètres de `GameConfig.Progression` |
| Champ template | `killSkillXpReward` + `killSkillDefinitionId` | `killCharacterXpReward` |
| Event socket | `skill_update` | `character_xp_update` |

**Event `character_xp_update` :**

```typescript
{
  level       : number,   // nouveau niveau
  experience  : number,   // XP courante dans le niveau
  nextLevelXp : number,   // XP requise pour le niveau suivant
  leveledUp   : boolean,  // true si au moins un niveau franchi
}
```

Émis uniquement si `amount > 0`. Cible le socket du personnage. Ne déclenche pas `character:reload` (rechargement complet) — payload suffisamment complet pour une mise à jour locale du store.

**Phase 1.5 :** seules les sources `COMBAT` et `ADMIN` alimentent `ProgressionService`. Les autres sources (RESOURCE, CRAFT, etc.) sont réservées aux phases suivantes.

---

## Paramètres configurables — récapitulatif complet

### CreatureTemplate — champs à ajouter

#### Section Encounter

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `encounterEnabled` | `boolean` | `true` | Active le système d'Encounter pour cette créature |
| `encounterLockDuration` | `int` | `0` | Durée du lock initial en secondes (0 = permanent) |
| `encounterBreakDistanceWU` | `int` | `3000` | Distance de rupture de l'Encounter (WU) |
| `encounterBreakTimeout` | `int` | `30` | Inactivité de combat avant reset (secondes) |

#### Section XP

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `xpPolicy` | `XpPolicy` | `GROUP_SHARED` | Politique d'attribution XP |
| `killSkillXpReward` | `int` | `10` | XP accordée au `PlayerSkill` ciblé au kill |
| `killCharacterXpReward` | `int` | `0` | XP accordée à `Character.experience` au kill |
| `killSkillDefinitionId` | `uuid \| null` | `null` | FK nullable vers `SkillDefinition` — skill ciblé explicitement. Si `null`, fallback `resolveCombatSkill(equipment)` |
| `xpDistributionMode` | `XpDistributionMode` | `PROPORTIONAL` | Mode de distribution XP |
| `groupBonusPercent` | `float` | `1.2` | Multiplicateur XP en groupe |
| `eligibilityRadiusWU` | `int` | `2000` | Rayon d'éligibilité XP (WU) |

**Règle d'attribution au kill :**
- `killSkillDefinitionId` non-null → utiliser ce `SkillDefinition` directement pour l'XP skill
- `killSkillDefinitionId` null → fallback `resolveCombatSkill(equipment)` (comportement legacy, documenté comme transitoire)
- `killSkillXpReward == 0` → bloc skill XP ignoré
- `killCharacterXpReward == 0` → bloc XP globale personnage ignoré
- Les deux blocs sont **indépendants** — on peut accorder l'un sans l'autre

#### Section Loot

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `lootPolicy` | `LootPolicy` | `GROUP_SHARED` | Politique d'attribution loot |

#### Section Contribution

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `minimumContributionPercent` | `float` | `0.01` | Seuil minimum de score pour être éligible (0 = désactivé) |
| `contributionTimeoutSeconds` | `int` | `120` | Inactivité max avant exclusion |

### ResourceTemplate — champs à ajouter / modifier

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `difficultyLevel` | `int` | `1` | Niveau de difficulté [1-100] |
| `recommendedSkillLevel` | `int` | `0` | Affiché en UI — aucun blocage serveur |
| `failureXpReward` | `int` | `0` | XP accordée en cas d'échec |
| `failureRewardMode` | `FailureRewardMode` | `NONE` | Comportement en cas d'échec |
| `successChanceMin` | `float` | `20.0` | Chance de succès minimale (%) |
| `successChanceMax` | `float` | `95.0` | Chance de succès maximale (%) |

Supprimé : `requiredSkillLevel` — remplacé par `recommendedSkillLevel` (informatif).

### GameConfig — configuration globale

#### Section Progression personnage

Centralise la courbe XP de `Character.level`. L'algorithme vit dans `ProgressionService` — les paramètres sont modifiables via Studio sans changement de code.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `characterBaseXpPerLevel` | `int` | `100` | Base XP pour passer du niveau N au niveau N+1 |
| `characterXpCurveExponent` | `float` | `1.5` | Exposant de la courbe — `nextLevelXp = base × level ^ exponent` |
| `characterMaxLevel` | `int` | `100` | Niveau personnage maximum |

Formule : `nextLevelXp(level) = round(characterBaseXpPerLevel × level ^ characterXpCurveExponent)`

Cette formule est identique à la formule `SkillDefinition` (mêmes paramètres, même algorithme). Les deux sont indépendants — `GameConfig.Progression` ne remplace pas les `SkillDefinition` individuelles.

**`GameConfig` est un domaine transversal**, jamais propriété d'un domaine métier :

```
apps/api-gateway/src/game-config/
  game-config.entity.ts    — entité singleton (id=1)
  game-config.service.ts   — getConfig(), invalidateCache()
  game-config.module.ts    — exports GameConfigService
```

`GameConfigService` est consommé par : `ProgressionService`, `CreaturesService`, `RewardService`, `EconomyService`, `LootService`, `CraftingService`, et tout domaine futur nécessitant des paramètres globaux (météo, saisons, PvP, events).

**Invalidation du cache :**

Chaque modification de `GameConfig` via le Studio appelle `GameConfigService.invalidateCache()`. Le prochain appel à `getConfig()` recharge depuis la DB. Cette invalidation est prévue dès la création du service — même avant que le panneau Studio `GameConfig` soit implémenté.

```
Admin modifie GameConfig (Studio)
  ↓
GameConfigService.update(fields)
  ↓
  this.cachedConfig = null   // invalidate
  ↓
Prochain getConfig() → reload DB → re-cache
```

#### Section XP globale (multiplicateurs gameplay)

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `xpRateMultiplier` | `float` | `1.0` | Multiplicateur global toutes sources |
| `combatXpRateMultiplier` | `float` | `1.0` | Multiplicateur XP combat |
| `gatheringXpRateMultiplier` | `float` | `1.0` | Multiplicateur XP récolte |
| `craftXpRateMultiplier` | `float` | `1.0` | Multiplicateur XP craft |

Ces multiplicateurs s'appliquent à l'XP skill ET à l'XP personnage.

#### Section Contribution globale

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `minimumContributionPercent` | `float` | `0.01` | Seuil global (écrasé par le template) |
| `contributionTimeoutSeconds` | `int` | `120` | Timeout global (écrasé par le template) |

#### Section ContributionWeights

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `damageWeight` | `float` | `1.00` | Poids des dégâts |
| `healingWeight` | `float` | `0.90` | Poids des soins |
| `tankingWeight` | `float` | `0.80` | Poids du tanking |
| `buffWeight` | `float` | `0.60` | Poids des buffs |
| `debuffWeight` | `float` | `0.70` | Poids des debuffs |
| `objectiveWeight` | `float` | `1.00` | Poids des objectifs |

---

## Convention transversale — Séparation XP personnage / XP compétence

**Décision adoptée à partir de la Phase 1.5. S'applique à tout domaine gameplay futur.**

Chaque source de récompense XP (combat, récolte, craft, quête, exploration, event) doit distinguer explicitement deux canaux indépendants :

| Canal | Cible | Champ de template | Service | Événement socket |
|---|---|---|---|---|
| XP personnage | `Character.experience` → `Character.level` | `kill/gather/craftCharacterXpReward` | `ProgressionService.applyCharacterXpInTx` | `character_xp_update` |
| XP compétence | `PlayerSkill.xp` → `PlayerSkill.level` | `kill/gather/craftSkillXpReward` | `SkillsService.applyXpInTx` | `skill_update` |

**Règles :**

1. Les deux récompenses sont optionnelles et indépendantes : une créature peut donner uniquement de l'XP personnage, uniquement du skill XP, les deux, ou aucune.
2. Une source ne récompense qu'**un seul skill cible** par template dans cette phase. Pas de multi-skill (réservé phases futures).
3. Le skill cible est référencé par FK nullable vers `SkillDefinition`. Si null → fallback `resolveCombatSkill(equipment)` (legacy Phase 1).
4. Les deux canaux doivent être crédités dans la **même transaction** que la mutation principale (kill, récolte confirmée, craft).
5. `ProgressionService` est le seul point d'entrée pour créditer de l'XP personnage. Zéro mutation directe de `Character.experience` hors de ce service.
6. Le frontend reçoit **deux événements distincts** et les applique indépendamment : `skill_update` met à jour la liste des skills, `character_xp_update` met à jour `character.level/experience/nextLevelXp` localement.

**Application par domaine :**

- **Combat** (Phase 1.5 — Implemented) : `killCharacterXpReward` + `killSkillXpReward` + `killSkillDefinitionId`
- **Récolte** (Planned) : `gatherCharacterXpReward` + `gatherSkillXpReward` + FK `SkillDefinition`
- **Craft** (Planned) : `craftCharacterXpReward` + `craftSkillXpReward` + FK `SkillDefinition`
- **Quêtes / Events / Exploration** (Planned) : même pattern via `ProgressionSource` adapté

---

## Architecture cible — diagrammes

### Diagramme 1 — Cycle de vie de l'Encounter Runtime

```
Premier attack_creature sur creatureId X
        ↓
EncounterRuntime.create(creature, attacker)
  encounter = {
    ownerType = PARTY si attacker.partyId, sinon PLAYER
    ownerId   = partyId ou characterId
    state     = LOCKED (ou PUBLIC si xpPolicy/lootPolicy = PUBLIC)
    startedAt = now
    participants = new Map()
  }
        ↓
Chaque attaque suivante :
  EncounterRuntime.recordContribution(creatureId, characterId, delta)
    if (state === LOCKED && !isOwnerMember(characterId)) → ignorer
    contribution.damage += delta.damage
    contribution.lastContributionAt = now
        ↓
Mort de la créature :
  encounter = EncounterRuntime.close(creatureId)   // retire l'Encounter de la Map
  contributions = computeScores(encounter.participants)
  eligible = filterEligibleContributors(contributions, creature, template)
  → handleKill (transaction)
        ↓
Reset / timeout / breakDistance :
  EncounterRuntime.reset(creatureId)   // supprime sans récompense
  creature.regainHp()
```

### Diagramme 2 — Pipeline de récompense combat

```
[Client] attack_creature(creatureId)
         ↓
[CreaturesGateway] validate auth, payload shape
         ↓
[CreaturesService.handleAttack()]
  1. checkInteraction (distance WU — barrière anti-cheat)
  2. cooldown check
  3. damage = computeDamage(character, creature)
  4. creature.health -= damage
  5. EncounterRuntime.recordContribution(creatureId, characterId, { damage })
  6. if creature.health ≤ 0 → handleKill(creatureId)
         ↓
[handleKill(creatureId)]
  dataSource.transaction(async manager =>
    1. encounter    = EncounterRuntime.close(creatureId)
    2. contributions = computeScores(encounter.participants)
    3. eligible     = filterEligibleContributors(contributions, creature, template)
    4. lootEntries  = LootService.generateLoot(template.lootPool)
    5. context = {
         trigger: KILL,
         encounter,
         contributions: eligible,
         xpPolicy: template.xpPolicy,
         lootPolicy: template.lootPolicy,
         distributionMode: template.xpDistributionMode,
         skillKey: template.killSkillDefinitionId
                     ? template.killSkillDefinition.key
                     : resolveCombatSkill(primaryAttacker.equipment),
         baseXpAmount: template.killSkillXpReward,
         characterXpAmount: template.killCharacterXpReward,
         lootEntries,
         groupBonusPercent: template.groupBonusPercent,
         xpRateMultiplier: gameConfig.combatXpRateMultiplier,
         minimumContributionPercent: template.minimumContributionPercent,
       }
    6. result = await RewardService.applyRewards(manager, context)
    7. creature.state = DEAD, respawn scheduled
  )
         ↓
[emit] skill_update × éligibles, inventory_update × loot, creature_update
```

### Diagramme 3 — Pipeline de récompense récolte

```
[Client] gather_complete (déclenché par timer serveur)
         ↓
[ResourcesGateway] validate auth, gather session, distance
         ↓
[ResourcesService.completeGather(characterId, resourceId)]
  dataSource.transaction(async manager =>
    1. template    = resource.template
    2. skillLevel  = getPlayerSkillLevel(characterId, template.skillKey) ?? 0
    3. chance      = GatheringMath.computeSuccessChance(skillLevel, template)
    4. success     = RandomService.roll(chance)

    if success:
      lootEntries = LootService.generateLoot(template.lootPool)
      xpAmount    = template.gatheringXpReward
    else:
      lootEntries = resolveLootFailure(template)   // selon failureRewardMode
      xpAmount    = template.failureXpReward

    5. context = {
         trigger: GATHER,
         encounter: null,
         contributions: [{ characterId, damage: 1, score: 1, ...zeros }],
         xpPolicy: SOLO,
         lootPolicy: SOLO,
         distributionMode: PROPORTIONAL,
         skillKey: template.skillKey,
         baseXpAmount: xpAmount,
         lootEntries,
         xpRateMultiplier: gameConfig.gatheringXpRateMultiplier,
         minimumContributionPercent: 0,
       }
    6. result = await RewardService.applyRewards(manager, context)
    7. resource.remainingLoots--
  )
         ↓
[emit] gather_result { success }, skill_update, inventory_update, resource_update
```

### Diagramme 4 — Architecture interne RewardService

```
RewardService.applyRewards(manager, context)
         │
         ├─→ XpDistributor.distribute(manager, context)
         │     1. resolveXpRecipients(context)    // selon xpPolicy + encounter
         │     2. pour chaque bénéficiaire :
         │          xp = computeXpShare(mode, contributions, baseXp)
         │          SkillsService.applyXpInTx(playerSkill, xp, skillDef, manager)
         │     Retourne SkillUpdateEvent[] (avec leveledUp: boolean)
         │
         ├─→ LootDistributor.distribute(manager, context)
         │     1. resolveLootRecipients(context)  // selon lootPolicy + encounter
         │     2. pour chaque lootEntry × bénéficiaire :
         │          ItemMaterializationService.materialize(manager, {...})
         │     Retourne LootEvent[]
         │
         ├─→ EconomyDistributor.distribute(manager, context)
         │     Si baseGoldAmount > 0 :
         │       Distribue gold selon même logique que XP
         │       EconomyService.credit(manager, characterId, amount)
         │     Retourne BalanceEvent[]
         │
         ├─→ ReputationDistributor (futur)
         ├─→ QuestDistributor (futur)
         └─→ AchievementDistributor (futur)
         │
         └─→ RewardResult {
               skillUpdates   : SkillUpdateEvent[],
               lootGranted    : LootEvent[],
               economyUpdates : BalanceEvent[],
             }
```

### Diagramme 5 — ContributionScore et éligibilité

```
ContributionTracker.flush(encounter)
         ↓
ContributionScoreCalculator.compute(participants, weights)
  pour chaque contribution c :
    c.score = c.damage   × weights.damageWeight
            + c.healing  × weights.healingWeight
            + c.tanking  × weights.tankingWeight
            + c.buffs    × weights.buffWeight
            + c.debuffs  × weights.debuffWeight
            + c.objective × weights.objectiveWeight
         ↓
filterEligibleContributors(contributions, creature, template, gameConfig)
  totalScore = Σ contributions[i].score
  pour chaque contribution c :
    c.isEligible = true
    c.exclusionReason = null

    si (now - c.lastContributionAt) > template.contributionTimeoutSeconds × 1000
      → isEligible = false, exclusionReason = 'timeout'

    si c.score === 0
      → isEligible = false, exclusionReason = 'no_contribution'

    si character.mapId !== creature.mapId
      → isEligible = false, exclusionReason = 'wrong_map'

    si distance(character, creature) > template.eligibilityRadiusWU
      → isEligible = false, exclusionReason = 'out_of_range'

    si totalScore > 0 && (c.score / totalScore) < template.minimumContributionPercent
      → isEligible = false, exclusionReason = 'score_below_minimum'

    si xpPolicy = SOLO || PARTY et character non membre du groupe propriétaire
      → isEligible = false, exclusionReason = 'not_owner'

  retourne Contribution[] filtrée (isEligible = true)
```

### Diagramme 6 — Exemple avec rôles multiples (Phase 2+)

```
Goblin Champion (HP 1200) tué par un groupe de 3 :

  Guerrier  : damage=800, healing=0,   tanking=0,   score=800
  Prêtre    : damage=0,   healing=700, tanking=0,   score=700×0.90=630
  Barde     : damage=50,  healing=0,   buffs=500,   score=(50×1.0)+(500×0.60)=350
  BotTest   : damage=0,   healing=0,   tanking=0,   score=0  → exclu (no_contribution)

  totalScore = 800 + 630 + 350 = 1780
  killSkillXpReward = 120 XP × xpRateMultiplier 1.0 = 120 XP (skill combat)
  killCharacterXpReward = 30 XP → ProgressionService (XP globale personnage)

  Guerrier  : 120 × (800/1780)  = 53.9 XP
  Prêtre    : 120 × (630/1780)  = 42.5 XP
  Barde     : 120 × (350/1780)  = 23.6 XP
  BotTest   : 0 XP

Le Prêtre reçoit 42 XP sans avoir infligé un seul dégât.
Le Barde, qui n'a frappé qu'une fois, reçoit 23 XP grâce à ses buffs.
```

---

## DevTools — panneaux

### Panneau CreatureTemplate (extension)

Sections à ajouter dans le formulaire d'édition existant :

**Section Encounter :**
- `encounterEnabled` — toggle
- `encounterLockDuration` — champ numérique (0 = permanent)
- `encounterBreakDistanceWU` — champ numérique
- `encounterBreakTimeout` — champ numérique

**Section XP :**
- `xpPolicy` — dropdown (SOLO / GROUP_SHARED / PUBLIC)
- `killSkillXpReward` — champ numérique (0–100 000) — XP skill combat
- `killCharacterXpReward` — champ numérique (0–100 000) — XP globale personnage
- `killSkillDefinitionId` — dropdown filtrable depuis `SkillDefinition` — null = fallback `resolveCombatSkill`
- `xpDistributionMode` — dropdown (PROPORTIONAL / GROUP_SHARE / LAST_HIT)
- `groupBonusPercent` — slider (1.0–3.0)
- `eligibilityRadiusWU` — champ numérique

**Section Loot :**
- `lootPolicy` — dropdown (SOLO / GROUP_SHARED / PUBLIC)

**Section Contribution :**
- `minimumContributionPercent` — slider (0–20%, pas 0.5%)
- `contributionTimeoutSeconds` — champ numérique

### Panneau ResourceTemplate (extension)

- `difficultyLevel` — slider (1–100)
- `recommendedSkillLevel` — champ numérique (label "Recommandé — info uniquement")
- `failureRewardMode` — dropdown
- `failureXpReward` — champ numérique
- `successChanceMin` / `successChanceMax` — dual slider (0–100%)

### Panneau GameConfig (nouveau)

**Section XP globale :**
- Sliders `xpRateMultiplier`, `combatXpRateMultiplier`, `gatheringXpRateMultiplier`, `craftXpRateMultiplier`
- Bouton "Événement ×2" — active `xpRateMultiplier = 2.0` avec durée configurable

**Section ContributionWeights :**
- Sliders pour chacun des 6 poids (0.0–2.0, pas 0.05)
- Affichage de la somme pondérée normalisée pour validation
- Bouton "Réinitialiser aux défauts"

**Section Contribution globale :**
- `minimumContributionPercent`, `contributionTimeoutSeconds`

### Panneau SkillDefinition (nouveau)

- Liste paginée des `SkillDefinition`
- Champs éditables : `baseXpPerLevel`, `xpCurveExponent`, `maxLevel`, `enabled`
- Graphe de courbe XP : `f(level) = baseXpPerLevel × level ^ xpCurveExponent`

### Panneau Player Inspector (extension)

- Action `admin:give_xp` : `{ characterId, skillKey, amount }`
- Liste des skills du personnage (key, level, xp, nextLevelXp)

### Combat Contribution Inspector (nouveau — lecture seule)

Panneau de debug temps réel, rôle `ADMIN` uniquement. Route `/admin/combat/encounters`.

```
┌─ Combat Contribution Inspector ──────────────────────────────────────┐
│ Créature       : Goblin Champion [id: c-4a2f]                        │
│ HP             : 340 / 1200                                          │
│ État Encounter : LOCKED                                              │
│ Propriétaire   : Mihai (PLAYER)                                      │
│ Démarré il y a : 28s                                                 │
│ Inactivité     : 2s / 30s avant reset                                │
├──────────────────────────────────────────────────────────────────────┤
│ Participants                                                          │
│                                                                       │
│  Joueur   Dmg  Heal Tank Buff  Score  Élig.  Raison  XP prévue      │
│  Mihai    780  0    0    0     780    ✓       —       31.2 XP        │
│  Anya     420  85   0    0     496    ✓       —       19.9 XP        │
│  Prêtre   0    240  0    0     216    ✓       —       8.7 XP         │
│  BotTest  0    0    0    0     0      ✗       timeout  0 XP          │
│                                                                       │
│ Score total : 1492                                                    │
│ Mode        : PROPORTIONAL                                           │
│ XP base     : 60 XP × ×0.80 (xpRateMultiplier) = 48 XP effective   │
├──────────────────────────────────────────────────────────────────────┤
│ Loot prévu (simulation — non-committing)                             │
│  - Iron Ore ×2                                                        │
│  - Goblin Tooth ×1                                                   │
│ lootPolicy : GROUP_SHARED → tous les éligibles                       │
└──────────────────────────────────────────────────────────────────────┘
```

**Contraintes :**
- Lecture seule — aucune action depuis ce panneau.
- Le loot est une simulation probabiliste — le vrai loot est généré à la mort.
- Endpoint `GET /admin/combat/encounters/:creatureId` — route `/admin/*`.
- Les soins (`Heal`), tanking (`Tank`) et buffs (`Buff`) apparaissent à `0` en Phase 1
  et sont affichés avec un indicateur "Phase 2+".

---

## Plan d'implémentation par phases

### Phase 1 — Fondations critiques

| Tâche | Effort |
|---|---|
| `RandomService` injectable | Faible |
| `EncounterRuntime` en mémoire (créer, record, close, reset) | Moyen |
| Remplacer `KILL_XP = 10` par `template.killXpReward` | Faible |
| XP combat dans la transaction de kill (`applyXpInTx`) | Faible |
| `ContributionScore` Phase 1 = `damage` (poids = 1.0) | Faible |
| `filterEligibleContributors` avec timeout, radius, score | Moyen |
| `leveledUp: boolean` dans `skill_update` | Faible |
| Tests : contribution, éligibilité, distribution PROPORTIONAL | Moyen |

### Phase 1.5 — Character Progression + clarification XP kill

| Tâche | Effort |
|---|---|
| Renommer `killXpReward` → `killSkillXpReward` sur `CreatureTemplate` | Faible |
| Ajouter `killCharacterXpReward` (default 0) sur `CreatureTemplate` | Faible |
| Ajouter `killSkillDefinitionId` FK nullable vers `SkillDefinition` | Faible |
| Créer `GameConfig` entity — section Progression (`characterBaseXpPerLevel`, `characterXpCurveExponent`, `characterMaxLevel`) | Moyen |
| Créer `ProgressionService` — `applyCharacterXpInTx(characterId, amount, source, manager)` | Moyen |
| Brancher `killCharacterXpReward` dans `CreaturesService.kill` (source COMBAT) | Faible |
| Émettre `character_xp_update` au kill si `killCharacterXpReward > 0` | Faible |
| DevTools : exposer `killSkillXpReward`, `killCharacterXpReward`, `killSkillDefinitionId` dans le formulaire template | Faible |
| Frontend : `character_xp_update` → mise à jour locale du store sans `character:reload` | Faible |
| Tests : `ProgressionService` (level-up, plafond, source), `CreaturesService` (deux blocs XP indépendants) | Moyen |

### Phase 2 — RewardService + Encounter complet

| Tâche | Effort |
|---|---|
| `RewardService` + `XpDistributor` + `LootDistributor` + `EconomyDistributor` | Moyen |
| `xpPolicy` + `lootPolicy` sur `CreatureTemplate` | Moyen |
| `encounterEnabled`, `encounterBreakTimeout`, `encounterBreakDistanceWU` | Moyen |
| `minimumContributionPercent` dans `filterEligibleContributors` | Faible |
| `GameConfig` entity (`xpRateMultiplier`, `contributionTimeoutSeconds`, défauts) | Moyen |
| Brancher les 3 domaines (combat, récolte, craft) sur `RewardService` | Moyen |
| Tests RewardService (tous les modes, xpPolicy, lootPolicy) | Moyen |

### Phase 3 — Récolte avancée + ContributionWeights

| Tâche | Effort |
|---|---|
| `GatheringMath.computeSuccessChance()` + `RandomService.roll()` | Faible |
| `failureRewardMode` + `resolveLootFailure()` | Moyen |
| `ContributionWeights` dans `GameConfig` | Faible |
| `ContributionScoreCalculator` avec poids configurables | Moyen |
| Panneau GameConfig DevTools (weights, multiplicateurs) | Moyen |
| Tests `GatheringMath`, `ContributionScoreCalculator` | Moyen |

### Phase 4 — DevTools complets + rôles (healing, tanking, buffs)

| Tâche | Effort |
|---|---|
| `healing`, `tanking`, `buffs`, `debuffs` alimentés dans `Contribution` | Moyen |
| Combat Contribution Inspector (panneau admin) | Moyen |
| Panneau SkillDefinition | Moyen |
| `admin:give_xp` dans Player Inspector | Faible |
| Panneau CreatureTemplate étendu (Encounter, XP, Loot, Contribution) | Moyen |

### Phase 5 — Distributeurs futurs (après systèmes associés)

| Distributeur | Prérequis |
|---|---|
| `ReputationDistributor` | Système faction |
| `QuestDistributor` | Système de quêtes |
| `AchievementDistributor` | Système d'achievements |
| `GROUP_SHARE` réel | Système de groupe formalisé |

---

## Sécurité

| Risque | Protection |
|---|---|
| XP multicompte | Éligibilité par `characterId` — `score > 0` requis, timeout actif |
| AFK farming | `contributionTimeoutSeconds` — exclusion des contributeurs inactifs |
| Heal de 1 HP pour voler le loot | `minimumContributionPercent` + `healingWeight` réduit + règle "soin utile uniquement" |
| Kill steal (XP vol) | Mode `PROPORTIONAL` par défaut — chacun reçoit sa part proportionnelle |
| Dégâts artificiels | `checkInteraction` (WU L∞) avant tout `recordContribution` |
| Duplication de récompense | `EncounterRuntime.close()` vide l'Encounter — double appel retourne `{}` |
| Transaction partielle | `RewardService` dans la transaction de l'appelant — rollback total si erreur |
| Injection de paramètre client | `killSkillXpReward`, `killCharacterXpReward`, `xpPolicy` lus depuis DB — jamais du payload client |
| Mort simultanée (race) | Verrou `pessimistic_write` sur la créature dans la transaction de kill |
| Disconnexion pendant combat | La contribution est dans `EncounterRuntime` en mémoire — le joueur reçoit l'XP à la mort de la créature |
| Loot-tagging (vol d'Encounter) | `state = LOCKED` par défaut — les non-propriétaires ne contribuent pas |
| admin:give_xp | `@Roles(ADMIN)` + guard JWT — route `/admin/*` |
| Combat Contribution Inspector | Route `/admin/*`, rôle ADMIN — non accessible aux joueurs |
| ContributionWeights admin | Route `/admin/config` — ne peut pas être modifiée par un joueur |

---

## Compatibilité

### ADR-0014 — Equipment Runtime V2

`recalculateEquipmentStats` est appelé dans la transaction d'equip/unequip.
`RewardService` opère dans la transaction de kill/gather/craft — transactions
indépendantes. `resolveCombatSkill()` lit `CharacterEquipment` en DB — lecture
correcte et non conflictuelle. L'Encounter Runtime vit exclusivement en mémoire —
aucune table partagée avec l'équipement.

**Verdict : aucun conflit.**

### ADR-0015 — Inventory Container Architecture

`LootDistributor` passe par `ItemMaterializationService`. La future table `InventorySlot`
(ADR-0015) ne modifie pas `LootDistributor`. Les politiques de loot (`lootPolicy`)
déterminent qui reçoit quoi — la destination physique dans l'inventaire reste la
responsabilité d'ADR-0015.

**Verdict : aucun conflit. Les deux systèmes sont orthogonaux.**

### ADR-0004 — Runtime-Driven Architecture

L'XP et `PlayerSkill.level/xp` sont des mutations persistantes, pas des stats dérivées.
Ils n'entrent pas dans `EntityRuntimeSnapshot`. L'Encounter Runtime est une structure
en mémoire spécifique au gameplay de combat — il n'est pas un `EntityRuntimeSnapshot`.

Quand les skills passifs influenceront les stats dérivées (ex. bonus dégâts via
`two_handed`), cette influence passera par une `PassiveSkillSource` dans le pipeline
Runtime (ADR-0004 Example 4). Ces deux systèmes sont complémentaires sans
se chevaucher.

**Verdict : aucun conflit.**

### Client-Server Boundaries

- L'Encounter Runtime est invisible au client — il vit exclusivement en mémoire serveur.
- Toute décision d'éligibilité, de score, de distribution est prise côté serveur.
- Le client reçoit uniquement `skill_update`, `inventory_update`, `gather_result`.
- `RandomService` est exclusivement côté serveur.
- Les poids `ContributionWeights` sont une configuration admin — jamais transmise au client.
- `recommendedSkillLevel` peut être transmis au client à titre informatif — jamais
  comme condition d'accès.
- Le Combat Contribution Inspector est une route `/admin/*` — inaccessible aux joueurs.

**Verdict : aucun conflit. Les frontières sont renforcées.**

---

## Règles critiques découlant de cette ADR

- **`RewardService`** est le seul point de coordination des récompenses.
  Aucun service domaine ne crédite XP, loot ou monnaie directement sans lui.
- **`EncounterRuntime`** est le seul point de création et de fermeture des Encounters.
  Aucun service ne modifie `encounter.participants` directement.
- **`RandomService`** est le seul fournisseur de hasard. `Math.random()` est interdit
  dans tous les services gameplay.
- **`ContributionScoreCalculator`** est le seul calculateur de score.
  Aucun service ne calcule `contribution.score` directement.
- **`filterEligibleContributors`** est le seul point de filtrage d'éligibilité.
  Aucun Distributeur ne filtre lui-même ses bénéficiaires.
- **`recommendedSkillLevel`** est informatif uniquement. Aucun code serveur ne bloque
  sur cette valeur.
- **`WINNER`** n'est pas un mode de distribution valide.
- **`XpDistributor`** ne fait pas d'I/O. Il calcule en mémoire pure.
- **Le client ne calcule jamais** XP, score, éligibilité ou loot. Tout résultat
  affiché au client lui a été envoyé par le serveur.

---

## Validation

- [x] Architecture Encounter Runtime examinée par le responsable du projet.
- [x] ContributionScore et poids validés (Phase 1 puis Phase 2+).
- [x] Politiques xpPolicy / lootPolicy validées (combinaisons exemples).
- [x] Loot GROUP_SHARED = set partagé, PUBLIC = copies individuelles — fixé.
- [x] RandomService : prod = source sécurisée non prédictible, tests = seed contrôlée — fixé.
- [x] Compatibilité ADR-0014, ADR-0015, ADR-0004 vérifiée — aucun conflit.
- [x] Sécurité examinée.
- [x] Plan d'implémentation par phases validé.
- [x] Validation humaine enregistrée — 2026-07-01 par Mihai Radulescu.

---

## Open questions

- **Encounter transitoire entre zone ?** Si un joueur quitte la zone pendant un Encounter
  `LOCKED` puis revient, reprend-il sa place dans le groupe propriétaire ? À définir
  avant Phase 2.

- **Encounter pour les ressources ?** La récolte est actuellement solo. Si plusieurs
  joueurs peuvent récolter la même ressource simultanément (futur), faut-il un
  Encounter de type `resource` ? À définir avant Phase 3.

- **countSummonDamage ?** Les dégâts infligés à des invocations ou des miroirs de boss
  doivent-ils compter dans le score ? Cela peut être exploité pour gonfler son score.
  À décider par template avant Phase 2.

---

## Non-goals

- Cette ADR ne définit pas le système de groupe (Social Phase 6).
- Elle ne définit pas le système de réputation ou d'achievements.
- Elle ne définit pas `CreatureRuntimeService` ni `ResourceRuntimeService` (ADR-0004).
- Elle ne crée pas de migration TypeORM.
- Elle n'implémente pas le loot individuel vs partagé en groupe (open question).
- Elle ne définit pas la qualité du loot liée au skill (Phase 4).
- Elle ne définit pas les règles de PvP (trigger PVP est réservé).

---

## Related files

- [ADR-0004 — Runtime-Driven Architecture](ADR-0004-runtime-driven-architecture.md)
- [ADR-0006 — Economy Transaction Model](ADR-0006-economy-transaction-model.md)
- [ADR-0010 — Object Runtime Model](ADR-0010-object-runtime-model.md)
- [ADR-0011 — Item Materialization Pipeline](ADR-0011-item-materialization-pipeline.md)
- [ADR-0012 — Gameplay Architecture V1](ADR-0012-gameplay-architecture.md)
- [ADR-0014 — Equipment Runtime V2](ADR-0014-equipment-runtime-v2.md)
- [ADR-0015 — Inventory Container Architecture](ADR-0015-inventory-container-architecture.md)
- [Client-Server Boundaries](../client-server-boundaries.md)
- [Runtime Roadmap](../../09_Workflow/runtime-roadmap.md)
- [Implementation Rules](../../10_AI/implementation-rules.md)
