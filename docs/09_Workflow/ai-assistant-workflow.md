# AI Assistant Workflow

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-17
- Depends on: docs/README.md, docs/10_AI/golden-rules.md, CLAUDE.md, README.md, STATUS.md
- Used by: Project owner, ChatGPT, Claude, Codex, Claude Code, AI assistants, coding agents, developers

## Scope

This document defines the collaboration workflow between the human project
owner, conversational assistants, repository-aware coding agents, project
documentation, and Git.

It explains who does what, in which order, and how to avoid imposing a new
solution before checking whether a stable system already exists.

The same AI product can have different capabilities depending on how it is used.
Claude in a conversation may not have repository access. Claude Code may have
repository access. ChatGPT may work from supplied files or reports. Codex can
analyze the repository only when repository access is actually provided.

It complements [Golden Rules](../10_AI/golden-rules.md). It does not repeat
every rule from that document.

## Purpose

This workflow is used to:

- Use an agent that actually has repository access to analyze the existing
  implementation.
- Use a conversational assistant for clarification, task preparation, and report
  analysis.
- Preserve the existing architecture.
- Avoid out-of-scope changes.
- Keep human validation before important decisions.

Examples include ChatGPT, Claude, Codex, Claude Code, and equivalent tools.

## Roles and responsibilities

### Human project owner

The human project owner:

- Defines the functional need.
- Validates important decisions.
- Chooses trade-offs.
- Authorizes risky changes.
- Decides when commits and pushes happen.
- Remains the final authority for the project.

### Conversational assistant

A conversational assistant is mainly used to:

- Clarify the need.
- Reason about architecture.
- Identify risks.
- Prepare prompts or instructions.
- Analyze reports.
- Review security, coherence, and performance.
- Guide the work step by step.

Examples include ChatGPT, Claude, and other chat assistants.

When it does not have repository access, it MUST NOT claim to know the full
repository state. It should use supplied files, documentation, a verified
analysis report, or ask for missing information.

### Repository-aware coding agent

A repository-aware coding agent is mainly used to:

- Analyze repository files it can actually access.
- Search for existing systems.
- Identify dependencies.
- Apply validated changes.
- Execute available checks.
- Report diffs, tests, modified files, and Git results.

Examples include Codex, Claude Code, and other repository-aware development
agents.

The agent MUST verify its actual access. It MUST NOT claim to have analyzed a
file it did not read.

It MUST NOT decide alone:

- A major rewrite.
- An architecture change.
- A security change.
- A gameplay authority change.

## Standard workflow

The default workflow is:

```text
1. Functional need
2. Clarification and risk identification with a conversational assistant
3. Repository analysis by a repository-aware coding agent, without modification
4. Structured analysis report
5. Human validation
6. Minimal implementation by the repository-aware coding agent
7. Tests and targeted verification
8. Architecture, security, and coherence review
9. Documentation update
10. Targeted commit
11. Push only after explicit human approval
```

Simple and local tasks MAY use a shorter workflow when:

- The scope is obvious.
- The consequences are low.
- No architecture or security change is involved.

## Analysis-first prompts

A repository-aware coding agent analysis prompt SHOULD usually ask the agent to:

- Modify no files.
- Search for the existing implementation.
- List relevant files.
- Identify dependencies.
- Identify stable behavior to preserve.
- Report security and performance risks.
- Propose multiple options only when useful.
- Avoid inventing a missing system.

It may be used with Codex, Claude Code, or an equivalent agent that actually has
repository access.

Short generic example:

```text
Analyze the existing implementation without modifying files.

Identify:
- existing systems;
- relevant files;
- dependencies;
- stable behavior to preserve;
- security and performance risks.

Do not implement anything.
Return a structured report.
```

## Implementation prompts

An implementation prompt SHOULD specify:

- Allowed files.
- Forbidden files.
- Exact scope.
- Behaviors to preserve.
- Expected tests.
- Security constraints.
- Git rules.
- No commit or push unless explicitly requested.

For important tasks, an implementation prompt SHOULD be sent only after a
repository analysis.

The prompt should target a repository-aware coding agent, not a tool that lacks
repository access.

## File handling rules

When an assistant has verified repository access, it SHOULD inspect the relevant
files directly.

When it does not have repository access, it SHOULD request the required file
contents or rely on a verified repository analysis.

Assistants SHOULD:

- Avoid assuming they have unconfirmed repository access.
- Preserve existing code and comments when possible.
- Extend the existing file instead of replacing it wholesale.
- Avoid inventing a file that was not found.
- Avoid modifying generated files, secrets, runtime volumes, or assets outside
  the task scope.

An analysis report does not replace reading the file when a precise modification
is required.

## Scope control

One task should have one clear scope.

Assistants SHOULD:

- Keep changes minimal.
- Avoid opportunistic fixes.
- Report nearby issues instead of fixing them without approval.
- Preserve user changes.
- Check `git status` before and after work.

## Security review

Any change related to Phaser, movement, maps, collisions, Tiled, Zustand,
Socket.IO, resources, loot, inventories, admin, or permissions MUST check that
the NestJS server remains authoritative.

Review reminders:

- The Phaser client is untrusted.
- The admin interface is untrusted.
- React controls do not replace server validation.
- Client maps or client-side properties cannot decide mobility alone.

These are review requirements, not claims that every validation is already
implemented.

## Review of coding agent output

After a coding agent task, the report SHOULD include:

- Modified files.
- Summary of changes.
- Tests executed.
- Tests not executed.
- Errors, if any.
- Result of `git status --short`.
- Confirmation that no out-of-scope file was modified.
- Confirmation that no commit or push happened, unless explicitly requested.

## Project instruction files

Agents SHOULD read project instruction files that exist and apply to the
repository.

Current instruction and context files include:

```text
README.md
CLAUDE.md
docs/README.md
docs/10_AI/golden-rules.md
docs/09_Workflow/ai-assistant-workflow.md
STATUS.md
```

An instruction file MUST NOT be invented. More instruction files may be added
later. Contradictions MUST be reported. Applicable instructions do not replace
human validation for risky actions.

## Git workflow

Assistants SHOULD NOT use `git add .` or `git add -A` by default.

Git workflow rules:

- Stage only files in scope.
- Verify the staged diff.
- Create targeted commits.
- Never force push.
- Never push without explicit human validation.
- Keep the working tree clean before the next step when possible.

## Documentation workflow

Important changes SHOULD update the related documentation.

Documentation rules:

- Do not document behavior as implemented without proof.
- Record major decisions in ADRs.
- Treat `Draft` documents as non-final.
- Do not treat generated documentation as available yet.
- Do not treat a prompt library as available yet.

## Session handoff

To continue work in another chat or agent session, provide at least:

```text
docs/README.md
docs/10_AI/golden-rules.md
docs/09_Workflow/ai-assistant-workflow.md
docs/09_Workflow/review-checklist.md
STATUS.md
```

Add specialized documents when they are relevant to the task.

The new assistant or agent SHOULD:

- Read the provided documents.
- Check their status.
- Avoid treating `Draft` documents as final decisions.
- Request an analysis by a repository-aware coding agent when the real
  repository state is missing.

An assistant without repository access MUST receive the required files or
verified reports. An agent with repository access MUST verify the real state
before modifying anything.

## Anti-patterns

- Proposing a new architecture without searching the existing one.
- Asking for a full rewrite by default.
- Mixing analysis and implementation in a risky task.
- Modifying several domains without validated scope.
- Treating client data as truth.
- Inventing a file or command.
- Committing or pushing without authorization.
- Documenting a feature that is not implemented.
- Assuming a tool automatically has full repository access.
- Claiming to have read or tested inaccessible content.
- Creating separate contradictory workflows for each AI provider.
- Treating an assistant proposal as human validation.

## Non-goals

- This document does not replace the Golden Rules.
- This document does not describe the full architecture.
- This document is not a complete prompt library.
- This document does not automatically configure any AI assistant or coding agent.
- This document does not create automation scripts.
- This document does not replace human review.

## Security notes

The NestJS server remains the authority for gameplay rules.

The client and admin interface are untrusted. Secrets must stay out of prompts
and documentation. Real `.env` values MUST NOT be copied.

## Performance notes

This document has no runtime impact.

Any proposal SHOULD still consider:

- Server load.
- Network traffic.
- Message frequency.
- Chunk and entity volume.
- Client and server memory.
- MMORPG scalability.

## Related files

- [Documentation Index](../README.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [Development Workflow](development.md)
- [Review Checklist](review-checklist.md)
- [Documentation Guidelines](documentation-guidelines.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [CLAUDE.md](../../CLAUDE.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- When should a prompt library be created?
- How should documentation and assistants be synchronized?
- Should AI context be loaded automatically in the future?
- What level of autonomy should agents receive later?
- Which criteria allow the analysis cycle to be reduced for a simple task?

## TODO

- [ ] Validate this workflow with a human reviewer.
- [ ] Compare this workflow with specialized documents once they are filled.
- [ ] Move this document to `Review` when it is ready for validation.
- [ ] Create prompt templates only after real usage patterns appear.
- [ ] Periodically check for duplication with `golden-rules.md`.
