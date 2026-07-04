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

### Philosophie de progression des compétences

**Principe fondamental** :

> **Une compétence progresse parce qu'elle est utilisée. Pas uniquement parce que l'action est réussie.**

La réussite influence la *quantité* d'XP, jamais son *existence*. Un joueur débutant doit progresser même en échouant — c'est la pratique qui forme, pas uniquement le succès.

#### Les quatre outcomes

| Outcome | Définition | Coefficient XP |
|---|---|---|
| `cancelled` | Action annulée avant son terme — déplacement, interruption, mort, stun | 0 (null) |
| `failed` | Action terminée mais échouée — minerai non extrait, craft raté, pêche ratée | 0.25× |
| `success` | Action réussie — résultat produit, cible atteinte | 1.0× |
| `exceptional` | Réussite exceptionnelle — critique, bonus métier, excellent outil | 1.5× |

**`cancelled`** est le seul cas qui retourne `null`. Tous les autres produisent de l'XP.

La qualité (`quality: 0.0–1.0`) s'ajoute au-dessus du coefficient d'outcome comme bonus continu (indépendant).

#### Application par domaine

**Combat**

Chaque action de combat valide génère de l'XP skill, indépendamment de son issue tactique :

| Action | Outcome habituel | Remarque |
|---|---|---|
| Attaque atterrie | `success` | coup qui touche |
| Attaque esquivée | `failed` | coup porté, raté — l'arme a quand même été utilisée |
| Parade | `success` / `exceptional` | selon la perfection du timing |
| Blocage bouclier | `success` | |
| Soin | `success` | |
| Buff / debuff | `success` | |
| Critique | `exceptional` | |

> **Le kill ne génère jamais d'XP skill.** Il accorde uniquement XP personnage + loot + récompenses éventuelles.

**Récolte**

| Phase | Outcome | XP |
|---|---|---|
| Ressource tentée, extraction échouée | `failed` | faible XP — apprentissage |
| Ressource extraite avec succès | `success` + `quality` | XP normale + bonus qualité |
| Extraction exceptionnelle (outil rare, critique) | `exceptional` + `quality` | XP bonifiée |

**Craft**

| Phase | Outcome | XP |
|---|---|---|
| Recette tentée, craft raté | `failed` | faible XP — apprentissage |
| Craft réussi | `success` + `quality` | XP normale + bonus qualité |
| Critique craft | `exceptional` + `quality` | XP bonifiée |

#### Règle du calculateur

> **`outcome` est un coefficient, jamais une condition binaire.**

`calculateSkillXp` ne fait pas de `if (outcome !== 'success') return null`. Il applique le coefficient correspondant. Seul `cancelled` retourne `null`.

---

### SkillXpContext

`SkillXpContext` est le contrat de données qui transite entre les domaines et le calculateur Runtime.

Chaque domaine construit son propre contexte. Aucun domaine ne calcule directement l'XP.

```
// Résultat de l'action — coefficient XP
type SkillOutcome = 'cancelled' | 'failed' | 'success' | 'exceptional'

SkillXpContext {
  skillDefinitionKey: string         // résolu par le domaine appelant, jamais par le calculateur
  domain       : 'combat' | 'gathering' | 'crafting' | 'magic' | 'support' | ...
  action       : string              // 'attack_hit', 'parry', 'block', 'gather', 'craft', 'heal', ...
  outcome      : SkillOutcome        // résultat de l'action — détermine le coefficient XP
  difficulty   : number              // niveau de difficulté de la cible / ressource / recette (1–100)
  quality      : number | null       // qualité du résultat (0.0–1.0) — null si non applicable
  damage       : number | null       // dégâts infligés — null si non applicable
  blockedDamage: number | null       // dégâts bloqués (bouclier, parade) — null si non applicable
  healedAmount : number | null       // soins appliqués — null si non applicable
  duration     : number | null       // durée de l'action en ms — null si non applicable
  characterLevel: number             // level courant du personnage
  skillLevel   : number              // level courant du skill concerné
  buffs        : string[]            // clés de buffs actifs influençant l'XP
  debuffs      : string[]            // clés de debuffs actifs
}
```

**Évolution depuis Phase 2a** : `success: boolean` est remplacé par `outcome: SkillOutcome`. Le champ `success: boolean` présent dans le code Phase 2a doit être mis à jour avant l'implémentation Phase 2b.

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

Elle retourne `null` uniquement si `outcome === 'cancelled'`. Tous les autres outcomes produisent de l'XP.

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
// Coefficients par outcome — définis dans le module de calcul, jamais dans les templates
OUTCOME_COEFFICIENTS = {
  cancelled  : 0,     // → null, aucune XP
  failed     : 0.25,  // apprentissage — l'effort a eu lieu
  success    : 1.0,   // réussite normale
  exceptional: 1.5,   // critique, bonus métier, outil rare
}

outcomeCoeff = OUTCOME_COEFFICIENTS[context.outcome]
if (outcomeCoeff === 0) → return null

baseXp       = BASE_ACTION_XP[domain][action]   // par défaut : DEFAULT_BASE_XP
diffBonus    = floor(difficulty / DIFFICULTY_DIVISOR)
qualityBonus = quality != null ? round(quality × MAX_QUALITY_BONUS) : 0

xpAmount     = max(1, round((baseXp + diffBonus + qualityBonus) × outcomeCoeff))
```

Les constantes (`BASE_ACTION_XP`, `OUTCOME_COEFFICIENTS`, `DIFFICULTY_DIVISOR`, `MAX_QUALITY_BONUS`) sont définies dans le module de calcul, jamais dans les templates.

---

### Organic Cross-Skill Progression

#### Principe

Une action peut faire progresser **plusieurs skills simultanément** : le skill de métier principal et le skill de l'outil ou de l'arme réellement utilisé.

Ce n'est pas de l'XP combat offerte gratuitement. C'est de l'XP d'**usage d'outil** — le joueur maîtrise l'instrument qu'il manipule, indépendamment du contexte.

Un artisan qui frappe du métal au marteau développe naturellement son habilité au marteau. Un bûcheron qui abat des arbres à la hache développe naturellement son maniement de la hache. Ces aptitudes sont transférables hors du métier qui les a forgées.

#### Pattern : un domaine produit N contextes

Le domaine construit **un `SkillXpContext` par skill à récompenser**. `calculateSkillXp` est appelé une fois par contexte. Le calculateur reste inchangé.

```
Action gameplay
     │
     ▼
Domaine construit N contextes
     │
     ├─ SkillXpContext { skillDefinitionKey: 'smithing', domain: 'crafting', ... }
     │       → calculateSkillXp(context₁) → { skillDefinitionKey: 'smithing', xpAmount: 15 }
     │
     └─ SkillXpContext { skillDefinitionKey: 'hammer', domain: 'tool_use', ... }
             → calculateSkillXp(context₂) → { skillDefinitionKey: 'hammer', xpAmount: 8 }
     │
     ▼
SkillsService.applySkillXpInTx() — appelé pour chaque résultat non-null
     │
     ▼
Commit unique (tous les applySkillXpInTx dans la même transaction)
     │
     ▼
skill_update émis pour chaque skill ayant progressé
```

#### Exemples par domaine

| Action | Skill métier | Skill outil/arme |
|---|---|---|
| Craft épée (forge) | `smithing` | `hammer` |
| Craft meuble (atelier) | `woodworking` | `hatchet` |
| Abattre un arbre | `woodcutting` | `axe` |
| Extraire du minerai | `mining` | `pickaxe` |
| Récolter une plante | `farming` | `scythe` |
| Pêcher (harpon) | `fishing` | `spear` |
| Pêcher (canne) | `fishing` | `fishing_rod` |

#### Classification des skills

Les skills sont classés en catégories. Cette classification permet au client de les afficher et au Runtime de les regrouper, sans influer sur le calcul d'XP.

| Catégorie | Rôle | Exemples |
|---|---|---|
| `profession` | Maîtrise d'un métier | `smithing`, `woodcutting`, `mining`, `farming`, `fishing`, `woodworking` |
| `weapon` | Maniement d'une arme — en combat ou comme outil | `hammer`, `axe`, `pickaxe`, `scythe`, `spear`, `bow`, `crossbow`, `two_handed` |
| `support` | Soin, protection, buff | `healing`, `shield_mastery` |
| `magic` | Sorts et effets magiques | `fire_magic`, `restoration` |
| `social` | Interactions et influence | `diplomacy`, `leadership` |

> La catégorie `weapon` couvre à la fois les armes de combat et les outils dont l'usage est physiquement similaire. Un joueur qui forge avec un marteau et chasse avec un marteau de guerre développe le même skill `hammer`.

#### Règles d'invariant

1. **Le Runtime décide des contextes.** Aucun template ne liste les skills récompensés par une action.
2. **Le calculateur reste inchangé.** `calculateSkillXp(context)` est appelé une fois par contexte — jamais en lot.
3. **Chaque contexte est indépendant.** L'échec d'un contexte (outcome `cancelled`) n'annule pas les autres.
4. **L'outil doit être réellement utilisé.** Un joueur sans outil équipé ne gagne pas l'XP outil. Le domaine vérifie l'équipement réel avant de construire le second contexte.
5. **Pas de doublon XP combat.** Un artisan gagne de l'XP `hammer` pour avoir forgé — pas pour avoir combattu. Les coefficients d'outcome et la base XP du domaine `tool_use` sont distincts et inférieurs au domaine `combat`.
6. **Tous les `applySkillXpInTx` vivent dans la même transaction.** Aucune transaction séparée par skill.

#### Objectif design

> Permettre à un joueur artisan ou récolteur de développer naturellement des aptitudes liées à ses outils, sans farmer des créatures. Un forgeron de haut niveau a une affinité réelle avec le marteau. Un bûcheron chevronné manie sa hache mieux qu'un débutant — quelle que soit l'utilisation qu'il en fait ensuite.

---

### Organic Cross-Skill Progression — Invariants

---

#### Invariant O1 — Tool usage authenticity

Un Tool/Weapon Skill ne peut progresser que si l'outil ou l'arme a été **réellement utilisé** pour produire l'action Runtime.

Conditions cumulatives :
- l'outil ou l'arme est équipé ou sélectionné côté **serveur** au moment de l'action ;
- l'action a été réellement exécutée (pas simulée, pas anticipée) ;
- l'action a été validée par le serveur (distance, état, anti-cheat) ;
- jamais basé sur la simple présence de l'outil dans l'inventaire ;
- jamais basé sur une déclaration ou un payload client.

---

#### Invariant O2 — Independent progression

Chaque `SkillXpContext` est **calculé indépendamment**. Aucun contexte n'est automatiquement un pourcentage d'un autre.

Chaque contexte peut avoir ses propres coefficients, multiplicateurs et règles.

```
Craft Sword
  → SkillXpContext(smithing)  → xpAmount : 12   [base craft élevée]
  → SkillXpContext(hammer)    → xpAmount : 3    [base tool_use réduite]
```

Les montants ne partagent pas de formule commune. Le ratio `12 / 3` est une conséquence des constantes de domaine, pas une règle fixe.

---

#### Invariant O3 — Multi-context runtime

Une action Runtime peut produire **zéro, un ou plusieurs** `SkillXpContext`. Le moteur ne doit jamais supposer qu'une action produit un seul contexte.

```
Forge épée       → Smithing + Hammer
Pêche au harpon  → Fishing + Spear
Soin sacré       → Restoration + Staff      (futur)
Commandement     → Leadership + Diplomacy   (futur)
Attaque à mains nues → (aucun contexte si skill 'unarmed' non défini)
```

Les domaines qui ne produisent qu'un seul contexte restent valides — la règle est que le moteur ne peut pas en supposer le nombre.

---

#### Invariant O4 — Runtime authority

**Seul le Runtime est autorisé à produire des `SkillXpContext`.**

Interdit :
- `CreatureTemplate` produit ou impose directement un `SkillXpContext`
- `ResourceTemplate` produit ou impose directement un `SkillXpContext`
- `CraftRecipe` produit ou impose directement un `SkillXpContext`
- le client produit, suggère ou impose un `SkillXpContext`

Les templates fournissent uniquement des **données de contexte** (difficulté, catégorie, tier…). Le Runtime décide :
- combien de contextes sont produits ;
- quels skills sont ciblés ;
- quelles valeurs d'`outcome`, `difficulty`, `quality` sont appliquées ;
- quels coefficients s'appliquent.

---

#### Note de rejet

> Toute future proposition de champ du type `gatherSkillXpReward`, `craftSkillXpReward`, `killSkillXpReward`, `resourceSkillKey`, `creatureSkillKey` ou équivalent **doit être rejetée**, sauf remplacement par une ADR dédiée.
>
> Ces champs violent les invariants O1, O2, O3 et O4 en déléguant au template une décision qui appartient exclusivement au Runtime.

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

Le Runtime calcule l'XP depuis `difficulty`, `quality`, `outcome` — jamais depuis un champ de template.

```
ResourcesService.processGather()  [dans une transaction unique]
  ├─ validation distance + état ressource
  ├─ ProgressionService.applyCharacterXpInTx (Character XP — seulement si success)
  ├─ context = buildGatherContext(resourceTemplate, tool, outcome, quality)
  │   // outcome = 'failed' si extraction ratée, 'success'/'exceptional' si réussie
  │     { skillDefinitionKey, xpAmount } = calculateSkillXp(context)
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

Le Runtime calcule l'XP depuis `difficulty`, `quality`, `outcome` — jamais depuis un champ de template.

L'XP craft est accordée à la **complétion** du CraftJob (jamais au lancement ni
au claim) ; l'output n'est matérialisé qu'au **claim**, dans une transaction
distincte.

```
CraftJobService.complete()  [transaction, RUNNING → COMPLETED]
  ├─ consommation ingrédients réservés (ItemTransferService, CONSUME_FROM_CRAFT_ORDER)
  ├─ [si succès] ProgressionService.applyCharacterXpInTx (Character XP)
  ├─ context = buildCraftSkillXpContext(job snapshot, skillLevel)
  │   // outcome = 'failed' si craft raté, 'success'/'exceptional' si réussi
  │     { skillDefinitionKey, xpAmount } = calculateSkillXp(context)
  │     if (xpAmount > 0) : SkillsService.applySkillXpInTx(...)
  └─ commit

CraftJobService.claim()  [transaction séparée, COMPLETED → CLAIMED]
  └─ production item (ItemMaterializationService)  // SEULE matérialisation
```

---

### Domaines futurs

Chaque nouveau domaine suit le même pattern : construire un `SkillXpContext`, appeler `calculateSkillXp`, appeler `applySkillXpInTx` — le tout dans la transaction de l'action.

| Domaine | Action déclencheur | Contexte clé |
|---|---|---|
| Diplomatie | Persuasion NPC tentée | `targetLevel`, `outcome` |
| Leadership | Buff groupe appliqué | `duration`, nombre de cibles |
| Exploration | Nouvelle zone découverte | tier de zone |
| Cuisine | Recette préparée | `difficulty`, `quality` |
| Pêche | Poisson attrapé | qualité, tier de poisson |
| Crochetage | Serrure tentée | tier de serrure, `outcome` |
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
│  { skillDefinitionKey, domain, action, outcome, difficulty, quality… } │
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
2. **`calculateSkillXp` est la seule source de vérité** pour le calcul de l'XP skill. `skillDefinitionKey` est fourni par le domaine appelant.
3. **`SkillsService.applySkillXpInTx`** est le seul point d'écriture sur `PlayerSkill`. Zéro mutation directe autorisée ailleurs.
4. **Transaction unique** : loot + Character XP + Skill XP dans la même transaction. Jamais deux transactions séparées pour les récompenses d'une même action.
5. **Émissions socket après commit.** Jamais pendant la transaction.
6. **`calculateSkillXp` est une fonction pure.** Pas d'injection, pas d'I/O. Testable sans base de données.
7. **Le domaine construit le contexte.** `calculateSkillXp` ne connaît pas les services métier.
8. **`ProgressionService.applyCharacterXpInTx`** reste la seule voie pour l'XP personnage. Même règle de transaction.
9. **`outcome` est un coefficient, jamais une condition binaire.** `calculateSkillXp` n'exclut pas l'XP sur `failed` — il applique le coefficient `0.25`. Seul `cancelled` retourne `null`.
10. **Le kill ne génère jamais d'XP skill.** Il accorde uniquement XP personnage (`killCharacterXpReward`) + loot.
11. **Un domaine peut produire N contextes pour une même action.** `calculateSkillXp` est appelé une fois par contexte. Tous les `applySkillXpInTx` vivent dans la même transaction.
12. **L'outil doit être réellement équipé.** Le domaine vérifie l'équipement avant de construire le contexte outil. Aucun XP outil sans outil utilisé.

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
| `CreaturesService` | +`buildCombatContext` × N + appels `calculateSkillXp` + `applySkillXpInTx` dans la transaction |
| `ResourcesService` | +`buildGatherContext` + `buildToolContext` selon outil équipé (Phase 2c) |
| `CraftingService` | +`buildCraftContext` + `buildToolContext` selon outil équipé (Phase 2d) |

### Sur `SkillDefinition.category`

La taxonomie de catégories existante (`gathering`, `crafting`, `combat`, `social`, `leadership`) doit être alignée avec la classification Organic Cross-Skill :

| Catégorie actuelle | Catégorie cible | Notes |
|---|---|---|
| `gathering` | `profession` | woodcutting, mining, farming, fishing… |
| `crafting` | `profession` | smithing, woodworking, alchemy… |
| `combat` | `weapon` | two_handed, bow, crossbow… + hammer, axe, pickaxe |
| `social` | `social` | diplomacy — inchangé |
| `leadership` | `social` | fusionnable avec social ou garder distinct |
| *(absent)* | `support` | healing, shield_mastery |
| *(absent)* | `magic` | fire_magic, restoration |

La migration de `category` est un changement de données (DB + seed) à réaliser avant l'affichage frontend des skills. Elle n'affecte pas le calcul d'XP.

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
- **Code Phase 2a à mettre à jour** : `SkillXpContext.success: boolean` → `SkillXpContext.outcome: SkillOutcome`. Les tests correspondants doivent être mis à jour avant l'implémentation Phase 2b. Aucun domaine n'utilise encore le module — le changement est non-breaking.

---

## Ordre d'implémentation

```
Phase 2a — Fondation (prérequis à tout le reste)  [DONE — commit 3ec0e74]
├── SkillsService.applySkillXpInTx (+ tests unitaires)
├── Module skill-xp-calculator : SkillXpContext + calculateSkillXp
├── Exporter SkillsModule vers les modules consommateurs
└── [À faire avant Phase 2b] : migrer success:boolean → outcome:SkillOutcome dans SkillXpContext + calculateur + tests

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
