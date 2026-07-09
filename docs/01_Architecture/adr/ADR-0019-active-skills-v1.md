# ADR-0019 — Skills actifs V1 (implémentation bornée)

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-07-09
- Date proposed: 2026-07-09
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on:
  - docs/01_Architecture/adr/ADR-0018-class-mastery-progression.md
  - docs/01_Architecture/adr/ADR-0016-skills-rewards-runtime.md
  - docs/01_Architecture/adr/ADR-0012-gameplay-architecture.md
  - docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md
  - docs/01_Architecture/adr/ADR-0003-movement-authority.md
- Used by: Project owner, backend developers, gameplay designers, Studio developers,
  repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents:
  - STATUS.md
  - CLAUDE.md (Frontière Runtime / Admin, Sécurité)
- Related code:
  - apps/api-gateway/src/creatures/creatures.service.ts (attack — pattern de validation)
  - apps/api-gateway/src/creatures/combat-damage.calculator.ts (calcul pur)
  - apps/api-gateway/src/creatures/creatures.gateway.ts (handler socket combat)
  - apps/api-gateway/src/characters/character-stats-calculator.ts (stats serveur)
  - apps/api-gateway/src/masteries/masteries.service.ts (niveaux de mastery)
  - apps/api-gateway/src/derived-stats/derived-stats.service.ts (config éditable, pattern à copier)
  - apps/api-gateway/src/admin/admin.controller.ts (routes admin gardées)
  - apps/client/src/components/DevTools/AssetPicker.tsx (sélecteur d'icône)
  - apps/client/src/components/DevTools/modules/CharacterProgression/ (éditeur de config de référence)

---

## Context

ADR-0018 fixe le vocabulaire et la cible finale :

- **Mastery** = progression passive / maîtrise progressive.
- **Skill** = action active utilisable.
- **Talent** = hors scope V1.

ADR-0018 est cependant **Draft / Proposed** et porte un **non-goal explicite
« Pas d'implémentation »**, plus des open questions non tranchées (classe unique
vs multi-classe, ressource magique, réconciliation des deux systèmes de stats).
En l'état, aucun code Skill ne peut être écrit sans contredire ce non-goal.

Cette ADR **débloque une V1 volontairement limitée** des skills actifs, sans
prétendre couvrir le système final d'ADR-0018 ni trancher ses open questions.
Elle borne le chantier pour permettre un premier incrément livrable, sûr et
cohérent avec l'architecture existante.

Le combat V1 existant fournit le pattern de référence : `CreaturesService.attack()`
valide côté serveur cooldown (Map mémoire `lastAttackAt`), portée
(`chebyshevDistanceWU` + portée effective), état vivant et map, puis calcule les
dégâts via la fonction **pure** `calculateCombatDamage()`. Les stats lues sont
celles de `CharacterStatsCalculator` (le système branché au combat).

---

## Problem

Sans cadrage explicite, un premier jet de skills actifs risquerait de :

- introduire des effets temporaires (buff/debuff/contrôle) hors du pipeline
  Runtime, qui n'est pas encore branché au combat joueur (dette ADR-0018) ;
- dépendre de ressources (mana/énergie) qui n'existent pas encore en base ;
- présumer un modèle de classe/sous-classe inexistant ;
- déplacer du calcul (dégâts, coût, cooldown) côté client ;
- dupliquer le catalogue de masteries au lieu d'une table dédiée.

---

## Decision drivers

- Le serveur reste l'**unique autorité** (ADR-0004, ADR-0003, CLAUDE.md
  « Sécurité »). Le client n'envoie qu'une intention.
- Réutiliser l'existant avant de créer : pattern `attack()`,
  `CharacterStatsCalculator`, `MasteriesService`, `AssetPicker`, pattern
  d'éditeur de config `DerivedStatsService`/CharacterProgression.
- Ne pas ouvrir de chantier bloqué : exclure tout ce qui exige le wiring Runtime
  effects ou des ressources non implémentées.
- Rester compatible et additif avec ADR-0018 : la V1 est un sous-ensemble strict,
  extensible vers la cible sans rupture de contrat.

---

## Considered options

### Option A — V1 instantanée, créatures seules, table dédiée (retenue)

Skills instantanés (dégâts/soin), cible créature uniquement, `skill_definition`
dédiée, cooldown serveur en mémoire, scaling serveur, aucun RuntimeEffect.

**Forces :** livrable rapidement, aucun prérequis bloquant, réutilise le pattern
combat, sécurisé, extensible vers ADR-0018.
**Faiblesses :** pas d'effets temporaires ni de PvP ; scaling branché sur
`CharacterStatsCalculator` (à réconcilier plus tard avec le pipeline Runtime).

### Option B — Attendre l'acceptation complète d'ADR-0018

Ne rien implémenter avant de trancher classe/ressource/réconciliation stats.

**Faiblesses :** bloque tout incrément Skill pour une durée indéterminée. Rejeté.

### Option C — Skills via RuntimeEffect dès la V1

Brancher immédiatement buff/debuff/amplification mastery sur
`PlayerRuntimeEffect`/`EffectSource`.

**Faiblesses :** le pipeline `player-runtime` n'est pas branché au combat joueur
(dette ADR-0018) ; exige la réconciliation des stats en prérequis. Trop large
pour une V1. Rejeté.

---

## Decision

**Option A est retenue.** Aucune valeur d'équilibrage n'est figée : les nombres
sont des paramètres configurables via `skill_definition` (DevTools).

### 1. Objectif V1

- Permettre à un personnage de **lancer un skill actif instantané** contre une
  **créature**, entièrement validé et calculé côté serveur.
- Fournir un **catalogue `skill_definition` éditable en DevTools** (nom,
  description, icône, prérequis, coût préparé, cooldown, portée, effet, scaling).
- Établir le **contrat socket `skill:cast`** (intention client → résolution
  serveur) réutilisant les émissions de combat existantes.

### 2. Hors scope V1

- **PvP** et cible joueur/allié : exclus (créatures uniquement).
- **Buff / debuff temporaires**, **contrôle**, **mobilité** : exclus.
- **RuntimeEffect** (`PlayerRuntimeEffect`, `EffectSource`) : non utilisé en V1.
- **Zone / multi-cibles / channel** : exclus (mono-cible instantané seulement).
- **Classe / sous-classe obligatoire** : non introduite (`requiredClass`
  nullable/différé).
- **Ressources mana/énergie courantes** : non implémentées ; seuls les skills
  **sans coût** ou à **coût `health`** sont exécutables en V1 (voir § 4).
- **Talents** : hors scope (ADR-0018).

### 3. Modèle minimal `skill_definition`

Table **dédiée** (ne réutilise jamais `mastery_definition`). Config uniquement —
aucun état joueur. Éditée exclusivement par le service Skills (jamais d'INSERT
direct depuis l'admin, cf. Studio SDK / ItemTemplate).

| Champ | Type | Rôle V1 |
|---|---|---|
| `id` | uuid PK | — |
| `key` | varchar unique, stable | référence runtime, jamais modifiée après usage |
| `name` | varchar | affichage |
| `description` | text | affichage |
| `iconAssetPath` | varchar (AssetPath Vite) | icône via `AssetPicker` |
| `enabled` | boolean | activation |
| `requiredLevel` | int, default 0 | prérequis niveau perso |
| `requiredClass` | varchar **nullable** | **différé** — jamais bloquant en V1 |
| `requiredMasteries` | jsonb `{ key: level }`, default `{}` | prérequis masteries (supporté) |
| `resourceType` | enum `health \| mana \| energy` | coût **préparé** |
| `resourceCost` | int, default 0 | `0` autorisé ; `mana`/`energy` > 0 non exécutable en V1 |
| `cooldownMs` | int | cooldown serveur |
| `castTimeMs` | int, default 0 | V1 : instantané attendu (`0`) — champ préparé |
| `rangeWU` | int | portée de validation (Chebyshev WU) |
| `effectType` | enum `damage \| heal` | **V1 : uniquement ces deux** |
| `scaling` | jsonb | coefficients (voir § 6) |
| `createdAt` / `updatedAt` | timestamps | — |

> Les champs `castTimeMs`, `resourceType`/`resourceCost` (mana/energy),
> `requiredClass` sont **présents mais non pleinement actifs** en V1 : ils
> préparent l'évolution ADR-0018 sans ouvrir de scope. `radiusWU`, `targetMode`,
> `effectDurationMs`, `stackable`, `effects[]` (RuntimeEffect) sont
> **volontairement absents** de la V1 et seront ajoutés par une ADR ultérieure.

**État joueur de déverrouillage** : optionnel en V1. Une table
`player_skill_unlock { characterId, skillDefinitionId, unlockedAt }` peut être
introduite ; à défaut, la règle V1 est « tout skill `enabled` dont les prérequis
(`requiredLevel`, `requiredMasteries`) sont satisfaits est lançable ». Le choix
est laissé à l'implémentation (§ 9, étape 5), sans impact sur le contrat socket.

**Cooldown runtime** : **jamais persisté**. Map mémoire serveur
`(characterId + skillKey) → lastCastAt`, sur le modèle de `lastAttackAt`.

### 4. Validation serveur

Le handler socket **`skill:cast`** reçoit une **intention**
`{ skillKey, targetId }` (cible créature). Le serveur valide, dans l'ordre, en
réutilisant le pattern `attack()` :

1. **Skill existant et `enabled`** (chargé depuis le service Skills).
2. **Personnage vivant** (`health > 0`) et joueur rattaché au socket
   (`client.data.player`).
3. **Prérequis** : `requiredLevel`, `requiredMasteries` (via `MasteriesService`).
   `requiredClass` ignoré en V1 s'il est `null`.
4. **Cible valide** : créature présente dans `liveCreatures`, non `dead`.
5. **Même map** (anti-exploit inter-map).
6. **Portée** : `chebyshevDistanceWU(positionLive, cible) ≤ rangeWU`, position
   lue depuis l'état runtime live (`ConnectedPlayer`), **jamais le client**.
7. **Cooldown** : `now - lastCastAt(characterId, skillKey) ≥ cooldownMs`.
8. **Coût** : si `resourceCost > 0` et `resourceType = health`, vérifier/décrémenter
   les PV ; si `resourceType ∈ { mana, energy }`, **rejeter l'exécution en V1**
   (ressource non implémentée). `resourceCost = 0` toujours exécutable.

Tout rejet renvoie `skill:error` (aucune mutation d'état). En succès, le serveur
applique l'effet, arme le cooldown, persiste ce qui doit l'être (PV créature,
XP/mastery éventuelles via les services existants et la transaction unique
ADR-0016) et émet les événements de résultat.

**Émissions** (après commit) : réutiliser les events existants
`creature_update`, `creature_hit` / `character_damaged` (selon effet) et
`combat_event` (`damage`/`death`), plus `skill:cooldown`
`{ skillKey, cooldownMs }` pour l'UI. Le client ne calcule ni dégâts, ni coût,
ni cooldown.

### 5. Ciblage créature

- **Mono-cible instantané uniquement.** La cible est une créature identifiée par
  `targetId`, résolue serveur dans `liveCreatures`.
- `effectType = damage` : applique des dégâts à la créature (réutilise le pipeline
  de `attack()` : `calculateCombatDamage` ou calcul pur équivalent, mort +
  respawn + loot + XP gérés par le flux combat existant).
- `effectType = heal` : en V1, cible = créature uniquement (cohérent « cibles =
  créatures »). Le soin d'entités **joueur** est hors scope (pas d'`ally`/`self`
  ciblable). Une implémentation peut donc restreindre `heal` à un usage interne/
  test tant qu'aucune cible soignable pertinente n'existe — à trancher à
  l'implémentation sans élargir le scope.
- Pas de zone, pas de multi-cible, pas de propagation.

### 6. Scaling stats / masteries

- Le scaling est **calculé côté serveur**, jamais côté client.
- Source des stats : `CharacterStatsCalculator.compute(character, derivedDefs)` —
  `final` (primaires) et `derived` (le système déjà branché au combat).
- Source des masteries : `MasteriesService` (niveaux du personnage).
- Un **calculateur pur** dédié (miroir de `calculateCombatDamage` /
  `calculateMasteryXp`, sans I/O, testable) applique les coefficients de
  `skill_definition.scaling` :
  - `primaryCoefficients` : `{ strength: k, dexterity: k, … }` × `final`.
  - `derivedCoefficients` : `{ physicalAttack: k, magicPower: k, … }` × `derived`.
  - `masteryCoefficients` : `{ masteryKey: k, … }` × niveau de mastery.
- Le résultat (dégâts ou soin) est appliqué par le service, dans la même
  transaction que les récompenses éventuelles (ADR-0016 : XP perso/mastery,
  émissions socket **après** commit).

### 7. Limites connues

- **Pas de mana/énergie courants** : skills à coût `mana`/`energy` non exécutables
  en V1 (définissables mais rejetés à l'exécution).
- **Pas de RuntimeEffect** : aucun effet persistant/temporaire ; la V1 ne touche
  pas `PlayerRuntimeEffect`/`EffectSource`.
- **Scaling sur `CharacterStatsCalculator`**, pas sur le pipeline `player-runtime`
  (6 StatKeys, non branché combat). La réconciliation reste une dette ADR-0018.
- **`requiredClass` inerte** tant qu'aucun modèle de classe n'existe.
- **Pas de cast time réel** : `castTimeMs` préparé mais V1 = instantané.
- **Pas d'UI action bar validée** : le déclenchement UI joueur (hotbar/raccourci)
  est un chantier de design distinct à valider (CLAUDE.md « grosse UI »).
- **`heal` sans cible joueur** : peu utile tant que seules les créatures sont
  ciblables ; conservé au modèle pour l'extension.

### 8. Relation avec ADR-0018

- Cette ADR est un **sous-ensemble strict et additif** d'ADR-0018 : mêmes
  définitions (skill actif, mastery passive, talent hors scope), mêmes principes
  de sécurité et d'autorité serveur.
- Elle **ne tranche aucune** open question d'ADR-0018 (classe unique/multi,
  ressource magique, réconciliation stats) : elle les **contourne** en excluant
  de la V1 tout ce qui en dépend.
- Elle lève **ponctuellement et de façon bornée** le non-goal « pas
  d'implémentation » d'ADR-0018 pour le seul périmètre décrit ici.
- La cible complète (RuntimeEffect, buffs/debuffs, amplification de mastery,
  ressources, classes, PvP, zone) **reste gouvernée par ADR-0018** et sera
  ouverte par des ADR d'implémentation ultérieures.
- Aucune modification du contenu d'ADR-0018 n'est requise ; un lien retour peut y
  être ajouté à son acceptation (facultatif).

### 9. Découpage d'implémentation

```
Étape 1 — Backend catalogue
├── Entité skill_definition + enums (resourceType, effectType)
├── SkillsService (cache mémoire + seed vide/exemple, invalidation à l'écriture)
├── Routes admin gardées (JwtAuthGuard + RolesGuard + @Roles(ADMIN)) :
│     GET/POST/PATCH/DELETE /admin/skill-definitions (+ /preview optionnel)
└── Tests unitaires service + validation DTO

Étape 2 — DevTools Skill Editor
├── Module modules/Skills/ (liste + formulaire), enregistré dans DevToolsPanel
├── Icône via AssetPicker (value/onChange/category)
├── Édition scaling (coefficients primaires/dérivés/masteries)
└── Preview lecture seule (facultatif, sur le modèle DerivedStats)

Étape 3 — Calculateur pur
├── calculateSkillEffect(context) : pur, sans I/O, testable
└── Tests unitaires (damage/heal, coefficients, planchers)

Étape 4 — Pipeline cast serveur
├── Handler socket skill:cast (intention → validation § 4)
├── SkillsService.cast() : cooldown map, coût health, application effet créature
├── Réutilisation combat_event / creature_update / character_damaged + skill:cooldown / skill:error
├── Transaction unique (récompenses ADR-0016), émissions après commit
└── Tests service cast (rejets + succès)

Étape 5 — Déverrouillage (optionnel V1)
├── Table player_skill_unlock OU règle « enabled + prérequis satisfaits »
└── Gating requiredLevel / requiredMasteries

Étape 6 — Frontend joueur (design à valider)
├── Liste/onglet Skills (réutilise le pattern d'onglets CharacterLayout)
├── Émission window.game.socket.emit('skill:cast', …)
└── Affichage cooldown/erreur (overlay combat_event + store cooldown)
```

---

## Rationale

- Réutiliser le pattern `attack()` garantit une V1 sûre (validation serveur
  éprouvée : cooldown, portée, position live, map) sans réinventer l'anti-cheat.
- Une table `skill_definition` dédiée respecte la séparation catalogue/état et la
  demande explicite de ne pas réutiliser `mastery_definition`.
- Scaler sur `CharacterStatsCalculator` cible le système réellement branché au
  combat, évitant une dépendance à la réconciliation Runtime encore ouverte.
- Exclure RuntimeEffect, ressources non implémentées et classes borne le chantier
  aux seules briques disponibles, donc livrable sans prérequis bloquant.

## Consequences

### Positive

- Premier incrément Skill livrable, sécurisé et cohérent avec l'existant.
- Catalogue configurable en DevTools, sans redéploiement.
- Contrat socket `skill:cast` posé et réutilisable par les extensions futures.
- Aucune dette Runtime nouvelle : la V1 n'introduit pas de système parallèle.

### Negative

- Périmètre volontairement étroit (instantané, créature, sans effet temporaire).
- Scaling sur `CharacterStatsCalculator` à réconcilier ultérieurement avec le
  pipeline Runtime (dette ADR-0018 inchangée, pas aggravée).
- Champs préparés mais inertes (`requiredClass`, `castTimeMs`, coûts mana/energy).

### Risks

- **Élargissement rampant** : toute demande de buff/debuff/zone/PvP doit être
  refusée en V1 et renvoyée à une ADR dédiée.
- **Client non fiable** : le respect strict de la validation § 4 est impératif ;
  aucun calcul de dégâts/coût/cooldown côté client.
- **Cohérence combat** : réutiliser le flux mort/respawn/loot/XP de `attack()`
  pour éviter deux chemins divergents de mise à mort de créature.

## Security impact

Toute valeur (dégâts, soin, coût, cooldown, éligibilité) est calculée et validée
serveur. Le client envoie une intention (`skillKey`, `targetId`) et reçoit un
résultat en lecture seule. Position lue depuis l'état runtime live
(`ConnectedPlayer`), jamais depuis le payload. Routes d'édition du catalogue
authentifiées et role-gated (JWT + rôle admin), sur le modèle des routes
`/admin/*` existantes.

## Performance impact

- Cooldown en mémoire : aucune I/O par cast pour le rate-limit.
- Le calcul de scaling est ponctuel (au cast), pas par tick.
- Réutilise les émissions room-scoped existantes (`combat_event`,
  `creature_update`) — pas de nouveau broadcast global.

## Migration and compatibility

Additive : une nouvelle table `skill_definition` (et éventuellement
`player_skill_unlock`). En dev, `synchronize: true` crée la table ; en prod, une
migration TypeORM dédiée est requise (dette migrations déjà tracée dans STATUS).
Aucune modification de schéma des entités existantes. Aucun contrat socket
existant modifié (ajout de `skill:cast` / `skill:cooldown` / `skill:error`).

## Validation

- [ ] Périmètre V1 relu et borné (aucun effet temporaire, créature seule).
- [ ] ADR-0018, ADR-0016, ADR-0012, ADR-0004, ADR-0003 relues — pas de
      contradiction non signalée.
- [ ] Impact sécurité examiné.
- [ ] Impact performance examiné.
- [ ] Validation humaine enregistrée.
- [ ] Registre ADR (`decisions.md`, `README.md`) mis à jour à l'acceptation.

## Open questions

- `player_skill_unlock` dès la V1, ou règle implicite « enabled + prérequis » ?
- `heal` V1 : conservé au modèle mais sans cible joueur — utile immédiatement ou
  purement préparatoire ?
- Constantes de scaling : entièrement sur `skill_definition`, ou certaines dans
  `GameConfig` ?

## Non-goals

- Pas de PvP, pas de cible joueur/allié.
- Pas de buff/debuff/contrôle/mobilité, pas de RuntimeEffect.
- Pas de zone/multi-cible/channel/cast time réel.
- Pas de modèle classe/sous-classe obligatoire.
- Pas de ressource mana/énergie courante.
- Pas de résolution des open questions structurelles d'ADR-0018.
- Pas d'action bar imposée (UI à valider séparément).

## Related files

- [ADR-0018 — Classes, sous-classes, statistiques, masteries et skills](ADR-0018-class-mastery-progression.md)
- [ADR-0016 — Masteries & Rewards Runtime](ADR-0016-skills-rewards-runtime.md)
- [ADR-0012 — Gameplay Architecture V1](ADR-0012-gameplay-architecture.md)
- [ADR-0004 — Runtime-Driven Architecture](ADR-0004-runtime-driven-architecture.md)
- [ADR-0003 — Movement authority](ADR-0003-movement-authority.md)
- [ADR Process](README.md)

## TODO

- [ ] Soumettre à revue humaine pour passage à `Accepted`.
- [ ] Trancher les Open questions (unlock, heal, constantes) avant l'étape 4.
- [ ] Ajouter l'ADR au registre (`decisions.md`, `adr/README.md`) à l'acceptation.
- [ ] Ajouter un lien retour depuis ADR-0018 à son acceptation (facultatif).
