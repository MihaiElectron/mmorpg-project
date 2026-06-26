# Roadmap TypeORM

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Scope: audit documentaire uniquement
- Runtime impact: aucun
- Code impact: aucun

## Objectif

Cette roadmap transforme les constats de l'audit TypeORM en trajectoire
progressive. Elle ne prescrit aucune correction immédiate de code dans cette
mission ; elle prépare les futures phases database/runtime sans créer de
migration ni modifier d'entity.

## Principes TypeORM cibles

- Toute évolution de schéma passe par migration reviewable.
- Les repositories restent derrière les services de domaine.
- Les lectures runtime évitent les `find()` globaux.
- Les chargements de relations sont explicites, minimaux et adaptés au cas
  d'usage.
- Les écritures multi-entités utilisent transaction, lock ou opération atomique.
- Les suppressions de données joueur/économie sont auditées et rarement
  cascades.
- Les futures données économiques utilisent ledger/idempotence plutôt que
  simples mutations de quantités.

## Phase 1 - Gouvernance TypeORM

Priorité : Critique.

Objectifs :

- définir le datasource TypeORM migrations ;
- ajouter conventions migration generate/run/revert ;
- documenter environnements où `synchronize` est autorisé ;
- décider comment nommer contraintes, index et FK ;
- documenter les patterns `save` vs `insert/update/upsert`.

Livrables futurs :

- guide migrations TypeORM ;
- checklist de review entity/relation ;
- politique seeds vs migrations de données ;
- matrice des opérations nécessitant transaction.

## Phase 2 - Sécurisation relations et cascades

Priorité : Critique.

Objectifs :

- classifier toutes les cascades existantes : voulues, tolérées, dangereuses ;
- préparer le remplacement des cascades `Item` dangereuses par des restrictions
  ou règles applicatives ;
- définir une règle pour les relations nullable comme `Creature.spawn`;
- clarifier les relations par chaînes métier.

Décisions à préparer :

- `Item` catalogue supprimable ou désactivable ?
- `Creature.spawn` doit-il devenir non-null après nettoyage ?
- `Resource.type` doit-il rester chaîne contrôlée ou devenir FK ?
- `requiredSkillKey`/`stationType` doivent-ils devenir FK/table de liaison ?

## Phase 3 - Transactions runtime

Priorité : Critique.

Objectifs :

- auditer toutes les écritures multi-entités ;
- introduire un modèle commun de transaction dans les services gameplay ;
- choisir les locks nécessaires par flux ;
- éviter les updates perdus sur inventaire, XP et santé.

Flux prioritaires :

| Flux | Risque actuel | Stratégie cible |
|---|---|---|
| resource loot | double consommation | update atomique ou lock row |
| add inventory | lost update quantité | upsert/increment transactionnel |
| combat kill | health/state/XP séparés | transaction ou command handler |
| XP hors craft | concurrent save | lock/upsert par player_skill |
| admin spawn/delete | spawn + creature séparés | transaction |
| respawn | état character + position | transaction si pénalité future |

## Phase 4 - Lecture et pagination

Priorité : Important.

Objectifs :

- remplacer les listes globales par filtres/pagination ;
- créer des projections dédiées Admin/Studio ;
- éviter le chargement systématique d'inventaire complet ;
- préparer les requêtes par `mapId/chunk`.

Services concernés :

- `AdminService`;
- `ResourcesService`;
- `CreaturesService`;
- `CharacterService`;
- `ItemService`;
- `UserService`;
- `CraftingService`.

Patterns cibles :

- `take/skip` ou cursor pagination pour admin ;
- projections `select` pour listes ;
- endpoints détail séparés ;
- requêtes par zone pour resources/creatures/stations ;
- batch loading pour validations.

## Phase 5 - Index et contraintes via migrations

Priorité : Important.

Objectifs :

- introduire index de requêtes réelles ;
- ajouter CHECK sur quantités, XP, health, rates et délais ;
- préparer enums DB ou lookup tables pour états ;
- sécuriser unicités métier.

Index candidats :

- `resources(mapId, state, worldX, worldY)`;
- `creatures(mapId, state, worldX, worldY)`;
- `crafting_station(mapId, enabled, worldX, worldY)`;
- `inventory(characterId, itemId)`;
- `player_skill(characterId, updatedAt)`;
- `item(category, type)` si canonique ;
- `crafting_recipe(enabled, stationType, category)`.

Contraintes candidates :

- quantity > 0 ;
- health >= 0 ;
- remainingLoots >= 0 ;
- chance/rates entre 0 et 1 ;
- required quantities > 0 ;
- respawnDelayMs > 0 ;
- level/xp non négatifs.

## Phase 6 - Seeds et idempotence

Priorité : Important.

Objectifs :

- séparer seed local, seed contenu de référence et migration de données ;
- rendre les seeds idempotents en multi-instance ;
- remplacer les boucles `findOne` + `save` par upsert ou batch lorsque pertinent ;
- définir ownership des données créées par admin.

Risques à traiter :

- seeds de skills/items/crafting non transactionnels ;
- spawn admin identifié par convention de key ;
- startup repairs qui modifient la DB au boot ;
- conflits possibles entre plusieurs processus serveur.

## Phase 7 - Modèle économique futur

Priorité : Critique avant économie joueur.

Objectifs :

- ne pas faire porter l'économie uniquement par `Inventory.quantity`;
- créer des transactions économiques append-only ;
- gérer idempotence de commandes ;
- prévoir escrow auction/craft order ;
- utiliser types `bigint` ou `numeric` pour montants.

Patterns TypeORM cibles :

- transaction boundary par commande économique ;
- ledger immutable ;
- outbox pour effets asynchrones ;
- optimistic ou pessimistic locking selon flux ;
- aucun `remove()` physique sur lignes à valeur économique.

## Phase 8 - Observabilité et production

Priorité : Long terme.

Objectifs :

- activer logging contrôlé des slow queries ;
- mesurer temps de transaction ;
- suivre pool connections, deadlocks, retries ;
- ajouter tests de migrations ;
- valider plans `EXPLAIN` sur volumes réalistes.

Signaux à suivre :

- nombre de requêtes par endpoint ;
- temps moyen/p95 des requêtes TypeORM ;
- durée des transactions ;
- nombre de rows retournées ;
- erreurs `23505` et deadlocks ;
- temps de boot des seeds et reload runtime.

## Roadmap par domaine

| Domaine | Court terme | Moyen terme | Long terme |
|---|---|---|---|
| Identity | alléger relations user/characters | pagination admin users | audit role changes |
| Characters | projections profil/inventaire | transactions respawn complexes | historique personnage |
| Inventory | upsert/lock quantités | ledger item | banques/guild banks |
| Resources | update atomique loot | requêtes map/chunk | partition events gather |
| Creatures | contrôler eager/listings | transaction combat/XP | spawn/runtime séparés |
| Skills | lock XP hors craft | historique progression | analytics progression |
| Crafting | batch validations | craft orders transactionnels | outbox production |
| Admin/Studio | pagination/projections | audit log | recherches multi-filtres |
| Economy | modèle ledger | auction escrow | partitionnement/archivage |

## Checklist de review future

- La nouvelle entity a-t-elle une migration ?
- Les colonnes nullable ont-elles une raison et une sortie ?
- Les relations `onDelete` sont-elles explicites et sûres ?
- Une suppression peut-elle effacer une donnée joueur ou économique ?
- La lecture charge-t-elle uniquement les relations nécessaires ?
- La requête peut-elle retourner une table entière ?
- L'opération écrit-elle plusieurs tables ?
- Faut-il un lock, une transaction ou un upsert ?
- Les quantités et états critiques sont-ils protégés par contrainte DB ?
- Les indexes correspondent-ils à une requête réelle ?
- Les seeds sont-ils idempotents et sûrs en multi-instance ?

## Recommandations classées

### Critique

- Stabiliser migrations et `synchronize`.
- Revoir cascades `Item`.
- Transactionnaliser loot/inventory/combat/XP hors craft.
- Éviter les listes globales runtime avant croissance.
- Préparer ledger/idempotence avant économie.

### Important

- Créer projections et pagination Admin/Studio.
- Réduire les relations chargées par défaut.
- Encadrer eager loading des créatures.
- Ajouter conventions TypeORM écrites.
- Batch les validations N+1 de seed/admin.

### Optimisation

- Harmoniser timestamps et PK.
- Nommer contraintes/index dans migrations.
- Ajouter select ciblés et QueryBuilder pour cas lourds.
- Instrumenter slow queries et temps transactionnels.

### Long terme

- Outbox pour effets asynchrones.
- Partitionnement des logs/ledgers.
- Tests de migration et jeux de données volumineux.
- Séparation lecture admin analytique et tables transactionnelles.

## Aucune modification de code confirmée

Roadmap documentaire uniquement. Aucun fichier Runtime, aucune entity TypeORM et
aucune migration n'ont été modifiés pour produire ce document.
