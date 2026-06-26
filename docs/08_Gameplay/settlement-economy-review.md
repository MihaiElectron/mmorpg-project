# Settlement / Economy RFC v1 - Architecture Review

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Reviewed document: docs/08_Gameplay/settlement-economy-architecture.md
- Depends on: docs/08_Gameplay/settlement-economy-architecture.md, docs/06_Database/schema.md, docs/08_Gameplay/crafting-runtime.md, docs/07_Admin/mmorpg-studio.md, docs/01_Architecture/client-server-boundaries.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document reviews `settlement-economy-architecture.md` as RFC v1.

It is documentation only. It does not implement code, migrations, Runtime
classes, services, controllers, gateways, Studio modules, or database tables.
It must not touch current Creature Runtime or Player Runtime work in progress.

## Executive summary

The RFC v1 is directionally solid: it identifies the right high-risk areas
for a future Settlement / Economy system and correctly anchors the design in
server authority, transactionality, idempotency, pagination, and Studio
read-only principles.

Its main weakness is that it names several critical mechanisms without yet
modeling them: wallet/currency ledger, item instances or item locks, escrow
ownership, operation idempotency, audit event structure, job claiming, worker
availability, and deletion/disable policies. Those missing foundations are not
minor details. Without them, craft orders and auctions would be vulnerable to
duplication, lost refunds, stale state, and inconsistent recovery after server
restart.

Recommended decision: keep RFC v1 as a good Phase 0 draft, but do not proceed
to database implementation before a revised Phase 0.5 defines the economic
ledger, escrow model, lifecycle state machines, job recovery model, and
future-proof ownership scope for players, guilds, settlements, and regions.

## Points forts

- Correct server-authoritative posture: the client sends intentions, never
  economic truth.
- Correct separation between Runtime and Studio: Studio observes and triggers
  through Runtime APIs, with no business logic.
- Good instinct to split Settlement, Economy, and Crafting instead of forcing
  every concern into Crafting.
- Good distinction between positioned world entities and non-positioned
  business records.
- Good early focus on idempotency, exactly-once transfers, transaction
  boundaries, pagination, and expiration jobs.
- Good recognition that direct buyout, bidding, tax deposit, craft completion,
  refund, and claim paths are all duplicate-sensitive.
- Good first table inventory for settlement, building, workshop, order,
  listing, bid, tax, treasury, treasury transaction, upgrade, and worker.
- Good future awareness for guild orders and governance, even if the model is
  not yet sufficient for them.

## Points faibles

| Severity | Issue | Impact |
|---|---|---|
| Critical | No explicit wallet, currency ledger, or player economic account model. | Auctions, deposits, bids, taxes, refunds, treasury spending, and overflow rules cannot be made safe. |
| Critical | No definitive item instance / item stack / escrow lock model. | The current inventory model is quantity-based; secure auctions and partial escrow need stronger ownership and locking semantics. |
| Critical | Escrow is described as a rule but not modeled as a first-class record. | Hard to prove exactly-once movement, recovery, cancellation, or audit. |
| Critical | Craft order lifecycle is under-specified for cancellation, withdrawal, partial contribution, interruption, NPC unavailability, and multi-worker execution. | Public orders and delayed production can deadlock, duplicate refunds, or consume wrong contributions. |
| Critical | Auction settlement lifecycle conflates sale, expiration, settlement, item delivery, seller payout, bid refund, and tax transfer. | Simultaneous bid/buyout/expiration can produce split-brain results without finer state and lock rules. |
| High | No operation/idempotency table or command request model. | Double click, retry after timeout, and replay are named but not grounded in a persistence mechanism. |
| High | No job claiming model for scheduled work. | Multiple server instances or restart recovery could process the same expiration or craft completion twice. |
| High | Deleting/disabling settlements, buildings, workshops, NPCs, and tax rules is not specified. | Active orders/listings may reference unavailable services or broken policy. |
| High | Tax model lacks negative/overflow protection beyond simple bounds. | Flat fee + percentage can exceed sale price or overflow integer math if not bounded. |
| High | Future multi-city, regional economy, caravan, and conquest requirements are not represented structurally. | Later expansion may force costly schema changes if locality and ownership are not generalized early. |
| Medium | Networking strategy remains abstract. | It says avoid global broadcasts, but does not define subscription scopes, event names, cache invalidation, or read model boundaries. |
| Medium | RuntimeSource terminology may conflict with the ongoing Runtime architecture if economic records are treated like stat modifier sources. | The review should keep economy jobs distinct from EntityRuntime stat calculation unless ADR-0004 explicitly supports that usage. |
| Medium | Studio actions are listed but not classified by DevTools, LiveOps, Monitoring, Validation, Analytics. | Risk of exposing debug-only force actions in production without a clear permission tier. |
| Medium | Public orders lack contributor reward and withdrawal policy. | Multi-player orders need clear incentives and refund rights before implementation. |

## Critical findings

### 1. Currency must be modeled before auctions

The RFC currently references `currency_cost`, `currency_escrowed`,
`currency_balance`, bids, seller payouts, and taxes, but no player wallet,
bank account, currency ledger, or money movement primitive exists in the
candidate model.

This creates a circular dependency:

```text
Auction needs locked bidder funds
Treasury needs tax deposits
CraftOrder needs currency escrow
BuildingUpgrade needs treasury spend
But no authoritative source owns player/guild/city money
```

Required correction:

- add an `EconomicAccount` concept before craft orders and auctions;
- account owners must support character, guild, settlement treasury, system,
  and future bank;
- all currency movements should be ledger entries, not only balance updates;
- use integer minor units with explicit max bounds;
- transaction code must reject negative, zero where invalid, and overflow.

### 2. Item escrow requires stronger item identity

The existing documented inventory model is character + item + quantity. That
is sufficient for simple stacks but not enough for high-value marketplace
operations if items later have durability, modifiers, creator, binding,
rarity rolls, or unique identity.

Risk examples:

- seller lists 1 sword from a stack of 2, equips another sword, then the system
  cannot prove which sword was sold;
- seller lists an item and a second request consumes the same inventory row;
- partial ingredient contribution decrements a stack, then refund cannot
  restore the exact item metadata;
- future crafted unique output cannot be traced to contributors.

Required correction:

- define whether all auctionable/craftable things are stackable catalog items,
  unique item instances, or both;
- model item locks or escrow inventory rows explicitly;
- prevent equipped, bound, locked, expired, or already-escrowed items from being
  moved;
- add immutable audit references for item movement.

### 3. Escrow should be first-class

Escrow appears in several places, but as columns scattered across orders,
contributions, listings, and bids. That makes audit and recovery harder.

Recommended model:

```text
EscrowHold
- id
- owner_account_id or owner_character_id
- purpose_type: craft_order | auction_listing | auction_bid | building_upgrade
- purpose_id
- asset_type: currency | item_stack | item_instance
- asset_ref
- quantity_or_amount
- status: held | consumed | released | transferred | voided
- idempotency_key
- created_at
- released_at
```

This makes refunds, consumption, bid replacement, seller return, and audit
consistent across all economy features.

### 4. Craft order lifecycle is too linear

The proposed lifecycle is useful but too simple for the cases requested in the
review.

Missing states or sub-states:

- `awaiting_funds`;
- `awaiting_contributions`;
- `ready_to_queue`;
- `paused`;
- `worker_unavailable`;
- `blocked_by_building`;
- `cancelling`;
- `refund_pending`;
- `partially_refunded`;
- `claim_expired` or long-term storage state.

Specific gaps:

- cancellation before funding should release nothing;
- cancellation after partial contribution should refund contributors according
  to contribution ownership;
- cancellation after production starts may need no refund, partial refund, or
  admin-only resolution;
- contributor withdrawal must be allowed or denied by state, not by UI;
- worker becoming unavailable must pause, reassign, fail, or complete under
  a defined policy;
- multiple artisans must have assignment records, capacity reservations, and
  deterministic scheduling;
- multiple players on one order need explicit ownership of outputs and rewards.

### 5. Auction lifecycle needs settlement sub-states

The proposed `active -> sold -> settled` path hides several money/item
sub-operations that can fail or race.

Recommended split:

```text
draft
-> active
-> closing
-> payment_captured
-> item_delivered
-> seller_paid
-> tax_recorded
-> settled
```

For unsold listings:

```text
active
-> expiring
-> item_returned
-> expired_settled
```

This does not mean every sub-state needs to be player-visible, but the backend
needs enough persisted markers to recover safely after crashes.

### 6. Scheduled jobs need durable claiming

The RFC says jobs must scan persisted due rows, which is good, but does not
define how workers claim rows.

Required properties:

- select due rows in bounded batches;
- atomically transition `active -> expiring` or `queued -> completing`;
- include `locked_by`, `locked_until`, or equivalent claim metadata;
- make job retries safe after process death;
- treat "now" as server/database time, not client time;
- allow multiple API instances without duplicate settlement.

PostgreSQL implementation can later use row locks, SKIP LOCKED, optimistic
version checks, or a job table. The ADR should choose the strategy.

## Requested scenario review

| Scenario | RFC v1 status | Review |
|---|---|---|
| Commandes annulees | Partially covered | Needs state-specific refund rules and cancellation windows. |
| PNJ indisponible | Missing | Needs worker availability policy: pause, reassign, fail, or continue. |
| Craft interrompu | Missing | Needs persisted interruption reason and recovery path. |
| Plusieurs artisans | Mentioned as future | Needs assignment/capacity table before public production scaling. |
| Plusieurs joueurs sur une commande | Mentioned through public orders | Needs contributor ownership, reward, withdrawal, and output policy. |
| Retrait d'ingredients | Missing | Must be explicitly allowed only before locked production state. |
| Rollback transactionnel | Named generally | Needs transaction boundary per operation and ledger/escrow invariants. |
| Double validation | Partially covered | Needs idempotency record and server-side state re-read inside transaction. |
| Double clic | Partially covered | Needs request idempotency keys per command. |
| Duplication d'objet | Named generally | Needs item locks, item instances/stack semantics, escrow holds. |
| Encheres simultanees | Partially covered | Needs listing row lock/version and minimum increment under lock. |
| Expiration simultanee | Partially covered | Needs durable job claiming and closing state. |
| Serveur redemarre pendant une enchere | Mentioned | Needs persisted bid holds and resumable settlement jobs. |
| Serveur redemarre pendant un craft | Mentioned | Needs timestamp-based production plus paused/interrupted policy. |
| Taxes negatives | Partially covered | Needs flat fee bounds, total fee cap, and overflow-safe calculation. |
| Overflow monnaie | Mentioned in security | Needs account max balance, amount type, and checked arithmetic. |
| Renommage ville | Missing | Needs immutable `key`, mutable `name`, audit event, uniqueness policy. |
| Suppression batiment | Partially covered via disabling | Needs soft-delete/retire policy and active dependency checks. |
| Evolution guildes | Mentioned | Needs generic owner/account/permission model. |
| Plusieurs villes | Mentioned | Needs locality, market scope, tax scope, inter-city transfer model. |

## Future expansion review

| Future feature | RFC v1 readiness | Required adjustment |
|---|---|---|
| Caravanes | Low | Add transport orders, route legs, cargo escrow, origin/destination settlements, risk states. |
| Commerce entre villes | Medium-low | Markets must be settlement-scoped first, with explicit cross-settlement fees and delivery delay. |
| Economie regionale | Low | Add region entity or settlement grouping, regional tax modifiers, aggregated analytics. |
| Banques | Low | Requires EconomicAccount, deposits, withdrawals, account owner types, access permissions. |
| Coffres de ville | Medium-low | Treasury is money-only; need city item storage / material vault with escrow and permissions. |
| Gouverneurs | Medium-low | Needs settlement role assignments and authority model. |
| Elections | Low | Needs governance period, candidates, votes, eligibility, audit, anti-abuse. |
| Conquetes | Low | Needs settlement ownership history, contested state, lockout rules, treasury protection. |
| Sieges | Low | Needs building damage states, siege timers, regional authority, service degradation. |
| Marches noirs | Medium-low | Auction model can extend, but needs hidden listing visibility, faction/permission rules, illicit tax policy. |
| Contrats entre joueurs | Medium | CraftOrder/PublicOrder can evolve, but needs generic contract terms, escrow, acceptance, breach, dispute. |

Conclusion: RFC v1 can become the foundation for these features only if the
next version generalizes ownership, accounts, escrow, locality, and contracts
before implementation.

## Responsibility review

### Correct placements

- Settlement owning buildings, service unlocks, local tax policy, and future
  governance is appropriate.
- Economy owning money movement, escrow, auctions, taxes, treasury accounting,
  and audit is appropriate.
- Crafting owning recipe validation and production rules is appropriate.
- Studio observing and triggering through Runtime APIs is appropriate.

### Responsibilities to move or clarify

- Treasury accounting should belong to Economy, while Treasury as a city-owned
  account belongs conceptually to Settlement. The write path should be Economy.
- TaxRule policy may belong to Settlement, but tax calculation and application
  should be Economy.
- Workshop scheduling belongs to Settlement/Production, but recipe validation
  belongs to Crafting.
- NPC worker visibility belongs to Entities/World; worker assignment and
  availability belongs to Settlement/Production.
- Audit should not be only treasury-specific. A generic economic audit or
  ledger is needed for all item and currency movements.

### Potential circular dependencies

```text
Settlement -> Economy -> Treasury -> Settlement
Settlement -> Crafting -> Inventory -> Economy -> Settlement
Studio -> Runtime API -> SDK -> Studio mental loop
```

Recommended dependency direction:

```text
Settlement policy/config
        |
        v
Economy transaction engine <-> Inventory / Wallet persistence
        |
        v
Crafting recipe validation and output creation

Studio reads adapters and sends commands to Runtime APIs only.
```

No domain should call Studio. No domain should mutate Economy balances without
going through the transaction engine.

## Security review

Additional required protections:

- idempotency key per client command, scoped by actor and operation type;
- server-generated operation id for scheduled jobs;
- permissions for settlement admin actions independent from global admin role;
- audit of city renames, tax changes, building disable/delete, force-expire,
  force-refund, and treasury adjustment;
- anti-price manipulation checks for zero-price listings if not allowed;
- minimum and maximum auction duration;
- maximum listing quantity and maximum bid amount;
- tax caps: total tax cannot exceed transaction gross amount unless explicitly
  designed;
- settlement id in payload must be validated against actual service location
  and access rights;
- future black market visibility must not leak hidden listings through normal
  public APIs.

## Transaction and concurrency review

### Required transaction boundaries

- create listing: verify ownership, create escrow hold, decrement/lock item,
  create listing active.
- direct buy: lock listing, lock buyer account, lock escrow hold, compute tax,
  transfer item, transfer seller payout, transfer tax, mark settled.
- place bid: lock listing, lock bidder account, create new hold, mark previous
  bid outbid, release previous hold, update current bid.
- expire auction: claim listing, settle winner or return item, release losing
  holds, mark terminal.
- submit craft order: validate recipe, lock ingredients/funds, create holds,
  create order.
- contribute ingredients: lock order and contributor inventory, prevent
  overfill, create hold.
- start production: lock order, validate full requirements and worker/building
  availability, consume relevant holds or mark them reserved for consumption.
- complete production: lock order, create output, mark ready/complete.
- claim output: lock order, deliver output, mark claimed.
- cancel/refund: lock order/listing, release eligible holds exactly once.
- treasury spend: lock treasury/account, write ledger, update balance, update
  target building/upgrade.

### Invariants to assert

- every nonzero balance change has a ledger row;
- every escrow hold ends in exactly one terminal outcome;
- active listing has exactly one item escrow hold;
- active auction has at most one current active bid;
- terminal listing cannot receive bids or buyout;
- order output can be claimed once;
- contribution cannot be consumed and refunded;
- treasury balance equals opening balance plus ledger sum, or has a defined
  reconciliation process.

## Persistence review

Missing candidate tables or concepts:

- `economic_account`;
- `economic_ledger_entry`;
- `escrow_hold`;
- `economic_operation` or `idempotency_record`;
- `item_instance` or `inventory_lock` depending on item strategy;
- `craft_order_assignment` for worker slots;
- `craft_order_output` for produced claimable outputs;
- `settlement_role` or `settlement_permission` for governors and future guilds;
- `settlement_region` for regional economy;
- `market_scope` or `market_channel` for normal market, black market, guild
  market, regional market;
- `city_storage` or `settlement_vault` for city item coffers.

Soft deletion should be preferred over hard deletion for settlements,
buildings, workshops, tax rules, workers, and market channels once referenced
by economic history.

## Runtime review

The RFC uses "RuntimeEntity" and "RuntimeSource" language. That is useful for
alignment, but it risks mixing two different meanings:

- EntityRuntime currently focuses on server-side stat calculation snapshots;
- economy jobs and business records are server Runtime concerns, but not
  necessarily EntityRuntime modifier sources.

Recommendation:

- call settlements/buildings/NPCs "World Runtime entities" only when positioned;
- call orders/listings/bids/ledger rows "Economic Runtime records";
- call expiration/completion/settlement workers "Economic jobs" unless the
  accepted Runtime ADR explicitly defines them as RuntimeSource.

This avoids accidental coupling with the ongoing Runtime architecture work.

## Studio review

Studio integration should be split by product component:

- DevTools: force expire, force complete, inspect internal state, simulate
  tax, inspect locks. Development only.
- LiveOps: limited refund, resolve stuck order, resolve stuck listing, view
  audit, no arbitrary item creation. Production possible with audit.
- Monitoring: event stream for failed settlements, stuck jobs, auction volume,
  suspicious retries.
- Validation: configuration checks before enabling a settlement service.
- Analytics: aggregate economy data without player-sensitive leakage.

Do not expose direct treasury balance edits as a normal Studio action. If an
emergency adjustment exists, it must be a ledger-backed admin operation with a
reason, actor, and approval tier.

## Networking review

The RFC says HTTP or WebSocket APIs, but economy operations should default to
request/response HTTP-style commands unless a realtime UX truly needs sockets.

Recommended split:

- commands: authenticated HTTP endpoints or acked socket commands with
  idempotency keys;
- queries: paginated HTTP reads with server filters;
- realtime: narrow invalidation events for subscribed settlement/market views;
- world rendering: only positioned buildings/NPCs participate in world
  synchronization;
- no global auction listing broadcasts.

Client updates should be treated as hints:

```text
listing_changed { listingId, settlementId, version }
order_changed { orderId, status, version }
treasury_changed { settlementId, version } for authorized viewers only
```

The client should then refetch paginated views. This avoids large payload
broadcasts and stale full-list synchronization.

## Schema fonctionnel revise

Recommended conceptual layers:

```text
World / Entities
  SettlementCenter, Building, NPCWorker (positioned only when visible)

Settlement
  Settlement, BuildingService, Workshop, Upgrade, GovernancePolicy

Production
  CraftOrder, Contribution, WorkerAssignment, CraftOutput

Market
  MarketChannel, AuctionListing, AuctionBid

Economy Core
  EconomicAccount, EscrowHold, LedgerEntry, IdempotencyRecord

Policy
  TaxRule, FeeRule, AccessRule

Operations
  EconomicJob, ExpirationJob, ProductionCompletionJob, SettlementJob

Studio SDK
  Adapters, Inspectors, Validation reports, audited admin commands
```

Revised transaction flow for auction buyout:

```text
Client command
-> IdempotencyRecord claim
-> Lock listing
-> Lock buyer EconomicAccount
-> Lock listing EscrowHold
-> Validate tax/fee policy snapshot
-> Ledger: buyer debit
-> Ledger: seller credit
-> Ledger: treasury credit
-> EscrowHold transfer item to buyer
-> Mark listing settled
-> Emit narrow invalidation event
```

Revised transaction flow for craft order:

```text
Client command
-> IdempotencyRecord claim
-> Lock order or create order
-> Validate recipe through Crafting
-> Create EscrowHold rows for ingredients/funds
-> Queue when requirements complete
-> Assign worker/capacity
-> Completion job claims due order
-> Consume holds and create CraftOutput
-> Claim transfers output once
```

## Ameliorations prioritaires

1. Define Economy Core before any feature implementation:
   `EconomicAccount`, `LedgerEntry`, `EscrowHold`, `IdempotencyRecord`.

2. Decide item identity:
   catalog-only stacks, unique item instances, or hybrid stack + instance
   model.

3. Rewrite craft order lifecycle with cancellation, withdrawal, pause,
   worker-unavailable, refund, and claim policies.

4. Rewrite auction lifecycle with closing/settlement sub-states and durable job
   claiming.

5. Add deletion/disable policies for settlement, building, workshop, worker,
   tax rule, and market channel.

6. Define overflow-safe currency arithmetic and tax fee caps.

7. Define multi-city market scope from the beginning, even if Phase 1 uses one
   settlement.

8. Define Studio permission tiers for DevTools, LiveOps, Monitoring,
   Validation, and Analytics.

## Ameliorations optionnelles

- Add market channels early: local market, regional market, guild market,
  black market later.
- Add settlement regions as optional grouping for future economy analytics.
- Add city storage/vault concept after treasury is stable.
- Add worker assignment as an explicit table only when production capacity
  becomes real.
- Add public contracts as a generalized successor to public craft orders.
- Add price history snapshots for future analytics and anti-abuse detection.

## Elements a repousser

- Elections, governors, conquest, sieges, and regional wars should wait until
  Settlement ownership and Economy Core are stable.
- Caravans should wait until item escrow, city storage, and multi-settlement
  locality exist.
- Black markets should wait until normal market permissions, visibility, and
  audit are proven.
- Player-to-player contracts should wait until public order cancellation and
  escrow policies are stable.
- Banks should wait until EconomicAccount and LedgerEntry are production-grade.

## ADR supplementaires eventuels

In addition to RFC v1 ADRs, propose:

1. `ADR Economy Core Accounts and Ledger`
   - Defines account owner types, balances, ledger entries, reconciliation, and
     integer currency bounds.

2. `ADR Item Identity and Escrow`
   - Decides stack vs item instance strategy, locks, escrow holds, binding,
     equipment restrictions, and refund semantics.

3. `ADR Economic Idempotency and Job Recovery`
   - Defines command idempotency, scheduled job claiming, retries, crash
     recovery, and multi-instance processing.

4. `ADR Settlement Service Availability`
   - Defines what happens when buildings, workshops, NPCs, or settlements are
     disabled, destroyed, conquered, or deleted while operations are active.

5. `ADR Market Scope and Locality`
   - Defines local vs regional markets, multi-city visibility, future caravans,
     and inter-city trade boundaries.

6. `ADR Studio LiveOps Economy Permissions`
   - Defines which economy actions are DevTools-only, which are LiveOps-safe,
     and what audit/approval each action requires.

## Roadmap mise a jour

### Phase 0 - RFC review

- Validate this review.
- Decide which critical findings must be folded into RFC v2.
- Do not implement database or endpoints yet.

### Phase 0.5 - Economy Core ADRs

- Write ADRs for accounts/ledger, item identity/escrow, idempotency/job
  recovery, and market locality.
- Define invariants and operation state machines.
- Decide whether Settlement and Economy become first-class domains.

### Phase 1 - Persistence foundation

- Add only foundational persistence once ADRs are accepted:
  accounts, ledger, escrow, idempotency, settlement, building, treasury.
- Add migrations only after review.
- Add tests for invariants before gameplay features.

### Phase 2 - Internal craft orders

- Implement private NPC craft orders with escrowed ingredients/funds.
- Support cancellation/refund rules before production.
- Support restart-safe completion jobs.
- Exclude public orders until contributor policy is ready.

### Phase 3 - Fixed-price local market

- Implement local fixed-price listings only.
- Use item escrow, buyer account debit, seller credit, tax ledger, and narrow
  invalidation events.
- No timed auctions yet.

### Phase 4 - Auction bidding

- Add bids, bid holds, outbid refunds, closing state, expiration jobs, and
  buyout races.
- Load-test concurrent bid paths before exposing broadly.

### Phase 5 - Taxes and treasury spending

- Apply tax rules with snapshots and caps.
- Add treasury-funded building upgrades.
- Add reconciliation checks and audit inspection.

### Phase 6 - Studio observation and LiveOps

- Add inspect-only panels first.
- Add validation reports.
- Add audited emergency actions with narrow permissions.

### Phase 7 - Multi-city and guild expansion

- Add guild economic accounts, settlement roles, market scopes, and
  cross-settlement trade rules.
- Prepare caravan and city storage concepts.

### Phase 8 - Governance and conflict systems

- Add governors, elections, conquest, sieges, black markets, and contracts only
  after the economic core is resilient.

## Conclusion

RFC v1 is a good architectural starting point, but it should not be implemented
as-is. The next revision must promote Economy Core from an implied dependency
to an explicit foundation. The safest path is to design money, item identity,
escrow, idempotency, and job recovery first; then layer craft orders, markets,
taxes, treasury, Studio, and governance on top.

