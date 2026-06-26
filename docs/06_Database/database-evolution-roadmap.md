# Roadmap évolution database MMORPG

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Scope: audit documentaire uniquement
- Runtime impact: aucun
- Code impact: aucun

## Objectif

Cette roadmap prépare l'évolution PostgreSQL vers un MMORPG plus large sans
proposer de correction de code immédiate. Elle classe les chantiers par priorité
et par horizon afin d'éviter une refonte majeure lorsque inventaire, économie,
guildes, villes, housing et quêtes arriveront.

## Principes directeurs

- Séparer état courant, historique et ledger économique.
- Éviter les relations métier durables uniquement par chaînes lorsque les données
  deviennent critiques.
- Préférer les tables append-only pour argent, transactions, audit et actions
  sensibles.
- Interroger le monde par `mapId`, zone et chunk, jamais par listes globales.
- Garder les tables de configuration petites et reviewables.
- Planifier migrations, index et backfills avant volume réel.

## Phases proposées

### Phase 1 - Stabilisation schema

Priorité : Critique.

Objectifs :

- définir workflow migrations TypeORM/PostgreSQL ;
- désactiver `synchronize` hors local strict ;
- documenter conventions PK/FK/index ;
- clarifier le statut des colonnes legacy pixel ;
- préparer contraintes CHECK et index critiques.

Résultat attendu :

- chaque changement DB passe par migration reviewable ;
- les entités positionnées ont une trajectoire claire vers WU non-null ;
- les cascades dangereuses sont revues avant économie persistante.

### Phase 2 - Indexation monde et runtime

Priorité : Critique.

Objectifs :

- indexer `resources`, `creatures`, `crafting_station`, `character` par
  `mapId/worldX/worldY/state` ;
- introduire requêtes par zone/chunk ;
- paginer les endpoints admin ;
- préparer jobs temporels via index partiels sur `respawnAt`.

Résultat attendu :

- ressources, créatures et stations restent consultables avec des milliers ou
  dizaines de milliers d'instances par map.

### Phase 3 - Inventaire robuste

Priorité : Importante.

Objectifs :

- renforcer quantités, contraintes et ownership ;
- isoler les mouvements d'items dans une table transactionnelle ;
- préparer banques, coffres, guild banks et escrow.

Tables futures probables :

- `item_stack` ou extension contrôlée de `inventory` ;
- `item_transfer`;
- `inventory_transaction`;
- `bank_account`;
- `bank_slot`.

Croissance :

- inventaire courant : moyenne à élevée ;
- historique item : élevée à très élevée.

### Phase 4 - Économie et ledger

Priorité : Critique avant marché joueur.

Objectifs :

- créer un ledger append-only pour currency et items de valeur ;
- garantir idempotence des opérations ;
- séparer balance courante et historique ;
- auditer chaque opération économique.

Tables futures probables :

- `currency_account`;
- `currency_ledger`;
- `item_ledger`;
- `economic_transaction`;
- `escrow_account`.

Stratégie :

- index par actor/account, transaction id, période ;
- partitionnement temporel du ledger quand volumétrie réelle arrive ;
- archivage froid des écritures anciennes.

### Phase 5 - Auction house

Priorité : Importante.

Objectifs :

- annonces actives filtrables par settlement, item, prix, expiration ;
- escrow item/currency ;
- historique ventes ;
- taxes et frais.

Tables futures probables :

- `auction_listing`;
- `auction_bid` si enchères réelles ;
- `auction_sale`;
- `auction_fee`;
- `auction_escrow`.

Index :

- actifs par `settlementId/status/expiresAt`;
- recherche item par `itemId/category/type`;
- vendeur par `sellerCharacterId/status`;
- historique par période.

Archivage :

- ventes terminées partitionnées ou archivées après délai de support.

### Phase 6 - Villes, settlements et crafting orders

Priorité : Importante.

Objectifs :

- persister villes/services/workshops ;
- gérer treasury, taxes, upgrades ;
- représenter les craft orders différés.

Tables futures probables :

- `settlement`;
- `settlement_building`;
- `settlement_service`;
- `settlement_treasury`;
- `tax_rule`;
- `craft_order`;
- `craft_order_material`;
- `craft_order_result`.

Index :

- `settlementId/status`;
- `ownerCharacterId/status`;
- `workshopId/status/readyAt`;
- `readyAt` partiel pour jobs.

### Phase 7 - Guildes, housing, banques

Priorité : Long terme.

Objectifs :

- guildes et rôles ;
- propriété de maisons/parcelles ;
- stockage partagé ;
- droits d'accès auditables.

Tables futures probables :

- `guild`;
- `guild_member`;
- `guild_role`;
- `guild_permission`;
- `house`;
- `plot`;
- `storage_container`;
- `container_acl`.

Index :

- guild membership par `userId/characterId`;
- housing par `mapId/chunk/owner`;
- storage par container et owner.

### Phase 8 - Quêtes et historique gameplay

Priorité : Long terme.

Objectifs :

- suivi quête par personnage ;
- objectifs et états ;
- historique d'actions utile au support et analytics.

Tables futures probables :

- `quest_definition`;
- `quest_step`;
- `character_quest`;
- `character_quest_event`;
- `gameplay_event_log`.

Stratégie :

- état courant compact ;
- événements append-only partitionnables ;
- retention configurable.

## Évolutivité par fonctionnalité

| Fonctionnalité | Accueil sans refonte ? | Point d'attention |
|---|---|---|
| inventaire | oui, avec renfort transactions/index | éviter de confondre état courant et ledger |
| équipement | oui | cascade item dangereuse à revoir |
| skills | oui | XP concurrente et index player_skill |
| crafting | oui | doublons ingredient/result, station scan |
| hôtels des ventes | partiel | nécessite escrow, ledger, listing indexé |
| villes | partiel | nécessite settlement model dédié |
| guildes | oui si tables dédiées | permissions et banques séparées |
| housing | partiel | nécessite ownership spatial et ACL |
| quêtes | oui si tables dédiées | état courant vs events |
| banques | partiel | nécessite containers/ledger |
| caravanes | partiel | nécessite entités mobiles persistées et routes |
| économie | non en l'état production | ledger, idempotence, audit requis |

## Recommandations classées

### Critique

- Mettre en place migrations et désactiver `synchronize` hors local.
- Revoir les cascades destructives depuis `item`.
- Créer une stratégie d'indexation spatiale par map/chunk.
- Définir un ledger économique avant tout marché joueur.
- Introduire idempotence et transactions pour écritures économiques.

### Importante

- Finaliser le modèle WU DB et réduire les colonnes legacy.
- Ajouter pagination et filtres à tous les listings admin volumineux.
- Renforcer contraintes numériques et états DB.
- Transformer les relations métier critiques par chaîne en FK ou tables de
  liaison.
- Préparer logs d'audit admin et gameplay sensible.

### Optimisation

- Homogénéiser timestamps et noms de contraintes.
- Réduire N+1 dans validations admin.
- Ajouter projections de lecture pour Studio/Admin au lieu de charger des
  entities complètes.
- Définir métriques slow query et pool PostgreSQL.

### Long terme

- Partitionner les ledgers, logs et historiques par temps.
- Archiver auctions terminées, logs runtime et événements anciens.
- Séparer éventuellement stockage analytique des tables transactionnelles.
- Prévoir multi-region ou sharding uniquement après validation des besoins
  réels ; le premier axe naturel est `mapId`/zone.

## Stratégie de partitionnement future

| Table future | Partitionnement pertinent | Déclencheur |
|---|---|---|
| `currency_ledger` | mensuel ou trimestriel | millions de lignes |
| `item_ledger` | mensuel | économie active |
| `auction_sale` | mensuel | historique marché |
| `gameplay_event_log` | journalier/mensuel | analytics ou support |
| `admin_audit_log` | mensuel | LiveOps régulier |
| `runtime_event_log` | journalier | si événements persistés |

Les tables d'état courant (`character`, `inventory`, `resources`, `creatures`)
ne sont pas les premières candidates au partitionnement. Elles doivent d'abord
être requêtées par zone, indexées et paginées.

## Stratégie d'archivage future

- Garder en chaud : état courant, auctions actives, transactions récentes,
  logs support récents.
- Archiver en tiède : ventes terminées, logs admin, événements gameplay après
  fenêtre de support.
- Purger ou compacter : événements runtime haute fréquence si non nécessaires à
  la conformité ou au support.
- Ne jamais purger un ledger économique sans règle explicite de conservation.

## Audit final

### A. Schéma actuel

Le schéma actuel est un prototype riche, centré sur comptes, personnages, monde
de test, ressources, créatures, inventaire, skills et crafting.

### B. Points forts

UUID largement utilisés, contraintes uniques utiles, craft transactionnel,
relations crafting protectrices, WU déjà présent sur les entités positionnées.

### C. Faiblesses

Migrations non stabilisées, `synchronize: true`, relations métier par chaînes,
cascades item risquées, contraintes CHECK absentes, colonnes legacy coexistantes.

### D. Risques performances

Listings globaux, absence de pagination, peu d'index explicites, stations
scannées par map, requêtes monde non chunkées.

### E. Risques intégrité

Drift WU/pixels, références orphelines par chaînes, races sur ressources/combat
XP hors transactions, suppressions physiques sans historique.

### F. Risques MMORPG

Économie, auctions, banques, guildes, villes et housing nécessitent des tables
dédiées. Les ajouter directement aux tables actuelles créerait une dette lourde.

### G. Recommandations prioritaires

Migrations, index spatiaux, cascades item, WU non-null après backfill,
transactions/idempotence pour économie et inventaire.

### H. Recommandations long terme

Ledger append-only, partitionnement temporel, archivage, audit logs, tables
dédiées par domaine MMORPG, séparation état courant/historique.

### I. Aucune modification de code confirmée

Audit documentaire uniquement. Aucun fichier Runtime, aucune migration et aucune
entity TypeORM n'ont été modifiés pour produire ce document.
