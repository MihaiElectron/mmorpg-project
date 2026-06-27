# ADR-0006 - Economy transaction model

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-06-27
- Date proposed: 2026-06-26
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on: docs/01_Architecture/adr/README.md, docs/02_Security/client-server-trust.md
- Used by: Project owner, developers, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents: docs/08_Gameplay/settlement-economy-review.md, docs/08_Gameplay/settlement-specifications.md, docs/08_Gameplay/settlement-mvp-slicing.md
- Related code: N/A

## Context

Craft orders, fixed-price sales, auctions, taxes, refunds, treasury spending,
and future caravans all move scarce assets. The RFC review identified missing
foundations: economic accounts, ledger entries, escrow holds, item locks or
item instances, and idempotency records.

## Decision

All economic mutations use a shared Economy transaction model:

- currency belongs to an `EconomicAccount`;
- the official currency is bronze/silver/gold, with bronze as the indivisible
  storage and calculation unit;
- all server and database monetary values are stored as bronze-only integer
  amounts;
- every currency movement creates ledger entries;
- item or currency reservation uses an explicit escrow/hold concept;
- every escrow hold has one purpose and one terminal outcome;
- client commands that mutate economy state use actor-scoped idempotency;
- operations that span item, currency, tax, and settlement state complete
  atomically from the player-facing point of view.

No Settlement feature may move currency or items directly. It must request an
Economy operation.

Currency unit rules:

- `1 silver = 100 bronze`;
- `1 gold = 100 silver = 10 000 bronze`;
- bronze is the minimum indivisible unit;
- the client may display `123456 bronze` as `12 gold 34 silver 56 bronze`;
- display conversion is UI-only.

Server, database, transactions, comparisons, sorting, escrow, bids, buyouts,
taxes, treasury balances, rewards, and future player-to-player trade always use
bronze values.

Expected field naming uses a single bronze amount per value, for example:

- `amountBronze`;
- `balanceBronze`;
- `priceBronze`;
- `currentBidBronze`;
- `buyoutPriceBronze`;
- `taxAmountBronze`;
- `treasuryBalanceBronze`.

Business tables must not split monetary values into parallel denomination
columns such as `priceGold`, `priceSilver`, and `priceBronze`, or
`balanceGold`, `balanceSilver`, and `balanceBronze`.

Persistence should use a 64-bit integer for monetary values, for example
PostgreSQL `BIGINT`. TypeScript code must explicitly handle the risk that large
future balances can exceed safe `Number` operations.

No operation may produce a negative balance. The Economy operation is rejected
before write if the available balance is insufficient.

The shared Economy model is mandatory for Auction House buyout, bid, refund,
tax, treasury, craft payments, future NPC sales, future quest rewards, future
currency loot, and future player-to-player trade.

## Consequences

Positive:

- One model for craft reservations, listing escrow, bid holds, refunds, and
  treasury credits.
- Easier audit and recovery after crash or retry.
- Makes double-click, replay, and duplicate settlement testable.

Negative:

- MVP 1 must implement foundation work before visible gameplay.
- Existing inventory may need item lock or item instance changes before market
  features are safe.
- Monetary code must avoid unsafe TypeScript number assumptions for large
  treasury, bank, guild, or regional economy balances.

Risks:

- Overbuilding a full banking system too early.
- Ledger and balance divergence if future implementation allows silent updates.

## Security notes

This decision touches transactions, ownership, and item duplication. A modified
client must not create money, bypass escrow, spend locked funds, or transfer an
item twice. Negative and overflow amounts are invalid.

Clients cannot submit authoritative denomination splits. They may submit an
intention expressed as a bronze amount if the route allows it, but the server
validates bounds, balance, escrow, taxes, and resulting ledger entries.

## Performance notes

Ledger and audit tables can grow quickly. Reads must be paginated. Hot
transaction paths must lock only the minimal required records and avoid long
list queries inside write transactions.

## Alternatives considered

- Update inventory and currency rows directly per feature: rejected because it
  duplicates transfer logic and weakens audit.
- Store only mutable balances without ledger: rejected because reconciliation,
  support, and tax audit require history.
- Implement bank features first: rejected because MVP needs only accounts,
  ledger, escrow, and idempotency, not loans or deposits.

## Open questions

- Should item identity be stack-only, item-instance-only, or hybrid?
- Are balances stored as current values plus ledger, or derived from ledger?
- What maximum bronze balance is accepted per account type?
- What is the exact idempotency retention window?

## Related files

- docs/08_Gameplay/settlement-economy-review.md
- docs/08_Gameplay/settlement-specifications.md
- docs/08_Gameplay/settlement-mvp-slicing.md
