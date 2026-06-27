# Settlement System - MVP Slicing

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-27
- Depends on: docs/08_Gameplay/settlement-economy-architecture.md, docs/08_Gameplay/settlement-economy-review.md, docs/08_Gameplay/settlement-gameplay-loops.md, docs/08_Gameplay/settlement-specifications.md
- Used by: Project owner, developers, game design, conversational assistants, repository-aware coding agents

## Scope

This document slices the future Settlement System into small MVPs that can be
implemented one by one without disrupting the existing Runtime.

It is documentation only. It does not implement entities, migrations, services,
controllers, gateways, Studio modules, tests, or UI. File paths below are
probable future implementation locations, not changes made by this document.

## 1. Slicing principles

The Settlement System must not begin with the full fantasy of cities,
governors, caravans, banks, and wars. The smallest safe path is:

```text
Decisions
└── Persistence foundation
    └── Fixed-price Auction House
        └── Timed auction
            └── Taxes and treasury
                └── Minimal private craft order
                    └── Studio inspection
                        └── Buildings and upgrades
```

Rules:

- every MVP must leave the Runtime playable if disabled;
- every MVP must be server-authoritative;
- every MVP must have explicit tests before commit;
- no MVP may rely on client-side trust;
- no MVP may hide unresolved economy risk behind UI constraints;
- each MVP must be releasable behind a feature flag or inactive route surface
  if the implementation chooses feature flags later.

## 2. Smallest useful MVP

The smallest useful MVP is not an auction house and not a complete city.

The smallest useful MVP is **MVP 1: persistence foundation for Settlement and
Economy Core**, after MVP 0 decisions. It gives future features a safe place to
represent:

- one settlement;
- one building/service shell;
- one economic account concept;
- one escrow or lock concept;
- one idempotency concept;
- one audit/ledger concept.
- one official currency unit model.

Reason:

- craft orders need escrow and idempotency;
- fixed-price listings need item escrow and account movement;
- timed auctions need bid holds and job recovery;
- taxes need treasury/ledger;
- Studio needs inspectable state;
- building upgrades need treasury and service state.

Implementing Craft Order first without Economy Core would recreate the exact
duplication and recovery risks identified in the RFC review.

The next gameplay MVP after that foundation is **Auction MVP 1: fixed-price
Auction House**. CraftOrder, Buildings, Workshops, full Treasury, and advanced
taxes are not the current priority.

All monetary MVPs use the official ADR-0006 currency model:

- bronze is the indivisible unit;
- `1 silver = 100 bronze`;
- `1 gold = 10 000 bronze`;
- server and database values use bronze-only fields such as `priceBronze`,
  `buyoutPriceBronze`, `currentBidBronze`, `amountBronze`, and
  `balanceBronze`;
- split business fields such as `priceGold`, `priceSilver`, and `priceBronze`
  together are forbidden;
- future persistence should use PostgreSQL `BIGINT` or an equivalent 64-bit
  integer type for monetary values.

## 3. MVP dependency graph

```text
MVP 0 - Documentation and decisions
└── MVP 1 - Minimal DB and Economy Core
    ├── MVP 3 - Fixed-price Auction House
    │   └── MVP 4 - Timed auctions
    │       └── MVP 5 - Taxes + Treasury
    │           ├── MVP 6 - Studio inspection
    │           └── MVP 7 - Buildings / Upgrades
    └── MVP 2 - Minimal Craft Order
        └── MVP 6 - Studio inspection
```

Hard dependencies:

- MVP 1 depends on MVP 0 decisions.
- MVP 2 depends on MVP 1 escrow/idempotency/account foundation.
- MVP 3 depends on MVP 1 item escrow/account movement.
- MVP 4 depends on MVP 3 listing model and MVP 1 job/idempotency foundation.
- MVP 5 depends on MVP 1 ledger/account model and at least one taxable flow
  from MVP 3 or MVP 4.
- MVP 6 depends on the features it inspects.
- MVP 7 depends on MVP 5 treasury spending and MVP 1 building shell.

Soft dependencies:

- MVP 2 can ship after MVP 1, but it is intentionally deferred while Auction
  House is the current priority.
- MVP 5 can ship after MVP 3 or MVP 4, but the current Auction track places it
  after timed bids so taxes do not block market proof.
- MVP 6 can begin as read-only after MVP 1, but meaningful inspection starts
  after MVP 2 or MVP 3.

## 4. MVP 0 - Documentation and decisions

### Objective

Validate the architectural decisions required before implementation.

### Out of scope

- application code;
- database migrations;
- endpoints;
- Studio UI;
- gameplay balancing numbers.

### Probable files

- `docs/08_Gameplay/settlement-*.md`;
- `docs/01_Architecture/adr/ADR-NNN-economy-core-accounts-and-ledger.md`;
- `docs/01_Architecture/adr/ADR-NNN-item-identity-and-escrow.md`;
- `docs/01_Architecture/adr/ADR-NNN-economic-idempotency-and-job-recovery.md`;
- `docs/01_Architecture/adr/ADR-NNN-settlement-service-availability.md`.

### Probable tables

None.

### Probable endpoints/events

None.

### Server validations

None, except documentation review against existing authority rules.

### Required transactions

None.

### Minimum tests

None. Documentation review only.

### Risks

- accepting broad design without locking the economy foundation;
- skipping ADRs and implementing ad hoc escrow later.

### Done criteria

- ADRs to write are selected;
- Economy Core decisions are explicit;
- item identity strategy is selected;
- job recovery/idempotency strategy is selected;
- this MVP slicing is accepted as the implementation sequence.

### Before commit checklist

- `git status --short` reviewed;
- only documentation files staged;
- no Runtime file staged;
- no ADR marked accepted without human validation;
- commit message is documentation-scoped.

## 5. MVP 1 - Minimal DB and Economy Core

### Objective

Create the minimal persistence foundation that all later Settlement features
need. This MVP should not expose player-facing gameplay yet.

### Out of scope

- craft order gameplay;
- auction listings;
- timed jobs beyond a minimal job/idempotency skeleton if chosen;
- tax calculation;
- Studio panels;
- building upgrades;
- governance.

### Probable files

- `apps/api-gateway/src/settlements/entities/settlement.entity.ts`;
- `apps/api-gateway/src/settlements/entities/settlement-building.entity.ts`;
- `apps/api-gateway/src/economy/entities/economic-account.entity.ts`;
- `apps/api-gateway/src/economy/entities/economic-ledger-entry.entity.ts`;
- `apps/api-gateway/src/economy/entities/escrow-hold.entity.ts`;
- `apps/api-gateway/src/economy/entities/idempotency-record.entity.ts`;
- `apps/api-gateway/src/settlements/settlements.module.ts`;
- `apps/api-gateway/src/economy/economy.module.ts`;
- future migration under `apps/api-gateway/src/migrations/`.

### Probable tables

- `settlement`;
- `settlement_building`;
- `economic_account`;
- `economic_ledger_entry`;
- `escrow_hold`;
- `idempotency_record`.

### Probable endpoints/events

Prefer no public endpoints in MVP 1.

Optional admin-only read endpoints later:

- `GET /settlements`;
- `GET /settlements/:id`;
- `GET /economy/accounts/:id/ledger` for admin/debug only.

No WebSocket broadcast needed.

### Server validations

- settlement key uniqueness;
- building belongs to settlement;
- economic account owner type is valid;
- ledger `amountBronze` is positive and fits the monetary bounds;
- escrow hold has exactly one asset purpose;
- idempotency key is scoped by actor and operation;
- no negative currency balance unless future debt is explicitly enabled.

### Required transactions

- account creation with initial ledger entry if an opening balance exists;
- escrow hold creation with balance/item lock;
- ledger entry append with balance update if balances are stored;
- idempotency record claim and operation result write.

### Minimum tests

- entity/module build tests;
- account cannot go negative;
- ledger append creates expected balance effect;
- duplicate idempotency key returns same operation result or rejects safely;
- escrow hold cannot be consumed and released;
- settlement/building uniqueness constraints.

### Risks

- overbuilding a full bank before gameplay needs it;
- implementing balances without ledger reconciliation;
- creating Economy Core coupled to Studio or Runtime stat systems;
- relying on TypeORM `synchronize` behavior instead of reviewed migrations for
  production readiness.

### Done criteria

- minimal settlement and economy entities exist;
- migration reviewed if migrations are used;
- no public gameplay feature exposed;
- economy invariants have tests;
- feature is inert unless explicitly used by later MVPs.

### Before commit checklist

- `git status --short`;
- migration reviewed and named clearly;
- no unrelated Runtime files staged;
- targeted backend tests run;
- build or relevant compile check run;
- `git diff --cached --name-only` contains only MVP 1 files.

## 6. MVP 2 - Minimal Craft Order without advanced NPCs

### Objective

Allow a player to create a private craft order using an existing recipe, reserve
required ingredients/currency, wait for a simple production delay, and claim the
output once.

### Out of scope

- public orders;
- partial contributions;
- multiple artisans;
- visible NPC workers;
- worker skill simulation;
- guild orders;
- interruption by destroyed buildings;
- Studio write actions.

### Probable files

- `apps/api-gateway/src/settlements/entities/workshop.entity.ts`;
- `apps/api-gateway/src/settlements/entities/craft-order.entity.ts`;
- `apps/api-gateway/src/settlements/entities/craft-order-contribution.entity.ts`;
- `apps/api-gateway/src/settlements/entities/craft-order-output.entity.ts`;
- `apps/api-gateway/src/settlements/craft-orders.service.ts`;
- `apps/api-gateway/src/settlements/craft-orders.controller.ts`;
- `apps/api-gateway/src/settlements/dto/create-craft-order.dto.ts`;
- tests colocated with service/controller.

### Probable tables

- `workshop`;
- `craft_order`;
- `craft_order_contribution`;
- `craft_order_output`;
- reuse `escrow_hold`;
- reuse `idempotency_record`;
- reuse `economic_ledger_entry` only if service fee exists.

### Probable endpoints/events

Probable HTTP:

- `POST /settlements/:settlementId/craft-orders`;
- `GET /settlements/:settlementId/craft-orders/me`;
- `GET /craft-orders/:id`;
- `POST /craft-orders/:id/cancel`;
- `POST /craft-orders/:id/claim`.

Business events:

- `CraftOrderCreated`;
- `IngredientsReserved`;
- `CraftOrderQueued`;
- `CraftStarted`;
- `CraftCompleted`;
- `CraftOrderClaimed`;
- `CraftOrderCancelled`.

No broad WebSocket broadcast. Optional narrow invalidation later.

### Server validations

- authenticated character ownership;
- settlement exists and is active;
- workshop exists, enabled, and supports recipe profession/station type;
- recipe exists and is enabled;
- requested quantity within limits;
- requester owns required ingredients;
- ingredients are not equipped, locked, or already escrowed;
- idempotency key prevents double submission;
- claim requester owns the order;
- completed output can be claimed once.

### Required transactions

- create order and escrow ingredients atomically;
- transition queued/in-progress/completed with state re-read;
- completion consumes holds and creates output once;
- cancellation releases eligible holds once;
- claim transfers output once.

### Minimum tests

- create order with valid ingredients;
- reject missing ingredients;
- reject wrong owner;
- reject duplicate idempotency key double-create;
- cancel before production releases escrow;
- complete due order creates one output;
- double completion does not duplicate output;
- claim once succeeds, second claim fails or returns idempotent result;
- server restart scenario represented by persisted `readyAt` and due completion
  test if job logic exists.

### Risks

- accidentally duplicating existing immediate CraftingService behavior;
- treating workshop as CraftingStation without delayed order semantics;
- consuming ingredients before the order is safely persisted;
- building public-order complexity too early.

### Done criteria

- private craft order happy path works server-side;
- cancellation before production is safe;
- completion and claim are idempotent;
- no public contribution feature exists yet;
- existing immediate crafting runtime still works.

### Before commit checklist

- `git status --short`;
- only MVP 2 files staged;
- no Runtime Claude files staged;
- targeted craft-order tests pass;
- existing crafting tests run if touched;
- no public-order code included;
- commit summary names Craft Order MVP.

## 7. MVP 3 / Auction MVP 1 - Auction House fixed price only

### Objective

Allow a player to list an owned item at a fixed price, allow another player to
buy it directly, and allow seller return if unsold/cancelled by policy.

### Out of scope

- timed bidding;
- buyout competing with bids;
- taxes, unless MVP 5 has already shipped;
- deposit fees;
- regional markets;
- black markets;
- Studio management actions.

### Probable files

- `apps/api-gateway/src/settlements/entities/auction-listing.entity.ts`;
- `apps/api-gateway/src/settlements/auction-house.service.ts`;
- `apps/api-gateway/src/settlements/auction-house.controller.ts`;
- `apps/api-gateway/src/settlements/dto/create-fixed-listing.dto.ts`
  carrying `priceBronze` or `buyoutPriceBronze`;
- `apps/api-gateway/src/settlements/dto/buy-listing.dto.ts`;
- tests colocated with service/controller.

### Probable tables

- `auction_listing`;
- reuse `escrow_hold`;
- reuse `economic_account`;
- reuse `economic_ledger_entry`;
- reuse `idempotency_record`.

### Probable endpoints/events

Probable HTTP:

- `POST /settlements/:settlementId/auction-house/listings`;
- `GET /settlements/:settlementId/auction-house/listings`;
- `GET /auction-house/listings/:id`;
- `POST /auction-house/listings/:id/buy`;
- `POST /auction-house/listings/:id/cancel`;
- `POST /auction-house/listings/:id/claim-return` if returns are claim-based.

Business events:

- `AuctionCreated`;
- `AuctionPublished`;
- `BuyoutAccepted` or `FixedPricePurchaseAccepted`;
- `AuctionSettled`;
- `SellerItemReturned`;
- `AuctionCancelled`;
- `AuctionArchived`.

Realtime:

- optional narrow `listing_changed { listingId, settlementId, version }`.

### Server validations

- seller owns listed item;
- item is tradable and not equipped/locked/escrowed;
- quantity and `priceBronze` or `buyoutPriceBronze` are valid;
- auction monetary values are bronze-only and never split into
  `priceGold`/`priceSilver`/`priceBronze` columns;
- buyer is authenticated and not seller unless allowed;
- buyer has available funds;
- listing is active at buy time;
- listing version/state rechecked inside transaction;
- seller cannot cancel after sale starts.

### Required transactions

- create listing and escrow item atomically;
- buy listing: lock listing, debit buyer, transfer item, credit seller, mark
  listing settled;
- cancel listing: lock listing, return escrow once, mark cancelled;
- idempotency for create, buy, cancel, and claim-return.

### Minimum tests

- create fixed listing with owned item;
- reject listing with invalid `priceBronze` or split denomination payload;
- reject equipped or missing item;
- buy listing transfers item and funds once;
- double click buy does not duplicate item or charge twice;
- seller cannot buy own listing if policy forbids it;
- seller cannot cancel after buyer purchase starts;
- paginated listing query works;
- no global broadcast required.

### Risks

- current inventory stack model may be too weak for unique items;
- insufficient ownership checks in existing inventory paths;
- fixed listing accidentally becoming global market;
- N+1 item/seller lookup in listing pages.

### Done criteria

- one local settlement can host fixed-price listings;
- item escrow prevents duplicate sale;
- buyer/seller transfer is exactly-once;
- listing query is paginated;
- timed auction concepts remain absent.

### Before commit checklist

- `git status --short`;
- only MVP 3 files staged;
- no timed auction code included;
- service tests cover double-buy;
- pagination test included;
- inventory ownership assumptions documented if unresolved.

## 8. MVP 4 / Auction MVP 2 - Timed auctions

### Objective

Extend Auction House with timed bidding, current winning bid, optional buyout,
expiration, winning settlement, and losing-bid refunds.

### Out of scope

- regional auctions;
- black markets;
- complex anti-sniping extensions unless selected;
- tax changes beyond MVP 5 integration;
- advanced price history analytics.

### Probable files

- `apps/api-gateway/src/settlements/entities/auction-bid.entity.ts`;
- `apps/api-gateway/src/settlements/auction-expiration.service.ts`;
- `apps/api-gateway/src/settlements/dto/place-bid.dto.ts` carrying
  `amountBronze`;
- update auction-house service/controller tests.

### Probable tables

- `auction_bid`;
- possibly `economic_job` if job abstraction is selected;
- reuse `auction_listing`;
- reuse `escrow_hold`;
- reuse `idempotency_record`;
- reuse `economic_ledger_entry`.

### Probable endpoints/events

Probable HTTP:

- `POST /auction-house/listings/:id/bids`;
- `POST /auction-house/listings/:id/buyout`;
- `GET /auction-house/listings/:id/bids` with pagination/visibility policy.

Scheduled/business events:

- `BidPlaced`;
- `BidOutbid`;
- `BuyoutAccepted`;
- `AuctionExpired`;
- `AuctionSettled`.

### Server validations

- listing type is timed auction;
- listing active and not expired;
- bidder is eligible and not seller unless policy allows;
- bid `amountBronze` beats `currentBidBronze` by required increment;
- bidder funds available and locked;
- previous bidder refund path is safe;
- buyout beats bids only if state transition wins;
- expiration uses server time.

### Required transactions

- place bid: lock listing, lock bidder account, create bid hold in bronze,
  release/mark previous bid hold, update `currentBidBronze`;
- buyout: lock listing, close bidding, release losing bids, settle purchase;
- expiration: claim listing, settle winner or return item, mark terminal;
- job claiming for expiration must be idempotent.

### Minimum tests

- first bid accepted;
- low bid rejected;
- concurrent bid simulation leaves one current winner;
- previous bidder refunded once;
- buyout racing with bid has one winner;
- expiration with no bids returns item;
- expiration with bid settles winner;
- rerunning expiration job has no second transfer;
- server restart/due auction represented by persisted `expiresAt`.

### Risks

- concurrency bugs under simultaneous bids;
- stuck bid holds;
- clock drift if not server-time based;
- job duplicate execution;
- expensive bid history queries.

### Done criteria

- timed auction can run from publication to settlement;
- bid funds are locked and released safely;
- expiration is restart-safe;
- fixed-price MVP remains stable.

### Before commit checklist

- `git status --short`;
- only MVP 4 files staged;
- concurrent bid tests pass;
- expiration idempotency tests pass;
- fixed-price regression tests pass;
- no regional/black-market features included.

## 9. MVP 5 / Auction MVP 3 - Taxes + Treasury

### Objective

Apply bounded taxes/fees to settlement economic activity and credit them to a
settlement treasury with auditable ledger entries.

### Out of scope

- governor-controlled tax editing;
- elections;
- treasury spending on upgrades if MVP 7 not started;
- loans, debt, and banks;
- complex tax brackets.

### Probable files

- `apps/api-gateway/src/settlements/entities/tax-rule.entity.ts`;
- `apps/api-gateway/src/settlements/entities/treasury.entity.ts`;
- `apps/api-gateway/src/settlements/entities/treasury-transaction.entity.ts`;
- `apps/api-gateway/src/settlements/tax.service.ts`;
- `apps/api-gateway/src/settlements/treasury.service.ts`;
- update craft/auction settlement flows.

### Probable tables

- `tax_rule`;
- `treasury`;
- `treasury_transaction`;
- reuse `economic_account`;
- reuse `economic_ledger_entry`.

### Probable endpoints/events

Probable HTTP:

- `GET /settlements/:id/tax-rules`;
- `GET /settlements/:id/treasury`;
- `GET /settlements/:id/treasury/transactions` authorized/paginated.

Business events:

- `TaxCollected`;
- `TreasuryCredited`;
- `TreasuryDebited`;
- `TreasuryTransactionReversed`.

### Server validations

- tax type supported;
- tax rate within cap;
- flat fee `amountBronze` within cap;
- combined tax does not silently exceed gross;
- treasury exists for settlement;
- transaction source is valid;
- no negative treasury balance unless future debt enabled;
- tax policy snapshot applied at settlement time.

### Required transactions

- sale settlement includes seller payout and treasury credit atomically;
- craft service fee includes treasury credit if enabled;
- treasury transaction and balance update are atomic;
- reversal creates offset entry rather than silent edit.

### Minimum tests

- fixed sale collects configured tax;
- tax cap enforced;
- negative tax rejected;
- overflow amount rejected;
- treasury credited once;
- rerun settlement does not credit tax twice;
- treasury transaction pagination;
- reversal leaves audit trail.

### Risks

- treating taxes as a currency sink when they are treasury transfer;
- treasury hoarding without future sinks;
- tax changes affecting already active listings incorrectly;
- admin adjustments without audit.

### Done criteria

- at least fixed-price sale tax flows to treasury;
- ledger/audit is visible to authorized read path;
- tax math is bounded and deterministic;
- no governance UI or edit policy required.

### Before commit checklist

- `git status --short`;
- only MVP 5 files staged;
- tax math tests pass;
- auction/craft regression tests pass for affected flows;
- no governor/election features included.

## 10. MVP 6 - Studio inspection

### Objective

Expose read-only inspection for Settlement, Craft Orders, Auction Listings,
Treasury, Tax Rules, and economic audit state through the Studio/DevTools
architecture.

### Out of scope

- Studio business logic;
- direct row editing;
- production LiveOps force actions unless separately approved;
- visual building editor;
- automation batch actions.

### Probable files

- client Studio SDK adapters under `apps/client/src/studio/sdk/...`;
- DevTools modules under `apps/client/src/components/DevTools/modules/...`;
- backend read endpoints if not already present;
- tests for adapters, providers, and API clients.

### Probable tables

No new tables if MVPs 1-5 already exist.

### Probable endpoints/events

Read endpoints:

- `GET /settlements/:id/summary`;
- `GET /settlements/:id/craft-orders`;
- `GET /settlements/:id/auction-listings`;
- `GET /settlements/:id/treasury/transactions`;
- `GET /settlements/:id/economy/audit`.

Optional narrow realtime invalidation:

- `settlement_changed`;
- `craft_order_changed`;
- `listing_changed`;
- `treasury_changed` for authorized viewers only.

### Server validations

- authenticated user;
- admin/devtools role for privileged details;
- public summaries omit private actor data;
- pagination required;
- filters bounded;
- no Studio route bypasses domain services.

### Required transactions

None for read-only inspection.

### Minimum tests

- SDK adapter maps Settlement objects correctly;
- private order details hidden from unauthorized user;
- treasury ledger hidden or redacted for normal player;
- pagination enforced;
- invalidation event does not include full sensitive payload;
- Studio action providers do not mutate domain state.

### Risks

- leaking private bids/order data;
- adding business decisions to Studio;
- using global broadcasts;
- exposing debug force actions in production.

### Done criteria

- Studio can inspect settlement economy state read-only;
- no mutation actions shipped;
- sensitive views are role-checked server-side;
- pagination and redaction are tested.

### Before commit checklist

- `git status --short`;
- only MVP 6 files staged;
- client tests for adapters/providers pass;
- backend read authorization tests pass;
- no force/modify actions included unless explicitly approved.

## 11. MVP 7 - Buildings / Upgrades

### Objective

Make buildings and upgrades affect settlement services in a limited, auditable
way: capacity, availability, and upgrade state.

### Out of scope

- governance voting;
- elections;
- conquest and siege damage;
- player housing;
- city-wide politics;
- caravan unlocks unless later MVP.

### Probable files

- `apps/api-gateway/src/settlements/entities/building-upgrade.entity.ts`;
- `apps/api-gateway/src/settlements/buildings.service.ts`;
- `apps/api-gateway/src/settlements/building-upgrades.service.ts`;
- `apps/api-gateway/src/settlements/dto/start-building-upgrade.dto.ts`;
- update workshop/auction capacity logic;
- Studio read updates if MVP 6 exists.

### Probable tables

- `building_upgrade`;
- maybe `settlement_building` extensions if not complete in MVP 1;
- reuse `treasury`;
- reuse `treasury_transaction`;
- reuse `economic_ledger_entry`.

### Probable endpoints/events

Probable HTTP:

- `GET /settlements/:id/buildings`;
- `POST /settlements/:id/buildings/:buildingId/upgrades`;
- `POST /settlements/:id/buildings/:buildingId/upgrades/:upgradeId/cancel` if
  allowed.

Business events:

- `BuildingPlanned`;
- `BuildingConstructionStarted`;
- `BuildingActivated`;
- `BuildingUpgraded`;
- `BuildingDegraded`;
- `BuildingDisabled`.

### Server validations

- actor authorized for city spending;
- treasury has funds;
- building exists and is eligible;
- target level is valid;
- prerequisites met;
- only one active upgrade per building;
- active orders/listings have defined policy if service availability changes.

### Required transactions

- start upgrade: lock treasury, debit funds, create treasury transaction, create
  upgrade;
- complete upgrade: lock building and upgrade, apply level/capacity changes;
- cancel upgrade: apply refund policy exactly once if cancellation allowed.

### Minimum tests

- start upgrade debits treasury once;
- cannot start if treasury empty;
- cannot run two active upgrades for same building;
- completion updates service capacity;
- cancellation/refund policy tested;
- workshop capacity respects building level;
- disabled building blocks new orders/listings.

### Risks

- introducing governance before permissions exist;
- treasury spend duplication;
- building state invalidating active orders without policy;
- upgrades making economic loops runaway.

### Done criteria

- one building can be upgraded safely;
- upgrade has visible effect on capacity or availability;
- treasury spend is auditable;
- no election/governance/conquest logic included.

### Before commit checklist

- `git status --short`;
- only MVP 7 files staged;
- treasury spend tests pass;
- building state tests pass;
- existing craft/auction flows still pass;
- no governance or conquest code included.

## 12. Explicitly deferred systems

These systems must not enter MVP 0-7 except as documented future compatibility.

| System | Deferred until | Reason |
|---|---|---|
| Governance | After MVP 7 | Requires settlement roles, anti-grief rules, treasury permissions. |
| Elections | After governance ADR | Requires voting, eligibility, fraud prevention, term lifecycle. |
| Conquests | After building state and governance | Requires ownership transfer, war state, treasury protection. |
| Caravans | After local market + escrow + city storage | Requires cargo escrow, route risk, delivery settlement. |
| Banks | After Economy Core proves ledger/account model | Requires deposits, withdrawals, credit rules, maybe debt. |
| Inter-city trade | After local market and market locality ADR | Requires transport delay, import/export taxes, regional prices. |
| Black markets | After normal market security | Requires hidden visibility, contraband rules, audit exceptions. |

## 13. Recommended implementation order

Recommended order:

1. MVP 0 - documentation and ADR decisions.
2. MVP 1 - DB and Economy Core foundation.
3. MVP 3 / Auction MVP 1 - fixed-price Auction House.
4. MVP 4 / Auction MVP 2 - timed auctions.
5. MVP 5 / Auction MVP 3 - taxes + treasury.
6. MVP 2 - private Craft Order minimal.
7. MVP 6 - Studio inspection.
8. MVP 7 - buildings/upgrades.

Reason for placing Auction MVPs before CraftOrder and Buildings:

- the current implementation priority is Auction House;
- fixed-price sales prove item escrow, `priceBronze`, account movement, and
  idempotent purchase without bid concurrency;
- timed auctions then add `currentBidBronze`, outbid refunds, and persistent
  expiration;
- taxes and Treasury are intentionally delayed until the sale and bid transfer
  paths are proven.

Alternative order:

- MVP 2 can move earlier only if CraftOrder becomes the explicit priority
  again.
- MVP 5 can move before MVP 4 if city revenue matters more than timed bidding,
  but it must still use bronze-only monetary fields from ADR-0006.

## 14. Global checklist before coding

Before any implementation begins:

- confirm current Runtime work is complete or safely isolated;
- run `git status --short`;
- read `docs/ROADMAP.md`, `STATUS.md`, `CLAUDE.md`;
- read Settlement docs relevant to the MVP;
- identify ADRs that must be accepted before coding;
- decide whether the MVP is behind a feature flag or inert by default;
- list exact files expected to change;
- list files explicitly out of scope;
- identify data migration requirements;
- define rollback plan for migration if any;
- define ownership and permission checks;
- define idempotency keys for commands;
- define transaction boundaries;
- define minimum tests before editing code;
- confirm no Studio logic will implement Runtime rules;
- confirm no global WebSocket broadcast is needed.

## 15. Global checklist before commit

Before every MVP commit:

- run `git status --short`;
- review `git diff`;
- stage files explicitly by path;
- never use `git add .`;
- never use `git add -A`;
- run `git diff --cached --name-only`;
- confirm no unrelated Runtime files are staged;
- run targeted tests listed for the MVP;
- run build if the MVP touches shared compile paths;
- update documentation only if behavior or scope changed;
- include only one MVP per commit unless explicitly approved;
- use a French Conventional Commit message;
- do not push unless explicitly requested.

## 16. MVP completion matrix

| MVP | Can ship alone? | Player-visible? | Requires Economy Core? | Main proof |
|---|---|---|---|---|
| MVP 0 | Yes | No | No | Decisions accepted |
| MVP 1 | Yes | No | Creates it | Invariants tested |
| MVP 2 | Yes | Yes, limited | Yes | Craft order exactly-once |
| MVP 3 | Yes | Yes | Yes | Fixed sale exactly-once |
| MVP 4 | Yes after MVP 3 | Yes | Yes | One auction winner |
| MVP 5 | Yes after taxable flow | Partly | Yes | Tax ledger exactness |
| MVP 6 | Yes after inspected MVP | Dev/admin | No new core | Read-only safe inspection |
| MVP 7 | Yes after MVP 5 | Yes | Yes | Treasury-funded upgrade |
