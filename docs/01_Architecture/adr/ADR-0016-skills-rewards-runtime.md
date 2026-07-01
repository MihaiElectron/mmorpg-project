# ADR-0016 — Séparation XP personnage / XP compétence & Runtime Skill Progression

**Statut :** Accepted  
**Date :** 2026-07-01  
**Contexte :** Skills & Rewards — Phase 1.5 (Character XP) + Phase 2 (Skill XP Runtime)

---

## Contexte

Le projet distingue deux canaux d'XP aux règles de source radicalement différentes :

- **XP personnage** — niveau général du personnage, configurée statiquement sur les templates de domaine.
- **XP compétence** — progression par discipline (combat, récolte, craft…), calculée dynamiquement par le Runtime à partir du contexte de l'action.

Ces deux canaux ne doivent jamais être confondus ni fusionnés. Cette ADR les verrouille définitivement.

---

## Décisions

---

### Canal 1 — XP globale du personnage

**Immuable.** Rien ne change dans cette partie.

- Accordée par **récompense de domaine** configurée statiquement sur les entités template.
- Traitée par `ProgressionService.applyCharacterXpInTx(characterId, amount, source, manager)` dans la transaction de l'appelant.
- Notifiée au client via `character_xp_update` : `{ level, experience, nextLevelXp, leveledUp }`.
- `GET /characters/me` expose `nextLevelXp` calculé depuis `GameConfig` (singleton configurable).
- Formule : `nextLevelXp(level) = Math.round(characterBaseXpPerLevel × level ^ characterXpCurveExponent)`.

Champs de récompense par domaine (non exhaustif) :

| Template | Champ | Déclencheur |
|---|---|---|
| `CreatureTemplate` | `killCharacterXpReward` | kill confirmé serveur |
| `ResourceTemplate` | `gatherCharacterXpReward` | récolte complète validée |
| `CraftRecipe` | `craftCharacterXpReward` | craft terminé avec succès |
| Quête | `questCharacterXpReward` | quête complétée |
| Zone / Event | `explorationCharacterXpReward` | déclencheur contextuel |

**Règle** : tout nouveau domaine accordant de l'XP personnage passe exclusivement par `ProgressionService.applyCharacterXpInTx` dans sa propre transaction (ou celle partagée, cf. section Transaction).

---

### Canal 2 — XP des compétences

**Le Runtime est le seul décideur.**

Un template ne décide jamais :
- quel skill reçoit de l'XP
- combien d'XP il reçoit

Le template fournit uniquement le **contexte gameplay** :
- difficulté, type, catégorie
- paramètres utiles à l'évaluation (tier, qualité attendue, etc.)

Le Runtime décide ensuite, via `calculateSkillXp(context)`, du skill concerné et de la quantité d'XP.

**Règle critique** :

> **Aucun template (CreatureTemplate, ResourceTemplate, CraftRecipe…) ne porte de champ `*SkillXpReward` ni de champ `*SkillKey`.**

Il n'y a pas de `gatherSkillXpReward`, pas de `craftSkillXpReward`, pas de `killSkillDefinitionId`. Ces champs sont architecturalement interdits.

---

### SkillXpContext

`SkillXpContext` est le contrat de données qui transite entre les domaines et le calculateur Runtime.

Chaque domaine construit son propre contexte. Aucun domaine ne calcule directement l'XP.

```
SkillXpContext {
  domain       : 'combat' | 'gathering' | 'crafting' | 'magic' | 'support' | ...
  action       : string          // 'attack_hit', 'parry', 'block', 'gather', 'craft', 'heal', ...
  success      : boolean         // action réussie ou non
  difficulty   : number          // niveau de difficulté de la cible / ressource / recette
  quality      : number | null   // qualité du résultat (craft, récolte) — null si non applicable
  damage       : number | null   // dégâts infligés — coefficient, pas source primaire
  blockedDamage: number | null   // dégâts bloqués (bouclier, parade)
  healedAmount : number | null   // soins appliqués
  duration     : number | null   // durée de l'action en ms si pertinent
  tool         : string | null   // clé de l'outil utilisé (mining, fishing...)
  weapon       : string | null   // weaponType de l'arme équipée
  resource     : string | null   // clé de ResourceTemplate
  recipe       : string | null   // clé de CraftRecipe
  targetLevel  : number | null   // level de la créature / difficulté cible
  characterLevel: number         // level courant du personnage
  skillLevel   : number | null   // level courant du skill concerné (si déjà connu)
  buffs        : string[]        // clés de buffs actifs influençant l'XP
  debuffs      : string[]        // clés de debuffs actifs
}
```

Le contexte est construit dans le domaine (service ou gateway), jamais dans `SkillsService`.

---

### Architecture de calcul : `calculateSkillXp`

```
SkillXpContext
     │
     ▼
calculateSkillXp(context)
     │
     ├─ résout : skillKey   (quel skill progresse)
     └─ calcule : xpAmount  (combien d'XP)
     │
     ▼
{ skillKey: string, xpAmount: number } | null
```

`calculateSkillXp` est une **fonction pure** (pas de I/O, pas d'injection NestJS). Elle contient toutes les formules de résolution et de calcul d'XP skill. Elle peut être testée unitairement sans base de données.

Elle retourne `null` si le contexte ne génère aucune XP (action sans skill associé, `success: false` sur une action qui n'apprend qu'en réussissant, skill à `maxLevel`, etc.).

**Résolution du skill** (exemples par domaine) :

| Domain / Action | Résolution |
|---|---|
| `combat / attack_hit` | `weapon` → table `weaponType → skillKey` (ex. `'bow'` → `'bow'`) |
| `combat / parry` | `weapon` → skill défensif associé |
| `combat / block` | `'shield'` → `'shield_mastery'` (futur) |
| `combat / heal` | `'healing'` (futur) |
| `gathering / gather` | `resource` → table `resourceType → skillKey` (ex. `'oak_tree'` → `'woodcutting'`) |
| `crafting / craft` | `recipe` → catégorie de station → skillKey (ex. `'forge'` → `'smithing'`) |
| `diplomacy / persuade` | `'diplomacy'` |
| `exploration / discover` | `'exploration'` |

**Formule générique** :

```
baseXp       = BASE_ACTION_XP[domain][action]
diffBonus    = f(difficulty, characterLevel, skillLevel)
qualityBonus = quality != null ? quality * QUALITY_MULTIPLIER : 0
successMalus = success ? 1.0 : FAILURE_XP_RATIO   // certaines actions XP même en échec
xpAmount     = round((baseXp + diffBonus + qualityBonus) × successMalus × buffModifier)
```

Les constantes (`BASE_ACTION_XP`, `QUALITY_MULTIPLIER`, `FAILURE_XP_RATIO`) sont définies dans le module de calcul, pas dans les templates.

---

### Architecture de persistance : `SkillsService.applySkillXpInTx`

`SkillsService` reste le **seul point d'écriture** sur `PlayerSkill`. Aucune mutation directe autorisée en dehors de ce service.

```typescript
interface SkillXpResult {
  skillKey: string
  level: number
  xp: number
  nextLevelXp: number    // Infinity si maxLevel atteint
  leveledUp: boolean
}

// Méthode unique d'entrée pour tous les domaines :
SkillsService.applySkillXpInTx(
  characterId : string,
  skillKey    : string,
  xpAmount    : number,
  manager     : EntityManager,
): Promise<SkillXpResult>
```

Comportement interne : `getOrCreatePlayerSkillInTx` → `applyXpInTx` → retourne `SkillXpResult`. Ces deux primitives existent déjà dans `SkillsService`.

---

### Transaction unique

**Une seule transaction par action gameplay.** Toutes les récompenses (loot, XP personnage, XP skill, futures récompenses) vivent dans la même transaction.

```
Action gameplay confirmée serveur
     │
     ▼
dataSource.transaction(manager => {
     │
     ├─ Loot / ItemMaterializationService (si applicable)
     │
     ├─ ProgressionService.applyCharacterXpInTx(...)   ← Character XP
     │
     ├─ buildSkillXpContext(...)
     │   → calculateSkillXp(context)
     │   → SkillsService.applySkillXpInTx(...)          ← Skill XP
     │
     └─ [futures récompenses dans la même transaction]
})
     │
     ▼
Commit
     │
     ▼
Émission sockets (après commit — jamais dans la transaction)
  client.emit('character_xp_update', characterXpResult)
  client.emit('skill_update', skillXpResult)
  client.emit('loot', loot)
```

**Règle** : les émissions socket ont lieu après le commit. Jamais pendant la transaction.

---

## Flux par domaine

---

### Combat

**Actions générant de l'XP skill :**

| Action | Contexte pertinent | Skill résolu |
|---|---|---|
| Attaque atterrie (`attack_hit`) | `weapon`, `damage`, `targetLevel` | arme équipée (`right-hand`) |
| Parade (`parry`) | `weapon`, `blockedDamage` | arme défensive |
| Blocage bouclier (`block`) | `blockedDamage` | `shield_mastery` (futur) |
| Tir à distance (`ranged_hit`) | `weapon`, `damage`, `targetLevel` | `bow` ou `crossbow` |
| Soin (`heal`) | `healedAmount` | `healing` (futur) |
| Buff appliqué | `duration` | `support` (futur) |
| Debuff appliqué | succès | skill magique (futur) |

**Règle** : l'XP combat est accordée à l'**action** (hit, parry, heal…), pas au kill. Le kill n'accorde que de l'XP personnage (`killCharacterXpReward`).

**Résolution du skill combat** : déterminée par `weaponType` de l'item en slot `right-hand` au moment de l'action. Si le slot est vide, aucun skill ne progresse (mains nues = domaine futur distinct).

**Flux complet combat** :

```
CreaturesGateway.handleAttack()
  ↓
CreaturesService.attack()  [dans une transaction unique]
  ├─ calcul damage, riposte, mort
  ├─ if (mort) : ItemMaterializationService (loot)
  ├─ if (mort) : ProgressionService.applyCharacterXpInTx (Character XP)
  ├─ if (hit && damage > 0) :
  │     context = buildCombatContext('attack_hit', weapon, damage, targetLevel, characterLevel)
  │     { skillKey, xpAmount } = calculateSkillXp(context)
  │     if (xpAmount > 0) : SkillsService.applySkillXpInTx(...)
  └─ commit
  ↓
Émission : character_xp_update, skill_update, loot
```

---

### Récolte (Gathering)

Le `ResourceTemplate` ne porte **aucun champ `gatherSkillXpReward`** ni `gatherSkillKey`.

Il expose uniquement les paramètres de contexte :
- `difficulty` (tier de la ressource)
- `type` / `category` (bois, minerai, plante, poisson…)
- `toolRequired` (type d'outil attendu)

Le Runtime résout le skill depuis `resource` (clé du template) et calcule l'XP depuis `difficulty`, `quality`, `tool`, `success`.

```
ResourcesService.processGather()  [dans une transaction unique]
  ├─ validation distance + état ressource
  ├─ ProgressionService.applyCharacterXpInTx (Character XP depuis gatherCharacterXpReward)
  ├─ context = buildGatherContext(resourceTemplate, tool, success, quality)
  │     { skillKey, xpAmount } = calculateSkillXp(context)
  │     if (xpAmount > 0) : SkillsService.applySkillXpInTx(...)
  └─ commit
  ↓
Émission : character_xp_update, skill_update, resource_update
```

---

### Craft

Le `CraftRecipe` ne porte **aucun champ `craftSkillXpReward`** ni `craftSkillKey`.

Il expose uniquement :
- `difficulty` (niveau de recette)
- `category` (forge, menuiserie, alchimie…)
- ingrédients, station requise

Le Runtime résout le skill depuis la catégorie de station et calcule l'XP depuis `difficulty`, `qualityResult`, `success`.

```
CraftingService.craft()  [dans une transaction unique]
  ├─ consommation ingrédients (ItemTransferService)
  ├─ production item (ItemMaterializationService)
  ├─ ProgressionService.applyCharacterXpInTx (Character XP)
  ├─ context = buildCraftContext(recipe, station, qualityResult, success)
  │     { skillKey, xpAmount } = calculateSkillXp(context)
  │     if (xpAmount > 0) : SkillsService.applySkillXpInTx(...)
  └─ commit
  ↓
Émission : character_xp_update, skill_update, craft_result
```

---

### Domaines futurs

Chaque nouveau domaine suit le même pattern : construire un `SkillXpContext`, appeler `calculateSkillXp`, appeler `applySkillXpInTx` — le tout dans la transaction de l'action.

| Domaine | Action déclencheur | Contexte clé |
|---|---|---|
| Diplomatie | Persuasion NPC réussie | `targetLevel`, `success` |
| Leadership | Buff groupe appliqué | `duration`, nombre de cibles |
| Exploration | Nouvelle zone découverte | tier de zone |
| Cuisine | Recette préparée | `difficulty`, `quality` |
| Pêche | Poisson attrapé | qualité, tier de poisson |
| Crochetage | Serrure ouverte | tier de serrure, `success` |
| Équitation | Distance parcourue (throttlé) | durée de trajet |

`calculateSkillXp` est étendu domaine par domaine. `SkillsService` ne change jamais.

---

## Architecture finale — Diagramme global

```
┌─────────────────────────────────────────────────────────────────────┐
│                           TEMPLATES                                  │
│                                                                      │
│  CreatureTemplate     ResourceTemplate     CraftRecipe               │
│  ─────────────────    ────────────────     ──────────                │
│  killCharacterXpR.    gatherCharXpR.       craftCharXpR.             │
│  difficulty(tier)     difficulty(tier)     difficulty                 │
│  type / category      type / category      category                  │
│                                                                      │
│  [Aucun *SkillXpReward. Aucun *SkillKey.]                           │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ contexte brut
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GAMEPLAY RUNTIME                                │
│                                                                      │
│  Domaine construit SkillXpContext                                    │
│  { domain, action, success, difficulty, quality, damage,             │
│    weapon, resource, recipe, targetLevel, characterLevel, … }        │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ SkillXpContext
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     calculateSkillXp(context)                        │
│                     [fonction pure, testable]                        │
│                                                                      │
│  Résout  → skillKey                                                  │
│  Calcule → xpAmount                                                  │
│                                                                      │
│  Retourne { skillKey, xpAmount } | null                              │
└──────────────┬──────────────────────────┬───────────────────────────┘
               │ xpAmount                 │ (parallèle)
               ▼                          ▼
┌──────────────────────────┐   ┌───────────────────────────────────┐
│  SkillsService            │   │  ProgressionService               │
│  .applySkillXpInTx()      │   │  .applyCharacterXpInTx()         │
│  [seul point écriture]    │   │  [seul point écriture char XP]   │
└──────────┬───────────────┘   └──────────────┬────────────────────┘
           │                                   │
           ▼                                   ▼
      PlayerSkill (DB)                  Character (DB)
           │                                   │
           └──────────────┬────────────────────┘
                          │ après commit
                          ▼
               Émission sockets
           ┌──────────────────────┐
           │  skill_update        │
           │  character_xp_update │
           │  loot / autres       │
           └──────────────────────┘
```

---

## Règles critiques

1. **Aucun template ne porte `*SkillXpReward` ni `*SkillKey`.** Architecturalement interdit.
2. **`calculateSkillXp` est la seule source de vérité** pour la résolution du skill et le calcul de l'XP skill.
3. **`SkillsService.applySkillXpInTx`** est le seul point d'écriture sur `PlayerSkill`. Zéro mutation directe autorisée ailleurs.
4. **Transaction unique** : loot + Character XP + Skill XP dans la même transaction. Jamais deux transactions séparées pour les récompenses d'une même action.
5. **Émissions socket après commit.** Jamais pendant la transaction.
6. **`calculateSkillXp` est une fonction pure.** Pas d'injection, pas d'I/O. Testable sans base de données.
7. **Le domaine construit le contexte.** `calculateSkillXp` ne connaît pas les services métier.
8. **`ProgressionService.applyCharacterXpInTx`** reste la seule voie pour l'XP personnage. Même règle de transaction.

---

## Conséquences et impacts

### Sur les templates (DB)

| Template | Impact |
|---|---|
| `CreatureTemplate` | Aucun nouveau champ — `killCharacterXpReward` déjà présent |
| `ResourceTemplate` | +`gatherCharacterXpReward` (int, nullable) — aucun `gatherSkillXpReward` |
| `CraftRecipe` | +`craftCharacterXpReward` (int, nullable) — aucun `craftSkillXpReward` |

### Sur les services existants

| Service | Impact |
|---|---|
| `SkillsService` | +`applySkillXpInTx` (méthode publique unifiée) — additionnel, pas breaking |
| `ProgressionService` | Inchangé |
| `CreaturesService` | +`buildCombatContext` + appel `calculateSkillXp` + `applySkillXpInTx` dans la transaction |
| `ResourcesService` | +`buildGatherContext` + même pattern (Phase 2c) |
| `CraftingService` | +`buildCraftContext` + même pattern (Phase 2d) |

### Nouveau module

| Module | Rôle |
|---|---|
| `skill-xp-calculator` (ou `progression/skill-xp`) | Exporte `calculateSkillXp`, `buildCombatContext`, `buildGatherContext`, `buildCraftContext`, le type `SkillXpContext`. Pas de dépendances NestJS — module TypeScript pur. |

### Frontend

| Composant | Impact |
|---|---|
| `skill.store.js` | Nouveau store Zustand singleton — parallèle à `character.store.js` |
| `WorldScene.js` | +écoute `skill_update` → dispatch vers `skill.store` |
| `CharacterLayer` | +onglet Skills affichant `PlayerSkill[]` depuis le store |

---

## Avantages

| Propriété | Détail |
|---|---|
| **Templates allégés** | Les templates décrivent le jeu, pas les formules de progression. Modifiables par des designers sans risque de casser la balance skill. |
| **Calcul centralisé et testable** | `calculateSkillXp` pure function — 100% testable unitairement, sans DB, sans NestJS. |
| **Extension sans modification du service** | Nouveau domaine → nouveau `buildXxxContext` + entrée dans `calculateSkillXp`. `SkillsService` ne change pas. |
| **Transaction atomique** | Loot + XP personnage + XP skill commitent ensemble. Pas d'état partiellement récompensé. |
| **Un seul point d'écriture** | `SkillsService.applySkillXpInTx` — auditabilité totale. |
| **Parallèle cohérent** | `ProgressionService` (char XP) ↔ `SkillsService` (skill XP) — même contrat transactionnel, même pattern. |
| **Évolutivité** | Ajouter un coefficient de buff, un malus de niveau, un bonus de qualité = modifier `calculateSkillXp`. Aucun template à migrer. |

---

## Limites documentées

- **`weaponType`** : champ nécessaire sur `Item` pour la résolution du skill combat — à vérifier avant Phase 2b.
- **Skill check** (level de skill requis pour une action) : non couvert dans cette ADR — système séparé à concevoir en Phase 3.
- **XP throttling** : le service XP ne throttle pas. Le throttling doit venir du domaine (cooldown d'action existant). Acceptable en Phase 2.
- **Mains nues** : skill `unarmed` non défini — actions sans arme n'accordent pas d'XP skill en Phase 2.
- **Échec de craft** : `calculateSkillXp` peut retourner une XP réduite sur `success: false` — la politique exacte (0 XP ou XP partielle) est une décision de gameplay à fixer lors de l'implémentation Phase 2d.

---

## Ordre d'implémentation

```
Phase 2a — Fondation (prérequis à tout le reste)
├── Ajouter SkillsService.applySkillXpInTx (+ tests unitaires)
├── Créer module skill-xp-calculator : SkillXpContext + calculateSkillXp (squelette)
└── Exporter SkillsModule vers les modules consommateurs

Phase 2b — Combat skill XP
├── Vérifier/ajouter weaponType sur Item
├── Implémenter buildCombatContext
├── Implémenter calculateSkillXp pour domain='combat'
├── Intégrer dans CreaturesService (transaction unique loot+charXP+skillXP)
├── Émission skill_update dans CreaturesGateway
└── Tests CreaturesService + calculateSkillXp combat

Phase 2c — Récolte skill XP
├── Ajouter gatherCharacterXpReward sur ResourceTemplate
├── Implémenter buildGatherContext
├── Implémenter calculateSkillXp pour domain='gathering'
├── Intégrer dans ResourcesService
└── Tests

Phase 2d — Craft skill XP
├── Ajouter craftCharacterXpReward sur CraftRecipe
├── Implémenter buildCraftContext
├── Implémenter calculateSkillXp pour domain='crafting'
├── Intégrer dans CraftingService
└── Tests

Phase 2e — Frontend
├── skill.store.js (Zustand singleton)
├── Écoute skill_update dans WorldScene
└── Onglet Skills dans CharacterLayer

Phase 3 — Évolutions
├── Skill check (level requis pour actions)
├── Coefficients de buff/debuff dans calculateSkillXp
├── Bonus qualité craft
├── Domaines supplémentaires (diplomatie, exploration, cuisine…)
└── Exposition GameConfig des constantes de formule
```
