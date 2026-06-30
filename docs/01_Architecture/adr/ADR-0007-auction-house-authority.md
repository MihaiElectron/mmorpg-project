# ADR-0007 - Auction house authority

## Metadata

- Status: Accepted
- Decision status: Accepted
- Owner: Project
- Last updated: 2026-06-30
- Date proposed: 2026-06-26
- Date accepted: 2026-06-30
- Approved by: Project owner
- Approval reference: Auction MVP 1 implemented — create listing, item escrow (LISTED+AUCTION), buyout via mailbox pipeline (2 system mails + escrow wallet), cancel → seller mail, expiration → seller mail, AuctionHouseWindow (Browse / My listings / Sell), building proximity validation (chebyshevDistanceWU)
- Depends on: docs/01_Architecture/adr/README.md, docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md
- Used by: Project owner, developers, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents: docs/08_Gameplay/settlement-economy-architecture.md, docs/08_Gameplay/settlement-economy-review.md, docs/08_Gameplay/settlement-specifications.md, docs/08_Gameplay/settlement-mvp-slicing.md
- Related code: N/A

## Context

The Settlement roadmap introduces fixed-price sales first, then timed auctions.
Auction flows are concurrency-sensitive: simultaneous bids, buyout racing with
expiration, seller cancellation, outbid refunds, and restart recovery can all
duplicate items or currency if authority is unclear.

Current implementation priority is Auction House. CraftOrder, Buildings,
Workshops, full Treasury, and advanced taxes remain out of scope for the next
Auction MVPs except where minimal economy primitives are required for escrow,
currency movement, and audit.

## Decision

The server is the sole authority for auction state.

The client never decides:

- final price in bronze;
- winner;
- bid validity;
- item transfer;
- currency transfer;
- expiration;
- refund;
- closure.

Auction House rules:

- a published listing must have item escrow;
- fixed-price purchase settles through Economy in one authoritative operation;
- all auction monetary values follow ADR-0006 and are stored, compared, sorted,
  reserved, refunded, and settled in bronze-only fields such as `priceBronze`,
  `currentBidBronze`, and `buyoutPriceBronze`;
- timed bids lock bidder funds through Economy;
- only one current winning bid exists at a time;
- buyout, bid, cancellation, and expiration compete through server-side state
  transitions;
- expiration is processed by restart-safe server jobs;
- clients receive query results and narrow invalidation hints, never authority.
- all mutating auction actions are transactional and must lock every affected
  auction, item, inventory, currency, refund, and economy transaction row;
- listed items leave the seller's active inventory and cannot be equipped,
  sold elsewhere, destroyed, crafted, or traded until a valid cancellation,
  expiration return, or final sale releases them;
- committed bid funds are reserved or debited according to the selected Economy
  model and cannot be reused elsewhere while they are the active winning hold;
- outbid refunds are resolved in the same transaction as the new accepted bid;
- double clicks and request replays are idempotent or rejected against the
  current persisted state.

Expiration must never depend on an in-memory timer. It must be recoverable after
server restart from persisted auction data, at minimum:

- `status`;
- `startsAt`;
- `endsAt`;
- `currentBidBronze`;
- `buyoutPriceBronze` if the listing supports buyout;
- `winnerId` if any;
- `sellerId`;
- `itemId`.

MVP order:

1. Auction MVP 1 - fixed-price listings only: create listing, lock item, buyout,
   transactional item/currency transfer, seller cancellation if no purchase,
   persisted expiration, and seller recovery after expiration.
2. Auction MVP 2 - timed ascending auctions: bid, outbid, previous bidder
   refund, winner closure, optional reserve price only if already documented,
   and anti double validation.
3. Auction MVP 3 - taxes and Treasury: deposit fees, sale tax, Treasury credit,
   and `TaxRule` integration.

## Consequences

Positive:

- Prevents client-side market authority.
- Defines one winner and one settlement path.
- Makes concurrent bid and expiration behavior testable.

Negative:

- Requires minimal Economy Core primitives before fixed-price Auction House.
- Requires durable expiration handling before both fixed-price returns and timed
  auctions.
- Defers city Treasury value until the fixed-price transfer proof exists.

Risks:

- Stuck bid holds if settlement fails.
- Expensive listing queries if pagination/indexes are not designed early.

## Security notes

This decision touches server authority, concurrent auctions, ownership, and
replay. A buyer cannot obtain an item twice. A seller cannot reclaim a sold
item. Losing bids must be refunded once. Seller self-bidding is denied unless a
future policy explicitly permits it.

Mandatory abuse and recovery cases:

- double buyout;
- double bid;
- bid after expiration;
- seller withdrawal during an active bid;
- buyer withdrawal after already being refunded;
- server restart during an active auction;
- server restart after expiration but before closure;
- deleted or banned seller;
- deleted or banned buyer.

## Performance notes

Listing and bid reads must be paginated. Realtime events should be narrow, for
example `listing_changed`, and should not broadcast full auction lists globally.
Expiration jobs must process bounded batches.

## Alternatives considered

- Client-driven auction timers: rejected because client time is untrusted.
- Global auction house first: rejected because future multi-city locality needs
  settlement-scoped markets.
- Timed auctions before fixed price: rejected because fixed-price settlement is
  the simpler transfer proof.

## Open questions

- Are auction durations limited to 8h and 16h for the first timed MVP?
- Is anti-sniping extension in scope later?
- Are seller identities and bid histories public, private, or policy-driven?
- Can sellers cancel auctions after the first bid, and with what penalty?
- Should committed bid funds be represented as balance reservations or immediate
  debits into escrow?

## Related files

- docs/08_Gameplay/settlement-economy-architecture.md
- docs/08_Gameplay/settlement-economy-review.md
- docs/08_Gameplay/settlement-specifications.md
- docs/08_Gameplay/settlement-mvp-slicing.md
