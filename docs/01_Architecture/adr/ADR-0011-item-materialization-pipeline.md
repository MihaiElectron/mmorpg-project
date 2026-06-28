# ADR-0011 — Item Materialization Pipeline

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-06-28
- Date proposed: 2026-06-28
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on:
  - docs/01_Architecture/adr/ADR-0010-object-runtime-model.md
  - docs/08_Gameplay/object-runtime-architecture.md
  - docs/08_Gameplay/item-taxonomy.md
  - docs/09_Workflow/runtime-roadmap.md
- Used by: Project owner, backend developers, repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents:
  - docs/08_Gameplay/object-runtime-architecture.md
  - docs/08_Gameplay/item-taxonomy.md
  - docs/09_Workflow/runtime-roadmap.md
  - docs/09_Workflow/technical-debt.md
- Related code: N/A

---

## Context

ADR-0010 establishes the hybrid object Runtime model: stackable resources use
`Inventory` stack rows; unique objects use `ItemInstance`. The Runtime Roadmap
defines Loot Hybrid as the next phase after WorldItem Hybrid.

The current loot implementation produces flat `{ itemId, quantity }` results
regardless of the item's nature. Weapons, armor, and future unique objects are
incorrectly created as stack quantities. No `ItemInstance` is created when a
creature drops a sword. No stable identity, no ownership trace, no container
transition exists for looted equipment.

The same structural gap exists in Craft, Quest Rewards, Chests, NPC vendors,
and Events. Each of these domains will need to produce Runtime objects in the
correct form — stack or instance — according to the item's catalogue definition.

Three interdependent decisions are required before implementing Loot Hybrid:

1. How the catalogue `Item` declares whether it produces stacks or instances.
2. Whether `LootService` should take on the responsibility of resolving item
   classification from the database.
3. Which service is responsible for translating a production intent into
   Runtime objects, and what its transaction contract is.

---

## Problem

Without explicit decisions on these three points:

- Each producer domain (Loot, Craft, Quest, Events) would independently
  implement its own classification logic, creating divergent rules.
- `LootService`, currently a pure synchronous function, risks accumulating
  database dependencies unrelated to probabilistic drop generation.
- The transaction boundary for instance creation would be unclear, making it
  possible for instances and world items to be created in separate transactions,
  violating Invariant I1 (Single Active Container, ADR-0010).
- Future domains could bypass the classification contract by inspecting
  `Item.slot`, `Item.type`, or other properties not designed for this purpose.

---

## Decision Drivers

- The catalogue `Item` must carry its own Runtime classification. No consumer
  should derive stack vs instance from `slot`, `type`, `category`, or any
  other field not designed for this purpose.
- `LootService` must remain testable without a database. Its responsibility is
  probabilistic drop generation, not item classification.
- All Runtime object creation — loot, craft output, quest reward, chest drop,
  NPC vendor grant, event reward — must go through one entry point with a
  consistent transaction contract.
- Invariant I1 (one `ItemInstance` has exactly one active container at all
  times) must be enforced atomically. The materialization service must never
  create a partial state where an instance exists without a container, or a
  container exists without a valid instance.
- The transaction must be owned by the calling domain. The materialization
  service participates in a transaction it did not open.

---

## Decision

### Decision 1 — Item.objectMode

The official Runtime classification policy is a new field on the `Item`
catalogue entity:

```
Item.objectMode: 'STACKABLE' | 'INSTANCE'
```

**`STACKABLE`**: every unit of this item is interchangeable. Two units can
merge without losing information. No `ItemInstance` is created. Managed as
`Inventory` stack rows.

Examples: ores, wood, fibers, refined materials, generic consumables,
identical ammunition, generic crafting ingredients.

**`INSTANCE`**: each unit has distinct identity, ownership trace, state,
and container. Two units cannot merge. An `ItemInstance` with a stable UUID
is created at production time and persists across all transfers.

Examples: weapons, armor, shields, jewelry, durable tools, enchanted objects,
unique drops, quest objects with state, bound objects, signed crafted items,
keys, deeds, mounts, companions, placed decorations.

The database default value is `'STACKABLE'`. Existing items that are not
updated will remain stackable, which is safe because all current seeded
stackable items (resources, materials) are correctly classified by this
default. Items requiring `INSTANCE` (weapons, armor) must be explicitly
updated in seeds before the Loot Hybrid phase is activated for drops.

`Item.objectMode` is the exclusive classification input for all Runtime
object production. No domain may substitute `Item.slot`, `Item.type`,
`Item.category`, or any other field as a classification signal.

### Decision 2 — LootService remains pure

`LootService` retains its current responsibilities:

- Probabilistic drop generation from a pool (`LootPoolEntry[]`).
- Fallback to template-based defaults when no pool is provided.
- Returning a list of drop specifications: `LootEntry[] = { itemId, quantity }[]`.
- Returning an empty list when no drop passes probability or produces zero
  quantity.

`LootService` must not:

- inject or depend on `ItemRepository` or any TypeORM repository;
- resolve `Item.objectMode` or make any stack vs instance decision;
- open, join, or be aware of any database transaction;
- perform any I/O.

`LootService` remains synchronous, pure, and injectable into any context that
produces probabilistic drops without requiring a database connection. This
preserves its testability and allows it to be reused by Chests, Events, NPC
drop tables, and future reward generators without infrastructure constraints.

### Decision 3 — ItemMaterializationService

A new service named `ItemMaterializationService` becomes the single entry
point for all Runtime object production.

**Responsibility:** translate a list of item specifications into Runtime
objects (stack increments or new `ItemInstance` objects) and place them in
the correct container, within the transaction provided by the calling domain.

**Transaction contract:** `ItemMaterializationService` does not open its own
transaction. It receives an `EntityManager` from the calling domain and
operates entirely within the caller's transaction scope. This guarantees that
instance creation, container placement, and any related domain writes are
atomic from the caller's perspective.

The calling domain is responsible for:

- opening the transaction via `DataSource.transaction(manager => ...)`;
- passing the `manager` to `ItemMaterializationService.materialize(...)`;
- handling rollback if the overall domain operation fails.

**Primary method signature (intent, not code):**

```
materialize(
  entries:     ItemSpec[],
  context:     MaterializeContext,
  manager:     EntityManager,
): Promise<MaterializeResult>

ItemSpec = { itemId: string; quantity: number }

MaterializeContext = {
  source:      MaterializationSource,
  destination: MaterializeDestination,
  ownerId:     string,
}

MaterializationSource = LOOT | CRAFT | QUEST | VENDOR | ADMIN | EVENT | CHEST

MaterializeDestination =
  | { type: 'INVENTORY'; characterId: string }
  | { type: 'WORLD'; worldX: number; worldY: number; mapId: number;
      ownerCharacterId?: string | null }

MaterializeResult = {
  stacks:     Inventory[],
  instances:  ItemInstance[],
  worldItems: WorldItem[],
}
```

**Internal behavior per entry:**

- Resolves `Item.objectMode` from the database using the provided `manager`.
- If `objectMode === 'STACKABLE'` and `destination === 'INVENTORY'`:
  increments or creates an `Inventory` stack row via the manager.
- If `objectMode === 'STACKABLE'` and `destination === 'WORLD'`:
  creates a `WorldItem` with `itemInstanceId = null` via the manager.
- If `objectMode === 'INSTANCE'` and `destination === 'INVENTORY'`:
  creates an `ItemInstance` with `state = AVAILABLE`,
  `containerType = INVENTORY`, `containerId = characterId`,
  `createdBySource = context.source` via the manager.
- If `objectMode === 'INSTANCE'` and `destination === 'WORLD'`:
  creates an `ItemInstance`, then creates a `WorldItem` referencing
  `itemInstanceId`, then updates `instance.containerId = worldItem.id`,
  all within the same manager scope, enforcing I1 atomically.

The `createdBySource` field on `ItemInstance` records the originating domain
(`LOOT`, `CRAFT`, `QUEST`, etc.) for audit and DevTools inspection.

**All producers use `ItemMaterializationService`:**

| Producer | Source label | Destination |
|---|---|---|
| Creature loot (kill) | `LOOT` | `WORLD` (dropped at creature position) |
| Resource loot (gather) | `LOOT` | `INVENTORY` (direct grant) |
| Craft output | `CRAFT` | `INVENTORY` |
| Quest reward | `QUEST` | `INVENTORY` |
| Chest / loot box | `CHEST` | `INVENTORY` |
| NPC vendor grant | `VENDOR` | `INVENTORY` |
| Admin grant | `ADMIN` | `INVENTORY` or `WORLD` |
| Event reward | `EVENT` | `INVENTORY` |

---

## Pipeline Diagram

```
Producer domain (Loot / Craft / Quest / Chest / Event / NPC / Admin)
│
├── [optional] LootService.generateLoot(pool?) → LootEntry[]
│     Pure, synchronous, no database, no classification.
│     Reusable by any producer that uses probabilistic pools.
│
└── DataSource.transaction(manager => {
      ...domain-specific validation and writes...
      │
      └── ItemMaterializationService.materialize(entries, context, manager)
            │
            ├── resolves Item.objectMode via manager
            │
            ├── [STACKABLE + INVENTORY]
            │   └── Inventory.addItem (manager) → Inventory row
            │
            ├── [STACKABLE + WORLD]
            │   └── WorldItem.create (manager, itemInstanceId: null) → WorldItem
            │
            ├── [INSTANCE + INVENTORY]
            │   └── ItemInstance.create (manager, state: AVAILABLE,
            │         containerType: INVENTORY, containerId: characterId,
            │         createdBySource: context.source)
            │       → ItemInstance
            │
            └── [INSTANCE + WORLD]
                  ItemInstance.create (manager, state: IN_WORLD,
                    containerType: WORLD, createdBySource: context.source)
                  WorldItem.create (manager, itemInstanceId: instance.id)
                  instance.containerId = worldItem.id  ← backfill in same tx
                  → ItemInstance + WorldItem
    })
```

`LootService` is upstream and optional. `ItemMaterializationService` is always
inside the caller's transaction. No materialization occurs outside a
transaction.

---

## Service Responsibilities

### LootService

- Probabilistic drop generation from `LootPoolEntry[]`.
- Template-based fallback when no pool is provided.
- Returns `LootEntry[] = { itemId, quantity }[]`.
- No database dependency. No I/O. Synchronous.
- Reusable by any producer with probabilistic pools.
- Does not classify items. Does not create Runtime objects.

### ItemMaterializationService

- Resolves `Item.objectMode` from the database.
- Creates `Inventory` stack rows, `ItemInstance` objects, or `WorldItem`
  records according to classification and destination.
- Sets `createdBySource` on all created `ItemInstance` objects.
- Enforces Invariant I1 atomically by operating within the caller's manager.
- Never opens its own transaction.
- Never makes probabilistic decisions.
- Returns `MaterializeResult` for callers that need post-creation access
  (for example, Craft may attach `craftedByCharacterId` to the returned
  instances).

### Calling domain

- Defines intent: what items to produce, why, and where.
- Opens the transaction and passes the manager.
- Calls `LootService.generateLoot()` if probabilistic generation is needed.
- Calls `ItemMaterializationService.materialize()` with the resulting entries.
- Handles post-creation domain logic (Craft: attach craftedBy; Quest: mark
  reward as claimed; Admin: log correction).
- Is responsible for rollback if any domain step fails.

---

## Authorized Dependencies

```
LootService
  depends on: nothing (pure function)

ItemMaterializationService
  depends on: ItemRepository (via EntityManager)
              InventoryService or direct Inventory entity write (via EntityManager)
              ItemInstancesService or direct ItemInstance entity write (via EntityManager)
              WorldItemService or direct WorldItem entity write (via EntityManager)
  must not depend on: LootService
  must not depend on: domain-specific services (CraftService, QuestService, etc.)

Calling domain (e.g. creatures.gateway, resources.gateway, CraftService)
  depends on: LootService (if probabilistic pools are used)
  depends on: ItemMaterializationService
  must not depend on: LootService for classification decisions
  must not depend on: ItemRepository for objectMode resolution
```

---

## Alternatives Considered

### Alternative 1 — Classification via Item.slot

Use `Item.slot !== null` as the signal to create an `ItemInstance`.

Rejected because:

- `Item.slot` is a gameplay property (which equipment slot an item occupies),
  not a Runtime lifecycle policy.
- Unique objects that have no equipment slot — keys, deeds, placed decorations,
  mounts, companions, quest objects, signed blueprints — would be incorrectly
  classified as stackable under this rule.
- Every future family that requires `ItemInstance` without having a slot would
  require a workaround (adding a fictitious slot, adding another heuristic).
- The classification rule would be distributed implicitly across consuming
  services instead of being declared on the catalogue.
- `object-runtime-architecture.md` section 2.1 already identifies `objectMode`
  as the correct target field. Using `Item.slot` would create a permanent
  delta between documentation and implementation.

### Alternative 2 — LootDispatcherService

Name the orchestration service `LootDispatcherService`.

Rejected because:

- The name implies the service is specific to loot. It would be called from
  Craft, Quest, Chest, Events, and Admin with no semantic justification.
- A developer reading `CraftService` calling `LootDispatcherService` to
  materialize a crafted weapon would not understand the architectural rationale
  without a comment.
- Naming a cross-domain service after one of its consumers creates a permanent
  maintenance burden: every new producer calling the service would have to
  accept that the name does not describe the service's actual responsibility.
- `ItemMaterializationService` describes the action (materializing item specs
  into Runtime objects) without referencing any originating domain.

### Alternative 3 — LootService depends on ItemRepository

Make `LootService` resolve `Item.objectMode` by injecting `ItemRepository`.
Return `LootEntry[]` with a `kind` field resolved from the database.

Rejected because:

- `LootService` is currently synchronous and pure. Adding a database dependency
  forces all callers to handle async resolution even when they only need
  probabilistic generation.
- The responsibility of classifying items — "is this a stack or an instance?"
  — is not a loot concern. It is a Runtime catalogue concern that applies
  identically to Craft, Quest, Events, and all other producers.
- Tests for `LootService` would require mocking `ItemRepository`, coupling
  the test of probabilistic logic to database fixture setup.
- Future producers that do not use probabilistic generation (Craft, Quest with
  fixed rewards) would need to call `LootService` solely for its classification
  side effect — an incorrect dependency.
- Placing classification in `LootService` would make the service a de facto
  classification authority for the whole Runtime, without expressing that
  responsibility in its name, interface, or module placement.

---

## Consequences

### Positive

- `Item.objectMode` is the single, explicit classification input for all
  Runtime object production. No domain invents its own classification rule.
- `LootService` remains pure and synchronous. It can be tested without a
  database and reused in any context that generates probabilistic drops.
- All Runtime object creation is transactionally safe. `ItemMaterializationService`
  operating inside the caller's transaction guarantees that Invariant I1 is
  enforced atomically across `ItemInstance` creation and container placement.
- `createdBySource` on every created `ItemInstance` provides a durable audit
  trace of object origin (LOOT, CRAFT, QUEST, etc.) without requiring a
  separate history table at this stage.
- `MaterializeResult` gives callers post-creation access to created instances,
  allowing Craft to attach `craftedByCharacterId` and Quality without requiring
  a second database round-trip.
- The pipeline is extensible: new producers add one call to
  `ItemMaterializationService.materialize()` with the appropriate
  `MaterializationSource`. No change to `LootService` or
  `ItemMaterializationService` is required.

### Negative

- A new column `objectMode` must be added to the `Item` entity and all seeds
  updated before Loot Hybrid can safely activate instance creation for
  equipment drops. Until seeds are updated, `objectMode` defaults to
  `STACKABLE`, which silently suppresses instance creation for weapons.
- `ItemMaterializationService` introduces a new transversal service that all
  producer domains will depend on. Changes to its interface affect every
  producer.
- The caller must own the transaction. Producers that currently do not use
  `DataSource.transaction()` explicitly will need to be refactored to open a
  transaction before calling `materialize()`.

### Risks

- **Seeds not updated before activation**: if `objectMode` is not set to
  `INSTANCE` for weapon and armor seeds before the Loot Hybrid phase is
  activated, equipment drops will be incorrectly created as stack quantities.
  This must be verified by a seed audit before the first creature loot
  `ItemInstance` can be trusted.
- **Craft post-creation contract**: `CraftService` may need to attach
  `craftedByCharacterId` to instances returned by `materialize()`. If this
  attachment is not done within the same transaction as `materialize()`, the
  metadata will be lost on rollback. The Craft Hybrid phase must explicitly
  handle this within the caller's transaction scope.
- **Multi-entry atomicity**: when `entries` contains multiple items,
  `materialize()` processes them within the same manager. If one entry fails,
  the entire transaction rolls back. This is the correct behavior for loot
  (all drops from one kill are atomic), but must be verified for Chests and
  Events where partial grants might be acceptable. The decision is deferred to
  the Chest and Event phases.

---

## Security Notes

- `Item.objectMode` is read-only from the client's perspective. The client
  never sends this value; it is resolved server-side from the catalogue.
- The `ownerId` field on created `ItemInstance` objects is always set by the
  server from the authenticated session (`characterId` resolved from JWT),
  never from a client payload.
- `createdBySource = ADMIN` requires that the calling admin action is
  authorized by the server before `materialize()` is invoked. The
  materialization service itself does not perform authorization checks — it
  trusts the caller's authorization context.

---

## Performance Notes

- `ItemMaterializationService.materialize()` performs one `Item` lookup per
  distinct `itemId` in the entries. For typical loot drops (one to three
  items), this is negligible.
- For Chests or Events with larger item lists, the item lookup can be batched
  by `itemId` before the per-entry dispatch loop. This optimization is deferred
  to when such volumes are observed.
- `LootService.generateLoot()` has no I/O cost and can be called as many times
  as needed per game tick.

---

## Impact on Future Phases

### Loot Hybrid

First consumer of `ItemMaterializationService`. Creature drops materialize as
`INSTANCE` in `WORLD`. Resource gather grants materialize as `STACKABLE` in
`INVENTORY`. Required: `Item.objectMode` set on all relevant seeds.

### Craft Hybrid

`CraftService` uses `ItemMaterializationService` with `source: 'CRAFT'` and
`destination: 'INVENTORY'`. Returns created instances to attach
`craftedByCharacterId`, `quality`, `craftedAt` within the same transaction.
`LootService` is not used — Craft has fixed outputs, not probabilistic pools.

### Auction House

`AuctionService` does not call `ItemMaterializationService`. Auction lists
an existing `ItemInstance` by locking it (`state: LOCKED`, `containerType:
AUCTION`). The listing object already exists before Auction creates its record.
`Item.objectMode` is consulted by Auction as a gate: only `INSTANCE` objects
may be listed in Auction MVP 1.

### Bank and Mail

These domains transfer existing `ItemInstance` objects between containers.
They do not call `ItemMaterializationService`. They depend on the same
transition pattern established by WorldItem Hybrid (pessimistic write lock,
atomic state + container update).

### Quest Rewards

`QuestService` calls `ItemMaterializationService` with `source: 'QUEST'` and
`destination: 'INVENTORY'`. Fixed reward lists replace `LootPoolEntry[]`. No
probabilistic generation is needed unless the quest design requires random
reward selection.

### Housing

A decoration created from inventory and placed in housing uses an existing
`ItemInstance` that transitions to `containerType: HOUSING`. The initial
instance was created at production time (Loot, Craft, or Vendor), not at
placement time. `ItemMaterializationService` is not called at placement — only
at the production origin.

---

## Open Questions

- Should `ItemMaterializationService` validate that the calling `ownerId`
  corresponds to a valid character before creating instances, or should that
  validation remain the caller's responsibility?
- When Chests and Events need to grant multiple items with partial-failure
  semantics (grant what succeeded, skip what failed), should
  `ItemMaterializationService` support an `allowPartial` option, or should
  callers handle entries individually?
- Should `HYBRID` be added as a third value for `Item.objectMode` to represent
  families where the decision is context-dependent at production time (for
  example, a consumable that becomes instanced when it carries a quality roll)?

---

## Related Files

- docs/01_Architecture/adr/ADR-0010-object-runtime-model.md
- docs/08_Gameplay/object-runtime-architecture.md
- docs/08_Gameplay/item-taxonomy.md
- docs/09_Workflow/runtime-roadmap.md
- docs/09_Workflow/technical-debt.md

---

## TODO

- [ ] Submit for human review before marking Accepted.
- [ ] Update runtime-roadmap.md to reference this ADR under the Loot Hybrid phase.
- [ ] Resolve open question on `Item.objectMode` seed update timing before
      activating instance creation in Loot Hybrid.
- [ ] Add to docs/01_Architecture/decisions.md when accepted.
