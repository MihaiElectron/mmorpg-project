# Alertes d'audit actionnables

## 1. Résumé

Ce fichier consolide les audits database, TypeORM et sécurité en alertes
ouvertes, concrètes et corrigeables. Il ne remplace pas les audits sources et ne
déclare aucune correction comme validée.

Sources consolidées :

- `docs/06_Database/database-architecture-audit.md`
- `docs/06_Database/database-performance-audit.md`
- `docs/06_Database/database-evolution-roadmap.md`
- `docs/06_Database/typeorm-audit.md`
- `docs/06_Database/typeorm-roadmap.md`
- `docs/02_Security/backend-websocket-security-audit.md`
- `docs/02_Security/security-hardening-roadmap.md`

Status global : `OPEN` pour toutes les alertes.

Contrôle registre du 2026-06-26 : 23 alertes ouvertes, aucun doublon d'ID
détecté.

## 2. Convention de nommage stable

Format canonique :

`DOMAIN-SEVERITY-NNN`

Exemples :

- `DB-BLOCKER-001`
- `SEC-HIGH-004`
- `TYPEORM-MEDIUM-003`
- `RUNTIME-HIGH-002`

Domaines autorisés :

- `DB` : PostgreSQL, schéma, migrations, contraintes, index.
- `TYPEORM` : relations, repositories, cascades, transactions ORM.
- `SEC` : sécurité backend, WebSocket, auth, anti-triche, admin.
- `RUNTIME` : comportements runtime serveur, temps réel, combat, mouvement.
- `WF` : workflow, audit framework, CI, protocole de suivi.

Règles :

- L'ID est stable et ne change pas après création.
- Le numéro `NNN` est incrémental dans le couple `DOMAIN-SEVERITY`.
- Un ID fermé n'est jamais réutilisé.
- Une alerte déplacée de sévérité conserve son ID et note la raison dans
  `Notes`.
- Les anciennes formes à deux chiffres sont interdites dans le registre
  permanent.

## 3. Cycle de vie

Valeurs autorisées pour `Status` :

- `OPEN` : alerte confirmée, aucune correction validée.
- `IN_PROGRESS` : correction commencée ou PR en cours.
- `FIXED` : correction mergée, vérification complète pas encore terminée.
- `VERIFIED` : correction testée et impact non reproductible.
- `CLOSED` : alerte archivée après vérification et trace de fermeture.
- `WONT_FIX` : décision explicite de ne pas corriger, avec justification dans
  `Notes`.

## 4. Top 5 immédiat

1. `SEC-BLOCKER-001` - Verrouiller l'ownership inventaire HTTP.
2. `SEC-BLOCKER-002` - Rendre le mouvement serveur autoritatif.
3. `SEC-BLOCKER-003` - Authentifier explicitement les gateways WebSocket
   sensibles.
4. `DB-BLOCKER-001` - Stabiliser migrations et désactiver `synchronize` hors
   local strict.
5. `DB-BLOCKER-003` - Transactionnaliser loot, inventaire, combat et XP hors
   craft.

Ordre de correction recommandé :

1. Corriger les failles qui permettent duplication, corruption ou autorité
   client directe.
2. Fermer les trous d'authentification/autorisation WebSocket et admin.
3. Stabiliser le schéma avec migrations reviewables avant nouvelles contraintes.
4. Ajouter transactions, locks et idempotence sur les écritures gameplay.
5. Ajouter index, pagination et rooms/chunks avant croissance monde ou Studio.

## 5. Alertes BLOCKER

### SEC-BLOCKER-001 - Ownership inventaire HTTP insuffisant

- Source audit : `backend-websocket-security-audit.md`
- Constat court : `/inventory` accepte des `characterId` client sans ownership
  serveur vérifié.
- Impact concret : création, lecture ou modification d'inventaire tiers ;
  duplication d'items possible.
- Correction attendue : résoudre ou valider le personnage côté serveur depuis le
  JWT ; séparer les routes admin d'injection/debug inventaire.
- Fichiers probables : `apps/api-gateway/src/inventory/*`,
  `apps/api-gateway/src/characters/*`, DTOs inventory.
- Tests/builds attendus : tests HTTP ownership cross-user, ajout item refusé,
  lecture inventaire tiers refusée, equip/unequip sur personnage tiers refusé,
  `npm test` API.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### SEC-BLOCKER-002 - Mouvement joueur trop client-driven

- Source audit : `backend-websocket-security-audit.md`
- Constat court : `player_move` accepte des coordonnées WU client finies et les
  diffuse après métriques suspectes passives.
- Impact concret : teleport hack, speed hack, traversée de collisions et
  position falsifiée.
- Correction attendue : valider distance par tick, collision/map/chunk serveur,
  séquences anti-replay et correction/rejet autoritatif.
- Fichiers probables : `apps/api-gateway/src/world/*`,
  `apps/api-gateway/src/player-runtime/*`, client socket movement.
- Tests/builds attendus : tests WS mouvement trop rapide refusé, map mismatch
  refusé, NaN/Infinity refusés, collision serveur couverte, tests gateway.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### SEC-BLOCKER-003 - Authentification WebSocket sensible non garantie

- Source audit : `backend-websocket-security-audit.md`
- Constat court : `AdminGateway` et `CraftingGateway` ne montrent pas de
  `handleConnection` propre ; ils dépendent de `client.data`.
- Impact concret : event admin ou craft utilisable si la provenance de
  `client.data.userId/role` n'est pas garantie.
- Correction attendue : guard WebSocket ou authentification centralisée sur
  chaque gateway sensible ; revalidation rôle et comportement token expiré.
- Fichiers probables : `apps/api-gateway/src/**/**/*.gateway.ts`,
  `apps/api-gateway/src/common/ws-auth.service.ts`, modules gateway.
- Tests/builds attendus : socket sans JWT rejeté sur admin/craft, rôle falsifié
  rejeté, token expiré rejeté, user non admin rejeté.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### DB-BLOCKER-001 - `synchronize: true` et migrations non opérationnalisées

- Source audit : `database-architecture-audit.md`, `typeorm-audit.md`,
  `database-evolution-roadmap.md`
- Constat court : le schéma peut évoluer au démarrage sans migration reviewable ;
  pipeline migration absent ou non prouvé.
- Impact concret : drift de schéma, perte de données par changement implicite,
  rollback impossible en environnement durable.
- Correction attendue : datasource TypeORM dédié migrations, scripts
  generate/run/revert, règle `synchronize` local strict uniquement.
- Fichiers probables : `apps/api-gateway/src/app.module.ts`,
  `apps/api-gateway/src/migrations/*`, `package.json`, config TypeORM.
- Tests/builds attendus : build API, dry-run migration local, test rollback
  documenté, vérification config par environnement.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### DB-BLOCKER-002 - Cascades `Item` vers possessions joueur

- Source audit : `database-architecture-audit.md`, `typeorm-audit.md`
- Constat court : suppression d'un item catalogue peut cascader vers
  `inventory` et `character_equipment`.
- Impact concret : effacement silencieux de richesse joueur ou équipement.
- Correction attendue : remplacer les cascades destructives par `RESTRICT`,
  soft-delete catalogue ou workflow admin explicite.
- Fichiers probables : `apps/api-gateway/src/items/*`,
  `apps/api-gateway/src/inventory/*`, `apps/api-gateway/src/characters/*`,
  migrations futures.
- Tests/builds attendus : suppression item avec inventaire refusée ou contrôlée,
  test non-régression équipements, migration testée.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### DB-BLOCKER-003 - Écritures gameplay non transactionnelles hors craft

- Source audit : `database-performance-audit.md`, `typeorm-audit.md`,
  `typeorm-roadmap.md`, `backend-websocket-security-audit.md`
- Constat court : loot resource, add inventory, combat, XP, respawn et certains
  flows admin ne partagent pas encore de transaction/lock/idempotence.
- Impact concret : duplication loot, updates perdus, XP incohérente, état combat
  corrompu en concurrence.
- Correction attendue : command handlers transactionnels, locks ou upserts
  atomiques, idempotency key pour actions sensibles.
- Fichiers probables : `apps/api-gateway/src/resources/*`,
  `apps/api-gateway/src/inventory/*`, `apps/api-gateway/src/creatures/*`,
  `apps/api-gateway/src/skills/*`, `apps/api-gateway/src/admin/*`.
- Tests/builds attendus : tests concurrence loot double submit, XP concurrente,
  combat kill simultané, inventory increment atomique.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### SEC-BLOCKER-004 - Absence de rate limiting auth/gameplay/admin

- Source audit : `backend-websocket-security-audit.md`,
  `security-hardening-roadmap.md`
- Constat court : rate limiting non observé sur login/register, mouvement,
  récolte, attaque, craft et admin.
- Impact concret : brute force, socket spam, flood admin et déni de service
  logique.
- Correction attendue : limites par IP/user/socket/action, réponses cohérentes,
  métriques et tests de dépassement.
- Fichiers probables : `apps/api-gateway/src/auth/*`,
  `apps/api-gateway/src/**/*.gateway.ts`, middlewares/guards communs.
- Tests/builds attendus : tests auth brute force, flood WS refusé, admin flood
  limité, métriques exposées ou loggées.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

## 6. Alertes HIGH

### SEC-HIGH-001 - Payloads WebSocket/admin hétérogènes

- Source audit : `backend-websocket-security-audit.md`
- Constat court : validation manuelle par event ; DTO WS et UUID/bornes
  systématiques non prouvés.
- Impact concret : valeurs extrêmes, `Infinity`, champs inattendus ou payloads
  incomplets peuvent provoquer abus logique ou crash.
- Correction attendue : DTO/schema par event, whitelist, nombres finis, UUID,
  bornes coordonnées et erreurs uniformes.
- Fichiers probables : `apps/api-gateway/src/**/*.gateway.ts`,
  `apps/api-gateway/src/**/*.dto.ts`, guards/pipes WS.
- Tests/builds attendus : NaN/Infinity, UUID invalide, champ inconnu, payload
  vide, coordonnées hors bornes.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### SEC-HIGH-002 - Actions admin sans audit log durable

- Source audit : `backend-websocket-security-audit.md`,
  `database-evolution-roadmap.md`
- Constat court : spawn, teleport, delete, update template, debug modifier et
  resets ne sont pas tracés durablement.
- Impact concret : abus admin ou compte admin compromis sans forensic fiable.
- Correction attendue : `admin_audit_log` append-only avec actor, action, target,
  payload normalisé, résultat, timestamp, IP/socket.
- Fichiers probables : `apps/api-gateway/src/admin/*`,
  `apps/api-gateway/src/player-runtime/*`, migrations futures.
- Tests/builds attendus : chaque mutation admin crée un log, échec loggé,
  suppression/altération directe impossible sans privilège DB.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### SEC-HIGH-003 - Replay et idempotence absents sur actions sensibles

- Source audit : `backend-websocket-security-audit.md`,
  `security-hardening-roadmap.md`, `typeorm-roadmap.md`
- Constat court : nonce, séquence ou command id non observés pour loot, combat,
  craft, admin spawn/delete et future économie.
- Impact concret : retry ou double submit peut produire deux effets.
- Correction attendue : command id par action, fenêtre de replay par user/socket,
  résultat stable pour retry et stockage idempotent.
- Fichiers probables : gateways gameplay/admin, services resources/creatures,
  crafting, inventory, futures tables ledger.
- Tests/builds attendus : même command id rejoué sans double effet, retry après
  timeout stable, double socket concurrent refusé ou fusionné.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### DB-HIGH-001 - Index spatiaux et jobs temporels manquants

- Source audit : `database-performance-audit.md`,
  `database-evolution-roadmap.md`
- Constat court : ressources, créatures, stations et respawns n'ont pas encore
  les index `mapId/state/worldX/worldY` ou partiels `respawnAt`.
- Impact concret : scans complets sur monde, reload respawn coûteux, recherche
  station proche en mémoire.
- Correction attendue : migrations d'index composites et partiels alignées sur
  requêtes réelles.
- Fichiers probables : migrations futures, entities resources/creatures/stations.
- Tests/builds attendus : migration testée, `EXPLAIN ANALYZE` sur données de
  volume, tests de requêtes par zone.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### DB-HIGH-002 - Listes globales runtime/admin non paginées

- Source audit : `database-performance-audit.md`, `typeorm-audit.md`
- Constat court : resources, creatures, stations, items, recipes et users/admin
  utilisent encore des `find()` ou listings complets.
- Impact concret : payloads lourds, latence Studio, scans complets et mémoire
  excessive.
- Correction attendue : filtres serveur, pagination cursor ou `take/skip`,
  projections ciblées et limites maximales.
- Fichiers probables : `apps/api-gateway/src/admin/*`,
  `apps/api-gateway/src/resources/*`, `apps/api-gateway/src/creatures/*`,
  `apps/api-gateway/src/items/*`, `apps/api-gateway/src/users/*`.
- Tests/builds attendus : tests pagination, limite max, filtres map/chunk,
  compatibilité client Studio.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### DB-HIGH-003 - Relations métier par chaînes sans intégrité référentielle

- Source audit : `database-architecture-audit.md`, `typeorm-audit.md`
- Constat court : `resource.type`, `requiredSkillKey`, `stationType` et
  `lootPool` jsonb peuvent référencer du contenu absent.
- Impact concret : recettes/stations/loot cassés après seed ou mutation admin.
- Correction attendue : FK ou tables de mapping quand le contenu devient durable,
  validations admin strictes et repairs documentés.
- Fichiers probables : crafting, resources, skill definitions, templates,
  migrations futures.
- Tests/builds attendus : création/update admin avec clé absente refusée,
  seed idempotent, test lootPool item absent.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### SEC-HIGH-004 - Stockage token client et révocation non prouvés

- Source audit : `backend-websocket-security-audit.md`
- Constat court : JWT stocké en `localStorage`; refresh, révocation et
  invalidation rôle/mot de passe non vérifiés.
- Impact concret : vol XSS d'un token joueur/admin et session active jusqu'à
  expiration.
- Correction attendue : stratégie token/session, CSP, révocation, invalidation
  après changement critique et durée admin adaptée.
- Fichiers probables : `apps/client/src/*auth*`, `apps/api-gateway/src/auth/*`,
  config sécurité HTTP.
- Tests/builds attendus : token révoqué refusé HTTP/WS, rôle modifié pris en
  compte, headers sécurité vérifiés.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

## 7. Alertes MEDIUM

### DB-MEDIUM-001 - Contraintes CHECK/enum DB absentes

- Source audit : `database-architecture-audit.md`
- Constat court : quantités, health, XP, chances, delays, états et niveaux sont
  surtout validés côté application.
- Impact concret : données invalides si import, seed, admin ou bug contourne les
  services.
- Correction attendue : CHECK/enum DB lors d'une phase migration contrôlée.
- Fichiers probables : entities concernées, migrations futures.
- Tests/builds attendus : migration, insertion invalide refusée, seeds compatibles.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### DB-MEDIUM-002 - Coordonnées legacy pixel et WU en parallèle

- Source audit : `database-architecture-audit.md`
- Constat court : plusieurs tables gardent `x/y` ou `positionX/Y` avec
  `worldX/worldY` nullable.
- Impact concret : drift spatial, requêtes plus complexes, bugs de distance.
- Correction attendue : statut canonique documenté, backfill, `NOT NULL` futur
  ou suppression/cache technique explicite.
- Fichiers probables : world/resources/creatures/player-runtime, migrations
  futures.
- Tests/builds attendus : migration backfill, cohérence WU/pixel, requêtes ne
  dépendent plus d'un mix non documenté.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### DB-MEDIUM-003 - Doublons crafting ingredients/results possibles

- Source audit : `database-architecture-audit.md`
- Constat court : pas d'unicité prouvée sur `(recipeId,itemId)` pour ingrédients
  et résultats.
- Impact concret : coût ou résultat multiplié involontairement dans une recette.
- Correction attendue : contrainte unique ou règle explicite si doublon voulu.
- Fichiers probables : crafting entities, admin crafting service, migrations.
- Tests/builds attendus : ajout doublon refusé ou comportement cumulatif testé.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### DB-MEDIUM-004 - N+1 admin/seeds et relations chargées largement

- Source audit : `database-performance-audit.md`, `typeorm-audit.md`
- Constat court : validations item/skill/station en boucle et chargements
  `equipment.item` + `inventory.item` fréquents.
- Impact concret : latence admin/seed, risque de transposer ces patterns au
  runtime.
- Correction attendue : batch queries, projections, relations chargées à la
  demande.
- Fichiers probables : `apps/api-gateway/src/admin/*`,
  `apps/api-gateway/src/crafting/*`, `apps/api-gateway/src/characters/*`.
- Tests/builds attendus : tests de résultat identique, mesure requêtes ou mocks
  repository, pas de régression réponse API.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### SEC-MEDIUM-001 - Debug/runtime admin insuffisamment borné

- Source audit : `backend-websocket-security-audit.md`
- Constat court : endpoints debug admin ont des bodies ad hoc ; limites et
  désactivation production non prouvées.
- Impact concret : modifiers extrêmes, effacement de signaux anti-cheat ou abus
  LiveOps.
- Correction attendue : DTO strict, bornes, feature flag/env gate et audit.
- Fichiers probables : `apps/api-gateway/src/player-runtime/*`,
  `apps/api-gateway/src/admin/*`.
- Tests/builds attendus : valeurs extrêmes refusées, non-admin refusé,
  production gate testé.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### SEC-MEDIUM-002 - Broadcasts globaux et interest management absent

- Source audit : `backend-websocket-security-audit.md`,
  `security-hardening-roadmap.md`
- Constat court : plusieurs flows utilisent des broadcasts globaux ou listes
  globales.
- Impact concret : un événement local peut provoquer trop de trafic et faciliter
  un DoS logique.
- Correction attendue : rooms par map/chunk, throttling et payloads limités.
- Fichiers probables : gateways world/resources/creatures/admin, client socket.
- Tests/builds attendus : seul le chunk concerné reçoit l'event, flood local
  limité, compatibilité client.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

## 8. Alertes LOW

### DB-LOW-001 - Timestamps et clés métier catalogue hétérogènes

- Source audit : `database-architecture-audit.md`
- Constat court : certains templates anciens manquent de timestamps ou clé
  métier unique harmonisée.
- Impact concret : audit contenu et diff admin moins simples.
- Correction attendue : homogénéiser timestamps et clés métier dans migrations
  futures.
- Fichiers probables : templates resources/creatures/items/stations.
- Tests/builds attendus : migration compatible seeds, unicité validée.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### DB-LOW-002 - Observabilité performance DB incomplète

- Source audit : `database-performance-audit.md`, `typeorm-roadmap.md`
- Constat court : slow query log, métriques pool et temps transactionnels ne
  sont pas encore structurés.
- Impact concret : régressions détectées tardivement.
- Correction attendue : instrumentation requêtes lentes, pool DB, durées
  transactions et dashboards.
- Fichiers probables : config TypeORM, logging/observability backend.
- Tests/builds attendus : métriques émises en local/test, seuils documentés.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

### SEC-LOW-001 - Swagger et surfaces de découverte à borner par environnement

- Source audit : `backend-websocket-security-audit.md`
- Constat court : exposition de documentation API publique non bornée par
  environnement non vérifiée.
- Impact concret : reconnaissance API facilitée.
- Correction attendue : restriction par environnement, auth ou désactivation hors
  local selon politique.
- Fichiers probables : `apps/api-gateway/src/main.ts`, config env.
- Tests/builds attendus : Swagger disponible local, restreint selon env cible.
- Status : OPEN
- Owner :
- First detected : 2026-06-26
- Last reviewed : 2026-06-26
- Related commit :
- Related ADR :
- Related issue :
- Verification : Not verified
- Notes :

## 9. Alertes fermées

Aucune alerte fermée. Ce fichier initialise le registre.

## 10. Comment fermer une alerte

Une alerte ne peut pas passer directement de `OPEN` à `CLOSED`.

Cycle attendu :

1. Passer à `IN_PROGRESS` quand une correction est réellement commencée.
2. Passer à `FIXED` quand le commit de correction est mergé.
3. Passer à `VERIFIED` quand les tests attendus passent et que l'impact concret
   n'est plus reproductible.
4. Passer à `CLOSED` quand `Related commit`, `Verification`, `Last reviewed` et
   `Notes` contiennent les preuves de fermeture.

Champs requis pour fermer :

- `Status : CLOSED`
- `Owner :` personne ou équipe responsable.
- `Last reviewed :` date de vérification.
- `Related commit :` commit de correction.
- `Verification :` commandes, tests ou preuve manuelle.
- `Notes :` décision de fermeture et éventuelles limites restantes.

`WONT_FIX` exige une justification explicite dans `Notes`, un owner, une date de
revue et l'accord projet. Une alerte `WONT_FIX` reste visible dans la section de
sa sévérité ou dans `Alertes fermées` selon la décision projet.

## 11. Règles de mise à jour

- Ne fermer une alerte qu'après correction mergée, tests attendus passés et
  vérification manuelle des fichiers probables.
- Conserver l'ID stable ; ne jamais réutiliser un ID fermé pour un autre sujet.
- Ajouter une ligne dans `Alertes fermées` avec ID, date, commit et preuve de
  test lorsque la fermeture est validée.
- Si une alerte est divisée, garder l'alerte parente ouverte tant que tous les
  sous-risques bloquants ne sont pas traités.
- Si un audit découvre un nouveau risque, créer un nouvel ID dans la sévérité
  appropriée avec `Status : OPEN`.
- Ne pas transformer une recommandation long terme vague en alerte sans fichier
  probable, impact concret et test attendu.
