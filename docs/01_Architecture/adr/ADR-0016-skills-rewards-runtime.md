# ADR-0016 — Séparation XP personnage / XP compétence & Runtime Mastery Progression

**Statut :** Accepted  
**Date :** 2026-07-01  
**Contexte :** Masteries & Rewards — Phase 1.5 (Character XP) + Phase 2 (Mastery XP Runtime)

> **Note terminologique (2026-07-09) :** ce document utilisait à l'origine le terme
> « Skill » pour désigner la progression passive de proficiency (arme, métier,
> récolte, social). ADR-0018 a formalisé la distinction Mastery (progression
> passive) / Skill (future compétence active). Le vocabulaire de cette ADR a
> été aligné en conséquence : le canal 2 (« XP compétence ») décrit en réalité
> le système de **Mastery XP**. Décision et statut inchangés — seule la
> terminologie a été corrigée, en cohérence avec le renommage du code
> (`SkillDefinition`/`PlayerSkill`/`SkillsService` → `MasteryDefinition`/
> `PlayerMastery`/`MasteriesService`).

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
- quel mastery reçoit de l'XP
- combien d'XP il reçoit

Le template fournit uniquement le **contexte gameplay** :
- difficulté, type, catégorie
- paramètres utiles à l'évaluation (tier, qualité attendue, etc.)

Le Runtime décide ensuite, via `calculateMasteryXp(context)`, du mastery concerné et de la quantité d'XP.

**Règle critique** :

> **Aucun template (CreatureTemplate, ResourceTemplate, CraftRecipe…) ne porte de champ `*MasteryXpReward` ni de champ `*MasteryKey`.**

Il n'y a pas de `gatherMasteryXpReward`, pas de `craftMasteryXpReward`, pas de `killMasteryDefinitionId`. Ces champs sont architecturalement interdits.

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

Chaque action de combat valide génère de l'XP mastery, indépendamment de son issue tactique :

| Action | Outcome habituel | Remarque |
|---|---|---|
| Attaque atterrie | `success` | coup qui touche |
| Attaque esquivée | `failed` | coup porté, raté — l'arme a quand même été utilisée |
| Parade | `success` / `exceptional` | selon la perfection du timing |
| Blocage bouclier | `success` | |
| Soin | `success` | |
| Buff / debuff | `success` | |
| Critique | `exceptional` | |

> **Le kill ne génère jamais d'XP mastery.** Il accorde uniquement XP personnage + loot + récompenses éventuelles.

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

`calculateMasteryXp` ne fait pas de `if (outcome !== 'success') return null`. Il applique le coefficient correspondant. Seul `cancelled` retourne `null`.

---

### MasteryXpContext

`MasteryXpContext` est le contrat de données qui transite entre les domaines et le calculateur Runtime.

Chaque domaine construit son propre contexte. Aucun domaine ne calcule directement l'XP.

```
// Résultat de l'action — coefficient XP
type MasteryOutcome = 'cancelled' | 'failed' | 'success' | 'exceptional'

MasteryXpContext {
  masteryDefinitionKey: string         // résolu par le domaine appelant, jamais par le calculateur
  domain       : 'combat' | 'gathering' | 'crafting' | 'magic' | 'support' | ...
  action       : string              // 'attack_hit', 'parry', 'block', 'gather', 'craft', 'heal', ...
  outcome      : MasteryOutcome        // résultat de l'action — détermine le coefficient XP
  difficulty   : number              // niveau de difficulté de la cible / ressource / recette (1–100)
  quality      : number | null       // qualité du résultat (0.0–1.0) — null si non applicable
  damage       : number | null       // dégâts infligés — null si non applicable
  blockedDamage: number | null       // dégâts bloqués (bouclier, parade) — null si non applicable
  healedAmount : number | null       // soins appliqués — null si non applicable
  duration     : number | null       // durée de l'action en ms — null si non applicable
  characterLevel: number             // level courant du personnage
  masteryLevel   : number              // level courant du mastery concerné
  buffs        : string[]            // clés de buffs actifs influençant l'XP
  debuffs      : string[]            // clés de debuffs actifs
}
```

**Évolution depuis Phase 2a** : `success: boolean` est remplacé par `outcome: MasteryOutcome`. Le champ `success: boolean` présent dans le code Phase 2a doit être mis à jour avant l'implémentation Phase 2b.

Le contexte est construit dans le domaine (service ou gateway), jamais dans `MasteriesService`.

---

### Architecture de calcul : `calculateMasteryXp`

```
MasteryXpContext
     │
     ▼
calculateMasteryXp(context)
     │
     ├─ résout : masteryKey   (quel mastery progresse)
     └─ calcule : xpAmount  (combien d'XP)
     │
     ▼
{ masteryKey: string, xpAmount: number } | null
```

`calculateMasteryXp` est une **fonction pure** (pas de I/O, pas d'injection NestJS). Elle contient toutes les formules de résolution et de calcul d'XP mastery. Elle peut être testée unitairement sans base de données.

Elle retourne `null` uniquement si `outcome === 'cancelled'`. Tous les autres outcomes produisent de l'XP.

**Résolution du mastery** (exemples par domaine) :

| Domain / Action | Résolution |
|---|---|
| `combat / attack_hit` | `weapon` → table `weaponType → masteryKey` (ex. `'bow'` → `'bow'`) |
| `combat / parry` | `weapon` → mastery défensif associé |
| `combat / block` | `'shield'` → `'shield_mastery'` (futur) |
| `combat / heal` | `'healing'` (futur) |
| `gathering / gather` | `resource` → table `resourceType → masteryKey` (ex. `'oak_tree'` → `'woodcutting'`) |
| `crafting / craft` | `recipe` → catégorie de station → masteryKey (ex. `'forge'` → `'smithing'`) |
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

### Organic Cross-Mastery Progression

#### Principe

Une action peut faire progresser **plusieurs masteries simultanément** : le mastery de métier principal et le mastery de l'outil ou de l'arme réellement utilisé.

Ce n'est pas de l'XP combat offerte gratuitement. C'est de l'XP d'**usage d'outil** — le joueur maîtrise l'instrument qu'il manipule, indépendamment du contexte.

Un artisan qui frappe du métal au marteau développe naturellement son habilité au marteau. Un bûcheron qui abat des arbres à la hache développe naturellement son maniement de la hache. Ces aptitudes sont transférables hors du métier qui les a forgées.

#### Pattern : un domaine produit N contextes

Le domaine construit **un `MasteryXpContext` par mastery à récompenser**. `calculateMasteryXp` est appelé une fois par contexte. Le calculateur reste inchangé.

```
Action gameplay
     │
     ▼
Domaine construit N contextes
     │
     ├─ MasteryXpContext { masteryDefinitionKey: 'smithing', domain: 'crafting', ... }
     │       → calculateMasteryXp(context₁) → { masteryDefinitionKey: 'smithing', xpAmount: 15 }
     │
     └─ MasteryXpContext { masteryDefinitionKey: 'hammer', domain: 'tool_use', ... }
             → calculateMasteryXp(context₂) → { masteryDefinitionKey: 'hammer', xpAmount: 8 }
     │
     ▼
MasteriesService.applyMasteryXpInTx() — appelé pour chaque résultat non-null
     │
     ▼
Commit unique (tous les applyMasteryXpInTx dans la même transaction)
     │
     ▼
mastery_update émis pour chaque mastery ayant progressé
```

#### Exemples par domaine

| Action | Mastery métier | Mastery outil/arme |
|---|---|---|
| Craft épée (forge) | `smithing` | `hammer` |
| Craft meuble (atelier) | `woodworking` | `hatchet` |
| Abattre un arbre | `woodcutting` | `axe` |
| Extraire du minerai | `mining` | `pickaxe` |
| Récolter une plante | `farming` | `scythe` |
| Pêcher (harpon) | `fishing` | `spear` |
| Pêcher (canne) | `fishing` | `fishing_rod` |

#### Classification des masteries

Les masteries sont classés en catégories. Cette classification permet au client de les afficher et au Runtime de les regrouper, sans influer sur le calcul d'XP.

| Catégorie | Rôle | Exemples |
|---|---|---|
| `profession` | Maîtrise d'un métier | `smithing`, `woodcutting`, `mining`, `farming`, `fishing`, `woodworking` |
| `weapon` | Maniement d'une arme — en combat ou comme outil | `hammer`, `axe`, `pickaxe`, `scythe`, `spear`, `bow`, `crossbow`, `two_handed` |
| `support` | Soin, protection, buff | `healing`, `shield_mastery` |
| `magic` | Sorts et effets magiques | `fire_magic`, `restoration` |
| `social` | Interactions et influence | `diplomacy`, `leadership` |

> La catégorie `weapon` couvre à la fois les armes de combat et les outils dont l'usage est physiquement similaire. Un joueur qui forge avec un marteau et chasse avec un marteau de guerre développe le même mastery `hammer`.

#### Règles d'invariant

1. **Le Runtime décide des contextes.** Aucun template ne liste les masteries récompensés par une action.
2. **Le calculateur reste inchangé.** `calculateMasteryXp(context)` est appelé une fois par contexte — jamais en lot.
3. **Chaque contexte est indépendant.** L'échec d'un contexte (outcome `cancelled`) n'annule pas les autres.
4. **L'outil doit être réellement utilisé.** Un joueur sans outil équipé ne gagne pas l'XP outil. Le domaine vérifie l'équipement réel avant de construire le second contexte.
5. **Pas de doublon XP combat.** Un artisan gagne de l'XP `hammer` pour avoir forgé — pas pour avoir combattu. Les coefficients d'outcome et la base XP du domaine `tool_use` sont distincts et inférieurs au domaine `combat`.
6. **Tous les `applyMasteryXpInTx` vivent dans la même transaction.** Aucune transaction séparée par mastery.

#### Objectif design

> Permettre à un joueur artisan ou récolteur de développer naturellement des aptitudes liées à ses outils, sans farmer des créatures. Un forgeron de haut niveau a une affinité réelle avec le marteau. Un bûcheron chevronné manie sa hache mieux qu'un débutant — quelle que soit l'utilisation qu'il en fait ensuite.

---

### Organic Cross-Mastery Progression — Invariants

---

#### Invariant O1 — Tool usage authenticity

Un Tool/Weapon Mastery ne peut progresser que si l'outil ou l'arme a été **réellement utilisé** pour produire l'action Runtime.

Conditions cumulatives :
- l'outil ou l'arme est équipé ou sélectionné côté **serveur** au moment de l'action ;
- l'action a été réellement exécutée (pas simulée, pas anticipée) ;
- l'action a été validée par le serveur (distance, état, anti-cheat) ;
- jamais basé sur la simple présence de l'outil dans l'inventaire ;
- jamais basé sur une déclaration ou un payload client.

---

#### Invariant O2 — Independent progression

Chaque `MasteryXpContext` est **calculé indépendamment**. Aucun contexte n'est automatiquement un pourcentage d'un autre.

Chaque contexte peut avoir ses propres coefficients, multiplicateurs et règles.

```
Craft Sword
  → MasteryXpContext(smithing)  → xpAmount : 12   [base craft élevée]
  → MasteryXpContext(hammer)    → xpAmount : 3    [base tool_use réduite]
```

Les montants ne partagent pas de formule commune. Le ratio `12 / 3` est une conséquence des constantes de domaine, pas une règle fixe.

---

#### Invariant O3 — Multi-context runtime

Une action Runtime peut produire **zéro, un ou plusieurs** `MasteryXpContext`. Le moteur ne doit jamais supposer qu'une action produit un seul contexte.

```
Forge épée       → Smithing + Hammer
Pêche au harpon  → Fishing + Spear
Soin sacré       → Restoration + Staff      (futur)
Commandement     → Leadership + Diplomacy   (futur)
Attaque à mains nues → (aucun contexte si mastery 'unarmed' non défini)
```

Les domaines qui ne produisent qu'un seul contexte restent valides — la règle est que le moteur ne peut pas en supposer le nombre.

---

#### Invariant O4 — Runtime authority

**Seul le Runtime est autorisé à produire des `MasteryXpContext`.**

Interdit :
- `CreatureTemplate` produit ou impose directement un `MasteryXpContext`
- `ResourceTemplate` produit ou impose directement un `MasteryXpContext`
- `CraftRecipe` produit ou impose directement un `MasteryXpContext`
- le client produit, suggère ou impose un `MasteryXpContext`

Les templates fournissent uniquement des **données de contexte** (difficulté, catégorie, tier…). Le Runtime décide :
- combien de contextes sont produits ;
- quels masteries sont ciblés ;
- quelles valeurs d'`outcome`, `difficulty`, `quality` sont appliquées ;
- quels coefficients s'appliquent.

---

#### Note de rejet

> Toute future proposition de champ du type `gatherMasteryXpReward`, `craftMasteryXpReward`, `killMasteryXpReward`, `resourceMasteryKey`, `creatureMasteryKey` ou équivalent **doit être rejetée**, sauf remplacement par une ADR dédiée.
>
> Ces champs violent les invariants O1, O2, O3 et O4 en déléguant au template une décision qui appartient exclusivement au Runtime.

---

### Architecture de persistance : `MasteriesService.applyMasteryXpInTx`

`MasteriesService` reste le **seul point d'écriture** sur `PlayerMastery`. Aucune mutation directe autorisée en dehors de ce service.

```typescript
interface MasteryXpResult {
  masteryKey: string
  level: number
  xp: number
  nextLevelXp: number    // Infinity si maxLevel atteint
  leveledUp: boolean
}

// Méthode unique d'entrée pour tous les domaines :
MasteriesService.applyMasteryXpInTx(
  characterId : string,
  masteryKey    : string,
  xpAmount    : number,
  manager     : EntityManager,
): Promise<MasteryXpResult>
```

Comportement interne : `getOrCreatePlayerMasteryInTx` → `applyXpInTx` → retourne `MasteryXpResult`. Ces deux primitives existent déjà dans `MasteriesService`.

---

### Transaction unique

**Une seule transaction par action gameplay.** Toutes les récompenses (loot, XP personnage, XP mastery, futures récompenses) vivent dans la même transaction.

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
     ├─ buildMasteryXpContext(...)
     │   → calculateMasteryXp(context)
     │   → MasteriesService.applyMasteryXpInTx(...)          ← Mastery XP
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
  client.emit('mastery_update', masteryXpResult)
  client.emit('loot', loot)
```

**Règle** : les émissions socket ont lieu après le commit. Jamais pendant la transaction.

---

## Flux par domaine

---

### Combat

**Actions générant de l'XP mastery :**

| Action | Contexte pertinent | Mastery résolu |
|---|---|---|
| Attaque atterrie (`attack_hit`) | `weapon`, `damage`, `targetLevel` | arme équipée (`right-hand`) |
| Parade (`parry`) | `weapon`, `blockedDamage` | arme défensive |
| Blocage bouclier (`block`) | `blockedDamage` | `shield_mastery` (futur) |
| Tir à distance (`ranged_hit`) | `weapon`, `damage`, `targetLevel` | `bow` ou `crossbow` |
| Soin (`heal`) | `healedAmount` | `healing` (futur) |
| Buff appliqué | `duration` | `support` (futur) |
| Debuff appliqué | succès | mastery magique (futur) |

**Règle** : l'XP combat est accordée à l'**action** (hit, parry, heal…), pas au kill. Le kill n'accorde que de l'XP personnage (`killCharacterXpReward`).

**Résolution du mastery combat** : déterminée par `weaponType` de l'item en slot `right-hand` au moment de l'action. Si le slot est vide, aucun mastery ne progresse (mains nues = domaine futur distinct).

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
  │     { masteryKey, xpAmount } = calculateMasteryXp(context)
  │     if (xpAmount > 0) : MasteriesService.applyMasteryXpInTx(...)
  └─ commit
  ↓
Émission : character_xp_update, mastery_update, loot
```

---

### Récolte (Gathering)

Le `ResourceTemplate` ne porte **aucun champ `gatherMasteryXpReward`** ni `gatherMasteryKey`.

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
  │     { masteryDefinitionKey, xpAmount } = calculateMasteryXp(context)
  │     if (xpAmount > 0) : MasteriesService.applyMasteryXpInTx(...)
  └─ commit
  ↓
Émission : character_xp_update, mastery_update, resource_update
```

---

### Craft

Le `CraftRecipe` ne porte **aucun champ `craftMasteryXpReward`** ni `craftMasteryKey`.

Il expose uniquement :
- `difficulty` (niveau de recette)
- `category` (forge, menuiserie, alchimie…)
- ingrédients, station requise

Le Runtime calcule l'XP depuis `difficulty`, `quality`, `outcome` — jamais depuis un champ de template.

L'XP craft est accordée à la **complétion** du CraftJob (jamais au lancement ni
au claim) ; l'output n'est matérialisé qu'au **claim**, dans une transaction
distincte.

#### Règle XP succès / échec (V1)

L'XP est calculée **par tentative** (`quantity` tentatives par job), depuis le
**snapshot** du job uniquement :

- **Succès** : `+craftCharacterXpReward` (XP personnage) **et** XP compétence
  pleine (`calculateMasteryXp`, dépend de `difficulty`) — un output est possible
  selon la `chance` de chaque résultat.
- **Échec** : **0 XP personnage**, XP compétence **partielle** =
  `floor(perSuccessMasteryXp × FAILURE_MASTERY_XP_MULTIPLIER)` — **aucun output**.

`FAILURE_MASTERY_XP_MULTIPLIER = 0.25` est une **constante métier V1** unique
(`crafting.constants.ts`), non configurable en DB, documentée ici (Runtime ⇄
DevTools ⇄ ADR).

> **Cohérence avec le coefficient d'`outcome`** — la valeur `0.25` est
> volontairement **identique** au coefficient générique `failed` du modèle
> `calculateMasteryXp` (§ Outcome). Le craft V1 ne passe cependant **pas** par ce
> coefficient : `buildCraftMasteryXpContext` construit toujours un contexte
> `success: true` (→ `perSuccessMasteryXp`), et la part d'échec est appliquée
> **au niveau du job** dans `complete()` via `FAILURE_MASTERY_XP_MULTIPLIER`
> (agrégation par nombre d'échecs). Les deux couches expriment la même règle
> ("l'effort raté rapporte 25 %") ; toute évolution doit les garder alignées.

Total accordé sur un job :

```
grantedCharacterXp = craftCharacterXpReward × successes
grantedMasteryXp     = perSuccessMasteryXp × successes
                   + floor(perSuccessMasteryXp × 0.25) × failures
```

#### Stockage et affichage

`complete()` **fige** `grantedCharacterXp` et `grantedMasteryXp` sur le `CraftJob`
(colonnes dédiées) au moment où l'XP est réellement appliquée. Le **frontend
affiche ces valeurs telles quelles** (job en cours/terminé et résumé de claim) —
il ne recalcule jamais l'XP. Le DevTools n'expose que des **estimations lecture
seule** (`estimateCraftMasteryXp`, aperçu échec 25 %), le serveur restant l'autorité.

```
CraftJobService.complete()  [transaction, RUNNING → COMPLETED/FAILED]
  ├─ tirage succès/échecs par tentative depuis le snapshot
  ├─ consommation ingrédients réservés (ItemTransferService, CONSUME_FROM_CRAFT_ORDER)
  ├─ perSuccessMasteryXp = calculateMasteryXp(buildCraftMasteryXpContext(job, masteryLevel)).xpAmount
  ├─ grantedMasteryXp     = perSuccessMasteryXp×successes + floor(perSuccessMasteryXp×0.25)×failures
  ├─ grantedCharacterXp = craftCharacterXpReward×successes
  ├─ if (grantedMasteryXp > 0)     : MasteriesService.applyMasteryXpInTx(...)
  ├─ if (grantedCharacterXp > 0) : ProgressionService.applyCharacterXpInTx(...)
  ├─ job.grantedCharacterXp / job.grantedMasteryXp figés
  └─ commit  (idempotent : un job non-RUNNING n'accorde jamais de nouveau)

CraftJobService.claim()  [transaction séparée, COMPLETED → CLAIMED]
  └─ production item (ItemMaterializationService)  // SEULE matérialisation ; aucune XP
```

---

### Domaines futurs

Chaque nouveau domaine suit le même pattern : construire un `MasteryXpContext`, appeler `calculateMasteryXp`, appeler `applyMasteryXpInTx` — le tout dans la transaction de l'action.

| Domaine | Action déclencheur | Contexte clé |
|---|---|---|
| Diplomatie | Persuasion NPC tentée | `targetLevel`, `outcome` |
| Leadership | Buff groupe appliqué | `duration`, nombre de cibles |
| Exploration | Nouvelle zone découverte | tier de zone |
| Cuisine | Recette préparée | `difficulty`, `quality` |
| Pêche | Poisson attrapé | qualité, tier de poisson |
| Crochetage | Serrure tentée | tier de serrure, `outcome` |
| Équitation | Distance parcourue (throttlé) | durée de trajet |

`calculateMasteryXp` est étendu domaine par domaine. `MasteriesService` ne change jamais.

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
│  [Aucun *MasteryXpReward. Aucun *MasteryKey.]                           │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ contexte brut
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GAMEPLAY RUNTIME                                │
│                                                                      │
│  Domaine construit MasteryXpContext                                    │
│  { masteryDefinitionKey, domain, action, outcome, difficulty, quality… } │
│    weapon, resource, recipe, targetLevel, characterLevel, … }        │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ MasteryXpContext
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     calculateMasteryXp(context)                        │
│                     [fonction pure, testable]                        │
│                                                                      │
│  Résout  → masteryKey                                                  │
│  Calcule → xpAmount                                                  │
│                                                                      │
│  Retourne { masteryKey, xpAmount } | null                              │
└──────────────┬──────────────────────────┬───────────────────────────┘
               │ xpAmount                 │ (parallèle)
               ▼                          ▼
┌──────────────────────────┐   ┌───────────────────────────────────┐
│  MasteriesService            │   │  ProgressionService               │
│  .applyMasteryXpInTx()      │   │  .applyCharacterXpInTx()         │
│  [seul point écriture]    │   │  [seul point écriture char XP]   │
└──────────┬───────────────┘   └──────────────┬────────────────────┘
           │                                   │
           ▼                                   ▼
      PlayerMastery (DB)                  Character (DB)
           │                                   │
           └──────────────┬────────────────────┘
                          │ après commit
                          ▼
               Émission sockets
           ┌──────────────────────┐
           │  mastery_update        │
           │  character_xp_update │
           │  loot / autres       │
           └──────────────────────┘
```

---

## Règles critiques

1. **Aucun template ne porte `*MasteryXpReward` ni `*MasteryKey`.** Architecturalement interdit.
2. **`calculateMasteryXp` est la seule source de vérité** pour le calcul de l'XP mastery. `masteryDefinitionKey` est fourni par le domaine appelant.
3. **`MasteriesService.applyMasteryXpInTx`** est le seul point d'écriture sur `PlayerMastery`. Zéro mutation directe autorisée ailleurs.
4. **Transaction unique** : loot + Character XP + Mastery XP dans la même transaction. Jamais deux transactions séparées pour les récompenses d'une même action.
5. **Émissions socket après commit.** Jamais pendant la transaction.
6. **`calculateMasteryXp` est une fonction pure.** Pas d'injection, pas d'I/O. Testable sans base de données.
7. **Le domaine construit le contexte.** `calculateMasteryXp` ne connaît pas les services métier.
8. **`ProgressionService.applyCharacterXpInTx`** reste la seule voie pour l'XP personnage. Même règle de transaction.
9. **`outcome` est un coefficient, jamais une condition binaire.** `calculateMasteryXp` n'exclut pas l'XP sur `failed` — il applique le coefficient `0.25`. Seul `cancelled` retourne `null`.
10. **Le kill ne génère jamais d'XP mastery.** Il accorde uniquement XP personnage (`killCharacterXpReward`) + loot.
11. **Un domaine peut produire N contextes pour une même action.** `calculateMasteryXp` est appelé une fois par contexte. Tous les `applyMasteryXpInTx` vivent dans la même transaction.
12. **L'outil doit être réellement équipé.** Le domaine vérifie l'équipement avant de construire le contexte outil. Aucun XP outil sans outil utilisé.

---

## Conséquences et impacts

### Sur les templates (DB)

| Template | Impact |
|---|---|
| `CreatureTemplate` | Aucun nouveau champ — `killCharacterXpReward` déjà présent |
| `ResourceTemplate` | +`gatherCharacterXpReward` (int, nullable) — aucun `gatherMasteryXpReward` |
| `CraftRecipe` | +`craftCharacterXpReward` (int, nullable) — aucun `craftMasteryXpReward` |

### Sur les services existants

| Service | Impact |
|---|---|
| `MasteriesService` | +`applyMasteryXpInTx` (méthode publique unifiée) — additionnel, pas breaking |
| `ProgressionService` | Inchangé |
| `CreaturesService` | +`buildCombatContext` × N + appels `calculateMasteryXp` + `applyMasteryXpInTx` dans la transaction |
| `ResourcesService` | +`buildGatherContext` + `buildToolContext` selon outil équipé (Phase 2c) |
| `CraftingService` | +`buildCraftContext` + `buildToolContext` selon outil équipé (Phase 2d) |

### Sur `MasteryDefinition.category`

La taxonomie de catégories existante (`gathering`, `crafting`, `combat`, `social`, `leadership`) doit être alignée avec la classification Organic Cross-Mastery :

| Catégorie actuelle | Catégorie cible | Notes |
|---|---|---|
| `gathering` | `profession` | woodcutting, mining, farming, fishing… |
| `crafting` | `profession` | smithing, woodworking, alchemy… |
| `combat` | `weapon` | two_handed, bow, crossbow… + hammer, axe, pickaxe |
| `social` | `social` | diplomacy — inchangé |
| `leadership` | `social` | fusionnable avec social ou garder distinct |
| *(absent)* | `support` | healing, shield_mastery |
| *(absent)* | `magic` | fire_magic, restoration |

La migration de `category` est un changement de données (DB + seed) à réaliser avant l'affichage frontend des masteries. Elle n'affecte pas le calcul d'XP.

### Nouveau module

| Module | Rôle |
|---|---|
| `mastery-xp-calculator` (ou `progression/mastery-xp`) | Exporte `calculateMasteryXp`, `buildCombatContext`, `buildGatherContext`, `buildCraftContext`, le type `MasteryXpContext`. Pas de dépendances NestJS — module TypeScript pur. |

### Frontend

| Composant | Impact |
|---|---|
| `mastery.store.js` | Nouveau store Zustand singleton — parallèle à `character.store.js` |
| `WorldScene.js` | +écoute `mastery_update` → dispatch vers `mastery.store` |
| `CharacterLayer` | +onglet Masteries affichant `PlayerMastery[]` depuis le store |

---

## Avantages

| Propriété | Détail |
|---|---|
| **Templates allégés** | Les templates décrivent le jeu, pas les formules de progression. Modifiables par des designers sans risque de casser la balance mastery. |
| **Calcul centralisé et testable** | `calculateMasteryXp` pure function — 100% testable unitairement, sans DB, sans NestJS. |
| **Extension sans modification du service** | Nouveau domaine → nouveau `buildXxxContext` + entrée dans `calculateMasteryXp`. `MasteriesService` ne change pas. |
| **Transaction atomique** | Loot + XP personnage + XP mastery commitent ensemble. Pas d'état partiellement récompensé. |
| **Un seul point d'écriture** | `MasteriesService.applyMasteryXpInTx` — auditabilité totale. |
| **Parallèle cohérent** | `ProgressionService` (char XP) ↔ `MasteriesService` (mastery XP) — même contrat transactionnel, même pattern. |
| **Évolutivité** | Ajouter un coefficient de buff, un malus de niveau, un bonus de qualité = modifier `calculateMasteryXp`. Aucun template à migrer. |

---

## Limites documentées

- **`weaponType`** : champ nécessaire sur `Item` pour la résolution du mastery combat — à vérifier avant Phase 2b.
- **Mastery check** (level de mastery requis pour une action) : non couvert dans cette ADR — système séparé à concevoir en Phase 3.
- **XP throttling** : le service XP ne throttle pas. Le throttling doit venir du domaine (cooldown d'action existant). Acceptable en Phase 2.
- **Mains nues** : mastery `unarmed` non défini — actions sans arme n'accordent pas d'XP mastery en Phase 2.
- **Code Phase 2a à mettre à jour** : `MasteryXpContext.success: boolean` → `MasteryXpContext.outcome: MasteryOutcome`. Les tests correspondants doivent être mis à jour avant l'implémentation Phase 2b. Aucun domaine n'utilise encore le module — le changement est non-breaking.

---

## Ordre d'implémentation

```
Phase 2a — Fondation (prérequis à tout le reste)  [DONE — commit 3ec0e74]
├── MasteriesService.applyMasteryXpInTx (+ tests unitaires)
├── Module mastery-xp-calculator : MasteryXpContext + calculateMasteryXp
├── Exporter MasteriesModule vers les modules consommateurs
└── [À faire avant Phase 2b] : migrer success:boolean → outcome:MasteryOutcome dans MasteryXpContext + calculateur + tests

Phase 2b — Combat mastery XP
├── Vérifier/ajouter weaponType sur Item
├── Implémenter buildCombatContext
├── Implémenter calculateMasteryXp pour domain='combat'
├── Intégrer dans CreaturesService (transaction unique loot+charXP+masteryXP)
├── Émission mastery_update dans CreaturesGateway
└── Tests CreaturesService + calculateMasteryXp combat

Phase 2c — Récolte mastery XP
├── Ajouter gatherCharacterXpReward sur ResourceTemplate
├── Implémenter buildGatherContext
├── Implémenter calculateMasteryXp pour domain='gathering'
├── Intégrer dans ResourcesService
└── Tests

Phase 2d — Craft mastery XP
├── Ajouter craftCharacterXpReward sur CraftRecipe
├── Implémenter buildCraftContext
├── Implémenter calculateMasteryXp pour domain='crafting'
├── Intégrer dans CraftingService
└── Tests

Phase 2e — Frontend
├── mastery.store.js (Zustand singleton)
├── Écoute mastery_update dans WorldScene
└── Onglet Masteries dans CharacterLayer

Phase 3 — Évolutions
├── Mastery check (level requis pour actions)
├── Coefficients de buff/debuff dans calculateMasteryXp
├── Bonus qualité craft
├── Domaines supplémentaires (diplomatie, exploration, cuisine…)
└── Exposition GameConfig des constantes de formule
```
