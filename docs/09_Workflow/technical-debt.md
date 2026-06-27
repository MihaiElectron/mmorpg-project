# Technical Debt Register

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-28
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
| TD-003 | `WorldItem.itemInstanceId` non validé par relation/transition | High | WorldItem Hybrid | Open |
| TD-004 | `getOrCreateWallet` race condition | High | Economy hardening | Open |
| TD-005 | Vérification `characterId/userId` incomplète dans `equipItem` | Blocker | Equipment Runtime V2 / Security hardening | Open |
| TD-006 | `CharacterEquipment.itemInstanceId` nullable sans source de vérité | High | Equipment Runtime V2 | Open |
| TD-007 | `ItemInstance` sans historique append-only | Medium | ItemInstance Runtime hardening | Open |
| TD-008 | `ItemInstance` sans validations métier de transition | High | Inventory Hybrid | Open |
| TD-009 | Craft produit encore l'équipement comme stack `Item + quantity` | High | Craft Hybrid | Open |
| TD-010 | Loot produit encore uniquement des résultats stack-like | Medium | Loot Hybrid | Open |
| TD-011 | Auction House dépend d'un verrouillage `ItemInstance` non implémenté | Blocker | Auction House | Open |
| TD-012 | Cascades destructives du catalogue `Item` vers possessions joueur | Blocker | Persistence hardening | Open |

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
- Statut : Open

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

- Description : le service `ItemInstancesService` permet la création, mais ne
  centralise pas encore les transitions `state/container`, les verrous, ni les
  invariants de déplacement.
- Impact : les futurs systèmes pourraient modifier les instances de façon
  divergente et contourner les règles anti-duplication.
- Priorité : High
- Décision prise : introduire les transitions serveur pendant Inventory Hybrid,
  avant Auction House.
- Phase prévue de résolution : Inventory Hybrid
- Statut : Open

### TD-009 - Craft produit encore l'équipement comme stack `Item + quantity`

- Description : le craft actuel consomme et produit des quantités d'`Item`,
  même pour une sortie comme `basic_sword`.
- Impact : les armes craftées ne portent pas encore craftedBy, qualité,
  durabilité ou identité unique.
- Priorité : High
- Décision prise : traiter la conversion dans Craft Hybrid, après Equipment V2.
- Phase prévue de résolution : Craft Hybrid
- Statut : Open

### TD-010 - Loot produit encore uniquement des résultats stack-like

- Description : les services de loot retournent des formes `{ itemId,
  quantity }`, adaptées aux ressources mais insuffisantes pour des drops uniques.
- Impact : les équipements ou objets rares lootés ne peuvent pas encore être
  instanciés avec provenance et historique.
- Priorité : Medium
- Décision prise : garder les ressources stackables, puis ajouter la décision
  stack vs instance en Loot Hybrid.
- Phase prévue de résolution : Loot Hybrid
- Statut : Open

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
- Statut : Open

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

## Maintenance Rules

- Add only debts that are explicitly observed in code, audits, ADRs, or
  architecture documents.
- Do not add vague TODOs.
- Link a debt to a roadmap phase whenever possible.
- Mark a debt `Resolved` only after the correcting commit exists.
- Mark a debt `Verified` only after tests or review confirm the issue is closed.
