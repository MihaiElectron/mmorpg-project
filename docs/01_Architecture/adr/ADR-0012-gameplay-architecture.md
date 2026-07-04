# ADR-0012 — Gameplay Architecture V1

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-06-29
- Date proposed: 2026-06-29
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on:
  - docs/01_Architecture/adr/ADR-0010-object-runtime-model.md
  - docs/01_Architecture/adr/ADR-0011-item-materialization-pipeline.md
  - docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md
  - docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md
  - docs/09_Workflow/runtime-roadmap.md
  - docs/08_Gameplay/item-taxonomy.md
  - docs/08_Gameplay/object-runtime-architecture.md
- Used by: Project owner, backend developers, gameplay designers,
  repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents:
  - docs/09_Workflow/runtime-roadmap.md
  - docs/09_Workflow/technical-debt.md
  - docs/08_Gameplay/object-runtime-architecture.md
  - docs/08_Gameplay/item-taxonomy.md
- Related code: N/A

---

## Context

Runtime V2 is complete as of 2026-06-29 (tag `runtime-v2-final`).

The following foundations are stable and available to Gameplay V1:

- `ItemInstance` with 20 transitions across 10 domains (Equipment, WorldItem,
  Loot, Craft, Auction, Bank, Mail, GuildStorage, Housing, Trade).
- `ItemTransferService` as the sole mutating authority for `ItemInstance` state,
  container, and owner.
- `ItemMaterializationService` as the sole creator of new `ItemInstance` rows.
- `EconomyService` with bronze Wallet and LedgerEntry for all monetary flows.
- `LootService` as the pure probabilistic drop generator.
- `SkillDefinition` catalogue with categories and definitions.
- `CraftingRecipe` catalogue with ingredients, results, station requirements, and
  skill prerequisites.
- `CraftingStation` with WU-based interaction radius validated server-side.
- `WorldService.checkInteraction` as the server-authoritative distance guard.
- Four WebSocket gateways (`WorldGateway`, `ResourcesGateway`, `CreaturesGateway`,
  `WorldItemsGateway`) for real-time gameplay.

The current `Creature` combat loop is functional but not extensible: attacks are
flat damage with no skill integration, no ability costs, no cooldowns, no cast
system, and no buff/debuff model. Skills are definable in the catalogue but do
not drive any gameplay outcomes yet.

Gameplay V1 must build on these foundations without recreating parallel systems.
Each new domain must comply with the Runtime model established in ADR-0010 and
ADR-0011 rather than introducing independent state management.

---

## Problem

Without an architecture decision, each Gameplay V1 feature risks:

- hardcoding game logic inside WebSocket gateways (handlers become authoritative);
- creating new damage or effect systems that bypass `EconomyService` for currency
  rewards or `ItemMaterializationService` for item rewards;
- implementing skill level-ups or cooldowns as client-side state that the server
  does not validate;
- duplicating entity state (for example, storing HP both in a creature entity and
  in a separate real-time struct without a clear authority rule);
- scattering effect resolution across multiple services with no shared contract
  (a fight does damage, a craft does damage to durability, a potion heals — all
  via different code paths that cannot be composed or tested uniformly).

---

## Decision Drivers

- All gameplay outcomes that affect persistent state are server-authoritative.
- The client sends intentions (cast, move, interact) and receives results; it
  never decides item rewards, damage final values, currency transfers, XP grants,
  or ownership changes.
- Gameplay features reuse Runtime V2 foundations: `ItemTransferService`,
  `ItemMaterializationService`, `EconomyService`. No new ownership system is
  introduced.
- Effects (damage, heal, buff, debuff, XP, item reward, currency reward) must be
  expressible through a shared composable contract so that combat, skills, quests,
  crafting, and events all produce effects in the same way.
- Distance, ownership, and authorization guards already established in Runtime V2
  must be reused, not bypassed.
- The DevTools / Studio SDK inspects and corrects gameplay state; it does not
  compute or simulate it.
- Every new domain with persisted state must have at least one spec file with unit
  tests before being considered complete.

---

## Decision

### 1. Server Authority

All gameplay calculations with a persistent consequence are resolved on the server.

This includes: damage computation, healing amounts, XP rewards, skill level
thresholds, cooldown enforcement, cast success, drop probability, crafting success,
quality rolls, quest objective validation, and ownership changes.

The client renders and animates results. It never decides the final value of any
of the above.

Implications:

- A gateway handler receives a player intention (e.g., `use_ability { abilityId,
  targetId }`). It validates the request, delegates to a service, and returns the
  outcome. The gateway does not contain game logic.
- No game formula lives in `.jsx`, `.tsx`, `.js`, or any frontend file.
- Distance checks always use WU-based `WorldService.checkInteraction` or an
  equivalent WU comparison. Pixel distances are never used for gameplay decisions.

### 2. Gameplay Domains

Gameplay V1 organizes around the following domains. Each domain is a server-side
NestJS module with its own service, tests, and integration into the Runtime V2
foundation.

| Domain | Primary responsibility |
|---|---|
| **Skills** | Skill progression (XP, level, unlocks), skill catalogue, active/passive distinction |
| **Effects** | Composable effect execution: damage, heal, buff, debuff, XP, item reward, currency reward, spawn, teleport, unlock |
| **Combat** | Initiative, ability use, hit resolution, threat, leash, flee |
| **Gathering** | Tool requirement, yield quality, XP gain, gather duration, resource depletion |
| **Crafting** | Quality rolls, craftedBy provenance, recipe unlock, station validation |
| **Quests** | Quest definition catalogue, quest progress Runtime, objective tracking, reward dispatch |
| **AI** | Creature behavior trees: patrol, aggro, leash, flee, faction |
| **Economy** | Market price discovery, NPC vendor logic, tax, treasury flow |
| **Social** | Guild management, party system, channel communication |
| **Content** | Item, creature, map, and reward content pipeline |

These domains are not independent silos. They share Runtime V2 contracts and
must not duplicate ownership, item identity, or currency logic.

### 3. Skill Architecture

#### 3.1 SkillDefinition (catalogue — already implemented)

`SkillDefinition` defines a skill that exists in the game world:

- `key`: unique string identifier;
- `name`: display label;
- `category`: `combat | gathering | crafting | magic | profession | passive`;
- `description`;
- `maxLevel`;
- optional `requiredSkillKey` prerequisite.

`SkillDefinition` is catalogue data. It does not hold any player state.

#### 3.2 SkillRuntime (player state — not yet implemented)

A future `SkillRuntime` entity (or equivalent) holds one row per
(character, skill) pair:

- `characterId`;
- `skillKey` (references SkillDefinition);
- `level`;
- `currentXp`;
- `nextLevelXp`.

`SkillRuntime` is the persisted Runtime state for a character's skill progression.
It must never be computed client-side. The client only reads the values sent by
the server.

#### 3.3 SkillUse (event — not yet implemented)

A `SkillUse` represents one invocation of an active skill. It is ephemeral
(in-memory or short-lived DB row) and carries:

- which skill was used;
- by whom and on which target;
- at which position (WU);
- at which server timestamp.

`SkillUse` is consumed by the Effect Engine to resolve the outcome.

#### 3.4 SkillCooldown (Runtime state — not yet implemented)

A cooldown is server-authoritative. After a skill is used, the server records
`lastUsedAt` and `cooldownMs`. Any subsequent use request before the cooldown
expires is rejected with a structured error.

The client displays an estimated cooldown indicator for UX purposes only. It
does not enforce the cooldown.

#### 3.5 Active vs Passive distinction

Active skills are triggered by explicit player or system events (combat ability,
gathering action, craft step).

Passive skills apply automatically when conditions are met (damage bonus when HP
below threshold, speed bonus when carrying weight under limit). The server
evaluates passive conditions; it does not expose the formula to the client.

### 4. Effect Engine

An Effect Engine resolves composable gameplay outcomes.

#### 4.1 Effect types

| Effect type | Description |
|---|---|
| `DAMAGE` | Reduce target HP by a computed amount |
| `HEAL` | Increase target HP by a computed amount (up to max HP) |
| `BUFF` | Apply a timed positive modifier to target stats |
| `DEBUFF` | Apply a timed negative modifier to target stats |
| `XP_REWARD` | Grant XP to a character skill via `SkillRuntime` |
| `ITEM_REWARD` | Create item(s) for a character via `ItemMaterializationService` |
| `CURRENCY_REWARD` | Credit bronze to a wallet via `EconomyService` |
| `CURRENCY_COST` | Debit bronze from a wallet via `EconomyService` |
| `TELEPORT` | Move a character or creature to a WU position |
| `SPAWN` | Create a world entity (creature, resource, item) |
| `UNLOCK` | Unlock a recipe, quest, ability, or access gate |

#### 4.2 Composability

Effects are composable. A single ability, quest reward, or crafting result can
produce a list of effects. The Effect Engine resolves them in sequence within
the same transaction when possible.

Example: killing a boss creature might produce simultaneously:
- `DAMAGE` (the final hit that kills it — already resolved before death);
- `XP_REWARD { skill: 'combat', amount: 500 }` to the attacker;
- `ITEM_REWARD { entries: [...], destination: WORLD }` via `ItemMaterializationService`;
- `CURRENCY_REWARD { amount: 200 }` via `EconomyService`.

#### 4.3 Authority

The Effect Engine runs exclusively on the server. No client code computes
damage formulas, XP amounts, or item eligibility. The client receives the
resolved outcome as a structured event payload.

#### 4.4 Auditability

Each Effect Engine invocation records at minimum:
- the trigger (skill use, quest completion, loot event, admin grant);
- the actor and target IDs;
- the list of effects applied and their resolved values;
- the timestamp.

This record may be stored as part of the append-only history (TD-007) or as a
lightweight event log, to be decided in the Effect Engine implementation phase.

### 5. Combat Architecture

#### 5.1 Principles

- Initiative is server-owned. The server decides when a creature attacks; it
  does not trust player-reported attack timing.
- Hit validation uses `WorldService.checkInteraction` (WU distance) before
  applying any damage.
- All damage values are computed server-side using base stats from item templates
  and creature templates. The client never proposes damage values.
- Cooldowns are enforced server-side. A gateway may expose estimated remaining
  cooldown to the client but never trusts the client to manage it.

#### 5.2 Integration with existing creatures

Current `CreaturesGateway` and `CreaturesService` implement the combat loop. The
Combat domain does not replace them — it integrates: ability use events route
through the same gateway, delegate to a `CombatService`, which invokes the Effect
Engine. The gateway remains thin.

#### 5.3 Projectiles

Projectile mechanics (if introduced) must resolve server-side with travel time
modeled as a timed server callback, not as client-side physics that reports hit.

### 6. Gathering Architecture

Gathering (`ResourcesGateway`, `WorldService.startGathering`) is already
functional. Gameplay V1 extends it:

- **Tool requirement**: the server checks that the character holds or wears a
  compatible tool (`ItemInstance` in EQUIPMENT container with matching `Item.slot`
  or category). Gathering without the required tool is rejected.
- **Yield quality**: a quality roll (dependent on skill level and tool quality)
  determines whether the output is `common`, `uncommon`, or `rare`. Quality rolls
  are server-side.
- **XP grant**: gathering success emits an `XP_REWARD` effect via the Effect
  Engine.
- **Duration**: gathering duration is determined server-side from the resource
  template and can be modified by passive skill bonuses. The timer already runs
  server-side; this is an extension of existing behavior.
- **Integration**: resource loot continues through `ItemMaterializationService`
  with `source = LOOT`.

### 7. Crafting Architecture

`CraftingService` already consumes ingredients from inventory stacks and produces
`ItemInstance` for `INSTANCE` items via `ItemMaterializationService`. Gameplay V1
extends it:

- **`craftedBy` provenance**: after `ItemMaterializationService.materialize()`
  returns, the calling service attaches `craftedByCharacterId` and `craftedAt`
  to the returned `ItemInstance` objects within the same transaction.
- **Quality**: a quality roll (server-side, based on skill level, station tier,
  recipe complexity) is attached to the `ItemInstance` metadata before commit.
- **XP grant**: craft success emits an `XP_REWARD` effect via the Effect Engine.
- **Recipe unlock**: higher-tier recipes may require a minimum skill level or a
  consumed scroll. The unlock condition is validated server-side before the craft
  begins.
- **Integration**: `CraftingService` calls `ItemMaterializationService` with
  `source = CRAFT`. This does not change. The extension is post-creation metadata
  attachment within the same transaction.

### 8. Quest Architecture

#### 8.1 QuestDefinition (catalogue)

`QuestDefinition` defines a quest that exists in the game world:

- `key`: unique string identifier;
- `name`, `description`;
- `requiredLevel` or prerequisite quest key;
- `objectives`: ordered list of objective definitions (kill N creatures, gather N
  items, deliver item to NPC, reach location, craft recipe);
- `rewards`: list of Effect types to apply on completion (XP, items, currency,
  unlock).

`QuestDefinition` is catalogue data. It does not store player state.

#### 8.2 QuestProgress (Runtime state)

`QuestProgress` holds one row per (character, quest) pair:

- `characterId`;
- `questKey`;
- `status`: `NOT_STARTED | IN_PROGRESS | COMPLETED | FAILED`;
- `objectiveProgress`: JSON or structured table with current counts per objective.

`QuestProgress` is the persisted Runtime state. The server updates it when
relevant gameplay events fire (creature killed, item gathered, location reached).
The client receives progress updates as events.

#### 8.3 Reward dispatch

Quest rewards are dispatched through the Effect Engine:

- item rewards → `ItemMaterializationService` with `source = QUEST`;
- currency rewards → `EconomyService`;
- XP rewards → `SkillRuntime`.

No reward is created outside this contract.

### 9. AI Architecture

#### 9.1 Principles

The creature AI runs exclusively on the server in a tick-based loop
(`CreaturesService`). No AI logic runs on the client. The client receives
position and state updates and renders them.

Current implemented behaviors: `alive`, `fighting`, `escaping`, `dead`;
aggro range detection; auto-attack; leash on escape.

#### 9.2 Gameplay V1 extensions (planned)

- **Patrol**: creatures move between waypoints when in `idle` state. Waypoints
  are stored in the creature template or spawn configuration.
- **Faction**: creatures belong to a faction. Same-faction creatures do not
  aggro each other. Cross-faction aggro is configurable per template.
- **Leash improvement**: leash distance becomes configurable per template in WU.
  Current hardcoded pixels replaced by WU comparison.
- **Call for help**: when attacked, a creature may emit an aggro signal to nearby
  creatures of the same faction within a configured WU radius.
- **No client AI**: the client never decides when a creature attacks, moves, or
  changes state. It only renders server-broadcast state updates.

### 10. Economy Integration

The `EconomyService` with bronze Wallet and LedgerEntry is the sole currency
authority.

Gameplay V1 uses it for:

- NPC vendor transactions (buy from vendor: debit wallet, receive item via
  `ItemMaterializationService` with `source = VENDOR`);
- quest currency rewards (credit wallet via `EconomyService`);
- crafting station fees (debit wallet if recipe has a bronze cost);
- drop bronze (credit wallet from creature or resource kill).

No domain may modify wallet balances directly. All changes go through
`EconomyService.transferWithinManager()` or equivalent authorized methods.

### 11. Social Integration

Social features in Gameplay V1 are limited to the MVP layer of existing domains:

- `GuildStorageService` already provides shared item storage. Guild membership
  management (invite, rank, permissions) is a Guild V2 feature.
- `TradeService` already provides peer item exchange. Group trade or auction
  listings are future features.
- Party system and chat channels are future Social domain work.

### 12. Content Pipeline

New content (creatures, items, maps, quests) follows the existing seeding
conventions:

- items seeded via `ItemSeed` with correct `objectMode = STACKABLE | INSTANCE`;
- creatures seeded via `CreatureTemplateSeed`;
- maps exported from Tiled in TMJ format;
- quest definitions seeded via `QuestDefinitionSeed` (to be created).

Content PRs must not contain game logic. Content PRs may contain seed data,
migration scripts, and asset files only.

---

## Alternatives Considered

### Frontend-authoritative skills

Let the client compute skill level, XP thresholds, and cooldowns.

Rejected because:

- the client can be modified to grant arbitrary XP or skip cooldowns;
- any desync between client and server state leads to inconsistent game state;
- this contradicts ADR-0004 (Runtime-Driven Architecture) which establishes
  the server as the sole authority for gameplay outcomes.

### Skills hardcoded in gateways

Implement skill logic directly inside `CreaturesGateway`,
`ResourcesGateway`, and `CraftingGateway`.

> Note : `CraftingGateway` a depuis été **supprimée** — il n'existe plus aucun
> WebSocket craft (`craft:start` / `craft:result` retirés). Le craft joueur passe
> par HTTP (`POST /crafting/craft` → CraftJob → claim) ; non-régression couverte
> par `crafting.no-instant-bypass.spec`. La mention ci-dessus reste comme exemple
> historique de l'alternative rejetée.

Rejected because:

- gateways become authoritative and untestable (large handlers with mixed
  concerns);
- adding a new skill or modifying cooldown logic requires modifying gateway code
  that also handles unrelated transport concerns;
- skill logic cannot be reused across gateways without duplication.

### Effects dispersed in domain services

Each domain (combat, gathering, crafting, quest) implements its own independent
damage, XP, and reward logic.

Rejected because:

- reward amounts cannot be balanced in one place;
- XP rewards for "kill creature", "craft item", and "complete quest" accumulate
  via three different unrelated code paths;
- composing multiple effects from one action (kill triggers damage + XP + loot)
  requires coordinating across incompatible interfaces;
- a future skill modifier that buffs all XP rewards must modify every domain
  separately instead of being applied at the Effect Engine level.

### Item rewards created outside ItemMaterializationService

Individual domain services call `manager.create(ItemInstance, ...)` directly
for quest or vendor rewards.

Rejected because:

- this bypasses the `createdBySource` contract (ADR-0011 I3);
- `Item.objectMode` resolution is skipped, potentially creating instances for
  stackable items or stacks for instance items;
- the Invariant I1 (single active container) guarantee from `ItemMaterializationService`
  is not applied;
- monitoring and forensic tools cannot distinguish the production origin.

### Currency modified outside EconomyService

Combat services or quest services directly update `Wallet.balance` via
`manager.update()`.

Rejected because:

- this bypasses the LedgerEntry audit trail;
- concurrent modifications are not protected by the wallet's atomic operation
  contract;
- TD-004 (`getOrCreateWallet` race condition) would be exacerbated.

---

## Consequences

### Positive

- Gameplay V1 domains (Skills, Combat, Gathering, Crafting, Quests, AI) are
  built as thin layers above the Runtime V2 foundation. No parallel ownership,
  currency, or item identity system is introduced.
- The Effect Engine provides a single auditable, composable point for all
  gameplay outcomes. Balancing, debugging, and forensics operate on one system.
- The server remains authoritative on all gameplay calculations. The client
  renders outcomes; it never decides them.
- New content (quests, creatures, items, skills) can be added as seed data
  without touching application logic.
- Each Gameplay V1 domain is independently testable. The Effect Engine, Skills,
  Quest Progress, and AI service are all unit-testable with mocked dependencies.

### Negative

- The Effect Engine introduces an additional layer between a gateway call and
  its outcome. Simple actions (gather wood → wood in inventory) pass through
  more indirection than before.
- The `SkillRuntime` entity and `QuestProgress` entity introduce new tables and
  additional database writes on every relevant gameplay event. At high player
  counts, XP writes per tick must be batched or throttled.
- Gameplay V1 depends on Equipment Runtime V2 being complete (TDs 002, 005, 006)
  for tool-requirement and equipment-stat checks. Until then, skill-gated actions
  requiring equipped items have limited validation.

### Risks

- **Effect Engine scope creep**: the Effect Engine must remain a resolver, not a
  store. If it begins caching world state or managing timers directly, it becomes
  an authoritative real-time engine with its own consistency requirements.
- **SkillRuntime write volume**: if every gathering tick writes one XP row update,
  high activity creates write amplification. XP should be accumulated in a
  lightweight in-memory counter and flushed at natural checkpoints (end of
  gather session, end of combat, checkpoint interval) rather than on every tick.
- **Equipment V2 dependency**: the tool-requirement check in Gathering V1
  requires reading `ItemInstance` from EQUIPMENT container. This is blocked on
  Equipment Runtime V2 completion.

---

## Security Notes

- Skill XP amounts, damage values, quality rolls, quest completion validation,
  and all Effect Engine outputs are computed server-side from server-trusted
  inputs. No client-reported value is used directly for a gameplay outcome.
- The Effect Engine does not accept client-specified effect payloads. The client
  sends the intention (which ability, which target). The server resolves the
  effect.
- Quest objective completion is validated server-side when the relevant event
  fires (creature kill, item gather, location arrival). The client cannot mark an
  objective as complete.
- NPC vendor transactions debit the wallet server-side after verifying the
  character has sufficient balance. The client cannot construct a purchase payload
  that bypasses the balance check.

---

## Roadmap

Recommended implementation order for Gameplay V1, based on foundational
dependencies:

| Order | Phase | Dependency |
|---|---|---|
| 1 | **Skills Runtime Foundation** | SkillDefinition (done), `SkillRuntime` entity, XP service, level thresholds |
| 2 | **Effect Engine MVP** | Skills Runtime, Economy Foundation (done), ItemMaterializationService (done) |
| 3 | **Combat Advanced** | Effect Engine, existing Creature loop |
| 4 | **Gathering Advanced** | Effect Engine, Skills Runtime, existing resource loop |
| 5 | **Craft Advanced** | Effect Engine, Skills Runtime, existing CraftingService |
| 6 | **Quest Runtime** | Effect Engine, Skills Runtime, ItemMaterializationService |
| 7 | **AI Advanced** | Existing creature AI, WU coordinates (done) |
| 8 | **Economy Gameplay** | Economy Foundation (done), Effect Engine |
| 9 | **Social Gameplay** | Trade (done), Guild Storage (done) |
| 10 | **Content Pipeline** | All of the above |

Skills Runtime Foundation is the prerequisite for most other Gameplay V1 phases.
It should be the first implementation task of Gameplay V1.

---

## Open Questions

- Should `SkillRuntime` XP writes be batched in memory and flushed at intervals,
  or written atomically per event? The answer impacts performance at scale and
  must be decided before implementing the XP service.
- Should the Effect Engine be a NestJS service (injectable, stateless resolver)
  or an event-driven bus (publishes typed events consumed by subscribers)? The
  service approach is simpler; the event bus is more extensible but adds
  asynchronous complexity.
- Should `QuestProgress.objectiveProgress` be a JSONB column or a normalized
  `QuestObjectiveProgress` table? JSONB is simpler for MVP; a normalized table
  is better for indexed queries ("all characters on step 3 of quest X").
- What is the first content (quest, creature, map) to be delivered as a
  Gameplay V1 milestone, and does it require any of the Gameplay V1 domains
  above or can it be seeded independently?

---

## Related Files

- docs/01_Architecture/adr/ADR-0010-object-runtime-model.md
- docs/01_Architecture/adr/ADR-0011-item-materialization-pipeline.md
- docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md
- docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md
- docs/08_Gameplay/object-runtime-architecture.md
- docs/08_Gameplay/item-taxonomy.md
- docs/09_Workflow/runtime-roadmap.md
- docs/09_Workflow/technical-debt.md
