# Item Taxonomy

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-27
- Depends on: docs/08_Gameplay/object-runtime-architecture.md, docs/08_Gameplay/economy-foundation.md, docs/08_Gameplay/auction-house-specifications.md, docs/08_Gameplay/settlement-specifications.md, docs/00_Project/glossary.md, docs/00_Project/domains.md, docs/01_Architecture/adr/ADR-0005-settlement-system-boundaries.md, docs/01_Architecture/adr/ADR-0006-economy-transaction-model.md, docs/01_Architecture/adr/ADR-0007-auction-house-authority.md, docs/01_Architecture/adr/ADR-0008-city-treasury-tax-flow.md, docs/01_Architecture/adr/ADR-0009-craft-order-lifecycle.md
- Used by: gameplay design, backend developers, DevTools developers, repository-aware coding agents

## Scope

This document defines the official business taxonomy for MMORPG items.

It is documentation only. It does not define database tables, migrations,
TypeORM entities, DTOs, controllers, frontend components, Runtime code, or ADR
changes.

This document describes business rules:

- which item families exist;
- which families are stackable;
- which families require `ItemInstance`;
- which families can be equipped, traded, auctioned, looted, crafted, mailed,
  banked, stored, repaired, enchanted, or bound;
- which exceptions override default rules.

The taxonomy applies to the full MMORPG target, not only the current MVP.

## 1. Current Project Observations

Current implemented item model:

```text
Item
├── name
├── type
├── category
├── attack / defense / range
└── slot

Inventory
└── Item + quantity

CharacterEquipment
└── Item + slot
```

Observed seeded items:

| Item | Current type | Current category | Business family |
|---|---|---|---|
| Bâton de bois | `material` | `wooden_stick` | Resource / Material |
| Minerai de fer | `material` | `iron_ore` | Resource |
| Lingot de fer | `material` | `iron_bar` | Material |
| Manche brut | `material` | `basic_handle` | Material / component |
| Lame brute | `material` | `rough_blade` | Material / component |
| Épée basique | `weapon` | `basic_sword` | Weapon |
| Épée de Fer seed legacy | `weapon` | `sword` | Weapon |

Current resource loot produces stack-like results such as `wooden_stick` and
`iron_ore`. Current crafting consumes and produces stack quantities even when
the output is a weapon. The target taxonomy keeps resources stackable but moves
equipment and other unique objects to `ItemInstance`.

## 2. Taxonomy Principles

### 2.1 Item Template vs Item Instance

`Item` is the business template.

It defines the family, name, category, base stats, base icon, default rules, and
default capabilities.

`ItemInstance` is one concrete object.

It exists when an object needs identity, ownership trace, state, container,
durability, quality, enchantments, crafted signature, binding, unique metadata,
or individual audit.

### 2.2 Stackable vs Instanced

An item family is stackable when every unit is interchangeable.

An item family requires `ItemInstance` when two copies can differ or when one
specific copy must be tracked.

Hybrid families exist when their default form is stackable, but a variant can
become unique because of quality, durability, binding, event metadata, quest
state, expiration, crafted signature, or enchantment.

### 2.3 Currency

Currency is not an inventory item for the main economy.

The official money model is bronze-only server storage through Economy Wallets:

- bronze is the minimum indivisible unit;
- `1 silver = 100 bronze`;
- `1 gold = 10 000 bronze`;
- UI conversion is display-only.

Currency-like tokens may exist as items only if they are not the main spendable
money, for example event tokens, quest tokens, or collectible coins. Those
tokens follow the `Key Item`, `Quest`, or `Misc` rules depending on design.

## 3. Item Families

### 3.1 Resource

Raw gatherable output from world resources, creatures, or harvesting loops.

Sub-categories:

- ore;
- wood;
- plant;
- fiber;
- hide;
- stone;
- fish;
- water;
- raw food;
- monster part.

Default rule: stackable, not instanced.

### 3.2 Material

Refined or intermediate crafting input.

Sub-categories:

- ingot;
- plank;
- cloth;
- leather;
- reagent;
- component;
- blade;
- handle;
- gem base;
- alchemical base.

Default rule: stackable. Becomes instanced only when a component has unique
quality, crafter signature, durability, binding, or unique provenance.

### 3.3 Building Material

Settlement, housing, siege, or construction input.

Sub-categories:

- beam;
- block;
- brick;
- nails;
- fittings;
- mortar;
- roofing;
- structural kit;
- upgrade kit.

Default rule: stackable for ordinary materials. Large prefabricated kits may be
instanced if they carry owner, destination, durability, or project metadata.

### 3.4 Equipment

Generic parent family for wearable or usable gear that affects character
capabilities.

Sub-categories:

- weapon;
- armor;
- shield;
- jewelry;
- tool;
- cosmetic equipment.

Default rule: instanced. Concrete sub-families define equip slots and special
rules.

### 3.5 Weapon

Offensive equipment used by combat systems.

Sub-categories:

- sword;
- axe;
- mace;
- dagger;
- spear;
- bow;
- crossbow;
- staff;
- wand;
- firearm if future setting allows it.

Default rule: `ItemInstance` required.

### 3.6 Armor

Defensive equipment worn in armor slots.

Sub-categories:

- head;
- chest;
- legs;
- hands;
- feet;
- cloak;
- belt.

Default rule: `ItemInstance` required.

### 3.7 Shield

Defensive equipment held or equipped in a shield slot.

Sub-categories:

- buckler;
- round shield;
- tower shield;
- magical barrier focus.

Default rule: `ItemInstance` required.

### 3.8 Jewelry

Wearable accessories with stats, enchantments, or social value.

Sub-categories:

- ring;
- necklace;
- earring;
- bracelet;
- charm;
- trinket.

Default rule: `ItemInstance` required.

### 3.9 Tool

Profession or interaction equipment.

Sub-categories:

- pickaxe;
- axe;
- fishing rod;
- hammer;
- saw;
- needle;
- mortar;
- cooking utensil;
- lockpick;
- surveying tool.

Default rule: hybrid. Basic disposable tools may be stackable only if every unit
is identical and has no durability. Durable tools, skilled tools, enchanted
tools, signed tools, and repairable tools require `ItemInstance`.

### 3.10 Consumable

Item consumed on use.

Sub-categories:

- potion;
- food;
- drink;
- scroll;
- elixir;
- bomb;
- trap kit;
- ammo;
- temporary buff item.

Default rule: stackable when identical. Instanced when freshness, charges,
crafted quality, expiration, binding, poison state, enchantment, or provenance
matters.

### 3.11 Quest

Item used by quest progression.

Sub-categories:

- quest counter;
- quest object;
- quest evidence;
- quest delivery item;
- quest container;
- quest disguise;
- quest temporary tool.

Default rule: hybrid. Simple counters can be stackable. Any quest object with
unique ownership, state, timer, target NPC, delivery route, or story metadata
requires `ItemInstance`.

### 3.12 Currency

Official money and currency-like items.

Sub-categories:

- bronze, silver, gold display denominations;
- event token;
- arena token;
- faction token;
- collectible coin;
- premium or account token if future policy allows it.

Default rule: official money is Economy Wallet only, not `Item` inventory.
Currency-like tokens are stackable unless account-bound, limited, unique, or
auditable as special objects.

### 3.13 Recipe

Knowledge or unlock object for crafting.

Sub-categories:

- recipe scroll;
- blueprint;
- schematic;
- formula;
- cooking recipe;
- construction plan.

Default rule: hybrid. A consumed recipe scroll can be stackable if identical.
Rare signed blueprints, limited plans, discovered plans, or character-bound
unlocks require `ItemInstance` or a future knowledge unlock record.

### 3.14 Key Item

Important access or identity item.

Sub-categories:

- dungeon key;
- city deed;
- house deed;
- guild charter;
- contract;
- permit;
- passport;
- access token;
- quest critical key.

Default rule: `ItemInstance` required unless explicitly modeled as a stackable
counter. Key Items often have binding, ownership, provenance, or unique access
metadata.

### 3.15 Decoration

Housing, settlement, or cosmetic placeable object.

Sub-categories:

- furniture;
- banner;
- statue;
- painting;
- lamp;
- rug;
- garden object;
- trophy;
- sign.

Default rule: hybrid. Commodity decorations can be stackable before placement.
Placed, named, crafted, limited, damaged, or signed decorations require
`ItemInstance`.

### 3.16 Companion

Persistent creature-like owned object that follows or assists a player.

Sub-categories:

- pet;
- familiar;
- summoned companion token;
- cosmetic follower;
- utility companion.

Default rule: `ItemInstance` required or a future dedicated Companion domain
record linked from an item token. Stackable companion items are not allowed once
they represent an actual companion.

### 3.17 Mount

Rideable owned object or unlock.

Sub-categories:

- horse;
- pack animal;
- magical mount;
- mechanical mount;
- cosmetic mount skin.

Default rule: `ItemInstance` required or a future dedicated Mount domain record
linked from an item token. Mount skins may be account unlocks rather than
inventory items.

### 3.18 Misc

Fallback family for objects that do not yet deserve a more specific family.

Sub-categories:

- junk;
- flavor item;
- vendor trash;
- note;
- collectible;
- debug item;
- GM item;
- event object.

Default rule: conservative. Stackable only when identical and low-risk.
Instanced when valuable, bound, limited, event-specific, GM-created, audited, or
usable in player-to-player transfer.

## 4. Official Capability Matrix

Legend:

- `Y`: allowed by default;
- `N`: disallowed by default;
- `H`: hybrid, depends on item subtype or flags;
- `P`: possible future rule, disabled until a system explicitly supports it;
- `E`: exceptional/admin-only rule.

Capabilities:

- `Stack`: can exist as stack quantity;
- `Inst`: uses `ItemInstance`;
- `Equip`: can be equipped;
- `Trade`: player-to-player tradable;
- `Auction`: auctionable;
- `Drop`: droppable to world;
- `Loot`: can be generated by loot;
- `Craft`: can be crafted;
- `Repair`: repairable;
- `Dest`: destructible;
- `NPC Sell`: sellable to NPC;
- `NPC Buy`: buyable from NPC;
- `Mail`: can be mailed;
- `Bank`: can be stored in player bank;
- `Guild`: can be stored in guild storage;
- `House`: can be stored in housing storage;
- `Caravan`: can be transported by caravan;
- `Dur`: durability;
- `Qual`: quality;
- `Enchant`: enchantable;
- `Crafted`: records craftedBy;
- `History`: owner history;
- `Soul`: soulbound possible;
- `Acct`: account-bound possible;
- `Unique`: unique possible.

| Family | Stack | Inst | Equip | Trade | Auction | Drop | Loot | Craft | Repair | Dest | NPC Sell | NPC Buy | Mail | Bank | Guild | House | Caravan | Dur | Qual | Enchant | Crafted | History | Soul | Acct | Unique |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Resource | Y | N | N | Y | P | Y | Y | N | N | Y | Y | Y | Y | Y | Y | H | Y | N | H | N | N | N | N | N | N |
| Material | Y | H | N | Y | P | Y | H | Y | N | Y | Y | Y | Y | Y | Y | H | Y | N | H | H | H | H | H | H | H |
| Building Material | Y | H | N | Y | P | H | H | Y | N | Y | Y | Y | Y | Y | Y | Y | Y | H | H | N | H | H | H | H | H |
| Equipment | N | Y | Y | H | H | H | H | H | Y | H | H | H | H | Y | H | H | H | Y | Y | H | H | Y | H | H | H |
| Weapon | N | Y | Y | H | H | H | H | Y | Y | H | H | H | H | Y | H | H | H | Y | Y | Y | Y | Y | H | H | H |
| Armor | N | Y | Y | H | H | H | H | Y | Y | H | H | H | H | Y | H | H | H | Y | Y | Y | Y | Y | H | H | H |
| Shield | N | Y | Y | H | H | H | H | Y | Y | H | H | H | H | Y | H | H | H | Y | Y | Y | Y | Y | H | H | H |
| Jewelry | N | Y | Y | H | H | H | H | Y | H | H | H | H | H | Y | H | H | H | H | Y | Y | Y | Y | H | H | H |
| Tool | H | H | H | H | H | H | H | Y | H | H | H | H | H | Y | H | H | H | H | H | H | H | H | H | H | H |
| Consumable | Y | H | N | H | H | H | Y | Y | N | Y | H | H | H | Y | H | H | H | N | H | H | H | H | H | H | H |
| Quest | H | H | H | N | N | H | H | H | H | H | N | N | N | H | N | H | N | H | H | H | H | Y | Y | H | H |
| Currency | N | N | N | N | N | N | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | Y | N | N | N |
| Recipe | H | H | N | H | H | H | H | H | N | H | H | H | H | Y | H | H | H | N | H | H | H | H | H | H | H |
| Key Item | H | Y | H | H | H | H | H | H | H | H | H | H | H | Y | H | H | H | H | H | H | H | Y | H | H | Y |
| Decoration | H | H | N | H | H | H | H | Y | H | H | H | H | H | Y | H | Y | H | H | H | H | Y | H | H | H | H |
| Companion | N | Y | H | H | H | H | H | H | H | H | N | H | H | Y | H | H | H | H | H | H | H | Y | H | H | Y |
| Mount | N | Y | H | H | H | H | H | H | H | H | N | H | H | Y | H | H | H | H | H | H | H | Y | H | H | Y |
| Misc | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H | H |

Matrix interpretation rules:

- `Auction = H` means the family may be auctionable only when the specific item
  is tradable, not bound, not quest-locked, not corrupted, and supported by the
  current Auction phase.
- Auction MVP 1 supports only non-stackable `ItemInstance` objects, so stackable
  resources and materials remain out of scope even if future taxonomy allows
  market sale.
- `Trade = H` means binding, ownership, quest status, account policy, or GM
  policy can disable transfer.
- `Drop = H` means world dropping may be blocked for bound, quest, GM, unique,
  or high-risk objects.
- `History = Y` for Currency means Economy ledger history, not `ItemInstance`
  ownership history.

## 5. ItemInstance Rules

### 5.1 Always ItemInstance

These families use `ItemInstance` by default:

- Equipment;
- Weapon;
- Armor;
- Shield;
- Jewelry;
- durable or skilled Tool;
- Key Item;
- Companion;
- Mount;
- unique Decoration;
- quest objects with individual state;
- any object that is bound, signed, enchanted, repaired, upgraded, socketed,
  named, limited, event-specific, GM-created, auction-listed, mailed as a
  specific object, or individually audited.

Reasons:

- each copy may differ;
- ownership transfer must be traceable;
- equipment must reference one concrete object;
- Auction House fixed-price MVP requires one locked listed object;
- repair, durability, enchantment, quality, and provenance are per-object
  attributes.

### 5.2 Always Stackable

These remain stackable by default:

- ordinary raw resources;
- ordinary refined materials;
- ordinary building materials;
- ordinary identical consumables;
- ordinary ammo without modifiers;
- ordinary event counters if they do not represent money or unique access;
- ordinary vendor trash.

Reasons:

- every unit is interchangeable;
- stack quantities reduce storage and inventory noise;
- crafting and gathering loops rely on large quantities;
- per-unit history would add cost without gameplay value.

### 5.3 Hybrid Families

Hybrid families:

- Material;
- Building Material;
- Tool;
- Consumable;
- Quest;
- Recipe;
- Decoration;
- Misc.

Hybrid trigger examples:

- a potion has crafted quality or expiration;
- a blueprint is signed, discovered, or limited;
- a building kit is assigned to a settlement project;
- a quest object has delivery state;
- a decoration is placed, named, damaged, or signed;
- a tool has durability or enchantments.

When a hybrid item becomes instanced, it must stop being represented only by a
stack quantity for that concrete unit.

## 6. Container Eligibility

### 6.1 Inventory Stacks

Inventory stack rows are valid for:

- Resource;
- Material;
- Building Material;
- ordinary Consumable;
- stackable Recipe scrolls;
- stackable Quest counters;
- stackable Misc objects.

Inventory stack rows are not valid for:

- equipped gear;
- auction MVP 1 listings;
- unique quest objects;
- bound unique objects;
- companions;
- mounts;
- placed decorations;
- official currency.

### 6.2 ItemInstance

`ItemInstance` is valid for:

- all equipment;
- durable tools;
- unique consumables;
- unique quest objects;
- key items;
- decorations after placement or personalization;
- companion and mount tokens;
- auction-listed objects;
- mailed, banked, guild-stored, craft-order-reserved, or world-dropped unique
  objects.

### 6.3 WorldItem

`WorldItem` can represent:

- stackable drops as `Item + quantity`;
- unique drops as one `ItemInstance`;
- temporary world objects with expiration;
- loot dropped by resources, creatures, players, admin actions, or events.

World rules:

- a stackable `WorldItem` can merge only with compatible stackable items if
  future policy allows merging;
- a unique `WorldItem` must reference exactly one `ItemInstance`;
- official currency drops should be modeled as Economy rewards or controlled
  loot commands, not loose inventory currency items, unless a future ADR allows
  physical coin piles.

### 6.4 CharacterEquipment

`CharacterEquipment` can contain:

- Weapon;
- Armor;
- Shield;
- Jewelry;
- equipable Tool;
- cosmetic equipment;
- exceptional quest disguise or quest tool.

Equipment rules:

- stack rows cannot be equipped;
- target architecture equips `ItemInstance`;
- one instance cannot be equipped twice;
- an equipped instance cannot be auctioned, mailed, consumed, destroyed, or
  used as craft input without first being unequipped by a valid server action.

### 6.5 Auction

Auction House can contain:

- MVP 1: one non-stackable tradable `ItemInstance` per listing;
- future phases: selected stackable goods only if a dedicated market-stack
  model is designed;
- future phases: timed auctions, black markets, city markets, and guild markets.

Auction rejects by default:

- official currency;
- bound items;
- quest-locked items;
- GM-only items;
- corrupted items;
- equipped items;
- craft-order-reserved items;
- stackable resources in MVP 1.

### 6.6 Mail

Mail can contain:

- tradable stackable goods;
- tradable `ItemInstance` objects;
- future COD or insured deliveries if supported by Economy;
- account-bound items only when sent within the same account if policy allows.

Mail rejects by default:

- soulbound items;
- active quest items;
- official currency unless Economy-backed mail transfers exist;
- GM-only items unless admin tools explicitly allow it.

### 6.7 Bank

Bank can contain:

- stackable goods;
- `ItemInstance` objects;
- account-bound objects;
- future bank-managed currency through Economy Wallets.

Bank rejects by default:

- active craft-order reservations;
- active auction listings;
- temporary expired objects;
- corrupted or review-required objects.

### 6.8 Guild Storage

Guild Storage can contain:

- tradable stackable goods;
- guild-owned materials;
- guild equipment if not soulbound;
- guild trophies and settlement materials;
- future guild currency through Economy Wallets.

Guild Storage rejects by default:

- soulbound items;
- personal quest items;
- account-bound items unless guild policy explicitly supports a safe transfer;
- active auction or craft-order reserved items.

### 6.9 Craft Order

Craft Order can contain:

- reserved stackable ingredients;
- reserved unique ingredients if the recipe explicitly consumes or uses an
  `ItemInstance`;
- reward objects;
- produced output waiting for claim.

Craft Order rules:

- reserved inputs cannot be traded, auctioned, destroyed, equipped, mailed, or
  consumed elsewhere;
- unique output should be created once, with craftedBy and provenance;
- stackable output should be claimable as stack quantity;
- public contribution rules remain future work.

## 7. Exceptions

### 7.1 Quest Items

Quest items override normal transfer rules.

Default restrictions:

- not auctionable;
- not tradable;
- not sellable to NPC;
- not guild-storable;
- not caravan-transportable;
- droppable only if the quest explicitly allows abandoning or dropping;
- owner history required for unique quest objects.

Quest counters can be stackable. Quest objects with state, target, timer, route,
or narrative identity require `ItemInstance`.

### 7.2 Unique Items

Unique items require `ItemInstance`.

Possible uniqueness scopes:

- one per character;
- one per account;
- one per guild;
- one per settlement;
- one globally;
- one active copy while a quest/event is active.

Uniqueness must be enforced by server rules, not by client UI.

### 7.3 GM Items

GM-created or admin-only items require audit.

Rules:

- default not tradable;
- default not auctionable;
- default not droppable;
- visible in DevTools;
- ownership and creation reason recorded;
- deletion or correction must use an audited admin action.

### 7.4 Temporary Items

Temporary items expire or become invalid.

Examples:

- event consumable;
- summoned object;
- temporary quest disguise;
- trial mount;
- timed access key.

Rules:

- expiration must be persisted when it affects gameplay;
- expiration must not depend only on in-memory timers;
- expired unique items move to an expired, destroyed, or review state according
  to item policy.

### 7.5 Bound Items

Binding can disable transfer without changing family.

Binding types:

- soulbound to character;
- account-bound;
- guild-bound;
- settlement-bound;
- bind-on-pickup;
- bind-on-equip;
- bind-on-use.

Bound state belongs to the instance or to a persistent unlock policy, not to the
client.

### 7.6 Event Items

Event items can be stackable or instanced.

Rules:

- event tokens are stackable unless they grant unique access;
- event cosmetics are instanced or account unlocks;
- expired event items must have explicit policy;
- future event markets must define whether event items can be auctioned.

### 7.7 Skins and Cosmetics

Cosmetics can be:

- inventory items;
- equipment appearance items;
- account unlocks;
- transmog appearances;
- consumable appearance tokens.

Rules:

- appearance-only does not imply stackable;
- cosmetics with ownership, rarity, edition, signature, or trade history require
  `ItemInstance` or a future unlock record;
- transmog must not duplicate the source item.

## 8. Future Evolution Compatibility

The taxonomy must support these systems without changing family definitions:

- durability;
- repair;
- crafting quality;
- crafter signatures;
- upgrades;
- enchantments;
- socketed gems;
- skins;
- transmogrification;
- legendary affixes;
- living items;
- item aging;
- corruption or curse states;
- insurance;
- caravan transport;
- black market restrictions;
- guild ownership;
- settlement ownership;
- bank custody;
- item provenance audit.

Future features add flags, policies, instance metadata, or domain records. They
must not redefine `Weapon`, `Armor`, `Resource`, or other families.

## 9. DevTools Requirements

DevTools should display item data without owning business logic.

For every item template:

- template id;
- name;
- family;
- sub-category;
- current `type` and `category`;
- base stats;
- default capabilities;
- stackable vs instanced default;
- linked recipes;
- linked loot pools;
- current inventory usage.

For every `ItemInstance`:

- instance id;
- template id and template summary;
- state;
- owner type and owner id;
- container type and container id;
- quality;
- durability;
- binding state;
- craftedBy;
- craftedAt;
- repair count;
- enchantments;
- sockets/gems;
- provenance/source;
- current lock purpose;
- auction listing id if listed;
- craft order id if reserved;
- mail/bank/guild storage reference if stored there;
- owner history;
- movement history;
- last economic correlation id if a sale or transfer moved currency.

Admin actions must be explicit, authorized, and audited. DevTools must not
perform hidden item duplication, silent ownership transfer, silent deletion, or
direct Economy balance edits.

## 10. Validation and Impact

### 10.1 Inconsistencies With Current Architecture

Observed inconsistencies:

- `Inventory` currently stores every item as `Item + quantity`, including
  future equipment outputs.
- `CharacterEquipment` references `Item`, not a concrete object.
- `Item` has no official family field, stackability rule, binding policy,
  auction policy, quality rule, durability rule, or instance mode.
- `WorldItem` currently stores catalogue `itemId + quantity`, not
  `ItemInstance`.
- runtime crafting produces `basic_sword` as quantity output, but target rules
  require weapons to be instanced.
- loot pools reference item ids or categories as stack-like outputs.

These are documentation findings only. They do not require immediate Runtime
changes in this mission.

### 10.2 Impact on ItemInstance

`ItemInstance` becomes mandatory for:

- equipment;
- Auction MVP 1 listed objects;
- unique world drops;
- bound items;
- quest objects with state;
- durable or enchanted tools;
- unique recipes, decorations, companions, and mounts.

The instance model must support state, container, owner, durability, quality,
craftedBy, binding, provenance, metadata, and append-only history.

### 10.3 Impact on Inventory

Inventory becomes hybrid:

- stack rows for interchangeable goods;
- instance view for concrete objects held by the character.

Inventory UI and services must eventually distinguish:

- stack quantity;
- item instance;
- equipped instance;
- locked/reserved instance;
- auction-listed instance;
- craft-order-reserved stack or instance.

### 10.4 Impact on Economy

Economy remains responsible for money only.

Impacts:

- official currency is not represented as stack inventory;
- NPC sales, Auction House, craft payments, taxes, treasury, quest rewards, and
  loot money use Wallet and Ledger;
- item transfers must correlate with EconomicTransaction when currency moves,
  but item identity is not owned by Economy;
- event tokens or non-money currencies must be explicitly classified before
  being treated as items.

### 10.5 Impact on Auction House

Auction MVP 1 can proceed only with non-stackable tradable `ItemInstance`
objects.

Auction must reject:

- stack rows;
- official currency;
- bound items;
- quest-locked items;
- equipped items;
- craft-order-reserved items;
- corrupted items;
- items not marked auctionable by taxonomy policy.

Future resource markets require a separate stack listing design and are not
part of Auction MVP 1.

## 11. Architecture Decisions Proposed

These are proposed documentation decisions, not accepted ADRs.

1. `Item` is the template and must not carry player-specific state.
2. `ItemInstance` is mandatory for any object with identity, equipment state,
   binding, durability, quality, enchantment, crafted signature, or audit needs.
3. Official currency is Economy Wallet state, not inventory stack state.
4. Resources and ordinary materials remain stackable by default.
5. Equipment is instanced by default, including all weapons, armor, shields, and
   jewelry.
6. Auction MVP 1 supports only tradable non-stackable `ItemInstance` objects.
7. Hybrid families must define the trigger that converts a stackable template
   into an instanced object.
8. DevTools observes and corrects through audited Runtime actions; it does not
   own item rules.

## 12. Points Ouverts

Open business questions:

- What are the first official family and sub-category enum names?
- Should `Material` and `Resource` be separate top-level families or should
  `Resource` be a subtype of `Material` in UI?
- Which stackable families become eligible for a future commodity market?
- Which binding types are enabled first?
- Are cosmetics stored as inventory items, account unlocks, or both?
- Are companions and mounts item instances, dedicated domain records, or a
  hybrid token plus domain record?
- Do high-quality crafted components remain stackable or become instanced at the
  first quality system milestone?
- Which items are sellable to NPCs at launch, and which are vendor trash only?
- Should dropped stackable items merge in the world or stay as separate
  `WorldItem` records?

## 13. Implementation Readiness Checklist

Before coding item taxonomy support:

- classify all seeded `Item` templates into official families;
- decide first implementation names for family and sub-category values;
- define which current items remain stackable;
- define that `basic_sword` and future equipment outputs create
  `ItemInstance`;
- decide whether existing equipment rows migrate immediately or through a
  compatibility layer;
- decide whether Auction MVP 1 waits for ItemInstance foundation;
- define DevTools read-only inspection for item template and future instance
  state;
- document any new durable architecture decision as an ADR if it changes an
  accepted project boundary.
