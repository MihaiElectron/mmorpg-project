# ADR-0004 — Runtime-Driven Architecture

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-06-26
- Date proposed: 2026-06-26
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on:
  - docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md
  - docs/01_Architecture/adr/ADR-0002-entity-positioning.md
  - docs/01_Architecture/adr/ADR-0003-movement-authority.md
  - docs/01_Architecture/client-server-boundaries.md
  - docs/07_Admin/studio-sdk.md
  - docs/08_Gameplay/runtime/README.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents:
  - docs/08_Gameplay/runtime/runtime-entity.md
  - docs/08_Gameplay/runtime/runtime-sources.md
  - docs/08_Gameplay/runtime/runtime-modifiers.md
  - docs/08_Gameplay/runtime/runtime-trace.md
  - docs/08_Gameplay/runtime/runtime-snapshot.md
  - docs/08_Gameplay/runtime/runtime-inspector.md
  - docs/08_Gameplay/entity-architecture.md
  - docs/08_Gameplay/world-object-model.md
  - docs/02_Security/client-server-trust.md
- Related code:
  - apps/api-gateway/src/player-runtime/entity-runtime.types.ts
  - apps/api-gateway/src/player-runtime/runtime-source.ts
  - apps/api-gateway/src/player-runtime/player-runtime.types.ts
  - apps/api-gateway/src/player-runtime/player-runtime.service.ts
  - apps/client/src/components/DevTools/modules/PlayerRuntime/

---

## Context

Le projet dispose, depuis les Phases 1–12 du Studio SDK et du Runtime, d'une
infrastructure de calcul de stats dérivées en mémoire côté serveur.

Les composants suivants sont opérationnels (Implemented) :

**Couche Runtime backend :**
- `EntityRuntimeKind` — discrimination des 5 types d'entités (`player`, `creature`,
  `npc`, `resource`, `building`)
- `EntityRuntimeSnapshot<TBase, TDerived>` — contrat générique du snapshot
- `PlayerRuntimeSnapshot` — première implémentation concrète
- `RuntimeSource` / `RuntimeSourceKind` — contrat de pipeline de modifiers
- `EquipmentSource` — modifiers depuis l'équipement équipé
- `EffectSource` — modifiers depuis les effets actifs (opérationnel, retourne [] en Phase 4)
- `DebugRuntimeSource` — modifiers injectés en mémoire (dev/admin)
- `RuntimeModifier` — unité atomique de modification d'une stat
- `ModifierOperation` — pipeline de calcul (`flat → percent_add → percent_multiply`)
- `RuntimeTrace` / `StatTrace` / `ModifierApplication` — audit complet du calcul
- `PlayerRuntimeService` — service de calcul pour le joueur
- `EntityRuntimeService<TSnapshot>` — contrat de service générique

**Couche Studio SDK frontend :**
- `RuntimeInspectorPanel` — observe les modifiers actifs via snapshot
- `runtimeApi.ts` — couche API isolée (fetchSnapshot, debug endpoints)
- `modifierForm.ts` — helpers purs (getEquipmentModifiers, getDebugModifiers…)
- `player-runtime.types.ts` — types miroirs frontend

**Composants planifiés (Planned) mais pas encore implémentés :**
- `CreatureRuntimeService`, `ResourceRuntimeService`, `NpcRuntimeService`,
  `BuildingRuntimeService` et leurs snapshots respectifs
- Sources planifiées : `TalentSource`, `PassiveSkillSource`, `AuraSource`,
  `MountSource`, `ZoneSource`
- Événements Runtime sur bus Socket.IO

---

## Problem

Sans une décision architecturale explicite, les futures mécaniques de gameplay
risquent d'implémenter leurs propres systèmes de calcul de stats, de bonus, ou
d'état dérivé en dehors du pipeline Runtime. Cela crée :

1. **Calculs parallèles et dupliqués.** Un buff appliqué hors pipeline n'apparaît
   pas dans la `RuntimeTrace`. Le Studio ne peut pas l'expliquer. Le résultat
   est opaque, difficile à déboguer et impossible à inspecter.
2. **Logique métier côté client.** En l'absence de règle explicite, le client
   pourrait recalculer une stat à partir du snapshot pour en dériver une seconde
   valeur. La source de vérité se fragmente.
3. **Sources non traçables.** Un modifier appliqué directement sur l'entité DB
   sans passer par `RuntimeModifier` contourne la trace et l'audit.
4. **Incohérence du Studio SDK.** L'Inspector ne peut afficher que ce qui est
   dans le snapshot. Une mécanique hors pipeline devient invisible pour les outils
   d'administration.
5. **Duplication de la structure de données.** Chaque nouvelle mécanique invente
   son propre modèle de "bonus" ou "malus", rendant le code non uniforme.

---

## Decision drivers

- Le backend doit rester l'unique autorité sur les mécaniques de jeu (voir
  ADR-0003, `client-server-trust.md`).
- Tout effet sur une stat doit être explicitement traçable via `RuntimeTrace`.
- Le Studio SDK ne recalcule jamais — il observe uniquement.
- Les contrats génériques (`EntityRuntimeSnapshot`, `EntityRuntimeService`)
  permettent d'unifier tous les types d'entités sous un même modèle.
- Un développeur ajoutant une nouvelle mécanique doit pouvoir déterminer où
  l'insérer dans le pipeline existant sans créer de système parallèle.

---

## Considered options

### Option A — Runtime-Driven Architecture (décision proposée)

Toute nouvelle mécanique de gameplay modifiant une stat ou produisant un état
dérivé doit s'intégrer dans le pipeline Runtime existant :
`RuntimeSource → RuntimeModifier[] → Calculator → DerivedStats + RuntimeTrace → EntityRuntimeSnapshot`.

Les cinq questions suivantes doivent être répondues explicitement avant toute
implémentation d'une mécanique.

**Forces :**
- Traçabilité totale — toute valeur calculée a une origine visible.
- Uniformité — même modèle pour joueurs, créatures, NPCs, ressources, bâtiments.
- Studio SDK natif — toute mécanique est inspectable sans développement additionnel.
- Pas de duplication — `resolveModifiers` est agnostique et s'adapte à chaque
  nouvelle source sans modification.

**Faiblesses :**
- Les mécaniques très spécifiques (ex. IA créature à FSM complexe) peuvent ne
  pas se mapper naturellement sur `RuntimeModifier[]`.
- Le framework impose une discipline d'intégration, coût initial non nul.

### Option B — Mécaniques ad hoc par domaine

Chaque domaine gère ses propres calculs de stat de manière autonome, sans
infrastructure partagée. Les résultats sont exposés via leurs propres endpoints.

**Forces :**
- Flexibilité totale par domaine.
- Pas de dépendance croisée entre domaines.

**Faiblesses :**
- Duplication inévitable de la logique de calcul et d'audit.
- Impossibilité d'afficher les résultats dans un Studio SDK unifié.
- Chaque domaine développe ses propres outils d'inspection.
- Dette technique croissante — maintenance coûteuse sur le long terme.

---

## Decision

**Option A est retenue : Runtime-Driven Architecture.**

Toute nouvelle mécanique de gameplay qui produit un effet sur une stat dérivée
ou un état calculé doit s'intégrer dans le pipeline Runtime existant.

Avant toute implémentation, les cinq questions suivantes doivent recevoir une
réponse explicite :

---

### Question 1 — Quelle RuntimeEntity est concernée ?

Identifier le kind de l'entité touchée parmi `EntityRuntimeKind` :
`player`, `creature`, `npc`, `resource`, `building`.

Si aucun kind existant ne correspond, proposer une extension de
`EntityRuntimeKind` avant de commencer l'implémentation.

---

### Question 2 — Quelle RuntimeSource produit les données ?

Identifier ou créer la `RuntimeSource` qui transforme les données brutes
(DB, état en mémoire, événement réseau) en `RuntimeModifier[]`.

Si une source existante peut être étendue, la réutiliser. Si une nouvelle
source est nécessaire, l'implémenter en respectant le contrat `RuntimeSource` :
- `readonly kind: RuntimeSourceKind`
- `getModifiers(): RuntimeModifier[]` — aucune I/O, transformation en mémoire uniquement

La source doit être ajoutée dans `buildSources()` — unique point de construction.

---

### Question 3 — Quels RuntimeModifier sont générés ?

Définir les `RuntimeModifier[]` produits par la source :
- `targetStat` : quelle stat dérivée est ciblée (parmi `StatKey`)
- `operation` : `flat`, `percent_add`, ou `percent_multiply`
- `value` : valeur numérique
- `sourceType` : valeur dans `ModifierSourceType` (ajouter si nécessaire)
- `sourceLabel` : libellé lisible affiché dans l'Inspector et la trace
- `priority` : ordre d'application si plusieurs modifiers ciblent la même stat
  avec la même opération

Si la mécanique cible une stat non présente dans `StatKey`, ajouter la stat
avant de commencer — sans cette déclaration préalable, la stat ne peut pas être
ciblée.

---

### Question 4 — Comment le Studio SDK explique-t-il le résultat ?

Vérifier que :
- La source apparaît dans `snapshot.sources[kind=...]`.
- Les modifiers apparaissent dans `snapshot.trace.stats[stat].modifiers[]`.
- `sourceLabel` est suffisamment descriptif pour être affiché dans l'Inspector
  sans contexte supplémentaire.
- Aucun recalcul n'est nécessaire côté Studio — la trace suffit.

Si un Inspector spécialisé est nécessaire pour afficher la mécanique, le
construire à partir des composants génériques existants (`ModifierList`,
`ModifierRow`, `SectionBar`) sans dupliquer la logique de calcul.

---

### Question 5 — Quelle est la source de vérité ?

Identifier explicitement où vivent les données qui alimentent la `RuntimeSource` :

| Source de vérité | Exemples |
|---|---|
| DB PostgreSQL | Équipement équipé, stats de base Character |
| Mémoire serveur | Effets actifs en mémoire (`PlayerRuntimeEffect[]`), modifiers debug (`DebugModifierRegistry`) |
| WOM (World Object Model) | Position d'une crafting station, état d'une ressource |
| Événement réseau | Aura reçue d'une créature proche, zone de terrain spéciale |

La source de vérité détermine le cycle de vie du modifier : quand il apparaît,
quand il est invalidé, et avec quelle fréquence le snapshot doit être recalculé.

---

## Rationale

### Pourquoi ces cinq questions en particulier

Ces cinq questions couvrent les trois couches de l'architecture Runtime :
- Questions 1–2 : la **couche de données** (quelle entité, quelle source)
- Question 3 : la **couche de calcul** (quels modifiers, quelle stat)
- Question 4 : la **couche d'observation** (Studio SDK, Inspector)
- Question 5 : la **couche de persistance** (source de vérité, invalidation)

Une mécanique qui répond correctement aux cinq questions s'intègre naturellement
dans le pipeline existant. Une qui ne peut pas répondre à l'une d'elles révèle
un problème architectural à résoudre en amont.

### Pourquoi interdire les systèmes parallèles

Un système de bonus ou de malus hors pipeline — même temporaire — :
- crée une incohérence entre `DerivedStats` calculées et la valeur réelle appliquée ;
- rend impossible l'affichage dans le Studio Inspector ;
- fragmente la source de vérité des stats.

### Pourquoi le Studio ne calcule pas

Le Studio SDK observe pour ne pas avoir à être mis à jour à chaque évolution du
moteur de calcul. Si le Studio recalculait, toute modification du pipeline
(nouvel ordre d'opération, nouvelle source) exigerait une mise à jour synchronisée
du Studio. La séparation Observer/Calculator protège les deux parties.

---

## Rules

Les règles suivantes découlent de la décision et s'appliquent à toute
nouvelle implémentation :

1. **Backend autoritatif.** Le calcul de toute stat dérivée se fait
   exclusivement côté serveur dans le service Runtime. Le client ne recalcule
   pas, ne déduit pas, ne corrige pas.

2. **Traçabilité totale.** Tout modifier actif doit apparaître dans la
   `RuntimeTrace`. Aucun modifier ne peut être appliqué silencieusement.
   Si un effet ne peut pas être exprimé en `RuntimeModifier`, il ne doit pas
   modifier une stat dérivée.

3. **Sources inspectables.** Toute `RuntimeSource` doit produire des modifiers
   visibles dans `snapshot.sources`. Il ne doit pas exister de source "cachée"
   ou "interne" qui contribue au calcul sans apparaître dans le snapshot.

4. **Origines identifiables.** Tout `RuntimeModifier` doit avoir un `sourceType`,
   `sourceId`, et `sourceLabel` significatifs. Un modifier dont l'origine est
   inconnue ou générique (`sourceType = 'base'` sans justification) doit être
   revu.

5. **Contrats génériques en premier.** Utiliser `EntityRuntimeSnapshot` et
   `EntityRuntimeService` en priorité. Ne pas créer une interface propriétaire
   si le contrat générique suffit. N'étendre le contrat générique que pour les
   champs vraiment spécifiques à un kind.

6. **Pas de logique métier dans le Studio.** Le Studio peut afficher, grouper,
   filtrer et comparer des valeurs issues du snapshot. Il ne peut pas décider
   si une valeur est correcte, ni tenter de la corriger.

7. **Pas de duplication de pipeline.** Si deux mécaniques produisent des
   modifiers sur la même stat via des sources différentes, elles doivent toutes
   deux passer par `resolveModifiers()`. Il ne doit pas exister de chemin
   alternatif qui applique un modifier en bypassant le calculator.

8. **Source de vérité explicite.** Toute implémentation doit documenter où
   vivent les données qui alimentent sa `RuntimeSource` et quand le snapshot
   est invalidé.

---

## Examples

Les exemples suivants illustrent comment les cinq questions s'appliquent à des
mécaniques concrètes. Les mécaniques marquées **Planned** ne sont pas encore
implémentées — les questions sont données à titre de référence de conception.

---

### Example 1 — Equipment (Implemented)

| Question | Réponse |
|---|---|
| 1. RuntimeEntity | `player` — le personnage qui porte l'équipement |
| 2. RuntimeSource | `EquipmentSource` (kind=`equipment`) — lit `CharacterEquipment[]`, délègue à `equipmentToModifiers()` |
| 3. RuntimeModifier | Un modifier par stat modifiée par pièce équipée : `targetStat = maxHp`, `operation = flat`, `value = N`, `sourceType = equipment`, `sourceLabel = "Iron Sword"` |
| 4. Studio SDK | Section "Equipment" dans `RuntimeInspectorPanel` via `getEquipmentModifiers(snapshot)` — lecture seule, aucun recalcul |
| 5. Source de vérité | DB PostgreSQL — `character_equipment` — invalidée à chaque équipement/déséquipement |

---

### Example 2 — Buff temporaire (Planned)

| Question | Réponse envisagée |
|---|---|
| 1. RuntimeEntity | `player` — le personnage affecté par le buff |
| 2. RuntimeSource | `EffectSource` (kind=`effect`) — lit `PlayerRuntimeEffect[]` depuis `resolveEffects()` |
| 3. RuntimeModifier | Un modifier par `EffectModifierDef` dans l'effet : `targetStat = attackPower`, `operation = percent_add`, `value = 20`, `sourceType = buff`, `sourceLabel = "Rage"` |
| 4. Studio SDK | Section "Effects" dans l'Inspector — `snapshot.sources[kind='effect'].modifiers`, réutilise `ModifierList` |
| 5. Source de vérité | Mémoire serveur — `PlayerRuntimeEffect[]` actifs — invalidée à l'expiration (`expiresAt`) ou à la désactivation |

Note : `EffectSource` est implémentée mais `resolveEffects()` retourne `[]`.
Cette mécanique sera complète quand `resolveEffects()` sera alimentée.

---

### Example 3 — Creature Runtime (Planned)

| Question | Réponse envisagée |
|---|---|
| 1. RuntimeEntity | `creature` — la créature IA |
| 2. RuntimeSource | `CreatureZoneSource` (kind=`zone`) et/ou `AiStateSource` — selon la mécanique à appliquer |
| 3. RuntimeModifier | Modifiers sur `speed`, `attackPower`, `attackRange` selon l'état IA ou la zone |
| 4. Studio SDK | `CreatureRuntimeInspector` ou extension de l'Inspector générique — `snapshot.sources[]` d'un `CreatureRuntimeSnapshot` |
| 5. Source de vérité | Mémoire serveur — état IA (`aiState`, `aggroTarget`) — invalidée à chaque tick IA |

Pré-requis : définir `CreatureBaseStats`, `CreatureDerivedStats`,
`CreatureRuntimeSnapshot extends EntityRuntimeSnapshot<CreatureBaseStats, CreatureDerivedStats>`,
et `CreatureRuntimeService implements EntityRuntimeService<CreatureRuntimeSnapshot>`.

---

### Example 4 — Skill passif (Planned)

| Question | Réponse envisagée |
|---|---|
| 1. RuntimeEntity | `player` — le personnage qui possède le skill |
| 2. RuntimeSource | `PassiveSkillSource` (kind=`passive_skill`) — lit les skills actifs du personnage |
| 3. RuntimeModifier | Un modifier par bonus déclaré dans le skill : `targetStat = defenseTotal`, `operation = flat`, `value = N`, `sourceType = passive_skill`, `sourceLabel = "Iron Skin Lv.3"` |
| 4. Studio SDK | Section "Passive Skills" dans l'Inspector — `snapshot.sources[kind='passive_skill'].modifiers`, réutilise `ModifierList` |
| 5. Source de vérité | DB PostgreSQL — skills débloqués du personnage — invalidée quand le niveau ou le skill change |

---

### Example 5 — Building (Planned)

| Question | Réponse envisagée |
|---|---|
| 1. RuntimeEntity | `building` — le bâtiment qui produit l'effet |
| 2. RuntimeSource | `BuildingAuraSource` (kind=`aura`) — lit les bâtiments actifs proches de l'entité cible |
| 3. RuntimeModifier | Un modifier par bâtiment en portée : `targetStat = gatheringRange`, `operation = percent_add`, `value = 20`, `sourceType = aura`, `sourceLabel = "Watchtower"` |
| 4. Studio SDK | Section "Auras" dans l'Inspector — même composant `ModifierList` |
| 5. Source de vérité | WOM (World Object Model) — état des bâtiments placés et actifs — invalidée quand la position ou l'état du bâtiment change |

Pré-requis : définir `BuildingRuntimeSnapshot` et son service, puis implémenter
une source `AuraSource` capable de lire l'état des bâtiments proches via WOM.

---

## Consequences

### Positive

- Toute mécanique de gameplay est inspectable depuis le Studio sans développement
  additionnel d'outillage.
- Le modèle de calcul est uniforme : le même pipeline `RuntimeSource →
  RuntimeModifier[] → DerivedStats + RuntimeTrace` s'applique à toutes les entités.
- L'ajout d'une nouvelle mécanique ne modifie pas `resolveModifiers()` — seul
  `buildSources()` est étendu.
- `EntityRuntimeSnapshot` garantit que chaque entité expose la même surface au Studio.
- La `RuntimeTrace` rend les bugs de calcul diagnostiquables sans logging spécifique.
- Les cinq questions servent de checklist de revue pour toute PR introduisant une
  nouvelle mécanique.

### Negative

- Les mécaniques très spécifiques à un kind (ex. FSM IA créature) nécessitent
  un mapping vers `RuntimeModifier[]` qui peut être artificiel si l'effet visé
  n'est pas une stat dérivée.
- Chaque nouveau kind d'entité requiert la définition préalable d'un snapshot
  concret (BaseStats, DerivedStats, service) avant que la première mécanique
  puisse être implémentée.
- La discipline d'intégration (cinq questions, `buildSources`, `RuntimeSource`)
  représente un coût d'entrée non nul pour une fonctionnalité simple.

### Risks

- **Modifiers non traçables** : si une mécanique modifie une valeur en DB
  directement sans passer par le pipeline, la trace sera incohérente avec la
  valeur réelle. À détecter par comparaison `DerivedStats` snapshot vs valeur DB.
- **Over-engineering de la source de vérité** : une source qui relit la DB à
  chaque appel de `getModifiers()` créerait une I/O illégale. Le contrôle se
  fait à la revue de code : `getModifiers()` ne doit jamais faire d'I/O.
- **Stats dérivées non déclarées dans StatKey** : une mécanique ciblant une
  stat hors `StatKey` sera silencieusement ignorée par le calculator. La déclaration
  préalable de la stat est obligatoire.

---

## Security impact

Le pipeline Runtime est entièrement côté serveur. Le client ne reçoit que le
`snapshot` final — lecture seule. Il ne peut pas :
- soumettre un `RuntimeModifier` directement ;
- modifier une `DerivedStats` ;
- connaître l'état des sources internes (DebugModifierRegistry, EffectSource).

Les endpoints debug (`addDebugModifier`, `clearDebugModifiers`) sont protégés
par `@Roles(UserRole.ADMIN)`. Un joueur non-admin ne peut pas injecter de modifier.

Cette architecture renforce le principe central du projet : le serveur est
l'unique autorité sur les stats. Voir `docs/02_Security/client-server-trust.md`.

---

## Performance impact

**Fréquence de calcul.** Le snapshot n'est pas calculé en continu — il est
produit à la demande (`getRuntimeSnapshot`) ou lors d'événements spécifiques
(`recalculateRuntime`). Le calcul n'est pas dans la boucle de jeu principale.

**Coût par calcul.** Pour un joueur avec N pièces d'équipement et M effets actifs,
le coût est O(N + M) pour `resolveModifiers`, O(K × (N + M)) pour le calculator
(K = nombre de stats). Ce coût est largement sous-critique pour des volumes réels.

**Sources à I/O nulle.** `getModifiers()` est une transformation en mémoire pure.
Toute lecture DB doit être faite en amont (dans `buildSources()` ou lors de
l'initialisation du service) — pas dans `getModifiers()`.

**Snapshot en lecture seule.** Le snapshot est un value object immuable. Il peut
être mis en cache court-terme si la fréquence d'appel augmente. La mise en cache
n'est pas implémentée actuellement — à introduire si nécessaire.

**Scalabilité.** L'architecture est compatible avec une séparation future par
service : `PlayerRuntimeService`, `CreatureRuntimeService`, etc. peuvent vivre
dans des workers distincts si le volume le justifie.

---

## Migration and compatibility

ADR-0004 est additif — il ne modifie aucune implémentation existante. Il
formalise le pattern déjà en place pour `PlayerRuntime` et l'étend à toutes les
entités futures.

Les mécaniques existantes qui ne passent pas par le pipeline Runtime
(`combatService`, `resourcesService` pour les interactions de récolte) ne sont
pas migrées par cette ADR. Elles sont documentées comme dette technique si elles
modifient des stats dérivées hors pipeline.

Aucune migration de DB n'est requise.

---

## Validation

- [ ] Implémentation existante analysée (PlayerRuntime, phases 1–12).
- [ ] ADR-0001, ADR-0002, ADR-0003 relues — pas de contradiction identifiée.
- [ ] Impact sécurité examiné.
- [ ] Impact performance examiné.
- [ ] Validation humaine enregistrée.
- [ ] Documents liés mis à jour.

---

## Open questions

- Les mécaniques de l'IA créature (aggro, FSM, leash) produisent-elles des états
  qui se mappent naturellement en `RuntimeModifier[]`, ou nécessitent-elles un
  mécanisme complémentaire hors pipeline pour les états non-stat (ex. `aiState`) ?
- Quelle fréquence de recalcul est acceptable pour `CreatureRuntimeSnapshot`
  dans la boucle IA (tick toutes les 200 ms) ?
- Faut-il exposer `snapshot.sources` au client (lecture seule, JWT) ou uniquement
  aux admins via le Studio SDK ?

---

## Non-goals

- Cette ADR ne définit pas l'implémentation de `CreatureRuntimeService`,
  `NpcRuntimeService`, `ResourceRuntimeService` ou `BuildingRuntimeService`.
- Elle ne définit pas de nouvelle `StatKey`.
- Elle ne définit pas de nouveau `ModifierSourceType`.
- Elle ne remplace aucune ADR existante (0001–0003).
- Elle ne documente pas le système de crafting, de combat, ou d'IA en dehors
  de leur relation avec le pipeline Runtime.
- Elle ne donne pas d'autorisation d'implémentation — toute implémentation
  concrète d'une nouvelle mécanique doit être validée séparément.

---

## Security notes

- Le snapshot est produit côté serveur et transmis en lecture seule.
- Le client ne peut jamais soumettre un modifier ou modifier une stat directement.
- Les endpoints debug sont réservés aux admins — non exposés aux joueurs.
- Aucune donnée sensible (socketId, token, mot de passe) ne doit figurer dans
  un snapshot ou une trace Runtime.

---

## Performance notes

- `getModifiers()` sur toute `RuntimeSource` ne doit jamais faire d'I/O.
- Le snapshot ne doit pas être recalculé à chaque tick de jeu — uniquement
  sur événement (déséquipement, buff ajouté, debug, demande explicite).
- Une mise en cache du snapshot avec TTL court peut être introduite si la
  fréquence d'appel augmente, sans modifier l'architecture.

---

## Related files

- [ADR-0001 — World coordinate system](ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Entity positioning](ADR-0002-entity-positioning.md)
- [ADR-0003 — Movement authority](ADR-0003-movement-authority.md)
- [Runtime — Index](../../08_Gameplay/runtime/README.md)
- [Runtime Entity](../../08_Gameplay/runtime/runtime-entity.md)
- [Runtime Sources](../../08_Gameplay/runtime/runtime-sources.md)
- [Runtime Modifiers](../../08_Gameplay/runtime/runtime-modifiers.md)
- [Runtime Trace](../../08_Gameplay/runtime/runtime-trace.md)
- [Runtime Snapshot](../../08_Gameplay/runtime/runtime-snapshot.md)
- [Runtime Inspector](../../08_Gameplay/runtime/runtime-inspector.md)
- [Studio SDK](../../07_Admin/studio-sdk.md)
- [Entity Architecture](../../08_Gameplay/entity-architecture.md)
- [World Object Model](../../08_Gameplay/world-object-model.md)
- [Client Server Trust](../../02_Security/client-server-trust.md)
- [Client Server Boundaries](../client-server-boundaries.md)

---

## TODO

- [ ] Soumettre à revue humaine pour passage à `Accepted`.
- [ ] Répondre aux open questions sur l'IA créature avant de commencer `CreatureRuntimeService`.
- [ ] Ajouter dans `docs/01_Architecture/decisions.md` quand l'ADR est acceptée.
- [ ] Mettre à jour `docs/README.md` section ADR quand l'ADR est acceptée.
