# Audit TypeORM

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Scope: audit documentaire uniquement
- Runtime impact: aucun
- Code impact: aucun

## Résumé

Cet audit vérifie l'usage de TypeORM dans `apps/api-gateway/src` : entités,
relations, modules, services, transactions, migrations et types. Il complète les
audits PostgreSQL existants sans modifier le runtime, les entities ou les
migrations.

Le projet utilise TypeORM de façon pragmatique pour un prototype : repositories
injectés par module, quelques transactions ciblées, relations explicites et
seeds au démarrage. Les risques principaux avant montée en charge sont :
`synchronize: true`, absence de workflow migrations, relations eager sur
créatures, cascades destructives depuis `Item`, listes globales sans pagination,
`save/remove` sur données économiques et transactions manquantes sur ressources,
combat et XP hors craft.

## Configuration TypeORM

| Zone | Observation | Risque |
|---|---|---|
| Connexion | `TypeOrmModule.forRootAsync` dans `app.module.ts` | centralisé et lisible |
| Entités | pattern `__dirname + '/**/*.entity.{ts,js}'` | toute entity ajoutée peut changer le schéma |
| Synchronisation | `synchronize: true` | critique hors local |
| Migrations | une migration source, pas de datasource ni script observé | stratégie prod non prête |
| Modules | `TypeOrmModule.forFeature` par domaine | duplication acceptable, Admin très large |
| Lazy loading | non observé | pas de proxy surprise |
| Eager loading | observé sur `Creature.spawn`, `CreatureSpawn.template` | relations coûteuses sur listes |

## Cartographie des entités TypeORM

| Entité | Table | PK | Relations | Cascades / delete | Index observés | Colonnes sensibles |
|---|---|---|---|---|---|---|
| `User` | `user` | UUID | 1:N `characters` | none côté OneToMany | unique `username` | `password`, `role`, `isActive` |
| `Character` | `character` | UUID | N:1 `user`, 1:N equipment/inventory | `user` onDelete CASCADE, equipment cascade true | FK probables | health, stats, positions legacy/WU |
| `CharacterEquipment` | default | UUID | N:1 character, N:1 item | character CASCADE, item CASCADE | unique `characterId, slot` | slot, itemId |
| `Inventory` | default | UUID | N:1 character, N:1 item | character CASCADE, item CASCADE | unique character/item | quantity, equipped |
| `Item` | default | UUID | 1:N inventory/equipment | none direct | aucun métier | category, type, slot, combat stats |
| `Resource` | `resources` | UUID | aucune FK | none | aucun explicite | type, state, loots, respawnAt, WU |
| `ResourceTemplate` | `resource_templates` | UUID | aucune FK | none | unique `type` | lootPool jsonb, skillKey |
| `Creature` | `creatures` | UUID | N:1 spawn eager nullable | none explicite | aucun explicite | state, health, respawnAt, WU |
| `CreatureTemplate` | `creature_template` | integer | none | none | unique `key` | stats, behavior |
| `CreatureSpawn` | `creature_spawn` | UUID | N:1 template eager | none explicite | unique `key` | spawn legacy/WU, respawnDelayMs |
| `RespawnPoint` | `respawn_point` | integer | none | none | aucun explicite | x/y legacy, radius, WU |
| `SkillDefinition` | `skill_definition` | UUID | none | none | unique `key` | maxLevel, XP formula |
| `PlayerSkill` | `player_skill` | UUID | N:1 character, N:1 skill | character CASCADE, skill RESTRICT | unique character/skill | level, xp |
| `CraftingRecipe` | `crafting_recipe` | UUID | 1:N ingredients/results | cascade true on children | unique `key` | rates, stationType, skillKey |
| `CraftingIngredient` | `crafting_ingredient` | UUID | N:1 recipe, N:1 item | recipe CASCADE, item RESTRICT | FK/PK | quantity |
| `CraftingResult` | `crafting_result` | UUID | N:1 recipe, N:1 item | recipe CASCADE, item RESTRICT | FK/PK | quantity, chance |
| `CraftingStationTemplate` | `crafting_station_template` | UUID | 1:N stations | none direct | unique key/stationType | requiredSkillKey, radius |
| `CraftingStation` | `crafting_station` | UUID | N:1 template | template RESTRICT | FK/PK | mapId, WU, enabled |

## Audit des relations

### Eager / lazy

- Aucun lazy loading TypeORM observé. C'est sain pour éviter les requêtes
  implicites difficiles à profiler.
- `Creature.spawn` est eager.
- `CreatureSpawn.template` est eager.
- Plusieurs services chargent encore explicitement `relations: ['spawn',
  'spawn.template']`, ce qui redouble l'intention eager et rend les listings
  créatures coûteux par défaut.

### Cascades

Risques critiques :

- `Item -> Inventory` via `Inventory.item` en `onDelete: CASCADE`.
- `Item -> CharacterEquipment` via `CharacterEquipment.item` en
  `onDelete: CASCADE`.

Ces cascades sont dangereuses pour un MMORPG : supprimer un item catalogue peut
supprimer silencieusement des possessions ou équipements joueur.

Risques importants :

- `Character.equipment` a `cascade: true` côté OneToMany. C'est pratique pour
  persister un agrégat, mais le service manipule déjà explicitement
  `CharacterEquipment`. Une cascade large augmente le risque d'effet de bord si
  un jour un `Character` hydraté avec relations est sauvegardé.
- `CraftingRecipe.ingredients/results` utilisent `cascade: true` et les enfants
  ont `onDelete: CASCADE`, cohérent pour une recette administrable, mais à
  protéger par validation et audit lorsque les recettes deviennent du contenu de
  production.

Relations protectrices :

- `PlayerSkill.skillDefinition` en `RESTRICT`.
- `CraftingIngredient.item` et `CraftingResult.item` en `RESTRICT`.
- `CraftingStation.template` en `RESTRICT`.

### Relations nullable et orphan records

- `Creature.spawn` est nullable. Le service supprime au démarrage les créatures
  sans spawn, mais c'est une réparation runtime, pas une contrainte durable.
- Les liens `Resource.type`, `ResourceTemplate.skillKey`,
  `CraftingRecipe.requiredSkillKey`, `CraftingRecipe.stationType` et
  `CraftingStationTemplate.requiredSkillKey` sont des chaînes métier, pas des FK.
- `ResourceTemplate.lootPool` peut contenir des références item non vérifiées par
  TypeORM ou PostgreSQL.

### Relations bidirectionnelles coûteuses

- `Character` charge souvent `equipment.item` et `inventory.item` ensemble.
  Cela deviendra lourd si l'inventaire grossit.
- `Item` possède des OneToMany vers inventory/equipment, mais les services ont
  rarement besoin de charger un item avec tous ses usages.
- Admin charge resources, creatures, recipes et stations en listes complètes
  pour le Studio/WOM.

## Audit des services

### Requêtes larges

| Service | Pattern | Risque |
|---|---|---|
| `AdminService` | `find()` global resources, creatures, items, recipes, stations | payloads et scans complets |
| `ResourcesService` | `repo.find()` sur toutes les resources | monde non scalable |
| `CreaturesService` | `creatureRepository.find()` au boot | boot coûteux si beaucoup de créatures |
| `ItemService` | `repo.find()` complet | catalogue non paginé |
| `UserService` | `find({ relations: ['characters'] })` | admin/users non paginé |
| `WorldService` | `respawnPointRepository.find()` | acceptable petit volume, à revoir multi-map |

### Relations chargées potentiellement trop largement

- `CharacterService.findAllByUser/findFirstByUser/findOne` charge toujours
  equipment, equipment.item, inventory et inventory.item.
- `UserService.findOne/findByUsername/findAll` charge `characters`, y compris
  dans des chemins auth où ce n'est pas toujours nécessaire.
- `CraftingController` et `AdminService` chargent recipes avec children sans
  projection dédiée.
- `CreatureRuntimeService` charge les relations créature runtime, à surveiller
  si appelé à haute fréquence.

### N+1 possibles

- `AdminService.validateCraftingRecipe` relit chaque ingredient item et chaque
  result item séparément.
- `CraftingService.resolveItems` résout les items en boucle pendant le seed.
- `SkillsService.seedDefaultSkills` fait un `findOne` puis `save` par skill.
- `ItemService.seedLootItems` fait un `findOne` puis `save` par item.
- `CreaturesService.seedInstances` fait un `findOne` par spawn.
- `AdminService.getTemplates` charge templates et spawns puis fait une recherche
  en mémoire par template.

Ces N+1 sont surtout de seed/admin aujourd'hui. Ils deviendront problématiques si
les mêmes patterns sont repris dans le runtime ou le Studio avec gros volumes.

### QueryBuilder

Usage pertinent observé :

- équipement/unequip via jointures ;
- deletes/updates de boot créature ;
- insert `orIgnore` pour certains seeds.

Manques probables :

- requêtes par zone/chunk pour resources/creatures/stations ;
- projections admin au lieu d'entités complètes ;
- upserts/idempotence pour seeds et inventaire ;
- batch validation pour crafting recipes.

### Pagination

Pagination non observée dans les services audités. C'est le risque TypeORM le
plus visible côté performance : les méthodes admin et catalogues devront passer
à `take/skip`, curseurs ou filtres serveur avant que les tables grossissent.

### `save`, `remove`, `delete`, `update`

- `save()` est utilisé très largement. C'est simple, mais ambigu : insert ou
  update selon l'état de l'objet, avec risque d'écrire des relations hydratées.
- `remove()` est utilisé sur `Item` et inventory consommé en craft. Sur `Item`,
  combiné aux cascades inventory/equipment, c'est dangereux.
- `delete()` est utilisé explicitement pour equipment, inventory, resources,
  stations, ingredients/results et creatures. C'est acceptable, mais sans audit
  log ni soft delete.
- `update()` est utilisé pour état runtime. C'est léger, mais peut contourner les
  invariants métier si dispersé.

## Audit transactions

### Couvert aujourd'hui

- Equip item, unequip item et delete character utilisent `DataSource.transaction`.
- Runtime craft utilise `DataSource.transaction`, verrou pessimiste les lignes
  d'inventaire ingrédients, consomme/produit et applique l'XP dans la même
  transaction.
- `SkillsService` expose des helpers transactionnels pour le craft.

### Risques critiques

- `ResourcesService.consumeLoot()` lit puis met à jour sans transaction ni lock.
- Loot resource + ajout inventaire via `InventoryService.addItem()` n'est pas
  garanti comme transaction unique.
- Combat creature : modification health/state creature, riposte character,
  respawn et XP kill ne sont pas dans une transaction commune.
- `SkillsService.addXp()` hors craft peut subir des updates perdus si plusieurs
  sources d'XP touchent le même `PlayerSkill`.
- `InventoryService.addItem()` incrémente quantité par `findOne` puis `save`,
  sans lock ni upsert atomique.

### Risques importants

- Admin spawn creature crée `CreatureSpawn` puis `Creature` sans transaction.
- Admin delete creature supprime creature puis éventuellement spawn sans
  transaction.
- Seeds au démarrage sont partiels et souvent non transactionnels ; en
  multi-instance, ils peuvent se concurrencer.
- `WorldService.respawnCharacter()` lit personnage, lit tous les respawn points,
  puis update character sans transaction. C'est acceptable prototype, mais pas
  pour règles complexes de mort, pénalité ou inventaire.

### Futures zones à transaction stricte

- économie/currency ;
- auction house et escrow ;
- craft orders différés ;
- banques et guild banks ;
- transferts inventory entre acteurs ;
- loot creature ;
- taxes de villes et treasury.

## Audit migrations

### État observé

- Une migration source : `RenameCreatureTable1782345600000`.
- Le nom est cohérent avec une migration horodatée TypeORM.
- La migration est destructive au sens opérationnel : elle suppose que
  `animals` existe en `up` et `creatures` existe en `down`.
- Aucun `data-source.ts`, `ormconfig` ou script migration n'a été trouvé.
- `synchronize: true` reste actif dans la config runtime.

### Risques

Critique :

- les entities peuvent créer/modifier le schéma sans migration reviewable ;
- la base locale peut diverger du schéma attendu ;
- la migration existante peut ne jamais être exécutée en production faute de
  pipeline ;
- aucun rollback/test de migration n'est documenté.

Important :

- les colonnes nullable ajoutées pendant la migration WU peuvent rester
  indéfiniment sans backfill obligatoire ;
- les futurs index/contraintes doivent être ajoutés avec une stratégie de lock
  et de données existantes ;
- les seeds runtime remplacent partiellement des migrations de données.

## Audit des types

### UUID

Usage majoritaire et pertinent pour joueurs, inventaire, items, resources,
creatures, skills et crafting. Le mélange avec integer sur
`creature_template`/`respawn_point` n'est pas bloquant, mais complique une
convention DB unique.

### int vs bigint

`int` est utilisé partout pour coordonnées WU, health, XP, quantités, délais et
stats. C'est suffisant pour l'état prototype, mais à revoir pour :

- ledgers économiques ;
- montants de monnaie ;
- compteurs globaux ;
- historiques et séquences volumineuses ;
- XP cumulée long terme si elle devient totale plutôt que "vers prochain level".

### numeric/decimal

Aucun `numeric`/`decimal` observé. Pour la monnaie future, éviter `float` et
préférer soit `bigint` en plus petite unité, soit `numeric(precision, scale)`
selon le modèle économique.

### float

Utilisé pour `baseSuccessRate`, `successBonusPerLevel`, `minSuccessRate`,
`maxSuccessRate`, `chance`, `xpCurveExponent`. Acceptable pour probabilités et
formules, à éviter pour monnaie.

### jsonb

`ResourceTemplate.lootPool` utilise `jsonb`. Flexible, mais les références item,
probabilités et quantités ne sont pas contraintes par TypeORM. Si loot devient
central, prévoir tables relationnelles ou validation forte.

### enum

`User.role` et `Item.slot` utilisent enum TypeORM. Les états creature/resource
sont des strings typées TypeScript, mais pas enum DB.

### dates/timestamps

- `CreateDateColumn`/`UpdateDateColumn` présents sur entités récentes.
- `respawnAt` en `timestamptz` sur resources/creatures.
- Tables anciennes comme creature templates/spawns/respawn points manquent de
  timestamps.

### nullable/default

- WU nullable sur plusieurs entités positionnées, dette temporaire P7.
- Beaucoup de defaults applicatifs sont utiles, mais manquent de CHECK DB.
- `default: null` est explicite sur plusieurs colonnes, cohérent mais ne
  remplace pas une politique d'état obligatoire.

## Recommandations

### Critique

1. Définir une configuration migrations TypeORM officielle et réserver
   `synchronize: true` au local strict.
2. Revoir les cascades depuis `Item` vers inventory/equipment avant économie
   persistante.
3. Introduire des transactions ou updates atomiques pour resource loot,
   inventory add, combat/XP kill et XP hors craft.
4. Remplacer les listings globaux runtime/admin par des requêtes filtrées et
   paginées avant croissance des tables.

### Important

1. Réduire les chargements de relations par défaut dans `CharacterService` et
   `UserService` via projections ou méthodes spécialisées.
2. Encadrer les relations eager créature pour éviter les coûts cachés sur gros
   listings.
3. Convertir les relations métier critiques par chaînes en FK ou tables de
   liaison lorsque ces domaines deviennent durables.
4. Ajouter des conventions TypeORM : quand utiliser `save`, `insert`, `update`,
   `upsert`, `remove`, transactions et locks.
5. Préparer des index et contraintes via migrations, pas via synchronisation.

### Optimisation

1. Grouper les validations seed/admin pour réduire les N+1.
2. Ajouter des DTO/projections de lecture pour Admin/Studio.
3. Nommer explicitement les contraintes et index dans les migrations futures.
4. Harmoniser timestamps et PK conventions sur les anciennes tables.

### Long terme

1. Mettre en place un outbox/ledger pour économie, auctions, craft orders et
   actions sensibles.
2. Prévoir partitionnement et archivage sur tables append-only.
3. Séparer les modèles TypeORM d'état courant des modèles analytiques ou logs
   haute fréquence.
4. Ajouter observabilité TypeORM/PostgreSQL : slow queries, pool, retries,
   deadlocks, temps de transaction.

## Aucune modification de code confirmée

Audit documentaire uniquement. Aucun fichier Runtime, aucune entity TypeORM et
aucune migration n'ont été modifiés pour produire ce document.
