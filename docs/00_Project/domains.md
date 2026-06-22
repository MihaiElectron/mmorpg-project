# Domaines du projet

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/README.md, docs/ROADMAP.md, docs/10_AI/project-philosophy.md, docs/00_Project/glossary.md
- Used by: Project owner, developers, Claude Code, Claude, ChatGPT, Codex, tout agent IA travaillant sur ce projet

## Scope

Ce document décrit le découpage fonctionnel permanent du MMORPG.

Il ne décrit pas l'implémentation. Il ne cite pas les technologies. Il décrit
les responsabilités de chaque domaine, leurs dépendances et leurs frontières.

Il sert de carte mentale du projet : avant toute session de développement,
identifier le domaine concerné permet de savoir quels documents lire et quelles
règles respecter.

---

## 1. Vision globale

Le projet est structuré en deux produits parallèles :

- **MMORPG Runtime** : le jeu jouable — serveur, monde, entités, gameplay,
  réseau, persistance. C'est la source de vérité unique.
- **MMORPG Studio** : la plateforme interne de développement et d'opération —
  DevTools, LiveOps, Monitoring, Automation, Validation, Analytics, SDK.
  Voir `docs/07_Admin/mmorpg-studio.md`.

Les neuf domaines ci-dessous appartiennent au **Runtime**. Le Studio est
transversal à tous sans en implémenter les mécaniques.

```
MMORPG Runtime
│
├── World          — espace du monde, coordonnées, cartes, chunks, terrain
├── Entities       — objets du monde (joueurs, animaux, ressources, PNJ…)
├── Gameplay       — mécaniques (combat, récolte, progression, respawn, loot)
├── Identity       — comptes, sessions, rôles, permissions
├── Networking     — transport temps réel, synchronisation, protocole
├── Persistence    — stockage durable, schéma, migrations
├── Assets         — ressources visuelles et sonores, pipeline graphique
├── DevTools (*)   — composant Studio : inspection, visualisation, debug
└── Infrastructure — environnement d'exécution, déploiement, services locaux

(*) DevTools est un composant du MMORPG Studio, pas un domaine Runtime.
    Il est listé ici pour la correspondance code → domaine (section 15).
```

**MMORPG Studio est transversal.** Il observe et interagit avec tous les
domaines Runtime sans en implémenter les mécaniques. Ses composants
(DevTools, LiveOps, Monitoring…) lisent les états et déclenchent des actions
via les APIs Runtime existantes.

**Identity est transversal.** Il fournit l'identité et les droits à tous les
domaines sans en gérer les règles métier.

---

## 2. Domaine World

### Objectif

Définir et gérer l'espace dans lequel le jeu se déroule.

### Responsabilités

- Hiérarchie spatiale : Monde → Carte → Chunk → Tuile.
- Système de coordonnées : définition des unités, formules de projection,
  constantes de référence.
- Terrain : types de surface, walkabilité, biomes.
- Génération et chargement des cartes.
- Streaming de chunks selon la position des joueurs.
- Gestion des collisions de terrain côté serveur.

### Dépendances

- **Identity** : savoir quel joueur est sur quelle carte.
- **Networking** : diffuser les données de carte aux clients.
- **Persistence** : stocker les cartes et leur contenu.

### Ce qui n'appartient pas à ce domaine

- Le comportement des entités qui habitent le monde (→ Entities).
- Les règles de combat ou de récolte (→ Gameplay).
- Le rendu visuel du terrain (→ Assets).

### Documents associés

- `docs/08_Gameplay/world-model.md`
- `docs/05_World/maps-and-collisions.md`
- `docs/05_World/chunks.md`
- `docs/05_World/tiled.md`

### ADR concernés

- ADR-0001 (Accepted) — World Coordinate System
- ADR-0003 (Proposed) — Movement Authority

### État actuel

| Fonctionnalité | État |
|---|---|
| Système de coordonnées WU | **Implémenté** |
| Tilemap isométrique de test | **Implémenté** (partiel — tilemap unique) |
| Collision côté client | **Implémenté** (partiel — non autoritatif) |
| Collision côté serveur | **Futur** |
| Chunk streaming | **Futur** |
| Multi-cartes | **Futur** |
| Génération procédurale | **Futur** |

---

## 3. Domaine Entities

### Objectif

Définir et gérer tous les objets qui existent dans le monde : joueurs, animaux,
ressources, PNJ, bâtiments, effets.

### Responsabilités

- Définition du modèle d'entité : identité, position, état, cycle de vie.
- Typage des entités : joueur, animal, ressource, PNJ, bâtiment, effet.
- Templates d'entités : définitions réutilisables pour les créatures et
  ressources (stats, comportements par défaut).
- Points de spawn et de respawn.
- Positionnement dans le système WU.

### Dépendances

- **World** : toute entité existe dans une carte, à une position WU.
- **Persistence** : les entités sont stockées en base de données.
- **Identity** : certaines entités appartiennent à un joueur identifié.

### Ce qui n'appartient pas à ce domaine

- Les règles de combat ou de récolte (→ Gameplay).
- Le transport réseau des états d'entités (→ Networking).
- Le rendu visuel des sprites (→ Assets).

### Documents associés

- `docs/08_Gameplay/world-object-model.md` (modèle racine commun Runtime/Studio)
- `docs/08_Gameplay/entity-model.md`
- `docs/00_Project/glossary.md` (section Gameplay terms)

### ADR concernés

- ADR-0001 (Accepted) — World Coordinate System
- ADR-0002 (Proposed) — Entity Positioning

### État actuel

| Type d'entité | État |
|---|---|
| Joueur (Character) | **Implémenté** |
| Animal | **Implémenté** |
| Ressource | **Implémenté** |
| Template créature | **Implémenté** |
| Template ressource | **Implémenté** |
| Spawn point | **Implémenté** |
| Respawn point | **Implémenté** |
| PNJ | **Futur** |
| Bâtiment | **Futur** |
| Effet (zone, buff) | **Futur** |

---

## 4. Domaine Gameplay

### Objectif

Définir et implémenter les règles qui régissent l'interaction entre les entités
dans le monde.

### Responsabilités

- Combat : résolution des dégâts, états (vivant, mort), cooldowns.
- Récolte : conditions d'interaction, timer serveur, loot, épuisement.
- Respawn : joueur (point le plus proche), animal (spawn d'origine).
- Loot : génération de récompenses selon le type d'entité.
- Progression : expérience, niveaux, statistiques.
- Inventaire : stockage, équipement, limites, transferts.
- Comportements IA : patrouille, aggro, fuite, leash.

### Dépendances

- **World** : les règles de portée s'appuient sur les coordonnées WU.
- **Entities** : le gameplay s'applique à des entités spécifiques.
- **Identity** : les actions sont attribuées à un joueur identifié.
- **Networking** : les résultats des actions sont diffusés aux clients.
- **Persistence** : les résultats durables sont sauvegardés.

### Ce qui n'appartient pas à ce domaine

- Le système de coordonnées (→ World).
- Le transport des payloads (→ Networking).
- Le rendu des effets visuels (→ Assets).
- L'authentification du joueur (→ Identity).

### Documents associés

- `docs/08_Gameplay/movement-model.md`
- `docs/08_Gameplay/movement-authority-audit.md`
- `docs/01_Architecture/client-server-boundaries.md`
- `docs/02_Security/client-server-trust.md`

### ADR concernés

- ADR-0003 (Proposed) — Movement Authority

### État actuel

| Mécanique | État |
|---|---|
| Combat joueur/animal | **Implémenté** (partiel — formule basique) |
| Récolte (gathering) | **Implémenté** |
| Respawn joueur | **Implémenté** |
| Respawn animal | **Implémenté** |
| Loot ressource | **Implémenté** (partiel — table hardcodée) |
| Loot animal | **Futur** |
| Progression (exp, niveaux) | **Futur** |
| Calcul de stats d'équipement | **Futur** (stub existant) |
| Quêtes | **Futur** |
| Métiers / skills | **Futur** |
| Crafting | **Futur** |

---

## 5. Domaine Identity

### Objectif

Gérer les comptes, l'authentification, les sessions et les droits d'accès.

### Responsabilités

- Comptes joueurs : création, authentification, cycle de vie.
- Sessions : émission de tokens, validation, durée de vie.
- Rôles : joueur, administrateur, (futur : modérateur, etc.).
- Permissions : contrôle des actions selon le rôle.
- Personnages : association compte → personnage(s).

### Dépendances

- **Persistence** : les comptes et personnages sont stockés.
- **Networking** : les tokens voyagent dans les handshakes WebSocket et les
  headers HTTP.

### Ce qui n'appartient pas à ce domaine

- Les règles de gameplay liées au personnage (→ Gameplay).
- Le contenu du monde (→ World, Entities).
- La transmission réseau des données de jeu (→ Networking).

### Documents associés

- `docs/02_Security/authentication-jwt.md`
- `docs/02_Security/admin-permissions.md`
- `docs/02_Security/client-server-trust.md`

### ADR concernés

Aucun ADR dédié à ce jour.

### État actuel

| Fonctionnalité | État |
|---|---|
| Inscription / connexion | **Implémenté** |
| JWT (HTTP + WebSocket) | **Implémenté** |
| Rôle PLAYER / ADMIN | **Implémenté** |
| Gestion des comptes (admin) | **Futur** |
| Refresh token / invalidation | **Futur** |
| Protection brute-force | **Futur** |
| Guildes / groupes | **Futur** |

---

## 6. Domaine Networking

### Objectif

Transporter l'état du serveur vers les clients et les intentions des clients
vers le serveur, de manière fiable et efficace.

### Responsabilités

- Protocole temps réel : définition des événements WebSocket et de leurs
  payloads.
- Synchronisation : diffusion des mises à jour de position, d'état et de loot.
- Gestion des connexions : connexion, déconnexion, authentification initiale.
- Interest management : limiter la portée des broadcasts selon la zone.
- Prédiction et réconciliation client.
- Throttling et protection contre les abus.

### Dépendances

- **Identity** : la connexion WebSocket est authentifiée par token.
- **World** : les payloads de position utilisent le système WU.
- **Gameplay** : les résultats des mécaniques sont transportés vers les clients.

### Ce qui n'appartient pas à ce domaine

- Les règles métier déclenchées par un événement (→ Gameplay).
- Le stockage permanent (→ Persistence).
- Le rendu côté client (→ Assets).

**Le Networking ne décide jamais des règles métier.** Une gateway reçoit,
valide et délègue au service concerné.

### Documents associés

- `docs/01_Architecture/realtime-socketio.md`
- `docs/04_Server/websockets.md`

### ADR concernés

- ADR-0001 (Accepted) — format des payloads de position
- ADR-0002 (Proposed) — contrat de payload WebSocket
- ADR-0003 (Proposed) — validation serveur des mouvements

### État actuel

| Fonctionnalité | État |
|---|---|
| WebSocket joueur (join, move, disconnect) | **Implémenté** |
| WebSocket animaux (attack, list) | **Implémenté** |
| WebSocket ressources (gather, stop) | **Implémenté** |
| WebSocket admin (11 événements) | **Implémenté** |
| Broadcast global (server.emit) | **Implémenté** |
| Rooms par zone / chunk | **Futur** |
| Interest management | **Futur** |
| Prédiction + réconciliation | **Futur** |
| Rate limiting WebSocket | **Futur** |

---

## 7. Domaine Persistence

### Objectif

Stocker durablement tous les états qui doivent survivre à un redémarrage du
serveur.

### Responsabilités

- Schéma de base de données : tables, colonnes, relations, contraintes.
- Migrations : évolution du schéma sans perte de données.
- Seeding : initialisation des données de référence (templates, spawns).
- Transactions : garantir la cohérence des opérations multi-entités.
- Stratégie de cache : données en mémoire vs base de données.

### Dépendances

Tous les domaines écrivent ou lisent de la persistance. La Persistence ne
dépend d'aucun autre domaine — elle expose seulement du stockage.

### Ce qui n'appartient pas à ce domaine

- La logique métier qui décide quoi persister (→ domaine concerné).
- La diffusion des changements persistés (→ Networking).

### Documents associés

- `docs/06_Database/schema.md`
- `docs/06_Database/migrations.md`
- `docs/06_Database/postgresql.md`
- `docs/04_Server/typeorm.md`

### ADR concernés

- ADR-0001 (Accepted) — type de colonne pour les coordonnées WU

### État actuel

| Fonctionnalité | État |
|---|---|
| PostgreSQL local (Docker) | **Implémenté** |
| TypeORM avec synchronize:true | **Implémenté** (partiel — dev uniquement) |
| Entités principales | **Implémenté** |
| Seeding templates et spawns | **Implémenté** |
| Migrations TypeORM | **Futur** |
| Cache Redis | **Futur** (service configuré, non utilisé) |
| Persistance état IA (timers) | **Futur** |

---

## 8. Domaine Assets

### Objectif

Produire et gérer toutes les ressources visuelles et sonores du jeu : sprites,
tilesets, animations, effets.

### Responsabilités

- Pipeline de création : du concept au fichier runtime (IA → GIMP → Tiled → Phaser).
- Tilesets et cartes : authoring dans Tiled, export en TMJ.
- Sprites : personnages, animaux, ressources, UI.
- Animations : états visuels des entités.
- Direction artistique : cohérence visuelle du projet.

### Dépendances

- **World** : les tilesets couvrent l'espace défini par le système de cartes.
- **Entities** : chaque type d'entité a un sprite associé.

### Ce qui n'appartient pas à ce domaine

- Les règles de collision ou de walkabilité (→ World). Un tileset définit
  l'apparence, pas l'autorité sur les règles du terrain.
- Le rendu dans le moteur de jeu (→ implémentation Phaser, pas ce domaine).

### Documents associés

- `docs/05_World/assets.md`
- `docs/05_World/tiled.md`
- `apps/client/src/assets/source/art-direction.md`

### ADR concernés

Les décisions sur le format TMJ et le pipeline IA → GIMP → Tiled → Phaser
sont des décisions figées dans ROADMAP.md.

### État actuel

| Fonctionnalité | État |
|---|---|
| Pipeline graphique (IA→GIMP→Tiled→Phaser) | **Implémenté** |
| Tileset herbe (1 tuile) | **Implémenté** |
| Sprite joueur (masculin, féminin) | **Implémenté** |
| Sprite turkey | **Implémenté** |
| Sprite goblin | **Partiel** (utilise texture turkey) |
| Animations sprites | **Futur** |
| Biomes et variété de terrain | **Futur** |
| Effets visuels (attaque, loot) | **Futur** |
| Sons | **Futur** |

---

## 9. Domaine DevTools (composant MMORPG Studio)

> Le DevTools est un composant du **MMORPG Studio**, non un domaine Runtime.
> Il est documenté ici pour la correspondance code → domaine (section 15).
> Vision complète : `docs/07_Admin/devtools-architecture.md`.
> Studio complet : `docs/07_Admin/mmorpg-studio.md`.

### Objectif

Fournir aux développeurs les outils d'inspection, de visualisation et de
modification nécessaires pour comprendre et contrôler l'état du monde à tout
moment.

### Responsabilités

- Visualisation des états serveur : positions, zones d'influence, états d'IA.
- Inspection des entités : valeurs précises, état interne.
- Modification contrôlée : spawn, téléportation, ajustement de stats,
  suppression d'entités.
- Monitoring : activité en temps réel, actions admin.
- Édition de la carte : placement de tuiles, décors, spawns.
- Gestion des entités de référence : templates de créatures et ressources.

### Dépendances

Le DevTools dépend de **tous les autres domaines** en lecture. Il peut écrire
dans World, Entities et Gameplay sous réserve des permissions Identity.

Il ne remplace aucun domaine et n'en implémente aucune mécanique.

### Ce qui n'appartient pas à ce domaine

- Les règles métier du jeu. Le DevTools les observe et les déclenche selon les
  permissions, mais ne les redéfinit pas.
- La logique de rendu du monde en dehors des overlays de debug.

### Documents associés

- `docs/07_Admin/mmorpg-studio.md`
- `docs/07_Admin/devtools-architecture.md`
- `docs/07_Admin/admin-tool.md`
- `docs/01_Architecture/admin-tool-roadmap.md`

### ADR concernés

Aucun ADR dédié à ce jour.

### État actuel

| Fonctionnalité | État |
|---|---|
| Dashboard temps réel | **Implémenté** |
| Console de commandes (6 commandes) | **Implémenté** |
| Gestion créatures (templates + instances) | **Implémenté** |
| Gestion ressources | **Implémenté** |
| Gestion personnages | **Implémenté** |
| Drag-and-drop vers la carte | **Implémenté** |
| Auth WebSocket admin indépendante | **Futur** |
| Pagination serveur | **Futur** |
| Spawns et respawn points éditables | **Futur** |
| Overlays debug (chunks, collisions, aggro, pathfinding, IA) | **Futur** |
| Audit log admin | **Futur** |
| Éditeur de carte | **Futur** |

---

## 10. Domaine Infrastructure

### Objectif

Fournir l'environnement d'exécution local et futur du projet : services,
configuration, déploiement.

### Responsabilités

- Services locaux : base de données, cache, broker de messages.
- Configuration d'environnement : variables, secrets, CORS.
- Build et packaging : compilation frontend et backend.
- CI/CD : automatisation des tests et déploiements.
- Observabilité : logs, métriques, healthchecks.

### Dépendances

L'Infrastructure est la couche de base. Tous les domaines s'exécutent sur elle.

### Ce qui n'appartient pas à ce domaine

- La logique métier ou les règles de jeu.
- L'organisation du code applicatif.

### Documents associés

- `docs/09_Workflow/development.md`
- `docs/06_Database/postgresql.md`

### ADR concernés

Aucun ADR dédié à ce jour.

### État actuel

| Fonctionnalité | État |
|---|---|
| Docker Compose (PostgreSQL) | **Implémenté** |
| Docker Compose (Redis, RabbitMQ) | **Configuré** (non utilisé applicativement) |
| Variables d'environnement | **Implémenté** |
| CI/CD | **Futur** |
| Migrations de production | **Futur** |
| Observabilité (logs structurés) | **Futur** |

---

## 11. Dépendances entre domaines

```
┌─────────────────────────────────────────────────────────────┐
│                       Infrastructure                         │
│          (exécute tous les autres domaines)                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                     │
          ▼                    ▼                     ▼
     Persistence          Identity               Assets
          │                    │
          │         ┌──────────┴──────────┐
          │         │                     │
          ▼         ▼                     │
        World    Networking               │
          │         │                     │
          ▼         │                     │
       Entities ◄───┘                     │
          │                               │
          ▼                               │
       Gameplay ◄─────────────────────────┘
                              (rendu des résultats)

DevTools
  ▲
  │ observe et interagit avec tous les domaines
  └── World, Entities, Gameplay, Identity, Networking, Persistence
```

**Lectures de ce schéma :**

- `Persistence` est la fondation de données : World, Entities, Gameplay et
  Identity y lisent et écrivent.
- `Identity` est transversal : Networking s'y réfère pour authentifier, Gameplay
  pour autoriser, DevTools pour les permissions.
- `Networking` transporte ce que Gameplay et Entities produisent.
- `Assets` est consommé par le rendu client — il n'a pas de dépendance vers
  Gameplay ou Networking.
- `DevTools` observe tous les domaines sans en être une dépendance.
- `Infrastructure` exécute tout sans connaître la logique métier.

---

## 12. Frontières

Les frontières définissent ce que chaque domaine ne fait pas. Les respecter
évite les couplages qui rendent le code difficile à maintenir.

| Frontière | Règle |
|---|---|
| Le client ne fait jamais autorité | Toute valeur envoyée par le client est une intention, pas un fait. Le serveur valide. |
| Le serveur ne dépend pas du rendu | Aucune logique serveur ne connaît Phaser, pixels ou coordonnées d'écran. |
| Le Gameplay ne connaît pas PostgreSQL | La logique métier délègue à la Persistence via des services — elle ne fait pas de SQL directement. |
| Le Networking ne décide pas des règles | Une gateway reçoit, valide le payload et délègue au service. Elle ne calcule pas de dégâts. |
| Le DevTools n'implémente pas les mécaniques | Il déclenche des actions via les mêmes API que le reste du jeu. Il n'a pas de logique de jeu propre. |
| Identity ne gère pas le gameplay | Le système d'auth fournit qui est connecté et son rôle. Il ne sait pas ce que ce joueur fait dans le monde. |
| Assets n'est pas autoritatif sur le terrain | Les propriétés visuelles d'un tile (walkabilité, etc.) ne sont pas des règles de jeu. La walkabilité vit dans World, côté serveur. |

---

## 13. Évolutions futures

Chaque système futur s'intègre naturellement dans les domaines existants.

| Système futur | Domaine principal | Extension |
|---|---|---|
| Quêtes | Gameplay | Nouveau type de mécanique, entité QuestDefinition en Persistence |
| Métiers / skills | Gameplay | Progression étendue, conditions sur les interactions |
| Crafting | Gameplay | Mécanique d'interaction, consommation d'inventaire |
| Économie | Gameplay | Nouveau sous-domaine (marché, prix, échanges) |
| Météo | World | État global de la carte, tick monde |
| Guildes | Identity | Groupe de comptes avec rôles internes |
| Housing | World + Entities | Entités bâtiment avec propriétaire, modification de carte |
| Événements dynamiques | Gameplay | Triggers conditionnels, scheduler |
| Scripting de comportements | Entities + DevTools | Éditeur de scripts IA |
| IA avancée | Entities | Extension des comportements des animaux et PNJ |
| Génération procédurale | World | Génération de terrain par chunk |
| Instanciation (donjons) | World + Networking | Maps temporaires par groupe |

Aucun de ces systèmes ne nécessite de modifier la structure des neuf domaines.
Ils en étendent les responsabilités.

---

## 14. Règles d'évolution

Quand une nouvelle fonctionnalité est conçue :

1. **Identifier le domaine principal.** Toute fonctionnalité appartient à un
   domaine principal. Si elle touche plusieurs domaines, le domaine où réside
   la règle métier est le principal.

2. **Éviter les responsabilités croisées.** Une mécanique qui emprunte la logique
   d'un autre domaine crée du couplage. Définir une interface claire entre
   les domaines concernés.

3. **Documenter les nouvelles dépendances.** Si un domaine doit en appeler un
   autre qu'il n'appelait pas avant, documenter pourquoi et si un ADR est
   nécessaire.

4. **Étendre l'existant avant de créer.** Un nouveau sous-type d'entité s'ajoute
   à Entities. Une nouvelle mécanique s'ajoute à Gameplay. Un nouvel overlay
   s'ajoute à DevTools.

5. **Mettre à jour ce document.** Toute nouvelle entité, mécanique ou outil
   doit apparaître dans l'état actuel du domaine concerné.

---

## 15. Utilisation par les agents IA

Avant toute implémentation, un agent doit :

1. **Identifier le domaine concerné** à partir de la tâche.
2. **Lire la documentation du domaine** (section "Documents associés" ci-dessus).
3. **Lire les ADR associés** pour ne pas contredire une décision figée.
4. **Vérifier les dépendances** : quels autres domaines sont touchés ?
5. **Lire le code concerné** dans les modules correspondants.
6. **Seulement ensuite** analyser et proposer un changement.

**Correspondance domaine → code** (à titre indicatif) :

| Domaine | Backend | Frontend |
|---|---|---|
| World | `world/` | `phaser/world/`, `WorldScene.js` |
| Entities | `animals/`, `resources/`, `characters/` | `phaser/core/WorldScene.js` (sprites) |
| Gameplay | `world/loot.service.ts`, `animals/`, `resources/` | `phaser/player/`, `ActionPanel` |
| Identity | `auth/`, `users/` | `api/auth.js`, `LoginPage` |
| Networking | `world/world.gateway.ts`, `animals/animals.gateway.ts`, `resources/resources.gateway.ts` | `phaser/network/socket.js`, `WorldPage.jsx` |
| Persistence | `**/*.entity.ts`, `**/*.service.ts` (repos) | (N/A) |
| DevTools | `admin/` | `components/AdminPanel/`, `phaser/admin/` |
| Assets | (N/A) | `public/assets/`, `src/assets/source/` |
| Infrastructure | `main.ts`, `app.module.ts` | `vite.config.js`, `phaser.config.js` |

Cette correspondance est indicative. Elle change avec l'évolution du code.
Le code reste la source de vérité.

---

## Non-goals

- Ce document ne décrit pas l'implémentation technique.
- Ce document ne cite pas les frameworks ou technologies.
- Ce document ne remplace pas les ADRs.
- Ce document ne remplace pas ROADMAP.md ni STATUS.md.
- Ce document ne documente pas les fonctionnalités en détail.
- Ce document ne liste pas la dette technique.

## Security notes

Le principe que le client ne fait jamais autorité est une frontière de sécurité,
pas seulement une convention d'architecture. Il s'applique à tous les domaines
sans exception.

Toute nouvelle mécanique qui traverse la frontière Networking → Gameplay doit
valider les données côté serveur.

## Performance notes

Ce document n'a pas d'impact runtime.

Les domaines les plus sensibles à la performance sont Networking (fréquence de
broadcast), Gameplay (boucles d'IA, ticks serveur) et World (streaming de
chunks). Toute évolution dans ces domaines doit considérer l'impact à l'échelle
MMORPG.

## Related files

- [Documentation Index](../README.md)
- [Glossary](glossary.md)
- [Project Philosophy](../10_AI/project-philosophy.md)
- [Project Audit](../01_Architecture/project-audit.md)
- [ROADMAP.md](../ROADMAP.md)
- [STATUS.md](../../STATUS.md)
- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Entity Positioning](../01_Architecture/adr/ADR-0002-entity-positioning.md)
- [ADR-0003 — Movement Authority](../01_Architecture/adr/ADR-0003-movement-authority.md)
- [Admin Tool Roadmap](../01_Architecture/admin-tool-roadmap.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)

## Open questions

- Faut-il un domaine "Social" séparé pour les guildes, le chat et les partys,
  ou ces systèmes s'intègrent-ils dans Identity et Gameplay ?
- Le sous-domaine Économie justifie-t-il un domaine autonome quand il sera
  implémenté ?
- Comment représenter les scripts de comportement IA : dans Entities ou dans
  un domaine Scripts dédié ?

## TODO

- [ ] Valider ce découpage avec le responsable du projet.
- [ ] Mettre à jour les tableaux "État actuel" au fil des sessions.
- [ ] Ajouter les ADR futurs quand ils touchent un domaine.
- [ ] Vérifier la cohérence avec glossary.md après chaque ajout de terme.
