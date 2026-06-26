# Settlement / Economy Architecture Draft

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/ROADMAP.md, STATUS.md, CLAUDE.md, docs/00_Project/domains.md, docs/00_Project/glossary.md, docs/08_Gameplay/README.md, docs/08_Gameplay/crafting-runtime.md, docs/06_Database/schema.md, docs/07_Admin/mmorpg-studio.md, docs/01_Architecture/adr/README.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document proposes a future architecture for a Settlement and Economy
system.

It is documentation only. It does not describe implemented behavior unless
explicitly marked as existing project context. It does not create database
tables, migrations, services, controllers, gateways, endpoints, runtime classes,
or Studio modules.

The current Creature Runtime and Player Runtime work in progress is outside
this document. This draft must not interfere with files related to
`CreatureRuntime`, `PlayerRuntime`, `RuntimeDebugRegistry`,
`DebugModifierRegistry`, `RuntimeInspector`, `EntityRuntime`, or ADR-0004.

## 1. Resume

The Settlement / Economy system should be introduced as a server-authoritative
Runtime domain crossing Gameplay, Entities, Persistence, Identity, Networking,
and Studio.

The system covers:

- settlements, buildings, workshops, and auction houses;
- NPC workers tied to professions such as blacksmith, weaver, carpenter, and
  alchemist;
- craft orders placed by players, public orders, and future guild orders;
- ingredient deposits, partial contributions, production time, costs, and order
  states;
- fixed-price sales, timed auctions, optional buyout, expiration, seller
  returns, and secure item/currency transfers;
- tax rules, treasury storage, treasury transactions, and future building
  upgrades or service unlocks.

The core rule is simple and non-negotiable: the client sends intentions only.
The server validates ownership, funds, inventory, item locks, order state,
auction state, permissions, deadlines, taxes, and all transfers inside
transactional boundaries.

Economy operations must be treated as high-risk because they mutate scarce
assets. Any object or currency movement must be exactly-once at the domain
level: no duplicate claim, no duplicate refund, no double bid settlement, no
double auction purchase, and no repeated craft completion payout.

## 2. Domaines concernes

| Domaine | Impact |
|---|---|
| Gameplay | Defines settlement services, craft order lifecycle, auction rules, tax rules, production delays, and future reputation/governance. |
| Entities | Introduces positioned world entities such as Settlement, Building, Workshop, AuctionHouse, and NPCWorker. Also distinguishes non-positioned business records. |
| Persistence | Requires new tables, constraints, transactions, indexes, idempotency keys, audit rows, and eventually migrations. |
| Identity | Resolves player ownership, seller/buyer identity, guild authority later, admin permissions, and audit actor identity. |
| Networking | Exposes player intentions through HTTP or WebSocket APIs, returns paginated server views, and avoids global broadcasts. |
| DevTools / Studio | Observes settlements, treasuries, orders, auctions, taxes, and audit flows through Runtime APIs. It does not implement business rules. |
| Economy | Candidate new sub-domain for currency, item escrow, auction settlement, tax flow, and treasury accounting. |
| Settlement | Candidate new sub-domain for settlements, buildings, services, upgrades, local treasury, and future governance. |

Recommended split:

- `Settlement` owns cities, buildings, services, upgrades, governance, and
  local configuration.
- `Economy` owns money movement, item escrow, auctions, taxes, treasury
  transactions, and economic audit.
- `Crafting` stays responsible for recipes and item production rules. Settlement
  craft orders call into Crafting rules instead of duplicating them.

## 3. Architecture fonctionnelle proposee

### Settlement

A Settlement is a city or village. It groups buildings, services, tax rules,
treasury, and future governance.

Core responsibilities:

- identify a settlement by stable id, name, map, and optional world position or
  zone;
- own buildings and service unlocks;
- hold one treasury;
- select active tax rules;
- provide contextual services such as workshops or auction house access.

Open design point: a Settlement may be a positioned world entity, a map-level
administrative zone, or both. For the first implementation, a positioned city
center plus server-side service records is enough.

### Building

A Building is a settlement structure. Some buildings are world-positioned
entities, such as a forge or auction hall. Some future building records may only
represent an abstract service level.

Core responsibilities:

- expose service type: workshop, auction house, treasury, town hall, storage;
- expose level, status, enabled state, and upgrade state;
- reference its settlement;
- optionally expose `mapId`, `worldX`, and `worldY` when placed in the world.

### Workshop

A Workshop is a building service that receives craft orders.

Core responsibilities:

- connect one building to one or more professions;
- define capacity, production speed, enabled recipes, and future worker slots;
- receive player, public, and future guild orders;
- delegate actual recipe validation to the existing Crafting model.

The existing `CraftingStationTemplate` / `CraftingStation` model is relevant
but should not be reused blindly as the complete order system. Stations support
immediate player craft near a placed station. Workshops support delayed,
escrow-backed, NPC or public production orders.

### CraftOrder

A CraftOrder is a durable business record, not necessarily a world entity.

Order types:

- player-to-NPC order;
- public order;
- future guild order.

Ingredient modes:

- all ingredients supplied by the requester;
- no ingredients supplied, production cost covers procurement;
- partial contribution by requester or contributors;
- later: guild/shared inventory contributions.

Lifecycle proposal:

```text
draft
-> submitted
-> awaiting_ingredients
-> funded
-> queued
-> in_progress
-> completed
-> claimed
```

Alternative terminal states:

```text
cancelled
expired
failed
refunded
```

Server rules:

- only the server can move an order between states;
- ingredients and money must move into escrow when submitted or contributed;
- completion must atomically consume escrow and create output;
- claim/refund must be idempotent;
- cancellation rules must be explicit by state to avoid abusive cancellation
  after work has started.

### AuctionListing

An AuctionListing is an escrow-backed sale record.

Listing modes:

- fixed price direct sale;
- timed auction with start price, current bid, duration, optional buyout.

Lifecycle proposal:

```text
draft
-> active
-> sold
-> expired
-> cancelled
-> settled
```

Server rules:

- item is moved into escrow before listing becomes active;
- seller cannot sell, trade, destroy, equip, or relist the escrowed item;
- direct buyout atomically transfers item to buyer, currency minus taxes to
  seller, and tax to treasury;
- auction bid atomically locks buyer funds, refunds previous bidder, and updates
  current bid;
- expiration and settlement must be idempotent;
- seller return if unsold must happen once.

### TaxRule

A TaxRule defines how fees are calculated for a settlement service.

Initial tax types:

- direct sale tax;
- successful auction tax;
- optional listing/deposit fee;
- future workshop fee or production fee.

Tax calculation should use integer arithmetic and explicit rounding rules.
Percent values should be stored in basis points to avoid floating point drift.

### Treasury

A Treasury stores settlement-owned currency.

It should not be represented only as a mutable balance. Every balance change
must correspond to a `TreasuryTransaction`.

Uses:

- collect taxes;
- fund building work;
- unlock services;
- pay future maintenance;
- support future governance spending.

### TreasuryTransaction

A TreasuryTransaction is the audit ledger for the treasury.

It records:

- source operation type;
- source operation id;
- amount;
- direction;
- actor when applicable;
- before/after balance if accepted by the final accounting model;
- idempotency key.

This is the economic audit backbone for settlement funds.

### BuildingUpgrade

A BuildingUpgrade represents requested, active, completed, or cancelled
improvements to a settlement building.

It may consume treasury funds and future materials. It should be transactional
with treasury spending and building level updates.

### NPC profession / worker

NPC professions should be modeled separately from individual workers.

Suggested concepts:

- `Profession`: blacksmith, weaver, carpenter, alchemist, future jobs;
- `NPCWorker`: a positioned or assigned entity with a profession, level,
  availability, and attached workshop;
- `WorkshopProfession`: which professions a workshop can host.

For Phase 1, a profession key on the workshop/order may be enough. Individual
NPC workers can wait until visible NPCs or worker scheduling are needed.

## 4. Modele relationnel candidat

No migration should be written yet. Names below are candidate table names.

### `settlement`

Role: stores a city or settlement.

Main columns:

- `id` UUID primary key;
- `key` stable unique slug;
- `name`;
- `map_id`;
- optional `world_x`, `world_y` for city center;
- `status` such as `active`, `disabled`, `ruined`;
- `created_at`, `updated_at`.

Relations:

- one settlement has many buildings;
- one settlement has one treasury;
- one settlement has many tax rules.

Constraints:

- unique `key`;
- valid status enum;
- if positioned, `map_id`, `world_x`, and `world_y` must be consistent.

Probable indexes:

- unique index on `key`;
- index on `map_id`;
- optional spatial lookup index on `(map_id, world_x, world_y)`.

Transactional risks:

- low direct risk, but settlement disabling must not leave active listings or
  orders in an undefined state.

### `settlement_building`

Role: stores settlement buildings and service-bearing structures.

Main columns:

- `id` UUID primary key;
- `settlement_id`;
- `key`;
- `building_type`;
- `service_type`;
- `level`;
- `status`;
- `enabled`;
- optional `map_id`, `world_x`, `world_y`;
- `created_at`, `updated_at`.

Relations:

- many buildings belong to one settlement;
- one building may have one workshop;
- one building may represent one auction house;
- one building has many upgrades.

Constraints:

- unique `(settlement_id, key)`;
- `level >= 1`;
- valid status and type enums.

Probable indexes:

- `(settlement_id, building_type)`;
- `(settlement_id, service_type)`;
- `(map_id, world_x, world_y)` for Studio/world lookup.

Transactional risks:

- disabling a building must coordinate with active orders/listings;
- upgrades must lock the building row before changing level or status.

### `workshop`

Role: stores workshop service configuration.

Main columns:

- `id` UUID primary key;
- `settlement_building_id`;
- `profession_key`;
- `capacity`;
- `production_speed_bps` or similar integer multiplier;
- `enabled`;
- `created_at`, `updated_at`.

Relations:

- one workshop belongs to one building;
- one workshop receives many craft orders;
- future: one workshop has many workers or profession slots.

Constraints:

- unique `(settlement_building_id, profession_key)`;
- `capacity >= 0`;
- `production_speed_bps > 0`.

Probable indexes:

- `(profession_key, enabled)`;
- `(settlement_building_id)`.

Transactional risks:

- capacity checks need locking or deterministic queue assignment to avoid
  overbooking concurrent submissions.

### `craft_order`

Role: stores delayed production orders.

Main columns:

- `id` UUID primary key;
- `order_number` unique readable identifier;
- `order_type` such as `player`, `public`, `guild`;
- `status`;
- `requester_character_id`;
- optional `guild_id`;
- `settlement_id`;
- `workshop_id`;
- `profession_key`;
- `recipe_id`;
- `quantity`;
- `currency_cost`;
- `currency_escrowed`;
- `production_started_at`;
- `production_ready_at`;
- `completed_at`;
- `claimed_at`;
- `cancelled_at`;
- `version`;
- `created_at`, `updated_at`.

Relations:

- many orders belong to one workshop and one settlement;
- one order has many contributions;
- one order references requester character;
- one order references a crafting recipe.

Constraints:

- valid state transitions enforced by service logic;
- `quantity > 0`;
- `currency_cost >= 0`;
- terminal timestamps must match terminal states;
- optimistic `version` or row locks for state changes.

Probable indexes:

- `(requester_character_id, status)`;
- `(workshop_id, status, production_ready_at)`;
- `(settlement_id, status, created_at)`;
- `(status, production_ready_at)` for completion jobs;
- unique `order_number`.

Transactional risks:

- duplicate submission;
- duplicate completion;
- duplicate claim;
- cancellation racing with completion;
- contribution racing with order start;
- insufficient inventory/currency after stale client view.

### `craft_order_contribution`

Role: stores item or currency contributions to an order.

Main columns:

- `id` UUID primary key;
- `craft_order_id`;
- `contributor_character_id`;
- `contribution_type` such as `item` or `currency`;
- optional `item_id`;
- `quantity`;
- `currency_amount`;
- `escrow_inventory_id` or future item instance reference;
- `status` such as `escrowed`, `consumed`, `refunded`;
- `created_at`, `updated_at`.

Relations:

- many contributions belong to one craft order;
- each contribution references contributor character;
- item contributions reference item catalog or future item instance.

Constraints:

- positive quantity or amount;
- exactly one contribution payload type;
- cannot refund after consumed;
- idempotent consume/refund marker.

Probable indexes:

- `(craft_order_id, status)`;
- `(contributor_character_id, status)`;
- `(item_id)`.

Transactional risks:

- partial contribution overfill;
- duplicate refund;
- contributor inventory changed during contribution;
- future item instance uniqueness if individual items become unique.

### `auction_listing`

Role: stores item listings and auction lifecycle.

Main columns:

- `id` UUID primary key;
- `settlement_id`;
- `seller_character_id`;
- `item_id` or future `item_instance_id`;
- `quantity`;
- `listing_type` such as `fixed_price` or `auction`;
- `status`;
- `start_price`;
- `fixed_price`;
- `buyout_price`;
- `current_bid_amount`;
- `current_bid_id`;
- `expires_at`;
- `sold_at`;
- `settled_at`;
- `cancelled_at`;
- `version`;
- `created_at`, `updated_at`.

Relations:

- many listings belong to one settlement;
- one listing has many bids;
- current bid references one auction bid;
- seller references character.

Constraints:

- active listing must have escrowed item;
- `quantity > 0`;
- direct sale requires fixed price;
- auction requires start price and expiration;
- buyout price, if present, must be >= start price;
- only one terminal settlement.

Probable indexes:

- `(settlement_id, status, expires_at)`;
- `(settlement_id, listing_type, status, created_at)`;
- `(seller_character_id, status)`;
- `(status, expires_at)` for expiration job;
- `(item_id, status)` for search/filter.

Transactional risks:

- direct buy racing with bid;
- buyout racing with expiration;
- cancellation racing with purchase;
- duplicate item return;
- duplicate settlement;
- seller attempting to list an item already escrowed.

### `auction_bid`

Role: stores auction bids and locked bidder funds.

Main columns:

- `id` UUID primary key;
- `auction_listing_id`;
- `bidder_character_id`;
- `amount`;
- `status` such as `active`, `outbid`, `won`, `refunded`, `cancelled`;
- `created_at`;
- `refunded_at`;

Relations:

- many bids belong to one listing;
- bid references bidder character.

Constraints:

- `amount > 0`;
- amount must beat current bid according to minimum increment;
- one listing can have only one active current bid in domain logic;
- bidder cannot be seller unless explicitly allowed later, recommended no.

Probable indexes:

- `(auction_listing_id, amount DESC)`;
- `(auction_listing_id, created_at)`;
- `(bidder_character_id, status)`.

Transactional risks:

- concurrent bids with stale current bid;
- previous bidder refund failure;
- bid funds locked twice;
- replayed bid request.

### `tax_rule`

Role: stores settlement tax policy.

Main columns:

- `id` UUID primary key;
- `settlement_id`;
- `tax_type`;
- `rate_bps`;
- optional `flat_amount`;
- `enabled`;
- `starts_at`;
- optional `ends_at`;
- `created_at`, `updated_at`.

Relations:

- many tax rules belong to one settlement.

Constraints:

- `rate_bps >= 0`;
- upper bound for rates, for example `rate_bps <= 10000`;
- no overlapping enabled rules for same settlement and tax type unless priority
  is explicitly modeled.

Probable indexes:

- `(settlement_id, tax_type, enabled)`;
- `(starts_at, ends_at)`.

Transactional risks:

- tax rule changing while sale settles. Settlement should snapshot the applied
  rule id and computed amount into the economic transaction.

### `treasury`

Role: stores current treasury balance per settlement.

Main columns:

- `id` UUID primary key;
- `settlement_id`;
- `currency_balance`;
- `version`;
- `created_at`, `updated_at`.

Relations:

- one treasury belongs to one settlement;
- one treasury has many treasury transactions.

Constraints:

- unique `settlement_id`;
- `currency_balance >= 0` unless debt is explicitly designed later.

Probable indexes:

- unique `(settlement_id)`.

Transactional risks:

- lost updates on concurrent tax deposits or upgrade spending;
- balance mismatch if transaction row and balance update are not atomic.

### `treasury_transaction`

Role: durable audit ledger for settlement treasury movements.

Main columns:

- `id` UUID primary key;
- `treasury_id`;
- `settlement_id`;
- `direction` such as `credit` or `debit`;
- `amount`;
- `reason`;
- `source_type`;
- `source_id`;
- optional `actor_user_id`;
- optional `actor_character_id`;
- `idempotency_key`;
- `created_at`.

Relations:

- many transactions belong to one treasury;
- source may reference listing, order, upgrade, or admin adjustment by type/id.

Constraints:

- `amount > 0`;
- unique `idempotency_key`;
- valid source type.

Probable indexes:

- `(treasury_id, created_at DESC)`;
- `(settlement_id, source_type, source_id)`;
- unique `(idempotency_key)`.

Transactional risks:

- ledger row written without balance update;
- balance update without ledger row;
- duplicate settlement tax deposit.

### `building_upgrade`

Role: stores planned or active building upgrades.

Main columns:

- `id` UUID primary key;
- `settlement_building_id`;
- `target_level`;
- `status`;
- `currency_cost`;
- `started_at`;
- `ready_at`;
- `completed_at`;
- `cancelled_at`;
- `created_at`, `updated_at`.

Relations:

- many upgrades belong to one building;
- upgrades spend treasury funds through treasury transactions.

Constraints:

- one active upgrade per building;
- `target_level` must be greater than current building level at start;
- `currency_cost >= 0`.

Probable indexes:

- `(settlement_building_id, status)`;
- `(status, ready_at)`.

Transactional risks:

- double spending treasury funds;
- upgrade completion racing with cancellation;
- building level updated twice.

### `npc_worker` or `profession_worker`

Role: future model for NPC workers assigned to workshops.

Main columns:

- `id` UUID primary key;
- `settlement_id`;
- optional `settlement_building_id`;
- optional `workshop_id`;
- `profession_key`;
- `name`;
- `level`;
- `status`;
- optional `map_id`, `world_x`, `world_y`;
- `created_at`, `updated_at`.

Relations:

- worker belongs to settlement;
- worker may be assigned to a workshop;
- future worker may be a visible NPC entity.

Constraints:

- valid profession key;
- `level >= 1`;
- assignment rules must prevent the same worker being active in two workshops.

Probable indexes:

- `(settlement_id, profession_key, status)`;
- `(workshop_id, status)`;
- `(map_id, world_x, world_y)` if visible.

Transactional risks:

- worker assignment racing with production scheduling;
- worker disabled while orders are in progress.

## 5. RuntimeEntity candidates

| Candidate | Type | Rationale |
|---|---|---|
| `SettlementRuntimeEntity` | Potential world entity or aggregate root | True world entity only if the settlement has a visible center, bounds, or selectable city object. Otherwise it is a business aggregate. |
| `BuildingRuntimeEntity` | True positioned world entity when placed | Buildings with `mapId/worldX/worldY` should follow entity positioning conventions. Abstract service buildings are business records. |
| `WorkshopRuntimeEntity` | Usually service record, optionally entity through its building | A workshop may not need its own position if the building is positioned. |
| `AuctionHouseRuntimeEntity` | Usually service record, optionally entity through its building | The auction house UI can be opened from a building/NPC. Listings are records, not world entities. |
| `NPCWorkerRuntimeEntity` | True world entity if visible/interactive | Future visible NPC workers should be entities. Early profession capacity can stay as records. |
| `CraftOrderRuntimeRecord` | Business record | Not positioned, no world lifecycle. It has an economic lifecycle and should be inspectable. |
| `AuctionListingRuntimeRecord` | Business record | Not positioned. The listed item is in escrow; listing is economic state. |
| `TreasuryRuntimeRecord` | Business record | Not positioned. It is an accounting aggregate. |
| `TreasuryTransactionRuntimeRecord` | Audit record | Immutable economic event. |

Rule of thumb:

- if players can see, click, locate, or path to it in the world, model it as a
  positioned entity;
- if it is a ledger, order, listing, bid, or policy, model it as a business
  record exposed to Studio through inspectors, not as a world entity.

## 6. RuntimeSource candidates

These are future sources of economic state changes. They are not code proposals
for the current Runtime work in progress.

| Source | Responsibility |
|---|---|
| Database source | Rehydrate settlements, buildings, active orders, active listings, tax rules, and treasury balances on server start. |
| Scheduled expiration source | Finds expired listings and expired orders and moves them to terminal states idempotently. |
| Auction settlement source | Settles sold listings, successful auctions, outbid refunds, seller payouts, buyer item delivery, and taxes. |
| Production completion source | Completes craft orders whose production time has elapsed and prepares claimable output. |
| Admin / Studio source | Allows secured debug/admin actions such as force expiration or inspect settlement state. Must be audited and never bypass domain rules. |
| Tax calculation source | Resolves active tax rule and produces immutable tax calculation details at settlement time. |
| Treasury accounting source | Appends treasury transaction rows and updates balance atomically. |

Scheduled sources must be restart-safe. A server restart must not lose an
auction expiration, craft completion, refund, or treasury deposit. Jobs should
scan persisted due rows instead of relying only on in-memory timers.

## 7. Studio / DevTools integration

The Studio observes and triggers through Runtime APIs. It must not contain
auction, order, tax, treasury, or item-transfer logic.

Expected SDK capabilities:

- visualize settlement and building objects on the map;
- inspect building service state;
- inspect workshop queues and craft order details;
- inspect auction listings and bid history with pagination;
- inspect treasury balance and treasury transaction ledger;
- inspect active tax rules and applied tax details;
- view economic audit events by source id;
- force expiration or completion only in secured debug/admin mode;
- validate settlement configuration: missing treasury, missing tax rule,
  disabled building with active orders, invalid profession mappings.

Debug/admin actions:

- must require server-side admin authorization;
- must be recorded in audit logs;
- must call Runtime service methods that enforce state transitions;
- must never edit rows directly from the Studio;
- must never rely on hidden UI buttons as permission control.

Production LiveOps should be narrower than DevTools. For example, forcing an
auction expiration may be acceptable for local debugging but should require a
stronger permission and audit trail in production.

## 8. ADR a proposer

The following durable decisions likely deserve ADRs before implementation:

1. `ADR Settlement System Boundaries`
   - Decide whether Settlement and Economy are new sub-domains, how they depend
     on Crafting, and what the server authority boundary is.

2. `ADR Economy Transaction Model`
   - Define item/currency escrow, exactly-once transfers, idempotency keys,
     transaction boundaries, and audit ledger guarantees.

3. `ADR Auction House Authority and Concurrency`
   - Define bid locking, buyout concurrency, expiration, settlement,
     previous-bidder refunds, and replay protection.

4. `ADR City Treasury and Tax Flow`
   - Define tax calculation, treasury balance updates, ledger rows, rounding,
     and relationship between settlement policy and economic operations.

5. `ADR Craft Orders Lifecycle`
   - Define delayed production, contribution escrow, cancellation/refund rules,
     public orders, and future guild order compatibility.

6. `ADR Settlement World Entity Classification`
   - Decide which settlement concepts are positioned world entities and which
     are business records.

No ADR should be written or marked accepted without explicit human validation.

## 9. Roadmap

### Phase 0 - architecture documentaire

- Review and validate this draft.
- Decide whether to create a dedicated `docs/08_Gameplay/settlement-model.md`
  and `docs/08_Gameplay/economy-model.md`.
- Select ADRs to write.
- Clarify if Settlement and Economy become explicit domains in
  `docs/00_Project/domains.md`.

### Phase 1 - modele DB minimal

- Design migrations for settlements, buildings, treasury, tax rules, and the
  minimum records needed for craft orders or auction listings.
- Define transaction helpers and idempotency conventions before data mutation.
- Do not expose public gameplay endpoints until escrow and audit are designed.

### Phase 2 - craft orders internes

- Implement internal craft orders without public listing UI.
- Support requester-provided ingredients and currency escrow.
- Support production delay and completion job.
- Support claim/refund idempotency.
- Reuse existing Crafting recipe validation where possible.

### Phase 3 - auction house minimal

- Implement fixed-price listing first.
- Add item escrow, buy, seller payout, and unsold return.
- Add server-side pagination and filters from the start.
- Add auction bid mode only after fixed-price transfers are stable.

### Phase 4 - taxes + treasury

- Apply direct sale and successful auction tax.
- Add deposit fee only if design validates its gameplay role.
- Write treasury transactions atomically with sale/order settlement.
- Expose audit views for economic flows.

### Phase 5 - Studio inspection

- Add SDK adapters/capabilities for settlement buildings, treasury, orders, and
  listings.
- Add inspect-only panels first.
- Add secured debug actions after audit and authorization are in place.

### Phase 6 - upgrades ville / batiments

- Add building upgrade records.
- Spend treasury funds transactionally.
- Add service unlocks and capacity changes.
- Add validation reports for broken settlement configuration.

### Phase 7 - gouvernance future

- Add guild orders, settlement roles, permissions, voting, treasury spending
  policy, reputation, or ownership rules only after the economy model is stable.

## 10. Risques securite

Mandatory question:

```text
Que se passe-t-il si le client est entierement modifie par un utilisateur malveillant ?
```

Answer:

Nothing economically authoritative should happen unless the server validates and
commits it. A malicious client may send arbitrary requests such as impossible
bids, forged seller ids, fake item ids, negative prices, repeated buyout calls,
stale order completion claims, fake admin commands, or modified settlement ids.
The server must treat every payload as hostile.

Required protections:

- authenticate every request;
- resolve player character from server identity, not client-provided ownership;
- verify item ownership before escrow;
- lock or version inventory/currency rows during transfer;
- reject negative, zero, overflow, NaN-like, or out-of-range economic values;
- use integer currency only;
- validate listing/order state at mutation time, not only when displayed;
- enforce idempotency for submit, cancel, refund, bid, buyout, settle, expire,
  complete, and claim operations;
- prevent seller from bidding on own auction unless explicitly designed;
- prevent item reuse while escrowed;
- prevent replay from duplicating payout or item delivery;
- authorize every admin/debug action server-side;
- write audit rows for sensitive operations.

Threat examples:

- Modified client calls `buyout` twice: the second call must see terminal state
  or an idempotency record and perform no second transfer.
- Modified client bids lower than current bid: server rejects after locking the
  listing or checking current state in a transaction.
- Modified client claims an order before ready time: server checks persisted
  state and time.
- Modified client cancels an order after production started: server applies
  state-specific cancellation policy.
- Modified client sends someone else's `characterId`: server ignores or rejects
  client ownership fields and resolves actor from JWT/session.
- Modified Studio UI triggers force expiration: server checks admin role,
  permission, environment, target state, and records audit.

## 11. Risques performance

Auction houses and public orders can become high-volume tables.

Required performance rules:

- server-side pagination is mandatory for listings, bids, craft orders,
  treasury transactions, and audit logs;
- never broadcast global auction/order list updates to all clients;
- prefer targeted invalidation events such as "listing changed" for subscribers
  in a settlement or UI view;
- filter and sort queries must have explicit indexes;
- expiration jobs must process batches with limits;
- jobs must be idempotent and resumable;
- avoid N+1 loading for listing item details, seller names, bid summaries, and
  order ingredients;
- archive or partition old economic records if volume requires it later;
- keep listing search separate from world movement broadcasts.

Index-sensitive queries:

- active listings by settlement, status, expiry, item type, and price;
- active auctions expiring before now;
- craft orders ready before now;
- player's own orders and listings;
- bidder's active bids;
- treasury ledger by settlement and time;
- economic audit by source operation id.

Transaction risks:

- long transactions during large list queries must be avoided;
- settlement jobs should claim due rows in small batches;
- bid and buyout paths should lock the listing row and relevant escrow/funds
  rows only for the shortest possible time;
- tax calculation should snapshot applied rule details into transaction records
  to avoid later ambiguity.

## 12. Ce qui ne doit pas etre implemente maintenant

Do not implement now:

- no application code;
- no TypeORM entities;
- no migrations;
- no controllers;
- no gateways;
- no services;
- no endpoints;
- no Runtime classes;
- no Studio panels;
- no schema changes;
- no seed data;
- no commit without explicit human validation.

This draft is intentionally architectural. Implementation must wait for ADR
selection and human approval.

## 13. Questions ouvertes

- Should Settlement and Economy be added as first-class project domains in
  `docs/00_Project/domains.md`?
- Is currency currently represented only implicitly, or should a dedicated
  wallet/ledger model be introduced before auctions?
- Does the current `Inventory` model support escrow safely, or is an item
  instance model required before secure auctions?
- Are auction durations fixed by design, for example 8h and 16h, or
  configurable per settlement/building?
- Can every settlement have its own auction house inventory, or is there a
  global market?
- Should direct sale tax and auction tax be paid by seller, buyer, or split?
- Are deposit fees refundable when unsold?
- Does a public craft order pay a worker, a contributor, the settlement, or all
  three?
- When are partial contributions refundable?
- Should production continue during server downtime by comparing timestamps, or
  should downtime pause production?
- Which operations require LiveOps in production versus DevTools in development
  only?
- How will future guild ownership and settlement governance authorize spending?

## 14. Proposition de fichiers docs a creer ou modifier

Candidate documentation changes after human review:

- create `docs/08_Gameplay/settlement-model.md` for game-design concepts;
- create `docs/08_Gameplay/economy-model.md` for auction, tax, treasury, and
  escrow rules;
- create one or more ADRs listed in section 8;
- optionally update `docs/00_Project/domains.md` to add Economy and Settlement
  if validated as durable domains;
- optionally update `docs/00_Project/glossary.md` with Settlement, Treasury,
  CraftOrder, AuctionListing, and TaxRule after terminology is validated;
- eventually update `docs/06_Database/schema.md` only after entities/migrations
  exist or after a dedicated candidate-schema document is approved.

This file itself is a candidate Phase 0 architecture artifact:

- `docs/08_Gameplay/settlement-economy-architecture.md`

## 15. Proposition de commit

Candidate commit message if this documentation-only change is validated:

```text
docs(settlement): proposer l'architecture du systeme de ville et d'economie
```

No commit should be created without explicit human approval.

