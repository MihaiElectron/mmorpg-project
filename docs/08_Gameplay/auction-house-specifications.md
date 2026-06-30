# Auction House - Functional Specifications

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-27
- Depends on: docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md, docs/01_Architecture/adr/ADR-0007-auction-house-authority.md, docs/08_Gameplay/settlement-specifications.md, docs/08_Gameplay/settlement-mvp-slicing.md
- Used by: Project owner, game design, developers, repository-aware coding agents

## Scope

This document defines the functional specification for the Auction House before
implementation of Auction MVP 1.

It is documentation only. It does not define database migrations, TypeORM
entities, NestJS services, controllers, DTOs, frontend components, DevTools
panels, Socket.IO payloads, or Runtime code.

Auction MVP 1 is fixed-price only. Timed ascending auctions, bids, taxes,
Treasury, mandatory buildings, multi-city markets, and advanced UI are future
work.

MVP 1 decisions:

- no persisted `Draft`; listing creation is atomic;
- fixed-price listings use `buyoutPriceBronze` only;
- seller is credited immediately in bronze during the purchase transaction;
- buyer receives the purchased item through manual claim;
- supported durations are 24h, 48h, and 72h;
- a player can have at most 20 active listings;
- only non-stackable item instances are supported.

## 1. Vision

The Auction House is a server-authoritative market service that lets players
sell tradable items to other players through fixed-price listings first, then
future timed auctions.

Functional role:

- convert inactive player inventory into market supply;
- let buyers discover, filter, sort, and purchase listed items;
- protect item ownership through escrow while an item is listed;
- protect currency movement through the shared Economy model;
- preserve auditability for support, DevTools, and future Studio inspection;
- provide a foundation for future bids, taxes, Treasury, inter-city trade,
  black markets, and merchant guilds.

Domain relationships:

- Inventory owns normal usable items.
- Auction House owns listing lifecycle and market visibility.
- Economy owns currency movement, ledger/audit, escrow, idempotency, and
  insufficient-funds rejection.
- DevTools may inspect and support operations, but must not implement economic
  rules.
- The client displays market state and sends intentions only.

Server authority:

- the client never decides final price, purchase validity, item transfer,
  currency transfer, expiration, refund, return, claim, or closure;
- all mutating actions are validated server-side;
- all monetary values are bronze-only;
- every visible ownership or currency outcome must be recoverable from durable
  server state.

## 2. MVP 1 - Fixed Price Only

### 2.1 Create Listing

A seller creates a fixed-price listing by selecting one owned non-stackable item
instance and submitting a fixed buyout price.

MVP 1 does not persist `Draft`. Creation is one atomic server operation:

```text
server validation
└── item lock
    └── listing created as Listed
```

Creation rules:

- seller is authenticated;
- seller owns the item instance;
- item exists and is not corrupted;
- item is a non-stackable item instance;
- item is tradable;
- item is not equipped, bound, already locked, already escrowed, pending
  deletion, pending transfer, or already listed;
- stack portions, partial quantities, item lots, and stackable currency items
  are rejected;
- `buyoutPriceBronze` is positive, finite, and within configured bounds;
- `priceBronze`, `startingPriceBronze`, and `currentBidBronze` are not used by
  MVP 1;
- listing duration is exactly 24h, 48h, or 72h;
- seller has fewer than 20 active listings before creation;
- creation uses an idempotency key or equivalent replay protection.

Creation result:

- listing becomes `Listed`;
- item leaves active seller inventory;
- item enters item escrow or an equivalent locked reservation state;
- listing becomes visible in market queries after validation;
- failed validation leaves no active listing and no locked item.

### 2.2 Lock Listed Item

The listed item is unavailable for normal gameplay while the listing is active.

Locked item rules:

- cannot be equipped;
- cannot be traded;
- cannot be sold elsewhere;
- cannot be destroyed;
- cannot be used as craft input;
- cannot be mailed, gifted, consumed, upgraded, repaired, stacked into another
  mutable item, or moved by any flow that bypasses Auction House;
- remains attributable to the seller for audit until sold;
- has exactly one listing purpose and one final outcome.

Release paths:

- buyer purchase finalizes;
- seller cancellation enters claimable return;
- expiration enters claimable return;
- audited admin action resolves an exceptional case.

### 2.3 Price Fields

All prices are bronze-only.

Allowed MVP 1 price shapes:

- `buyoutPriceBronze` only.

Reserved for future timed ascending auctions:

- `priceBronze`;
- `startingPriceBronze`;
- `currentBidBronze`.

Forbidden business table shapes:

- `priceGold` plus `priceSilver` plus `priceBronze`;
- `balanceGold` plus `balanceSilver` plus `balanceBronze`;
- client-authoritative denomination splits.

The UI may display a value such as `123456 bronze` as `12 gold 34 silver 56
bronze`, but server validation, persistence, filtering, sorting, comparisons,
purchase settlement, and audit use bronze.

### 2.4 Browse Listings

Players can browse active fixed-price listings.

Browse rules:

- only `Listed` entries visible to the buyer are returned;
- expired listings are excluded or clearly marked unavailable after server
  state reconciliation;
- results are paginated;
- page size is bounded;
- listing rows expose enough item summary data for market decisions without
  leaking private audit fields;
- listing reads never grant authority to buy.

### 2.5 Search

Search by item name is supported for MVP 1.

Search rules:

- search text is normalized by server policy;
- empty search behaves like normal browse;
- long search terms are bounded;
- result count is paginated;
- search never bypasses visibility, expiration, or listing status checks.

### 2.6 Filters

MVP 1 supports market filters that do not require future economy systems.

Expected filters:

- item category;
- item quality or rarity;
- item level or required level;
- minimum `buyoutPriceBronze`;
- maximum `buyoutPriceBronze`;
- seller-owned listings in the seller view;
- active only by default.

Filter rules:

- price filters use bronze;
- invalid ranges are rejected or normalized by server policy;
- filters are bounded to prevent expensive unindexed scans;
- unavailable future filters must fail explicitly or be omitted.

### 2.7 Sorting

Expected sorts:

- price ascending;
- price descending;
- date listed ascending or descending;
- time remaining ascending or descending;
- stable secondary sort by listing identifier or publication time.

Sort rules:

- price sorts use `buyoutPriceBronze`;
- time remaining is derived from server time and persisted `endsAt`;
- sorting is deterministic inside a page request;
- unsupported sort keys are rejected or replaced by the default sort.

### 2.8 Buy Immediately

A buyer purchases a fixed-price listing through a server-authoritative buyout
action.

Buy rules:

- buyer is authenticated;
- buyer is not the seller unless future policy explicitly allows self-buy;
- listing exists;
- listing is `Listed`;
- listing is not expired at server time;
- listed item is still locked for that listing;
- buyer has sufficient available `balanceBronze`;
- request replay or double click is idempotent or rejected cleanly.

Successful purchase result (implemented V2 — mailbox delivery):

- listing leaves `Listed`;
- buyer currency is debited in bronze and transferred to the `auction_escrow` system wallet;
- a system mail is created for the buyer containing the purchased item (`AUCTION_TO_MAIL` transition: LISTED+AUCTION → IN_MAIL+MAIL);
- a system mail is created for the seller containing the amount in bronze (`attachedAmountBronze`);
- listing enters `SoldClaimed` immediately (no intermediate pending state);
- seller claims their proceeds by collecting the money mail from the Mailbox;
- buyer claims the item by collecting the item mail from the Mailbox;
- when the seller claims the money mail, the `auction_escrow` wallet is debited and the seller wallet is credited (`AUCTION_SELL` transaction);
- all ledger/audit rows are persisted.

### 2.9 Transactional Transfer

The purchase action is one player-facing economic operation.

Required locked records conceptually include:

- listing;
- listed item or item escrow;
- seller inventory or seller claim box;
- buyer inventory or buyer claim box;
- buyer economic account;
- seller economic account;
- economy ledger/audit transaction;
- idempotency record.

Atomicity rule:

- no buyer-visible item transfer without corresponding buyer debit;
- no seller-visible payout without corresponding item sale;
- no partial success exposed as complete;
- failed settlement leaves the listing in a recoverable non-duplicating state.

### 2.10 Seller Cancellation

A seller may cancel an active fixed-price listing only while no purchase has
already won the state transition.

Cancellation rules:

- actor is the seller or an authorized admin path;
- listing is `Listed`;
- listing has not expired into the expiration path;
- listing has no accepted purchase in progress;
- cancellation request is idempotent or rejected after state change.

Cancellation result (implemented V2 — mailbox delivery):

- a system mail is created for the seller containing the item (`AUCTION_TO_MAIL` transition: LISTED+AUCTION → IN_MAIL+MAIL);
- listing enters `CancelledClaimed` immediately (no intermediate pending state);
- listing is removed from public browse results;
- seller recovers the item via Mailbox claim.

### 2.11 Expiration

Expiration is based on persisted server state, never an in-memory-only timer.

Minimum persisted data required:

- `status`;
- `startsAt`;
- `endsAt`;
- `sellerId`;
- `itemId`;
- `buyoutPriceBronze`.

Expiration rules:

- server time is authoritative;
- due listings are processed by restart-safe jobs or lazy reconciliation;
- expiration is idempotent;
- a listing already sold, cancelled, claimed, or archived is ignored by
  expiration processing;
- expiration racing with purchase has one winning state transition.

Expiration result (implemented V2 — mailbox delivery):

- a system mail is created for the seller containing the item (`AUCTION_TO_MAIL` transition: LISTED+AUCTION → IN_MAIL+MAIL);
- listing enters `ExpiredClaimed` immediately (no intermediate pending state);
- listing is removed from public active browse results;
- seller recovers the item via Mailbox claim;
- history remains inspectable.

### 2.12 Claim Unsold Item

The seller recovers the listed item after cancellation or expiration via the Mailbox.

This section describes the V2 mailbox delivery path. `ExpiredPendingClaim` and
`CancelledPendingClaim` are no longer created by the implementation — items go
directly to a system mail when the listing is cancelled or expires.

Claim path (implemented V2):

- seller opens the Mailbox window at a Mailbox building (proximity required);
- a system mail from `SYSTEM` is present in the inbox with the item attached;
- seller claims the mail attachment;
- the item transitions from IN_MAIL to AVAILABLE+INVENTORY (seller);
- mail status becomes `CLAIMED`.

Known debt: if the system mail expires before the seller claims it, the item
returns to the sender (`SYSTEM`), which has no inventory. This edge case is
documented as a known gap (Mailbox expiration policy for system mails — future
work).

### 2.13 Sale Proceeds

Seller proceeds are bronze-only.

Implemented V2: seller proceeds are delivered via a system mail with `attachedAmountBronze`.
The seller must collect this mail from a Mailbox building (proximity required).

Rules:

- buyer payment (`buyoutPriceBronze`) is transferred to the `auction_escrow` system wallet atomically in the purchase transaction (`AUCTION_BUY`);
- a system money mail is created for the seller containing `attachedAmountBronze`;
- the seller claims the money mail from the Mailbox; at that point the `auction_escrow` wallet is debited and the seller wallet is credited (`AUCTION_SELL`);
- audit records both transfers in the ledger;
- a money mail claim is exactly-once; double claim is rejected.

Known debt: if the seller money mail expires before claim, the `attachedAmountBronze`
amount remains blocked in the `auction_escrow` wallet with no automatic return to
the seller. This is documented as a known gap (Auction MVP 2).

## 3. Out of Scope for MVP 1

Explicitly excluded:

- timed ascending auctions;
- bid and outbid flows;
- current winning bid;
- bid increments;
- bid history;
- anti-sniping;
- taxes;
- Treasury;
- `TaxRule`;
- mandatory Auction House building;
- mandatory settlement building availability checks;
- multi-city markets;
- inter-city trade;
- dynamic deposit fees;
- sale fees;
- advanced notifications;
- advanced UI;
- price history analytics;
- black markets;
- guild-owned listings.

## 4. Functional States

### 4.1 State Definitions

| State | Meaning | Publicly buyable | Terminal | Notes |
|---|---|---:|---:|---|
| Listed | Active fixed-price listing with item locked | Yes | No | |
| SoldPendingClaim | (Deprecated) Purchase accepted; item pending buyer claim | No | No | No longer created by V2 implementation |
| SoldClaimed | Purchase complete; item and proceeds delivered via Mailbox | No | Yes before archive | Set immediately in V2 |
| ExpiredPendingClaim | (Deprecated) Listing expired; item pending seller claim | No | No | No longer created by V2 implementation |
| ExpiredClaimed | Listing expired; item sent to seller via Mailbox | No | Yes before archive | Set immediately in V2 |
| CancelledPendingClaim | (Deprecated) Listing cancelled; item pending seller claim | No | No | No longer created by V2 implementation |
| CancelledClaimed | Listing cancelled; item sent to seller via Mailbox | No | Yes before archive | Set immediately in V2 |
| Archived | Hidden from active views, retained for audit | No | Yes | |

`Draft` may exist as a future UI-only preparation concept, but it is not a
persisted MVP 1 auction state.

The `*PendingClaim` states remain in the status enum for database compatibility
but are never set by the V2 implementation. All item and money distribution goes
through `MailService` system mails.

### 4.2 State Transition Rules

- Only `Listed` can be purchased.
- Only `Listed` can be cancelled by seller.
- Only `Listed` can expire.
- Purchase transitions `Listed` → `SoldClaimed` (V2: direct, via mailbox pipeline).
- Cancellation transitions `Listed` → `CancelledClaimed` (V2: direct, via mailbox pipeline).
- Expiration transitions `Listed` → `ExpiredClaimed` (V2: direct, via mailbox pipeline).
- Claimed states cannot be claimed again.
- `Archived` cannot re-enter active market states.

V2 note: The `*PendingClaim` intermediate states are bypassed. `Listed` transitions
directly to the final claimed state in one atomic transaction that also creates
the system mail(s).

## 5. Permissions

### Seller

Can:

- create a listing with owned tradable item;
- inspect own active and historical listings;
- cancel own `Listed` listing if no purchase or expiration has won the state;
- receive a system mail with the item after cancellation or expiration (Mailbox claim required);
- receive a system mail with the sale proceeds after a successful purchase (Mailbox claim required).

Cannot:

- use the listed item while it is locked;
- edit price after publication in MVP 1;
- cancel after sale is accepted;
- force buyer claim;
- bypass Economy settlement.

### Buyer

Can:

- browse, search, filter, and sort active visible listings;
- inspect public listing details;
- buy an eligible `Listed` listing if funds and inventory rules pass;
- receive a system mail with the purchased item (Mailbox claim required);
- inspect own purchase history.

Cannot:

- buy an expired, cancelled, sold, or archived listing;
- decide final price;
- pay in split denominations;
- spend unavailable or locked funds;
- claim an item twice.

### Administrator

Can:

- inspect listings, item locks, economic transactions, and audit history;
- perform controlled cancellation or resolution for support cases;
- annotate exceptional cases if future support tooling allows it.

Cannot:

- bypass audit;
- silently create or destroy currency;
- silently duplicate or delete listed items;
- use DevTools as the source of economic truth.

### Server System

Can:

- validate listing creation;
- lock and release listed items;
- execute purchases through Economy;
- expire due listings;
- reconcile restart recovery;
- reject stale, replayed, or conflicting commands;
- archive resolved listings.

Must:

- remain authoritative;
- persist state before exposing results;
- keep operations idempotent or reject them cleanly;
- preserve audit trails.

## 6. Economic Rules

- Bronze is the indivisible unit.
- `1 silver = 100 bronze`.
- `1 gold = 10 000 bronze`.
- All Auction House amounts are stored and processed in bronze.
- MVP 1 uses `buyoutPriceBronze` for fixed-price listings.
- `priceBronze`, `startingPriceBronze`, and `currentBidBronze` are reserved for
  future timed ascending auctions.
- No `priceGold` / `priceSilver` / `priceBronze` split model is allowed in
  business tables.
- No `balanceGold` / `balanceSilver` / `balanceBronze` split model is allowed
  in business tables.
- PostgreSQL `BIGINT` or an equivalent 64-bit integer is recommended for
  monetary persistence.
- TypeScript implementation must handle the risk of unsafe `Number` operations
  for large balances.
- No economic transaction can create a negative balance.
- Insufficient available balance rejects the purchase before write.
- Auction House cannot move currency outside the shared Economy model.
- Future NPC sales, quest rewards, loot currency, craft payments, player trade,
  taxes, Treasury, and bid refunds must also go through Economy.
- Client gold/silver/bronze conversion is display-only.

## 7. Inventory Rules

Listed item lock:

- listed item leaves active seller inventory;
- listed item remains associated with the listing;
- listed item is one non-stackable item instance;
- listed item cannot be equipped;
- listed item cannot be exchanged;
- listed item cannot be destroyed;
- listed item cannot be used in crafting;
- listed item cannot be sold elsewhere;
- listed item cannot be transferred by mail, trade, admin shortcut, or future
  system without resolving the listing.

Buyer delivery:

- MVP 1 uses manual buyer claim even if inventory has room;
- if buyer inventory is full at claim time, item remains safely claimable;
- full inventory must not cancel an already settled purchase;
- claim retry must not charge the buyer again.

Seller return:

- expired or cancelled items return only through claim or approved storage;
- if seller inventory is full, item remains claimable;
- seller inventory full must not destroy the item;
- claim retry must not duplicate the item.

Corruption and support:

- missing or corrupted escrowed item blocks normal claim;
- listing moves to support/admin resolution state or remains pending with an
  explicit error;
- no currency payout or item return is faked without audit.

## 8. Mandatory Edge Cases

| Case | Expected behavior |
|---|---|
| Double purchase | One request wins. The other returns already sold, stale state, or idempotent prior result. |
| Double cancellation | One cancellation wins. Later attempts return already cancelled or idempotent prior result. |
| Purchase during expiration | Purchase and expiration race through one state transition; only one outcome wins. |
| Expiration during purchase | Same as above; no sold-and-returned duplicate item. |
| Seller disconnected | Listing continues; purchase, expiration, and claim availability do not require seller online. |
| Buyer disconnected | Accepted purchase remains claimable; buyer reconnect can inspect and claim. |
| Seller deleted | MVP 1 applies no automatic full policy; listing remains inspectable and correctable by admin via DevTools. |
| Seller banned | MVP 1 applies no automatic full policy; listing remains inspectable and correctable by admin via DevTools. |
| Buyer deleted | MVP 1 applies no automatic full policy; pending purchase remains inspectable and correctable by admin via DevTools. |
| Buyer banned | MVP 1 applies no automatic full policy; pending purchase remains inspectable and correctable by admin via DevTools. |
| Buyer inventory full | Purchased item remains claimable without second charge. |
| Seller inventory full on return | Item remains in claimable return storage; no destruction or duplicate. |
| Item deleted/corrupted | Normal settlement pauses for support resolution; no silent payout or replacement. |
| Insufficient balance | Purchase is rejected before write; no item transfer. |
| Server restart before expiration | Listing resumes from persisted `status`, `startsAt`, `endsAt`, seller, item, and `buyoutPriceBronze`. |
| Server restart after unclosed expiration | Expiration reconciliation resumes once and moves to `ExpiredPendingClaim` if unsold. |
| HTTP/socket replay | Idempotency returns same result or rejects stale command without duplicate transfer. |
| UI double click | Same as replay; client behavior is never trusted for safety. |

## 9. DevTools Integration

DevTools and future Studio may provide read and controlled support visibility.

Allowed inspection:

- active listings;
- listing state and timestamps;
- seller and buyer references with role-appropriate redaction;
- locked item identity and escrow purpose;
- claim status;
- economy transaction references;
- ledger/audit entries related to purchase, return, cancellation, and support
  actions;
- idempotency/replay status for debugging.

Controlled admin actions:

- audited cancellation of active listing;
- audited support resolution for corrupted or stuck listing;
- read-only inspection of item locks and economy transactions.

Rules:

- DevTools does not calculate price;
- DevTools does not transfer item ownership directly;
- DevTools does not debit or credit currency directly;
- DevTools commands call server domain operations;
- privileged data is role-checked server-side;
- support actions must be persisted for audit.

## 10. Future Phases

### MVP 2 - Timed Ascending Auctions

Adds:

- bid placement;
- outbid;
- `currentBidBronze`;
- bidder currency holds;
- refund or release of previous highest bidder;
- winner closure at expiration;
- optional reserve price only if separately approved;
- stronger concurrency tests around bid/buyout/expiration races.

### MVP 3 - Taxes / Treasury

Adds:

- deposit fees if selected;
- sale tax;
- `taxAmountBronze`;
- Treasury credit;
- `TaxRule`;
- treasury audit and bounded tax math.

### Inter-City Auctions

Future inter-city markets require:

- settlement or region scope;
- market locality;
- transport delay or pickup location;
- import/export tax policy;
- recovery if route or destination changes.

### Black Markets

Future black markets require:

- hidden or restricted visibility;
- contraband rules;
- enforcement risk;
- separate audit policy;
- anti-abuse review before implementation.

### Merchant Guilds

Future merchant guilds require:

- guild economic accounts;
- guild-owned listings;
- role-based listing and claim permissions;
- guild storage integration;
- audit by guild role and player actor.

## 11. Diagrams

### 11.1 Fixed-Price Sale Flow

```text
Seller inventory
└── Select non-stackable item instance
    └── Server validation
        ├── Reject
        └── Lock item in escrow
            └── Create Listed listing
                └── Market browse/search/filter/sort
```

### 11.2 Purchase Flow (V2 — Mailbox delivery)

```text
Buyer intention
└── Server loads Listed listing
    └── Lock listing + item + wallets
        ├── Reject stale / expired / insufficient funds
        └── Atomic transaction
            ├── Debit buyer wallet -> auction_escrow wallet (AUCTION_BUY)
            ├── Create system mail for buyer (attachedItemInstanceId)
            ├── AUCTION_TO_MAIL: LISTED+AUCTION -> IN_MAIL+MAIL(buyerMailId)
            ├── Create system money mail for seller (attachedAmountBronze)
            └── listing -> SoldClaimed
                ├── Buyer claims Mailbox mail -> item in inventory (CLAIM_MAIL)
                └── Seller claims Mailbox money mail -> AUCTION_SELL: escrow -> seller wallet
```

### 11.3 Expiration / Cancellation Flow (V2 — Mailbox delivery)

```text
Persisted endsAt reached (or seller cancels)
└── Server reconciliation / cancel handler
    └── Lock listing + item
        ├── Already sold/cancelled/archived -> no effect
        └── Unsold listing
            └── Atomic transaction
                ├── Create system mail for seller (attachedItemInstanceId)
                ├── AUCTION_TO_MAIL: LISTED+AUCTION -> IN_MAIL+MAIL(sellerMailId)
                └── listing -> ExpiredClaimed (or CancelledClaimed)
                    └── Seller claims Mailbox mail -> item in inventory (CLAIM_MAIL)
```

### 11.4 State Machine (V2)

```text
Listed
├── SoldClaimed (direct — via mailbox pipeline)
│   └── Archived
├── ExpiredClaimed (direct — via mailbox pipeline)
│   └── Archived
└── CancelledClaimed (direct — via mailbox pipeline)
    └── Archived

Deprecated (enum present, never created by V2 implementation):
  SoldPendingClaim, ExpiredPendingClaim, CancelledPendingClaim
```

## 12. Open Questions

- What exact maximum `buyoutPriceBronze` is allowed per listing?
- Are listing search/filter indexes required before first release or can they
  be added during hardening?
- Should `Archived` happen immediately after claim or via later cleanup job?
- What exact admin resolution actions are exposed in DevTools for corrupted or
  stuck listings?
