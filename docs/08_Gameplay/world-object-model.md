# World Object Model (WOM)

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-24
- Depends on: docs/08_Gameplay/world-model.md, docs/08_Gameplay/entity-model.md, docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md, docs/07_Admin/mmorpg-studio.md
- Used by: Project owner, developers, Claude Code, Claude, tout agent IA travaillant sur ce projet

## Scope

Ce document définit le **World Object Model (WOM)**, le modèle conceptuel racine
commun au MMORPG Runtime et au MMORPG Studio.

Il ne décrit pas l'implémentation. Il ne définit pas le schéma de base de
données. Il ne définit pas les classes TypeORM. Il définit le contrat conceptuel
que tout objet du monde doit satisfaire pour être observable, sélectionnable,
inspectable et exploitable.

Il ne remplace pas `world-model.md` (hiérarchie spatiale) ni `entity-model.md`
(contrat des entités gameplay). Il les unifie sous un modèle commun plus large.

---

## 1. Objectif

Le MMORPG Runtime contient des objets de natures très différentes : des entités
qui se déplacent, des tiles qui définissent le terrain, des chunks qui structurent
la carte, des spawn points qui génèrent les entités, des triggers qui réagissent
aux conditions, des systèmes qui tournent sans représentation spatiale.

Le MMORPG Studio doit pouvoir inspecter, sélectionner et agir sur tous ces
objets sans connaître leur nature spécifique.

**Le Studio ne sait pas ce qu'est un Loup ou un Arbre Mort.** Il sait ce qu'est
un World Object et quelles capacités il expose.

Le WOM est le contrat qui rend cette abstraction possible. Il définit ce que
tout objet du monde doit exposer pour être traité de manière uniforme par le
Runtime et le Studio.

---

## 2. Définition

Un **World Object** est tout objet du monde observable, sélectionnable,
inspectable ou exploitable par le Runtime ou le Studio.

Un World Object n'est pas nécessairement visible dans la scène. Il n'est pas
nécessairement une entité gameplay. Il n'est pas nécessairement persisté en
base de données. Il peut être spatial ou non spatial, statique ou dynamique,
persistant ou éphémère.

Ce qui fait d'un objet un World Object, c'est qu'il :

- **existe dans le monde** au sens conceptuel (appartient à une Map, à un
  système du monde, ou au monde global) ;
- **a une identité** qui permet de le référencer de façon non ambiguë ;
- **expose un état** que le Runtime connaît et que le Studio peut observer ;
- **expose des capacités** qui définissent ce qu'on peut faire avec lui.

---

## 3. Catégories de World Objects

Les World Objects sont organisés en catégories. Une catégorie définit la nature
fondamentale d'un objet — ce qu'il est, pas ce qu'il fait.

### Entity

Un objet avec une identité, une position et un cycle de vie, qui participe
directement au gameplay.

Sous-types : Player, Animal, NPC, Resource, Building, Effect.

Référence complète : `docs/08_Gameplay/entity-model.md`.

Un Animal de type Loup est un World Object de catégorie Entity, sous-type Animal.
Sa nature spécifique (Loup) n'est pas visible du Studio — seulement ses capacités.

### Area

Une région spatiale nommée sur une Map, sans comportement gameplay propre.

Une Area délimite une zone fonctionnelle : zone de boss, zone PvP, zone safe,
zone d'aggro globale, zone de respawn de personnage. Elle a des bounds (limites
spatiales) mais pas nécessairement de logique interne — c'est le Runtime qui
réagit à la présence d'entités dans une Area.

### Tile

La plus petite unité logique du terrain. Toute position dans le monde correspond
à exactement un Tile.

Un Tile a un type de terrain (herbe, eau, pierre, chemin), une propriété de
walkabilité, et peut porter des propriétés gameplay (modificateur de vitesse,
zone de dégâts, trigger de spawn).

Référence : `docs/08_Gameplay/world-model.md`.

### Chunk

Une subdivision fixe d'une Map : exactement 64 × 64 Tiles (ADR-0001).

Un Chunk est l'unité de streaming et de gestion spatiale du serveur. Il n'a pas
de comportement gameplay propre — il organise l'espace et optimise la diffusion
des mises à jour.

Référence : `docs/08_Gameplay/world-model.md`.

### Trigger

Une condition spatiale ou temporelle qui déclenche un événement Runtime quand
elle est satisfaite.

Exemples : entrer dans une zone → déclenche une embuscade ; timer → déclenche
un événement mondial ; pousser un levier → déclenche l'ouverture d'une porte.

Un Trigger n'a pas nécessairement de représentation visuelle. Il peut être
ponctuel (un tile), surfacique (une Area), ou temporel (un scheduler).

### Spawn Point

Un lieu et un ensemble de règles qui définissent où et comment des entités
apparaissent dans le monde.

Un Spawn Point sait : quel template d'entité spawner, dans quelle zone spatiale,
avec quelles conditions de déclenchement, avec quel cooldown.

État actuel : `CreatureSpawn` et `RespawnPoint` sont implémentés comme entités
TypeORM. Ils ne satisfont pas encore le contrat WOM formellement.

### Portal

Un point de transition entre deux Maps, ou entre deux positions d'une même Map.

Un Portal a une position source, une destination (mapId + position WU), et
des conditions de franchissement (niveau requis, quête, etc.).

État actuel : non implémenté.

### Runtime System

Un processus ou un état du serveur sans représentation spatiale directe.

Exemples : moteur météo, scheduler d'événements mondiaux, calculateur
d'économie, gestionnaire de phases jour/nuit.

Un Runtime System est un World Object particulier : il appartient au monde
global (pas à une Map spécifique), n'a pas de position, mais a un état
observable et peut exposer des capacités (démarrer, arrêter, forcer un état).

### Weather Zone

Une région de la Map soumise à des conditions environnementales spécifiques
(pluie, brouillard, tempête).

Une Weather Zone peut affecter le gameplay (visibilité, vitesse, dégâts) et
l'apparence visuelle. Elle est distincte d'une Area : elle porte des propriétés
environnementales, pas des règles de gameplay pures.

État actuel : non implémenté.

### Catégories futures

D'autres catégories pourront être introduites sans modifier le WOM :

| Catégorie future | Description |
|---|---|
| Instanced Zone | Map temporaire créée pour un groupe de joueurs (donjon) |
| Script | Séquence de comportements déclenchables par le Runtime |
| Timeline | Séquence d'événements mondiaux planifiés |
| Decoration | Objet visuel non interactif posé dans la scène |

### Note d'implémentation — Crafting Stations

Les `CraftingStationTemplate` et `CraftingStation` sont des World Objects
persistés et administrables via WOM/AdminPanel.

`CraftingStationTemplate` est un World Object de définition :

- `kind: "definition"` ;
- `category: "crafting_station_template"` ;
- `position: null` ;
- `metadata.key`, `metadata.name`, `metadata.stationType`,
  `metadata.category`, `metadata.requiredSkillKey`,
  `metadata.interactionRadiusWU`, `metadata.enabled`.

`CraftingStation` est un World Object d'entité placée :

- `kind: "entity"` ;
- `category: "crafting_station"` ;
- `mapId` et `position.worldX/worldY` en WU ;
- `metadata.templateId`, `metadata.templateKey`, `metadata.name`,
  `metadata.stationType`, `metadata.interactionRadiusWU`,
  `metadata.templateEnabled`, `metadata.enabled`.

Les capabilities exposées sont :

- `crafting_station` ;
- `placement` ;
- `validation`.

Leur rôle runtime est la validation serveur des recettes de craft qui déclarent
un `stationType != "none"` : le serveur choisit une station compatible proche
du joueur en coordonnées WU, avec distance euclidienne WU et rayon
`interactionRadiusWU`.

Le rendu actuel dans `WorldScene` est un rendu debug simple avec label court et
couleur par `stationType`. Le toggle DevTools `Station Radius` affiche le rayon
d'interaction. Ces éléments sont visuels uniquement : ils ne sont ni des
collisions, ni des validations gameplay. Le runtime craft joueur est documenté
dans `docs/08_Gameplay/crafting-runtime.md`.

---

## 4. Contrat minimal d'un World Object

Tout World Object expose les champs suivants. Tous ne sont pas applicables à
toutes les catégories — dans ce cas, le champ est absent ou nul.

### identity

Un identifiant unique, stable, non réutilisable au sein du monde.

L'identité d'un World Object persiste tant qu'il existe. Elle ne change pas
avec son état. Elle ne dépend pas de sa position.

Format recommandé : `{ kind: "entity" | "area" | "tile" | "chunk" | "trigger" | "spawn" | "portal" | "system" | "weather", id: string | number }`.

### type

La catégorie du World Object (Entity, Area, Tile, Chunk…) et son sous-type
spécifique (Animal/Loup, Resource/DeadTree, Chunk/Grassland).

Le sous-type est une information de classification. Il ne définit pas le
comportement — les capacités s'en chargent.

### mapId

L'identifiant de la Map à laquelle appartient cet objet (ADR-0001).

Peut être absent pour les Runtime Systems qui appartiennent au monde global
plutôt qu'à une Map spécifique.

### position

La position dans le monde en World Units (WU), conformément à ADR-0001.

Format : `{ worldX: number, worldY: number }`.

Non applicable aux catégories sans position spatiale (certains Runtime Systems,
certains Triggers temporels).

### bounds

L'étendue spatiale de l'objet, si applicable.

Format minimal : `{ worldX: number, worldY: number, width: number, height: number }` en WU.

Pour un Tile ou un Chunk : dérivé automatiquement de la position et des constantes
du système de coordonnées (ADR-0001). Pour une Area, un Weather Zone, une
Instanced Zone : défini explicitement.

### state

L'état courant de l'objet.

Exemples : `alive`, `dead`, `inactive`, `loading`, `streaming`, `depleted`,
`respawning`, `open`, `closed`.

L'état est géré par le Runtime. Le Studio peut le lire. Il ne peut le modifier
que via les APIs Runtime, selon les permissions.

### metadata

Informations descriptives non fonctionnelles : label affiché, tags, description,
icône, couleur de debug.

Le metadata est utilisé par le Studio pour l'affichage dans l'Inspector, les
overlays et le Monitoring. Il n'a aucun impact sur le gameplay.

### capabilities

La liste des capacités que cet objet expose.

Voir §5. C'est la pièce centrale du WOM : elle définit ce que le Studio peut
faire avec l'objet sans connaître son type spécifique.

Format : liste d'identifiants de capacités, ex. `["transform", "health", "combat", "loot", "respawn"]`.

### authority

Qui détient la vérité sur cet objet et où elle vit.

Pour la quasi-totalité des World Objects : le serveur Runtime.

Pour certains objets temporaires ou purement client (overlays, sélections
Studio) : le client, mais ils ne sont pas de vrais World Objects.

### lifecycle

Comment l'objet apparaît, évolue et disparaît.

Exemples :
- Entity/Animal : spawné par un Spawn Point, vivant, combattant, mort, respawné.
- Resource : disponible, en cours de récolte, épuisée, en respawn.
- Chunk : non chargé, en cours de chargement, chargé, en cours de déchargement.
- Trigger : inactif, écoute, déclenché, cooldown.

---

## 5. Capacités

Une **capacité** est une interface comportementale qu'un World Object expose.

Le Studio inspecte les capacités, pas les types. L'Inspector ne sait pas ce
qu'est un Loup — il sait que cet objet a les capacités `transform`, `health`,
`combat`, `navigation`, `ai`, `loot`.

Les capacités sont additives et composables. Un objet peut en avoir une ou
plusieurs. Ajouter un nouveau type d'objet = définir ses capacités.

### Capacités définies

| Capacité | Description | Applicable à |
|---|---|---|
| `transform` | Position WU, orientation, échelle | Entity, Spawn Point, Portal, Area |
| `bounds` | Étendue spatiale rectangulaire ou polygonale | Area, Chunk, Tile, Weather Zone |
| `health` | Points de vie, max, seuils (fuite, mort) | Player, Animal, NPC, Building |
| `combat` | Inflige et reçoit des dégâts, a des stats de combat | Animal, Player, NPC |
| `inventory` | Contient des items | Player, NPC, Building |
| `loot` | Génère des récompenses à la mort ou à la récolte | Animal, Resource |
| `harvestable` | Peut être récolté, a un nombre de récoltes restantes | Resource |
| `navigation` | Peut se déplacer, utilise un pathfinder | Player, Animal, NPC |
| `ai` | A un comportement autonome (FSM, patrol, aggro, flee) | Animal, NPC |
| `dialogue` | Peut initier ou recevoir une conversation | NPC |
| `quest` | Porte une relation avec le système de quêtes | NPC, Trigger, Area |
| `spawn` | Génère d'autres World Objects selon des règles | Spawn Point |
| `respawn` | Peut réapparaître après mort ou épuisement | Animal, Resource, Player |
| `collision` | A une forme de collision qui bloque le mouvement | Entity, Tile, Building |
| `terrain` | Définit le type de surface et la walkabilité | Tile |
| `height` | Porte des données d'élévation | Tile |
| `streaming` | Chargé et déchargé selon la proximité | Chunk, Map |
| `persistence` | Survit à un redémarrage du serveur | Entity persistée, Spawn Point, Portal |
| `validation` | Expose des règles de validation vérifiables par le Studio | Tout World Object |
| `entities` | Contient ou référence d'autres World Objects | Chunk, Area |
| `environment` | Porte des effets environnementaux (météo) | Weather Zone |
| `crafting_station` | Station de craft utilisable par les recettes qui exigent un `stationType` | CraftingStationTemplate, CraftingStation |
| `placement` | Peut être placé ou déplacé dans une Map en coordonnées WU | CraftingStation, Resource, Spawn Point |

### Propriétés d'une capacité

Une capacité expose :
- **un état lisible** : les valeurs que le Studio peut afficher dans l'Inspector ;
- **des actions déclenchables** : ce que le Studio peut demander au Runtime de
  faire (selon les permissions) ;
- **des événements publiables** : les transitions que cette capacité peut
  signaler au Monitoring.

Le Studio ne décide jamais du résultat d'une action. Il demande au Runtime.
Le Runtime décide, valide, persiste.

---

## 6. Exemples de composition

### Resource : Dead Tree

Un arbre mort harvestable dans la forêt.

| Capacité | Contenu |
|---|---|
| `transform` | Position WU sur la carte courante |
| `harvestable` | Récoltes restantes : 3/3, état : disponible |
| `loot` | Table de loot : bois × 1-3 |
| `respawn` | Timer : 120 s, Spawn Point d'origine |
| `persistence` | Persisté en DB, survit au redémarrage |
| `validation` | Règle : position doit être sur tile walkable |

Le Studio inspecte cet objet sans savoir que c'est un "Dead Tree". Il voit un
objet avec `harvestable`, `loot`, `respawn`. L'Inspector affiche les sections
correspondantes à ces capacités.

### Entity : Wolf

Un loup en patrouille dans la forêt.

| Capacité | Contenu |
|---|---|
| `transform` | Position WU, orientation |
| `health` | 120/120 PV, seuil de fuite : 20% |
| `combat` | Attaque : 15, Armure : 5, Portée : 64 WU |
| `navigation` | Vitesse : 256 WU/s, pathfinder actif |
| `ai` | État FSM : patrolling, patrol radius : 2048 WU |
| `loot` | Table : peau × 1, viande × 1-2 |
| `persistence` | Persisté (position), volatile (état FSM) |
| `validation` | Règle : Spawn Point d'origine doit exister |

### Chunk

Un chunk de 64 × 64 tiles, actuellement chargé.

| Capacité | Contenu |
|---|---|
| `bounds` | worldX/Y min-max en WU, mapId |
| `streaming` | État : loaded, joueurs dans la zone : 2 |
| `collision` | Carte de walkabilité des 4096 tiles |
| `entities` | Liste des World Objects présents dans ce chunk |
| `validation` | Règle : ≥ 10% tiles walkables, aucun Spawn Point hors bounds |

### Tile

Un tile de terrain individuel.

| Capacité | Contenu |
|---|---|
| `transform` | Position WU précise (coin haut-gauche) |
| `bounds` | Étendue : 1024 × 1024 WU (1 tile = 1024 WU, ADR-0001) |
| `terrain` | Type : herbe, walkable : oui |
| `height` | Élévation : 0 (terrain plat) |
| `navigation` | Modificateur de vitesse : 1.0 |
| `validation` | Règle : si non walkable, aucune entité ne peut y spawner |

### Spawn Point : CreatureSpawn

Un point de spawn d'animaux.

| Capacité | Contenu |
|---|---|
| `transform` | Position WU du centre du spawn |
| `bounds` | Rayon : 512 WU (zone de spawn aléatoire) |
| `spawn` | Template : Loup, max actifs : 3, cooldown : 60 s |
| `persistence` | Persisté en DB |
| `validation` | Règle : position dans Map valide, template existant |

### CraftingStation : Forge

Une forge placée dans le monde et utilisable par les recettes `stationType:
"forge"`.

| Capacité | Contenu |
|---|---|
| `crafting_station` | stationType : `forge`, rayon : `interactionRadiusWU` |
| `placement` | `mapId`, `worldX`, `worldY` en WU |
| `validation` | Règle : template enabled, instance enabled, stationType compatible, distance serveur en WU |

Le Studio inspecte cet objet sans décider du résultat d'un craft. Le Runtime
reste responsable de la validation de proximité et du résultat de craft.

---

## 7. Relation Runtime / Studio

### Runtime

Le Runtime est la source de vérité unique sur tous les World Objects.

- Il crée, modifie et supprime les World Objects selon ses règles métier.
- Il applique les validations avant toute modification.
- Il notifie le Studio des changements d'état via des événements.
- Il n'expose que ce que le Studio est autorisé à voir selon le profil.
- Il refuse toute modification qui violerait ses règles internes.

### Studio

Le Studio observe, inspecte, édite selon les permissions, automatise et valide.

- Il ne possède aucun World Object. Il reçoit des représentations de leur état.
- Il ne calcule aucune règle métier. Il délègue toute action au Runtime.
- Il ne persiste jamais directement. Toute écriture passe par les APIs Runtime.
- Il peut afficher des objets locaux temporaires (overlays, sélection en cours)
  qui ne sont pas de vrais World Objects.

**Frontière critique :** une modification de `health` faite dans l'Inspector du
Studio est une requête au Runtime, pas une écriture directe. Le Runtime valide,
applique et confirme — ou rejette.

---

## 8. Sélection d'un World Object

La sélection est la façon dont le Studio pointe un World Object pour l'inspecter
ou agir sur lui.

Trois concepts distincts à ne pas confondre :

### Pointer (pointeur)

La position courante du curseur dans l'espace monde (WU). Éphémère, rafraîchi
à chaque mouvement. Ne désigne pas encore d'objet — c'est une position, pas
une sélection.

### Last click (dernier clic)

La position du dernier clic dans l'espace monde, stockée dans le
`DevToolsStore` sous quatre formes : screen, WU, tile, chunk (ADR-0001).

Le dernier clic est un indice temporaire. Il peut alimenter la sélection, mais
n'est pas une sélection lui-même.

État actuel : implémenté dans `devtools.store.ts`.

### Selection (sélection)

Un World Object explicitement et stablement choisi par l'utilisateur Studio.

La sélection est globale au Studio : toutes les zones (Inspector, Console,
overlays actifs) partagent la même sélection courante. Changer de sélection
met à jour l'Inspector et peut focaliser les overlays.

La sélection peut porter sur n'importe quelle catégorie de World Object : une
Entity, un Tile, un Chunk, un Spawn Point, une Area.

**Règle fondamentale :** sélectionner un World Object n'exécute aucune action.
C'est l'utilisateur qui décide de ce qu'il fait ensuite avec la sélection.

État actuel : sélection non implémentée en tant que système. Prévu en Phase C
du Studio.

---

## 9. Inspector universel

L'**Inspector** est le panneau du Studio qui affiche l'état d'un World Object
sélectionné.

Il y a un seul Inspector. Son contenu change selon la sélection.

### Fonctionnement

1. L'utilisateur sélectionne un World Object.
2. L'Inspector reçoit le descripteur du World Object (identity, type, capabilities).
3. Pour chaque capacité listée, l'Inspector recherche un **capability provider**
   enregistré pour cette capacité.
4. Chaque provider restitue la section UI correspondante à sa capacité.
5. L'Inspector compose le résultat final — une vue structurée, sans jamais
   connaître le type spécifique de l'objet.

### Avantage architectural

Ajouter un nouveau type d'entité (un dragon) = définir ses capacités.  
Ajouter une nouvelle capacité (voler) = implémenter un provider.  
L'Inspector ne change jamais pour accueillir un nouveau type.

État actuel : `CoordinateInspector` affiche le dernier clic (lecture seule).
Inspector universel avec délégation aux capability providers : non implémenté.

---

## 10. Validation

Chaque World Object peut exposer la capacité `validation`, qui définit les
règles de cohérence que le composant Validation du Studio peut vérifier.

### Règles de validation

Les règles sont définies par le Runtime (qui connaît les contraintes du monde).
Le Studio les exécute sans les inventer.

Exemples de règles par catégorie :

| Catégorie | Règle |
|---|---|
| Entity | Position sur tile walkable |
| Entity | Spawn Point d'origine doit exister et être actif |
| Spawn Point | Position dans une Map valide |
| Spawn Point | Template référencé existant et non supprimé |
| Spawn Point | Rayon de spawn ne débordant pas hors Map |
| Chunk | ≥ N% tiles walkables (seuil configurable) |
| Chunk | Aucun Spawn Point hors bounds du Chunk |
| Tile | Si non walkable : aucune entité ne peut y spawner |
| Area | Bounds dans Map valide |
| Area | Overlap avec une autre Area du même type < seuil |

### Résultat de validation

La validation produit un rapport, pas une modification. Elle classe les
problèmes par criticité :

- **Critique** : l'objet ne peut pas fonctionner (spawn sur tile bloquant).
- **Avertissement** : comportement dégradé probable (respawn trop loin).
- **Info** : anomalie non bloquante (entité sans metadata).

Aucune validation ne modifie le monde. Elle signale. C'est l'utilisateur qui
décide de corriger.

---

## 11. Non-goals

- Ce document ne définit pas le schéma SQL ni les colonnes de base de données.
- Ce document ne définit pas les classes TypeORM.
- Ce document ne définit pas le SDK technique (interfaces TypeScript, registres
  de providers) — c'est un travail de Phase C du Studio.
- Ce document ne remplace pas les ADRs.
- Ce document ne rend pas toutes les catégories implémentées.
- Ce document ne définit pas le protocole WebSocket de synchronisation WOM.
- Ce document n'est pas un backlog. Les priorités sont dans `ROADMAP.md`.

---

## 12. État actuel

| Concept WOM | État |
|---|---|
| Entity (Player, Animal, Resource) | **Implémenté** — sans contrat WOM formel |
| Tile (concept) | **Implémenté** — pas d'objet inspectable isolément |
| Chunk (concept) | **Implémenté** — pas d'objet inspectable isolément |
| Spawn Point (CreatureSpawn) | **Implémenté** — pas de capacités exposées |
| Respawn Point | **Implémenté** — pas de capacités exposées |
| CraftingStationTemplate | **Implémenté** — WOM/AdminPanel, capabilities `crafting_station`, `placement`, `validation` |
| CraftingStation | **Implémenté** — instance WU placée, rendu debug, ActionPanel runtime |
| Area | **Futur** |
| Trigger | **Futur** |
| Portal | **Futur** |
| Runtime System | **Futur** |
| Weather Zone | **Futur** |
| Contrat WOM (identity, capabilities…) | **Futur** — modèle conceptuel uniquement |
| Capability providers | **Futur** |
| Selection Manager | **Futur** (Phase C Studio) |
| Inspector universel | **Futur** (Phase C Studio) |
| Validation | **Futur** (Phase D Studio) |

---

## Security notes

Le Studio ne reçoit que les World Objects que le Runtime autorise à exposer
selon le profil de l'utilisateur. Un GM en production ne voit pas les internals
de debug d'une entité.

Toute action sur un World Object (modification d'état, spawn, suppression) passe
par les APIs Runtime avec vérification de rôle côté serveur. Le Studio ne peut
pas court-circuiter cette vérification.

## Performance notes

Un World Object est une abstraction conceptuelle, pas un objet en mémoire
systématiquement instancié. En production, le Runtime ne maintient pas une
liste de tous les World Objects — il maintient ses propres structures de données
optimisées (entités en mémoire, tiles en grille bitmap, chunks en map).

Le WOM est le contrat d'exposition que le Studio consomme, pas une structure
de données runtime.

## Related files

- [World Model](world-model.md)
- [Entity Model](entity-model.md)
- [MMORPG Studio — Vision](../07_Admin/mmorpg-studio.md)
- [DevTools — Architecture](../07_Admin/devtools-architecture.md)
- [Domain Map](../00_Project/domains.md)
- [Project Philosophy](../10_AI/project-philosophy.md)
- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Entity Positioning](../01_Architecture/adr/ADR-0002-entity-positioning.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)

## Open questions

- **Faut-il un ADR WOM ?** Le WOM est une décision d'architecture structurante.
  Un ADR serait justifié avant toute implémentation du SDK (Phase C).

- **Comment enregistrer les capability providers ?** Registry statique (import
  centralisé), auto-découverte (convention de nommage), ou enregistrement
  dynamique à l'initialisation du Studio ?

- **Comment synchroniser le WOM avec le réseau ?** Le protocole WebSocket
  actuel transporte des payloads spécifiques (character_moved, animal_update).
  Un événement `world_object_update` générique est-il pertinent, ou faut-il
  maintenir les événements spécialisés et les mapper côté Studio ?

- **Comment représenter les World Objects non persistants ?** Les entités
  éphémères (Effects, Triggers temporels) n'ont pas d'id base de données.
  Quel mécanisme d'identité pour ces objets ?

- **Comment gérer les objets composites ?** Un Building pourrait être composé
  de plusieurs Tiles. Un Portal pourrait être une Entity avec une Area liée.
  Le WOM doit-il définir des relations de composition parent/enfant ?

- **La capacité `validation` est-elle portée par le World Object lui-même
  ou par un registre externe ?** Si chaque objet porte ses règles, elles
  peuvent être trop couplées à la logique métier.

- **Les capacités doivent-elles être versionées ?** Si une capacité `health`
  évolue (nouveau champ), le Studio doit-il gérer plusieurs versions ?

## TODO

- [ ] Valider la liste des capacités avec le responsable du projet.
- [ ] Valider les catégories de World Objects (notamment Runtime System et la
  distinction Area / Weather Zone / Trigger).
- [ ] Décider si un ADR WOM est nécessaire avant la Phase C Studio.
- [ ] Aligner ce document avec ADR-0002 (Entity Positioning) quand il sera
  accepté.
- [ ] Documenter le protocole de synchronisation WOM quand il sera conçu.
