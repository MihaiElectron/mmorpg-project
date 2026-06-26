# Audit complet du projet MMORPG

_Créé : 2026-06-22_
_Statut : référence de session_
_Méthode : lecture intégrale du code source + documents_

> Ce document distingue trois niveaux de certitude :
> **[CONFIRMÉ]** — observé directement dans le code.
> **[SUPPOSÉ]** — déduit d'indices indirects.
> **[RECOMMANDÉ]** — proposition de l'auteur de l'audit.

---

## 1. Résumé exécutif

### État général

Le projet est un prototype MMORPG web temps réel en phase alpha avancée. Il
dispose d'une architecture technique solide, d'une documentation organisée
(52 fichiers, 10 domaines) et d'un système de coordonnées formalisé par ADR.
Les fondations réseau, base de données et gameplay de base sont opérationnelles.

La migration vers les World Units (WU) est correctement exécutée pour le
backend. Le frontend intègre le rendu WU-first avec fallback pixel. La
documentation est exhaustive mais entièrement en statut `Draft`.

### Niveau de maturité

**Prototype alpha jouable.** Le jeu est démarrable, un joueur peut se connecter,
se déplacer, récolter des ressources, attaquer des animaux et utiliser le panneau
admin. La base technique est suffisamment saine pour évoluer vers une beta, à
condition de traiter les dettes prioritaires identifiées ci-dessous.

### Points forts

- Système de coordonnées WU robuste, testé (170+ tests), mathématiquement
  cohérent avec formule isométrique documentée.
- Architecture backend NestJS propre : modules isolés, DTOs typés, guards
  JWT/RBAC bien placés sur les routes HTTP.
- Outil admin fonctionnel : dashboard temps réel, console de commandes extensible,
  drag-and-drop, pagination, recherche.
- IA animaux complète : FSM (alive/fighting/escaping/dead), patrouille,
  aggro, fuite, auto-attaque, respawn.
- Documentation de référence : ADRs, audits de sécurité, études de migration,
  glossaire, workflow.
- Outillage de développement : générateur CLI (`make:entity`), scripts backfill
  WU, Swagger automatique.

### Principaux risques

1. **[CONFIRMÉ] Mouvement client-autoritatif** : aucune validation serveur des
   positions envoyées par le client. Le serveur accepte toute coordonnée. Exploitable
   pour téléportation arbitraire, bypass des range checks et farming illimité.
2. **[CONFIRMÉ] `ItemModule` absent de `AppModule`** : les endpoints `GET/POST
   /item` sont déclarés mais injoignables (module non importé).
3. **[CONFIRMÉ] Timers de respawn en mémoire** : les `setTimeout` de respawn des
   animaux ne sont pas persistés. Un redémarrage du serveur perd tous les timers
   en cours.
4. **[CONFIRMÉ] `synchronize: true`** : TypeORM synchronise le schéma au
   démarrage. Inacceptable hors développement local.
5. **[CONFIRMÉ] `recalculateStats()` est un stub** vide dans `CharacterService`.
   Les stats des personnages ne tiennent pas compte de l'équipement.

---

## 2. Architecture actuelle

### Frontend

```
React 19 + Vite
├── App.jsx              — Routes (/, /create-character, /world)
├── GameLayout.jsx       — Conteneur : WorldPage + CharacterLayout + ActionPanel
├── pages/
│   ├── LoginPage.jsx    — Formulaire login/register
│   ├── CreateCharacterPage.jsx
│   └── WorldPage.jsx    — Initialise Phaser + Socket.IO, charge le personnage
├── components/
│   ├── CharacterLayout/ — Onglets Perso / Admin
│   ├── CharacterLayer/  — Portrait + équipement (16 slots)
│   ├── Inventory/       — Grille 18 slots
│   ├── ActionPanel/     — Panneau contextuel + console admin
│   ├── AdminPanel/      — Outil admin complet (959 lignes)
│   ├── HealthBar/       — Composant réutilisable
│   └── CoordinatesLayer/— Affichage position (polling)
├── phaser/
│   ├── core/
│   │   ├── BootScene.js     — Init Phaser
│   │   ├── PreloadScene.js  — Chargement assets
│   │   └── WorldScene.js    — Scène principale (850 lignes)
│   ├── player/
│   │   ├── Player.js        — Sprite + physique
│   │   └── PlayerController.js — Inputs (clavier, clic, drag)
│   ├── world/
│   │   └── MapLoader.js     — Classe non instanciée [CONFIRMÉ]
│   ├── utils/
│   │   ├── pathfinding.js   — A* (grille jamais générée) [CONFIRMÉ]
│   │   └── depth.js         — Tri de profondeur isométrique
│   ├── network/
│   │   └── socket.js        — Wrapper Socket.IO (fin)
│   ├── admin/
│   │   ├── admin.actions.ts — Wrappers Socket.IO/HTTP
│   │   ├── commandRegistry.ts — 7 commandes
│   │   └── commandParser.ts — /cmd arg --flag
│   └── config/
│       └── phaser.config.js — Config Phaser (dupliquée dans WorldPage.jsx)
├── store/
│   ├── character.store.js   — Singleton (personnage, inventaire, équipement)
│   ├── actionPanel.store.ts — Singleton (cible, actions)
│   ├── devtools.store.ts    — Singleton (console, historique, outil actif, objet sélectionné)
│   └── items.store.ts       — Store jamais utilisé [CONFIRMÉ]
└── api/
    └── auth.js              — login/register HTTP
```

**Pattern singleton Zustand** [CONFIRMÉ] : les stores critiques sont attachés à
`window.__GLOBAL_*_STORE__` pour survivre aux montages/démontages Phaser.

**Socket.IO** [CONFIRMÉ] : socket unique créé dans `WorldPage.jsx`, attaché à
`window.game.socket`. Les trois gateways backend (World, Resources, Creatures)
partagent ce socket.

### Backend

```
NestJS 11 (apps/api-gateway/src/)
├── app.module.ts         — Point d'entrée, auto-détection entités
├── main.ts               — Bootstrap : ValidationPipe global, CORS, Swagger
├── auth/                 — JWT, bcrypt, Passport, guards
├── users/                — CRUD utilisateurs
├── characters/           — CRUD personnages, équipement
├── world/                — Gateway WebSocket, position, respawn, loot
├── creatures/              — IA, combat, patrol, respawn
├── resources/            — Récolte, inventaire, range check
├── inventory/            — Service/controller inventaire
├── items/                — CRUD items [MODULE NON IMPORTÉ]
├── admin/                — Gateway WS + controller HTTP admin
└── common/
    ├── world-coordinates.ts        — Constantes et fonctions WU
    ├── world-position.adapter.ts   — Adaptateur WU-first avec fallback
    ├── legacy-pixel-position.adapter.ts
    ├── ws-auth.service.ts          — Authentification WebSocket
    ├── roles.guard.ts / roles.decorator.ts
    └── wu-backfill-report.ts       — Rapport de migration DB
```

### Communication

**HTTP REST** (port 3000) :

- Auth : `POST /auth/register`, `POST /auth/login`
- Characters : CRUD + équipement
- Admin : dashboard, templates, spawns, animaux, ressources, personnages
- Items : déclaré mais injoignable (`ItemModule` absent)
- Swagger : `/api/docs`

**WebSocket Socket.IO** (namespace par défaut) :

Trois gateways indépendantes sur le même socket :

| Gateway | Événements entrants | Événements sortants |
|---|---|---|
| `WorldGateway` | `join_world`, `player_move`, `respawn_request` | `world_joined`, `player_joined`, `player_moved`, `player_left`, `current_players`, `character_damaged`, `character_respawn`, `character_teleport` |
| `CreaturesGateway` | `attack_creature`, `get_creatures` | `creature_update`, `creature_list` |
| `ResourcesGateway` | `interact_resource`, `stop_gather` | `gather_start`, `gather_tick`, `gather_complete`, `gather_failed`, `inventory_update`, `resource_update`, `resource_loot` |
| `AdminGateway` | `admin:spawn`, `admin:teleport`, `admin:update_template`, `admin:move_creature`, `admin:respawn_all`, `admin:update_creature`, `admin:update_resource_template`, `admin:spawn_resource`, `admin:update_character`, `admin:update_resource`, `admin:delete_creature`, `admin:delete_resource` | `creature_update`, `resource_update`, `category:updated` |

**Diffusion** [CONFIRMÉ] : `server.emit()` broadcast global à tous les clients
connectés. Pas de rooms, pas de zones. Acceptable en prototype, dette de
scalabilité documentée.

### Persistance

PostgreSQL via TypeORM (`synchronize: true` en développement).

Tables actives :

| Table | Entité | Notes |
|---|---|---|
| `user` | User | UUID, role enum PLAYER/ADMIN |
| `character` | Character | Stats + double colonnes de position (legacy + WU) |
| `character_equipment` | CharacterEquipment | Slot en string (pas enum) |
| `inventory` | Inventory | `equipped` boolean (design discutable) |
| `item` | Item | Entité complète, controller injoignable |
| `resources` | Resource | Type en string (pas enum) |
| `resource_template` | ResourceTemplate | defaultRemainingLoots = 9999 |
| `creatures` | Creature | State enum + double colonnes position |
| `creature_template` | CreatureTemplate | Paramètres IA editables |
| `creature_spawn` | CreatureSpawn | Colonnes WU nullable (migration partielle) |
| `respawn_point` | RespawnPoint | Radius en pixels (non migré) |

Redis et RabbitMQ sont configurés dans `docker-compose.yml` mais **aucun usage
n'est visible dans le code** [CONFIRMÉ].

### Organisation des dossiers

```
mmorpg-project/
├── apps/
│   ├── api-gateway/      — Backend NestJS
│   └── client/           — Frontend React/Vite/Phaser
├── assets/source/        — Pipeline graphique GIMP + SVG
├── docs/                 — 52 fichiers markdown (10 domaines)
├── docker/               — docker-compose.yml
├── packages/shared/      — Constantes partagées [SUPPOSÉ peu utilisé]
└── package.json          — npm workspaces
```

### Dépendances importantes

| Package | Version | Rôle |
|---|---|---|
| `@nestjs/*` | 11.x | Framework backend |
| `typeorm` | 0.3.28 | ORM PostgreSQL |
| `socket.io` | 4.8.1 | WebSocket serveur |
| `passport-jwt` | 4.0.1 | Stratégie JWT |
| `bcrypt` | 6.0.0 | Hachage mots de passe |
| `class-validator` | 0.14.3 | Validation DTOs |
| `phaser` | 3.90.0 | Moteur de jeu |
| `react` | 19.2.0 | UI |
| `zustand` | 5.0.9 | État client |
| `socket.io-client` | 4.8.3 | WebSocket client |
| `sass` | 1.97.0 | Styles |

---

## 3. Modules existants

### Auth

**Rôle :** Inscription, connexion, émission de JWT, validation de token.

**Avancement :** Fonctionnel. `UserRole.PLAYER` et `UserRole.ADMIN` définis.
JWT vérifié côté HTTP via `JwtAuthGuard + RolesGuard` (sur controller admin).
Authentification WebSocket via `WsAuthService` (utilisée dans `WorldGateway`,
**non vérifiée comme indépendante dans `AdminGateway`**).

**Qualité :** Solide pour un prototype. bcrypt (10 rounds), Passport/JWT,
guards bien positionnés sur les routes HTTP.

**Extension possible :** Refresh token, invalidation, MFA, email de
vérification, protection brute-force, audit log.

---

### Monde (WorldService / WorldGateway)

**Rôle :** Connexion des joueurs, synchronisation de position, persistance,
respawn.

**Avancement :** Fonctionnel. `ConnectedPlayers` map en mémoire. WU-first
confirmé : position serveur prioritairement en `worldX/worldY/mapId`, pixel
cache dérivé. Tests unitaires : 24 tests dans `world.service.spec.ts`.

**Qualité :** Bonne. Garde-fous NaN/Infinity. Double-écriture DB. Chebyshev
pour le respawn. Quelques cast `(c as unknown as Character)` à améliorer.

**Extension possible :** Rooms par zone, chunk streaming, interest management,
validation de position (ADR-0003), map multi-instance.

---

### Joueurs (CharacterService / CharacterController)

**Rôle :** CRUD personnages, gestion d'équipement, transactions DB.

**Avancement :** CRUD fonctionnel. Équipement transactionnel. **`recalculateStats()`
est un stub vide** [CONFIRMÉ] : les stats ne reflètent pas l'équipement porté.
Bug confirmé : `equipItem()` valide `findFirstByUser(userId)` sans vérifier
que le `characterId` appartient bien à cet utilisateur [CONFIRMÉ].

**Qualité :** Moyenne. Transactions correctes. Bug d'ownership. Stub critique.
Slot stocké en string (pas en enum) dans `CharacterEquipment`.

**Extension possible :** Calcul de stats, système de niveaux, expérience,
skills, classes de personnage.

---

### Créatures / IA (CreaturesService / CreaturesGateway)

**Rôle :** IA des animaux, patrol, combat, fuite, respawn.

**Avancement :** Complet pour les fonctions de base. FSM à 4 états opérationnelle.
WU-authoritative sur toute la boucle IA. 27 tests unitaires. Seuls 2 templates
seedés (turkey, goblin — goblin utilise la texture turkey [CONFIRMÉ]).

**Qualité :** Bonne architecture FSM mais 15+ constantes magiques hardcodées
(cooldowns, rayons, vitesses). Timers de respawn via `setTimeout` : **perdus
au redémarrage** [CONFIRMÉ]. État in-memory non sauvegardé en DB (intentionnel
mais fragile).

**Extension possible :** Templates configurables, groupes d'animaux, LOS,
pathfinding serveur, comportements scriptés, loot sur mort.

---

### Combat

**Rôle :** Résolution des dégâts joueur ↔ creature.

**Avancement :** Basique mais fonctionnel. Formule : `max(attaque − défense, 1)`.
Auto-attaque animaux implémentée. Riposte (player → creature) implémentée. Pas
de système de sorts, buffs, débuffs.

**Qualité :** Prototype. Formule hardcodée. Aucun test de combat end-to-end.

**Extension possible :** Formule extensible, critiques, résistances, sorts,
cooldowns, animation d'attaque, combat PvP.

---

### Ressources (ResourcesGateway / ResourcesService)

**Rôle :** Récolte, timer serveur, anti-cheat distance, inventaire.

**Avancement :** Fonctionnel. Gathering en 3 secondes avec revalidation
continue. `RESOURCE_INTERACT_RANGE_WU = 1600` (marqué "temporaire"). MOVE_TOLERANCE
encore en pixels (4 px). 2 types de ressources seedés.

**Qualité :** Bonne mais 3 constantes hardcodées marquées temporaires. Pas de
protection contre la récolte concurrente. `markGathered()` défini mais jamais
appelé [CONFIRMÉ].

**Extension possible :** Conditions d'outil, skills de récolte, respawn de
ressources, quantités variables, drop de qualité.

---

### Loot (LootService)

**Rôle :** Générer un item de loot selon le type de ressource.

**Avancement :** Stub. 24 lignes. Switch hardcodé sur 2 types. Retourne
`{ itemId: 'unknown', quantity: 0 }` sur tout type inconnu (silence total).
Aucune table de loot en base.

**Qualité :** Insuffisante. Pas testée. Pas de configuration. Silent failure.

**Extension possible :** Table de loot en DB, taux de drop, rareté, drop
conditionnel (niveau, outil).

---

### Inventaire / Items

**Rôle :** Stocker les objets des personnages, gérer l'équipement.

**Avancement :** Architecture confuse. Deux systèmes coexistent :
`InventoryService` (champ `equipped` boolean sur `Inventory`) et
`CharacterEquipment` (table dédiée par slot). **Les deux sont partiellement
utilisés.** `ItemModule` déclaré mais **non importé dans `AppModule`** [CONFIRMÉ] :
aucun endpoint `/item` n'est joignable.

**Qualité :** Faible. Design dualiste non résolu. `items.store.ts` côté
client défini mais jamais utilisé [CONFIRMÉ].

**Extension possible :** Unification vers `CharacterEquipment` uniquement,
calcul de stats d'équipement, crafting, échange.

---

### Respawn

**Rôle :** Ramener un personnage mort au point de respawn le plus proche.

**Avancement :** Fonctionnel pour les personnages (Chebyshev WU). `RespawnPoint`
seddés en base. Radius encore en pixels (non migré). Timers animaux en mémoire.

**Extension possible :** Points de respawn dynamiques (ville, checkpoint),
pénalité de mort (perte d'exp, durabilité).

---

### DevTools / Admin

**Rôle :** Outil de développement intégré pour inspecter et modifier le monde.

**Avancement :** Opérationnel. Dashboard, console commandes, gestion
créatures/ressources/personnages, drag-and-drop, pagination, temps réel.
Détail complet dans `docs/01_Architecture/admin-tool-roadmap.md`.

**Extension possible :** 12 modules planifiés (voir roadmap). Prochaine
priorité : auth WebSocket admin indépendante, pagination serveur, spawns
éditables.

---

### Réseau

**Rôle :** Communication temps réel client-serveur.

**Avancement :** Socket.IO opérationnel. Broadcast global (`server.emit`). Pas
de rooms. Pas de rate limiting. Pas de validation de position côté serveur.

**Extension possible :** Rooms par zone/chunk, interest management, prediction
client, reconciliation serveur, throttling.

---

### IA (pathfinding)

**Rôle :** Calcul de chemin pour le déplacement joueur et animaux.

**Avancement :** Algorithme A* implémenté côté client (`pathfinding.js`).
**La grille de collision n'est jamais générée** [CONFIRMÉ] : le pathfinder
est conditionnel dans `PlayerController`. `MapLoader.js` est déclaré mais
**jamais instancié** [CONFIRMÉ]. Côté serveur, aucune grille, aucun A*.

**Qualité :** Partielle. L'algorithme est fonctionnel mais O(n log n) par
itération (sort() à chaque étape au lieu d'un tas). Grid non branchée.

**Extension possible :** Génération de grille depuis la tilemap, pathfinding
serveur (validation de déplacement), hierarchical pathfinding pour grands mondes.

---

### Cartes / Monde

**Rôle :** Chargement et rendu de la tilemap isométrique.

**Avancement :** Une tilemap de test (`terrain_pipeline_test.tmj`) est rendue
dans Phaser avec un offset hardcodé `TILEMAP_TEST_OFFSET_X = 936` [CONFIRMÉ].
Ce chiffre entre en conflit avec la constante `WORLD_ORIGIN_X_PX = 1000` du
système WU. Fichier `world.json` présent mais vide (0 bytes) [CONFIRMÉ].
`MapLoader.js` non utilisé en production.

**Pipeline Tiled** : TMJ natif, TSX pour l'édition, tilesets inlinés pour le
runtime. Décision figée dans ROADMAP.md et documentée dans `docs/05_World/tiled.md`.

**Extension possible :** Tilemap de production, multi-cartes, chunk streaming,
transitions de zones.

---

### Collision

**Rôle :** Empêcher le joueur de traverser les obstacles.

**Avancement :** Côté client uniquement, via Phaser Arcade Physics et un
fichier `collisions.json`. Côté serveur : **aucune collision implémentée**
[CONFIRMÉ]. Le client peut déclarer n'importe quelle position valide.

**Extension possible :** Transmission de la grille de collision au serveur,
validation dans `WorldGateway`, intégration avec ADR-0003.

---

## 4. Fonctionnalités terminées

_Ce qui est confirmé fonctionnel dans le code._

- Inscription et connexion JWT (bcrypt, validation, token signé).
- Création de personnage (nom, sexe, position de départ).
- Connexion WebSocket avec authentification JWT.
- Déplacement joueur en temps réel : clavier, clic, drag (3 modes).
- Synchronisation multi-joueurs : `player_joined`, `player_moved`, `player_left`.
- Rendu Phaser WU-first : positions depuis `worldX/worldY` avec fallback `x/y`.
- Profondeur isométrique (depth sorting par Y).
- Récolte de ressources avec timer serveur et anti-cheat distance WU.
- IA animaux : patrouille, aggro, fuite, auto-attaque, respawn (20 s).
- Combat joueur contre creature : dégâts, mort, respawn joueur.
- Barre de vie flottante sur sprites (joueur et animaux).
- Panneau personnage : portrait, 16 slots d'équipement, inventaire.
- Équipement / déséquipement d'items (transactionnel).
- Panneau admin : dashboard temps réel, templates, animaux, ressources, personnages.
- Console admin : 6 commandes opérationnelles (`/spawn`, `/tp`, `/sethp`, `/aggro`,
  `/respawn all`, `/help`), historique, autocomplétion.
- Drag-and-drop depuis panneau admin vers la carte.
- Suppression d'entités admin avec confirmation.
- Système de coordonnées WU : constantes, projections, distance Chebyshev,
  adapters, 170+ tests.
- Scripts de backfill WU : `npm run wu:dry-run` / `npm run wu:backfill`.
- Tilemap isométrique test (64×64 tiles, herbe).
- Générateur CLI `npm run make:entity`.
- Swagger sur `/api/docs`.

---

## 5. Fonctionnalités en cours (partiellement implémentées)

### Système de coordonnées WU — protocole WebSocket

Le backend émet `worldX/worldY/mapId` dans les payloads. Le client les
consomme. Mais :

- `player_move` est encore additif (`x/y + worldX/worldY/mapId`). Le fallback
  pixel n'est pas supprimé.
- `character_respawn` et `character_teleport` : le client positionne le sprite
  depuis `data.x / data.y` (pixels) [CONFIRMÉ dans STATUS.md — P4 prévu mais
  non fait].

### Équipement et calcul de stats

`CharacterEquipment` existe et fonctionne pour stocker l'équipement. Mais
`recalculateStats()` dans `CharacterService` est un stub vide [CONFIRMÉ].
Les stats d'attaque et défense du personnage ne tiennent pas compte des
objets portés.

### Pathfinding

L'algorithme A* est implémenté dans `pathfinding.js`. Le `PlayerController`
l'utilise si disponible. Mais la grille de collision n'est jamais construite
depuis la tilemap [CONFIRMÉ]. Le pathfinding ne fonctionne pas en pratique.

### Inventaire / Items

Le circuit complet existe (Item entité → Inventory entité → inventaire UI)
mais `ItemModule` n'est pas importé dans `AppModule` [CONFIRMÉ] : aucun
endpoint item HTTP n'est joignable. Les items seedés (`item.seed.ts`) ne
sont pas chargés automatiquement.

### Tilemap de production

Une tilemap de test est rendue. Un `MapLoader.js` est prévu pour les maps de
production mais n'est jamais instancié [CONFIRMÉ]. L'offset temporaire
(`TILEMAP_TEST_OFFSET_X = 936`) entre en conflit avec le calcul WU standard.

### Spawn et respawn points éditables

Les `CreatureSpawn` et `RespawnPoint` sont lisibles dans le panneau admin
mais non créables ni modifiables depuis l'UI.

---

## 6. Fonctionnalités absentes

_Systèmes non existants dans le code source._

- **Validation serveur des déplacements** (ADR-0003 proposé non implémenté) :
  pas de borne de vitesse, pas de walkability check, pas de correction client.
- **Système de loot sur mort d'creature** : LootService existe pour les
  ressources, rien pour les animaux.
- **Respawn de ressources** : les ressources épuisées restent à `remainingLoots = 0`
  indéfiniment.
- **Multi-cartes et transitions de zones** : `mapId = 1` hardcodé partout.
  Aucun mécanisme de changement de carte.
- **Chunk streaming** : chargement dynamique de chunks selon la position du
  joueur (ROADMAP.md — non commencé).
- **Système de quêtes** : aucune trace dans le code.
- **Expérience et niveaux** : le champ `experience` existe sur `Character` mais
  aucun mécanisme ne l'alimente.
- **Système de crafting** : absent.
- **Météo, saisons** : parking lot ROADMAP.md.
- **Guildes, partys** : absent.
- **Chat** : absent.
- **Collision serveur** : aucune grille côté serveur.
- **Interest management / rooms** : `server.emit` global uniquement.
- **Gestion des utilisateurs depuis l'admin** : pas d'interface pour lister,
  promouvoir ou désactiver des comptes.
- **Audit log admin** : aucun enregistrement structuré des actions admin.
- **Pagination serveur sur les endpoints admin** : tous les endpoints renvoient
  la totalité des données sans `?page=&limit=`.
- **PvP** : aucune mécanique.
- **Animations de sprites** : commentaire `// Animations plus tard` dans `Player.js`
  [CONFIRMÉ]. Aucune animation implémentée.

---

## 7. Dette technique

### Critique (bloquant avant toute ouverture multi-joueurs sérieuse)

**DT-01 — Mouvement client-autoritatif**
`WorldGateway` accepte sans validation les coordonnées envoyées par le client.
Exploitable pour téléportation, farming, bypass de range checks.
Bloqué par l'absence de grille de collision côté serveur (prérequis d'ADR-0003).

**DT-02 — `ItemModule` absent de `AppModule`**
`ItemController` et `ItemService` sont déclarés mais le module n'est pas importé
dans `app.module.ts`. Aucune route `/item` n'est accessible.

**DT-03 — `recalculateStats()` stub**
`CharacterService.recalculateStats()` est un corps vide. Les stats d'un
personnage ne varient jamais selon l'équipement. L'interface laisse croire
que le calcul existe.

**DT-04 — Timers de respawn en mémoire**
Les `setTimeout` de respawn des animaux (`CreaturesService`) sont en mémoire.
Tout redémarrage du serveur les perd. Les animaux tués restent morts après
redémarrage.

**DT-05 — `synchronize: true` en développement**
TypeORM modifie le schéma PostgreSQL au démarrage. Risque de perte de données
si une colonne est renommée ou supprimée involontairement. À remplacer par des
migrations TypeORM avant tout environnement partagé.

---

### Important (à traiter dans les prochains chantiers)

**DT-06 — Constantes magiques dans CreaturesService (15+)**
`MELEE_RANGE_WU = 960`, `PATROL_TICK_MS = 200`, `AUTO_ATTACK_COOLDOWN_MS = 1500`,
`LEASH_MULTIPLIER = 2`, etc. Non configurables, non documentés, impossibles à
calibrer depuis le panneau admin.

**DT-07 — Constantes magiques dans ResourcesGateway (3)**
`RESOURCE_INTERACT_RANGE_WU = 1600` (marqué "temporaire"), `GATHER_INTERVAL_MS = 3000`,
`MOVE_TOLERANCE = 4` (pixels, non migré en WU).

**DT-08 — Offset tilemap en conflit avec formule WU**
`TILEMAP_TEST_OFFSET_X = 936` dans `WorldScene.js` est appliqué manuellement.
La formule WU utilise `WORLD_ORIGIN_X_PX = 1000`. Ces deux valeurs sont
incohérentes. Le rendu est actuellement compensé par cet offset mais la
relation entre les deux n'est pas documentée ni testée.

**DT-09 — `MapLoader.js` non utilisé**
Fichier de 105 lignes jamais instancié. Dead code.

**DT-10 — `items.store.ts` jamais utilisé**
Store Zustand complet (équipement, inventaire) sans aucun appelant. Double de
`character.store.js`. Source de confusion future.

**DT-11 — Config Phaser dupliquée**
`phaser.config.js` et `WorldPage.jsx` définissent deux configs Phaser
partiellement différentes (modes de scaling distincts : `RESIZE` vs `EXPAND`,
centrage différent). La config de `WorldPage` prévaut mais les différences
peuvent causer des problèmes d'affichage.

**DT-12 — Décodage JWT dupliqué côté client**
`CharacterLayout.jsx` et `ActionPanel.tsx` décryptent tous deux le JWT
manuellement avec `atob(token.split('.')[1])`. Pas de fonction utilitaire
partagée.

**DT-13 — Design dualiste inventaire/équipement**
`Inventory.equipped` (boolean) + `CharacterEquipment` (table dédiée) coexistent.
L'un est utilisé pour la lecture (CharacterEquipment), l'autre pour certaines
transitions. Le circuit exact n'est pas clair.

**DT-14 — Bug ownership dans `equipItem()`**
`CharacterService.equipItem()` valide `findFirstByUser(userId)` sans vérifier
que le `characterId` du payload appartient bien à cet utilisateur. Un
utilisateur pourrait équiper l'item d'un autre personnage s'il connaît son ID.

**DT-15 — `AdminGateway` : provenance du rôle non garantie**
L'`AdminGateway` vérifie `client.data.role === 'admin'` mais ne valide pas le
JWT indépendamment. Si la connexion arrive avant que `WorldGateway` ait stocké
le rôle dans `client.data`, la vérification peut échouer ou être contournée.

---

### Mineur (qualité / lisibilité)

**DT-16 — Grille A* non générée**
`pathfinding.js` implémente A* mais reçoit une grille en paramètre. Aucun
code ne génère cette grille depuis la tilemap. Le pathfinding est conditionnel
et inactif en pratique.

**DT-17 — Slot `CharacterEquipment` en string**
Le champ `slot` est `varchar` en base mais le DTO utilise `EquipmentSlot` (enum).
Cast `(eq.slot as EquipmentSlot)` dans le service sans validation préalable.

**DT-18 — Sprite goblin utilise la texture turkey**
`textureKey: 'turkey'` dans le seed goblin, commenté "placeholder jusqu'à
l'import du sprite goblin" [CONFIRMÉ].

**DT-19 — `LootService` : silence sur type inconnu**
Retourne `{ itemId: 'unknown', quantity: 0 }` pour tout type non reconnu.
Aucun log, aucune exception.

**DT-20 — `CoordinatesLayer` : polling toutes les 100 ms**
Accède à `window.game?.scene?.getScene("WorldScene")?.player` via
`setInterval`. Fragile et non réactif. Préférable : événement ou store.

**DT-21 — HP bar créée au premier dégât**
Dans `WorldScene.js`, la barre de vie du joueur est créée lors du premier
événement `character_damaged`, pas à l'initialisation. Un joueur qui ne prend
pas de dégâts n'a pas de barre de vie visible jusqu'à sa première blessure.

**DT-22 — Redis / RabbitMQ configurés mais inutilisés**
`docker-compose.yml` démarre Redis et RabbitMQ mais aucun module NestJS ne
les consomme. Charge Docker inutile en développement.

**DT-23 — `world.json` vide**
Fichier `apps/client/public/assets/maps/world.json` présent mais à 0 bytes.
Référencé nulle part d'après l'analyse. À supprimer ou à documenter.

---

## 8. DevTools

### Architecture actuelle

L'outil admin est une couche transversale backend + frontend. Voir
`docs/01_Architecture/admin-tool-roadmap.md` pour le détail complet.

**Backend :** `AdminController` (HTTP, protégé par `JwtAuthGuard + RolesGuard`),
`AdminGateway` (WebSocket, 11 événements `admin:*`), `AdminService` (logique
métier).

**Frontend :** `AdminPanel.tsx` (959 lignes), `commandRegistry.ts` (7 commandes),
`commandParser.ts`, `admin.actions.ts`, `devtools.store.ts`.

### Composants existants

| Composant | État |
|---|---|
| Dashboard : compteurs temps réel | Opérationnel |
| Console de commandes (/spawn, /tp, /sethp, /aggro, /respawn all, /help) | Opérationnel |
| Gestion créatures (templates + instances) | Opérationnel |
| Gestion ressources (types + instances) | Opérationnel |
| Gestion personnages | Opérationnel |
| Drag-and-drop vers la carte | Opérationnel |
| Pagination + recherche | Opérationnel |
| Mise à jour temps réel (socket) | Opérationnel |
| Téléportation d'entité | Opérationnel |
| Suppression avec confirmation | Opérationnel |

### Limitations actuelles

- **Auth WebSocket admin non indépendante** (DT-15) : risque de contournement
  de rôle si connexion hors séquence normale.
- **Pas de pagination serveur** : tous les animaux, ressources et personnages
  sont renvoyés en une seule réponse HTTP.
- **Spawns non éditables** : `CreatureSpawn` et `RespawnPoint` sont lisibles
  mais non créables/modifiables depuis l'UI.
- **Pas de visualisation map** : aucun overlay debug (chunks, collisions, zones
  d'aggro, pathfinding, états IA).
- **Pas de log d'audit** : aucune trace des actions admin.
- **`/decor` non implémenté** : commande stub dans le registre.

### Possibilités d'évolution

L'architecture (config déclarative de sections, registre de commandes extensible,
overlay Phaser injectable) permet d'ajouter des modules sans réécriture. Douze
modules sont planifiés dans la roadmap : auth WS, pagination, spawns éditables,
overlays (chunks, collisions, aggro, pathfinding, états IA), audit log, gestion
users, éditeur de map, outils gameplay.

---

## 9. Scalabilité

### Ce qui est prêt

| Aspect | État | Commentaire |
|---|---|---|
| Coordonnées WU | Prêt | Arithmétique entière, indépendant du moteur de rendu |
| Modèle entité | Prêt | UUID, timestamps, relations TypeORM |
| Auth JWT stateless | Prêt | Scalable horizontalement |
| Modules NestJS isolés | Prêt | Facile à extraire en microservices |
| Générateur CLI | Prêt | Nouveau domaine en quelques minutes |

### Ce qui doit évoluer avant montée en charge

| Système futur | Prérequis techniques | Complexité |
|---|---|---|
| Quêtes | Entité Quest, QuestStep, conditions, triggers | Moyenne |
| Métiers / skills | Entité Skill, progressions, conditions d'outil | Moyenne |
| Économie | Market entité, transactions, pricing | Élevée |
| Météo | Système de tick monde, broadcast événement | Faible |
| Guildes | Entité Guild, membres, ranks, chat de guilde | Moyenne |
| Événements dynamiques | Scheduler NestJS, triggers conditionnels | Moyenne |
| Scripts IA | Interpréteur de comportement, AST ou scripting | Élevée |
| Pathfinding avancé | Grille côté serveur, hierarchical A*, navigation mesh | Élevée |
| Collisions serveur | Grille par chunk, validation dans gateway | Moyenne |
| Génération procédurale | Noise functions, seeding, persistence chunks | Élevée |
| Instanciation (donjons) | Instance manager, lifecycle, rooms Socket.IO | Élevée |
| Housing | Entité parcel, builder tool, permissions | Élevée |
| Crafting | Recettes, ingrédients, résultats, skills | Moyenne |

### Changements architecturaux inévitables

**À court terme :**

- `server.emit` → rooms par zone ou chunk. Inévitable dès 50+ joueurs pour
  éviter de broadcaster des événements hors champ de vision.
- Pagination serveur sur tous les endpoints admin (déjà identifié DT-03 roadmap).

**À moyen terme :**

- État des animaux en mémoire → persistance partielle (Redis pour état live,
  PostgreSQL pour état durable). Nécessaire pour la tolérance aux pannes.
- `synchronize: true` → migrations TypeORM. Inévitable avant tout déploiement.
- Validation de position côté serveur (ADR-0003). Inévitable avant toute
  ouverture publique.

**À long terme :**

- Monolith NestJS → microservices ou workers par gateway si charge importante.
  Redis est déjà dans le docker-compose (non utilisé) : prêt pour pub/sub.
- Chunk streaming : le système de coordonnées WU (chunk = 64 tiles) est conçu
  pour ça. L'implémentation reste à faire.

---

## 10. Priorités recommandées

### Phase 1 — Stabilisation (prérequis pour toute suite sérieuse)

**P1.1 — Importer `ItemModule` dans `AppModule`** (DT-02)
15 minutes. Débloque les endpoints `/item` et le seeding d'items.

**P1.2 — Implémenter `recalculateStats()`** (DT-03)
Calcul des stats du personnage depuis les items équipés. Dépend de la
résolution du système inventaire/équipement.

**P1.3 — Résoudre la dette inventaire/équipement** (DT-13)
Choisir entre `Inventory.equipped` et `CharacterEquipment` comme source de
vérité unique pour l'équipement. Unifier les deux circuits.

**P1.4 — Auth WebSocket admin indépendante** (DT-15)
`AdminGateway` doit appeler `WsAuthService.authenticate()` et ne pas dépendre
de `client.data.role` seul.

---

### Phase 2 — DevTools (valeur immédiate pour le développement)

**P2.1 — Pagination serveur admin**
Ajouter `?page=&limit=` sur `/admin/creatures`, `/admin/resources`,
`/admin/characters`.

**P2.2 — Spawns et respawn points éditables**
Créer, déplacer, supprimer des `CreatureSpawn` et `RespawnPoint` depuis le
panneau admin.

**P2.3 — Overlays debug Phaser**
Chunks (grille 64×64), collisions (heatmap), zones d'aggro et respawn
(cercles), pathfinding (nœuds), états IA (FSM visible sur sprite).

---

### Phase 3 — Loot et progression

**P3.1 — Loot sur mort d'creature**
Table de loot configurable par template (`CreatureTemplate.lootTable`), drop
aléatoire, ajout à l'inventaire.

**P3.2 — Respawn de ressources**
Après épuisement, timer de respawn configurable par template. Recréation
automatique des loots.

**P3.3 — Expérience et niveaux**
Alimenter `Character.experience` sur kill/récolte. Calcul de level-up.

---

### Phase 4 — Monde et déplacement

**P4.1 — Grille de collision côté serveur**
Exposer la grille de tiles bloquants au backend. Prérequis d'ADR-0003.

**P4.2 — Validation de position (ADR-0003)**
Implémenter dans `WorldGateway` : borne de vitesse, walkability check, map
bounds. Correction du client en cas de rejet.

**P4.3 — Tilemap de production**
Remplacer la tilemap test par une vraie carte. Résoudre l'offset conflictuel.
Brancher `MapLoader.js` dans `WorldScene`.

---

### Phase 5 — Gameplay

**P5.1 — Scripting IA / comportements configurables**
Remplacer les 15 constantes magiques d'`CreaturesService` par des paramètres
de template éditables depuis l'admin.

**P5.2 — Combat enrichi**
Résistances, critiques, animations, tooltips de dégâts.

**P5.3 — Rooms WebSocket par zone**
`server.emit` → `server.to(zoneRoom).emit`. Prérequis scalabilité.

---

### Dépendances entre chantiers

```
P1.1 (ItemModule)       → P1.2 (stats) → P1.3 (inventaire)
P1.4 (Auth WS admin)    → P2.1 (pagination) → P2.2 (spawns)
P2.2 (spawns)           → P2.3 (overlays)
P4.1 (grille serveur)   → P4.2 (validation mouvement) → P5.3 (rooms)
P3.1 (loot creature)      → P3.3 (exp/niveaux)
P4.3 (tilemap prod)     → P4.1 (grille collision depuis tilemap)
```

---

## 11. Vision long terme

### Ce que l'architecture actuelle peut supporter

**[CONFIRMÉ] Points solides :**

- Le système WU est conçu pour être indépendant de Phaser et scalable. Il
  supporte nativement le multi-chunk, la position absolue dans un monde infini
  et les projections multiples. C'est une fondation solide.
- La séparation NestJS modules → gateways WebSocket → services est propre.
  L'ajout d'une nouvelle gateway (chat, craft, events) ne nécessite pas de
  modifier l'existant.
- Le modèle ADR est en place. Les décisions d'architecture sont traçables.
  C'est une discipline rare et utile pour un projet à longue durée de vie.
- L'outil admin est extensible par design. Il peut évoluer vers un éditeur
  de jeu complet sans refactoring majeur.

**[RECOMMANDÉ] Ce qui doit évoluer dans les prochains mois :**

1. **Validation de position** : sans ADR-0003, le jeu reste exploitable.
   C'est le chantier technique le plus urgent pour un MMORPG multijoueur réel.

2. **Chunk streaming et interest management** : broadcaster à 100+ joueurs
   tous les événements de tous les autres joueurs n'est pas viable. Les rooms
   Socket.IO par chunk sont le premier pas inévitable.

3. **Persistence de l'état live** : l'état en mémoire (animaux, timers,
   sessions) doit être partiellement répliqué (Redis) pour la tolérance aux
   pannes. Sans ça, tout redémarrage réinitialise le monde.

4. **Migrations TypeORM** : `synchronize: true` doit disparaître. Chaque
   évolution de schéma doit être une migration versionnée et réversible.

5. **Séparation des préoccupations frontend** : `WorldScene.js` (850 lignes)
   est un god object. À terme, il devra être découpé en systèmes (RenderSystem,
   InputSystem, NetworkSystem, UIBridge). Pas urgent aujourd'hui, mais toute
   nouvelle fonctionnalité rend le découpage plus difficile.

### Ce qui devra probablement être réécrit un jour

- **`CreaturesService`** : la boucle IA dans un `setInterval` NestJS avec état
  in-memory atteindra ses limites avec 100+ animaux ou une logique plus
  complexe. Un système d'entités (ECS) ou des workers dédiés seront nécessaires.
- **Broadcast global** : `server.emit` sera remplacé par un système de
  pub/sub (Redis) et de rooms par zone. L'infrastructure Docker est déjà prête.
- **Authentification admin WebSocket** : la vérification `client.data.role`
  devra être refactorisée vers un guard NestJS standard pour la cohérence.

### L'architecture peut-elle devenir celle d'un MMORPG de grande taille ?

Oui, à condition que les évolutions suivantes soient traitées progressivement :

| Fondation | État | Chemin vers la grande taille |
|---|---|---|
| Coordonnées | Solide | Chunk streaming à implémenter |
| Auth | Solide | Refresh token + invalidation à ajouter |
| Gameplay backend | Partiel | Validation position + loot + progression à compléter |
| Scalabilité réseau | Insuffisante | Rooms par zone indispensables |
| Persistance état | Insuffisante | Redis pour état live |
| Tests | Partiel | Couverture à étendre, 0 test frontend |
| Infrastructure | Prototype | Migrations TypeORM + CI/CD à mettre en place |

Le projet est sur la bonne trajectoire. Les fondations (WU, modules NestJS,
ADRs, outil admin) sont suffisamment saines pour construire dessus. Les
prochains chantiers doivent traiter les dettes bloquantes (validation
mouvement, persistence état, loot) avant d'ajouter du gameplay supplémentaire.
