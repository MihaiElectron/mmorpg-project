# Audit sécurité backend et WebSocket

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-26
- Scope: audit documentaire uniquement
- Runtime impact: aucun
- Code impact: aucun

## Résumé

Cet audit couvre les surfaces HTTP et WebSocket du backend MMORPG avec le modèle
de menace suivant : le client React/Phaser/Zustand est modifiable, les payloads
Socket.IO sont falsifiables, les fichiers TMJ/Tiled côté navigateur sont
falsifiables, et le serveur doit rester autoritatif.

Le projet possède déjà plusieurs protections importantes : JWT HTTP,
guards admin HTTP, JWT WebSocket sur les gateways world/resources/creatures,
ownership character sur plusieurs routes, validations DTO HTTP globales,
craft serveur transactionnel, range checks pour récolte/combat, cooldown attaque
joueur/creature et résolution serveur du `characterId` pour craft/récolte/combat.

Les risques prioritaires sont : routes inventory HTTP trop permissives,
`player_move` encore trop client-driven, absence de rate limiting/replay
protection, payloads WebSocket validés manuellement et hétérogènes, actions
admin sans audit log durable, et provenance de `client.data.role` dans
`AdminGateway` non vérifiée indépendamment.

## Légende

- `Implemented` : observé dans le code.
- `Not verified` : non prouvé par les fichiers inspectés.
- `Missing` : absence observée ou protection non présente dans le chemin audité.
- `Future` : explicitement attendu pour une étape ultérieure.

## Surfaces d'entrée

### HTTP controllers

| Surface | Entrée | Auth | Autorisation | Validation | Statut |
|---|---|---|---|---|---|
| Root | `GET /` | aucune | publique | none | `Implemented` |
| Auth | `POST /auth/register`, `POST /auth/login` | publique | publique | DTO + ValidationPipe | `Implemented` |
| Characters | `/characters/**` | JWT | ownership partiel par service | DTO sur create/equip/unequip | `Implemented` / `Not verified` |
| Inventory | `/inventory/**` | JWT | ownership non vérifié dans controller/service | DTO create uniquement | `Missing` |
| Items | `/item` | JWT | writes admin via RolesGuard | DTO create/update | `Implemented` |
| Crafting | `/crafting/**` | JWT | character résolu serveur | DTO craft, query stationType libre | `Implemented` |
| Admin | `/admin/**` | JWT | class-level admin guard | bodies ad hoc, DTO absents | `Implemented` / `Not verified` |
| Player runtime | `/player-runtime/me/**` | JWT | own character via JWT | no body sauf recalc | `Implemented` |
| Player runtime debug | `/player-runtime/debug/**` | JWT | admin role | body ad hoc sans DTO | `Implemented` / `Not verified` |

### WebSocket gateways

| Gateway | Events | Auth handshake | Autorisation | Commentaire | Statut |
|---|---|---|---|---|---|
| `WorldGateway` | `join_world`, `player_move` | `WsAuthService` | join vérifie ownership character | mouvement accepte intentions WU client | `Implemented` / `Not verified` |
| `ResourcesGateway` | `get_resources`, `interact_resource` | `WsAuthService` | utilise `client.data.player` | range/state revalidés à chaque tick | `Implemented` |
| `CreaturesGateway` | `get_creatures`, `attack_creature` | `WsAuthService` | utilise `client.data.player` | cooldown et range côté service | `Implemented` |
| `CraftingGateway` | `craft:start` | pas de hook propre observé | vérifie `client.data.userId` | dépend du namespace partagé | `Not verified` |
| `AdminGateway` | nombreux `admin:*` | pas de hook propre observé | vérifie `client.data.role === 'admin'` | provenance du rôle non indépendante | `Not verified` |

### Événements admin observés

`admin:spawn`, `admin:teleport`, `admin:update_template`,
`admin:move_creature`, `admin:respawn_all`, `admin:update_creature`,
`admin:update_resource_template`, `admin:spawn_resource`,
`admin:delete_creature`, `admin:delete_resource`, `admin:update_character`,
`admin:create_creature_template`, `admin:create_resource_template`,
`admin:create_skill_definition`, `admin:update_skill_definition`,
`admin:update_resource`, `admin:create_crafting_recipe`,
`admin:update_crafting_recipe`, `admin:add_ingredient`,
`admin:remove_ingredient`, `admin:add_result`, `admin:remove_result`,
`admin:validate_crafting_recipe`, `admin:create_crafting_station_template`,
`admin:update_crafting_station_template`, `admin:create_crafting_station`,
`admin:update_crafting_station`, `admin:delete_crafting_station`.

Ces events sont sensibles : spawn, delete, teleport, template update, economy
parameters, crafting definitions et station placement peuvent altérer durablement
le monde ou les règles gameplay.

## Authentification

### JWT HTTP

`Implemented` :

- `JwtAuthGuard` protège les routes non publiques.
- `JwtStrategy` extrait le bearer token, vérifie signature et expiration.
- Le payload expose `userId`, `username`, `role`.
- Le token de login expire en `1h`.
- `ValidationPipe` globale avec `whitelist`, `forbidNonWhitelisted`,
  `transform` et conversion implicite est active.

`Not verified` :

- refresh token ;
- révocation ;
- invalidation des tokens après changement de rôle ou désactivation compte ;
- vérification DB de `isActive` à chaque requête protégée ;
- rotation de secret JWT ;
- rate limiting login/register.

### JWT WebSocket

`Implemented` :

- `WsAuthService` lit `handshake.auth.token` ou header `Authorization`.
- `WorldGateway`, `ResourcesGateway` et `CreaturesGateway` appellent
  `WsAuthService.authenticate()` dans `handleConnection`.
- Les sockets non authentifiés sont déconnectés dans ces gateways.
- `client.data.userId` et `client.data.role` sont peuplés après auth réussie.

`Not verified` :

- `AdminGateway` n'a pas de `handleConnection` propre observé.
- `CraftingGateway` n'a pas de `handleConnection` propre observé.
- L'ordre d'exécution garanti entre gateways du namespace partagé.
- Revalidation d'un token déjà connecté après expiration, révocation ou rôle
  modifié.

### Token côté client

`Implemented` :

- Le client stocke le token dans `localStorage`.
- Le socket client envoie le token via `auth: { token }`.
- Les appels fetch admin/runtime ajoutent `Authorization: Bearer <token>`.
- Certains composants décodent le JWT côté navigateur pour afficher les UI admin.

`Missing` / `Not verified` :

- protection XSS du token en `localStorage` ;
- refresh/revocation ;
- session binding ;
- déconnexion forcée des sockets si le token est compromis.

## Autorisation

### HTTP

`Implemented` :

- `AdminController` utilise `JwtAuthGuard`, `RolesGuard` et
  `@Roles(UserRole.ADMIN)` au niveau classe.
- `ItemController` protège create/update/delete avec `RolesGuard` admin.
- `PlayerRuntimeController` protège les routes debug avec `RolesGuard` admin.
- `CharacterController` vérifie l'utilisateur via `req.user.userId` dans la
  plupart des services character.
- `CraftingController` résout le personnage principal côté serveur.

`Missing` / `Not verified` :

- `InventoryController` accepte `characterId` dans l'URL/body sans ownership
  observé.
- `CharacterService.equipItem(characterId, userId, dto)` vérifie seulement que
  l'utilisateur possède un premier personnage avant d'utiliser `characterId`;
  ownership du `characterId` cible est `Not verified`.
- Les bodies admin HTTP utilisent souvent `Record<string, number>` ou
  `{ fields: Record<string, unknown> }` sans DTO dédié.
- Pas d'audit log durable des actions admin.

### WebSocket

`Implemented` :

- `join_world` vérifie que le personnage appartient à `client.data.userId`.
- `interact_resource` utilise le character/position depuis `client.data.player`,
  pas depuis le payload.
- `attack_creature` utilise le character/position depuis `client.data.player`,
  pas le `characterId` envoyé par le client.
- Les events admin vérifient `client.data.role === 'admin'`.

`Not verified` / `Missing` :

- provenance indépendante de `client.data.role` dans `AdminGateway`.
- guards WebSocket centralisés.
- permissions admin fines par action.
- idempotency/replay keys.
- rate limiting par socket/user/IP/action.
- audit trail durable.

## Payloads et validation

### HTTP DTOs

`Implemented` :

- Auth DTOs : string username/password, mot de passe register min 6.
- Character DTOs : name min 3, sex enum, item UUID, slot enum pour equip.
- Craft DTO : recipe UUID, quantity 1-99.
- Inventory create DTO : UUID character/item, quantity min 1.
- Global ValidationPipe rejette les champs non whitelistés pour DTOs.

`Missing` / `Not verified` :

- DTO admin HTTP.
- DTO player-runtime debug.
- DTO inventory equip/unequip/get by param ownership.
- limites de longueur username/password/name au-delà du minimum.
- normalisation username.

### WebSocket payloads

`Implemented` :

- `join_world` type guard minimal.
- `player_move` rejette NaN/Infinity via `Number.isFinite`.
- `interact_resource` vérifie `targetId` string.
- `attack_creature` vérifie `targetId` string.
- `craft:start` valide recipeId string et quantity entier 1-99.
- Admin events utilisent des validations manuelles par event.

`Missing` / `Not verified` :

- DTOs WebSocket avec class-validator.
- UUID validation systématique.
- bornes coordonnées pour tous les admin events.
- validation mapId pour stations/admin.
- whitelist centralisée.
- rejet cohérent de `Infinity` : plusieurs handlers admin utilisent `Number(v)`
  puis `isNaN`, ce qui n'exclut pas toujours `Infinity`.
- stratégie uniforme d'erreur et de logging.

## Mécaniques gameplay

### Mouvement

`Implemented` :

- Le socket doit être authentifié.
- `join_world` vérifie l'ownership du character.
- `player_move` accepte seulement `worldX/worldY/mapId` finis.
- Le serveur dérive le cache pixel depuis WU.
- Des métriques passives suspectent téléport/speed/map mismatch.

`Missing` / `Future` :

- validation serveur autoritative de collision/mobilité.
- correction/rejet fort des mouvements suspects.
- vérification authoritative map/chunk.
- rate limiting de `player_move`.
- anti-replay ou séquence de mouvement.

### Récolte et loot

`Implemented` :

- Le target est un `targetId`, pas un item/loot choisi par le client.
- Le serveur vérifie resource existe, alive, loots restants, distance WU.
- Le cycle revalide état/portée avant loot.
- Le loot est généré côté serveur.
- La session de gather est par socket et ignore le re-clic même target.

`Missing` / `Not verified` :

- transaction unique resource decrement + inventory add + XP.
- protection double submit inter-sockets/multi-worker.
- rate limiting des starts/cancels.
- la détection de mouvement du gather reste basée sur cache pixel avec tolérance
  legacy.

### Combat créature

`Implemented` :

- `attack_creature` résout le character depuis `client.data.player`.
- Le service vérifie creature existe, pas dead, character existe, character alive,
  range, cooldown joueur.
- Dégâts calculés côté serveur.
- Riposte serveur et cooldown auto-attaque creature.

`Missing` / `Not verified` :

- transaction commune health creature, health character, XP kill, respawn.
- anti-replay/idempotence d'attaque.
- rate limiting Socket.IO.
- validation collision/path server-side.
- loot creature futur.

### Crafting

`Implemented` :

- HTTP craft résout character côté serveur.
- WebSocket craft vérifie `client.data.userId` et résout character côté serveur.
- Quantity bornée 1-99.
- Craft runtime transactionnel, avec locks inventaire ingrédients.
- Station requise validée côté serveur par distance WU.

`Not verified` :

- authentication propre de `CraftingGateway` si utilisé sans autre gateway.
- rate limiting craft.
- replay/double-submit idempotency.

### Inventaire

`Critical / Missing` :

- `POST /inventory` permet à un client authentifié d'envoyer `characterId`,
  `itemId`, `quantity`, `equipped`.
- `GET /inventory/:characterId`, equip et unequip par characterId ne montrent
  pas d'ownership check.
- `InventoryService.addItem()` vérifie existence character/item, mais pas que le
  character appartient à l'utilisateur JWT.

Impact potentiel : injection d'items, modification d'inventaire ou lecture
d'inventaire d'un autre personnage si l'ID est connu.

## Actions admin

### Protections observées

`Implemented` :

- HTTP admin routes protégées par JWT + role admin.
- Events admin rejettent `client.data.role !== 'admin'`.
- Plusieurs handlers ont whitelists de champs.
- Plusieurs services valident existence de targets et bornes métier.

### Risques

`Missing` / `Not verified` :

- aucun audit log durable observé.
- pas de rate limiting/flood control.
- pas de confirmation serveur pour opérations massives.
- pas d'idempotency key.
- pas de séparation de permissions admin par capacité.
- pas de limite de spawn/delete/update par intervalle.
- pas de protection contre retry après timeout client.
- pas de validation DTO WebSocket centralisée.
- `AdminGateway` auth indépendante non observée.

### Debug/runtime inspector

`Implemented` :

- Routes `player-runtime/debug/modifiers` sont admin-only via RolesGuard.
- Runtime self endpoints `me/*` résolvent le personnage depuis JWT.

`Not verified` :

- DTO strict pour `DebugModifierInput`.
- bornes fortes sur valeurs de modifiers.
- audit log de modifiers debug.
- désactivation explicite en production.

## Risques MMORPG spécifiques

| Risque | Statut | Commentaire |
|---|---|---|
| Client Phaser modifié | `Expected threat` | doit rester non fiable |
| Zustand modifié | `Expected threat` | déjà traité comme UI state non autoritatif |
| TMJ/Tiled modifié côté client | `Expected threat` | collision/mobilité serveur future requise |
| Replay attack | `Missing` | pas de nonce/séquence/idempotency observé |
| Double submit | `Missing` | inventaire/loot/admin spawn vulnérables conceptuellement |
| Socket spam | `Missing` | pas de rate limit observé |
| Admin flood | `Missing` | pas de quotas/audit |
| Broadcast abusif | `Not verified` | plusieurs `server.emit` globaux |
| Déni de service logique | `Not verified` | get_resources/get_creatures/listings globaux |
| Duplication item | `Critical` | inventory HTTP + transactions loot à sécuriser |

## Matrice de risque

| Surface | Risque | Exploit possible | Impact | Sévérité | Recommandation | Priorité |
|---|---|---|---|---|---|---|
| `/inventory` HTTP | ownership manquant | créer/lire/modifier inventaire par `characterId` connu | duplication item, vol info | Critique | retirer l'autorité client sur characterId/item grants, ownership server | Immédiat |
| `player_move` | client position authoritative | envoyer WU arbitraires finis | teleport/speed hack | Critique | validation serveur distance/collision/reconciliation | Immédiat |
| AdminGateway | auth propre non vérifiée | event admin sur namespace si role data non fiable | admin abuse | Critique | auth gateway centralisée/guard WS, role provenance | Immédiat |
| Admin actions | pas d'audit durable | spawn/delete/update sans trace | abus admin non traçable | Critique | audit log actor/action/target/payload/result | Avant production |
| Auth login/register | pas de rate limit | brute force/password stuffing | compromission compte | Critique | rate limit, lockout progressif, monitoring | Immédiat |
| localStorage token | vol XSS | exfiltration JWT | account/admin takeover | Critique | durcissement XSS, CSP, stratégie token | Avant production |
| Resource loot | pas transaction unique | double tick/concurrence | duplication loot | Critique | transaction/lock/idempotence | Avant économie |
| Combat/XP | pas transaction commune | kill/riposte replay/concurrent | XP/state incohérents | Important | command transactionnelle combat | Avant gameplay complet |
| WebSocket payloads | validation manuelle hétérogène | valeurs extrêmes/Infinity/champs inattendus | crash/logical abuse | Important | DTO WS + pipes + schemas | Immédiat |
| `server.emit` global | broadcast large | spam events ou gros payloads | DoS logique | Important | rooms/chunks, throttling | Avant scale |
| Admin spawn/delete | pas idempotent | retry timeout ou replay | duplication/suppression répétée | Important | idempotency keys, confirmations | Avant production |
| Runtime debug | body non DTO | modifier extrême | stats invalides/admin abuse | Important | DTO strict, limites, audit | Avant production |
| Craft gateway | auth propre non vérifiée | event craft sans autre gateway auth | craft unauthorized | Important | handleConnection/guard partagé | Immédiat |
| Inventory equip | ownership cible douteux | équiper autre character | state corruption | Important | ownership sur target character | Immédiat |
| Movement metrics | reset admin | effacer signaux anti-cheat | perte forensic | Important | audit reset + permissions fines | Avant production |
| Public Swagger | `/api/docs` exposé | reconnaissance API | info disclosure | Optimisation | restreindre selon env | Avant production |

## Points forts

- Le modèle documentaire affirme clairement que le client est non fiable.
- Les routes admin HTTP sont protégées par guards.
- Les routes craft et plusieurs gameplay flows ne prennent pas `characterId`
  depuis le client.
- Les DTOs HTTP existent sur les routes joueur/craft de base.
- `ValidationPipe` globale est configurée de manière stricte.
- Les gateways gameplay authentifient les sockets et déconnectent les sockets
  sans JWT.
- Les contrôles de range récolte/combat sont côté serveur.

## Faiblesses principales

- L'inventaire HTTP est trop exposé pour un MMORPG.
- Le mouvement reste basé sur intentions de coordonnées client, sans autorité
  serveur complète.
- Les protections anti-spam/replay/idempotence sont absentes ou non vérifiées.
- Les payloads WebSocket ne suivent pas encore une politique DTO commune.
- Les actions admin ne sont pas traçables durablement.
- Les debug endpoints admin n'ont pas de garde de production observée.

## Aucune modification de code confirmée

Audit documentaire uniquement. Aucun fichier Runtime et aucun code n'ont été
modifiés pour produire ce document.
