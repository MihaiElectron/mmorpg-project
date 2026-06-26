# Settlement System - Gameplay Loops

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Depends on: docs/08_Gameplay/settlement-economy-architecture.md, docs/08_Gameplay/settlement-economy-review.md, docs/08_Gameplay/README.md
- Used by: Project owner, game design, developers, conversational assistants, repository-aware coding agents

## Scope

This document is the gameplay reference for the future Settlement System.

It describes economic loops, professions, buildings, resources, production
chains, money flows, and future-compatible systems. It does not define database
tables, APIs, Runtime services, migrations, controllers, gateways, Studio
panels, or implementation details.

The Settlement System remains server-authoritative in future implementation:
the client displays and sends intentions; the server validates ownership,
inventory, currency, taxes, production, auction state, and settlement effects.

## 1. Gameplay intent

Settlements are not decorative towns. They are economic engines.

A settlement should make players care about:

- where resources are gathered;
- who transports them;
- which workshops can transform them;
- which professions are needed;
- which buildings deserve investment;
- where goods are sold;
- how taxes feed the treasury;
- how the treasury unlocks better services;
- how city growth creates new demand.

The core fantasy is a living city economy:

```text
World resources
-> Player labor
-> Transport and storage
-> Workshops
-> Goods and services
-> Market exchange
-> Taxes and fees
-> Treasury
-> Buildings and upgrades
-> New economic opportunities
```

The goal is not to make every player participate in every step. The goal is to
make each step useful to someone and connected to the city.

## 2. Main economic loops

### 2.1 Resource extraction loop

Players gather raw resources and inject physical goods into the economy.

```text
Mine / Forest / River / Field
└── Raw resource
    └── Transport
        └── Storage or workshop
            └── Refining
                └── Craft ingredient
                    └── Production order
                        └── Finished good
```

Examples:

- mine -> ore -> ingot -> blade;
- forest -> log -> plank -> bow;
- river -> fish -> meal -> food buff;
- herb patch -> herb -> extract -> potion.

Design purpose:

- gives gatherers a permanent role;
- feeds crafters without requiring every crafter to gather;
- creates regional scarcity if resources differ by map or biome;
- supports future transport risk and caravan gameplay.

### 2.2 Workshop production loop

Workshops convert resources into goods through professions.

```text
Raw or refined inputs
└── Workshop
    └── Profession skill
        └── Tool quality
            └── Production time
                └── Finished item
                    └── Sale, use, repair, or city project
```

Design purpose:

- connects buildings to production capacity;
- makes workshop upgrades meaningful;
- allows NPC orders, public orders, and future guild orders;
- creates demand for refined materials and tools.

### 2.3 Market sale loop

Goods become currency through market exchange.

```text
Produced good
└── Listing or direct contract
    └── Buyer payment
        ├── Seller revenue
        └── City tax
            └── Treasury
```

Design purpose:

- lets specialists monetize labor;
- lets non-crafters buy outputs;
- feeds the treasury through economic activity;
- creates price discovery through supply and demand.

### 2.4 Tax and treasury loop

Economic activity funds settlement growth.

```text
Sale / Auction / Service fee
└── Tax
    └── Treasury
        ├── Building upgrade
        ├── Service unlock
        ├── Maintenance
        └── Future defense or event response
```

Design purpose:

- links private trade to public progress;
- gives governors or future councils meaningful budget choices;
- creates gold sinks through upgrades and maintenance;
- lets active towns grow faster than inactive towns.

### 2.5 Building growth loop

Treasury spending creates better economic infrastructure.

```text
Treasury funds
└── Building project
    └── Construction time
        └── Upgraded service
            ├── More capacity
            ├── Lower production time
            ├── Better recipes
            ├── Lower maintenance waste
            └── New market demand
```

Design purpose:

- transforms taxes into visible progression;
- gives settlements identity through building priorities;
- creates communal goals beyond individual gear.

### 2.6 Maintenance loop

Buildings need upkeep so the economy has sinks and trade pressure.

```text
Active building
└── Maintenance need
    ├── Currency upkeep
    └── Material upkeep
        └── Paid from treasury or city storage
            └── Building remains efficient
```

If maintenance is unpaid:

```text
Unpaid maintenance
└── Reduced efficiency
    ├── Longer production
    ├── Higher service fees
    ├── Lower capacity
    └── Temporary service lock
```

Design purpose:

- prevents one-time upgrades from solving the economy forever;
- keeps low-tier resources useful;
- gives gatherers and traders recurring demand.

### 2.7 Public order loop

Players can fund demand that other players satisfy.

```text
Requester creates order
└── Escrowed reward and/or ingredients
    └── Contributors add missing inputs
        └── Artisan accepts or workshop queues
            └── Item produced
                ├── Requester receives output
                ├── Artisan receives reward
                └── City receives fee
```

Design purpose:

- lets non-crafters commission items;
- lets gatherers contribute partial materials;
- creates cooperation without requiring guild membership;
- supports future player contracts.

### 2.8 Interdependence loop

Each profession should need at least one other profession.

```text
Gatherer
└── Refiner
    └── Crafter
        └── Consumer
            └── Repair or replacement demand
                └── Gatherer
```

Design purpose:

- avoids isolated professions;
- prevents one profession from becoming the only profitable path;
- encourages trade and specialization.

### 2.9 City population loop

Population is a future abstraction representing active players, NPC workforce,
or service demand.

```text
Better services
└── More player activity
    └── More trade
        └── More tax revenue
            └── Better services
```

Risk:

```text
Inactive city
└── Low trade
    └── Low treasury
        └── Poor maintenance
            └── Worse services
                └── Lower activity
```

Design purpose:

- creates city identity and competition;
- supports future governance;
- must include catch-up mechanics to avoid permanent dead cities.

## 3. Professions

### 3.1 Common profession structure

Every profession should define:

- role: what economic need it satisfies;
- progression: what improves with skill;
- tools: what it needs to work efficiently;
- workshop: where advanced work happens;
- resources: what it consumes or produces;
- dependencies: which other professions it relies on;
- outputs: what it sells or contributes;
- city interaction: which buildings or taxes affect it.

Progression should usually affect:

- recipe access;
- production speed;
- material efficiency;
- quality chance;
- failure reduction if failure exists;
- ability to process rare resources;
- contribution value for public orders.

Progression must not create infinite value from nothing. Higher skill should
improve conversion, access, or quality, not create free high-value resources
without sinks.

### 3.2 Mineur

Role:

- extracts ore, stone, gems, salt, coal, and rare minerals.

Progression:

- access to harder nodes;
- better yield stability;
- lower tool wear;
- chance to find rare byproducts;
- ability to identify high-grade ore.

Tools:

- pickaxe;
- lantern for deep mines;
- reinforced cart for bulk extraction;
- future explosives or drilling tools.

Workshops:

- mine;
- quarry;
- smelter for refining handoff;
- warehouse for bulk storage.

Resources:

- copper ore, iron ore, silver ore, gold ore;
- stone, marble, clay;
- coal, sulfur, salt;
- gems and rare crystals.

Dependencies:

- blacksmith for better pickaxes;
- carpenter for carts and mine supports;
- cook for stamina food;
- alchemist for blasting powder or safety tonics.

Production:

- ore for blacksmiths;
- stone for buildings;
- gems for jewelcrafting and enchanting future;
- coal for smelting.

Interactions:

- feeds forge, masonry, road building, siege future;
- creates heavy transport demand.

### 3.3 Bucheron

Role:

- gathers wood, bark, resin, sap, and fiber-like forest materials.

Progression:

- access to harder trees;
- better log yield;
- reduced axe wear;
- chance of rare wood;
- improved replanting or sustainable harvesting future.

Tools:

- axe;
- saw;
- wedges;
- rope;
- logging cart.

Workshops:

- forest camp;
- sawmill;
- carpentry workshop.

Resources:

- logs;
- branches;
- bark;
- resin;
- rare heartwood;
- charcoal material.

Dependencies:

- blacksmith for axe heads and saw blades;
- carpenter for carts;
- alchemist for resin processing;
- tanner for straps.

Production:

- logs for planks;
- planks for bows, furniture, buildings, ships, wagons;
- resin for alchemy and shipbuilding.

Interactions:

- feeds menuisier, port, caserne, housing future;
- supports maintenance loops through planks and beams.

### 3.4 Forgeron

Role:

- transforms metal into tools, weapons, armor, fittings, nails, and building
  hardware.

Progression:

- unlocks stronger alloys;
- improves durability and quality;
- reduces ingot waste;
- crafts advanced tools for other professions;
- repairs metal equipment efficiently.

Tools:

- hammer;
- tongs;
- anvil;
- bellows;
- molds;
- sharpening stones.

Workshops:

- forge;
- smelter;
- armory;
- future foundry.

Resources:

- ingots;
- coal;
- leather straps;
- wood handles;
- gems for advanced gear future.

Dependencies:

- miner for ore and coal;
- bucheron/menuisier for handles and charcoal;
- tanneur for straps;
- alchemist for flux, acids, alloys future.

Production:

- weapons;
- armor;
- tools;
- nails and hinges;
- building hardware;
- repair kits.

Interactions:

- supplies almost every gathering profession with better tools;
- creates major material sink through repairs and upgrades.

### 3.5 Tisseur

Role:

- transforms fibers into cloth, thread, ropes, bags, light armor, sails, and
  decorative goods.

Progression:

- unlocks fine fabrics;
- improves cloth quality;
- reduces fiber loss;
- creates larger bags or stronger sails;
- processes rare fibers.

Tools:

- spindle;
- loom;
- needle;
- dye vats;
- cutting tools.

Workshops:

- loom house;
- dye workshop;
- tailor shop.

Resources:

- flax;
- wool;
- cotton future;
- silk future;
- dyes;
- leather or metal fittings for advanced goods.

Dependencies:

- farmer or shepherd future for fibers;
- alchemist for dyes;
- tanneur for reinforced cloth/leather combinations;
- blacksmith for needles and fittings.

Production:

- cloth armor;
- robes;
- bags;
- sails;
- ropes;
- banners;
- upholstery for buildings.

Interactions:

- supports port through sails and rope;
- supports market and caravan loops through bags;
- supports city identity through banners and uniforms future.

### 3.6 Menuisier

Role:

- crafts wooden goods, structural components, bows, furniture, wagons, barrels,
  and building parts.

Progression:

- unlocks advanced joinery;
- improves durability;
- reduces plank waste;
- creates higher-capacity containers and vehicles;
- works rare woods.

Tools:

- saw;
- plane;
- chisel;
- mallet;
- measuring tools;
- clamps.

Workshops:

- carpentry workshop;
- sawmill;
- wheelwright area future;
- shipyard future.

Resources:

- logs;
- planks;
- resin;
- nails;
- cloth or leather straps.

Dependencies:

- bucheron for wood;
- blacksmith for nails and tools;
- tisseur for rope and sails;
- tanneur for straps;
- alchemist for varnish and resin treatments.

Production:

- bows;
- shields;
- furniture;
- carts;
- barrels;
- beams;
- ship components future.

Interactions:

- core profession for building upgrades;
- enables caravans through wagons;
- supports storage and warehouse loops.

### 3.7 Alchimiste

Role:

- transforms herbs, minerals, monster parts, oils, and reagents into potions,
  dyes, explosives, preservatives, solvents, and catalysts.

Progression:

- unlocks stronger recipes;
- improves batch yield;
- reduces instability;
- processes rare reagents;
- creates catalysts that improve other crafting.

Tools:

- mortar and pestle;
- alembic;
- cauldron;
- glassware;
- burner;
- measuring scales.

Workshops:

- alchemy lab;
- herb drying room;
- apothecary;
- dye house.

Resources:

- herbs;
- mushrooms;
- fish oils;
- minerals;
- sulfur;
- monster parts future;
- water and alcohol bases.

Dependencies:

- herbalist future or gatherers for plants;
- miner for minerals and sulfur;
- fisher for oils;
- glassmaker future for vessels;
- cook for fermentation bases future.

Production:

- health potions;
- stamina potions;
- dyes;
- flux for smithing;
- preservatives for cooking;
- explosives future;
- reagents for rare crafts.

Interactions:

- supports combat economy with consumables;
- supports tisseur through dyes;
- supports forgeron through flux;
- supports caravan and siege future through explosives and preservatives.

### 3.8 Tanneur

Role:

- transforms hides into leather, straps, armor components, saddles, bags, and
  reinforced materials.

Progression:

- unlocks exotic hides;
- improves leather quality;
- reduces curing time;
- creates reinforced and waterproof leather;
- improves repair efficiency.

Tools:

- skinning knife;
- scraping beam;
- tanning vats;
- stretching frame;
- stitching tools.

Workshops:

- tannery;
- drying yard;
- leather workshop.

Resources:

- hides;
- bark tannins;
- salt;
- oils;
- thread;
- metal buckles.

Dependencies:

- hunters future for hides;
- bucheron for bark;
- miner for salt;
- tisseur for thread;
- blacksmith for buckles and blades.

Production:

- leather armor;
- straps;
- saddles;
- bags;
- gloves;
- tool grips;
- waterproof containers.

Interactions:

- supports blacksmith and carpenter through straps/grips;
- supports caravans through saddles and harnesses;
- supports combat through leather gear.

### 3.9 Pecheur

Role:

- gathers fish, shellfish, oils, pearls, and aquatic reagents.

Progression:

- access to deeper or rarer fishing spots;
- better catch stability;
- reduced bait loss;
- chance for rare aquatic materials;
- improved preservation.

Tools:

- fishing rod;
- nets;
- traps;
- boat future;
- bait box.

Workshops:

- fishing dock;
- smokehouse;
- port;
- kitchen.

Resources:

- fish;
- shellfish;
- fish oil;
- pearls;
- scales;
- seaweed;
- rare aquatic reagents.

Dependencies:

- menuisier for rods, boats, barrels;
- tisseur for nets;
- blacksmith for hooks;
- cook for food conversion;
- alchemist for oils and reagents.

Production:

- food ingredients;
- oils;
- alchemy reagents;
- luxury goods like pearls.

Interactions:

- supports cooking and alchemy;
- becomes central when port and maritime trade exist.

### 3.10 Cuisinier

Role:

- transforms food resources into meals that provide buffs, morale, stamina, and
  future population support.

Progression:

- unlocks better recipes;
- increases batch size;
- improves buff duration or quality;
- reduces spoilage;
- cooks rare feasts for events.

Tools:

- knife;
- cooking pot;
- oven;
- smoker;
- spice rack.

Workshops:

- kitchen;
- tavern;
- smokehouse;
- bakery future.

Resources:

- fish;
- meat future;
- grain;
- vegetables;
- herbs;
- salt;
- spices;
- alcohol bases future.

Dependencies:

- fisher for fish;
- farmer future for grain and vegetables;
- hunter future for meat;
- miner for salt;
- alchemist for preservatives and extracts.

Production:

- meals;
- rations;
- feasts;
- travel supplies;
- workforce food future.

Interactions:

- supports gatherers through stamina;
- supports caravans through rations;
- supports population and tavern loops.

### 3.11 Future professions

Future-compatible professions:

- farmer: grain, vegetables, animal feed, textiles;
- herbalist: herbs, mushrooms, flowers, rare plants;
- hunter: hides, meat, bones, trophies;
- mason: stone blocks, roads, walls, fortifications;
- jeweler: gems, rings, amulets, luxury goods;
- scribe: contracts, maps, permits, city records;
- glassmaker: bottles, lenses, windows, alchemy glassware;
- shipwright: boats, sails integration, maritime trade;
- merchant: better market fees, caravan contracts, appraisal;
- banker: loans, deposits, insurance, credit risk;
- guard/soldier: caravan protection, siege defense, enforcement;
- smuggler: black market and contraband future.

Future professions should only be added when they create a real loop, not only
a recipe category.

## 4. Buildings

### 4.1 Common building structure

Every settlement building should define:

- role;
- services;
- improvements;
- construction cost;
- maintenance cost;
- economic impact;
- failure state when disabled or under-maintained.

Costs should combine:

- currency;
- local resources;
- refined materials;
- manufactured components;
- construction time;
- future labor or governance approval.

### 4.2 Forge

Role:

- metal production, tools, weapons, armor, repairs.

Services:

- smelting;
- smithing;
- tool repair;
- weapon and armor commissions;
- metal component production.

Improvements:

- more production slots;
- faster smelting;
- access to alloys;
- lower fuel consumption;
- better repair efficiency.

Costs:

- stone, iron, coal, planks, metal fittings.

Maintenance:

- coal, replacement tools, bellows, anvil upkeep.

Impact:

- boosts every tool-dependent profession;
- creates high-value goods and repair sinks.

### 4.3 Scierie

Role:

- transforms logs into planks, beams, barrels, and construction wood.

Services:

- log processing;
- plank batching;
- beam production;
- wood storage.

Improvements:

- higher log throughput;
- reduced waste;
- rare wood processing;
- bulk contracts.

Costs:

- logs, stone foundation, metal saws, rope.

Maintenance:

- saw blades, lubricant, replacement belts or ropes.

Impact:

- accelerates building upgrades;
- supports carpentry and port development.

### 4.4 Taverne

Role:

- social, food, buffs, public order discovery, future workforce morale.

Services:

- meal sales;
- bulletin board for contracts;
- rest bonuses;
- future NPC recruitment.

Improvements:

- better buff duration;
- more contract visibility;
- increased visitor attraction;
- event hosting.

Costs:

- planks, stone, cloth, furniture, kitchen equipment.

Maintenance:

- food, drink, staff wages future, furniture repairs.

Impact:

- increases player retention in a city;
- creates food demand;
- supports public contracts.

### 4.5 Marche

Role:

- local exchange hub for goods and direct trade.

Services:

- stalls;
- price boards;
- local fixed-price listings;
- contract discovery.

Improvements:

- more listing slots;
- better search;
- lower spoilage for food;
- special stalls for rare goods.

Costs:

- planks, cloth awnings, stone paving, permits.

Maintenance:

- cleaning, guards, stall repairs.

Impact:

- increases local liquidity;
- feeds taxes;
- creates early economy before full auction house.

### 4.6 Banque (future)

Role:

- stores currency, supports deposits, loans, insurance, and long-distance
  finance.

Services:

- account storage;
- city escrow services;
- future loans;
- future letters of credit;
- future insurance policies.

Improvements:

- higher storage limits;
- lower transfer fees;
- safer caravan finance;
- wider inter-city access.

Costs:

- stone, metal locks, guards, administrative records.

Maintenance:

- guards, clerks, vault repairs.

Impact:

- enables advanced economy;
- must not create money without strict rules.

### 4.7 Entrepot

Role:

- stores bulk resources and city materials.

Services:

- city material storage;
- player or guild storage future;
- input buffer for workshops;
- caravan cargo staging.

Improvements:

- more capacity;
- better preservation;
- loading speed;
- access permissions.

Costs:

- planks, stone, locks, rope, carts.

Maintenance:

- repairs, pest control, guard wages future.

Impact:

- reduces transport friction;
- enables city projects requiring large material volume.

### 4.8 Hotel des ventes

Role:

- formal marketplace for fixed-price sales and auctions.

Services:

- item listing;
- timed auctions;
- buyout;
- bid escrow;
- sale tax collection.

Improvements:

- more listings;
- better search categories;
- longer listing durations;
- lower deposit fees or higher trust tier;
- regional market visibility future.

Costs:

- stone, desks, ledgers, guards, scales, secure storage.

Maintenance:

- clerks, guards, ledger upkeep, vault maintenance.

Impact:

- major tax engine;
- high exploit risk;
- must rely on Economy Core and escrow.

### 4.9 Mairie

Role:

- settlement administration, treasury control, policy, upgrades, governance.

Services:

- tax policy;
- building upgrade queue;
- city permissions;
- future elections and governor actions.

Improvements:

- more simultaneous projects;
- better governance tools;
- more precise tax policies;
- diplomacy future.

Costs:

- stone, wood, cloth, furniture, records.

Maintenance:

- clerks, records, repairs.

Impact:

- unlocks city-wide progression;
- central point for governance and treasury decisions.

### 4.10 Caserne

Role:

- defense, guards, future caravan escorts, siege readiness.

Services:

- guard recruitment future;
- caravan escort contracts;
- city defense state;
- weapons demand.

Improvements:

- more guard capacity;
- better escort quality;
- siege resistance;
- patrol routes future.

Costs:

- stone, weapons, armor, food, training equipment.

Maintenance:

- wages future, food, repairs, weapon upkeep.

Impact:

- creates recurring demand for blacksmiths, cooks, and leatherworkers;
- supports conquest and siege systems later.

### 4.11 Port

Role:

- maritime trade, fishing expansion, ship construction, inter-city routes.

Services:

- docks;
- fish landing;
- sea trade contracts;
- ship repair future.

Improvements:

- more dock slots;
- larger cargo;
- longer trade routes;
- storm resistance.

Costs:

- beams, planks, rope, sails, tar/resin, metal fittings.

Maintenance:

- plank repair, rope, sails, harbor workers future.

Impact:

- opens commerce maritime;
- makes tisseur, menuisier, pecheur, and alchimiste more valuable.

### 4.12 Ferme

Role:

- food, fibers, animal products, population support.

Services:

- crops;
- livestock future;
- fiber production;
- seed storage.

Improvements:

- crop variety;
- yield stability;
- irrigation;
- animal pens.

Costs:

- land preparation, tools, planks, wells, seeds.

Maintenance:

- seeds, tools, fertilizer future, water.

Impact:

- stabilizes cooking economy;
- supports textiles and population loops.

## 5. Resource classes

### 5.1 Natural resources

Natural resources enter the economy through gathering.

Examples:

- ore, stone, clay, coal, sulfur;
- logs, bark, resin, herbs;
- fish, seaweed, pearls;
- flax, grain, vegetables;
- hides and meat future.

Gameplay rule:

- natural resources should be regionally distributed to create trade.

### 5.2 Refined resources

Refined resources are processed materials.

Examples:

- ingots from ore;
- planks from logs;
- cloth from fibers;
- leather from hides;
- oil from fish;
- dyes from herbs/minerals;
- stone blocks from stone.

Gameplay rule:

- refining should reduce volume, increase value, or unlock craft usability.

### 5.3 Manufactured resources

Manufactured resources are components or finished goods.

Examples:

- tools;
- weapons;
- armor;
- barrels;
- carts;
- sails;
- potions;
- meals;
- repair kits.

Gameplay rule:

- manufactured goods should have use, sale, maintenance, or upgrade demand.

### 5.4 Rare resources

Rare resources create specialization and regional value.

Examples:

- rare ores;
- rare woods;
- rare herbs;
- pearls;
- gems;
- exotic hides;
- ancient fragments future.

Gameplay rule:

- rare resources should not be required for basic city survival;
- they should unlock premium recipes, cosmetics, or advanced upgrades.

### 5.5 Legendary resources

Legendary resources should be event-driven, boss-driven, conquest-driven, or
extremely rare.

Examples:

- dragon scale future;
- star metal;
- world tree heartwood;
- leviathan oil;
- relic shard.

Gameplay rule:

- legendary resources must have strict sinks and binding rules;
- they should not become normal market commodities too easily.

## 6. Main transformations

```text
Ore
└── Smelting
    └── Ingot
        ├── Tool
        ├── Weapon
        ├── Armor
        └── Building hardware
```

```text
Tree
└── Log
    └── Sawmill
        └── Plank
            ├── Bow
            ├── Barrel
            ├── Cart
            ├── Furniture
            └── Building beam
```

```text
Fiber
└── Spinning
    └── Thread
        └── Weaving
            └── Cloth
                ├── Bag
                ├── Sail
                ├── Robe
                └── Banner
```

```text
Hide
└── Curing
    └── Leather
        ├── Strap
        ├── Armor
        ├── Saddle
        ├── Bag
        └── Tool grip
```

```text
Herb / Mineral / Oil
└── Alchemy
    └── Reagent
        ├── Potion
        ├── Dye
        ├── Flux
        ├── Preservative
        └── Explosive future
```

```text
Fish / Grain / Meat / Herbs
└── Kitchen
    └── Meal
        ├── Player buff
        ├── Caravan ration
        ├── Tavern service
        └── Population support future
```

## 7. Production chains

### 7.1 Weapon chain

```text
Mine
└── Ore
    └── Forge / Smelter
        └── Ingot
            ├── Blacksmith skill
            ├── Wood handle from Carpenter
            └── Leather grip from Tanner
                └── Weapon
                    ├── Player equipment
                    ├── Sale at market
                    ├── Auction listing
                    └── Repair demand
```

### 7.2 Tool chain

```text
Mine + Forest
├── Ore -> Ingot
└── Log -> Handle
    └── Forge
        └── Tool
            ├── Better gathering
            ├── Tool wear
            └── Replacement demand
```

### 7.3 Bow chain

```text
Forest
└── Rare or normal wood
    └── Sawmill
        └── Plank
            ├── Tisseur string
            └── Menuisier
                └── Bow
                    ├── Sale
                    └── Repair
```

### 7.4 Potion chain

```text
Herb patch + Mine + River
├── Herbs
├── Minerals
└── Fish oil
    └── Alchemy lab
        └── Potion
            ├── Combat use
            ├── Gathering use
            ├── Auction sale
            └── Recurring demand
```

### 7.5 Food chain

```text
Farm + River + Field
├── Grain
├── Fish
├── Meat future
└── Herbs
    └── Kitchen / Tavern
        └── Meal
            ├── Player buff
            ├── Worker morale future
            ├── Caravan ration
            └── Gold sink through service fee
```

### 7.6 Building chain

```text
Mine + Forest + Workshop
├── Stone
├── Planks
├── Nails
├── Cloth
└── Tools
    └── Construction project
        └── Building upgrade
            ├── Better production
            ├── More services
            └── Higher maintenance demand
```

### 7.7 Caravan chain future

```text
Local surplus
└── Warehouse
    └── Caravan contract
        ├── Wagon from Carpenter
        ├── Harness from Tanner
        ├── Guards from Barracks
        └── Rations from Cook
            └── Destination city
                ├── Sale
                ├── Tariff
                └── Regional price change
```

### 7.8 Maritime chain future

```text
Port city
├── Ship parts from Carpenter
├── Sails from Weaver
├── Tar / resin from Alchemist
└── Metal fittings from Blacksmith
    └── Ship route
        └── Distant market
            ├── Import rare goods
            ├── Export surplus
            └── Port taxes
```

## 8. Money flows

### 8.1 Gold creation

Gold creation should be limited and intentional.

Possible sources:

- quest rewards future;
- monster loot future;
- NPC buy orders with fixed budgets;
- city-funded public works rewards;
- event rewards;
- daily or tutorial rewards with strict caps.

Rule:

- player-to-player trade does not create gold; it only moves gold.

### 8.2 Gold destruction

Gold sinks are required for stability.

Primary sinks:

- listing deposit fees;
- auction taxes;
- direct sale taxes;
- repair fees;
- building upgrades;
- building maintenance;
- travel fees future;
- caravan insurance future;
- bank fees future;
- crafting service fees;
- permit fees for market stalls or contracts.

Rule:

- taxes moved to treasury are not destroyed unless spent on NPC/system costs.
  They are public money. Maintenance paid to non-player upkeep can destroy gold.

### 8.3 Inflation risks

Inflation happens when gold creation exceeds useful sinks or when goods are too
easy to generate.

Main risks:

- NPC buy orders with unlimited budget;
- resource nodes with no scarcity;
- high-value drops without durability or repair sinks;
- taxes that only move gold to treasury but never remove it;
- public rewards funded by newly created system gold;
- duplicated items or currency through concurrency bugs.

Controls:

- finite NPC budgets;
- repair and maintenance costs;
- listing deposits;
- auction fees;
- item durability;
- resource respawn tuning;
- city project costs;
- economic audit and price monitoring.

### 8.4 Taxes

Taxes should be transparent and bounded.

Taxable actions:

- direct market sale;
- successful auction;
- listing deposit;
- workshop commission;
- storage rental future;
- caravan import/export future;
- port tariff future.

Tax design:

- taxes should vary by settlement only after governance exists;
- tax caps prevent abusive city settings;
- tax changes should not affect already active listings unless explicitly
  stated;
- applied tax should be snapshotted at settlement time.

### 8.5 Maintenance and repairs

Repairs preserve demand after initial crafting.

```text
Item use
└── Durability loss future
    └── Repair
        ├── Gold fee
        └── Material fee
            └── Profession demand
```

Building maintenance:

```text
Active service
└── Periodic upkeep
    ├── Treasury payment
    ├── Material consumption
    └── Failure if unpaid
```

### 8.6 Auction flow

```text
Seller lists item
├── Deposit fee sink or treasury fee
├── Item escrow
└── Listing active
    ├── Direct buyout
    │   ├── Buyer gold -> Seller
    │   ├── Tax -> Treasury
    │   └── Item -> Buyer
    └── Auction bid
        ├── Bidder gold locked
        ├── Previous bidder refunded
        └── Highest bid settles at expiration
```

## 9. System interactions

### 9.1 Craft and inventory

```text
Inventory
└── Ingredients selected
    └── Server validation
        └── Escrow or consume
            └── Craft output
                └── Inventory
```

Gameplay rule:

- ingredients in escrow cannot be traded, sold, equipped, destroyed, or used
  by another craft.

### 9.2 Craft and Auction House

```text
Craft output
├── Equip or use
├── Public order delivery
└── Auction listing
    └── Sale
        └── Profession profit
```

Gameplay rule:

- the market should reveal which professions are undersupplied.

### 9.3 Auction and Treasury

```text
Auction settlement
├── Seller payout
├── Buyer item delivery
└── Tax
    └── Treasury
```

Gameplay rule:

- treasury revenue should be visible to authorized city roles and auditable.

### 9.4 Treasury and Buildings

```text
Treasury
└── Upgrade project
    └── Building improvement
        └── More economic capacity
```

Gameplay rule:

- building spending should compete for limited funds.

### 9.5 Buildings and Production

```text
Building level
├── Workshop capacity
├── Production speed
├── Recipe access
└── Maintenance burden
```

Gameplay rule:

- higher level should be stronger but not free to operate.

### 9.6 Production and City

```text
City services
└── Production output
    └── Market activity
        └── Tax revenue
            └── City services
```

Gameplay rule:

- settlements should specialize through available buildings and resource
  access.

### 9.7 City and population

```text
Good services
└── More visitors
    └── More demand
        └── More jobs and trade
```

Gameplay rule:

- population should be a result of useful services, not a free multiplier.

### 9.8 Population and economy

```text
Population
├── Consumes food
├── Requires maintenance
├── Creates NPC demand
└── Supports workforce future
```

Gameplay rule:

- population should create both demand and benefit.

## 10. Future compatible systems

### 10.1 Caravanes

Caravans move goods between settlements.

Needs:

- origin and destination;
- cargo escrow;
- route risk;
- guards;
- travel time;
- delivery reward;
- loss or insurance rules.

### 10.2 Commerce maritime

Maritime commerce extends caravans through ports.

Needs:

- port buildings;
- ships;
- sails, rope, resin, fittings;
- storms or piracy future;
- port tariffs.

### 10.3 Routes commerciales

Trade routes define repeated economic paths.

Needs:

- route discovery;
- maintenance;
- danger rating;
- tolls;
- regional price differences.

### 10.4 Commerce inter-villes

Cities should not share a single global economy by default.

Needs:

- local markets;
- regional visibility;
- transport cost;
- delivery delay;
- import/export taxes.

### 10.5 Guildes marchandes

Merchant guilds coordinate trade.

Needs:

- guild accounts;
- shared storage;
- contract permissions;
- trade reputation;
- warehouse access.

### 10.6 Banques

Banks support advanced finance.

Needs:

- economic accounts;
- deposits;
- withdrawal rules;
- transfer fees;
- loans future;
- default and collateral policy.

### 10.7 Prets

Loans should be late-game and carefully controlled.

Needs:

- borrower identity;
- collateral;
- repayment schedule;
- interest caps;
- default consequences;
- anti-abuse rules.

### 10.8 Assurances

Insurance supports caravan and maritime risk.

Needs:

- insured cargo;
- premium;
- covered risk;
- claim validation;
- fraud prevention.

### 10.9 Marches noirs

Black markets trade restricted goods.

Needs:

- hidden visibility;
- faction or reputation access;
- higher risk;
- no or alternative taxation;
- contraband flags.

### 10.10 Contrebande

Smuggling bypasses normal taxes or restrictions.

Needs:

- inspection risk;
- guard systems;
- route stealth;
- confiscation;
- black market links.

### 10.11 Evenements economiques

Events change demand or supply.

Examples:

- festival increases food and cloth demand;
- war increases weapon and armor demand;
- famine increases food prices;
- plague reduces workforce future;
- discovery opens a new mine.

### 10.12 Catastrophes

Catastrophes create emergency loops.

Examples:

- fire damages buildings;
- flood damages farms and warehouses;
- mine collapse reduces ore supply;
- storm closes port routes;
- siege disrupts markets.

Gameplay rule:

- catastrophes should create solvable economic goals, not pure punishment.

## 11. Diagrams

### 11.1 Full city growth loop

```text
Mine
└── Minerai
    └── Transport
        └── Forge
            └── Outils
                └── Meilleure recolte
                    └── Plus de ressources
                        └── Vente
                            └── Taxe
                                └── Tresor
                                    └── Nouveau batiment
```

### 11.2 Forest to construction

```text
Foret
└── Arbre
    └── Bucheron
        └── Bois
            └── Scierie
                └── Planches
                    └── Menuisier
                        └── Poutres / meubles / chariots
                            └── Construction ou vente
                                └── Taxe
                                    └── Tresor
```

### 11.3 Food and stamina loop

```text
Riviere / Ferme
├── Poisson
└── Cereales
    └── Cuisine
        └── Repas
            └── Bonus recolte ou combat
                └── Plus d'activite joueur
                    └── Plus de demande
                        └── Taverne rentable
```

### 11.4 Auction and treasury loop

```text
Artisan
└── Objet fabrique
    └── Hotel des ventes
        ├── Acheteur
        │   └── Objet
        └── Paiement
            ├── Revenu vendeur
            └── Taxe ville
                └── Tresor
                    └── Amelioration batiment
```

### 11.5 Public order loop

```text
Joueur demandeur
└── Commande publique
    ├── Or en escrow
    ├── Ingredients fournis
    └── Ingredients manquants
        └── Contributeurs
            └── Atelier
                └── Artisan
                    └── Objet termine
                        ├── Livraison demandeur
                        ├── Paiement artisan
                        └── Frais ville
```

### 11.6 Caravan future loop

```text
Ville miniere
└── Surplus de minerai
    └── Entrepot
        └── Caravane
            ├── Chariot
            ├── Gardes
            └── Rations
                └── Ville portuaire
                    └── Vente plus chere
                        ├── Profit marchand
                        └── Taxe import
```

### 11.7 Maritime future loop

```text
Port
└── Navire
    ├── Bois
    ├── Voiles
    ├── Cordes
    ├── Metal
    └── Resine
        └── Route maritime
            └── Ressources exotiques
                └── Marche local
                    └── Nouveaux crafts rares
```

### 11.8 Maintenance loop

```text
Batiment ameliore
└── Service puissant
    └── Entretien regulier
        ├── Or
        └── Materiaux
            └── Demande economique stable
                └── Metiers utiles dans la duree
```

## 12. Design constraints

### 12.1 Avoid infinite loops

A loop is dangerous if it creates more value than it consumes with no external
limit.

Danger examples:

- food buff increases gathering enough to create unlimited food profit;
- city upgrade reduces tax/maintenance so much that money only accumulates;
- NPC buy orders pay more than player production cost forever;
- salvage returns full ingredients from crafted items with no loss;
- repair is cheaper than intended and removes replacement demand.

Controls:

- diminishing returns;
- durability loss;
- transaction fees;
- time costs;
- resource respawn limits;
- NPC budgets;
- partial material loss on salvage;
- maintenance floors.

### 12.2 Avoid useless professions

A profession becomes useless if:

- its outputs are cosmetic only while others affect progression;
- it has no recurring demand;
- another profession produces the same output more efficiently;
- its resources are too common and too cheap;
- city systems do not consume its products.

Controls:

- give every profession at least one recurring sink;
- require cross-profession components;
- connect each profession to at least one building or future system;
- monitor market volume and price.

### 12.3 Avoid useless resources

A resource becomes useless if it appears in only one early recipe and never
again.

Controls:

- reuse low-tier resources in maintenance, repairs, and consumables;
- use refined resources as components across multiple recipes;
- give rare resources optional premium uses, not mandatory survival use;
- allow city projects to consume bulk common resources.

### 12.4 Avoid bottlenecks

Bottlenecks are useful when intentional and temporary. They are bad when they
block the whole economy.

Risks:

- only one profession can produce a universal component;
- one building gates too many unrelated recipes;
- one rare resource is mandatory for core gear;
- maintenance consumes a resource faster than players can gather it;
- all trade depends on one global auction house.

Controls:

- alternate recipes;
- multiple sources for core materials;
- city specialization without hard global dependency;
- market import paths;
- capped maintenance demand.

## 13. Final audit

### 13.1 Infinite loops

Risk:

- production buffs, city upgrades, and market profits can form runaway loops.

Mitigation:

- every positive multiplier should have a cost, cap, decay, or maintenance
  requirement.

### 13.2 Exploits

Risk:

- item duplication through escrow bugs;
- double sale through double click;
- tax bypass through direct contracts;
- market manipulation through unlimited alts;
- NPC buy order farming;
- public order griefing through partial contributions and withdrawals.

Mitigation:

- server-side escrow;
- idempotency;
- listing and order state locks;
- fee and tax rules;
- account and guild permissions;
- audit logs;
- bounded NPC budgets.

### 13.3 Inflation

Risk:

- too much gold from NPCs, quests, or events;
- not enough sinks;
- treasury hoards without destruction.

Mitigation:

- strong sinks through repairs, maintenance, fees, travel, and construction;
- finite NPC budgets;
- periodic economic review.

### 13.4 Useless professions

Risk:

- tanneur, tisseur, pecheur, or cuisinier can become optional if combat gear is
  the only valuable output.

Mitigation:

- connect them to travel, buildings, caravans, storage, buffs, maintenance,
  and city services.

### 13.5 Useless resources

Risk:

- bark, resin, oils, cloth, straps, salt, and low-tier ore may become vendor
  trash.

Mitigation:

- use them in upkeep, repairs, tools, food, alchemy, construction, and
  transport.

### 13.6 Missing dependencies

Risk:

- buildings may require materials that no profession produces yet.

Mitigation:

- every building recipe must map to at least one gathering and one processing
  path before implementation.

### 13.7 Bottlenecks

Risk:

- forge and auction house can become mandatory centers for too many loops.

Mitigation:

- local markets before auction house;
- multiple workshop types;
- alternate production routes;
- import systems future.

### 13.8 MMORPG risks

Risks:

- rich guilds monopolize resources and markets;
- dead cities enter irreversible decline;
- one city becomes the only rational hub;
- market bots dominate arbitrage;
- new players cannot afford basic tools;
- governance griefing destroys public progress.

Mitigation:

- anti-monopoly resource distribution;
- city catch-up mechanics;
- local advantages for multiple cities;
- rate limits and audit for market actions;
- starter tool protection;
- governance checks, permissions, and cooldowns.

## 14. Reference rules

The Settlement Gameplay System should follow these rules:

- every profession needs recurring demand;
- every building needs maintenance or opportunity cost;
- every resource needs at least one durable sink;
- every market action needs fees, taxes, or risk;
- every city benefit should create new demand;
- every future system should reuse existing loops before adding isolated
  currencies or materials;
- no client-side action should create items, gold, taxes, or production without
  server validation in the future implementation.

