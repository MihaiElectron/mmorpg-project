# ADR-0008 - City treasury and tax flow

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
- Related documents: docs/08_Gameplay/settlement-economy-architecture.md, docs/08_Gameplay/settlement-gameplay-loops.md, docs/08_Gameplay/settlement-specifications.md, docs/08_Gameplay/settlement-mvp-slicing.md
- Related code: N/A

## Context

Settlement gameplay uses taxes and service fees to fund a city treasury. The
treasury later funds maintenance, upgrades, services, and future governance.
Taxes affect inflation, player trust, and audit requirements.

## Decision

Taxes are Settlement policy, but tax application and treasury accounting are
Economy operations.

Rules:

- tax rates and fees are bounded;
- tax calculation uses integer arithmetic and explicit rounding;
- applied tax is snapshotted at settlement time;
- treasury credits and debits create audit/ledger entries;
- treasury balance changes are not silent mutable edits;
- corrections use reversal entries rather than overwriting history.

Taxes first apply to fixed-price market settlement. Other taxable flows are
added only after the treasury path is proven.

## Consequences

Positive:

- Keeps city growth connected to real economic activity.
- Makes treasury audit and support possible.
- Avoids retroactive tax ambiguity.

Negative:

- Requires Economy Core before treasury can be safe.
- Governance tax editing must wait for permission rules.

Risks:

- Confusing tax transfer with gold destruction.
- Treasury hoarding without later sinks.
- Abusive tax rates if caps are not enforced.

## Security notes

This decision touches taxes, treasury, and future governance. The client cannot
choose tax amount. Administrators and future governors need server-side
authorization and audit for tax changes, treasury spending, and reversals.

## Performance notes

Treasury ledgers can grow indefinitely. Reads must be paginated and filterable
by settlement, time, source type, and source id. Tax calculation should not add
long queries to hot sale transactions.

## Alternatives considered

- Treat taxes as destroyed gold only: rejected because settlement gameplay
  needs treasury funding.
- Store only a treasury balance: rejected because audit and reversals require
  history.
- Add governor-controlled tax policy in MVP 5: rejected until permissions and
  anti-grief rules exist.

## Open questions

- Which taxes are enabled first: sale tax only, deposit fee, craft service fee?
- Are taxes paid by seller, buyer, or split?
- What are the initial tax caps?
- When does treasury spending become a gold sink versus a transfer?

## Related files

- docs/08_Gameplay/settlement-economy-architecture.md
- docs/08_Gameplay/settlement-gameplay-loops.md
- docs/08_Gameplay/settlement-specifications.md
- docs/08_Gameplay/settlement-mvp-slicing.md

