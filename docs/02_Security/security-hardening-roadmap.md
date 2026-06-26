# Roadmap de durcissement sécurité

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Scope: audit documentaire uniquement
- Runtime impact: aucun
- Code impact: aucun

## Objectif

Cette roadmap organise le durcissement sécurité backend et WebSocket pour un
MMORPG à serveur autoritatif. Elle ne crée aucun correctif dans cette mission.
Elle classe les priorités pour réduire les risques de triche, replay, spam,
duplication d'items, abus admin et déni de service logique.

## Principes de sécurité cibles

- Le client envoie des intentions, jamais des vérités.
- Le serveur résout `userId`, `characterId`, position, inventaire, coûts,
  dégâts, loot et permissions.
- Toute action sensible est authentifiée, autorisée, validée, limitée et
  traçable.
- Toute opération multi-entités à valeur gameplay/économie est transactionnelle
  ou idempotente.
- Les surfaces admin sont des clients non fiables avec permissions fortes.
- Les données de debug ne sont pas des mécaniques production.

## Immédiat

Priorité : avant nouvelle expansion gameplay.

### 1. Fermer les failles ownership inventaire

Statut actuel : `Missing`.

Objectifs :

- ne plus accepter un `characterId` client comme preuve d'autorité ;
- résoudre le character depuis JWT pour les routes joueur ;
- vérifier ownership pour toute route qui garde un `characterId` paramétré ;
- empêcher l'ajout arbitraire d'items par route joueur ;
- séparer routes admin d'ajout/debug inventaire si nécessaire.

Risque traité : duplication item, lecture/modification d'inventaire tiers.

### 2. Durcir le mouvement serveur

Statut actuel : `Not verified` / `Future`.

Objectifs :

- transformer les métriques suspectes en règles de rejet ou correction ;
- ajouter validation vitesse/distance par tick ;
- valider map/chunk et collision serveur ;
- introduire séquence ou timestamp serveur pour limiter replay ;
- préparer reconciliation client.

Risque traité : teleport hack, speed hack, traversée de collision client
modifiée.

### 3. Authentification WebSocket centralisée

Statut actuel : `Not verified` pour Admin/Crafting gateway.

Objectifs :

- garantir que chaque gateway sensible vérifie le JWT ou utilise un guard WS
  partagé ;
- garantir la provenance de `client.data.userId` et `client.data.role` ;
- définir comportement token expiré après connexion ;
- fermer toute dépendance implicite à l'ordre des gateways.

Risque traité : events admin/craft sur socket insuffisamment authentifié.

### 4. Rate limiting initial

Statut actuel : `Missing`.

Objectifs :

- login/register HTTP ;
- `player_move` ;
- `interact_resource` ;
- `attack_creature` ;
- `craft:start` ;
- `admin:*`.

Risque traité : brute force, socket spam, flood admin, DoS logique.

### 5. DTOs WebSocket

Statut actuel : `Not verified`.

Objectifs :

- définir DTO ou schemas pour chaque event entrant ;
- appliquer UUID, nombre fini, bornes, enums et whitelists ;
- uniformiser les erreurs ;
- tester NaN/Infinity, strings numériques, champs inconnus et payloads vides.

Risque traité : payloads extrêmes, valeurs inattendues, bypass validation.

## Avant gameplay économie

Priorité : avant monnaie, auction house, banques ou marché joueur.

### 1. Idempotence et anti-replay

Objectifs :

- command id ou nonce par action sensible ;
- fenêtre de replay par user/socket/action ;
- résultat stable pour retry ;
- protection contre double submit sur craft, loot, inventory transfer, auction.

Risque traité : duplication item, double craft, double achat/vente, retry après
timeout.

### 2. Transactions gameplay critiques

Objectifs :

- resource decrement + inventory add + XP ;
- combat kill + XP + loot futur ;
- inventory transfer ;
- craft orders ;
- auction escrow ;
- bank deposits/withdrawals.

Risque traité : états incohérents et duplication en concurrence.

### 3. Ledger et audit économie

Objectifs :

- ledger append-only pour monnaie/items de valeur ;
- actor, source, target, reason, correlation id ;
- aucun delete physique sur valeurs économiques ;
- reconciliation périodique balances vs ledger.

Risque traité : perte de traçabilité, duplication invisible, support impossible.

### 4. Permissions admin fines

Objectifs :

- distinguer liveops, world builder, economy admin, moderator ;
- limiter actions destructives ;
- protéger reset metrics, debug modifiers, spawn/delete ;
- séparer lecture Studio et mutation monde.

Risque traité : abus admin ou compte admin compromis.

## Avant production

### 1. Audit log durable

Statut actuel : `Missing`.

Objectifs :

- log admin HTTP et WS ;
- log auth failures et role changes ;
- log debug modifiers ;
- log économie ;
- log actor, IP/socket, payload normalisé, result, timestamp ;
- stockage append-only ou à altération détectable.

### 2. Gestion de session/token

Objectifs :

- refresh/revocation ;
- invalidation après changement rôle/mot de passe/désactivation ;
- stratégie stockage token côté client ;
- CSP et réduction XSS ;
- durée de token adaptée aux rôles admin.

### 3. CORS et exposition

Objectifs :

- vérifier `CLIENT_ORIGIN` par environnement ;
- limiter Swagger `/api/docs` hors local ;
- vérifier HTTPS, secure headers et proxy trust ;
- séparer domaines admin si nécessaire.

### 4. Rooms et interest management

Objectifs :

- remplacer `server.emit` global par rooms map/chunk ;
- limiter payloads broadcast ;
- éviter qu'un spam local force des updates globales ;
- métriques d'events par socket/room.

### 5. Tests sécurité

Objectifs :

- tests ownership inventory/character ;
- tests WS sans auth ;
- tests WS role falsifié ;
- tests NaN/Infinity/extrêmes ;
- tests replay/double submit ;
- tests rate limiting ;
- tests admin audit.

## Long terme

### 1. Modèle anti-cheat serveur

- path validation serveur ;
- authoritative collision map ;
- heuristiques de déplacement ;
- score de suspicion ;
- sanctions progressives ;
- stockage des événements suspects.

### 2. Détection d'abus temps réel

- dashboards sécurité ;
- alertes flood socket/admin ;
- alertes duplication item ;
- alertes économie ;
- corrélation user/IP/socket/device si politique validée.

### 3. Séparation architecture admin

- permissions par rôle ;
- approbation pour actions destructives ;
- mode read-only production ;
- break-glass admin avec audit renforcé ;
- revue périodique des comptes admin.

### 4. Robustesse multi-instance

- rate limits distribués ;
- sessions/socket state partagés ou cohérents ;
- idempotence distribuée ;
- locks économiques distribués via DB ;
- outbox pour broadcasts fiables.

## Roadmap par surface

| Surface | Court terme | Avant économie | Avant production | Long terme |
|---|---|---|---|---|
| Auth HTTP | rate limit, username policy | revocation | refresh/session policy | risk-based auth |
| JWT WS | auth gateway centralisée | replay windows | token expiry handling | distributed session control |
| Inventory | ownership strict | ledger item | audit transfers | fraud detection |
| Movement | speed/distance reject | collision server | reconciliation | anti-cheat scoring |
| Resources | transaction loot | idempotent gather | abuse metrics | resource bot detection |
| Combat | rate/cooldown strict | transaction kill/loot | combat audit | anomaly detection |
| Crafting | rate limit | idempotent craft/order | audit craft outputs | production queues |
| Admin HTTP | DTOs | permissions fines | audit log | approvals |
| Admin WS | auth propre + DTOs | idempotence | audit + rate limit | command governance |
| Runtime debug | DTOs + bounds | env gates | audit | remove/feature flag prod |
| Broadcast | throttle global events | rooms map/chunk | metrics | interest management |

## Recommandations classées

### Critique

- Corriger ownership inventaire avant tout test multi-joueur sérieux.
- Rendre le mouvement serveur réellement autoritatif.
- Authentifier explicitement toutes les gateways sensibles.
- Ajouter rate limiting sur auth, gameplay et admin.
- Introduire idempotence avant économie.

### Importante

- Uniformiser validation WebSocket avec DTOs ou schemas.
- Ajouter audit log admin.
- Réduire `server.emit` global via rooms/chunks.
- Transactionnaliser loot/combat/XP.
- Encadrer les endpoints runtime debug.

### Optimisation

- Normaliser messages d'erreur WS.
- Ajouter métriques sécurité par event.
- Tester systématiquement NaN/Infinity/extrêmes.
- Ajouter pagination pour endpoints admin lus par Studio.

### Long terme

- Anti-cheat comportemental.
- Ledger économique complet.
- Permissions admin granulaires.
- Observabilité et alerting sécurité.
- Durcissement multi-instance.

## Checklist sécurité future

- L'utilisateur est-il authentifié côté serveur ?
- Le rôle vient-il d'une source serveur vérifiée ?
- L'action vérifie-t-elle ownership ou permission cible ?
- Le payload est-il DTO-validé et borné ?
- Le client fournit-il une vérité que le serveur devrait calculer ?
- L'action est-elle rejouable ?
- Un double submit crée-t-il deux effets ?
- Une opération multi-entités est-elle transactionnelle ?
- L'action est-elle rate-limitée ?
- L'action admin est-elle auditée ?
- Un client Phaser/Zustand/TMJ modifié peut-il obtenir un avantage ?

## Aucune modification de code confirmée

Roadmap documentaire uniquement. Aucun fichier Runtime et aucun code n'ont été
modifiés pour produire ce document.
