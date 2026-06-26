# Architecture Decisions

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/README.md, docs/01_Architecture/adr/README.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document is the canonical index and summary of Architecture Decision
Records for the project.

It helps readers quickly find proposed, accepted, superseded, deprecated, and
rejected ADRs.

It does not copy detailed ADR reasoning. Detailed context, options, rationale,
security impact, performance impact, and consequences stay in the related ADR
file.

## Purpose

This index contains only:

- ADR identifier.
- Title.
- `Decision status`.
- Date of the current `Decision status`.
- Link to the ADR.
- Relationship with a replaced ADR when relevant.

This document records decisions. It does not prove that a decision is
implemented.

## ADR directory

Detailed ADRs live in:

```text
docs/01_Architecture/adr/
```

The official ADR process and template are defined in:

```text
docs/01_Architecture/adr/README.md
```

## Numbering rules

- Use the `ADR-NNN` format.
- Use increasing numbers.
- Never reuse a number.
- Do not delete an ADR to free a number.
- A rejected or superseded ADR keeps its number.
- The next number must be calculated from real files present in
  `docs/01_Architecture/adr/`.
- No assistant should assign a final ADR number without checking the directory.

## Current ADR registry

| ADR | Title | Decision status | Date | Supersedes | Superseded by |
|---|---|---|---|---|---|
| [ADR-0001](adr/ADR-0001-world-coordinate-system.md) | World coordinate system | Accepted | 2026-06-22 | None | None |
| [ADR-0002](adr/ADR-0002-entity-positioning.md) | Entity positioning | Proposed | 2026-06-21 | None | None |
| [ADR-0003](adr/ADR-0003-movement-authority.md) | Movement authority | Proposed | 2026-06-21 | None | None |
| [ADR-0004](adr/ADR-0004-runtime-driven-architecture.md) | Runtime-Driven Architecture | Proposed | 2026-06-26 | None | None |
| [ADR-0005](adr/ADR-0005-settlement-system-boundaries.md) | Settlement system boundaries | Proposed | 2026-06-26 | None | None |
| [ADR-0006](adr/ADR-0006-economy-transaction-model.md) | Economy transaction model | Proposed | 2026-06-26 | None | None |
| [ADR-0007](adr/ADR-0007-auction-house-authority.md) | Auction house authority | Proposed | 2026-06-26 | None | None |
| [ADR-0008](adr/ADR-0008-city-treasury-tax-flow.md) | City treasury and tax flow | Proposed | 2026-06-26 | None | None |
| [ADR-0009](adr/ADR-0009-craft-order-lifecycle.md) | Craft order lifecycle | Proposed | 2026-06-26 | None | None |

## Registry by status

### Proposed

- [ADR-0002 — Entity positioning](adr/ADR-0002-entity-positioning.md)
- [ADR-0003 — Movement authority](adr/ADR-0003-movement-authority.md)
- [ADR-0004 — Runtime-Driven Architecture](adr/ADR-0004-runtime-driven-architecture.md)
- [ADR-0005 — Settlement system boundaries](adr/ADR-0005-settlement-system-boundaries.md)
- [ADR-0006 — Economy transaction model](adr/ADR-0006-economy-transaction-model.md)
- [ADR-0007 — Auction house authority](adr/ADR-0007-auction-house-authority.md)
- [ADR-0008 — City treasury and tax flow](adr/ADR-0008-city-treasury-tax-flow.md)
- [ADR-0009 — Craft order lifecycle](adr/ADR-0009-craft-order-lifecycle.md)

### Accepted

- [ADR-0001 — World coordinate system](adr/ADR-0001-world-coordinate-system.md)

### Superseded

None.

### Deprecated

None.

### Rejected

None.

## Next ADR number

Next available ADR number: ADR-010

This value must be rechecked immediately before creating a new ADR.

## Adding an ADR to the registry

1. Check the latest existing ADR number.
2. Create the ADR from the official template.
3. Add one row to the main registry table.
   For a new `Proposed` ADR, the registry date is `Date proposed`.
4. Add the ADR to the section matching its `Decision status`.
5. Update `Supersedes` and `Superseded by` relationships.
6. Check links.
7. Update `Last updated`.

## Updating an ADR status

- Never delete the old registry entry.
- Update the existing row.
- Keep the link to the ADR.
- Update the matching status section.
- Update the registry Date when the Decision status changes.
- Update replacement relationships.
- Never treat `Accepted` as a synonym for `Implemented`.
- Check the real state in the code and in `STATUS.md`.

## Relationship with implementation

This index records decisions.

It does not prove that a decision is implemented.

The code remains the technical source of truth. `STATUS.md` describes the
current project state.

Any divergence between an accepted ADR and the code must be reported.

## Validation rules

- [ ] Every indexed ADR file exists.
- [ ] Every ADR link is valid.
- [ ] Every ADR number is unique.
- [ ] Every Decision status matches the ADR file.
- [ ] Supersedes and Superseded by relationships are reciprocal.
- [ ] No example ADR is indexed as a real decision.
- [ ] The next available number is correct.

## Non-goals

- This document does not contain detailed decision reasoning.
- This document does not create any ADR.
- This document does not validate any ADR.
- This document does not prove that a decision is implemented.
- This document does not replace the code.
- This document does not replace `STATUS.md`.
- This document does not configure automation.

## Security notes

- Do not include sensitive data.
- Do not include secrets.
- Do not include real `.env` values.
- Security ADRs should be linked from this index without copying sensitive
  details.
- No ADR may make the client authoritative for security-sensitive gameplay
  decisions such as movement validation, mobility, collisions, permissions,
  resources, loot, inventories, or administrative actions.
- Client-side prediction and rendering MAY exist, but the authoritative
  decision must remain server-side.

## Performance notes

This document has no runtime impact.

The index should stay lightweight and should not copy performance analysis from
ADR files.

## Related files

- [Documentation Index](../README.md)
- [ADR Process](adr/README.md)
- [Architecture Overview](overview.md)
- [Client Server Boundaries](client-server-boundaries.md)
- [Documentation Guidelines](../09_Workflow/documentation-guidelines.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Who officially assigns the next ADR number?
- Who maintains this index?
- Should consistency checks between this index and ADR files be automated later?
- Which Proposed ADRs should be reviewed first for acceptance?

## TODO

- [ ] Validate this index with a human reviewer.
- [x] Create the first ADR only when a real decision needs to be recorded.
- [ ] Define future automated consistency checks.
- [ ] Move this document to `Review` when ready.
