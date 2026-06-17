# Architecture Decisions

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
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
| None | No real ADR has been created yet. | N/A | N/A | N/A | N/A |

## Registry by status

### Proposed

None.

### Accepted

None.

### Superseded

None.

### Deprecated

None.

### Rejected

None.

## Next ADR number

Next available ADR number: ADR-001

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
- When should the first real ADR be created?

## TODO

- [ ] Validate this index with a human reviewer.
- [ ] Create the first ADR only when a real decision needs to be recorded.
- [ ] Define future automated consistency checks.
- [ ] Move this document to `Review` when ready.
