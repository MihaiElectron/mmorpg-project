# Settlement System - Functional Specifications

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/08_Gameplay/settlement-economy-architecture.md, docs/08_Gameplay/settlement-economy-review.md, docs/08_Gameplay/settlement-gameplay-loops.md
- Used by: Project owner, game design, developers, conversational assistants, repository-aware coding agents

## Scope

This document is the functional specification for the future Settlement System.

It turns the gameplay loops into explicit lifecycle rules, state machines,
permissions, business events, invariants, edge cases, and integration points.
It does not define database tables, API routes, Runtime services, migrations,
controllers, gateways, Studio panels, or implementation code.

All future implementation must preserve the server-authoritative rule: the
client displays information and sends intentions only. Ownership, inventory,
currency, escrow, taxes, state transitions, production, auctions, and treasury
effects are validated by the server.

## 1. Core concepts

### Settlement

A settlement is a city-scale economic actor. It owns buildings, services,
tax policy, treasury resources, and future governance.

Functional responsibilities:

- host buildings and workshops;
- provide local market and auction services;
- collect taxes and service fees;
- spend treasury funds on construction, maintenance, and future policies;
- expose economic state to authorized players, Studio, and future governance.

### Workshop

A workshop is a settlement service that transforms inputs into goods through a
profession. It can process immediate future NPC work, queued craft orders, and
later player or guild contracts.

### Craft Order

A craft order is a request for production. It can be private, public, or future
guild-owned. It may include supplied ingredients, missing ingredients, a reward,
and a production target.

### Auction

An auction is a market listing backed by item escrow. It can be fixed-price,
timed bidding, or timed bidding with optional buyout.

### Treasury

The treasury is the settlement-owned economic account. It receives taxes and
fees, and funds maintenance, construction, upgrades, and future policies.

## 2. Craft Order lifecycle

### 2.1 Lifecycle overview

```text
Draft
└── Submitted
    ├── Rejected
    └── WaitingIngredients
        ├── Cancelled
        ├── Expired
        └── ReadyToQueue
            └── Queued
                ├── Cancelled
                ├── Interrupted
                └── InProgress
                    ├── Interrupted
                    ├── Failed
                    └── Completed
                        ├── Claimed
                        ├── Expired
                        └── Archived
```

### 2.2 Creation

Creation begins when a player, future governor, future guild officer, or
authorized system source expresses an intention to create a craft order.

Creation rules:

- the requester must be identifiable;
- the target settlement and workshop must exist and be available;
- the recipe or requested output must be valid for the workshop profession;
- requested quantity must be positive and within per-player and per-city caps;
- reward, fee, and required ingredients must be visible before submission;
- creation in `Draft` does not reserve ingredients or currency.

### 2.3 Validation

Validation happens before an order becomes active.

Validation checks:

- requester permission;
- target workshop availability;
- recipe availability;
- profession compatibility;
- required skill or reputation if any;
- order limits;
- settlement service state;
- required currency and item availability if supplied at submission;
- tax and service fee policy snapshot;
- no negative or overflow value.

Failed validation moves the attempt to `Rejected` or leaves the draft unchanged.
Rejected orders have no gameplay effect.

### 2.4 Ingredient reservation

Ingredients and rewards are reserved only after validation.

Reservation rules:

- reserved items cannot be traded, sold, equipped, destroyed, consumed, or used
  in another order;
- reserved currency cannot be spent elsewhere;
- every reservation has a purpose and owner;
- partial contributions remain attributable to each contributor;
- over-contribution is rejected or returned immediately;
- reservations must be reversible until the order reaches a non-refundable
  state.

### 2.5 WaitingIngredients

`WaitingIngredients` means the order exists but lacks required inputs, funds,
or accepted contributors.

Allowed actions:

- requester may add missing ingredients;
- eligible players may contribute to public orders;
- requester may cancel if production has not started;
- contributors may withdraw only if the order rules allow withdrawal and the
  order is not locked for production.

Exit conditions:

- all required inputs present -> `ReadyToQueue`;
- requester cancels -> `Cancelled`;
- deadline passes -> `Expired`;
- workshop or city becomes invalid -> `Interrupted` or `Expired` depending on
  policy.

### 2.6 ReadyToQueue and Queued

`ReadyToQueue` means requirements are complete. `Queued` means the workshop has
accepted the order into its production queue.

Queue rules:

- queue priority is determined by order type, submission time, city policy, and
  future governance rules;
- public order contributors cannot withdraw once the order enters `Queued`,
  unless a city policy explicitly allows it;
- cancellation in `Queued` may charge a fee if it consumed workshop capacity;
- workshop saturation delays queue entry but does not duplicate orders.

### 2.7 Production

`InProgress` begins when the workshop reserves capacity and an artisan or NPC
worker starts production.

Production rules:

- required ingredients become locked for consumption;
- production duration is based on recipe, workshop level, profession quality,
  maintenance state, and optional city modifiers;
- output cannot exist before completion;
- worker or workshop unavailability can pause or interrupt production;
- production progress is server-side truth.

### 2.8 Completion

Completion creates claimable output and finalizes consumed inputs.

Completion rules:

- consumed ingredients cannot be refunded after successful completion;
- completed output belongs to the order result, not yet necessarily to the
  requester inventory;
- a completed order is immutable except claim, archival, and audit metadata;
- completion can trigger reward payout, tax collection, skill progression, or
  reputation changes according to future systems.

### 2.9 Cancellation

Cancellation is player- or administrator-initiated termination before normal
completion.

Cancellation policy by state:

| State | Requester cancellation | Contributor effect |
|---|---|---|
| Draft | Free, no effect | None |
| Submitted | Free if no reservation exists | None |
| WaitingIngredients | Allowed, reserved assets returned | Contributions returned |
| ReadyToQueue | Allowed with possible fee | Contributions returned or fee-adjusted |
| Queued | Policy-dependent | Contributions usually locked |
| InProgress | Usually denied or admin-only | Contributions consumed or resolved by policy |
| Completed | Denied | Claim path only |
| Claimed | Denied | Immutable |
| Archived | Denied | Immutable |

Cancellation must never create extra items or currency.

### 2.10 Interruption

Interruption is caused by world or settlement state, not normal player choice.

Possible causes:

- workshop disabled;
- building damaged or destroyed;
- settlement conquered or locked;
- NPC worker unavailable;
- city maintenance failure;
- world event or season rule;
- administrative freeze.

Interruption outcomes:

- pause and resume later;
- reassign to another compatible worker;
- refund and cancel;
- finish current batch but block new orders;
- move to dispute or admin resolution for exceptional cases.

### 2.11 Expiration

Expiration handles orders that are inactive too long.

Expiration rules:

- drafts may expire silently;
- incomplete public orders may expire and refund contributors;
- completed but unclaimed orders may move to long-term storage before archive;
- expiration must be based on server time;
- expiration never destroys reserved assets without a documented sink rule.

### 2.12 Recovery

Recovery handles restarts, crashes, and partial transitions.

Recovery rules:

- active orders resume from persisted state;
- due completions are processed once;
- interrupted orders remain visible and actionable;
- claimable outputs remain claimable;
- refund-pending orders continue refund processing;
- no order can complete twice.

### 2.13 Archiving

Archiving removes old orders from active gameplay views while preserving history.

Archive candidates:

- claimed completed orders;
- cancelled orders after refund;
- expired orders after refund or cleanup;
- failed orders after resolution.

Archived orders remain inspectable for audit and future support.

## 3. Auction lifecycle

### 3.1 Lifecycle overview

```text
Draft
└── Validating
    ├── Rejected
    └── Published
        ├── Cancelled
        ├── BuyoutPending
        │   └── Sold
        ├── Bidding
        │   ├── BidAccepted
        │   ├── BuyoutPending
        │   └── Expiring
        └── Expiring
            ├── UnsoldReturnPending
            └── SettlementPending
                └── Settled
                    └── Archived
```

### 3.2 Deposit

Deposit begins when the seller selects an item or item stack for sale.

Deposit rules:

- seller must own the item;
- item must be tradable;
- item must not be equipped, locked, bound, destroyed, already escrowed, or
  pending another transfer;
- quantity must be positive and available;
- listing fee and duration must be known;
- item is reserved before publication.

### 3.3 Validation

Validation checks:

- seller permission;
- item ownership;
- item tradability;
- settlement market availability;
- listing type validity;
- price bounds;
- duration bounds;
- tax and fee visibility;
- player listing limits;
- city listing limits.

Invalid listings are rejected and release any tentative reservation.

### 3.4 Publication

Publication makes the listing visible to eligible buyers.

Publication rules:

- published listing has item escrow;
- seller cannot consume or retrieve the item except through allowed cancel or
  expiration paths;
- price and duration are immutable after publication unless the auction type
  explicitly allows edit before first bid;
- tax rule snapshot is recorded for settlement.

### 3.5 Bidding

Bidding applies only to timed auctions.

Bid rules:

- bidder must not be seller unless explicitly allowed by future policy;
- bid must meet minimum price and increment;
- bid currency is reserved;
- previous active bidder is refunded or marked for refund;
- highest valid bid is the current winning bid;
- each accepted bid emits a business event.

Bid visibility:

- public views may show current price and time remaining;
- seller identity, bidder identity, or bid history visibility depends on
  market policy.

### 3.6 Buyout

Buyout immediately attempts to purchase the listing for a fixed amount.

Buyout rules:

- buyout must be available and not expired;
- buyer must have available funds;
- listing must still be published or bidding;
- buyout beats normal bids if accepted first by server state;
- all losing bid holds are released or refunded;
- seller payout, tax, and item delivery settle once.

### 3.7 Expiration

Expiration happens when the listing duration ends.

Expiration outcomes:

- no valid bid -> seller return;
- valid bid -> winner settlement;
- pending buyout already accepted -> buyout settlement wins;
- listing already cancelled or settled -> no effect.

Expiration must be restart-safe and idempotent.

### 3.8 Seller withdrawal

Seller withdrawal is retrieval by seller.

Allowed cases:

- draft listing;
- published fixed-price listing with no purchase in progress if policy allows;
- auction with no bid if policy allows;
- expired unsold listing;
- admin-resolved exceptional case.

Denied cases:

- listing with accepted buyout;
- auction with active winning bid unless policy explicitly allows cancellation
  with penalty before deadline;
- settled or archived listing.

### 3.9 Buyer withdrawal

Buyer withdrawal is retrieval by buyer after settlement.

Allowed cases:

- won auction pending claim;
- buyout delivered to market claim box;
- future remote purchase awaiting pickup.

Rules:

- buyer can claim once;
- unclaimed purchases remain in storage until expiration policy applies;
- claim must not depend on the seller being online.

### 3.10 Archiving

Listings archive after settlement, seller return, buyer claim, or final refund.

Archived auctions remain auditable:

- seller;
- winner if any;
- final price;
- tax;
- settlement;
- timestamps;
- exceptional admin actions.

## 4. State machines

### 4.1 CraftOrder states

| State | Meaning | Terminal |
|---|---|---|
| Draft | Local or server draft without reserved assets | No |
| Submitted | Creation intent accepted for validation | No |
| Rejected | Validation failed, no gameplay effect | Yes |
| WaitingIngredients | Missing inputs, funds, or contributors | No |
| ReadyToQueue | Requirements complete, waiting for queue | No |
| Queued | Accepted by workshop queue | No |
| InProgress | Production started | No |
| Interrupted | Production/order blocked by external condition | No |
| Completed | Output created, awaiting claim | No |
| Claimed | Output delivered and rewards resolved | Yes |
| Cancelled | Stopped by allowed actor | Yes after refunds |
| Expired | Deadline passed | Yes after refunds |
| Failed | Production failed by defined rule or admin resolution | Yes after resolution |
| Archived | Hidden from active views, retained for audit | Yes |

### 4.2 Auction states

| State | Meaning | Terminal |
|---|---|---|
| Draft | Seller is preparing listing | No |
| Validating | Listing is being checked | No |
| Rejected | Listing invalid, no active market effect | Yes |
| Published | Visible fixed-price listing | No |
| Bidding | Timed auction accepting bids | No |
| BidAccepted | Latest bid accepted; returns to Bidding | No |
| BuyoutPending | Buyout accepted, settlement running | No |
| Expiring | Expiration being resolved | No |
| UnsoldReturnPending | Item returning to seller | No |
| SettlementPending | Winner, seller, tax, and item transfer pending | No |
| Sold | Sale accepted but not fully archived | No |
| Settled | All transfers complete | Yes |
| Cancelled | Seller/admin cancellation accepted | Yes after returns |
| Archived | Hidden from active views, retained for audit | Yes |

### 4.3 Building states

| State | Meaning |
|---|---|
| Planned | Project exists but construction has not started |
| UnderConstruction | Resources or treasury committed, not yet usable |
| Active | Building services available |
| Degraded | Service available with penalties due to maintenance/damage |
| Disabled | Service unavailable but building remains recoverable |
| Upgrading | Active building has an upgrade in progress |
| Damaged | Building affected by event, war, or maintenance failure |
| Destroyed | Building no longer provides services |
| Retired | Removed from active gameplay but retained for history |

### 4.4 Workshop states

| State | Meaning |
|---|---|
| Offline | Workshop does not accept orders |
| Available | Workshop can receive eligible orders |
| Saturated | Queue or capacity is full |
| QueuedWork | Has pending accepted work |
| Producing | Has active production |
| Paused | Work is temporarily stopped |
| Blocked | Cannot work due to building, worker, or resource issue |
| Maintenance | Temporarily unavailable for upkeep |

### 4.5 TreasuryTransaction states

| State | Meaning |
|---|---|
| Proposed | Transaction intent exists but has no balance effect |
| Validated | Business rules accepted |
| Pending | Waiting for linked settlement operation |
| Applied | Balance and ledger effect complete |
| Reversed | Offset by a valid reversal event |
| Failed | Rejected or failed before balance effect |
| Archived | Retained for history and audit |

Treasury transactions should be append-only from a player-facing perspective.
Corrections use reversal events rather than silent edits.

## 5. Permissions

### 5.1 Actor categories

| Actor | Meaning |
|---|---|
| Player | Normal player controlling owned characters and items |
| NPC Artisan | Server-controlled worker attached to a profession/workshop |
| City | Settlement system actor applying policy, taxes, queues, and treasury rules |
| Administrator | Authorized operational actor for debug, support, or LiveOps |
| Future Governor | Settlement governance actor with policy and spending rights |

### 5.2 Craft Order permissions

| Action | Player | NPC Artisan | City | Administrator | Future Governor |
|---|---|---|---|---|---|
| Create private order | Yes | No | System orders only | Support only | Policy-dependent |
| Create public order | Yes if allowed | No | Yes for public works | Support only | Yes if authorized |
| Cancel own draft/waiting order | Yes | No | Policy expiry | Force with audit | Policy-dependent |
| Cancel in-progress order | Usually no | No | Event policy | Yes with audit | Rare, with policy |
| Contribute ingredients | Yes if eligible | No | No | Support only | Yes as player/guild actor |
| Withdraw contribution | Yes before lock | No | No | Support only | Policy-dependent |
| Start production | No | Yes through system | Queue authority | Force debug/admin | No direct |
| Complete production | No | Yes through system | System authority | Force debug/admin | No direct |
| Claim output | Requester/eligible owner | No | No | Support transfer only | If owner role allows |
| Inspect public order | Yes | Limited | Yes | Yes | Yes |
| Inspect private order | Owner/contributor | Assigned worker only | Yes | Yes | Authorized roles |

### 5.3 Auction permissions

| Action | Player | NPC Artisan | City | Administrator | Future Governor |
|---|---|---|---|---|---|
| Create listing | Yes with owned item | No | System listings future | Support only | As player or city policy |
| Cancel listing | Seller if allowed | No | Policy expiry | Yes with audit | Policy-dependent |
| Bid | Yes if eligible | No | No | Support only | As player/guild actor |
| Buyout | Yes if eligible | No | No | Support only | As player/guild actor |
| Claim purchase | Buyer | No | No | Support only | If buyer role allows |
| Claim unsold item | Seller | No | No | Support only | If seller role allows |
| Inspect public listing | Yes | No | Yes | Yes | Yes |
| Inspect hidden audit | No | No | Yes limited | Yes | Yes if authorized |
| Change market tax | No | No | Policy actor | Yes with audit | Yes if governance allows |

### 5.4 Building and treasury permissions

| Action | Player | City | Administrator | Future Governor |
|---|---|---|---|---|
| View active buildings | Yes | Yes | Yes | Yes |
| View treasury balance | Maybe public summary | Yes | Yes | Yes |
| View treasury ledger | No by default | Yes | Yes | Authorized |
| Start upgrade | No | If system policy | Yes with audit | Yes |
| Cancel upgrade | No | Policy-dependent | Yes with audit | Yes if allowed |
| Spend treasury | No | Maintenance/system only | Emergency with audit | Yes by policy |
| Change tax policy | No | No autonomous change | Yes with audit | Yes by policy |
| Disable building | No | Event/system only | Yes with audit | Yes if governance allows |

## 6. Business events

### 6.1 Event rules

Business events describe meaningful domain changes. They are not client
commands. They may be persisted for audit, used for notifications, or exposed
to Studio/Monitoring.

Event diffusion levels:

- `Private`: only involved players or authorized roles.
- `Settlement`: visible to local settlement subscribers.
- `Public`: visible in public activity feeds.
- `Studio`: visible to admin/devtools/monitoring.
- `None`: persisted only.

### 6.2 Craft events

| Event | Trigger | Consequences | Diffusion | Persistence |
|---|---|---|---|---|
| CraftOrderCreated | Valid order submitted | Order enters active lifecycle | Private/Studio | Required |
| CraftOrderRejected | Validation fails | No reservation remains | Private/Studio | Required for audit |
| IngredientsReserved | Items or funds reserved | Assets locked for order | Private | Required |
| IngredientsContributed | Contributor adds inputs | Order progress updates | Private/Settlement if public | Required |
| ContributionWithdrawn | Eligible contributor withdraws | Assets returned, progress reduced | Private | Required |
| CraftOrderQueued | Requirements complete and queue accepts | Workshop capacity reserved | Private/Studio | Required |
| CraftStarted | Production begins | Inputs locked for consumption | Private/Settlement optional | Required |
| CraftInterrupted | External condition blocks order | Order pauses or awaits resolution | Private/Studio | Required |
| CraftResumed | Interrupted order continues | Production timer resumes | Private/Studio | Required |
| CraftCompleted | Output created | Claim becomes available | Private/Settlement optional | Required |
| CraftOrderClaimed | Output delivered | Order becomes immutable/terminal | Private | Required |
| CraftOrderCancelled | Allowed actor cancels | Refund policy begins | Private/Studio | Required |
| CraftOrderExpired | Deadline passes | Refund or storage policy begins | Private/Studio | Required |
| CraftOrderArchived | Order leaves active views | History retained | None/Studio | Required |

### 6.3 Auction events

| Event | Trigger | Consequences | Diffusion | Persistence |
|---|---|---|---|---|
| AuctionCreated | Seller submits listing | Validation begins | Private/Studio | Required |
| AuctionRejected | Listing invalid | Item reservation released | Private/Studio | Required |
| AuctionPublished | Listing becomes visible | Market view updates | Settlement | Required |
| BidPlaced | Valid bid accepted | Current price/winner changes | Settlement/Private | Required |
| BidOutbid | New bid beats old bid | Previous bidder refunded or pending refund | Private | Required |
| BuyoutAccepted | Buyer accepts buyout | Listing closes to new bids | Settlement/Private | Required |
| AuctionExpired | Duration ends | Settlement or return begins | Settlement/Studio | Required |
| AuctionCancelled | Seller/admin cancels | Item return/refund begins | Settlement/Studio | Required |
| AuctionSettled | Transfers complete | Sale final | Private/Settlement | Required |
| SellerItemReturned | Unsold item returned | Seller can reclaim/use item | Private | Required |
| BuyerItemClaimed | Buyer retrieves purchase | Claim closed | Private | Required |
| AuctionArchived | Listing leaves active views | History retained | None/Studio | Required |

### 6.4 Settlement and treasury events

| Event | Trigger | Consequences | Diffusion | Persistence |
|---|---|---|---|---|
| TaxCollected | Taxable action settles | Treasury credit pending/applied | Private/Studio/Settlement summary | Required |
| TreasuryCredited | Funds enter treasury | Balance changes | Authorized/Studio | Required |
| TreasuryDebited | Funds spent | Balance changes | Authorized/Studio | Required |
| TreasuryTransactionReversed | Correction approved | Reversal event offsets prior entry | Authorized/Studio | Required |
| BuildingPlanned | Project accepted | Construction requirements visible | Settlement | Required |
| BuildingConstructionStarted | Funds/materials committed | Building unavailable until complete | Settlement | Required |
| BuildingActivated | Construction complete | Services become available | Settlement/Public optional | Required |
| BuildingDegraded | Maintenance/damage penalty starts | Service quality changes | Settlement/Studio | Required |
| BuildingDisabled | Service stops | Active orders/listings evaluated | Settlement/Studio | Required |
| BuildingUpgraded | Upgrade completes | Service capabilities change | Settlement/Public optional | Required |
| WorkshopSaturated | Capacity reached | New orders wait or reject | Studio/Settlement optional | Optional |
| WorkshopAvailable | Capacity recovers | Queue can progress | Studio/Settlement optional | Optional |

## 7. Critical invariants

### 7.1 Ownership invariants

- An item or item stack portion cannot be owned by two owners at the same time.
- Escrowed assets have one purpose and one final outcome.
- A player cannot sell, consume, equip, trade, or destroy an escrowed item.
- A buyer cannot claim the same purchased item twice.
- A seller cannot reclaim an item that has been sold.

### 7.2 Currency invariants

- No currency can be created outside approved sources.
- No currency can disappear except through approved sinks, fees, reversals, or
  maintenance rules.
- Currency amounts cannot be negative.
- Currency calculations cannot overflow allowed bounds.
- Every treasury balance change has a business reason.
- Taxes cannot exceed configured caps.

### 7.3 Craft invariants

- A craft order has one authoritative state.
- Production cannot start before requirements are complete.
- Ingredients cannot be both refunded and consumed.
- A completed craft order is immutable except claim/archive metadata.
- A craft output can be claimed once.
- A cancelled order cannot later complete.
- An archived order cannot re-enter active production.

### 7.4 Auction invariants

- A published listing has escrowed item ownership.
- An auction has at most one current winning bid.
- An auction has at most one winner.
- A listing cannot accept bids after terminal closure.
- Buyout and expiration cannot both settle different winners.
- Seller payout, buyer delivery, and tax collection are part of one sale result.
- Archived auctions are immutable except support annotations.

### 7.5 Building and treasury invariants

- A destroyed or disabled building cannot accept new normal work.
- Existing active work must have a defined policy when a building changes state.
- A workshop cannot exceed its defined capacity.
- Treasury spending cannot make balance negative unless debt is explicitly
  added by future rules.
- Building upgrades cannot skip prerequisite states.

## 8. Business rules

### 8.1 Craft order priority

Default priority order:

1. System safety resolutions and interrupted order recovery.
2. City public works if enabled by governance.
3. Private paid orders by queue timestamp.
4. Public orders by completion of requirements and reward priority.
5. Low-priority experimental or discounted orders.

Tie-breakers:

- older accepted queue time first;
- higher workshop compatibility first;
- future reputation or governor policy only within safe caps.

### 8.2 Tax calculation

Taxable basis:

- direct sale: final sale price;
- auction: final winning price or buyout price;
- deposit: listing duration and declared price if deposit exists;
- workshop order: service fee or reward if policy says so.

Tax rules:

- percent values use bounded basis points in future implementation;
- flat fees cannot exceed configured maximum;
- combined tax and fee cannot silently exceed transaction gross;
- tax policy is snapshotted when the taxable action settles;
- tax changes affect future actions, not already settled actions.

### 8.3 Auction duration

Allowed durations should be finite and explicit.

Initial design:

- short: 8 hours;
- standard: 16 hours;
- long future: 24 or 48 hours if market volume supports it.

Rules:

- duration starts at publication;
- expiration uses server time;
- last-minute bid extension is a future optional rule, not default;
- city policy may restrict available durations.

### 8.4 Workshop availability

A workshop is available only if:

- parent building is active or degraded but still serviceable;
- maintenance is not blocking production;
- profession is enabled;
- queue is not over capacity;
- required NPC or worker capacity exists if the order type requires it;
- settlement is not locked by event, war, or admin freeze.

### 8.5 Queues

Queue rules:

- queues are per workshop, not global;
- a city may expose a public summary of queue length;
- queue position should not be directly sellable unless future policy supports
  priority contracts;
- interrupted orders should not be unfairly pushed behind new orders.

### 8.6 Player limits

Suggested functional limits:

- max active craft orders per player;
- max public orders per player;
- max active auction listings per player;
- max active bids per player;
- cooldowns or fees for repeated cancellations;
- stronger limits for new or low-reputation accounts if abuse appears.

### 8.7 City limits

Suggested functional limits:

- max active workshops by building level;
- max queue size by workshop level;
- max active city projects;
- max tax rate by governance tier;
- max listing count by market building level;
- max treasury spend per period without governor/admin approval future.

## 9. Edge cases

### Server restart

Expected behavior:

- active orders remain in their last authoritative state;
- due production completions are processed once;
- due auction expirations are processed once;
- escrow remains locked until resolved;
- interrupted recovery tasks resume.

### Player deleted

Expected behavior:

- active assets are not silently destroyed;
- private orders move to support, refund, or archive policy;
- auctions continue, cancel, or settle by account policy;
- audit keeps historical actor identity.

### Player banned

Expected behavior:

- banned player cannot create new orders, bid, buyout, or claim if policy says
  freeze;
- active listings and orders follow moderation policy;
- assets remain accountable;
- admin resolution must be audited.

### Settlement destroyed or conquered

Expected behavior:

- new work may stop;
- active work follows building/service availability policy;
- treasury access may freeze or transfer by conquest rules;
- market claims remain resolvable;
- historical audit remains under original settlement identity.

### Building unavailable

Expected behavior:

- new orders rejected or routed elsewhere if policy allows;
- queued orders pause or move to interrupted state;
- in-progress orders pause, continue to finish, or fail according to building
  failure policy.

### Workshop saturated

Expected behavior:

- new orders enter waiting state or are rejected with visible reason;
- no order bypasses capacity without policy;
- saturation may increase local prices but not duplicate capacity.

### Empty treasury

Expected behavior:

- maintenance may fail;
- upgrades cannot start;
- public works cannot pay rewards;
- private player assets are not confiscated to fund the treasury unless future
  governance explicitly allows a tax event.

### Transaction rollback

Functional expectation:

- if a sale, claim, bid, refund, tax collection, or craft completion cannot
  fully resolve, no partial player-visible duplicate outcome remains;
- unresolved operations move to pending resolution, not silent success.

### Crash during production

Expected behavior:

- order resumes from last durable state;
- consumed ingredients are not consumed twice;
- output is not created twice;
- worker assignment is recovered or released.

### Crash during auction settlement

Expected behavior:

- one winner remains;
- losing bids are refunded once;
- seller is paid once;
- tax is credited once;
- item is delivered or remains in claimable pending state.

## 10. Future integrations

### Quests

Quests can create demand:

- deliver materials to city;
- craft specific goods;
- fund construction;
- restore damaged buildings.

Quest rewards must not bypass economy caps without design review.

### Reputation

Reputation can affect:

- listing limits;
- workshop fees;
- public order trust;
- access to rare city contracts;
- governance eligibility.

Reputation must not replace ownership or escrow validation.

### Guilds

Guild integration needs:

- guild economic accounts;
- guild storage;
- guild order permissions;
- guild auction/listing ownership;
- guild role checks.

### Housing

Housing can consume city materials and create local demand:

- furniture;
- decorations;
- storage upgrades;
- maintenance fees;
- neighborhood tax future.

### Caravans

Caravans use settlement economy as cargo source and destination:

- cargo escrow;
- route contract;
- guards;
- insurance;
- delivery settlement.

### Inter-city commerce

Inter-city commerce requires:

- market locality;
- transport delay;
- import/export taxes;
- regional price differences;
- route risk.

### World events and seasons

Events and seasons can modify:

- resource availability;
- food demand;
- port access;
- caravan risk;
- building maintenance costs;
- city project urgency.

### Wars and politics

War and politics can affect:

- building state;
- taxes;
- treasury access;
- trade route safety;
- siege damage;
- conquest ownership;
- emergency public orders.

Political decisions must be bounded by anti-grief rules.

## 11. Diagrams

### 11.1 CraftOrder state machine

```text
Draft
└── Submitted
    ├── Rejected
    └── WaitingIngredients
        ├── Cancelled
        ├── Expired
        └── ReadyToQueue
            └── Queued
                ├── Cancelled
                └── InProgress
                    ├── Interrupted
                    │   ├── Queued
                    │   └── Cancelled
                    ├── Failed
                    └── Completed
                        ├── Claimed
                        │   └── Archived
                        └── Expired
                            └── Archived
```

### 11.2 Auction state machine

```text
Draft
└── Validating
    ├── Rejected
    └── Published
        ├── Cancelled
        ├── Bidding
        │   ├── BidAccepted
        │   │   └── Bidding
        │   ├── BuyoutPending
        │   └── Expiring
        ├── BuyoutPending
        └── Expiring
            ├── UnsoldReturnPending
            └── SettlementPending
                └── Settled
                    └── Archived
```

### 11.3 Business flow for craft order

```text
Player intention
└── Order validation
    ├── Reject
    └── Reserve assets
        └── Wait for ingredients
            └── Queue workshop
                └── Start production
                    └── Complete output
                        └── Claim
                            └── Archive
```

### 11.4 Business flow for auction

```text
Seller intention
└── Item validation
    └── Item escrow
        └── Publish listing
            ├── Bid loop
            │   └── Expiration
            ├── Buyout
            └── Seller cancellation if allowed
                └── Settlement or return
                    └── Archive
```

### 11.5 Domain dependencies

```text
Settlement
├── Buildings
│   └── Workshops
│       └── Craft Orders
├── Market
│   └── Auctions
├── Treasury
│   ├── Taxes
│   └── Upgrades
└── Governance future

Economy Core
├── Ownership
├── Escrow
├── Ledger
└── Idempotency
```

### 11.6 System interaction

```text
Inventory
└── Escrow
    ├── Craft Order
    │   └── Workshop
    │       └── Output
    └── Auction
        └── Buyer / Seller transfer

Treasury
└── Taxes and fees
    └── Buildings
        └── Production capacity
            └── More economic activity
```

## 12. Specification checklist

Before implementation, future work must define:

- exact account and currency model;
- exact item identity and escrow model;
- exact persistence model for idempotency;
- accepted ADRs for economy core and job recovery;
- state transition rules as tests;
- permission matrix by route/action;
- event persistence and visibility rules;
- policy for deleted or banned players;
- policy for destroyed or conquered settlements;
- Studio LiveOps permission tiers.

## 13. Non-goals

This specification does not define:

- database schema;
- migration names;
- TypeORM entities;
- NestJS services;
- controllers or gateways;
- HTTP or WebSocket payloads;
- Studio UI;
- balancing numbers;
- final tax rates;
- final auction durations;
- accepted governance rules.

