# Technical Debt Register

## Metadata

- Status: Accepted
- Owner: Project
- Last updated: 2026-06-29
- Depends on: docs/09_Workflow/runtime-roadmap.md, docs/09_Workflow/audit-alerts.md, docs/08_Gameplay/object-runtime-architecture.md, docs/08_Gameplay/item-taxonomy.md, docs/08_Gameplay/economy-foundation.md, docs/01_Architecture/adr/ADR-0010-object-runtime-model.md
- Used by: Project owner, developers, reviewers, repository-aware coding agents

## Scope

This living document centralizes technical debts that have been explicitly
identified and intentionally deferred.

It is documentation only. It does not create TODOs in Runtime code, migrations,
ADR changes, or implementation work.

Statuses:

- `Open`: debt exists and no fix is committed.
- `In Progress`: fix started but not completed.
- `Resolved`: committed fix exists.
- `Verified`: fix is tested and confirmed.
- `Won't Fix`: explicit decision not to fix.

Priorities:

- `Blocker`: can cause duplication, corruption, major security issue, or blocks
  core Runtime work.
- `High`: materially blocks a near-term phase or creates high maintenance risk.
- `Medium`: important but not immediately blocking.
- `Low`: cleanup or future hardening.

## Debt Register

| ID | Titre | Priorité | Phase prévue | Statut |
|---|---|---|---|---|
| TD-002 | `InventoryService` / équipement legacy par `Item` catalogue | High | Equipment Runtime V2 | Open |
| TD-003 | `WorldItem.itemInstanceId` non validé par relation/transition | High | WorldItem Hybrid | Resolved |
| TD-004 | `getOrCreateWallet` race condition | High | Economy hardening | Open |
| TD-005 | Vérification `characterId/userId` incomplète dans `equipItem` | Blocker | Equipment Runtime V2 / Security hardening | Open |
| TD-006 | `CharacterEquipment.itemInstanceId` nullable sans source de vérité | High | Equipment Runtime V2 | Open |
| TD-007 | `ItemInstance` sans historique append-only | Medium | ItemInstance Runtime hardening | Open |
| TD-008 | `ItemInstance` sans validations métier de transition | High | Inventory Hybrid | Resolved |
| TD-009 | Craft produit encore l'équipement comme stack `Item + quantity` | High | Craft Hybrid | Open |
| TD-010 | Loot produit encore uniquement des résultats stack-like | Medium | Loot Hybrid | Resolved |
| TD-011 | Auction House dépend d'un verrouillage `ItemInstance` non implémenté | Blocker | Auction House | Open |
| TD-012 | Cascades destructives du catalogue `Item` vers possessions joueur | Blocker | Persistence hardening | Open |
| TD-013 | `removeExpiredItems` scheduler non branché | Medium | WorldItem maintenance | Open |
| TD-014 | Race condition `removeExpiredItems` sur les stacks | Low | WorldItem hardening | Open |
| TD-015 | Bank MVP — stacks non supportés, pas de limite de slots, pagination absente | Medium | Bank V2 | Open |
| TD-016 | Mail MVP — pièce jointe unique, stacks non supportés, pagination absente, pas de scheduler | Medium | Mail V2 | Open |
| TD-017 | Guild Storage MVP — propriétaire uniquement, stacks non supportés, pagination absente | Medium | Guild V2 | Open |
| TD-018 | Housing MVP — propriétaire uniquement, stacks non supportés, pas de placement spatial, pagination absente | Medium | Housing V2 | Open |
| TD-019 | Trade MVP — expiration de session absente, stacks non supportés, validation de personnage minimale | Medium | Trade V2 | Open |

## Details

### TD-002 - `InventoryService` / équipement legacy par `Item` catalogue

- Description : les flows d'équipement actuels utilisent désormais
  `CharacterEquipment` comme source de vérité projetée, mais manipulent encore
  des `Item` catalogue et des lignes d'inventaire stackées, pas un objet
  physique unique.
- Impact : impossible de garantir durabilité, enchantements, craftedBy,
  binding ou ownership d'un équipement concret.
- Priorité : High
- Décision prise : garder la compatibilité stack-era jusqu'à la fin
  d'Equipment Runtime V2, puis basculer les equip/unequip vers
  `ItemInstance`.
- Phase prévue de résolution : Equipment Runtime V2
- Statut : Open

### TD-003 - `WorldItem.itemInstanceId` non validé par relation/transition

- Description : `WorldItem` possède maintenant un champ `itemInstanceId`, mais
  le modèle hybride complet n'est pas encore appliqué aux transitions pickup,
  drop, expiration et état `ItemInstance`.
- Impact : un futur drop unique pourrait diverger entre `WorldItem` et
  `ItemInstance` si les transitions ne sont pas centralisées.
- Priorité : High
- Décision prise : accepter le champ préparatoire, puis terminer la cohérence en
  WorldItem Hybrid.
- Phase prévue de résolution : WorldItem Hybrid
- Statut : Resolved
- Résolution : commits `e07e9d6`, `2f7c736`, `941b30b`. DROP, PICKUP et EXPIRE
  sont implémentés avec verrous pessimistes et transitions atomiques dans
  `WorldItemService`. Aucune `ItemInstance` n'est supprimée.

### TD-004 - `getOrCreateWallet` race condition

- Description : `getOrCreateWallet(ownerType, ownerId)` lit puis crée hors
  transaction et sans gestion explicite de conflit concurrent malgré
  l'unicité `ownerType + ownerId`.
- Impact : deux requêtes concurrentes peuvent provoquer une erreur d'unicité ou
  un comportement non lissé au premier accès wallet.
- Priorité : High
- Décision prise : reporter le durcissement vers Economy hardening, avec insert
  atomique, upsert ou retry contrôlé.
- Phase prévue de résolution : Economy hardening
- Statut : Open

### TD-005 - Vérification `characterId/userId` incomplète dans `equipItem`

- Description : `equipItem(characterId, userId, dto)` valide qu'un utilisateur a
  un personnage via `findFirstByUser(userId)`, mais ne prouve pas directement
  que le `characterId` demandé appartient à cet utilisateur avant les mutations.
- Impact : risque d'équipement sur personnage tiers si une route expose un
  `characterId` contrôlable.
- Priorité : Blocker
- Décision prise : corriger dans le durcissement Equipment/Security en validant
  explicitement `findOne(characterId, userId)` avant toute mutation.
- Phase prévue de résolution : Equipment Runtime V2 / Security hardening
- Statut : Open

### TD-006 - `CharacterEquipment.itemInstanceId` nullable sans source de vérité

- Description : `CharacterEquipment` accepte désormais `itemInstanceId` et sert
  de source de vérité projetée pour l'équipement, mais les flows d'équipement
  continuent de créer des rows via `itemId`.
- Impact : la préparation DB existe, mais aucun invariant ne garantit encore
  qu'un équipement unique référence un `ItemInstance`.
- Priorité : High
- Décision prise : conserver la nullabilité pendant la migration progressive,
  puis rendre la logique instance-first en Equipment Runtime V2.
- Phase prévue de résolution : Equipment Runtime V2
- Statut : Open

### TD-007 - `ItemInstance` sans historique append-only

- Description : la fondation `ItemInstance` stocke identité, état et conteneur,
  mais pas encore l'historique append-only des mouvements et propriétaires.
- Impact : DevTools, support, anti-duplication et audit Auction ne disposent pas
  encore de la trace complète prévue par ADR-0010.
- Priorité : Medium
- Décision prise : reporter l'historique à une phase de hardening après la base
  `ItemInstance`.
- Phase prévue de résolution : ItemInstance Runtime hardening
- Statut : Open

### TD-008 - `ItemInstance` sans validations métier de transition

- Description : le service `ItemInstancesService` permettait la création, mais
  ne centralisait pas les transitions `state/container`, les verrous, ni les
  invariants de déplacement.
- Impact résolu : tous les domaines Runtime délèguent à `ItemTransferService`.
  Aucune mutation directe d'`ItemInstance` détectée hors service autorisé.
- Priorité : High
- Phase de résolution : Inventory Hybrid → complété en Runtime V2
- Statut : Resolved
- Résolution : `ItemTransferService` (`src/item-transfer/`) — machine d'états
  centralisée, 20 transitions, verrou pessimiste systématique. Tous les domaines
  délèguent : `InventoryService`, `CharacterService`, `WorldItemService`,
  `AuctionService`, `BankService`, `MailService`, `GuildStorageService`,
  `HousingService`, `TradeService`. Commit `772cc75` (Trade — dernier domaine).
  Audit d'intégrité du 2026-06-29 : zéro mutation directe détectée.

### TD-009 - Craft — `craftedBy` et provenance non attachés aux `ItemInstance`

- Description : Craft Hybrid (`521674a`) produit désormais des `ItemInstance`
  pour les items `INSTANCE` via `ItemMaterializationService`. Cependant, les
  champs de provenance (`craftedByCharacterId`, `quality`, `craftedAt`) ne sont
  pas encore écrits sur les instances créées. L'`ItemInstance` retournée par
  `materialize()` existe mais sans signature de fabrication.
- Impact : les armes craftées n'ont pas d'identité de fabrication exploitable
  par le joueur ou par les DevTools.
- Priorité : High
- Décision prise : implémenter lors de Craft avancé (Gameplay V1), dans le même
  commit que la gestion de qualité.
- Phase prévue de résolution : Craft avancé (Gameplay V1)
- Statut : Open

### TD-010 - Loot produit encore uniquement des résultats stack-like

- Description : les services de loot retournaient des formes `{ itemId,
  quantity }`, adaptées aux ressources mais insuffisantes pour des drops uniques.
- Impact résolu : `LootService` reste pur (retourne `LootEntry[]`).
  `ItemMaterializationService` détermine stack vs instance via `Item.objectMode`.
  Les drops créature créent des `ItemInstance` pour les items `INSTANCE`.
  Les drops récolte créent des stacks `Inventory` pour les items `STACKABLE`.
- Priorité : Medium
- Phase de résolution : Loot Hybrid — `0f4edf3`
- Statut : Resolved

### TD-011 - Auction House dépend d'un verrouillage `ItemInstance` non implémenté

- Description : la spécification Auction MVP 1 exige un `ItemInstance` verrouillé
  et non utilisable pendant la vente, mais le Runtime de listing/verrouillage
  n'existe pas encore.
- Impact : Auction House ne doit pas être implémenté tant que les transitions
  et claims `ItemInstance` ne sont pas sûrs.
- Priorité : Blocker
- Décision prise : repousser Auction House après Inventory Hybrid, Equipment
  Runtime V2 et WorldItem Hybrid.
- Phase prévue de résolution : Auction House
- Statut : Resolved — `ItemTransferService` fournit verrou pessimiste et
  machine d'états pour toutes les transitions Auction. Commit `e04e4fe`.

### TD-012 - Cascades destructives du catalogue `Item` vers possessions joueur

- Description : les audits existants signalent que supprimer un `Item` catalogue
  peut cascader vers inventaire et équipement.
- Impact : perte silencieuse de richesse joueur ou d'équipement si un template
  est supprimé.
- Priorité : Blocker
- Décision prise : remplacer par `RESTRICT`, soft-delete ou workflow admin
  contrôlé pendant le hardening persistance.
- Phase prévue de résolution : Persistence hardening
- Statut : Open

### TD-013 - `removeExpiredItems` scheduler non branché

- Description : `WorldItemService.removeExpiredItems()` est définie et testée,
  mais aucun `@Cron` ou scheduler NestJS ne l'appelle automatiquement. Les
  WorldItems avec `expiresAt` dépassé ne sont nettoyés que si une tâche
  externe déclenche la méthode manuellement.
- Impact : les objets STACK et INSTANCE expirés restent en état `spawned` en
  DB et visibles côté client jusqu'au prochain redémarrage ou déclenchement
  manuel.
- Priorité : Medium
- Décision prise : implémenter le scheduler après validation fonctionnelle de
  WorldItem Hybrid.
- Phase prévue de résolution : WorldItem maintenance
- Statut : Open

### TD-014 - Race condition `removeExpiredItems` sur les stacks

- Description : l'expiration des WorldItems STACK utilise un `find` puis un
  `save` en bulk hors transaction. Un pickup concurrent entre ces deux
  opérations transiterait le WorldItem en `picked`, mais le save bulk le
  repasse à `expired`.
- Impact : très faible en pratique (fenêtre étroite, impact limité à la
  persistance d'état d'un item au sol), mais divergence observable entre le
  client et la DB.
- Priorité : Low
- Décision prise : accepter la dette pendant WorldItem Hybrid. Reporter vers
  WorldItem hardening si la fréquence d'expiration monte.
- Phase prévue de résolution : WorldItem hardening
- Statut : Open

### TD-015 - Bank MVP — stacks non supportés, pas de limite de slots, pagination absente

- Description : `BankService` gère uniquement les `ItemInstance`. Les stacks
  `Inventory` ne peuvent pas être déposés en banque dans le MVP. Aucune limite
  de slots n'est appliquée. `listContents` retourne toutes les instances sans
  pagination.
- Impact : les objets stackables (ressources, matériaux) ne sont pas bancables ;
  un personnage peut accumuler un nombre illimité d'objets en banque ; les
  lectures sur grandes collections sont non bornées.
- Priorité : Medium
- Décision prise : accepter la dette dans le périmètre Bank MVP. La gestion des
  stacks et la limite de slots relèvent de Bank V2 ; la pagination suit les
  règles générales de performance (ADR-0010).
- Phase prévue de résolution : Bank V2
- Statut : Open

### TD-016 - Mail MVP — pièce jointe unique, stacks non supportés, pagination absente, pas de scheduler

- Description : `MailService` ne transporte qu'une `ItemInstance` par message.
  Les stacks `Inventory` ne sont pas supportés. `listInbox`/`listSent` retournent
  tous les messages sans pagination. `deleteExpired` n'est branchée sur aucun
  scheduler ou cron.
- Impact : impossibilité d'envoyer plusieurs objets ou des ressources stackables
  par courrier ; lectures non bornées sur grandes boîtes de réception ; les
  pièces jointes non réclamées ne sont jamais retournées automatiquement.
- Priorité : Medium
- Décision prise : accepter la dette dans le périmètre Mail MVP. Les pièces
  jointes multiples et les stacks relèvent de Mail V2 ; le scheduler relève
  de l'infrastructure d'automatisation.
- Phase prévue de résolution : Mail V2
- Statut : Open

### TD-017 - Guild Storage MVP — propriétaire uniquement, stacks non supportés, pagination absente

- Description : `GuildStorageService` n'autorise que `ownerCharacterId` à
  déposer et retirer. Les stacks `Inventory` ne sont pas supportés. `listContents`
  retourne tous les objets sans limite. Aucune table `GuildMember` ni
  `GuildStoragePermission` n'existe.
- Impact : impossibilité de partager le stockage entre plusieurs membres ;
  objets stackables non stockables ; lectures non bornées sur grandes guildes ;
  aucun rang, quota ni journal d'audit.
- Priorité : Medium
- Décision prise : accepter la dette dans le périmètre Guild Storage MVP.
  Les rangs et permissions relèvent de Guild V2 ; les stacks et la pagination
  suivent les règles générales de performance.
- Phase prévue de résolution : Guild V2
- Statut : Open

### TD-018 - Housing MVP — propriétaire uniquement, stacks non supportés, pas de placement spatial

- Description : `HousingService` n'autorise que `ownerCharacterId` à déposer
  et retirer. Les stacks `Inventory` ne sont pas supportés. `listContents`
  retourne tous les objets sans limite. Aucune notion de placement spatial,
  de décoration ou de colocataire.
- Impact : impossibilité de partager la maison entre plusieurs joueurs ; objets
  stackables non stockables ; lectures non bornées ; pas de positionnement
  visuel des objets dans la maison.
- Priorité : Medium
- Décision prise : accepter la dette dans le périmètre Housing MVP. Le
  placement spatial et les décorations relèvent de Housing V2 ; les stacks
  et la pagination suivent les règles générales de performance.
- Phase prévue de résolution : Housing V2
- Statut : Open

### TD-019 - Trade MVP — expiration de session absente, stacks non supportés, validation de personnage minimale

- Description : `TradeService` ne fait pas expirer les sessions `PENDING`
  abandonnées. Les stacks `Inventory` ne sont pas supportés dans un Trade MVP.
  `createTrade` vérifie que les deux `characterId` sont distincts mais ne valide
  pas que les deux personnages existent en DB ni qu'ils sont dans la même zone.
  Aucun `GuildMember` ni permission multi-joueur.
- Impact : les sessions abandonnées restent en `PENDING` indéfiniment ; les
  ressources stackables ne peuvent pas être échangées ; un trade peut être
  créé avec un `characterId` inexistant.
- Priorité : Medium
- Décision prise : accepter la dette dans le périmètre Trade MVP. L'expiration
  et la géolocalisation relèvent de Trade V2 ; les stacks suivent les règles
  générales de performance.
- Phase prévue de résolution : Trade V2
- Statut : Open

## Maintenance Rules

- Add only debts that are explicitly observed in code, audits, ADRs, or
  architecture documents.
- Do not add vague TODOs.
- Link a debt to a roadmap phase whenever possible.
- Mark a debt `Resolved` only after the correcting commit exists.
- Mark a debt `Verified` only after tests or review confirm the issue is closed.
