# ADR-0009 - CraftJob lifecycle

> Note de nommage : le fichier conserve le slug `craft-order-lifecycle` pour la
> stabilité des liens croisés existants, mais **le vocabulaire de référence est
> désormais `CraftJob`**. Toute occurrence historique de « Craft Order » est
> remplacée par « CraftJob » dans l'ensemble du projet.

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-07-03
- Date proposed: 2026-06-26
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on:
  - docs/01_Architecture/adr/README.md
  - docs/01_Architecture/adr/ADR-0011-item-materialization-pipeline.md
  - docs/01_Architecture/adr/ADR-0015-inventory-container-architecture.md
  - docs/01_Architecture/adr/ADR-0016-skills-rewards-runtime.md
- Depends on (différé, settlement uniquement):
  - docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md
- Used by: Project owner, developers, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents: docs/08_Gameplay/crafting-runtime.md, docs/08_Gameplay/settlement-economy-architecture.md, docs/08_Gameplay/settlement-economy-review.md, docs/08_Gameplay/settlement-specifications.md, docs/08_Gameplay/settlement-mvp-slicing.md
- Related code:
  - apps/api-gateway/src/crafting/crafting.service.ts
  - apps/api-gateway/src/item-materialization/item-materialization.service.ts
  - apps/api-gateway/src/item-transfer/item-transfer.service.ts
  - apps/api-gateway/src/progression/progression.service.ts
  - apps/api-gateway/src/skill-xp-calculator/skill-xp-calculator.ts
  - apps/api-gateway/src/auction/auction.scheduler.ts

## Context

Le projet dispose d'un **craft instantané** opérationnel via les stations de
craft placées dans le monde : validation serveur (station, distance,
inventaire, skill), consommation des ingrédients STACKABLE (`Inventory`) et
INSTANCE (`ItemTransferService` transition `CRAFT_CONSUME` → `DESTROYED`),
matérialisation de l'output via `ItemMaterializationService`, XP personnage
(`ProgressionService`) et XP compétence (`calculateSkillXp` + `applySkillXpInTx`)
— le tout dans une **transaction unique**.

Un **CraftJob** est différent : c'est une production **différée**, **persistante**
et **résistante à la déconnexion**. Il ne remplace pas le craft instantané ; il
constitue une seconde voie de production.

Cette révision (2026-07-03) resynchronise l'ADR avec l'architecture réelle du
projet, qui a évolué depuis la rédaction initiale :

- **ADR-0011** — `ItemMaterializationService` est le **seul** créateur d'items.
- **ADR-0015 (Accepted)** — conteneurs d'inventaire explicites, capacité de slots
  vérifiée sous verrou ; les enums `ItemInstanceState.IN_CRAFT_ORDER` et
  `ItemInstanceContainerType.CRAFT_ORDER` existent déjà pour l'escrow d'items.
- **ADR-0016 (Accepted)** — séparation stricte XP personnage / XP compétence,
  cette dernière calculée par le Runtime depuis un `SkillXpContext`.

Le RFC initial identifiait des risques autour de l'annulation, du retrait des
ingrédients, de la reprise après redémarrage, et de la double complétion. Cette
révision les tranche explicitement.

## Decision

Un **CraftJob** est un enregistrement métier durable dont le **cycle de vie est
possédé par le serveur**. Il ne remplace pas le craft instantané des stations.

Périmètre initial (V1 personnel) :

- CraftJob **privé** d'un joueur uniquement ;
- validation de recette réutilisée du craft instantané (logique partagée) ;
- ingrédients **réservés au lancement** par escrow d'**items** (aucune monnaie) ;
- **aucun objet n'existe avant le claim** : la complétion ne crée rien ;
- annulation avant complétion → restitution des ingrédients réservés ;
- **découplé d'Economy Core** : l'escrow monétaire ne concerne que les CraftJob
  publics/settlement, **différés**.

Le lifecycle est **state-driven**. Le serveur possède toutes les transitions.

---

### Règle fondamentale — Invariant du scheduler

Cette règle est une **invariante d'architecture** du CraftJob Runtime. Elle prime
sur toute décision d'implémentation et ne peut être violée par aucune extension
future.

**Le scheduler ne crée jamais d'Item. Le scheduler ne détruit jamais d'Item. Le
scheduler ne déplace jamais d'Item.**

Le scheduler ne fait **qu'une seule chose** : **faire évoluer l'état du CraftJob**
(`RUNNING → COMPLETED`, ou `RUNNING → FAILED`), et figer dans le job le résultat
calculé (succès/échec, outputs attendus) ainsi que l'attribution d'XP (Décision 2).

La **création réelle des objets est exclusivement réalisée au `CLAIM`**, via
`ItemMaterializationService` (ADR-0011), déclenché par une action joueur, jamais
par le scheduler.

Corollaire — cet invariant garantit qu'aucun des événements suivants ne peut
produire de **duplication d'objets** :

- un **crash** du scheduler en cours de traitement ;
- un **redémarrage** du serveur avec des jobs `RUNNING` échus ;
- une **exécution multiple** ou concurrente du même tick.

Puisque le scheduler ne touche jamais aux items et que la matérialisation au claim
est unique et gardée par l'état (`COMPLETED → CLAIMED` sous verrou), toute
ré-exécution est **idempotente par construction** : au pire, un job est
re-complété (recheck d'état → no-op) ; jamais un item n'est créé deux fois.

---

### Décision 1 — L'output n'est matérialisé qu'au claim

**Le scheduler ne crée jamais d'`Item` ni d'`ItemInstance`.** La complétion ne
matérialise rien. Le **snapshot du CraftJob est la seule source de vérité** de ce
qui sera produit.

Flux :

```
RUNNING
   │  (finishAt ≤ now, scheduler)
   ▼
COMPLETED        ← résultat (succès/échec) figé dans le job, XP accordée
   │  (claim, joueur)
   ▼
CLAIM → ItemMaterializationService.materialize()
   │
   ▼
CLAIMED          ← les objets existent réellement, pour la première fois
```

Justification :

- **aucune ItemInstance fantôme** en base entre COMPLETED et CLAIMED ;
- **aucune création inutile** si le joueur ne réclame jamais ;
- **stockage réduit** (le job porte un snapshot, pas des items matérialisés) ;
- **claim unique = création unique** — point de création atomique et idempotent ;
- **`ItemMaterializationService` reste l'unique créateur** (ADR-0011), appelé
  exactement une fois, à la transition `COMPLETED → CLAIMED`.

Le résultat de la production (quels outputs, en quelles quantités, succès ou
échec) est **calculé et figé à la complétion** dans le job ; seule la
**matérialisation physique** est repoussée au claim. La progression (XP) n'attend
pas le claim (cf. Décision 2).

Conséquence capacité (ADR-0015) : le claim vérifie la **capacité de slots sous
verrou** avant matérialisation. Inventaire plein → claim refusé, job conservé en
COMPLETED, aucune perte. La complétion ne peut donc jamais échouer pour cause
d'inventaire plein.

---

### Décision 2 — XP accordée uniquement à `RUNNING → COMPLETED`

Character XP **et** Skill XP sont accordées **exclusivement** lors de la
transition `RUNNING → COMPLETED`, dans la transaction de complétion. **Jamais au
lancement, jamais au claim.**

- **Character XP** — `ProgressionService.applyCharacterXpInTx(characterId,
  craftCharacterXpReward, ProgressionSource.CRAFT, manager)` (ADR-0016, canal 1).
- **Skill XP** — `calculateSkillXp(SkillXpContext{ domain:'crafting',
  action:'craft', difficulty: snapshot.craftingDifficulty,
  skillDefinitionKey: snapshot.requiredSkillKey, ... })` →
  `SkillsService.applySkillXpInTx` (ADR-0016, canal 2).

Le **claim ne doit jamais influencer la progression** : il ne fait que
matérialiser des objets. Un joueur qui ne réclame pas conserve tout de même l'XP
gagnée à la complétion.

Les valeurs XP proviennent du **snapshot** du job (Décision 4), donc immunisées
contre toute modification ultérieure de la recette.

Conformité ADR-0016 : aucune valeur d'XP compétence n'est stockée ; seule la
**difficulté** figurée dans le snapshot alimente `SkillXpContext.difficulty`.

---

### Décision 3 — Machine à états V1 minimale

```
RUNNING ──▶ COMPLETED ──▶ CLAIMED
   │            │
   ▼            ▼
CANCELLED     (CANCELLED possible tant que non CLAIMED selon politique)
   ▲
FAILED (erreur système / production sans output)
```

États V1 :

- **RUNNING** — job créé, ingrédients réservés, `finishAt = startedAt +
  craftTimeMs × quantité`.
- **COMPLETED** — production résolue serveur, XP accordée, output décrit par le
  snapshot, en attente de claim. Rien n'est matérialisé.
- **CLAIMED** — output matérialisé et livré (terminal).
- **CANCELLED** — annulé **tant que RUNNING** (avant résolution). Comme la
  résolution est atomique (Décision 3bis), rien n'est encore résolu : la
  **totalité** des ingrédients réservés est restituée. Il n'existe aucun cas
  « garder les outputs déjà réussis » en V1 (terminal).
- **FAILED** — échec total à la résolution (0 succès) ou erreur système sans
  output. Les ingrédients consommés le restent (selon
  `consumeIngredientsOnFailure`) ; **FAILED ne rembourse jamais**. Les
  ingrédients non consommés (échec avec `consumeIngredientsOnFailure=false`)
  restent réservés et sont restitués au claim/cancel, pas par la transition
  FAILED elle-même (terminal).

**`QUEUED` est explicitement retiré de la V1.** Il ne sera introduit que
lorsqu'existeront réellement :

- des files d'attente de production ;
- une limite de stations (slots de production concurrents) ;
- des ouvriers / NPC producteurs ;
- de la production parallèle.

Tant que la V1 démarre un job immédiatement (pas de file, pas de limite), un état
`QUEUED` serait un état mort. Il sera ajouté par une révision ultérieure au
moment où la file d'attente devient une mécanique réelle.

---

### Décision 3bis — Granularité de résolution V1 : atomique (pas de progression par unité)

**En V1, un CraftJob résout la totalité de sa `quantity` en une seule fois**, à
l'échéance `finishAt = startedAt + craftTimeMs × quantity`. Le scheduler
(`CraftJobService.complete`) tire les `quantity` tentatives d'un coup et fige le
résultat (`successes`, `failures`, `resolvedQuantity` par output). Il n'existe
**aucun `finishAt` par unité, aucun compteur `remaining`, aucune progression
intermédiaire**.

Conséquences (à respecter, ne pas prétendre le contraire) :

- **Il n'y a jamais d'état « 2/5 crafts résolus, 3 restants ».** Un job est soit
  RUNNING (0 résolu), soit résolu en totalité (COMPLETED/FAILED).
- **L'annulation partielle n'existe pas en V1.** Un `CANCELLED` n'est possible que
  pendant RUNNING, où **rien** n'est encore résolu → remboursement **total**. On
  ne peut pas « arrêter après 2 crafts en gardant 2 outputs et en remboursant 3 ».
- Le suivi fin `resolved / successes / failures / remaining` par unité, et
  l'annulation qui conserve les outputs déjà réussis tout en remboursant les
  unités non encore résolues, **nécessitent une progression par unité** (ticks
  successifs, `finishAt` par unité ou compteur `remaining`). C'est une évolution
  **différée** : elle sera introduite avec la production tick-par-tick (et
  cohabitera avec `QUEUED` / files / ouvriers).

Distinction des deux cas métier (pour mémoire, à la lumière de ce qui précède) :

1. **Échec d'un craft déjà résolu** (FAILED total) — ingrédients consommés/perdus
   selon `consumeIngredientsOnFailure`, pas d'output, pas d'XP. Pas de
   remboursement.
2. **Annulation volontaire avant résolution** (CANCELLED depuis RUNNING) — en V1
   atomique, aucun craft n'est résolu tant que RUNNING, donc **remboursement
   total**. La variante « garder les succès déjà résolus, rembourser le reste »
   appartient au modèle par unité, **non supporté en V1**.

---

### Décision 4 — Snapshot immuable au lancement

Tout est figé au lancement ; le Runtime ne relit **jamais** la recette ou la
station vivante après le lancement. Le snapshot comprend :

- `recipeId`
- `stationId`, `stationType`
- `craftTimeMs`
- `craftingDifficulty`
- `requiredSkillKey`, `requiredSkillLevel`
- `ingredients` (itemId, objectMode, requiredQuantity ; instanceIds réservés)
- `outputs` (itemId, objectMode, producedQuantity, chance)
- `craftCharacterXpReward`
- **trois versions indépendantes** :
  - **`recipeVersion`** — évolution de la **recette** (contenu : ingrédients,
    outputs, taux, durée…). Incrémentée à chaque édition de la recette.
  - **`jobVersion`** — évolution de la **structure de l'entité `CraftJob`**
    (schéma du snapshot lui-même). Permet de faire évoluer le format des jobs
    sans casser les jobs anciens en cours.
  - **`serverFormulaVersion`** — évolution des **règles Runtime** (calcul d'XP,
    de qualité, des probabilités de succès, etc.), indépendamment de la recette.

Ces trois versions sont **indépendantes** : une recette peut changer sans que les
formules Runtime ne changent, et inversement. Objectif : **un CraftJob ancien se
termine toujours avec exactement les règles de son lancement** — mêmes
ingrédients, mêmes outputs, même durée, même difficulté, même barème d'XP, mêmes
formules de calcul.

Conséquence : la complétion applique les **formules de `serverFormulaVersion`**
figée, pas les formules courantes du serveur.

---

### Décision 5 — Escrow d'items au lancement (pas de monnaie)

Les ingrédients sont **réservés au lancement** (jamais au claim), en transaction
unique avec la création du job :

- **STACKABLE** — décrément de `Inventory` + quantités figées dans le snapshot.
  Restitution à l'annulation via `ItemMaterializationService` (seul créateur).
- **INSTANCE** — transition `ItemTransferService` (nouvelle) `RESERVE_FOR_CRAFT`
  `AVAILABLE/INVENTORY → IN_CRAFT_ORDER/CRAFT_ORDER`, `containerId = jobId`. Les
  enums existent déjà (ADR-0015). L'état `IN_CRAFT_ORDER` empêche tout autre flux
  (équipement, auction, trade) de récupérer l'instance.
- À la complétion, les instances réservées sont consommées → `DESTROYED`
  (jamais de hard delete). À l'annulation, elles reviennent `AVAILABLE/INVENTORY`.

`ItemTransferService` reste le seul mutateur d'`ItemInstance`.

---

### Décision 6 — Holding logique après COMPLETED, stratégie de claim ouverte

Après `COMPLETED`, le résultat d'un CraftJob est conservé dans un **holding
logique** côté serveur : le **snapshot du job** décrit ce qui sera produit, et le
job en état `COMPLETED` **est** ce holding. Rien n'est matérialisé à ce stade
(Décision 1). Le holding est donc une **notion logique**, pas un stockage d'items.

**La stratégie de récupération n'est pas figée par cette ADR.** Le claim pourra
être réalisé par n'importe quel mécanisme, présent ou futur :

- récupération à la station de craft ;
- courrier système ;
- inventaire direct ;
- banque ;
- coffre (maison / guilde) ;
- ou tout autre destinataire introduit plus tard.

L'ADR **n'impose aucun mode de claim particulier** (le courrier système n'est
qu'une implémentation possible parmi d'autres). En revanche, **quel que soit le
mode retenu**, tout claim doit respecter les mêmes **invariants** :

1. **Un seul claim possible** — transition `COMPLETED → CLAIMED` unique, sous
   verrou pessimiste, gardée par l'état (recheck `COMPLETED`).
2. **`ItemMaterializationService` appelé exactement une seule fois** (ADR-0011,
   seul créateur d'items).
3. **Vérification de la capacité de la destination** avant matérialisation
   (ADR-0015, capacité de slots sous verrou pour inventaire/banque/coffre ;
   destination pleine → claim refusé, job conservé en `COMPLETED`, aucune perte).
4. **Transaction atomique** — matérialisation + livraison + passage `CLAIMED`
   dans une seule transaction ; rollback total en cas d'erreur.
5. **Aucune duplication possible** — un échec après matérialisation annule aussi
   le passage `CLAIMED` ; un retry repart de `COMPLETED`.

Le choix du/des mode(s) de claim effectivement implémenté(s) est une décision
**d'implémentation**, tranchée en phase de réalisation, sans modifier cette ADR
tant que les cinq invariants ci-dessus sont respectés.

---

### Décision 7 — Scheduler idempotent (complétion offline)

La complétion est pilotée par un scheduler, sur le modèle de `AuctionScheduler` :

- `@Cron(EVERY_MINUTE)` → lecture `WHERE state = RUNNING AND finishAt ≤ now`,
  **batch borné** (`take`).
- Chaque job traité dans **sa propre transaction** : `lock pessimistic_write`,
  **recheck `state === RUNNING`** (idempotence), tirage serveur, XP, passage
  `COMPLETED`, `try/catch` par job pour ne pas casser le batch.
- Complétion **indépendante de la connexion** du joueur (offline géré par
  comparaison `finishAt ≤ now`). Au retour : `character:reload` + inbox.

Conformément à la **Règle fondamentale — Invariant du scheduler**, ce scheduler ne
crée, ne détruit ni ne déplace aucun Item : il ne fait qu'évoluer l'état du
CraftJob et figer le résultat + l'XP. La matérialisation reste exclusivement au
claim. C'est ce qui rend l'exécution idempotente et immunise crash/redémarrage/
double-tick contre toute duplication d'objets.

---

### Décision 8 — Vue diagnostic DevTools (snapshot vs template)

Le DevTools doit exposer une **vue diagnostic** de chaque CraftJob confrontant :

- le **snapshot du job** (figé au lancement) ;
- le **template actuel** (recette/station vivantes) ;
- les **différences**, présentées comme **normales et attendues**.

Exemple :

```
Recette actuelle : craftTime = 40 s
Snapshot Job     : craftTime = 20 s   → écart attendu (job lancé avant édition)
```

Même principe pour : difficulté, outputs, ingrédients, XP, skill requis, ainsi
que les trois versions (`recipeVersion`, `jobVersion`, `serverFormulaVersion`).
Le DevTools permet aussi de : lister/paginer les jobs, forcer l'annulation
(restitution idempotente), forcer la complétion (même transition que le
scheduler), diagnostiquer les incohérences (ingrédient manquant, station
disparue, instance réservée orpheline).

---

### Décision 9 — Action joueur unique « Fabriquer » + durée minimale (serveur autoritaire)

Le joueur ne choisit jamais la technologie de fabrication. Il n'existe **qu'une
seule action joueur : « Fabriquer »** (une quantité 1..MAX). Le **serveur décide**
du workflow ; l'UI n'affiche que le résultat.

- **Durée minimale d'une recette : `MIN_CRAFT_TIME_MS = 3000` (3 s).** Aucune
  recette joueur ne peut être instantanée. Validé côté serveur (admin
  create/update + diagnostic `validateCraftingRecipe`) **et** côté DevTools
  (Recipe Editor : saisie en secondes, min 3, message d'erreur, sauvegarde
  bloquée). Une recette invalide ne peut pas être sauvegardée.
- **Toute fabrication joueur crée un CraftJob.** Le craft instantané
  (`CraftingService.craft`) devient **legacy/interne/admin/tests** : il n'est
  jamais déclenché par le joueur.
- **Endpoint unique** `POST /crafting/craft` (routeur autoritaire) : renvoie un
  résultat **typé** `{ mode: "instant" | "job", … }`. Aujourd'hui il renvoie
  toujours `mode: "job"`. Si une règle serveur future produit un craft immédiat
  (premium, NPC, settlement…), **le frontend ne change pas** (il gère déjà les
  deux modes). L'endpoint de lancement séparé (`POST /crafting/jobs`) est
  supprimé côté joueur ; restent `GET /crafting/jobs` et
  `POST /crafting/jobs/:id/claim`.

**Cohérence obligatoire (Runtime ⇄ DevTools ⇄ ADR)** : cette règle métier
(durée minimale, action unique, joueur toujours en CraftJob) est appliquée par le
Runtime (validation serveur), reflétée par le DevTools (Recipe Editor + textes) et
documentée ici. La constante `MIN_CRAFT_TIME_MS` est la source unique côté serveur ;
le DevTools expose la même valeur en secondes. Aucune de ces règles ne vit dans un
seul de ces trois endroits.

## Consequences

Positives :

- Sépare la production différée du craft instantané.
- **Aucune ItemInstance fantôme** : les objets n'existent qu'au claim.
- Annulation, complétion et claim testables et idempotents.
- Snapshot + trois versions garantissent des résultats reproductibles.
- Réutilise `ItemMaterializationService`, `ItemTransferService`,
  `ProgressionService`, `SkillXpContext` et le pattern scheduler existants — pas
  de nouveau sous-système. Le/les mécanisme(s) de claim (station, courrier,
  inventaire, banque, coffre…) restent ouverts (Décision 6).

Négatives :

- État et tests supplémentaires par rapport au craft instantané.
- Nécessite de nouvelles transitions `ItemTransferService`
  (`RESERVE_FOR_CRAFT`, restitution) et une entité `CraftJob` + tables filles.

Risques :

- Duplication de la validation de recette entre craft instantané et CraftJob →
  factoriser la validation dans un helper partagé.
- Réservation d'ingrédients avant durabilité du job → lancement en transaction
  unique (réserver + créer job atomiques).
- Double complétion / double claim → verrou + recheck d'état.

## Security notes

Server authority totale : le client ne peut jamais déclarer un job complété,
réclamer deux fois, retirer un ingrédient réservé, ni soumettre l'inventaire d'un
autre. `ItemMaterializationService` (seul créateur) est invoqué exactement une
fois au claim ; `ItemTransferService` (seul mutateur) gère la réservation, la
consommation et la restitution. L'état `IN_CRAFT_ORDER` verrouille les
ingrédients INSTANCE contre tout autre flux.

## Performance notes

Listes de jobs paginées. Le scheduler traite les jobs dus en **batches bornés** et
**idempotents**. Les CraftJob publics/settlement (contention d'écriture, volume
de requêtes) sont différés.

## Alternatives considered

- **Matérialiser l'output à la complétion** : rejeté au profit de la Décision 1
  (matérialisation au claim) pour éviter les ItemInstance fantômes, la création
  inutile et le stockage superflu.
- **Consommer les ingrédients au claim** : rejeté — permettrait le re-spend et la
  duplication entre lancement et claim ; l'escrow au lancement est requis.
- **Réutiliser directement `POST /crafting/craft`** : rejeté — le craft instantané
  consomme et produit en une requête ; le CraftJob exige escrow, délai,
  complétion différée et claim.
- **Introduire `QUEUED` en V1** : rejeté — état mort sans file d'attente réelle.
- **Coupler à Economy Core dès la V1** : rejeté pour le CraftJob personnel
  (escrow d'items suffit) ; réservé aux orders publics/settlement différés.

## Open questions

- Politique de frais d'annulation (aucun en V1 ?).
- Introduction des CraftJob publics/settlement et des règles de contribution.
- Déclencheur exact de `serverFormulaVersion` (fichier de version des formules
  Runtime vs constante applicative).

Ces questions ne bloquent pas la V1 personnelle : elles concernent des extensions
différées (settlement) ou un détail d'implémentation (source de
`serverFormulaVersion`).

## Validation — Proposed → Accepted

**Recommandation : cette ADR peut passer de `Proposed` à `Accepted`** pour le
périmètre **CraftJob V1 personnel**, sous réserve de l'approbation du Project
Owner.

Justification :

- Les décisions structurantes sont désormais tranchées et alignées sur
  l'architecture Accepted du projet (ADR-0011, ADR-0015, ADR-0016) : output au
  claim, XP à la complétion, états V1, snapshot + trois versions, escrow d'items,
  holding logique + claim à stratégie ouverte, scheduler idempotent, diagnostic
  DevTools.
- L'**invariant du scheduler** (ne crée / ne détruit / ne déplace jamais d'Item)
  est posé comme règle d'architecture, immunisant crash/redémarrage/double-tick
  contre toute duplication.
- Toutes les briques réutilisées existent et sont éprouvées
  (`ItemMaterializationService`, `ItemTransferService`, `ProgressionService`,
  `SkillXpContext`, `AuctionScheduler` ; `MailService` seulement si un claim par
  courrier est retenu).
- Les invariants de sécurité et d'anti-duplication sont explicites.
- Les questions restantes (frais d'annulation, orders publics, source de
  `serverFormulaVersion`) portent sur des **extensions différées** ou un **détail
  d'implémentation**, sans impact sur les fondations V1.

Le champ `Decision status` reste `Proposed` jusqu'à approbation formelle
(`Approved by` / `Approval reference`). Une fois approuvée, passer `Status:
Accepted`, `Decision status: Accepted`, renseigner la date d'acceptation, et lever
le blocage de la contrainte « pas de production offline sans validation ».

## Related files

- docs/08_Gameplay/crafting-runtime.md
- docs/08_Gameplay/settlement-economy-architecture.md
- docs/08_Gameplay/settlement-economy-review.md
- docs/08_Gameplay/settlement-specifications.md
- docs/08_Gameplay/settlement-mvp-slicing.md
