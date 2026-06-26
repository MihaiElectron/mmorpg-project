# ADR-0007 - Auction house authority

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-06-26
- Date proposed: 2026-06-26
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
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

## Decision

The server is the sole authority for auction state.

Auction House rules:

- a published listing must have item escrow;
- fixed-price purchase settles through Economy in one authoritative operation;
- timed bids lock bidder funds through Economy;
- only one current winning bid exists at a time;
- buyout, bid, cancellation, and expiration compete through server-side state
  transitions;
- expiration is processed by restart-safe server jobs;
- clients receive query results and narrow invalidation hints, never authority.

MVP order:

1. fixed-price listings;
2. timed bids and expiration;
3. tax integration if not already present.

## Consequences

Positive:

- Prevents client-side market authority.
- Defines one winner and one settlement path.
- Makes concurrent bid and expiration behavior testable.

Negative:

- Requires Economy Core before Auction House.
- Requires durable expiration handling before timed auctions.

Risks:

- Stuck bid holds if settlement fails.
- Expensive listing queries if pagination/indexes are not designed early.

## Security notes

This decision touches server authority, concurrent auctions, ownership, and
replay. A buyer cannot obtain an item twice. A seller cannot reclaim a sold
item. Losing bids must be refunded once. Seller self-bidding is denied unless a
future policy explicitly permits it.

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

## Related files

- docs/08_Gameplay/settlement-economy-architecture.md
- docs/08_Gameplay/settlement-economy-review.md
- docs/08_Gameplay/settlement-specifications.md
- docs/08_Gameplay/settlement-mvp-slicing.md

