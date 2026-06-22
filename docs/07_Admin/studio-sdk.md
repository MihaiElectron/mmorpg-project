# Studio SDK — Document fondateur

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-23
- Depends on: docs/08_Gameplay/world-object-model.md, docs/08_Gameplay/entity-architecture.md, docs/08_Gameplay/resource-architecture.md, docs/07_Admin/mmorpg-studio.md, docs/07_Admin/devtools-architecture.md, docs/10_AI/project-philosophy.md
- Used by: Project owner, developers, Claude Code, Claude, tout agent IA travaillant sur ce projet

## Scope

Ce document définit le **Studio SDK** en tant que couche de médiation autonome
entre le MMORPG Runtime et le MMORPG Studio.

Il est entièrement conceptuel : aucune interface TypeScript, aucune classe,
aucun DTO, aucune API technique. Il définit les responsabilités, les principes
et les rôles de chaque concept du SDK — ce qu'il est, pourquoi il existe, et
ce qu'il ne fait pas.

Il n'est pas une spécification d'implémentation. Il est la référence
architecturale que toute implémentation future devra respecter.

---

## 1. Pourquoi un Studio SDK

### Le problème du couplage direct

Sans médiateur, le Studio devrait connaître la structure interne du Runtime
pour en extraire des informations utiles. Il devrait savoir qu'un `Animal` a
un champ `health` dans une entité TypeORM, que les coordonnées sont en WU
depuis ADR-0001, que l'état IA est une FSM avec cinq états. Ce couplage crée
une dépendance fragile : chaque évolution interne du Runtime exige une mise à
jour dans le Studio.

De l'autre côté, le Runtime ne devrait pas savoir qu'un Studio existe. Le
Runtime calcule des règles de jeu. Il n'a pas à s'adapter à une interface
graphique de développement.

Le Studio SDK résout ce problème en étant le **seul objet que les deux
connaissent**.

```
Runtime  ──expose vers──►  Studio SDK  ──consomme par──►  Studio
```

Le Runtime expose ce qu'il autorise à travers le SDK. Le Studio consomme ce
que le SDK expose. Ni l'un ni l'autre ne se connaissent directement.

### Pourquoi le SDK n'est pas dans le Runtime

Si le SDK vivait dans le Runtime, le Studio deviendrait une dépendance du
Runtime. Or le Runtime doit pouvoir tourner sans aucune interface Studio — en
production, avec des milliers de joueurs, le Studio est souvent absent. Le
Runtime n'a pas à se soucier de lui.

### Pourquoi le SDK n'est pas dans le Studio

Si le SDK vivait dans le Studio, le Runtime ne saurait pas comment exposer ses
capacités de façon cohérente. Le Studio définirait alors ce que le Runtime doit
exposer — inversion de dépendance incorrecte. C'est le Runtime qui sait ce
qu'il peut montrer, pas le Studio.

### La position du SDK

Le SDK est un produit séparé, connu des deux. Il définit le contrat que le
Runtime s'engage à remplir et que le Studio peut consommer.

---

## 2. Position dans l'architecture

```
MMORPG
│
├── Runtime                 (calcule, décide, persiste)
│    │
│    └── expose des capacités via le SDK
│
├── Studio SDK              (adapte, expose, décrit)
│    │
│    ├── World Object Adapter
│    ├── Capability Providers
│    ├── Inspector Providers
│    ├── Overlay Providers
│    ├── Validation Providers
│    ├── Command Providers
│    └── Automation Providers
│
└── Studio                  (affiche, inspecte, édite, automatise, valide)
     │
     └── consomme les World Objects et les Providers du SDK
```

Le Runtime et le Studio ne se parlent qu'à travers le SDK. Le Runtime ne
contient pas de code Studio. Le Studio ne lit pas les structures internes du
Runtime.

Cette séparation est une propriété permanente de l'architecture. Elle ne se
négocie pas.

---

## 3. Responsabilités

### Le Runtime

Le Runtime calcule, décide et persiste.

- Il applique les règles du jeu : dégâts, distance, loot, respawn, validation
  d'interaction.
- Il décide du résultat de toute action — le client exprime une intention, le
  Runtime juge.
- Il persiste l'état du monde en base de données.
- Il notifie le SDK des changements d'état qui méritent d'être observés.
- Il n'a aucune connaissance du Studio, de ses composants, de son existence.

### Le Studio SDK

Le SDK adapte, expose et décrit.

- Il **adapte** les représentations Runtime en World Objects compréhensibles
  par le Studio.
- Il **expose** les capacités de chaque domaine Runtime à travers des
  Providers enregistrés.
- Il **décrit** ce qu'on peut faire avec chaque objet du monde — sans décider
  du résultat.
- Il ne calcule aucune règle de jeu.
- Il ne modifie pas le Runtime directement.
- Il ne maintient pas d'état de jeu — il transmet et traduit.

### Le Studio

Le Studio affiche, inspecte, édite, automatise et valide.

- Il **affiche** l'état du monde tel que le SDK le lui expose.
- Il **inspecte** les World Objects en déléguant à leurs Providers.
- Il **édite** en exprimant des intentions au Runtime via le SDK — il ne
  modifie jamais rien directement.
- Il **automatise** des opérations batch en passant par les APIs Runtime.
- Il **valide** en exécutant les règles définies par le Runtime via le SDK.
- Il ne contient pas de logique métier.
- Il ne connaît pas les types spécifiques du Runtime (Loup, Dead Tree, Turkey).
  Il ne connaît que les capacités que le SDK expose.

---

## 4. World Object Adapter

### Rôle

L'Adapter est le premier maillon de la chaîne SDK. Son rôle est de transformer
une représentation Runtime brute en un **World Object** au sens du WOM (voir
`world-object-model.md`).

La représentation Runtime peut être une entité base de données, un objet en
mémoire, un état sérialisé depuis un événement WebSocket. L'Adapter la normalise
en un objet que le Studio peut traiter de manière uniforme, quel que soit le
domaine d'origine.

### Ce que l'Adapter produit

L'Adapter produit un World Object avec :
- une **identité** : id stable, type, sous-type, mapId ;
- une **position** : coordonnées WU si applicable ;
- un **état** : LifeState, Lifecycle, états internes ;
- une liste de **capacités** : les interfaces comportementales que cet objet
  expose ;
- des **métadonnées** : label, description, icône, tags de debug.

### Ce que l'Adapter ne fait pas

L'Adapter ne calcule rien. Il ne décide pas si un loup est dangereux ou si
une resource est accessible. Il traduit une représentation en une autre.

Il ne modifie jamais la représentation Runtime source.

### Pourquoi l'Adapter est essentiel

Sans Adapter, le Studio devrait comprendre la structure de chaque entité
Runtime pour en extraire les informations utiles. Avec l'Adapter, le Studio
reçoit toujours un World Object de même forme — et les différences sont portées
par les capacités, pas par la structure de l'objet.

Ajouter un nouveau type d'entité Runtime = implémenter son Adapter.
Le Studio n'a rien à changer.

### Exemples de transformation

| Représentation Runtime | World Object produit par l'Adapter |
|---|---|
| `Resource { id, type: "dead_tree", worldX, worldY, state: "alive", remainingLoots: 3 }` | `{ kind: "entity", subtype: "resource", capabilities: ["transform", "harvestable", "loot", "respawn", "persistence"] }` |
| `Animal { id, name: "turkey", worldX, worldY, health: 45, maxHealth: 60, state: "patrolling" }` | `{ kind: "entity", subtype: "animal", capabilities: ["transform", "health", "combat", "navigation", "ai", "loot"] }` |
| `Character { id, name, worldX, worldY, health, inventory }` | `{ kind: "entity", subtype: "player", capabilities: ["transform", "health", "inventory", "navigation"] }` |

---

## 5. Capability Providers

### Principe

Une fois qu'un World Object est produit par l'Adapter, le Studio sait quelles
capacités il expose. Pour chaque capacité, un **Capability Provider** est
responsable de fournir les données et les actions associées.

Le Capability Provider est le lien entre une capacité abstraite et son contenu
concret. C'est lui qui sait que la capacité `harvestable` d'une Resource signifie
"il y a un nombre de charges restantes, un timer, une action de récolte".

### Découpage par domaine

Chaque domaine Runtime expose ses propres Capability Providers. Un Provider
appartient au domaine qui connaît les données correspondantes.

```
Domaine Resources
    │
    ├── Provider pour la capacité `harvestable`
    │     - données : charges restantes, charges max, timer de récolte
    │     - actions : déclencher une récolte, modifier les charges
    │
    ├── Provider pour la capacité `loot`
    │     - données : table de loot associée, probabilités
    │     - actions : déclencher un loot simulé (dev only)
    │
    ├── Provider pour la capacité `respawn`
    │     - données : timer de respawn, spawn point associé, état du timer
    │     - actions : forcer un respawn
    │
    ├── Provider pour la capacité `transform`
    │     - données : position WU, mapId
    │     - actions : déplacer la resource (si permis)
    │
    └── Provider pour la capacité `validation`
          - données : règles de cohérence de la resource
          - actions : déclencher une validation
```

```
Domaine Entities / Animals
    │
    ├── Provider pour `health`
    ├── Provider pour `combat`
    ├── Provider pour `ai`
    ├── Provider pour `navigation`
    └── Provider pour `loot`
```

### Propriété fondamentale

Le Studio ne choisit pas quel Provider appeler. Il reçoit la liste des
capacités du World Object, et pour chaque capacité, le Provider correspondant
est automatiquement sélectionné depuis le registre.

Le Studio ignore donc la nature de ce qu'il affiche. Il sait qu'il y a une
capacité `health`, et le Provider `health` s'occupe du reste.

---

## 6. Inspector Providers

### Le Studio ne connaît jamais Wolf

C'est la propriété structurante de l'Inspector. Le Studio ne sait pas ce
qu'est un Loup. Il ne sait pas ce qu'est un Dead Tree. Il ne sait pas ce
qu'est un Turkey.

Il sait qu'un World Object a des capacités. Et pour chaque capacité, un
Inspector Provider sait comment afficher les informations correspondantes.

```
Wolf sélectionné
    │
    │  L'Adapter produit : capabilities = [transform, health, combat, navigation, ai, loot]
    │
    ▼
Studio reçoit le World Object
    │
    ▼
Inspector cherche un Provider pour chaque capacité :
    ├── Provider[transform]   → affiche position WU, orientation
    ├── Provider[health]      → affiche PV actuels / max, seuil de fuite
    ├── Provider[combat]      → affiche attaque, défense, portée
    ├── Provider[navigation]  → affiche vitesse, état du pathfinder
    ├── Provider[ai]          → affiche état FSM, patrol radius, cible d'aggro
    └── Provider[loot]        → affiche table de loot, dernière récolte
```

Le panneau Inspector final est la composition de toutes ces sections. L'Inspector
ne connaît pas le Loup — il connaît six capacités et leurs providers.

### Avantage architectural

Ajouter un Draggon au Runtime — un type d'entité nouveau avec capacités
`transform`, `health`, `combat`, `ai`, `flight`, `loot` — ne demande qu'une
chose au Studio : un Inspector Provider pour la capacité `flight`. Les cinq
autres capacités sont déjà couvertes. Le Studio n'a pas été modifié pour
accueillir le Dragon.

### Construction de l'Inspector

L'Inspector est un assembleur. Il reçoit un World Object, itère sur ses
capacités, collecte les sections rendues par chaque Provider, et compose
l'affichage final.

Il n'a pas d'opinion sur l'ordre ou le contenu des sections. Il compose.

---

## 7. Overlay Providers

### Principe

Chaque domaine Runtime peut fournir des overlays — des couches visuelles
superposées à la scène de jeu qui permettent de visualiser une information
sans quitter le contexte de jeu.

Un **Overlay Provider** est un domaine qui dit au Studio : "si tu actives mon
overlay, voilà ce que tu vas voir sur la carte, et voilà comment je veux que
ce soit représenté."

### Le Studio agrège, les domaines définissent

Le Studio ne sait pas comment visualiser les zones de spawn des Resources ou
les rayons d'aggro des animaux. Il ne connaît pas ces concepts.

Ce sont les Overlay Providers de chaque domaine qui définissent quelles
informations méritent d'être visualisées, et dans quelle forme.

```
Domaine Resources
    │
    └── Overlay Provider
          ├── Overlay "Resource Spawn" — positions des Resources actives
          │     couleur selon LifeState (alive=vert, dead=rouge, inactive=gris)
          ├── Overlay "Respawn Radius" — zone de respawn de chaque Resource
          └── Overlay "Harvest Radius" — portée d'interaction valide

Domaine Animals
    │
    └── Overlay Provider
          ├── Overlay "Patrol Zones" — zone de patrouille des animaux
          ├── Overlay "Aggro Radius" — rayon de détection
          └── Overlay "Leash Radius" — rayon de laisse (retour au spawn)

Domaine World
    │
    └── Overlay Provider
          ├── Overlay "Chunk Grid" — grille 64×64 tiles
          ├── Overlay "Collision Map" — tiles non walkables
          └── Overlay "Spawn Points" — positions des CreatureSpawn et RespawnPoints
```

### Propriétés des overlays

Un overlay est indépendant des autres. Il peut être activé ou désactivé sans
affecter les autres overlays. Plusieurs overlays peuvent être superposés.

Un overlay ne modifie pas la scène — il s'y superpose. Il n'interfère pas avec
les interactions joueur. Il est purement informatif.

---

## 8. Validation Providers

### Principe

Chaque domaine Runtime expose ses **règles de validation** — les conditions qui
définissent si un World Object est dans un état cohérent et déployable.

Un **Validation Provider** est un domaine qui dit au Studio : "voici les règles
que mes World Objects doivent respecter, et comment les vérifier."

Le Studio déclenche les Validation Providers, agrège les résultats, et produit
un rapport. Il ne définit pas les règles — il les exécute.

### Découpage par domaine

```
Domaine Resources
    │
    └── Validation Provider
          ├── Règle : position dans les bounds de la map
          ├── Règle : template référencé existant
          ├── Règle : pas de superposition avec une autre Resource
          ├── Règle : quantité cohérente (0 ≤ remainingLoots ≤ max)
          └── Règle : Resource accessible (tiles adjacentes walkables)

Domaine Animals / Spawn Points
    │
    └── Validation Provider
          ├── Règle : CreatureSpawn dans une map valide
          ├── Règle : template de créature référencé existant
          └── Règle : rayon de spawn ne débordant pas hors map

Domaine World / Tiles
    │
    └── Validation Provider
          ├── Règle : ≥ N% tiles walkables par chunk
          └── Règle : aucun Spawn Point sur tile non walkable
```

### Résultat de la validation

La validation produit un rapport structuré avec un niveau de sévérité par
problème (critique, avertissement, info). Ce rapport appartient au Studio.
Les règles appartiennent aux Providers.

La validation est toujours non destructive — elle signale sans modifier.

---

## 9. Command Providers

### Principe

Chaque domaine Runtime peut exposer des **commandes** déclenchables depuis le
Studio. Un **Command Provider** est un domaine qui dit au Studio : "voici les
actions que je peux exécuter à la demande, avec leurs paramètres et leurs
prérequis."

Le Studio construit automatiquement la console à partir des commandes
enregistrées par les Providers. Il ne sait pas qu'il y a une commande `/spawn`
pour les Resources et une commande `/aggro` pour les animaux — il sait qu'il y
a un registre de commandes, et il l'affiche.

### Exemples

```
Domaine Resources
    │
    └── Command Provider
          ├── /spawn <template> <mapId> <worldX> <worldY>
          │     → crée une instance de Resource au point indiqué
          ├── /deplete <id>
          │     → épuise une Resource (remainingLoots = 0, state = dead)
          ├── /respawn <id>
          │     → force un respawn immédiat
          ├── /reset_zone <mapId> <areaId>
          │     → réinitialise toutes les Resources d'une zone
          └── /set_quantity <id> <n>
                → modifie les charges restantes d'une Resource

Domaine Animals
    │
    └── Command Provider
          ├── /spawn <template> <mapId> <worldX> <worldY>
          ├── /aggro <animalId> <targetId>
          │     → force l'aggro sur une cible
          ├── /respawn all
          │     → respawn immédiat de tous les animaux morts
          └── /sethp <animalId> <hp>

Domaine World / Characters
    │
    └── Command Provider
          └── /tp <characterId> <worldX> <worldY>
```

### Propriétés des commandes

Une commande est définie par :
- un **nom** unique dans le registre global ;
- une liste de **paramètres** avec leur type et leur caractère obligatoire ;
- une **description** affichée dans la console et l'autocomplétion ;
- un **niveau de permission** minimum ;
- une **validation côté serveur** obligatoire lors de l'exécution.

La console du Studio utilise le registre pour construire l'autocomplétion, la
documentation et la validation des paramètres avant envoi. La validation finale
reste côté serveur.

---

## 10. Automation Providers

### Principe

Certaines opérations sur le monde ne sont pas des actions ponctuelles mais des
**opérations en lot** : spawner une grille de resources sur une zone, réinitialiser
l'état d'une map, valider tous les spawn points d'une région.

Un **Automation Provider** est un domaine qui expose ces opérations batch au
Studio. Il définit ce que l'opération fait, quels paramètres elle accepte, et
dans quelles conditions elle peut s'exécuter.

### Exemples

```
Domaine Resources
    │
    └── Automation Provider
          ├── Respawn zone
          │     Paramètres : mapId, bounds de la zone
          │     Effet : force le respawn de toutes les Resources mortes dans la zone
          │
          ├── Reset resources
          │     Paramètres : mapId
          │     Effet : réinitialise toutes les Resources à leur état initial (template)
          │
          ├── Seed zone
          │     Paramètres : mapId, bounds, template, densité
          │     Effet : spawne N resources du template dans la zone selon la densité
          │
          └── Dry run (toute automation)
                Effet : simule l'opération sans modifier le monde,
                produit un rapport des changements qui auraient été effectués

Domaine Animals / Spawns
    │
    └── Automation Provider
          ├── Validate spawn coherence
          │     Paramètres : mapId
          │     Effet : vérifie la cohérence de tous les CreatureSpawn de la map
          │
          └── Reset spawn timers
                Paramètres : mapId
                Effet : réinitialise tous les timers de respawn
```

### Règle fondamentale

Toute automation doit :
1. proposer un **dry run** qui montre ce qui sera fait sans le faire ;
2. demander une **confirmation explicite** avant de modifier quoi que ce soit ;
3. passer par les **APIs Runtime** — jamais directement en base de données ;
4. produire un **rapport de résultat** avec ce qui a réussi et ce qui a échoué.

Une automation qui ne peut pas être annulée ou simulée ne devrait pas exister.

---

## 11. Découverte des Providers

### Principe

Le Studio ne connaît pas à l'avance la liste des Providers disponibles. Il les
découvre.

Chaque domaine Runtime qui veut s'intégrer au Studio **enregistre** ses
Providers dans un registre central géré par le SDK. Le Studio interroge ce
registre pour savoir ce qu'il peut afficher, quelles commandes il peut proposer,
quels overlays sont disponibles.

```
Au démarrage :
    Domaine Resources enregistre ses Providers
    Domaine Animals enregistre ses Providers
    Domaine World enregistre ses Providers
          │
          ▼
    Registre SDK (liste de tous les Providers disponibles)
          │
          ▼
    Studio interroge le registre
    Studio compose ses interfaces à partir des Providers découverts
```

### Ce que ce document ne définit pas

Le mécanisme technique de découverte — comment un Provider s'enregistre
concrètement, quelle interface il implémente, où vit le registre dans le code —
n'est pas défini ici. Ce sont des décisions d'implémentation.

Ce document définit uniquement le **principe** : les Providers sont enregistrés
par les domaines, découverts par le Studio, et le SDK est le médiateur.

---

## 12. Flux global

```
Runtime (domaine Resources)
    │
    │  notifie : resource_update { id, state, remainingLoots, worldX, worldY }
    │
    ▼
World Object Adapter
    │
    │  produit : WorldObject { kind: "entity", subtype: "resource",
    │                          capabilities: ["transform", "harvestable",
    │                                         "loot", "respawn", "persistence"] }
    │
    ▼
Registre des Providers (SDK)
    │
    │  pour chaque capacité → Provider correspondant
    │
    ├── transform   → Resource Transform Provider
    ├── harvestable → Resource Harvest Provider
    ├── loot        → Resource Loot Provider
    ├── respawn     → Resource Respawn Provider
    └── persistence → Persistence Provider (transversal)
    │
    ▼
Studio
    │
    ├── Inspector  → compose les sections depuis les Inspector Providers
    ├── Overlays   → active les Overlay Providers enregistrés
    ├── Console    → construit l'autocomplétion depuis les Command Providers
    ├── Validation → agrège les résultats des Validation Providers
    └── Automation → expose les opérations batch des Automation Providers
```

Ce flux ne contient pas de logique métier. L'Adapter traduit. Les Providers
décrivent. Le Studio compose. Le Runtime décide.

---

## 13. Non-goals

Le SDK ne contient pas de logique métier. Il ne calcule pas de dégâts, ne
valide pas des distances, ne décide pas si une récolte est autorisée. Ces
responsabilités appartiennent au Runtime.

Le SDK ne modifie pas directement le Runtime. Toute modification du monde
passe par les APIs Runtime existantes. Le SDK peut déclencher une API — il
ne court-circuite jamais les validations du Runtime.

Le SDK ne connaît pas React. Il ne sait pas comment afficher une information
dans une interface. La présentation est la responsabilité du Studio.

Le SDK ne connaît pas Phaser. Il ne sait pas comment dessiner un overlay sur
une scène. La restitution visuelle est la responsabilité des composants
qui consomment les Overlay Providers.

Le SDK ne connaît pas NestJS. Il n'a pas d'opinion sur la façon dont le Runtime
est structuré. Il définit le contrat d'exposition, pas l'implémentation.

Le SDK ne définit pas les interfaces TypeScript des Providers. Ce document
décrit les responsabilités. La formalisation en types, interfaces et registres
est une décision d'implémentation future.

Le SDK ne gère pas l'authentification. Les vérifications de rôle restent dans
le Runtime (guards NestJS, vérifications WebSocket). Le SDK transmet les
permissions définies par le Runtime — il ne les calcule pas.

Le SDK ne persiste pas de données. Il n'a pas de base de données propre. Toute
donnée qu'il expose vient du Runtime.

---

## 14. Questions ouvertes

**Q1 — Où vit le registre des Providers dans la base de code ?**
Le registre est-il un package partagé dans le monorepo (un workspace `sdk` dédié),
un module dans le code Studio (qui importe les Providers des domaines), ou une
convention de nommage sans package formel ? Cette décision impacte l'organisation
du monorepo et les dépendances entre packages.

**Q2 — Comment un Provider est-il enregistré ?**
Le domaine Resources appelle-t-il `sdk.register(resourceHarvestProvider)` à
l'initialisation, ou le SDK découvre-t-il les Providers par convention
(nommage, décorateur, auto-import) ? Les deux ont des trade-offs différents
en termes de couplage et de verbosité.

**Q3 — Le SDK définit-il le protocole WebSocket ?**
Les événements WebSocket actuels (`resource_update`, `animal_update`,
`player_moved`) sont spécifiques à chaque domaine. Le SDK doit-il normaliser
ces événements vers un format `world_object_update` générique, ou maintenir
des événements spécialisés que les Adapters transforment à la réception ?

**Q4 — Comment versionner les capacités ?**
Si la capacité `harvestable` évolue (nouveau champ, comportement modifié),
comment le Studio et les Providers gèrent-ils la compatibilité ? Un numéro
de version par capacité ? Un mécanisme de négociation ? Cette question
n'est pas urgente mais conditionne la durabilité du SDK.

**Q5 — Un Provider peut-il couvrir plusieurs capacités ?**
Par simplicité de code, un Provider du domaine Resources pourrait couvrir
à la fois `harvestable` et `loot` — ces deux capacités sont souvent utilisées
ensemble. Ou faut-il imposer un Provider par capacité pour respecter le
principe de responsabilité unique ?

**Q6 — Les Providers sont-ils synchrones ou asynchrones ?**
Un Inspector Provider peut avoir besoin de charger des données supplémentaires
depuis le serveur pour afficher l'état complet d'un World Object. Le modèle
de Provider doit-il être synchrone (données déjà disponibles) ou asynchrone
(peut faire une requête) ? Cette décision conditionne l'architecture du
composant Inspector.

**Q7 — La frontière Adapter / Provider est-elle fixe ?**
L'Adapter produit les capacités d'un World Object. Mais qui décide de quelles
capacités sont présentes ? L'Adapter lit-il les données Runtime et en déduit
les capacités (`health` présent car `health > 0`), ou le template du domaine
définit-il statiquement les capacités de chaque sous-type ?

**Q8 — Comment le SDK cohabite-t-il avec le DevToolsBridge actuel ?**
`devtoolsBridge.ts` est le précurseur du SDK côté client. À terme, le Bridge
est-il absorbé par le SDK (le SDK expose ses propres accès à Phaser et au
socket), ou reste-t-il un composant DevTools distinct qui collabore avec le SDK ?

---

## Décisions implicites actées par ce document

**D1 — Trois produits, pas deux.**
Le SDK n'est pas un composant du Studio (comme décrit dans `mmorpg-studio.md §3.7`).
Il est un produit autonome au même niveau que Runtime et Studio. Cette élévation
est justifiée par le fait que les deux produits le connaissent, et qu'il ne peut
appartenir exclusivement à aucun des deux.

**D2 — Le Studio ignore les types spécifiques.**
Le Studio ne connaît jamais `Wolf`, `DeadTree`, `Turkey`. Il connaît des capacités
(`health`, `harvestable`, `loot`). Ce principe est non négociable. Tout composant
Studio qui teste `if (entity.type === "wolf")` viole cette règle.

**D3 — Le Runtime reste aveugle au Studio.**
Aucun code Runtime ne doit importer, référencer ou supposer l'existence du Studio.
Le Runtime expose via le SDK. Il ne sait pas que quelqu'un consomme.

**D4 — Chaque domaine possède ses Providers.**
Un Provider du domaine Resources n'est pas implémenté dans le Studio ou dans le
SDK générique. Il est implémenté dans (ou à côté de) le domaine Resources. Le SDK
fournit le contrat ; les domaines fournissent les implémentations.

**D5 — Toute automation est dry-runnable et confirmée.**
Ce principe est ancré dans le SDK. Aucune Automation ne peut contourner la
simulation préalable et la confirmation explicite.

---

## Fichiers associés

- [World Object Model](../08_Gameplay/world-object-model.md)
- [Entity Architecture](../08_Gameplay/entity-architecture.md)
- [Resource Architecture](../08_Gameplay/resource-architecture.md)
- [MMORPG Studio — Vision](mmorpg-studio.md)
- [DevTools — Architecture](devtools-architecture.md)
- [Project Philosophy](../10_AI/project-philosophy.md)
- [Domain Map](../00_Project/domains.md)
