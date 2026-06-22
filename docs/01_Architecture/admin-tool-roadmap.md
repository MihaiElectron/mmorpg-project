# Admin Tool — Roadmap et Architecture Cible

_Créé : 2026-06-22_
_Statut : étude initiale_

---

## 1. Architecture actuelle

L'outil d'administration est une couche transversale en deux parties : un panneau
React monté dans l'interface joueur, et un module NestJS dédié côté backend.

### 1.1 Backend (`apps/api-gateway/src/admin/`)

```
admin.module.ts        — Câblage NestJS (TypeORM, AnimalsModule, WorldModule, CommonModule)
admin.controller.ts    — Routes HTTP REST sécurisées (JwtAuthGuard + RolesGuard ADMIN)
admin.service.ts       — Logique métier, agrégation, conversion de coordonnées
admin.gateway.ts       — Gateway WebSocket : 11 événements Socket.IO admin:*
admin.service.spec.ts  — Tests unitaires de conversion de coordonnées
```

**Autorisations serveur :**

- HTTP : `JwtAuthGuard` + `RolesGuard` + `@Roles(UserRole.ADMIN)` sur toute la classe controller.
- WebSocket : vérification `client.data.role === 'admin'` à l'entrée de chaque handler.

### 1.2 Frontend (`apps/client/src/`)

```
store/admin.store.ts                          — Zustand singleton (console active, historique, dernière pos)
components/AdminPanel/AdminPanel.tsx          — UI principale (959 lignes)
components/CharacterLayout/CharacterLayout.jsx — Onglet Admin conditionnel (rôle JWT côté client)
components/ActionPanel/ActionPanel.tsx        — Console secondaire sur cible sélectionnée
phaser/admin/admin.actions.ts                 — Wrappers Socket.IO / HTTP avec ackPromise
phaser/admin/commandRegistry.ts              — Registre de 7 commandes (/spawn, /tp, /sethp…)
phaser/admin/commandParser.ts                — Parseur /command arg --flag=value
styles/components/_admin-panel.scss          — Styles
```

---

## 2. Composants existants et fonctionnalités disponibles

### 2.1 Dashboard

Compteurs temps réel via HTTP + socket : templates, spawns, animaux actifs, joueurs
connectés, personnages enregistrés.

### 2.2 Console de commandes

- Syntaxe `/commande arg --flag=valeur`.
- Historique (50 entrées), navigation flèches, autocomplétion Tab.
- Affichage des 5 derniers résultats (succès/erreur).
- Commandes disponibles : `/spawn`, `/tp`, `/sethp`, `/aggro`, `/respawn all`, `/decor` (stub), `/help`.

### 2.3 Gestion des créatures

- Liste hiérarchisée template → instances avec pagination et recherche.
- Templates éditables : `baseHealth`, `baseAttack`, `baseArmor`, `aggroRadius`,
  `fleeThresholdPct`, `patrolRadius`.
- Instances éditables : `state`, `health`, `x`, `y`.
- Drag-and-drop depuis le panneau vers la carte Phaser pour spawner.
- Suppression d'instance avec état de confirmation.
- Bouton téléportation vers la position d'une instance.

### 2.4 Gestion des ressources

- Liste hiérarchisée type → instances.
- Types éditables : `defaultRemainingLoots`.
- Instances éditables : `state`, `x`, `y`, `remainingLoots`.
- Drag-and-drop, suppression, téléportation.
- Conversion automatique coordonnées écran ↔ WU côté service.

### 2.5 Gestion des personnages

- Liste plate avec pagination, recherche.
- Champs éditables : `level`, `health`, `maxHealth`, `attack`, `defense`.

### 2.6 Mises à jour temps réel

- Écoute de `animal_update`, `resource_update`, `player_joined`, `player_left` pour
  mettre à jour le panneau sans rechargement.

---

## 3. Fonctionnalités manquantes

### 3.1 Visualisation map dans le panneau admin

Aucun rendu de la carte dans l'outil d'administration. Tout le retour visuel
passe par la scène Phaser principale (partagée avec le joueur).

| Manquant | Impact |
|---|---|
| Vue minimap des entités | Impossible de repérer un spawn sans connaître les coords |
| Overlay chunks (64×64 tiles) | Pas de repère spatial pour les spawns |
| Overlay collisions | Invisible depuis le panneau |
| Overlay zones d'aggro | Impossible à visualiser sans code debug |
| Overlay zones de respawn | Idem |
| Overlay pathfinding (nœuds, coûts) | Invisible |

### 3.2 Gestion des spawns

- Les `CreatureSpawn` sont lisibles mais non éditables depuis l'UI.
- Pas de création, déplacement ni suppression de spawn point via l'admin.
- Les `RespawnPoint` (personnages) ne sont pas exposés dans le panneau.

### 3.3 Gestion de la map / décor

- `/decor` est un stub non implémenté.
- Aucune interface de placement de tiles ou d'objets de décor.
- Aucun outil d'édition de la tilemap.

### 3.4 Gestion des utilisateurs

- Pas d'interface pour lister, promouvoir (PLAYER → ADMIN) ou désactiver des comptes.

### 3.5 Monitoring et métriques

- Pas de graphiques d'activité (connexions, actions, erreurs) dans le temps.
- Pas de log structuré des actions admin consultable dans l'UI.
- Pas de vue des événements WebSocket en cours.

### 3.6 Outils IA / gameplay

- Pas de visualisation du comportement IA (états de la FSM, transitions).
- Pas de simulation d'actions joueur (attaque simulée, récolte simulée).
- Pas d'éditeur de scripts de comportement.

### 3.7 Sécurité / robustesse

- `AdminGateway` n'authentifie pas le JWT indépendamment : `client.data.role`
  provient du `WorldGateway` (provenance non garantie dans tous les scénarios de connexion).
- Pas de pagination côté serveur (renvoi de toutes les entités en une seule réponse).
- Pas de rate limiting sur les actions admin.
- Pas d'audit log structuré (qui a fait quoi, quand).
- Pas de deduplication / idempotence des commandes (double-spawn possible).

---

## 4. Dépendances

### 4.1 Backend

| Dépendance | Usage |
|---|---|
| `WorldService` | Nombre de joueurs connectés, téléportation |
| `AnimalsService` | Spawn, respawn, état des animaux |
| TypeORM repositories | CreatureTemplate, CreatureSpawn, Animal, Character, Resource, ResourceTemplate |
| Socket.IO server | `server.emit()` broadcast sur toutes les actions |
| `isoScreenToWorldWU()` | Conversion coordonnées écran → WU |

### 4.2 Frontend

| Dépendance | Usage |
|---|---|
| Socket.IO singleton (`window.game.socket`) | Tous les événements admin:* |
| JWT localStorage | Bearer token pour les requêtes HTTP |
| `window.__GLOBAL_ADMIN_STORE__` | Console active, historique, dernière position |
| Phaser camera | Conversion pixels écran → coords monde pour le drag |
| `commandRegistry.ts` | Partagé entre AdminPanel et ActionPanel |

---

## 5. Possibilités d'extension

### 5.1 Extension du registre de commandes

`commandRegistry.ts` est conçu pour être étendu : ajouter une entrée dans le
dictionnaire `COMMANDS` suffit. Pas de refactoring nécessaire.

### 5.2 Ajout de sections dans AdminPanel

Le composant utilise deux types de configuration (`SectionConfig`,
`GroupedSectionConfig`) déclaratifs. Ajouter un domaine (spawns, users, scripts)
ne nécessite que la déclaration d'un nouvel objet de config, sans modifier la
logique de rendu.

### 5.3 Overlay Phaser

La scène `WorldScene` est accessible depuis `window.game`. Un module overlay
peut injecter des graphics Phaser (rectangles, cercles, textes de debug) sans
modifier `WorldScene` elle-même, à condition de s'y attacher après sa création.

### 5.4 Nouveau gateway

La segmentation est propre : ajouter un `AdminMapGateway` ou `AdminDebugGateway`
séparé sans toucher `AdminGateway` est réalisable. Le module NestJS accepte
plusieurs gateways.

### 5.5 Vue minimap

Phaser supporte les caméras multiples dans une même scène. Une caméra de vue
d'ensemble (zoom out, viewport dédié dans l'UI admin) peut être ajoutée sans
scene supplémentaire.

---

## 6. Architecture cible

L'objectif est de transformer l'outil d'admin en un **framework de développement
interne**, analogue à un éditeur de niveau léger intégré dans le jeu.

### 6.1 Principe de découpage

```
Admin Tool
├── Core                  (existant — à stabiliser)
│   ├── Gateway + auth
│   ├── Service + repos
│   ├── Command system
│   └── Store + Panel
│
├── Entities              (extension — spawns, users, scripts)
│   ├── Creature spawns
│   ├── Respawn points
│   └── Users / comptes
│
├── Map Editor            (nouveau)
│   ├── Tile placement
│   ├── Décor / props
│   └── Collision editor
│
├── Overlay Debug         (nouveau)
│   ├── Chunks
│   ├── Collisions
│   ├── Aggro zones
│   ├── Respawn zones
│   ├── Pathfinding
│   └── IA states (FSM)
│
├── Monitoring            (nouveau)
│   ├── Activity timeline
│   ├── Audit log
│   └── WebSocket events
│
└── Gameplay Tools        (futur)
    ├── Simulation
    ├── Scripting
    └── IA editor
```

### 6.2 Couches frontend

```
AdminPanel.tsx (container)
├── Onglets de navigation (Entités / Map / Debug / Monitoring)
├── Modules par onglet (composants indépendants)
│   ├── EntitiesTab       (refactor du panneau actuel)
│   ├── MapEditorTab      (nouveau)
│   ├── DebugOverlayTab   (nouveau — contrôle des overlays Phaser)
│   └── MonitoringTab     (nouveau)
└── CommandConsole        (existant — partageable entre onglets)
```

### 6.3 Couches backend

```
admin.module.ts           (existant — à étendre)
admin.gateway.ts          (existant — ajouter événements debug/map)
admin.service.ts          (existant — ajouter queries spawns/users)
admin.controller.ts       (existant — ajouter routes spawns/users)
admin-debug.service.ts    (nouveau — snapshots IA, pathfinding, chunks)
admin-map.service.ts      (nouveau — edition tilemap, décor)
```

---

## 7. Modules indépendants — découpage

| Module | Dépendances existantes | Nouvelles dépendances | Priorité |
|---|---|---|---|
| **M1 — Spawns éditables** | AdminService, CreatureSpawn repo | Aucune | Haute |
| **M2 — Auth WebSocket** | AdminGateway | JwtService dans AdminGateway | Haute |
| **M3 — Pagination serveur** | AdminController | Aucune | Haute |
| **M4 — Overlay chunks** | WorldScene (Phaser) | Module overlay Phaser | Moyenne |
| **M5 — Overlay collisions** | collisionGrid WorldScene | Module overlay Phaser | Moyenne |
| **M6 — Overlay aggro/respawn** | AnimalsService, RespawnPoint repo | Admin debug endpoint | Moyenne |
| **M7 — Overlay pathfinding** | pathfinder WorldScene | Module overlay Phaser | Moyenne |
| **M8 — Overlay IA states** | AnimalsService (in-memory state) | Flux WebSocket debug | Basse |
| **M9 — Audit log** | AdminGateway | Table `admin_log` ou logger structuré | Basse |
| **M10 — Gestion users** | User repo, UserRole | Nouvel endpoint + section UI | Basse |
| **M11 — Map editor** | Tilemap Phaser, asset pipeline | Éditeur de tiles Phaser | Basse |
| **M12 — Gameplay tools** | AnimalsService, WorldService | Simulation engine | Très basse |

---

## 8. Ordre recommandé d'implémentation

### Phase A — Stabilisation core (prérequis à tout le reste)

1. **M2 — Auth WebSocket admin** : `AdminGateway` doit valider le JWT
   indépendamment, ne plus dépendre de `client.data.role` seul. Bloquant pour
   la sécurité en développement partagé.

2. **M3 — Pagination serveur** : les endpoints `/admin/animals`, `/admin/resources`,
   `/admin/characters` doivent accepter `?page=&limit=` et renvoyer un total.
   Bloquant dès que les datasets grossissent.

3. **M1 — Spawns éditables** : créer, déplacer, supprimer des `CreatureSpawn` et
   des `RespawnPoint` depuis le panneau. Fonctionnalité attendue d'un outil de
   level design.

### Phase B — Overlays debug (valeur immédiate pour le développement)

4. **M4 — Overlay chunks** : toggle on/off une grille de chunks 64×64 tiles sur
   la scène Phaser, visible depuis l'onglet Debug.

5. **M5 — Overlay collisions** : toggle on/off une heatmap de la grille de
   collision (`collisionGrid`).

6. **M6 — Overlay zones d'aggro et de respawn** : dessiner des cercles/ellipses
   autour des spawns, avec rayon = `aggroRadius` et `radius` du `RespawnPoint`.

7. **M7 — Overlay pathfinding** : visualiser les nœuds du pathfinder et les
   chemins calculés en temps réel.

### Phase C — Monitoring

8. **M8 — Overlay états IA** : afficher l'état FSM (`alive/fighting/escaping/dead`)
   de chaque animal sur le sprite, configurable depuis l'onglet Debug.

9. **M9 — Audit log** : enregistrer chaque action admin (événement, payload,
   résultat, timestamp, userId) dans un log consultable dans l'onglet Monitoring.

### Phase D — Extension entités et map

10. **M10 — Gestion users** : liste des comptes, promotion/rétrogradation de rôle,
    désactivation.

11. **M11 — Map editor** : placement de tiles et d'objets de décor depuis l'onglet
    Map, avec export TMJ.

### Phase E — Outils gameplay (moyen terme)

12. **M12 — Gameplay tools** : simulation d'actions, éditeur de scripts de
    comportement IA, injection d'événements de test.

---

## 9. Règles d'implémentation à respecter

- Ne jamais modifier un module stable pour en ajouter un nouveau si une
  extension additive est possible.
- Chaque module doit avoir son propre fichier de spec NestJS ou son propre
  test de rendu React.
- Les overlays Phaser doivent être toggleables indépendamment (chacun son
  flag dans un store dédié ou dans `admin.store.ts`).
- Les données de debug (états IA, chemins pathfinder) ne doivent pas être
  envoyées en broadcast à tous les clients : réserver à un canal admin distinct
  ou à une émission ciblée (`socket.emit` plutôt que `server.emit`).
- Les nouveaux endpoints HTTP admin héritent du guard existant (`@Roles(ADMIN)`
  sur le controller) sans exception.
- Les nouveaux événements WebSocket admin vérifient `client.data.role` en
  première ligne, comme les handlers existants.
