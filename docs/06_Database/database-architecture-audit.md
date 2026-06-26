# Audit architecture PostgreSQL

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Scope: audit documentaire uniquement
- Runtime impact: aucun
- Code impact: aucun

## Résumé

Cet audit cartographie le schéma PostgreSQL observé depuis les entités TypeORM,
la configuration TypeORM, les documents existants et la migration présente.
Aucune migration, aucune entity et aucun fichier Runtime n'ont été modifiés.

Le schéma actuel couvre les fondations d'un prototype MMORPG : comptes,
personnages, inventaire, équipement, items, ressources, créatures, points de
respawn, skills, crafting et stations de crafting. Il est cohérent pour un
prototype local, mais il dépend encore fortement de `synchronize: true`, de
contraintes applicatives et de relations implicites par chaînes métier.

## A. Schéma actuel

### Configuration

- PostgreSQL est configuré dans `apps/api-gateway/src/app.module.ts` via
  `TypeOrmModule.forRootAsync`.
- Les entités sont auto-détectées par le pattern
  `__dirname + '/**/*.entity.{ts,js}'`.
- `synchronize: true` est actif.
- Une migration source existe : `1782345600000-RenameCreatureTable.ts`, qui
  renomme `animals` en `creatures`.
- Aucun datasource TypeORM dédié aux migrations n'a été observé.
- Aucun script npm de génération ou d'exécution de migration TypeORM n'a été
  observé.

### Tables observées

| Table | PK | Rôle | Volumétrie future |
|---|---|---|---|
| `user` | UUID | comptes, rôles, auth | faible à moyenne |
| `character` | UUID | personnages joueurs | moyenne |
| `character_equipment` | UUID | équipement par slot | moyenne |
| `inventory` | UUID | quantités d'items par personnage | élevée |
| `item` | UUID | catalogue d'items | moyenne |
| `resources` | UUID | instances de ressources monde | élevée |
| `resource_templates` | UUID | templates de ressources | faible |
| `creatures` | UUID | instances de créatures | élevée |
| `creature_template` | integer | templates de créatures | faible |
| `creature_spawn` | UUID | points de spawn créatures | moyenne à élevée |
| `respawn_point` | integer | points de respawn joueurs | faible à moyenne |
| `skill_definition` | UUID | catalogue de skills | faible |
| `player_skill` | UUID | progression par personnage/skill | élevée |
| `crafting_recipe` | UUID | recettes | faible à moyenne |
| `crafting_ingredient` | UUID | ingrédients de recettes | moyenne |
| `crafting_result` | UUID | résultats de recettes | moyenne |
| `crafting_station_template` | UUID | templates de stations | faible |
| `crafting_station` | UUID | stations placées en monde | moyenne |

### Relations et cardinalités

| Relation | Cardinalité | Contrainte observée | Commentaire |
|---|---:|---|---|
| `user` -> `character` | 1:N | FK TypeORM, `onDelete: CASCADE` | suppression compte destructive |
| `character` -> `character_equipment` | 1:N | FK, cascade côté relation | équipement supprimé avec personnage |
| `item` -> `character_equipment` | 1:N | FK, `onDelete: CASCADE` | suppression item supprime équipement, risqué pour catalogue |
| `character` -> `inventory` | 1:N | FK, `onDelete: CASCADE` | cohérent pour personnage |
| `item` -> `inventory` | 1:N | FK, `onDelete: CASCADE` | suppression item supprime inventaires, risqué pour économie |
| `creature_template` -> `creature_spawn` | 1:N | FK TypeORM, eager | pas de `onDelete` explicite |
| `creature_spawn` -> `creatures` | 1:N | FK TypeORM, eager, nullable | créature peut exister sans spawn |
| `skill_definition` -> `player_skill` | 1:N | FK, `onDelete: RESTRICT` | cohérent |
| `character` -> `player_skill` | 1:N | FK, `onDelete: CASCADE` | cohérent |
| `crafting_recipe` -> `crafting_ingredient` | 1:N | FK, `onDelete: CASCADE` | cohérent |
| `crafting_recipe` -> `crafting_result` | 1:N | FK, `onDelete: CASCADE` | cohérent |
| `item` -> `crafting_ingredient` | 1:N | FK, `onDelete: RESTRICT` | cohérent |
| `item` -> `crafting_result` | 1:N | FK, `onDelete: RESTRICT` | cohérent |
| `crafting_station_template` -> `crafting_station` | 1:N | FK, `onDelete: RESTRICT` | cohérent |

Relations implicites non protégées par FK :

- `resources.type` -> `resource_templates.type`.
- `resource_templates.skillKey` -> `skill_definition.key`.
- `crafting_recipe.requiredSkillKey` -> `skill_definition.key`.
- `crafting_recipe.stationType` -> `crafting_station_template.stationType`.
- `crafting_station_template.requiredSkillKey` -> `skill_definition.key`.

### Dépendances

Le graphe fonctionnel actuel est :

```text
user
  -> character
       -> inventory -> item
       -> character_equipment -> item
       -> player_skill -> skill_definition

item
  -> crafting_ingredient -> crafting_recipe
  -> crafting_result     -> crafting_recipe

crafting_station_template -> crafting_station

creature_template -> creature_spawn -> creatures

resource_templates --(type string)--> resources
respawn_point --(lookup runtime)--> character respawn
```

Cycles relationnels stricts : aucun cycle FK direct observé.

Cycles métier applicatifs :

- Crafting : `skill_definition` valide les recettes, les recettes produisent ou
  consomment des `item`, les items alimentent l'inventaire, et le craft modifie
  `player_skill`.
- Monde : `creature_spawn` alimente `creatures`, puis les créatures mortes
  reviennent à leur spawn.
- Ressources : `resource_templates` définit les ressources, mais le lien est une
  chaîne `type`, pas une FK.

## B. Points forts

- Les identifiants UUID sont utilisés sur les tables joueur, inventaire,
  crafting et entités monde dynamiques, ce qui facilite les IDs publics et les
  créations distribuées futures.
- Les relations critiques du crafting récent utilisent `RESTRICT` pour éviter de
  supprimer un item utilisé par une recette.
- Le craft runtime est transactionnel et verrouille pessimiste les lignes
  d'inventaire consommées.
- Les contraintes `UNIQUE` protègent plusieurs invariants importants :
  username, slot d'équipement par personnage, couple inventaire personnage/item,
  clés de templates, recettes et stations.
- Les coordonnées WU existent déjà sur les personnages, ressources, créatures,
  spawns et stations, ce qui prépare la convergence vers ADR-0001.
- Les `createdAt`/`updatedAt` existent sur comptes, personnages, inventaire,
  équipement, items, skills et crafting récent.

## C. Faiblesses

### Critique

- `synchronize: true` reste la stratégie active. Le schéma peut évoluer au
  démarrage sans migration reviewable.
- Les migrations ne sont pas opérationnalisées : une migration existe, mais elle
  n'est pas reliée à une configuration ou à des scripts observés.
- Les suppressions `onDelete: CASCADE` depuis `item` vers `inventory` et
  `character_equipment` sont dangereuses pour une économie MMORPG : supprimer un
  item catalogue peut effacer silencieusement de la richesse joueur.
- Les liens métier par chaînes (`resources.type`, `requiredSkillKey`,
  `stationType`) ne sont pas garantis par FK, ce qui permet des références
  orphelines si une mise à jour admin ou seed diverge.

### Importante

- Les colonnes legacy `positionX/positionY`, `resources.x/y`,
  `creatures.x/y`, `creature_spawn.spawnX/spawnY`, `respawn_point.x/y` restent en
  parallèle des coordonnées WU. Elles sont utiles comme cache temporaire, mais
  augmentent le risque de divergence.
- `mapId`, `worldX` et `worldY` sont encore nullable sur plusieurs entités
  positionnées. À grande échelle, toute requête spatiale devra gérer des lignes
  partielles.
- Les états (`alive`, `dead`, `fighting`, `escaping`) sont stockés en varchar
  libre sur resources/creatures, sans enum DB ou CHECK.
- Plusieurs compteurs et quantités n'ont pas de CHECK DB : health >= 0,
  quantity > 0, remainingLoots >= 0, success rates entre 0 et 1, maxLevel >= 1,
  respawnDelayMs > 0.
- Le mélange UUID et integer est acceptable, mais `creature_template` et
  `respawn_point` utilisent des PK integer alors que les autres catalogues
  récents utilisent UUID.

### Optimisation

- Les tables de templates anciennes n'ont pas toujours de timestamps.
- `resource_templates.lootPool` en jsonb est flexible, mais les itemIds internes
  ne sont pas protégés par FK.
- `Inventory` n'expose pas explicitement `characterId` et `itemId` comme colonnes
  typées dans l'entity, ce qui complique parfois les requêtes directes et les
  index composites nommés.

## D. Vérification table par table

| Table | PK | FK | UNIQUE | CHECK / enum DB | Nullabilité et defaults | Audit |
|---|---|---|---|---|---|---|
| `user` | UUID | none | `username` | `role` enum | `isActive=true`, role player | manque unicité case-insensitive |
| `character` | UUID | `userId` | none | none | stats defaults, WU nullable | nom non unique, WU nullable |
| `character_equipment` | UUID | character, item | characterId+slot | none | timestamps | item cascade risqué |
| `inventory` | UUID | character, item | character+item | none | quantity=1, equipped=false | quantity sans CHECK |
| `item` | UUID | none | none | slot enum | combat fields nullable | catalogue sans clé métier unique |
| `resources` | UUID | none | none | none | state alive, loots default | template string sans FK, WU nullable |
| `resource_templates` | UUID | none | type | none | jsonb nullable, defaults | lootPool sans intégrité item |
| `creatures` | UUID | spawn nullable | none | none | respawnAt nullable | spawn nullable, state libre |
| `creature_template` | integer | none | key | none | combat fields required | pas de CHECK valeurs positives |
| `creature_spawn` | UUID | template | key | none | WU nullable | mapId nullable, pas timestamps |
| `respawn_point` | integer | none | none | none | radius=20, WU nullable | radius legacy pixel |
| `skill_definition` | UUID | none | key | none | formula defaults | pas CHECK bornes |
| `player_skill` | UUID | character, skill | characterId+skillDefinitionId | none | level=1, xp=0 | pas CHECK xp/level |
| `crafting_recipe` | UUID | string skill/station | key | none | nombreux defaults | invariants taux en app seulement |
| `crafting_ingredient` | UUID | recipe, item | none | none | qty=1 | doublons possibles par recette/item |
| `crafting_result` | UUID | recipe, item | none | none | qty=1, chance=1 | chance sans CHECK |
| `crafting_station_template` | UUID | string skill | key, stationType | none | radius=1536 | skill string sans FK |
| `crafting_station` | UUID | template | none | none | mapId default, enabled=true | pas contrainte spatiale |

## E. Risques intégrité

### Critique

- Effacement économique involontaire par cascade depuis `item`.
- Drift entre colonnes legacy pixel et colonnes WU.
- Drift possible entre chaînes métier et catalogues (`skillKey`,
  `stationType`, `resource type`).

### Importante

- Création possible de doublons d'ingrédients ou de résultats identiques pour
  une même recette.
- Absence de verrouillage systématique hors craft : resource consume,
  combat/riposte, respawn et admin spawn peuvent subir des races si plusieurs
  workers ou événements concurrents touchent les mêmes lignes.
- Suppression de spawn admin et créatures associées dépend d'une convention de
  clé `admin-`, pas d'un modèle de propriété explicite.
- Les suppressions physiques dominent ; soft delete et historique ne sont pas
  présents.

## F. Risques MMORPG

- Inventaire, économie et crafting vont devenir des domaines à forte valeur
  joueur. Les contraintes actuelles protègent la forme de base, mais pas encore
  les audits, réservations, escrows, historiques et idempotence.
- Les tables monde (`resources`, `creatures`, `crafting_station`) ne disposent
  pas encore de modèle `map/chunk` relationnel. Les requêtes futures risquent de
  scanner par map ou par état.
- Le modèle ne contient pas encore guildes, banques, housing, villes,
  transactions économiques, hôtels des ventes, logs d'administration ou quêtes.
  Leur ajout est possible, mais devra éviter d'étendre les tables actuelles en
  grands blobs relationnels.

## G. Recommandations prioritaires

### Critique

1. Formaliser une stratégie migration : datasource, scripts, conventions de
   génération, exécution et rollback.
2. Réserver `synchronize: true` au local strict et définir explicitement le
   comportement hors développement.
3. Revoir les cascades depuis `item` vers inventaire/équipement avant toute
   économie persistante.
4. Remplacer progressivement les relations métier par chaînes par des FK ou des
   tables de correspondance lorsqu'elles deviennent du contenu durable.

### Importante

1. Finaliser P7 coordonnées : clarifier si les colonnes pixel sont caches
   techniques, colonnes supprimables ou données métier.
2. Rendre `mapId/worldX/worldY` obligatoires sur les entités positionnées après
   backfill.
3. Ajouter des contraintes DB pour les bornes numériques critiques lors de la
   future phase migration.
4. Ajouter des contraintes d'unicité sur les couples
   `crafting_ingredient(recipeId,itemId)` et
   `crafting_result(recipeId,itemId)` si les doublons ne sont pas un mécanisme
   voulu.

### Optimisation

1. Homogénéiser les timestamps sur les tables administrables.
2. Nommer explicitement les colonnes FK majeures dans les entities pour faciliter
   documentation, indexation et requêtes.
3. Introduire une clé métier unique sur `item` si `category+type` représente le
   catalogue canonique.

## H. Recommandations long terme

- Créer des domaines persistants séparés pour économie, transactions, auctions,
  guildes, housing, villes, banques, quêtes et logs.
- Prévoir des tables append-only pour les historiques sensibles plutôt que
  surcharger les tables d'état courant.
- Introduire une politique de soft delete ou d'archivage pour les données joueur
  à valeur économique.
- Séparer les tables de configuration monde des tables d'état runtime lorsque le
  serveur devient multi-instance.

## I. Aucune modification de code confirmée

Audit documentaire uniquement. Aucun fichier Runtime, aucune migration et aucune
entity TypeORM n'ont été modifiés pour produire ce document.
