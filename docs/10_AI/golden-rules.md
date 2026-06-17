# Golden Rules

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-17
- Depends on: docs/README.md, CLAUDE.md, README.md, STATUS.md
- Used by: ChatGPT, Codex, AI assistants, developers

## Scope

This document defines the general behavior rules for AI assistants working in
this repository.

It applies to ChatGPT, Codex, and any assistant that helps with code,
documentation, reviews, analysis, or planning for this MMORPG project.

It does not replace the code, ADRs, specialized documentation, human validation,
or tests. It defines how assistants should reason before changing anything.

## 1. Analyze before modifying

AI assistants MUST analyze the existing project before important changes.

Complete prior analysis is mandatory when a change affects:

- Multiple files or modules.
- Architecture.
- Security.
- Network behavior.
- Gameplay authority.
- The database.
- A dependency.
- Data formats.
- Public APIs.
- Shared files or assets.

Before proposing or applying a change, the assistant SHOULD:

- Read the relevant files.
- Search for existing systems.
- Identify dependencies.
- Identify conventions already used in the project.
- Check `git status`.
- Avoid presenting a fixed solution before this analysis.

When Codex has repository access, it SHOULD read the files itself instead of
asking the user to paste them.

Simple tasks MAY still be executed directly when their scope and consequences
are clear.

## 2. Never assume that a system is absent

An assistant MUST NOT claim that something does not exist without searching for
it first.

The search SHOULD include, when relevant:

- Existing abstractions.
- Services.
- React components.
- Zustand stores.
- Phaser scenes and systems.
- NestJS modules.
- TypeORM entities.
- Socket.IO gateways.
- Shared utilities.
- Existing documentation.

Absence can only be stated after a reasonable search.

## 3. Preserve stable architecture

Assistants SHOULD integrate with existing stable systems before creating new
ones.

They MUST avoid unnecessary rewrites. They SHOULD:

- Prefer minimal evolution over full replacement.
- Limit the number of touched files.
- Preserve public APIs unless a change is explicitly validated.
- Preserve user-facing behavior unless the task requires changing it.
- Avoid deleting stable solutions without validated justification.

## 4. Respect the scope strictly

Assistants MUST keep changes inside the requested scope.

They MUST NOT:

- Modify unrelated files.
- Fix nearby issues without being asked.
- Modify assets, configuration, or secrets outside the task scope.
- Use `git add .` or `git add -A` without explicit user approval.
- Overwrite pre-existing user changes.

Pre-existing changes SHOULD be reported and preserved.

## 5. Security first

Every gameplay or network proposal MUST ask:

```text
What happens if the client is fully modified by a malicious user?
```

General rules:

- The Phaser client is untrusted.
- The client sends intentions, not truths.
- The server MUST validate movements.
- The server MUST validate mobility.
- The server MUST validate gameplay collisions.
- The server MUST validate actions, costs, cooldowns, and permissions.
- The server MUST validate resources, loot, and inventories.
- Client data MUST NOT become authoritative only because it matches the display.
- Visual client checks never replace server validation.

Authoritative movement and collision rules:

- Map files available to the client are modifiable.
- Tiled or JSON data loaded by Phaser on the client is untrusted.
- Client-side tileset properties are untrusted.
- Collisions computed only by Phaser cannot be authoritative for gameplay.
- Zustand state cannot be authoritative for the server.
- Mobility, blocked zones, and gameplay collisions MUST be validated with
  authoritative server-side data.
- Locally modifying a tile, collision, or `walkable` property MUST NOT allow a
  player to cross a forbidden area.
- Client-side visual prediction MAY exist, but the server MUST be able to
  reject or correct movement.

Admin tool rules:

- The admin interface remains an untrusted client.
- Hiding a button in React is not authorization.
- Each sensitive admin action MUST be authenticated, authorized, and validated
  by NestJS.
- Roles, permissions, submitted data, and target identifiers MUST be checked on
  the server.
- An admin operation MUST NOT be accepted only because it comes from the
  official admin interface.
- Critical admin operations SHOULD be traceable when the matching architecture
  is defined.

These are security rules, not claims that every validation is already fully
implemented.

## 6. Separate rendering and authority

Assistants SHOULD keep rendering concerns separate from gameplay authority.

General model:

- Phaser mainly handles rendering and local interactions.
- React handles application UI.
- Zustand shares client state according to the existing architecture.
- NestJS remains responsible for server-side rules.
- PostgreSQL stores persistent state according to existing models.
- Tiled is a content creation tool, not runtime authority.

Precise implementation details must be verified in code before being documented
as implemented.

## 7. Work progressively

Assistants SHOULD favor small, verifiable steps.

The expected approach is:

- One step at a time.
- Validate before the next step.
- Keep changes small.
- Run targeted tests when relevant.
- Review the diff.
- Avoid broad refactors unless explicitly requested.

## 8. Ask for files before isolated rewrites

When ChatGPT does not have repository access, it SHOULD ask for the current file
content before rewriting it.

For code or documentation edits, assistants SHOULD:

- Preserve existing code and comments when possible.
- Complete or adjust existing files instead of replacing them wholesale.
- Use Codex for analysis that depends on multiple files.

When Codex already has repository access, it SHOULD inspect the repository
directly.

## 9. Keep documentation faithful

Assistants MUST NOT document a behavior as implemented unless it exists.

Documentation rules:

- Use `TBD` when information is unknown.
- Reference real files.
- Update documentation with important changes.
- Do not change a document to `Stable` without validation.
- Use an ADR for important architecture decisions.
- Never put secrets in documentation.

## 10. Tests and validation

Assistants SHOULD run relevant tests when changes affect behavior.

They MUST NOT claim that a test passed if it was not executed.

Reports SHOULD distinguish clearly between:

- Verified.
- Not verified.
- Assumed.
- Not implemented.

Assistants MUST use only scripts and commands that actually exist in the
project. They MUST NOT invent npm commands.

## 11. Git

Assistants SHOULD check `git status` before and after work.

They MUST:

- Preserve user changes.
- Avoid force push.
- Avoid commits or pushes unless explicitly requested.
- Stage only files in scope.
- Provide the list of modified files.

## 12. Manage uncertainty

Assistants MUST make uncertainty visible.

They SHOULD:

- Search before concluding.
- Report failures clearly.
- Avoid inventing files, routes, tables, APIs, or tools.
- Propose a Codex repository analysis when the answer depends on multiple files.

## 13. Recommended workflow

The recommended cycle is:

```text
Functional need
-> existing-system analysis by Codex
-> report without modification
-> human validation
-> minimal evolution
-> tests
-> security and performance review
-> documentation update
-> targeted commit
```

Simple tasks MAY be executed directly when their scope and consequences are
clear.

## 14. Actions forbidden without explicit validation

Assistants MUST NOT perform these actions without explicit validation:

`Explicit validation` means an explicit request or confirmation from the user
or the human project owner. An assistant proposal does not validate itself.

- Global rewrites.
- Stack changes.
- Destructive database migrations.
- Mass deletion.
- `.env` file modification.
- Asset modification or replacement.
- Mass file moves.
- Security rule changes.
- Network protocol changes.
- Gameplay authority source changes.
- Force push.
- Introduction of a major dependency.
- Premature documentation automation.

## Non-goals

- This file does not describe the full architecture.
- This file does not replace domain-specific documents.
- This file is not a gameplay specification.
- This file does not replace tests.
- This file does not give authority to the client.
- This file does not automatically configure AI tools.

## Security notes

The client/server trust model must assume that client code can be modified by a
malicious user.

Secrets, tokens, real environment values, and private credentials MUST NOT be
copied into documentation, prompts, logs, commits, or examples.

## Performance notes

This document has no runtime impact.

AI proposals SHOULD still consider:

- Server load.
- Network traffic.
- Memory usage.
- Processing frequency.
- Scalability.
- MMORPG-scale volume.

## Related files

- [Documentation Index](../README.md)
- [Codex ChatGPT Workflow](../09_Workflow/codex-chatgpt.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [CLAUDE.md](../../CLAUDE.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- How should AI context be loaded automatically in the future?
- When should a prompt library be introduced?
- When should generated documentation be introduced?
- What is the exact procedure for moving a document from `Draft` to `Stable`?

## TODO

- [ ] Validate these rules with a human reviewer.
- [ ] Compare these rules with specialized documents once they are filled.
- [ ] Move this document to `Review` when the rules are ready for validation.
- [ ] Add future rules only when a real project need appears.
