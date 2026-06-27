# Object Runtime Architecture

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-27
- Depends on: docs/08_Gameplay/economy-foundation.md, docs/08_Gameplay/auction-house-specifications.md, docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md, docs/01_Architecture/adr/ADR-0007-auction-house-authority.md
- Used by: Project owner, gameplay design, backend developers, DevTools developers, repository-aware coding agents

## Scope

This document defines the definitive Runtime architecture for MMORPG objects.

It is documentation only. It does not create code, migrations, Runtime services,
entities, controllers, frontend components, DevTools panels, or ADR changes.

The target architecture is hybrid:

- stackable resources stay stack-based;
- unique gameplay objects become `ItemInstance`;
- Economy remains responsible for bronze-only currency and ledger;
- Auction House, Craft Orders, Equipment, World drops, Mail, Bank, Guild Storage,
  and DevTools must use one object ownership model.

## 1. Why the Current Model Is Not Enough

Current implemented model:

```text
Character
└── Inventory
    └── Item
        └── quantity
```

This works for materials and simple consumables, but not for unique objects.

Limitations:

- two swords of the same `Item` cannot have different durability;
- a crafted weapon cannot keep crafter signature;
- an enchanted item cannot carry its own modifiers safely;
- Auction MVP 1 requires one non-stackable item instance;
- equipment currently references `Item`, not a specific object;
- world drops represent catalogue item + quantity, not unique object identity;
- no single immutable ownership trace exists for an individual object.

The new architecture keeps the current stack model for resources while adding
`ItemInstance` for objects that need identity.

## 2. Responsibilities

### 2.1 Item

`Item` is the catalogue definition.

Responsibilities:

- define base item identity: name, type, category, image;
- define default gameplay stats such as attack, defense, range, slot;
- define whether this catalogue item is stackable or instanced;
- define base rarity/quality defaults if needed;
- define whether instances may be equipped, traded, destroyed, repaired,
  enchanted, listed, mailed, banked, or used in crafting.

`Item` is not an owned object. It is a template/reference.

Current implementation:

- `apps/api-gateway/src/items/entities/item.entity.ts`;
- referenced by `Inventory`, `CharacterEquipment`, `WorldItem`, crafting
  ingredients/results.

Target evolution:

- add item classification metadata later, for example `objectMode`:
  `STACKABLE` or `INSTANCE`;
- do not store player-specific durability, ownership, or enchantment on `Item`.

### 2.2 ItemInstance

`ItemInstance` is one concrete owned object.

Responsibilities:

- represent exactly one unique object;
- carry object-specific state;
- carry object-specific container location;
- carry object-specific ownership;
- carry durability, quality, enchantments, crafter signature, repair count, and
  future metadata;
- be the object referenced by equipment, auction listing, world drop, mail,
  bank, guild storage, craft order, and DevTools.

`ItemInstance` is the authoritative runtime identity for all non-stackable
valuable objects.

### 2.3 Inventory

`Inventory` becomes a hybrid view/container model.

Responsibilities:

- keep stackable quantities for stackable catalogue `Item`s;
- expose inventory contents to the player;
- for unique objects, show `ItemInstance` where `containerType = INVENTORY` and
  `containerId = characterId`;
- validate capacity and inventory access;
- keep old stack rows during migration until stackable inventory is separated or
  renamed.

Inventory must not own unique object identity directly. Unique identity belongs
to `ItemInstance`.

### 2.4 WorldItem

`WorldItem` is the physical world representation of an object on the map.

Current implementation:

- `WorldItem` stores `itemId`, `quantity`, `worldX`, `worldY`, `mapId`, owner
  character, expiration, and state.

Target responsibility:

- represent stackable world drops as catalogue item + quantity;
- represent unique world drops by referencing `itemInstanceId`;
- expose map position and spawn/expiration state;
- never duplicate the ownership state of an `ItemInstance`;
- for unique drops, `ItemInstance.containerType = WORLD` and
  `containerId = worldItemId`.

### 2.5 CharacterEquipment

`CharacterEquipment` is the equipped-slot projection.

Current implementation:

- one row per `characterId + slot`;
- references catalogue `Item`.

Target responsibility:

- reference `itemInstanceId` for unique equipment;
- enforce one equipped instance per slot;
- never equip a stack row directly;
- make equipped object visible through `ItemInstance.containerType = EQUIPMENT`
  and `containerId = characterEquipmentId` or `characterId + slot` depending on
  implementation.

### 2.6 AuctionListing

`AuctionListing` is a market lifecycle record.

Responsibilities:

- reference exactly one `ItemInstance` for MVP fixed-price listings;
- never list stackable resources in Auction MVP 1;
- own listing state, price, expiration, seller, buyer claim state;
- rely on Economy for bronze transfers;
- move the listed instance to `containerType = AUCTION` while listed or pending
  buyer claim;
- never make listed items usable by inventory/equipment/craft/world flows.

### 2.7 Economy

Economy owns currency only.

Responsibilities:

- Wallet;
- EconomicTransaction;
- LedgerEntry;
- bronze-only monetary operations;
- idempotency and anti-negative-balance rules;
- transaction audit.

Economy does not own item identity. Economy may reference item/listing metadata
for audit, but object transfer authority belongs to the object runtime domain.

## 3. Which Objects Become ItemInstance

Objects become `ItemInstance` when any per-object identity, lifecycle, or audit
matters.

Instanced object categories:

- weapons;
- armor;
- shields;
- jewelry;
- tools if durability or quality matters;
- enchanted objects;
- objects with durability;
- objects with quality rolls;
- crafted signed objects;
- unique drops;
- named objects;
- quest objects;
- bound objects;
- repaired objects;
- upgraded objects;
- socketed/gemmed objects;
- transmog/cosmetic unique objects;
- future relics, artifacts, keys, deeds, contracts, mounts, pets, housing
  objects, and guild trophies.

Rule of thumb:

- if two copies can ever differ, they are `ItemInstance`;
- if ownership transfer must be audited individually, it is `ItemInstance`;
- if it can be equipped, listed in Auction MVP 1, repaired, enchanted, signed,
  or bound, it is `ItemInstance`.

## 4. Which Objects Stay Stackable

Objects stay stackable when every unit is interchangeable.

Stackable categories:

- ores;
- wood;
- plants;
- fibers;
- leather pieces;
- fish if they have no individual quality;
- generic consumables if identical;
- potions if no per-item durability/roll exists;
- food if no per-item freshness/quality exists;
- crafting ingredients;
- generic quest counters when not represented as physical unique items;
- ammunition if no individual modifiers exist;
- currencies.

Currency is never an `ItemInstance`. Currency is represented by Economy Wallet
balances in bronze.

Rule of thumb:

- if units can merge without losing information, they remain stackable;
- if units require separate lifecycle, they become `ItemInstance`.

## 5. ItemInstance Definition

### 5.1 Core Fields

Probable fields:

- `id`: UUID;
- `itemId`: catalogue `Item` id;
- `ownerType`: `CHARACTER`, `SYSTEM`, `GUILD`, `TREASURY`, `BANK`, `NONE`;
- `ownerId`: nullable owner id;
- `state`: current lifecycle state;
- `containerType`: current location/container type;
- `containerId`: current location/container id;
- `createdAt`;
- `updatedAt`;
- `destroyedAt`: nullable;
- `boundToCharacterId`: nullable;
- `createdBySource`: `LOOT`, `CRAFT`, `ADMIN`, `QUEST`, `MIGRATION`, `VENDOR`;
- `metadata`: json object for future extensions.

### 5.2 Gameplay Fields

Useful today or soon:

- `durabilityCurrent`;
- `durabilityMax`;
- `quality`;
- `rarityOverride`;
- `craftedByCharacterId`;
- `craftedAt`;
- `repairCount`;
- `upgradeLevel`;
- `enchantmentData`;
- `socketData`;
- `boundType`: `NONE`, `ON_PICKUP`, `ON_EQUIP`, `QUEST`;
- `displayNameOverride`;
- `statsOverride`;
- `sourceTraceId`.

### 5.3 Audit Fields

Recommended:

- `version` for optimistic checks if needed;
- `lastMovedAt`;
- `lastMovedByActorId`;
- `lastMovementReason`;
- `lastTransactionId` for Economy-linked moves when applicable.

Long-term history should be append-only in a separate movement/history table,
not overwritten on `ItemInstance`.

## 6. State vs Container

`state` and `container` are different concepts.

### State

State answers: what lifecycle condition is the object in?

Examples:

- `AVAILABLE`;
- `LOCKED`;
- `EQUIPPED`;
- `LISTED`;
- `SOLD_PENDING_CLAIM`;
- `IN_WORLD`;
- `IN_MAIL`;
- `IN_BANK`;
- `IN_GUILD_STORAGE`;
- `IN_CRAFT_ORDER`;
- `DESTROYED`;
- `ARCHIVED`.

### Container

Container answers: where is the object currently located?

Examples:

- `INVENTORY` with `containerId = characterId`;
- `EQUIPMENT` with `containerId = characterEquipmentId`;
- `WORLD` with `containerId = worldItemId`;
- `AUCTION` with `containerId = auctionListingId`;
- `MAIL` with `containerId = mailId`;
- `BANK` with `containerId = bankAccountId`;
- `GUILD_STORAGE` with `containerId = guildStorageId`;
- `CRAFT_ORDER` with `containerId = craftOrderId`;
- `NONE` with `containerId = null` for destroyed/archive states.

### Why Both Are Needed

An object can be in the same container with different states:

- `containerType = AUCTION`, state `LISTED`;
- `containerType = AUCTION`, state `SOLD_PENDING_CLAIM`.

An object can have the same state in different containers:

- state `LOCKED`, container `AUCTION`;
- state `LOCKED`, container `CRAFT_ORDER`;
- state `LOCKED`, container `MAIL`.

Containers support lookup and ownership. State supports business rules.

## 7. Transitions and State Machines

### 7.1 Main Object Flow

```text
Inventory
├── Equipment
│   └── Inventory
├── World
│   └── Inventory
├── Auction
│   ├── Buyer Inventory
│   └── Seller Inventory
├── Mail
│   └── Inventory
├── Bank
│   └── Inventory
├── Guild Storage
│   └── Inventory
├── Craft Order
│   ├── Consumed
│   └── Inventory
└── Destroyed
```

### 7.2 ItemInstance State Machine

```text
AVAILABLE
├── EQUIPPED
│   └── AVAILABLE
├── IN_WORLD
│   ├── AVAILABLE
│   └── EXPIRED
├── LISTED
│   ├── SOLD_PENDING_CLAIM
│   │   └── AVAILABLE
│   ├── CANCELLED_PENDING_CLAIM
│   │   └── AVAILABLE
│   └── EXPIRED_PENDING_CLAIM
│       └── AVAILABLE
├── IN_MAIL
│   └── AVAILABLE
├── IN_BANK
│   └── AVAILABLE
├── IN_GUILD_STORAGE
│   └── AVAILABLE
├── IN_CRAFT_ORDER
│   ├── CONSUMED
│   └── AVAILABLE
└── DESTROYED
    └── ARCHIVED
```

### 7.3 Container Transitions

```text
INVENTORY
├── EQUIPMENT
├── WORLD
├── AUCTION
├── MAIL
├── BANK
├── GUILD_STORAGE
├── CRAFT_ORDER
└── NONE
```

Rules:

- every transition is server-authoritative;
- every transition locks the `ItemInstance`;
- every transition checks current state and container;
- every transition writes an append-only history entry in the final model;
- every transition is idempotent or rejects stale commands safely.

## 8. Invariants

Identity invariants:

- one `ItemInstance` id represents one object forever;
- a unique object cannot be represented by both `Inventory.quantity` and
  `ItemInstance`;
- an `ItemInstance` cannot be duplicated by transfer;
- destroyed instances are not reused.

Ownership invariants:

- one `ItemInstance` has one logical owner at a time;
- owner and container must be compatible;
- owner cannot be changed without a valid server transition;
- owner changes are auditable.

Container invariants:

- one `ItemInstance` has one `containerType`;
- one `ItemInstance` has one `containerId`;
- no item can be in Inventory and Auction simultaneously;
- no item can be equipped and listed simultaneously;
- no item can be world-spawned and banked simultaneously.

State invariants:

- one `ItemInstance` has one state;
- state must be compatible with container;
- terminal states cannot return to active gameplay except through explicit
  support restoration;
- listed/locked/craft-order objects cannot be equipped, traded, destroyed,
  mailed, banked, or consumed by other systems.

History invariants:

- object movement history is append-only;
- admin corrections create new history records;
- Economy ledger and object history must share correlation ids when a transfer
  involves currency;
- no silent ownership rewrite.

## 9. System Impacts

### 9.1 Inventory

Current `Inventory` remains valid for stackables.

Impacts:

- add hybrid reads: stack rows + item instances in inventory container;
- stackable operations continue using quantity;
- unique operations use `ItemInstance`;
- inventory capacity must eventually count stack rows and instances;
- `equipped` flag on stack inventory becomes legacy for unique equipment.

### 9.2 WorldItem

WorldItem must support two modes:

- stackable: `itemId + quantity`;
- unique: `itemInstanceId`.

Unique world items should not duplicate owner/state. The instance carries
container and state; WorldItem carries world position and visibility.

### 9.3 Craft

Craft inputs:

- stackable ingredients consume `Inventory.quantity`;
- unique tools or rare ingredients lock/consume `ItemInstance`.

Craft outputs:

- stackable outputs add inventory quantity;
- unique outputs create `ItemInstance` with `craftedByCharacterId`,
  quality/durability metadata, and container `INVENTORY`.

### 9.4 Loot

Loot generation must classify output:

- stackable material -> inventory stack or stackable WorldItem;
- unique drop -> create ItemInstance then place in inventory/world.

The existing `LootResult { itemId, quantity }` remains sufficient only for
stackables.

### 9.5 Equipment

Equipment should reference `ItemInstance`, not catalogue `Item`.

Benefits:

- durability and enchantments apply per object;
- no two slots can equip the same instance;
- auction/craft/world cannot use equipped instances.

### 9.6 Economy

Economy remains currency-only.

Currency transfer and object transfer must be coordinated by domain services:

- Economy transfer succeeds;
- object transition succeeds;
- both are inside one player-facing transaction for purchase/trade flows;
- shared correlation id links Economy ledger and object history.

### 9.7 Auction

Auction MVP 1 requires `ItemInstance`.

Listing flow:

```text
ItemInstance in Inventory
└── lock instance
    └── container AUCTION
        └── state LISTED
```

Purchase flow:

```text
Economy transfer
└── seller credited
    └── ItemInstance stays AUCTION / SOLD_PENDING_CLAIM
        └── buyer claim -> INVENTORY / AVAILABLE
```

### 9.8 DevTools

DevTools must inspect:

- item catalogue definition;
- item instance state/container/owner;
- movement history;
- linked auction listing;
- linked Economy transaction;
- corruption warnings.

DevTools must not directly rewrite owner/container/state without audited server
commands.

### 9.9 Admin

Admin support actions must be explicit:

- freeze instance;
- inspect instance;
- repair stuck container;
- restore from support state;
- destroy with audit;
- move with audit.

No silent updates.

## 10. Migration Strategy

Migration must be progressive and non-breaking.

### Phase 0 - Documentation and Classification

- classify existing `Item` catalogue entries as stackable or instanced;
- define exact `objectMode` values;
- define migration rules for currently equipped items;
- define auction MVP dependency on instance support.

No Runtime change.

### Phase 1 - Add ItemInstance Readiness

- create `ItemInstance` model;
- create movement history model if selected;
- do not migrate inventory yet;
- keep current gameplay working.

### Phase 2 - Unique Item Creation

- new unique loot/craft/admin rewards create instances;
- stackable rewards continue using `Inventory.quantity`;
- existing inventory remains untouched.

### Phase 3 - Hybrid Inventory Read

- inventory endpoint returns stack rows and item instances;
- frontend can display both;
- no equipment migration yet.

### Phase 4 - Equipment Migration

- migrate equipped unique items to `ItemInstance`;
- update `CharacterEquipment` to reference instances;
- preserve legacy rows until verified;
- prevent equipping stackable rows directly.

### Phase 5 - WorldItem Hybridization

- support unique world drops through `itemInstanceId`;
- keep stackable world drops as current `itemId + quantity`;
- pickup/drop services branch by object mode.

### Phase 6 - Auction MVP Enablement

- AuctionListing references `ItemInstance`;
- listing locks instance;
- purchase transitions instance and calls Economy.

### Phase 7 - Cleanup Legacy Unique Rows

- remove or forbid legacy unique quantities in `Inventory`;
- keep stackables in stack inventory;
- archive migration logs.

## 11. Implementation Roadmap

### Step 1 - Object Classification

Commit goal:

- add item object mode metadata and tests.

Files likely:

- `items/entities/item.entity.ts`;
- item seeds;
- item service/admin validation tests.

Risks:

- misclassifying existing materials or equipment.

Tests:

- stackable items accept quantity;
- instanced items reject stack quantity > 1 in new flows.

### Step 2 - ItemInstance Foundation

Commit goal:

- add `ItemInstance` and history model.

Files likely:

- `items/entities/item-instance.entity.ts`;
- `items/entities/item-instance-history.entity.ts`;
- `items/item-instance.service.ts`;
- tests.

Risks:

- too much behavior in entity instead of service;
- missing pessimistic locks.

Tests:

- create instance;
- move instance;
- reject stale container;
- append history.

### Step 3 - Hybrid Inventory

Commit goal:

- expose stack rows plus item instances in inventory reads.

Files likely:

- `inventory/inventory.service.ts`;
- `inventory/inventory.controller.ts`;
- inventory DTOs;
- frontend later, if requested separately.

Risks:

- breaking existing inventory UI;
- mixing stack and instance ids.

Tests:

- inventory returns stackables;
- inventory returns item instances;
- ownership enforced.

### Step 4 - Equipment Instances

Commit goal:

- equip/unequip by `itemInstanceId`.

Files likely:

- `characters/entities/character-equipment.entity.ts`;
- `characters/character.service.ts`;
- equipment DTOs/tests.

Risks:

- breaking current equipment stats;
- duplicate equip of same instance.

Tests:

- equip instance;
- unequip instance;
- reject equipped item listing/drop/craft;
- one instance cannot occupy two slots.

### Step 5 - WorldItem Hybrid

Commit goal:

- drop/pickup unique instances without duplication.

Files likely:

- `world-items/entities/world-item.entity.ts`;
- `world-items/world-item.service.ts`;
- tests.

Risks:

- old stack drops regress;
- expired unique item loses recoverability.

Tests:

- drop stackable;
- drop instance;
- pickup instance once;
- double pickup rejected.

### Step 6 - Craft and Loot Integration

Commit goal:

- generate instances for unique outputs while preserving stackable materials.

Files likely:

- `world/loot.service.ts`;
- `crafting/crafting.service.ts`;
- item classification helpers;
- tests.

Risks:

- current craft recipes assume produced quantity;
- loot pools currently return `{ itemId, quantity }`.

Tests:

- material loot remains stackable;
- unique loot creates instance;
- craft material output stacks;
- craft equipment output creates signed instance.

### Step 7 - Auction Integration

Commit goal:

- Auction MVP can list `ItemInstance`.

Files likely:

- future auction module;
- Economy service integration;
- item instance lock/move service.

Risks:

- currency succeeds but item move fails;
- item lock remains stuck.

Tests:

- create listing locks instance;
- buy transfers bronze and sets sold pending claim;
- buyer claim moves instance to inventory;
- double buy rejected/idempotent.

## 12. Blocking Points

- Current inventory/equipment model has no item instances.
- Current `Item` has no object classification.
- Current `Inventory` stacks by `Item`, so unique inventory cannot be represented
  without a new model.
- Current `WorldItem` cannot reference unique instances.
- Current `CharacterEquipment` references catalogue `Item`.
- Auction MVP 1 depends on ItemInstance before implementation.
- Object history/audit model is not implemented.

## 13. Proposed Architecture Decisions

These are proposed design decisions, not accepted ADRs:

- `Item` remains catalogue/template.
- `ItemInstance` is mandatory for all unique/equippable/auctionable objects.
- Stackable resources remain in stack inventory.
- State and container are separate fields.
- Movement history is append-only.
- Economy remains currency-only and links to object movements through
  correlation ids.
- Auction MVP 1 must wait for ItemInstance support.
- Migration must be hybrid and progressive; no big-bang inventory rewrite.
