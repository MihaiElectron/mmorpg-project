# ADR-0005 - Settlement system boundaries

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-06-26
- Date proposed: 2026-06-26
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on: docs/01_Architecture/adr/README.md, docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md, docs/01_Architecture/adr/ADR-0002-entity-positioning.md, docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md
- Used by: Project owner, developers, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents: docs/08_Gameplay/settlement-economy-architecture.md, docs/08_Gameplay/settlement-economy-review.md, docs/08_Gameplay/settlement-gameplay-loops.md, docs/08_Gameplay/settlement-specifications.md, docs/08_Gameplay/settlement-mvp-slicing.md
- Related code: N/A

## Context

The Settlement System introduces cities, buildings, workshops, craft orders,
markets, auctions, taxes, treasury, and future governance. These concerns cross
Gameplay, Entities, Persistence, Economy, Networking, Identity, and Studio.

Without explicit boundaries, implementation may mix settlement policy, money
movement, crafting validation, item ownership, and Studio inspection in one
service.

## Decision

The Settlement System is split into durable conceptual domains:

- `Settlement` owns city identity, buildings, services, availability, upgrades,
  and future governance policy.
- `Economy` owns accounts, ledger, escrow, transfers, taxes application,
  treasury accounting, idempotency, and economic audit.
- `Crafting` owns recipes, immediate craft validation, and output rules.
  Settlement craft orders reuse Crafting rules instead of duplicating them.
- `Market` owns listing and auction lifecycle, but uses Economy for every asset
  movement.
- `Studio` observes and triggers through Runtime APIs only. It contains no
  settlement or economy business logic.

Positioned settlements, buildings, and visible NPC workers follow ADR-0001 and
ADR-0002. Non-positioned orders, listings, bids, ledger rows, and treasury
transactions are business records, not world entities.

## Consequences

Positive:

- Prevents a monolithic settlement service.
- Keeps money and item movement behind one Economy boundary.
- Keeps Studio compatible with existing Studio SDK principles.
- Avoids contradicting ADR-0004: economic records are not Runtime stat modifier
  sources unless they affect derived stats.

Negative:

- Requires clear module dependencies before implementation.
- Some flows cross several domains and need explicit orchestration.

Risks:

- Circular dependencies if Settlement directly mutates Economy balances.
- Duplicated craft validation if Crafting is not reused.

## Security notes

This decision touches server authority. Settlement and Economy mutations must be
server-side. The client can only send intentions. Studio visibility is not
authorization.

## Performance notes

Business records must be queried through paginated read models. World
synchronization should include positioned entities only, not complete economic
lists.

## Alternatives considered

- Single `SettlementModule` owning all logic: rejected because it would mix
  policy, transactions, crafting, market, and Studio concerns.
- Put all settlement production into existing Crafting: rejected because
  delayed orders, escrow, queues, and public contracts exceed immediate craft.

## Open questions

- Should `Economy` become a first-class project domain in `docs/00_Project/domains.md`?
- Should `Market` be its own domain or remain inside Settlement?
- What is the first supported settlement scope: one city, many cities, or a
  city placeholder for MVP 1?

## Related files

- docs/08_Gameplay/settlement-economy-architecture.md
- docs/08_Gameplay/settlement-economy-review.md
- docs/08_Gameplay/settlement-specifications.md
- docs/08_Gameplay/settlement-mvp-slicing.md

