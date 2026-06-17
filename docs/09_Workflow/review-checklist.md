# Review Checklist

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-17
- Depends on: docs/README.md, docs/10_AI/golden-rules.md, docs/09_Workflow/ai-assistant-workflow.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This checklist is used before validation, commit, or delivery of a change.

It helps reviewers check scope, architecture, security, performance,
documentation, tests, and Git state. It can be used by the project owner,
developers, conversational assistants, and repository-aware coding agents.

## Review usage

All sections SHOULD be reviewed.

Items that do not apply to the current change MAY be marked `N/A`. A critical
security point MUST NOT be skipped only because the change appears small.

## Review preparation

- [ ] Scope is clearly defined.
- [ ] Functional need is understood.
- [ ] Relevant files are identified.
- [ ] Existing systems have been searched.
- [ ] Dependencies are identified.
- [ ] `git status` has been checked.
- [ ] Pre-existing user changes are protected.
- [ ] No fixed solution was imposed before analysis for an important task.

## Scope review

- [ ] Only necessary files are modified.
- [ ] No opportunistic fix is included outside scope.
- [ ] No asset, secret, or generated file is modified without request.
- [ ] No public API is changed unintentionally.
- [ ] No stable user behavior is broken.
- [ ] No existing system is duplicated unnecessarily.

## Architecture review

- [ ] Change integrates with the existing architecture.
- [ ] Responsibility of each module is clear.
- [ ] Client, server, database, and tooling concerns are separated.
- [ ] No broad rewrite is included without justification.
- [ ] No unnecessary coupling is introduced.
- [ ] Data formats remain compatible.
- [ ] Major decisions are documented or planned for an ADR.
- [ ] `Draft` documents are not treated as final decisions.

## Security review

Mandatory question:

```text
What happens if the client is fully modified by a malicious user?
```

- [ ] Phaser client is not treated as authoritative.
- [ ] React and Zustand data are not treated as authoritative.
- [ ] Client-side maps, Tiled JSON, and tileset properties are not treated as authoritative.
- [ ] Movement is validated server-side where gameplay authority is required.
- [ ] Mobility and blocked zones are validated server-side where gameplay authority is required.
- [ ] Gameplay collisions are validated server-side where gameplay authority is required.
- [ ] Resources, loot, and inventories are validated server-side where relevant.
- [ ] Cooldowns, costs, and permissions are validated server-side where relevant.
- [ ] Client message frequency and abuse risks are considered.
- [ ] Replayed or duplicated client actions cannot produce duplicate gameplay effects.
- [ ] Ownership and access to targeted entities are validated server-side.
- [ ] Movement validation considers allowed speed, elapsed time, and forbidden teleports where relevant.
- [ ] Admin interface is treated as untrusted.
- [ ] Hiding a React button is not treated as authorization.
- [ ] Sensitive admin actions are authenticated and authorized by NestJS where relevant.
- [ ] No sensitive data is added to logs, prompts, or documentation.
- [ ] No real `.env` value is copied.

These checks are review requirements. They are not claims that every validation
is already implemented.

## Client review

For React, Vite, Phaser, and Zustand:

- [ ] Rendering logic is separated from gameplay authority.
- [ ] Zustand state is used only according to its client-side role.
- [ ] No critical server logic is moved into the client.
- [ ] Visual prediction can be corrected by the server where relevant.
- [ ] Listeners and subscriptions are cleaned up.
- [ ] Socket duplication is avoided.
- [ ] Obvious memory leaks are avoided.
- [ ] Client errors are handled.
- [ ] User behavior is preserved.

Mark non-applicable items as `N/A`.

## Server review

For NestJS and Socket.IO:

- [ ] Inputs are validated.
- [ ] Authentication and authorization are handled where required.
- [ ] Trust boundaries are clear.
- [ ] Errors are handled correctly.
- [ ] Socket.IO events are validated.
- [ ] Rate limiting or abuse protection is considered for exposed actions where relevant.
- [ ] Duplicate Socket.IO events are handled safely where they could create repeated effects.
- [ ] Critical operations are idempotent where retries or duplicated messages are possible.
- [ ] Broadcasts are limited to the necessary scope where possible.
- [ ] No unvalidated client data is trusted.
- [ ] Business logic remains in appropriate services.
- [ ] Existing modules keep their expected behavior.
- [ ] Logs do not expose secrets.

## Database review

For TypeORM and PostgreSQL:

- [ ] Existing entities are reused when relevant.
- [ ] Relations are coherent.
- [ ] Constraints and indexes are considered.
- [ ] Potentially expensive queries are identified.
- [ ] No destructive migration is included without validation.
- [ ] Existing data remains compatible.
- [ ] Transactions are used where needed.
- [ ] Concurrent updates and race conditions are considered.
- [ ] Critical inventory, loot, resource, or economy operations use appropriate transaction or locking strategies where needed.
- [ ] Temporary data is not persisted unnecessarily.
- [ ] Static data and instance state remain distinct.
- [ ] `synchronize` is not treated as a production strategy.

Do not claim that a migration exists if it was not created.

## World, maps and assets review

- [ ] Chunk size and format are coherent with the existing project.
- [ ] Coordinates and projection are coherent.
- [ ] Tiled data is separated from server authority.
- [ ] Visual collisions are separated from gameplay collisions.
- [ ] Assets are reusable.
- [ ] Naming conventions are respected.
- [ ] No existing asset is replaced without validation.
- [ ] No asset path is broken.
- [ ] Memory and loading impact is considered.
- [ ] Local map modification cannot be used as server truth.

## Admin review

- [ ] Roles are checked server-side.
- [ ] Permissions are checked server-side.
- [ ] Target identifiers are validated.
- [ ] Incoming data is validated.
- [ ] Dangerous commands are protected.
- [ ] Mass operations require explicit confirmation where relevant.
- [ ] Action result is returned clearly.
- [ ] Partial errors are handled.
- [ ] Future traceability need is reported for critical operations.
- [ ] No authorization or security control relies only on client-side visibility or UI state.
- [ ] Critical or repeatable admin operations are protected against accidental duplicate execution where relevant.

## Performance review

- [ ] Server CPU load is considered.
- [ ] Client and server memory are considered.
- [ ] SQL query count is considered.
- [ ] N+1 query risk is considered.
- [ ] Socket.IO message frequency is considered.
- [ ] Payload size is considered.
- [ ] Update frequency is considered.
- [ ] Number of loaded chunks and entities is considered.
- [ ] Phaser resources are cleaned up where relevant.
- [ ] MMORPG scalability is considered.
- [ ] Premature optimization without measurement is avoided.

Use `N/A` when the point does not apply.

## Tests and verification

- [ ] Available scripts are identified before execution.
- [ ] No command is invented.
- [ ] Targeted tests are executed where relevant.
- [ ] Tests not executed are reported.
- [ ] TypeScript is checked when relevant.
- [ ] Lint is executed when available and relevant.
- [ ] Build is executed when relevant.
- [ ] Manual scenario is verified when needed.
- [ ] Main regression risk is tested.
- [ ] Results distinguish `Verified`, `Not verified`, `Assumed`, and `Not implemented`.

## Documentation review

- [ ] Documentation is updated when needed.
- [ ] No nonexistent behavior is documented as implemented.
- [ ] Real files are referenced.
- [ ] Relative links are valid.
- [ ] Documentation status is coherent.
- [ ] `TBD` is used for unknown information.
- [ ] ADR is created only for a real important decision.
- [ ] Unnecessary duplication is avoided.
- [ ] No secret is documented.
- [ ] `docs/README.md` is updated when a file is renamed or added.

## AI and coding-agent review

- [ ] Actual tool capabilities are known.
- [ ] Repository access is not assumed.
- [ ] No file is claimed as read without proof.
- [ ] Analysis is separated from implementation for important tasks.
- [ ] Scope is explicit.
- [ ] Allowed and forbidden files are stated.
- [ ] Out-of-scope changes are reported, not modified.
- [ ] Errors and uncertainties are declared.
- [ ] Assistant proposals are not treated as human validation.
- [ ] No commit or push happens without explicit request.

## Git review

- [ ] `git status --short` was checked before and after.
- [ ] Modified files are known.
- [ ] Diff was reviewed.
- [ ] Staged files are limited to scope.
- [ ] `git add .` and untargeted `git add -A` were not used without validated reason.
- [ ] Deletions and renames are correctly tracked.
- [ ] Commit message is coherent.
- [ ] Working tree is clean after commit when expected.
- [ ] No force push is used.
- [ ] Push happens only after human validation.

## Final decision

- [ ] Approved
- [ ] Approved with follow-up work
- [ ] Changes requested
- [ ] Blocked

Reviewer:

Date:

Reviewed commit or diff:

Remaining risks:

Follow-up tasks:

## Non-goals

- This checklist does not replace tests.
- This checklist does not replace code analysis.
- This checklist is not proof of security.
- This checklist does not replace human validation.
- This checklist does not force every test for every change.
- This checklist does not automatically configure any tool.

## Security notes

The client and admin interface are untrusted. The server remains authoritative
for gameplay rules. Secrets are forbidden in review output, prompts, and
documentation. Review depth should follow the risk of the change.

## Performance notes

This checklist has no runtime impact.

It helps avoid changes that are unexpectedly costly or not scalable.

## Related files

- [Documentation Index](../README.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [AI Assistant Workflow](ai-assistant-workflow.md)
- [Development Workflow](development.md)
- [Documentation Guidelines](documentation-guidelines.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [CLAUDE.md](../../CLAUDE.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Which future criteria should adapt this checklist by task type?
- Which checks should eventually be automated?
- What procedure should move this document to `Review` and then `Stable`?

## TODO

- [ ] Validate this checklist with a human reviewer.
- [ ] Test this checklist on a real modification.
- [ ] Reduce duplication if specialized documents cover the same checks later.
- [ ] Create specialized variants only if real usage justifies them.
