# Audit performance PostgreSQL

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Scope: audit documentaire uniquement
- Runtime impact: aucun
- Code impact: aucun

## Résumé

Le schéma actuel est adapté à un prototype, mais il ne possède presque aucun
index de performance explicite hors contraintes `UNIQUE` et PK/FK générées. Les
risques principaux ne sont pas encore visibles avec peu de données : ils
apparaîtront dès que les tables monde, inventaire, skills, crafting et économie
grossiront.

Les requêtes actuelles privilégient souvent `find()` global, relations chargées
en bloc, tri applicatif simple et absence de pagination. C'est acceptable pour
un outil admin local et un monde de test, mais insuffisant pour un MMORPG.

## Index présents

Index garantis ou probables via PK/UNIQUE/FK :

| Table | Index/contrainte | Utilité |
|---|---|---|
| toutes tables | PK | lookup par id |
| `user` | unique `username` | login/register |
| `character_equipment` | unique `characterId, slot` | équipement par slot |
| `inventory` | unique relation character/item | inventaire par personnage/item |
| `creature_template` | unique `key` | seed/admin |
| `creature_spawn` | unique `key` | seed/admin |
| `resource_templates` | unique `type` | résolution template |
| `skill_definition` | unique `key` | skill lookup |
| `player_skill` | unique `characterId, skillDefinitionId` | progression skill |
| `crafting_recipe` | unique `key` | seed/admin |
| `crafting_station_template` | unique `key`, unique `stationType` | craft station lookup |

Pas d'`@Index` explicite observé dans les entities.

## Requêtes fréquentes observées

| Domaine | Pattern | Risque |
|---|---|---|
| Auth | `user.username` | correct via unique |
| Character | `character.userId`, relations équipement/inventaire | index FK probable, risque relations lourdes |
| Inventory | character + item, character list | unique utile, pagination absente |
| Craft runtime | recipe par id + relations, inventory par itemIds, stations par mapId | station scan par map |
| Resources | `find()` global, pending `state='dead' AND respawnAt IS NOT NULL` | scans complets |
| Creatures | `find()` global au boot, state counts, spawn lookup | scans complets |
| Admin WOM | listes globales resources/creatures/items/recipes/stations | scans complets et payloads volumineux |
| Skills | player skills par character, order updatedAt | index composite absent |
| Crafting validation | boucle item par ingredient/result | N+1 potentiel |

## Risques de scans complets

### Critique à moyen terme

- `resources.find()` et `findAllWithTextureKey()` chargent toutes les ressources.
- `creatureRepository.find()` charge toutes les créatures au démarrage.
- Admin WOM liste toutes les ressources, créatures, stations, items et recettes.
- `findNearestCompatibleStationOrThrow` charge toutes les stations enabled d'une
  map puis calcule la distance en mémoire.

### Importante

- `reloadPendingRespawns()` filtre par `state` et `respawnAt` sans index dédié.
- `creatureRepo.count({ state: Not('dead') })` peut scanner toute la table.
- `player_skill` liste par `characterId` avec ordre `updatedAt DESC`.
- Les recherches items par `category/type` dans seeds et crafting n'ont pas de
  contrainte/index métier observé.

## Index manquants probables

Ces recommandations restent documentaires ; elles ne créent aucune migration.

### Critique avant montée en charge

| Table | Index cible | Usage |
|---|---|---|
| `resources` | `(mapId, state, worldX, worldY)` | requêtes monde par carte/état/zone |
| `resources` | `(state, respawn_at)` partiel sur `state='dead'` | reload respawn |
| `creatures` | `(mapId, state, worldX, worldY)` | broadcast/interest management futur |
| `creatures` | `(state, respawnAt)` partiel sur morts | respawn créatures |
| `crafting_station` | `(mapId, enabled, worldX, worldY)` | station proche |
| `inventory` | `(characterId)` | chargement inventaire complet |
| `player_skill` | `(characterId, updatedAt DESC)` | onglet skills |

### Importante

| Table | Index cible | Usage |
|---|---|---|
| `character` | `(userId, createdAt)` | `findMe` premier personnage |
| `character` | `(mapId, worldX, worldY)` | joueurs par zone future |
| `item` | `(category, type)` unique si canonique | seeds, loot, crafting |
| `crafting_recipe` | `(enabled, stationType, category, name)` | liste recettes craft |
| `crafting_ingredient` | `(recipeId, itemId)` | validation et jointures |
| `crafting_result` | `(recipeId, itemId)` | validation et jointures |
| `creature_spawn` | `(mapId, worldX, worldY)` | spawns par zone |
| `respawn_point` | `(mapId, worldX, worldY)` | nearest respawn |

### Optimisation

| Table | Index cible | Usage |
|---|---|---|
| `resource_templates` | `(skill_key)` | listing par métier |
| `skill_definition` | `(category, enabled)` | UI/admin |
| `crafting_station_template` | `(enabled, category)` | UI/admin |

## Index probablement inutiles maintenant

- Index séparé sur colonnes UUID PK déjà couvertes.
- Index isolé sur `enabled` pour petites tables de templates.
- Index isolé sur `state` sans `mapId` ou date : utile seulement pour counts
  globaux, moins utile pour le runtime spatial.
- Index sur colonnes legacy pixel si P7 prévoit leur suppression ou leur statut
  de cache non requêté.

## ORDER BY, JOIN et pagination

### ORDER BY

Les tris observés portent surtout sur `name`, `key`, `type`, `category`,
`state`, `mapId/worldX/worldY`, `updatedAt`.

Risque :

- les tris admin sur grandes tables sans pagination deviendront coûteux ;
- `ORDER BY category, name` sur items a besoin d'une clé métier/index si le
  catalogue grossit ;
- `ORDER BY updatedAt DESC` sur `player_skill` est acceptable seulement avec un
  filtre `characterId` indexé.

### JOIN / relations

Relations coûteuses observées :

- character avec equipment, equipment.item, inventory, inventory.item ;
- recipe avec ingredients/results, puis validation item par item ;
- creatures avec spawn et spawn.template ;
- stations avec template.

Le chargement eager sur `Creature.spawn` et `CreatureSpawn.template` simplifie le
runtime, mais peut devenir coûteux pour des listings massifs.

### Pagination

Pagination non observée pour :

- items ;
- resources ;
- creatures ;
- creature spawns ;
- crafting recipes ;
- crafting stations ;
- player/admin lists.

Pour un MMORPG, les endpoints admin et runtime devront éviter les listes
globales et passer à des requêtes par zone, page, filtre et curseur.

## N+1 potentiels

- Validation recette admin : chaque ingrédient et résultat relit `item`.
- Seeding crafting : résolution d'items par `category/type` en boucle.
- Admin template validation : plusieurs `findOne` séquentiels.
- Les relations character complètes peuvent gonfler si un personnage possède
  beaucoup d'items.

## Transactions et concurrence

### Points forts

- Le craft joueur (CraftJob : `launch` / `complete` / `claim`) est transactionnel.
- Le lancement verrouille pessimiste les lignes `Inventory` réservées (escrow).
- Les flows d'équipement/unequip/delete character utilisent des transactions.

### Risques

- `ResourcesService.consumeLoot()` fait lecture puis update sans verrou. Deux
  récoltes concurrentes peuvent consommer la même charge logique selon timing.
- Combat creature/character met à jour santé et état hors transaction globale.
- Production craft verrouille les ingrédients, mais la ligne d'inventaire de
  résultat existante est relue sans lock explicite avant incrément.
- `SkillsService.addXp()` hors transaction peut subir des updates perdus si deux
  sources d'XP touchent le même skill simultanément.
- Seeds et startup repairs ne sont pas orchestrés pour un démarrage multi-worker.

## Tables volumineuses futures

| Domaine | Croissance estimée | Requête dominante | Stratégie |
|---|---:|---|---|
| inventaires | 10-200 lignes/personnage, millions à terme | par character, par item | index character/item, transactions, historique séparé |
| transactions économie | très élevée, append-only | par actor, item, période | partition temporelle, idempotence, ledger |
| enchères | élevée | settlement, item, expiration, seller | index actifs partiels, archive ventes terminées |
| logs/admin/audit | très élevée | actor, action, période | partition mensuelle, retention |
| événements runtime | extrême si persistés | période, map/chunk | stockage append-only séparé, sampling |
| historique combat/gather | élevé | character, période | archive/TTL |
| crafting orders | élevée | owner, station/workshop, status | index status+owner, outbox |
| guildes/banques | moyenne à élevée | guildId, memberId, item | index ownership, ledger bancaire |

## Risques performances MMORPG

### Critique

- Les requêtes globales monde ne passeront pas à l'échelle. Il faut une
  stratégie `mapId/chunk` avant d'avoir beaucoup de ressources ou créatures.
- Les tables d'économie ne doivent pas être ajoutées comme simples champs dans
  `inventory`; il faut un modèle transactionnel append-only.
- Les timers persistés (`respawnAt`) nécessitent des index partiels et une
  stratégie multi-instance avant exploitation réelle.

### Importante

- Le choix jsonb pour loot pools est acceptable pour contenu court, mais
  insuffisant si les loot pools deviennent requêtables, équilibrés ou audités.
- Les routes admin doivent devenir paginées avant d'être utilisées comme Studio
  sur un monde réel.
- Les suppressions physiques et cascades peuvent créer des verrous lourds si les
  tables dépendantes grossissent.

## Recommandations prioritaires

### Critique

1. Concevoir les index spatiaux `mapId/worldX/worldY/state` avant la première
   grosse génération de monde.
2. Remplacer les listes globales runtime par des requêtes par map/chunk/zone.
3. Ajouter une stratégie transactionnelle pour ressources, combat, XP et
   inventaire hors craft.
4. Prévoir une migration contrôlée pour tous les index, sans utiliser
   `synchronize` comme mécanisme de production.

### Importante

1. Ajouter pagination et filtres serveur sur les endpoints admin volumineux.
2. Éviter les eager relations sur gros listings ; charger les détails à la
   demande ou via projections ciblées.
3. Préparer des index partiels sur états actifs/morts et jobs temporels.
4. Identifier les requêtes critiques avec `EXPLAIN ANALYZE` quand des données de
   test réalistes existent.

### Optimisation

1. Grouper les validations item/skill/station pour réduire les N+1 admin.
2. Ajouter observabilité : slow query log, métriques pool, temps moyen par route.
3. Définir une limite maximale par requête admin même en développement.

## Aucune modification de code confirmée

Audit documentaire uniquement. Aucun fichier Runtime, aucune migration et aucune
entity TypeORM n'ont été modifiés pour produire ce document.
