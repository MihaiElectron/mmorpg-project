# Documentation Guidelines

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/10_AI/golden-rules.md, docs/09_Workflow/ai-assistant-workflow.md, docs/09_Workflow/review-checklist.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents, documentation tooling

## Scope

This document defines how project documentation is created, updated, validated,
and maintained.

It applies to human-written documentation under `docs/`, documentation updates
made during code changes, and documentation prepared with AI assistance.

## Sources of truth

Use this order when documentation and implementation disagree:

1. Implemented code.
2. Validated ADRs.
3. Specialized documentation.
4. `STATUS.md`.
5. AI instruction files.

If sources conflict, do not choose silently. Verify the code, check ADRs, and
report the contradiction.

## Documentation lifecycle

- `Draft`: document in progress. It is not canonical.
- `Review`: complete proposal waiting for validation.
- `Stable`: validated document usable as a reference.
- `Deprecated`: document that should not be used for new work.
- `Archived`: document kept only for history.

## Status changes

- [ ] `Draft` MAY be used while a document is being written.
- [ ] Moving to `Review` requires explicit human validation confirming that
  the document is ready to be reviewed.
- [ ] Moving to `Stable` requires explicit human validation after reviewing the
  content, links, and coherence with the relevant code and ADRs.
- [ ] Moving to `Deprecated` or `Archived` requires human validation and should
  state the reason or replacement document when one exists.
- [ ] A human project owner validates important status changes.
- [ ] The document content is reviewed against the implemented code.
- [ ] Related links are checked.
- [ ] Related ADRs are checked when architecture is involved.
- [ ] Security notes are reviewed when trust, secrets, or permissions are involved.
- [ ] Performance notes are reviewed when runtime behavior is involved.
- [ ] `Stable` is never assigned automatically.

A document MUST NOT move to `Stable` only because an assistant completed a
draft.

No assistant can promote a document alone.

## Documentation updates

- Update documentation with the related code change when relevant.
- Do not document a feature as implemented unless it exists.
- Use `TBD` when information is unknown.
- Reference real files in `Related files`.
- Report contradictions instead of hiding them.
- Preserve existing documentation when a small update is enough.
- Avoid broad rewrites unless the document structure is the actual task.

## Organization

Documentation lives under `docs/`.

Canonical top-level folders are numbered:

```text
00_Project
01_Architecture
02_Security
03_Client
04_Server
05_World
06_Database
07_Admin
09_Workflow
10_AI
```

Rules:

- Use lowercase `kebab-case` filenames, except conventional `README.md`.
- Keep documents in the closest matching canonical folder.
- Do not create a new category without a real need.
- Update `docs/README.md` when a document is added, moved, or renamed.
- Keep generated or experimental documentation out of the human documentation
  tree until a structure is validated.

## Required metadata

Each human-written documentation file MUST contain:

- `Status`
- `Owner`
- `Last updated`
- `Depends on`
- `Used by`

`Last updated` MUST use the `YYYY-MM-DD` format.

Use `TBD` only when the value is not known yet.

## Common sections

Each human-written documentation file MUST keep these common sections:

- `Scope`
- `Non-goals`
- `Security notes`
- `Performance notes`
- `Related files`
- `Open questions`
- `TODO`

Specialized sections MAY be added between `Scope` and `Non-goals`.

Generated documentation MAY follow another template only after its structure has
been explicitly validated.

## ADR guidelines

Create an ADR for important architecture decisions, such as:

- Changing source of authority.
- Changing client/server boundaries.
- Changing persistence strategy.
- Introducing major dependencies.
- Changing network protocol or real-time architecture.
- Making a decision with long-term maintenance cost.

Do not create an ADR for trivial edits, formatting changes, small copy updates,
or implementation details that do not represent a durable decision.

Descriptive documentation explains what exists. An ADR records a validated
decision and its context.

## Security rules

- Never include secrets.
- Never include real `.env` values.
- Never include credentials.
- Do not include real personal or sensitive user data in documentation.
- Use synthetic or properly anonymized examples.
- Human approval alone does not make secrets, credentials, or sensitive
  personal data suitable for documentation.
- Do not copy tokens, passwords, private keys, connection strings, or production
  identifiers into documentation.

## Generated documentation

Generated documentation does not exist yet.

If it is introduced later, it SHOULD remain separate from human-written
documentation. Do not create `docs/generated/` until the structure is validated.

Generated output MUST NOT replace source-of-truth code review or validated
human documentation.

## Prompt library

A prompt library does not exist yet.

Do not create `docs/prompts/` until recurring usage proves the need. Future
prompt templates should be based on real project workflows, not speculative
automation.

## Documentation review

Before validating a documentation change, check:

- [ ] Relative links are valid.
- [ ] Content matches implemented code.
- [ ] No nonexistent feature is documented as implemented.
- [ ] Status is coherent.
- [ ] Duplicated content is avoided.
- [ ] `TBD` is used for unknown information.
- [ ] `docs/README.md` is updated when needed.
- [ ] The review checklist was considered.

Use [Review Checklist](review-checklist.md) for broader validation.

## Non-goals

- This document does not replace code review.
- This document does not create ADRs.
- This document does not create generated documentation.
- This document does not create a prompt library.
- This document does not validate any document as `Stable`.
- This document does not automatically configure documentation tooling.

## Security notes

Documentation must not contain secrets, real environment values, credentials, or
personal data. Security-sensitive examples must be anonymized.

The client/server trust model should be documented carefully and must not imply
that the client is authoritative.

## Performance notes

This document has no runtime impact.

Documentation should still describe performance-sensitive behavior carefully and
avoid presenting unverified scalability claims as implemented facts.

## Related files

- [Documentation Index](../README.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [AI Assistant Workflow](ai-assistant-workflow.md)
- [Review Checklist](review-checklist.md)
- [ADR README](../01_Architecture/adr/README.md)
- [CLAUDE.md](../../CLAUDE.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- What exact procedure should move a document from `Draft` to `Review`?
- What exact procedure should move a document from `Review` to `Stable`?
- Should future generated documentation have its own lifecycle?
- When should a prompt library be introduced?

## TODO

- [ ] Validate these guidelines with a human reviewer.
- [ ] Test these guidelines on a real documentation change.
- [ ] Align specialized documents with these rules when they are filled.
- [ ] Define the exact `Review` and `Stable` promotion procedure.
