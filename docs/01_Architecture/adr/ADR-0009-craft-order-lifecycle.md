# ADR-0009 - Craft order lifecycle

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
- Related documents: docs/08_Gameplay/crafting-runtime.md, docs/08_Gameplay/settlement-economy-architecture.md, docs/08_Gameplay/settlement-economy-review.md, docs/08_Gameplay/settlement-specifications.md, docs/08_Gameplay/settlement-mvp-slicing.md
- Related code: N/A

## Context

The project already has immediate runtime crafting through placed crafting
stations. Settlement craft orders are different: they are delayed,
escrow-backed production records attached to workshops and future city economy.

The RFC review identified risks around cancellation, ingredient withdrawal,
worker unavailability, multiple players contributing, restart recovery, and
duplicate completion.

## Decision

Craft Orders are durable business records with an explicit server-owned
lifecycle. They do not replace immediate CraftingStation runtime crafting.

Initial scope:

- private player order only;
- existing recipe validation reused from Crafting where applicable;
- required ingredients and rewards reserved through Economy escrow;
- production completion creates claimable output once;
- cancellation before production releases eligible holds;
- public orders, partial contributions, guild orders, and advanced NPC workers
  are deferred.

The lifecycle is state-driven. The server owns all transitions from creation to
archive.

## Consequences

Positive:

- Separates delayed settlement production from immediate crafting.
- Makes cancellation, completion, and claim testable.
- Allows future public and guild orders to extend a stable base.

Negative:

- Requires Economy Core before MVP craft orders.
- Requires extra state and tests compared to simple immediate craft.

Risks:

- Duplicating Crafting recipe validation.
- Consuming ingredients before order state is durable.
- Adding public-order complexity too early.

## Security notes

This decision touches server authority, inventory ownership, and transactions.
Clients cannot declare an order complete, claim output twice, withdraw locked
ingredients, or submit someone else's inventory. Escrow prevents double use of
reserved ingredients.

## Performance notes

Craft order lists must be paginated. Completion jobs should process due orders
in bounded batches and be idempotent. Public orders are deferred because they
increase write contention and query volume.

## Alternatives considered

- Reuse immediate `POST /crafting/craft` directly: rejected because immediate
  crafting consumes and produces in one request, while orders need escrow,
  queueing, delayed completion, and claim.
- Implement public orders first: rejected because contributor ownership and
  withdrawal policies are not yet proven.
- Simulate advanced NPC workers first: rejected because MVP needs a simple
  production delay before worker scheduling.

## Open questions

- Which recipes are eligible for MVP craft orders?
- Does production continue during server downtime by timestamp comparison?
- What is the first cancellation fee policy, if any?
- When should public order contribution and withdrawal rules be introduced?

## Related files

- docs/08_Gameplay/crafting-runtime.md
- docs/08_Gameplay/settlement-economy-architecture.md
- docs/08_Gameplay/settlement-economy-review.md
- docs/08_Gameplay/settlement-specifications.md
- docs/08_Gameplay/settlement-mvp-slicing.md

