# Runtime Roadmap

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-28
- Depends on: docs/08_Gameplay/economy-foundation.md, docs/08_Gameplay/object-runtime-architecture.md, docs/08_Gameplay/item-taxonomy.md, docs/08_Gameplay/auction-house-specifications.md, docs/01_Architecture/adr/ADR-0010-object-runtime-model.md, docs/09_Workflow/audit-alerts.md
- Used by: Project owner, backend developers, DevTools developers, repository-aware coding agents

## Scope

This living document tracks the Runtime refactoring roadmap.

It is documentation only. It must not be used as proof that a feature is
implemented without checking code, tests, commits, and project status.

Statuses:

- `Not Started`: no committed Runtime work observed for this phase.
- `In Progress`: committed preparation exists, but the phase is not complete.
- `Completed`: committed work matches the phase objective at the current scope.

## Roadmap

| Phase | Objectif | Statut | Dépendances | Commits associés |
|---|---|---|---|---|
| Documentation Foundation | Formaliser le modèle Economy, Auction, objets, taxonomie et ADR Object Runtime. | Completed | N/A | `55fe133`, `be3e6c7`, `a4416e5`, `5d16a7c` |
| Economy Foundation | Créer le module Runtime Economy avec Wallet, EconomicTransaction, LedgerEntry et opérations bronze-only. | Completed | Documentation Economy, ADR-0006 | `9d822cd` |
| ItemInstance Foundation | Créer la fondation Runtime `ItemInstance` avec identité, état et conteneur. | Completed | ADR-0010, Item Taxonomy | `f17dc15` |
| CharacterEquipment Preparation | Préparer `CharacterEquipment` à référencer un `ItemInstance` sans casser le modèle legacy. | Completed | ItemInstance Foundation | `b2048ee` |
| WorldItem Preparation | Préparer `WorldItem` à référencer un `ItemInstance` sans casser les drops stackables actuels. | Completed | ItemInstance Foundation | `1c07e7d` |
| Inventory Hybrid | Faire coexister officiellement stacks d'inventaire et `ItemInstance` dans les lectures/écritures Runtime. | In Progress | ItemInstance Foundation, CharacterEquipment Preparation, WorldItem Preparation | `f37265b` |
| Equipment Runtime V2 | Équiper/déséquiper des `ItemInstance` comme source de vérité, retirer la dépendance legacy à `Inventory.equipped`. | In Progress | Inventory Hybrid, CharacterEquipment Preparation | `b8ac4a6` |
| WorldItem Hybrid | Gérer pickup/drop stackable et unique via `WorldItem`, avec transitions `ItemInstance` validées. | Not Started | Inventory Hybrid, WorldItem Preparation | N/A |
| Loot Hybrid | Produire soit des stacks, soit des `ItemInstance` selon la taxonomie d'objet. | Not Started | WorldItem Hybrid, Item Taxonomy | N/A |
| Craft Hybrid | Consommer/produire stacks et `ItemInstance`, avec craftedBy/provenance pour les sorties uniques. | Not Started | Inventory Hybrid, Equipment Runtime V2, Loot Hybrid | N/A |
| Auction House | Implémenter le MVP prix fixe avec `buyoutPriceBronze`, verrouillage `ItemInstance`, transfert Economy et claim acheteur. | Not Started | Economy Foundation, Inventory Hybrid, Equipment Runtime V2, WorldItem Hybrid | N/A |
| Bank | Stocker stacks et `ItemInstance` en banque, avec monnaie gérée par Economy Wallet. | Not Started | Inventory Hybrid, ItemInstance transitions | N/A |
| Mail | Transporter stacks et `ItemInstance` sans duplication, avec politique binding et claim. | Not Started | Inventory Hybrid, ItemInstance transitions, Economy Foundation if currency mail is allowed | N/A |
| Guild Storage | Stocker biens de guilde, stacks et `ItemInstance` éligibles, avec règles de propriété partagée. | Not Started | Inventory Hybrid, Bank/Mail policy decisions | N/A |
| Housing | Stocker et placer décorations, objets personnalisés et objets liés au logement. | Not Started | Inventory Hybrid, WorldItem Hybrid, Item Taxonomy | N/A |

## Phase Details

### Documentation Foundation

Objective:

- Define the monetary foundation, Auction MVP 1, hybrid object runtime, item
  taxonomy, and ADR-0010.

Completion evidence:

- `docs/08_Gameplay/economy-foundation.md`
- `docs/08_Gameplay/auction-house-specifications.md`
- `docs/08_Gameplay/object-runtime-architecture.md`
- `docs/08_Gameplay/item-taxonomy.md`
- `docs/01_Architecture/adr/ADR-0010-object-runtime-model.md`

### Economy Foundation

Objective:

- Provide bronze-only wallet and ledger primitives for future gameplay systems.

Completion evidence:

- `apps/api-gateway/src/economy/economy.module.ts`
- `apps/api-gateway/src/economy/economy.service.ts`
- `apps/api-gateway/src/economy/entities/wallet.entity.ts`
- `apps/api-gateway/src/economy/entities/economic-transaction.entity.ts`
- `apps/api-gateway/src/economy/entities/ledger-entry.entity.ts`
- `apps/api-gateway/src/economy/economy.service.spec.ts`

Remaining debt is tracked in `docs/09_Workflow/technical-debt.md`.

### ItemInstance Foundation

Objective:

- Introduce the concrete object identity foundation required by ADR-0010.

Completion evidence:

- `apps/api-gateway/src/item-instances/entities/item-instance.entity.ts`
- `apps/api-gateway/src/item-instances/item-instances.service.ts`
- `apps/api-gateway/src/item-instances/item-instances.module.ts`
- `apps/api-gateway/src/item-instances/item-instances.service.spec.ts`
- `apps/api-gateway/src/migrations/1782604800000-CreateItemInstanceTable.ts`

### CharacterEquipment Preparation

Objective:

- Add compatibility preparation for future equipment by `ItemInstance`.

Completion evidence:

- `apps/api-gateway/src/characters/entities/character-equipment.entity.ts`
- `apps/api-gateway/src/migrations/1782691200000-AddItemInstanceIdToCharacterEquipment.ts`

This is preparation only. Equipment Runtime V2 is not complete.

### WorldItem Preparation

Objective:

- Add compatibility preparation for future world drops by `ItemInstance`.

Completion evidence:

- `apps/api-gateway/src/world-items/entities/world-item.entity.ts`
- `apps/api-gateway/src/world-items/world-item.service.ts`
- `apps/api-gateway/src/world-items/world-item.service.spec.ts`
- `apps/api-gateway/src/migrations/1782777600000-AddItemInstanceIdToWorldItem.ts`

This is preparation only. WorldItem Hybrid is not complete.

### Inventory Hybrid

Objective:

- Project stack inventory rows and `ItemInstance` inventory objects through a
  single read model.

Progress evidence:

- `apps/api-gateway/src/inventory/projection/inventory-projection.service.ts`
- `apps/api-gateway/src/inventory/projection/inventory-entry.mapper.ts`
- `apps/api-gateway/src/inventory/projection/inventory-entry.dto.ts`
- `apps/api-gateway/src/inventory/projection/inventory-projection.service.spec.ts`
- commit `f37265b`

Current status:

- In Progress. Hybrid projection exists for reads, but write flows still need
  full stack vs `ItemInstance` transition rules before the phase can be marked
  Completed.

### Equipment Runtime V2

Objective:

- Make `CharacterEquipment` the equipment truth and move toward
  `ItemInstance`-based equip/unequip.

Progress evidence:

- `apps/api-gateway/src/inventory/inventory.service.ts`
- `apps/api-gateway/src/inventory/inventory.service.spec.ts`
- commit `b8ac4a6`

Current status:

- In Progress. `CharacterEquipment` is now the projected equipment source of
  truth for stack-era items, while `Inventory.equipped` remains a transitional
  compatibility field and equip/unequip still use catalogue `Item` ids rather
  than concrete `ItemInstance` ids.

## Next Recommended Order

1. Complete Inventory Hybrid write transitions.
2. Complete Equipment Runtime V2 with `ItemInstance` equip/unequip.
3. WorldItem Hybrid.
4. Loot Hybrid.
5. Craft Hybrid.
6. Auction House fixed-price MVP.
7. Bank and Mail.
8. Guild Storage.
9. Housing.

## Maintenance Rules

- Update this file after every Runtime phase commit.
- Link concrete commits only after they exist.
- Do not mark a phase `Completed` because a document exists; verify Runtime
  code and tests.
- Keep technical debts in `docs/09_Workflow/technical-debt.md`, not hidden in
  roadmap prose.
