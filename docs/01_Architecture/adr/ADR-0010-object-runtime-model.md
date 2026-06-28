# ADR-0010 - Object runtime model

## Metadata

- Status: Accepted
- Decision status: Accepted
- Owner: Project
- Last updated: 2026-06-29
- Date proposed: 2026-06-27
- Date accepted: 2026-06-29
- Approved by: Project owner
- Approval reference: Runtime V2 completion — all 10 domains implemented and tested
- Depends on: docs/01_Architecture/adr/README.md, docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md, docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md, docs/01_Architecture/adr/ADR-0007-auction-house-authority.md
- Used by: Project owner, developers, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents: docs/08_Gameplay/object-runtime-architecture.md, docs/08_Gameplay/item-taxonomy.md, docs/08_Gameplay/economy-foundation.md, docs/08_Gameplay/auction-house-specifications.md, docs/00_Project/glossary.md, docs/00_Project/domains.md
- Related code: N/A

## Context

The historical item model is stack-oriented:

```text
Character
└── Inventory
    └── Item
        └── quantity
```

This model works for interchangeable resources and simple materials. It does
not work for objects that need identity, such as enchanted weapons, equipment
with durability, crafted signatures, unique quest items, auction listings, mail
attachments, banked objects, guild storage, or future housing objects.

The Economy and Auction House documents require item transfers to be
server-authoritative, transactionally safe, and auditable. Auction MVP 1 also
requires one non-stackable listed object that can be locked while listed and
claimed exactly once after purchase.

## Problem

Using only `Inventory + Item + quantity` creates several architectural risks:

- two copies of the same weapon cannot differ;
- durability, quality, enchantments, craftedBy, binding, and repair history have
  no safe per-object home;
- equipment references a template instead of a concrete object;
- a listed item can be duplicated if inventory, auction, and ownership state are
  represented separately;
- world drops cannot represent one unique object;
- mail, bank, guild storage, housing, and craft reservations would each invent
  their own object identity rules;
- support and DevTools cannot reconstruct the history of a valuable object.

## Decision Drivers

- Stackable resources must remain efficient.
- Unique objects must have stable identity.
- The server must remain authoritative for all item movements.
- Auction, Equipment, WorldItem, Mail, Bank, Guild Storage, Housing, and Craft
  Orders must share one object ownership model.
- Economy remains responsible for bronze-only currency and ledger; it must not
  become the owner of item identity.
- DevTools must inspect and correct through audited Runtime actions, not direct
  hidden mutations.
- The model must support progressive migration from the current prototype.

## Decision

The official object Runtime model is hybrid.

### Item

`Item` is a business template only.

It defines catalogue information such as name, family, category, base stats,
base image, default capabilities, stackability policy, and default instancing
policy.

`Item` never represents one physical owned object. Player-specific state such
as durability, quality, enchantments, crafted signature, binding, container,
owner, and movement history must not live on `Item`.

### Stackable Inventory

Inventory stack rows are used only for interchangeable stackable goods.

Examples:

- ordinary resources;
- ordinary refined materials;
- ordinary building materials;
- ordinary identical consumables;
- ordinary stackable recipe scrolls or counters if policy allows them.

Inventory stack rows do not represent equipment, auction-listed objects,
unique quest objects, official currency, mounts, companions, or any object that
needs per-object history.

### ItemInstance

`ItemInstance` represents one physical unique object.

It has an immutable UUID that remains stable across all transfers and
containers. Transferring, equipping, dropping, mailing, banking, listing,
claiming, or repairing an object does not recreate its identity.

`ItemInstance` supports object-specific data such as:

- state;
- container type and container id;
- logical owner;
- durability;
- quality;
- enchantments;
- craftedBy;
- repair count;
- binding;
- provenance;
- metadata;
- movement and ownership history.

`ItemInstance` is mandatory for all non-stackable valuable objects, including
weapons, armor, shields, jewelry, durable tools, enchanted items, signed crafted
items, unique items, quest objects with state, bound objects, auction-listed
objects, mounts, companions, and personalized housing objects.

### State and Container

State and container are distinct concepts.

State describes the lifecycle or usability of the object.

Examples:

- `AVAILABLE` — object is in inventory, ready to be used;
- `EQUIPPED` — object is worn or held by a character;
- `LOCKED` — object is administratively locked (reserved, suspended);
- `LISTED` — object is listed for sale on the Auction House;
- `SOLD_PENDING_CLAIM` — object is sold, awaiting buyer claim;
- `IN_WORLD` — object is physically present on a game map;
- `IN_MAIL` — object is attached to an in-transit mail message;
- `IN_BANK` — object is stored in a personal bank slot;
- `IN_GUILD_STORAGE` — object is stored in a guild shared vault;
- `IN_HOUSING` — object is stored or placed in a player house;
- `IN_TRADE` — object is locked in an active peer trade session;
- `IN_CRAFT_ORDER` — object is reserved for a craft order;
- `DESTROYED` — object is permanently removed from play (no recovery);
- `ARCHIVED` — object has expired or been irreversibly consumed (no recovery).

Container describes where the object currently resides.

Examples:

- `INVENTORY` — character personal inventory (containerId = characterId);
- `EQUIPMENT` — character equipment slot (containerId = characterId);
- `WORLD` — world map at a position (containerId = worldItem.id);
- `AUCTION` — Auction House listing (containerId = auctionListing.id);
- `MAIL` — mail message attachment (containerId = mail.id);
- `BANK` — personal bank (containerId = characterId);
- `GUILD_STORAGE` — guild shared vault (containerId = guild.id);
- `HOUSING` — player house storage (containerId = house.id);
- `TRADE` — active peer trade session (containerId = tradeSession.id);
- `CRAFT_ORDER` — reserved for crafting (containerId = craftOrder.id);
- `NONE` — no container, used for ARCHIVED and DESTROYED states.

They are separate because an object can be in the same container with different
states, or have the same broad state in different containers. For example, an
object can be in `AUCTION` while `LISTED` or `SOLD_PENDING_CLAIM`; an object can
be `LOCKED` by Auction, Craft Order, Mail delivery, or admin review.

### Transactions and Authority

All object movements are server-authoritative.

Any movement that changes owner, state, container, usability, or economic
visibility must be:

- validated by the server;
- transactionally safe from the player-facing point of view;
- idempotent or cleanly rejected on replay;
- auditable through append-only history or equivalent durable audit;
- coordinated with Economy when currency moves in the same gameplay action.

The client sends intentions only. It never decides ownership, final container,
state transition, auction transfer, equipment validity, destruction, or claim
success.

### Identity

An `ItemInstance` keeps the same UUID for its whole lifecycle.

The UUID is not replaced when the object moves between Inventory, Equipment,
WorldItem, Auction, Mail, Bank, Guild Storage, Housing, Craft Order, or
Destroyed/Archived states.

## Runtime Invariants

The following invariants are enforced by `ItemTransferService` and
`ItemMaterializationService`.

### I1 - Single Active Container

An `ItemInstance` has exactly one active container at a time.

The active container is represented by its `containerType` and `containerId`
pair. Runtime systems must not make the same `ItemInstance` simultaneously
available in Inventory, Equipment, WorldItem, Auction, Mail, Bank, Guild
Storage, Housing, Trade, or Craft Order.

**Enforcement:** `ItemTransferService.transfer()` acquires a pessimistic write
lock (`SELECT FOR UPDATE`) on the `ItemInstance` row before every transition and
validates the expected `(state, containerType, containerId)` triple. Any
mismatch throws before any mutation. `ItemMaterializationService` creates the
`ItemInstance` and its container record within the same caller-owned transaction,
guaranteeing that no instance ever exists without a valid container.

### I2 - Immutable UUID

An `ItemInstance` keeps the same UUID for its entire lifecycle.

No transition creates or deletes an `ItemInstance`. ARCHIVE sets
`state = ARCHIVED, containerType = NONE, containerId = null` without destroying
the row. DevTools and audit queries can always reconstruct the object's history
by UUID.

### I3 - Provenance audit (createdBySource)

Every `ItemInstance` created by `ItemMaterializationService` carries a
`createdBySource` field recording its production origin: `LOOT`, `CRAFT`,
`QUEST`, `VENDOR`, `ADMIN`, `EVENT`, or `CHEST`.

This field is immutable after creation. It is the lightweight provenance
anchor before a full append-only movement history is implemented (see TD-007).

**Implementation status:** `ItemInstance.createdBySource` column exists as of
migration `1783468800000-AddCreatedBySourceToItemInstance`.

### I4 - Legal Owner vs Physical Container

`ownerId` represents the legal owner.

`containerId` represents the physical or domain container where the object
currently resides.

These concepts are independent. For example, an item can remain legally owned
by a character while physically locked in Auction, stored in Mail, or placed in
Bank, depending on the domain transition.

**`ownerId` changes only on these five transitions:**

| Transition | New `ownerId` | Reason |
|---|---|---|
| `CLAIM_BUYER` | `buyerCharacterId` | Auction sale completed |
| `CLAIM_MAIL` | `recipientCharacterId` | Mail delivery accepted |
| `WITHDRAW_GUILD` | `characterId` | Item leaves shared ownership |
| `WITHDRAW_HOUSE` | `characterId` | Item leaves shared ownership |
| `TRADE_COMMIT` | `recipientCharacterId` | Peer trade executed |

All other transitions leave `ownerId` unchanged.

## Alternatives Considered

### Inventory only

Keep all objects as `Inventory + Item + quantity`.

Rejected because it cannot model object-specific durability, enchantments,
craftedBy, repairs, binding, quality, unique ownership, audit history, or safe
auction escrow. It also makes equipment reference a template instead of a
specific object.

### Auction escrow only

Add a special Auction escrow table or lock model only for listed items, while
leaving the rest of the game on `Inventory + Item + quantity`.

Rejected because it solves only one market symptom. Equipment, WorldItem, Mail,
Bank, Guild Storage, Housing, Craft Orders, and DevTools would still need their
own identity model, increasing duplication and item duplication risk.

### Recreate Item on every transfer

Treat every movement as consuming one item record and creating another record in
the destination.

Rejected because it destroys stable identity, breaks provenance, complicates
support investigations, weakens anti-duplication rules, and makes ownership
history harder to audit. Transfers must move the same `ItemInstance`, not
replace it.

### Instance everything

Represent every item, including ore and wood, as an `ItemInstance`.

Rejected because high-volume resources and basic materials are interchangeable.
Instancing every unit would create unnecessary storage, query, networking, and
inventory complexity without gameplay value.

## Consequences

Positive:

- Supports durability, quality, enchantments, crafted signatures, bindings, and
  unique items.
- Gives Auction House a safe object lock and claim model.
- Gives Equipment a concrete object identity.
- Allows WorldItem, Mail, Bank, Guild Storage, Housing, and Craft Orders to
  share one object movement model.
- Preserves efficient stacks for resources and materials.
- Gives DevTools a single object history to inspect.

Negative:

- Requires a new ItemInstance Runtime foundation before safe Auction MVP 1.
- Requires hybrid inventory reads and UI representation.
- Requires migration or compatibility work for existing equipment and craft
  outputs.
- Requires careful transaction boundaries around object and currency movement.

## Impact

### Inventory

Inventory becomes hybrid:

- stack rows for interchangeable goods;
- `ItemInstance` objects for non-stackable goods where
  `containerType = INVENTORY`.

### Equipment

Equipment must reference `ItemInstance` for weapons, armor, shields, jewelry,
and durable tools. Stack rows cannot be equipped.

### Loot

Loot generation must decide whether the result is a stack quantity or a new
`ItemInstance`. Resource loot remains stackable by default; unique drops and
equipment drops create instances.

### WorldItem

`WorldItem` represents physical map presence. Stackable drops can remain
`Item + quantity`; unique world drops reference one `ItemInstance`.

### Craft

Crafting consumes stackable inputs from inventory stacks. Unique inputs are
reserved or consumed as `ItemInstance`. Equipment outputs create
`ItemInstance` with craftedBy/provenance.

### Economy

Economy remains currency-only. It records bronze movement and ledger entries.
Object transfers correlate with economic transactions but are not owned by the
Economy domain.

### Auction

Auction MVP 1 lists exactly one tradable non-stackable `ItemInstance`.
Stackable commodity listings require a future design.

### Bank

Bank storage can hold both stacks and `ItemInstance` objects. Bank currency uses
Economy Wallets, not inventory money items.

### Mail

Mail can transport stackable goods and `ItemInstance` attachments if allowed by
binding and policy. Mail must not duplicate attached objects.

### Guild Storage

Guild storage can hold shared stacks and eligible `ItemInstance` objects.
Soulbound and personal quest objects are rejected by default.

### Housing

Housing can store or place decorations. Placed, named, damaged, signed, or
limited decorations use `ItemInstance`.

## Security Notes

This decision touches item duplication, ownership, market transfers, claims,
equipment validity, and admin correction.

Required rules:

- one `ItemInstance` exists only once;
- one `ItemInstance` has one current state and one current container;
- listed, mailed, banked, equipped, or craft-reserved objects cannot be spent or
  moved through another flow;
- stale clicks and replayed commands must not duplicate or resurrect objects;
- admin corrections must be authorized and audited;
- client UI cannot declare object ownership or transfer completion.

## Performance Notes

Stackable high-volume resources remain stack-based to avoid excessive
`ItemInstance` volume.

`ItemInstance` reads must be paginated for inventories, banks, mailboxes,
auction queries, guild storage, and DevTools. History/audit reads must also be
paginated and filtered by owner, item template, container, transaction
correlation, and time window.

Hot transfer transactions should lock only the affected object, source
container, destination container, and linked Economy records when currency is
involved.

## Roadmap

Runtime V2 is complete as of 2026-06-29.

Implemented in order:

1. ItemInstance Runtime foundation — `f17dc15`
2. CharacterEquipment Preparation — `b2048ee`
3. WorldItem Preparation — `1c07e7d`
4. Inventory Hybrid — `f37265b`, `626ed6f`, `e07e9d6`, `2f7c736`
5. Equipment Runtime V2 (In Progress) — `b8ac4a6`
6. WorldItem Hybrid — `e07e9d6`, `2f7c736`, `941b30b`
7. Loot Hybrid — `0f4edf3`
8. Craft Hybrid — `521674a`
9. Auction House — `e04e4fe`
10. Bank — `0d6887c`
11. Mail — `370c001`, `23f4331`
12. Guild Storage — `6f0774a`, `eae8f79`
13. Housing — `8874ed4`, `f353b5f`
14. Trade — `772cc75`
15. ItemTransferService (all domains) — `941b30b`, plus subsequent domain commits

Remaining open work: Equipment Runtime V2 completion (TDs 002, 005, 006),
full append-only movement history (TD-007), stack support in Bank/Mail/Guild/Housing V2.

## Implementation Notes

**Enum names (final — Runtime V2 complete):**

`ItemInstanceState`:
`AVAILABLE | EQUIPPED | LOCKED | LISTED | SOLD_PENDING_CLAIM |
IN_WORLD | IN_MAIL | IN_BANK | IN_GUILD_STORAGE | IN_HOUSING | IN_TRADE |
IN_CRAFT_ORDER | DESTROYED | ARCHIVED`

`ItemInstanceContainerType`:
`INVENTORY | EQUIPMENT | WORLD | AUCTION | MAIL | BANK | GUILD_STORAGE |
HOUSING | TRADE | CRAFT_ORDER | NONE`

**`containerId` convention (complete — all 10 domains):**

| containerType | containerId value | ownerId changes? |
|---|---|---|
| `INVENTORY` | `characterId` | Never |
| `EQUIPMENT` | `characterId` | Never |
| `WORLD` | `worldItem.id` | Never |
| `AUCTION` | `auctionListing.id` | On `CLAIM_BUYER` only |
| `MAIL` | `mail.id` | On `CLAIM_MAIL` only |
| `BANK` | `characterId` | Never |
| `GUILD_STORAGE` | `guild.id` | On `WITHDRAW_GUILD` only |
| `HOUSING` | `house.id` | On `WITHDRAW_HOUSE` only |
| `TRADE` | `tradeSession.id` | On `TRADE_COMMIT` only |
| `CRAFT_ORDER` | `craftOrder.id` | Not yet implemented |
| `NONE` (ARCHIVED) | `null` | Never |

**`ItemTransferService` — state machine (20 transitions):**

All mutations of `state`, `containerType`, `containerId`, and `ownerId` on any
`ItemInstance` pass exclusively through `ItemTransferService.transfer()`.
No domain service mutates these fields directly.

`ItemTransferService`:
- never opens a transaction (caller's `EntityManager` is mandatory);
- acquires a pessimistic write lock on every call (`SELECT FOR UPDATE`);
- validates `(state, containerType, containerId)` before any mutation;
- throws `BadRequestException` on any pre-condition violation.

`ItemMaterializationService`:
- is the only authorized creator of `ItemInstance` rows;
- never opens a transaction (caller's `EntityManager` is mandatory);
- sets `createdBySource` on every created instance;
- enforces I1 atomically in the `INSTANCE+WORLD` path by linking
  `WorldItem` and `ItemInstance` within the same transaction.

**Invariant enforcement summary (Runtime V2):**

- I1: pessimistic lock + pre-condition validation on every transition. Zero
  direct mutations detected outside `ItemTransferService` and
  `ItemMaterializationService`.
- I2: no delete, no UUID change. Only soft-archival via `ARCHIVED/NONE`.
- I3: `createdBySource` column on `ItemInstance` (migration
  `1783468800000-AddCreatedBySourceToItemInstance`), written by
  `ItemMaterializationService` at creation.
- I4: `ownerId` unchanged across 15 transitions; changes only on 5 legal
  ownership transfers (CLAIM_BUYER, CLAIM_MAIL, WITHDRAW_GUILD,
  WITHDRAW_HOUSE, TRADE_COMMIT).

## Open Questions

- Should commodity stack markets be designed as Auction House V2 or as a
  separate market model?
- Append-only movement history structure for full DevTools and forensics audit
  (TD-007 — deferred to ItemInstance Runtime hardening).
- Which current seeded items should be migrated to `objectMode = INSTANCE` for
  Equipment V2 activation?

## Related Files

- docs/08_Gameplay/object-runtime-architecture.md
- docs/08_Gameplay/item-taxonomy.md
- docs/08_Gameplay/economy-foundation.md
- docs/08_Gameplay/auction-house-specifications.md
- docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md
- docs/01_Architecture/adr/ADR-0007-auction-house-authority.md
