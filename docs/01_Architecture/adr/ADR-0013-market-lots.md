# ADR-0013 — Market Lots : objets STACKABLE dans le pipeline économique

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-06-30
- Date proposed: 2026-06-30
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on:
  - docs/01_Architecture/adr/ADR-0007-auction-house-authority.md
  - docs/01_Architecture/adr/ADR-0010-object-runtime-model.md
  - docs/01_Architecture/adr/ADR-0011-item-materialization-pipeline.md
  - docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md
- Used by: Project owner, backend developers, repository-aware coding agents
- Supersedes: Clause "Auction MVP 1 — INSTANCE items only" in ADR-0011
- Superseded by: None
- Related documents:
  - docs/08_Gameplay/auction-house-specifications.md
  - docs/08_Gameplay/item-taxonomy.md
  - docs/08_Gameplay/economy-foundation.md
  - docs/08_Gameplay/object-runtime-architecture.md
- Related code: N/A

---

## Context

ADR-0010 established the hybrid object Runtime model: stackable resources are
managed as `Inventory(character, item, quantity)` stack rows; unique objects are
managed as `ItemInstance` entities with a stable UUID and a state machine.

ADR-0011 defines `Item.objectMode` as the exclusive classification signal, and
`ItemMaterializationService` as the single entry point for all Runtime object
production. It also explicitly limits Auction MVP 1 to `INSTANCE` objects:

> *"Auction MVP 1: only INSTANCE objects may be listed. Future phases: selected
> stackable goods only if a dedicated market-stack model is designed."*

This explicit deferral is the origin of the present ADR.

The current `AuctionService.createListing()` enforces this gate in code:

```typescript
if (item.objectMode !== ObjectMode.INSTANCE) {
  throw new BadRequestException('Only INSTANCE items can be listed on the Auction House');
}
```

The economic pipeline (Auction → Mail → Inventory) is built entirely on
`ItemInstance`. `AuctionListing.itemInstanceId` is a non-nullable FK.
`MailMessage.attachedItemInstanceId` is a nullable FK to `ItemInstance`.
`ItemTransferService` operates exclusively on existing `ItemInstance` entities.

A STACKABLE item has no `ItemInstance`. It exists only as an `Inventory` row.
When a player wants to sell 500 wood sticks, there is no entity to lock, no
identity to track in transit, and no FK that the existing pipeline can hold.

Selling stackable resources and materials — wood, ores, fibres, refined
materials, generic consumables, crafting ingredients — is a core feature of
any MMORPG economy. Blocking it permanently would leave the market functionally
empty and force every player interaction toward barter or INSTANCE-only trades.

---

## Problem

Without an explicit design for stackable items in the economic pipeline:

- The Auction House can only list unique objects (swords, armour). Resources,
  materials, consumables, and any `STACKABLE` item are permanently excluded.
- A future workaround (ad-hoc field, dual FK, parallel entity) would be
  introduced by each developer independently, creating divergent code paths.
- The invariant "one ItemTransferService for all Runtime item movements"
  (established by ADR-0010) would be violated by any parallel pipeline.
- The invariant "one Mail pipeline for all item attachments" would be violated.
- DevTools would need separate inspection paths for two classes of in-transit
  objects.

---

## Decision Drivers

- Reuse the entire Auction → Mail pipeline without adding a parallel track.
- Keep `ItemTransferService` as the sole authority for item transitions.
- Keep `AuctionListing.itemInstanceId` and `MailMessage.attachedItemInstanceId`
  unchanged.
- Make the new concept explicitly identifiable in the database schema and in
  code — not derivable only from a nullable column convention.
- Preserve the invariant that `ItemMaterializationService` is the sole entry
  point for NEW Runtime object production. Market Lots are not new objects;
  they are existing inventory stock temporarily atomised for market transit. A
  different creation path is required and must be clearly separated.
- Enforce all new invariants at the SQL level, not only at the TypeScript level.

---

## Decision

### Decision 1 — `ItemInstance.instanceType`

A new column `instanceType` is added to `item_instance`:

```
ItemInstance.instanceType: 'NORMAL' | 'LOT'
```

**`NORMAL`**: the current and default meaning of `ItemInstance`. Represents a
physically unique object: one sword, one ring, one enchanted tool. Created by
`ItemMaterializationService`. Starts at `AVAILABLE` state. Can reach any
container state. Not destroyed at claim.

**`LOT`**: a Market Lot. Represents a quantity of a `STACKABLE` item
temporarily atomised from `Inventory` to transit through the economic pipeline
(Auction → Mail). Created by `ItemTransferService.createLot()` exclusively.
Starts at `LISTED` state. Can only reach `LISTED` and `IN_MAIL` states. Always
destroyed at claim — never returns to `AVAILABLE`.

The column is non-nullable with a database default of `'NORMAL'`, making the
migration backward-compatible: all existing `ItemInstance` rows become `NORMAL`
without modification.

The `instanceType` field is the authoritative discriminant. No domain may
substitute `quantity IS NULL` as the classification test in business logic.

### Decision 2 — `ItemInstance.quantity`

A new nullable column `quantity` is added to `item_instance`:

```
ItemInstance.quantity: int | null
```

- `quantity = null` ↔ `instanceType = NORMAL` (unique object, no quantity
  concept).
- `quantity > 0` ↔ `instanceType = LOT` (number of units of `itemId` in
  transit).

The SQL CHECK constraint below makes this mutual exclusion enforceable at the
database level.

### Decision 3 — `ItemInstanceType` enum

The two values of `instanceType` are formalised as an enum in the TypeScript
codebase:

```typescript
enum ItemInstanceType {
  NORMAL = 'NORMAL',
  LOT    = 'LOT',
}
```

This enum is extensible. Future specialisations (e.g. `BUNDLE` for mixed-item
lots) may be added by amending this ADR, provided each new value receives its
own invariant set and cycle of life documentation before implementation.

### Decision 4 — `ItemInstanceSource` enum

The `createdBySource` field on `ItemInstance` is currently typed as
`string | null` and populated from `MaterializationSource`, a union type in
`item-materialization.service.ts`. This ADR formalises all legal values as a
named enum:

```typescript
enum ItemInstanceSource {
  LOOT       = 'LOOT',       // Creature or resource drop, existing
  CRAFT      = 'CRAFT',      // Craft output, existing
  QUEST      = 'QUEST',      // Quest reward, existing
  VENDOR     = 'VENDOR',     // NPC vendor grant, existing
  ADMIN      = 'ADMIN',      // Admin grant or correction, existing
  EVENT      = 'EVENT',      // Event reward, existing
  CHEST      = 'CHEST',      // Chest / loot box, existing
  MARKET_LOT = 'MARKET_LOT', // Market Lot created at listing time — NEW
  MIGRATION  = 'MIGRATION',  // Data migration — NEW
}
```

Notes:
- `LOOT` covers all probabilistic drops (creatures, resources). A separate
  `DROP` value is not introduced — it would be redundant with `LOOT`.
- `MARKET_LOT` is exclusively set by `ItemTransferService.createLot()`.
- `MIGRATION` is reserved for data migration scripts that must create instances
  from pre-existing legacy data. It must never be used by live game logic.
- `ItemMaterializationService` continues to use `MaterializationSource` for its
  `context.source` parameter. `ItemInstanceSource` is the persistence-level
  enum that `createdBySource` stores. Both sets of values must remain aligned;
  any new `MaterializationSource` value requires a corresponding
  `ItemInstanceSource` value.

### Decision 5 — SQL constraints

```sql
-- Column additions (migration, backward-compatible)
ALTER TABLE item_instance
  ADD COLUMN instance_type  VARCHAR(10) NOT NULL DEFAULT 'NORMAL'
              CHECK (instance_type IN ('NORMAL', 'LOT')),
  ADD COLUMN quantity       INTEGER     DEFAULT NULL;

-- Mutual exclusion constraint
ALTER TABLE item_instance
  ADD CONSTRAINT chk_instance_type_quantity CHECK (
    (instance_type = 'NORMAL' AND quantity IS NULL) OR
    (instance_type = 'LOT'    AND quantity > 0)
  );

-- Optional performance index for DevTools and audit queries
CREATE INDEX idx_item_instance_lots
  ON item_instance (item_id, state)
  WHERE instance_type = 'LOT';
```

The STACKABLE-only constraint on LOT creation cannot be expressed as a SQL
CHECK because it references the `item` table. It is enforced by
`ItemTransferService.createLot()` at the TypeScript level: the method validates
`item.objectMode === ObjectMode.STACKABLE` before creating a LOT and throws
`BadRequestException` otherwise.

### Decision 6 — `ItemTransferService.createLot()`

A new method `createLot()` is added to `ItemTransferService`. It is the single
authorised creation path for Market Lots.

**Responsibility:**

- Validate that the referenced `Item.objectMode === STACKABLE`.
- Lock the `Inventory` row (pessimistic write lock).
- Validate that `Inventory.quantity >= requestedQuantity`.
- Decrement `Inventory.quantity` atomically.
- Create an `ItemInstance` with:
  - `instanceType = LOT`
  - `quantity = requestedQuantity`
  - `state = LISTED`
  - `containerType = AUCTION`
  - `containerId = listingId`
  - `ownerId = sellerCharacterId`
  - `ownerType = 'character'`
  - `createdBySource = MARKET_LOT`
- Return the created `ItemInstance`.

**Transaction contract:** identical to `ItemMaterializationService`. The method
never opens its own transaction. It receives an `EntityManager` from the
calling domain (`AuctionService.createListing()`) and operates entirely within
the caller's transaction scope.

**Why this does not violate `ItemTransferService` responsibility:**
`ItemTransferService` is the single authority for Runtime item movement and
state transitions. Lot creation is the initialisation of a movement — the
moment at which inventory stock enters the Runtime pipeline as a trackable
entity. It is not a transfer between two existing containers. Adding `createLot`
as a sibling to `transfer()` keeps all ItemInstance mutations in one service
while clearly separating creation (new entity from stock) from transition
(existing entity between containers).

**`ItemMaterializationService` is not called for Lot creation.** That service
produces NEW Runtime objects from production sources (loot, craft, quest, etc.).
A Market Lot is NOT a new object — it is existing inventory stock temporarily
reified. Calling `ItemMaterializationService` for a Lot would be semantically
incorrect: the source would be `MARKET_LOT`, not a production origin, and the
service's classification logic (`objectMode === INSTANCE → create instance`) is
not applicable here.

### Decision 7 — Transition matrix for LOTs

`ItemTransferService.transfer()` is used for all subsequent transitions of a
LOT. The following transitions are authorised for LOTs. All others throw
`BadRequestException('A LOT instance cannot be transitioned via <type>')`.

| Transition | LOT | Notes |
|---|---|---|
| `AUCTION_TO_MAIL` | ✅ | Achat — LOT : LISTED + AUCTION → IN_MAIL + MAIL |
| `RETURN_TO_SELLER` | ✅ | Annulation / expiration — LOT : LISTED → IN_MAIL |
| `CLAIM_MAIL` | ✅ | Claim — LOT : IN_MAIL → DESTROYED + Inventory += quantity |
| All others | ❌ | EQUIP, DROP, PICKUP, BANK, GUILD, HOUSE, TRADE, ARCHIVE, … |

`CLAIM_MAIL` has two branches in `ItemTransferService`:
- `instance.instanceType === NORMAL` → instance transitions to
  `AVAILABLE + INVENTORY`. No Inventory write.
- `instance.instanceType === LOT` → `Inventory.quantity += lot.quantity`
  (pessimistic write lock on Inventory), then `instance.state = DESTROYED`.
  The LOT never becomes `AVAILABLE`.

---

## Invariants

### ItemInstance NORMAL

| Invariant | Rule |
|---|---|
| I-N1 | `instanceType = 'NORMAL'` |
| I-N2 | `quantity IS NULL` (SQL constraint) |
| I-N3 | Created exclusively by `ItemMaterializationService` |
| I-N4 | Entry state: `AVAILABLE` |
| I-N5 | Reachable states: all states (AVAILABLE, EQUIPPED, IN_WORLD, LISTED, IN_MAIL, IN_BANK, IN_GUILD, IN_HOUSE, IN_TRADE, ARCHIVED, DESTROYED) |
| I-N6 | `CLAIM_MAIL` → returns to `AVAILABLE + INVENTORY` (not DESTROYED) |
| I-N7 | `createdBySource ∈ {LOOT, CRAFT, QUEST, VENDOR, ADMIN, EVENT, CHEST, MIGRATION}` |

### ItemInstance LOT

| Invariant | Rule |
|---|---|
| I-L1 | `instanceType = 'LOT'` |
| I-L2 | `quantity > 0` (SQL constraint) |
| I-L3 | Created exclusively by `ItemTransferService.createLot()` |
| I-L4 | Created only for items with `Item.objectMode = 'STACKABLE'` |
| I-L5 | Entry state: `LISTED` — never `AVAILABLE` |
| I-L6 | Reachable states: `LISTED`, `IN_MAIL` only |
| I-L7 | Terminal state: `DESTROYED` — never `AVAILABLE`, never `ARCHIVED` |
| I-L8 | `CLAIM_MAIL` → `Inventory.quantity += lot.quantity` + `state = DESTROYED` |
| I-L9 | Never equippable, never in world, never in bank / guild / house / trade (MVP) |
| I-L10 | References exactly one `AuctionListing` via `containerId` at creation |
| I-L11 | References at most one `MailMessage` via `containerId` during transit |
| I-L12 | `Inventory` decrement and LOT creation are atomic (same transaction) |
| I-L13 | `Inventory` restoration and LOT destruction at CLAIM are atomic |
| I-L14 | `createdBySource = 'MARKET_LOT'` always |

### Inventory

| Invariant | Rule |
|---|---|
| I-V1 | `Inventory.quantity` represents only the stock available to the character |
| I-V2 | Stock in transit (LOT LISTED or IN_MAIL) is excluded from `Inventory.quantity` |
| I-V3 | `Inventory.quantity` + sum of active LOT quantities = total owned stock |
| I-V4 | Restoration occurs exclusively at `CLAIM_MAIL` — not at listing creation |

---

## State Machines

### ItemInstance NORMAL

```
[Created by ItemMaterializationService]
         │
    AVAILABLE (INVENTORY)
   /    │    \
EQUIPPED  │  IN_WORLD
   \    │    /
    AVAILABLE
         │
      LISTED (AUCTION)
         │
      IN_MAIL (MAIL)
         │
    AVAILABLE (INVENTORY) ← CLAIM_MAIL

Also reachable via: IN_BANK, IN_GUILD, IN_HOUSE, IN_TRADE
Terminal: ARCHIVED, DESTROYED (admin / WorldItem expiry)
```

### ItemInstance LOT

```
[Created by ItemTransferService.createLot()]
[Inventory.quantity decremented atomically]
         │
      LISTED (AUCTION)        ← entry state, never AVAILABLE
         │
    ┌────┴──────────────────────────────┐
    │ AUCTION_TO_MAIL (achat)           │ RETURN_TO_SELLER (annulation/expiration)
    │                                   │
  IN_MAIL (MAIL, acheteur)         IN_MAIL (MAIL, vendeur)
    │                                   │
    └────────────┬──────────────────────┘
                 │ CLAIM_MAIL
                 │ Inventory.quantity += lot.quantity
                 │
             DESTROYED ← terminal unique
```

---

## Creation and Transfer Flows

### Listing (creation du LOT)

```
AuctionService.createListing({ itemId, quantity, buyoutPriceBronze, sellerId })
│
└─ DataSource.transaction(manager => {
     [1] Validate item.objectMode === STACKABLE
     [2] ItemTransferService.createLot(manager, {
           itemId, quantity, sellerCharacterId
         })
           ├─ LOCK Inventory (pessimistic_write)
           ├─ CHECK Inventory.quantity >= quantity
           ├─ Inventory.quantity -= quantity
           ├─ CREATE AuctionListing → listingId
           └─ CREATE ItemInstance {
                instanceType: LOT, quantity,
                state: LISTED, containerType: AUCTION,
                containerId: listingId, ownerId: sellerId,
                createdBySource: MARKET_LOT
              }
   })

Rollback si Inventory insuffisante, limite d'annonces atteinte, ou erreur DB.
```

### Achat

```
AuctionService.buyListing({ listingId, buyerId })
│
└─ DataSource.transaction(manager => {
     [1] LOCK AuctionListing
     [2] EconomyService.transferWithinManager(buyer → auction_escrow, price)
     [3] AuctionListing.status = SOLD_PENDING_CLAIM
     [4] MailService.sendSystemMailWithinManager → buyerMailId
     [5] ItemTransferService.transfer(lot.id, AUCTION_TO_MAIL { buyerMailId })
           LOT: LISTED+AUCTION → IN_MAIL+MAIL
     [6] MailService.sendSystemMailWithinManager(seller, attachedAmountBronze=price)
   })

Claim acheteur → CLAIM_MAIL:
  Inventory.quantity += lot.quantity
  lot.state = DESTROYED
  mail.claimedAt = now

Claim vendeur → MailService.claim(sellerMoneyMail):
  auction_escrow.balance -= price → seller_wallet.balance += price
```

### Annulation et expiration

```
cancelListing / expireListings:
│
└─ DataSource.transaction(manager => {
     [1] LOCK AuctionListing (verify status = LISTED)
     [2] AuctionListing.status = CANCELLED | EXPIRED
     [3] MailService.sendSystemMailWithinManager(seller, attachedItemInstanceId=lot.id)
     [4] ItemTransferService.transfer(lot.id, RETURN_TO_SELLER { listingId, sellerCharacterId })
           LOT: LISTED+AUCTION → IN_MAIL+MAIL (destinataire: vendeur)
   })

Claim vendeur → CLAIM_MAIL:
  Inventory.quantity += lot.quantity
  lot.state = DESTROYED
```

---

## DevTools

### Inspection des ItemInstance

Les outils d'administration affichent `instanceType` comme badge de premier
niveau. La colonne `quantity` n'est visible que pour les LOTs.

```
┌──────────┬──────────────────┬──────┬──────────────┬─────────────┐
│ Type     │ Item             │ Qté  │ État         │ Conteneur   │
├──────────┼──────────────────┼──────┼──────────────┼─────────────┤
│ [NORMAL] │ Épée de feu      │  —   │ AVAILABLE    │ INVENTORY   │
│ [NORMAL] │ Potion rouge     │  —   │ LISTED       │ AUCTION     │
│ [LOT] ★  │ Bâton de bois    │ ×500 │ LISTED       │ AUCTION     │
│ [LOT] ★  │ Minerai de fer   │ ×200 │ IN_MAIL      │ MAIL        │
└──────────┴──────────────────┴──────┴──────────────┴─────────────┘
```

### Filtres recommandés

| Filtre | Requête |
|---|---|
| Tous les LOTs actifs | `instance_type = 'LOT' AND state IN ('LISTED', 'IN_MAIL')` |
| LOTs en attente de claim | `instance_type = 'LOT' AND state = 'IN_MAIL'` |
| LOTs bloqués (> 30 jours IN_MAIL) | `instance_type = 'LOT' AND state = 'IN_MAIL' AND updated_at < now() - 30d` |
| LOTs NORMAL par source | `created_by_source = 'MARKET_LOT'` (équivalent à `instance_type = 'LOT'`) |

### Détail d'un LOT

```
instanceType    : LOT
instanceId      : <uuid>
itemId          : iron_ore
quantity        : 200
state           : IN_MAIL
containerType   : MAIL
containerId     : <mail-uuid>
ownerId         : <buyer-char-uuid>
createdBySource : MARKET_LOT
createdAt       : 2026-06-30T14:00:00Z
```

---

## Alternatives Considered

### Alternative A — INSTANCE uniquement (statu quo)

Maintenir la règle "Auction MVP 1 : INSTANCE items only" indéfiniment.

Rejeté parce que :

- Les ressources, matériaux, consommables et munitions — les catégories les
  plus échangées dans tout MMORPG — restent hors marché.
- La contrainte ne se justifie que le temps de concevoir un modèle ; l'ADR
  d'origine l'anticipait explicitement.
- Forcer les joueurs à échanger des ressources uniquement par Trade peer-to-peer
  détruit la liquidité de l'économie.

### Alternative B — Double track dans AuctionListing et MailMessage

Ajouter `listingType: 'INSTANCE' | 'STACKABLE'`, `stackItemId`, `stackQuantity`
à `AuctionListing`, et les colonnes miroirs à `MailMessage`.

Rejeté parce que :

- `AuctionListing` et `MailMessage` acquièrent chacun deux paires de colonnes
  mutuellement exclusives — schéma fragile, contrainte SQL non exprimable.
- Chaque domaine futur (Bank, Trade, Guild, Housing) doit implémenter deux
  chemins de code parallèles en permanence.
- `ItemTransferService` ne peut pas opérer sur un "stack en transit" — soit il
  est étendu avec un service parallèle (violation du principe "un point de
  mutation"), soit les mutations se font hors de lui (violation de l'invariant
  ADR-0010).
- Chaque nouvelle fonctionnalité (partial purchase, quality sur lot) doit être
  dupliquée sur les deux tracks.
- Le coût de maintenance croît à chaque domaine ajouté.

### Alternative C — Entité `ItemLot` indépendante

Créer `ItemLot { id, itemId, quantity, state, containerType, containerId }`,
miroir complet de `ItemInstance`.

Rejeté parce que :

- Duplication complète du state machine de `ItemInstance` (20 transitions).
- `ItemTransferService` serait doublé par un `ItemLotTransferService`.
- `AuctionListing.itemInstanceId` et `MailMessage.attachedItemInstanceId`
  deviendraient des FKs unionisées (`itemInstanceId | itemLotId`) — fragiles,
  non exprimables comme contraintes FK standard.
- Chaque domaine qui gère des objets en transit doit traiter deux types
  d'entités. La complexité double sans apporter de valeur métier supplémentaire.

### Alternative D — `ItemContainer` générique / asset abstrait

Introduire une entité abstraite `TransferableAsset` dont `ItemInstance` et les
stacks seraient des spécialisations.

Non retenu pour le MVP parce que :

- Refonte architecturale majeure qui modifie la fondation de tous les domaines
  existants (Equipment, WorldItem, Bank, Trade, Guild, Housing, Mail, Auction).
- Le bénéfice — unification conceptuelle — est réel mais insuffisant pour
  justifier la complexité de migration et le risque introduit à ce stade du
  projet.
- Cette approche reste envisageable comme évolution future si le nombre de
  types de transferables croît significativement. Elle nécessiterait un ADR
  dédié et une migration progressive.

### Alternative E (retenue) — LOT comme variante explicite d'`ItemInstance`

Ajouter `instanceType: NORMAL | LOT` et `quantity: int | null` à `ItemInstance`.
Créer `ItemTransferService.createLot()` pour la création atomique.
Réutiliser entièrement le pipeline Auction → Mail sans modification des FKs.

Retenu parce que :

- Réutilisation maximale : `AuctionListing`, `MailMessage`, `EconomyService`,
  toutes les transitions `ItemTransferService` existantes, et tous les index SQL
  restent inchangés.
- Explicitement discriminé : `instanceType` est visible dans le schéma, dans le
  code TypeScript, et dans les DevTools. Le concept de LOT n'est pas dérivé
  d'une convention de nullabilité opaque.
- Contraintes SQL expressibles : le CHECK composé interdit les états incohérents
  sans dépendre du code applicatif.
- Migration minimale : +2 colonnes, backward-compatible, zéro donnée à convertir.
- Extensible : un troisième `instanceType` peut être ajouté par amendement sans
  restructuration de table.
- Séparation de responsabilités préservée : `ItemMaterializationService` crée
  de nouveaux objets ; `createLot` atomise du stock existant. Les deux concepts
  sont clairement distincts.

---

## Compatibility with Future Domains

| Domaine | Compatibilité | Adaptation requise |
|---|---|---|
| **Bank** | ✅ Mineure | STORE_BANK : `createLot` depuis Inventory → IN_BANK. WITHDRAW_BANK : `Inventory.quantity += lot.quantity`, LOT DESTROYED. Pattern identique à CLAIM_MAIL. |
| **Trade peer-to-peer** | ✅ Mineure | TRADE_LOCK d'un LOT : verrou sur Inventory. TRADE_COMMIT : `Inventory += qty` chez le destinataire, LOT DESTROYED. Anti-deadlock lexicographique existant s'applique sur `lot.id`. |
| **Guild Vault** | ✅ Mineure | Même pattern que Bank. |
| **Housing** | ⚠ Partielle | LOTs de matériaux de construction logiques. Items décoratifs = NORMAL. Housing devra distinguer les deux dans son withdraw. |
| **Crafting** | ✅ Direct | Consomme `Inventory` directement. Aucun LOT impliqué. Inchangé. |
| **Loot** | ✅ Direct | STACKABLE loot → `Inventory` directement via `ItemMaterializationService`. Aucun LOT créé. Inchangé. |
| **Quest Rewards** | ✅ Direct | Idem Loot. Inchangé. |
| **GM Tools** | ✅ Mineure | Admin peut appeler `createLot()` pour injection de test ou seed. Audité via `createdBySource = MARKET_LOT`. |

---

## Consequences

### Positive

- Les ressources, matériaux et consommables deviennent vendables en marché.
- Le pipeline Auction → Mail est réutilisé sans modification de schéma
  relationnel (`AuctionListing`, `MailMessage` inchangés).
- `ItemTransferService` reste le seul point de mutation d'`ItemInstance` — la
  règle ADR-0010 est préservée.
- Le concept de LOT est explicitement discriminé (`instanceType`) dans le schéma
  SQL, dans le type TypeScript, et dans les DevTools.
- La contrainte SQL `chk_instance_type_quantity` interdit les états incohérents
  sans dépendre du code applicatif.
- Les LOTs sont éphémères : LISTED → IN_MAIL → DESTROYED. La table `item_instance`
  ne grossit pas structurellement sur le long terme.
- `createdBySource = MARKET_LOT` fournit une trace d'audit durable et un filtre
  DevTools sans table séparée.
- Chaque domaine futur (Bank, Trade, Guild) ajoute un seul cas dans son
  opération de retrait — pas deux chemins parallèles.

### Negative

- `ItemInstance` acquiert un second rôle sémantique. La règle "un LOT = un
  `ItemInstance` avec `instanceType = LOT`" doit être apprise par tout
  développeur touchant ce modèle.
- `ItemTransferService` acquiert une méthode de création (`createLot`), en
  plus de sa méthode de transition (`transfer`). Cette extension de
  responsabilité est intentionnelle et documentée, mais doit être tenue à jour.
- La contrainte STACKABLE-only sur `createLot` est applicative, pas SQL (elle
  nécessite un JOIN vers la table `item`). Un bug dans `createLot` pourrait
  créer un LOT pour un item INSTANCE. Un test de régression couvrant ce cas
  est obligatoire.
- Tous les domaines qui implémentent `CLAIM_MAIL` (Bank, Trade, Guild, Housing)
  doivent gérer la branche LOT dans leur logique de claim. Un oubli produit un
  LOT orphelin (IN_MAIL, jamais claim-able).

### Risques

| Risque | Sévérité | Mitigation |
|---|---|---|
| LOT créé sans décrement Inventory | Critique | Transaction atomique. Si INSERT item_instance échoue, UPDATE inventory est rollbacké. |
| LOT non détruit au claim (Inventory non créditée) | Critique | Branche LOT dans CLAIM_MAIL obligatoire. Test de régression couvrant CLAIM_MAIL LOT. |
| LOT INSTANCE créé par erreur (item non STACKABLE) | Haut | Validation `item.objectMode === STACKABLE` dans `createLot()`. Test unitaire dédié. |
| LOT orphelin (mail non claimé après 30 jours) | Moyen | Alerte DevTools. Scheduler de détection des LOTs bloqués (futur). |
| Crash entre décrement Inventory et création listing | Faible | Transaction atomique — rollback complet. Inventory restaurée. |
| Double expiration du même listing | Faible | LOCK + vérification `status === LISTED` idempotente avant transition. |

---

## Migration

### Stratégie

Migration backward-compatible en deux étapes SQL :

**Étape 1 — Ajout des colonnes :**

```sql
ALTER TABLE item_instance
  ADD COLUMN instance_type  VARCHAR(10) NOT NULL DEFAULT 'NORMAL'
              CHECK (instance_type IN ('NORMAL', 'LOT')),
  ADD COLUMN quantity       INTEGER     DEFAULT NULL;
```

Toutes les lignes existantes reçoivent `instance_type = 'NORMAL'` et
`quantity = NULL`. Aucune donnée existante n'est modifiée.

**Étape 2 — Contrainte de cohérence :**

```sql
ALTER TABLE item_instance
  ADD CONSTRAINT chk_instance_type_quantity CHECK (
    (instance_type = 'NORMAL' AND quantity IS NULL) OR
    (instance_type = 'LOT'    AND quantity > 0)
  );
```

**Étape 3 — Index optionnel :**

```sql
CREATE INDEX idx_item_instance_lots
  ON item_instance (item_id, state)
  WHERE instance_type = 'LOT';
```

### Impact sur le code existant

- `ItemInstance` entity : ajouter `instanceType: ItemInstanceType` et
  `quantity: number | null`. Aucune autre entité modifiée.
- `ItemTransferService` : ajouter `createLot()`, ajouter la branche LOT dans
  `applyClaimMail()`.
- `AuctionService.createListing()` : retirer la guard `objectMode !== INSTANCE`,
  ajouter la branche STACKABLE → `createLot()`.
- Aucune modification de `AuctionListing`, `MailMessage`, `EconomyService`,
  `ItemMaterializationService`, `MailService`, `WorldGateway`,
  `ResourcesGateway`, `CraftingService`.

---

## Validation

**Cette architecture est-elle désormais figée ?**

Oui pour le modèle de base : `instanceType`, `quantity`, `createLot()`, et les
invariants I-L1 à I-L14 sont la référence officielle. Tout développement
Auction STACKABLE ou extension aux futurs domaines (Bank V2, Trade V2, Guild V2)
doit s'y conformer.

**Tous les futurs développements Auction STACKABLE devront-ils s'y conformer ?**

Oui. `AuctionService` est le seul domaine autorisé à appeler `createLot()` pour
le MVP. Chaque extension (Bank LOT, Trade LOT) doit documenter son point
d'appel à `createLot()` avant implémentation.

**Existe-t-il encore une décision d'architecture ouverte ?**

Deux points sont délibérément laissés ouverts pour les phases suivantes :

1. **Achats partiels (partial purchase) :** acheter 100 unités d'un lot de 500.
   Ce cas nécessite une nouvelle transition `SPLIT_LOT` dans `ItemTransferService`
   (créer un lot fils de 100, décrémenter le lot parent à 400). Cette décision
   est déférée à Auction MVP 3.

2. **LOTs dans Bank / Trade / Guild / Housing :** chaque domaine qui accepte
   les LOTs doit définir son point d'appel à `createLot()` et sa logique de
   claim (branche LOT dans WITHDRAW/COMMIT). Cette décision est déférée aux
   phases V2 de chaque domaine concerné.

---

## Open Questions

- Faut-il une limite maximale de `quantity` par lot à la création (ex. 10 000
  unités) pour prévenir les listings qui saturent le marché ? Si oui, la limite
  est-elle par item, par vendeur, ou globale ?
- Un LOT expiré non claimé depuis plus de N jours doit-il être automatiquement
  restitué (scheduler) ou rester en mail jusqu'au claim manuel ?
- Le partial purchase (Auction MVP 3) doit-il conserver le lot original comme
  "lot résiduel" ou créer systématiquement deux nouveaux lots ?

---

## Implementation Status

Not yet implemented. This ADR must be accepted before any code change.

## Related Files

- docs/01_Architecture/adr/ADR-0007-auction-house-authority.md
- docs/01_Architecture/adr/ADR-0010-object-runtime-model.md
- docs/01_Architecture/adr/ADR-0011-item-materialization-pipeline.md
- docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md
- docs/08_Gameplay/auction-house-specifications.md
- docs/08_Gameplay/item-taxonomy.md
- docs/08_Gameplay/economy-foundation.md
- docs/08_Gameplay/object-runtime-architecture.md
