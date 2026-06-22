# Architecture des Entities

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/08_Gameplay/world-object-model.md, docs/08_Gameplay/entity-model.md, docs/08_Gameplay/world-model.md, docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md
- Used by: Project owner, developers, Claude Code, Claude, tout agent IA travaillant sur ce projet

## Scope

Ce document définit l'architecture conceptuelle d'une Entity dans le MMORPG Runtime.

Il est indépendant de toute implémentation : aucune base de données, aucune
classe, aucune API, aucun protocole réseau. Il définit ce qu'est une Entity,
comment elle vit, ce qu'elle expose, et comment le Runtime et le Studio
interagissent avec elle.

Il ne remplace pas `entity-model.md` (liste des types d'entités) ni
`world-object-model.md` (contrat WOM commun). Il approfondit l'architecture
interne d'une Entity en tant que World Object particulier.

---

## 1. Définition d'une Entity

Une **Entity** est un World Object qui participe activement au gameplay.

Participer activement signifie : l'Entity a une existence propre dans le monde,
elle peut agir, être la cible d'une action, changer d'état selon des règles
gameplay, et sa présence ou son absence a un effet sur le monde.

### Ce qui distingue une Entity des autres World Objects

**Un Tile n'est pas une Entity.**
Un Tile est une unité structurelle du terrain. Il définit une surface, une
walkabilité, un type de sol. Il ne participe pas au gameplay en tant qu'acteur
— il le contraint. Il ne change pas d'état selon des règles gameplay. Il n'a
pas de cycle de vie propre.

**Un Chunk n'est pas une Entity.**
Un Chunk est une subdivision spatiale de la Map. Son rôle est organisationnel :
il permet au Runtime de gérer l'espace efficacement. Il n'a pas d'identité
gameplay, pas de comportement, pas de cycle de vie au sens gameplay.

**Un Spawn Point n'est pas une Entity.**
Un Spawn Point est une règle de génération. Il définit où et quand des Entities
apparaissent. Il n'a pas de comportement propre, ne participe pas au gameplay
directement, et n'est pas la cible d'une action gameplay.

**Une Area n'est pas une Entity.**
Une Area est une région spatiale avec des propriétés. Elle réagit à la présence
d'Entities (un joueur entre dans une zone PvP), mais elle n'agit pas.

### La frontière : la règle canonique

**Un World Object est une Entity si et seulement si il peut changer d'état
selon des règles gameplay.**

```
Peut changer d'état ?
      │
      ├── Oui → Entity
      │
      └── Non → World Object d'un autre type (Tile, Chunk, Area, Spawn Point…)
```

Une porte peut être ouverte, fermée, verrouillée, détruite → Entity.  
Un tile est toujours herbe ou eau, walkable ou non — son type ne change pas
selon des règles gameplay → pas une Entity.  
Un Spawn Point génère des Entities mais ne change pas d'état lui-même → pas
une Entity.

### Application de la règle

| Concept | Peut changer d'état selon règles gameplay ? | Entity ? |
|---|---|---|
| Tile | Non — définit le terrain | Non |
| Chunk | Non — organise l'espace | Non |
| Area | Non — délimite une région | Non |
| Spawn Point | Non — génère des Entities | Non |
| Interaction Object | À définir (Trigger, Teleporter, Checkpoint…) | TBD |
| Animal | Oui — vivant, aggro, mort, respawn | Oui |
| Resource | Oui — disponible, épuisée, respawn | Oui |
| Player | Oui — connecté, déconnecté, mort | Oui |
| Building | Oui — intact, endommagé, détruit | Oui |
| Door | Oui — ouverte, fermée, verrouillée, détruite | Oui |
| NPC | Oui — vivant, mort, état de dialogue | Oui |
| Projectile | Oui — en vol, impact, expiré | Oui |
| Effect | Oui — actif, en fondu, disparu | Oui |
| Mount | Oui — libre, monté, à l'écurie | Oui |
| Vehicle | Oui — vide, chargé, détruit | Oui |

**Note sur l'Interaction Object :** La notion de "Trigger" est reconsidérée
vers un concept plus général — l'Interaction Object — qui couvrira Trigger,
Teleporter, Checkpoint, Quest Zone. Certains de ces types seront des Entities
(s'ils changent d'état), d'autres des Areas spécialisées. Cette décision est
reportée à la conception de ces systèmes.

---

## 2. Cycle de vie

Le cycle de vie d'une Entity est décrit par **deux dimensions orthogonales** :
le **LifeState** et le **Lifecycle**. Les confondre est la source d'ambiguïtés
classiques ("mort" ne signifie pas "supprimé").

### LifeState — la condition courante

Le LifeState décrit dans quel état fonctionnel se trouve l'Entity **pendant
qu'elle existe dans le monde**.

| LifeState | Signification |
|---|---|
| `alive` | Fonctionne normalement, participe pleinement au gameplay |
| `dead` | Mort ou épuisée — existe encore dans le monde, mais ne participe plus |
| `inactive` | Dormante — existe, mais temporairement hors gameplay (NPC nocturne, porte bloquée) |

Le LifeState est géré par le Runtime selon les règles gameplay. Il n'est pas
décidé par le client.

### Lifecycle — la phase d'existence

Le Lifecycle décrit si l'Entity **existe dans le monde** et quel est son état
d'existence.

```
Created
  │  (l'identité existe, l'Entity n'est pas encore dans le monde)
  ▼
Spawned → Active
  │        │
  │        │  (l'Entity existe dans le monde, LifeState varie)
  │        │
  │        ├── → Removed
  │        │      (absente temporairement, un respawn est prévu)
  │        │          │
  │        │          └── → Spawned → Active (nouvelle instance ou réapparition)
  │        │
  │        └── → Destroyed
  │               (n'existe plus définitivement)
  │
  └── → Destroyed (directement, sans passer par Active)
```

**Spawned / Active** — L'Entity est dans le monde. Son LifeState peut être
`alive`, `dead` ou `inactive`.

**Removed** — L'Entity a quitté le monde temporairement. Son LifeState est
`dead`. Un respawn est prévu. Elle peut réapparaître.

**Destroyed** — L'Entity n'existe plus du tout. Son identifiant est archivé.
Aucun respawn possible.

### La distinction clé

| Situation | LifeState | Lifecycle |
|---|---|---|
| Loup vivant en patrouille | alive | active |
| Arbre mort avec loot disponible | dead | active |
| Animal en attente de respawn | dead | removed |
| Player déconnecté | inactive | active |
| Projectile expiré | dead | destroyed |
| Bâtiment détruit définitivement | dead | destroyed |

Un **Arbre Mort** (Resource épuisée) a `LifeState=dead` mais `Lifecycle=active` :
il existe encore dans le monde, son loot peut être ramassé, son timer de respawn
tourne. Ce n'est pas la même chose qu'être Destroyed.

Un **Projectile expiré** a `Lifecycle=destroyed` : il n'existe plus du tout.
Pas de respawn, pas de loot, plus de présence dans le monde.

### Variations par type

| Type | LifeStates spécifiques | Lifecycle |
|---|---|---|
| Player | alive, dead, inactive (déconnecté, AFK) | active / removed (logout long) |
| Animal | alive (patrol/aggro/fleeing), dead | active / removed (respawn) |
| Resource | alive (available/harvesting), dead (depleted) | active / removed (respawn) |
| Building | alive (intact/damaged), dead (destroyed) | active / destroyed |
| Door | alive (open/closed/locked), dead (broken) | active / destroyed |
| Effect | alive (appearing/fading), dead | active / destroyed |
| Projectile | alive (in flight), dead (hit/missed) | active / destroyed |

Le modèle ne préjuge pas des transitions exactes. Chaque type définit ses
propres transitions valides entre LifeStates, et les conditions qui déclenchent
un Lifecycle Removed ou Destroyed.

---

## 3. Identité

L'identité d'une Entity est l'ensemble des attributs qui la rendent unique et
référençable dans le monde, indépendamment de son état ou de sa position.

### Identifiant

Un identifiant unique, stable, non réutilisable au sein du monde.

L'identifiant ne change pas quand l'Entity change d'état, se déplace, ou subit
une modification. Il reste valide jusqu'à ce que l'Entity soit Removed.

Deux Entities du même type dans le même monde ont toujours des identifiants
différents. Deux Entities sur des Maps différentes peuvent partager le même
identifiant de valeur — mais pas le même identifiant complet (qui inclut la Map).

### Type et sous-type

Le type classe l'Entity dans la hiérarchie du WOM : catégorie Entity, sous-type
Animal, Resource, Player, etc.

Le sous-type est une classification métier. Il ne définit pas le comportement —
les capacités le font.

### Template éventuel

Certaines Entities sont générées à partir d'un template qui définit leurs
propriétés de base (stats initiales, capacités, comportements par défaut, loot).

Un Loup est une instance du template "Wolf". Deux Loups différents ont des
identifiants différents, mais partagent le même template.

Le template est une description — pas une copie. Modifier le template peut
affecter les futures instances, pas les instances existantes (selon les règles
du Runtime).

Les Entities sans template (certains Players, certains Effets ponctuels) ont
leurs propriétés définies directement.

### Propriétaire éventuel

Certaines Entities ont un propriétaire : un Building appartient peut-être à un
Player, un Pet appartient à son maître, un Effet peut être lié à son lanceur.

La propriété définit des règles d'autorisation : qui peut modifier, détruire,
ou accéder à cette Entity.

La propriété est une relation, pas un état. Elle peut changer (transfert de
propriété, mort du propriétaire).

### Appartenance au monde

Toute Entity appartient à une Map. Elle ne peut pas exister en dehors d'une
Map. Si une Entity change de Map (téléportation, portail), elle conserve son
identité mais change d'appartenance.

---

## 4. Localisation

La localisation décrit où l'Entity existe dans le monde.

### Map (mapId)

L'identifiant de la Map à laquelle appartient l'Entity. Toujours présent.

### Position monde

La position en World Units (WU) selon ADR-0001.

Format : `{ worldX, worldY }`.

La position est la coordonnée de référence de l'Entity dans le monde logique.
Elle ne dépend pas de la résolution, du zoom, ou de la projection isométrique
du client.

Toutes les Entities actives ont une position. Certains états (Removed, Inactive
invisible) peuvent rendre la position non significative.

### Orientation éventuelle

L'orientation décrit la direction dans laquelle l'Entity fait face.

Toutes les Entities ne possèdent pas d'orientation. Un Arbre Mort n'a pas
d'orientation significative. Un Loup ou un Player en ont une — elle influe
sur leurs animations et parfois leur cone d'attaque.

Format minimal : un angle ou une direction discrète (N, NE, E, SE, S, SW, W, NW).

### Dimensions éventuelles

Certaines Entities occupent plus qu'un point dans l'espace : un Building
couvre plusieurs tiles, une Creature a un rayon de collision, un Effect a
une zone d'effet.

Les dimensions sont exprimées en WU. Elles complètent la position pour définir
l'emprise spatiale de l'Entity.

Toutes les Entities ne possèdent pas de dimensions explicites. Un Player ou
un Animal peuvent être modélisés comme un point avec un rayon de collision
implicite défini par leur template.

---

## 5. État

L'état d'une Entity est composé de plusieurs dimensions orthogonales. La
principale distinction est celle établie en §2 :

- **LifeState** — condition fonctionnelle (`alive`, `dead`, `inactive`).
- **Lifecycle** — phase d'existence dans le monde (`active`, `removed`, `destroyed`).

En plus de ces deux dimensions fondamentales, une Entity peut avoir d'autres
dimensions d'état propres à sa logique.

### Propriétés de l'état

**L'état est géré par le Runtime.** Le client peut en avoir une copie locale
pour le rendu, mais le Runtime est autoritatif.

**L'état change selon des transitions définies.** Passer de LifeState `alive` à
`dead` requiert une condition (HP ≤ 0). Passer de Lifecycle `active` à `removed`
requiert une règle (respawn prévu). Les transitions ne sont pas libres.

**Les dimensions d'état sont orthogonales.** Une Entity peut simultanément avoir
LifeState=dead (elle est morte), Lifecycle=active (elle est encore dans le monde),
et une dimension de mouvement=idle (elle ne se déplace plus). Ces dimensions ne
se bloquent pas mutuellement.

### Autres dimensions d'état

| Dimension | Valeurs possibles | Applicable à |
|---|---|---|
| Mouvement | idle, moving, blocked | Animal, Player, NPC |
| Combat | neutral, aggro, fighting, fleeing | Animal, NPC, Player |
| Interaction | available, busy, locked | Resource, Door, NPC |
| Charge | full, depleted | Resource |
| Structure | intact, damaged | Building |
| Connexion | connected, disconnected, afk | Player |
| Visibilité | visible, hidden, stealth | Player, NPC, Effect |

Cette liste n'est pas exhaustive. Chaque type d'Entity définit les dimensions
pertinentes pour lui. Les dimensions inapplicables à un type sont absentes —
elles ne valent pas `null`, elles n'existent simplement pas pour ce type.

---

## 6. Capacités

Les capacités décrivent ce qu'une Entity peut faire ou ce qu'elle possède.

Une capacité est une interface comportementale. Elle dit : "cette Entity peut
être ciblée pour une action de ce type". Elle ne dit pas comment l'action est
implémentée — c'est le comportement qui s'en charge.

### Rôle des capacités

Les capacités servent deux finalités distinctes :

**Pour le Runtime** : elles définissent quelles règles s'appliquent à cette
Entity. Une Entity avec `health` peut recevoir des dégâts. Sans `health`,
elle est immunisée aux dommages de combat.

**Pour le Studio** : elles définissent ce que l'Inspector peut afficher et
ce que les outils peuvent faire. L'Inspector d'une Entity avec `harvestable`
affiche les récoltes restantes. Sans cette capacité, la section n'apparaît
pas.

### Exemples de capacités

| Capacité | Ce qu'elle signifie pour une Entity |
|---|---|
| `transform` | A une position et éventuellement une orientation |
| `health` | A des points de vie, peut mourir |
| `combat` | Peut infliger et recevoir des dégâts de combat |
| `navigation` | Peut se déplacer dans le monde |
| `ai` | A un comportement autonome |
| `inventory` | Contient des items |
| `harvestable` | Peut être récoltée (interactions de récolte) |
| `loot` | Génère des récompenses à la mort ou à la récolte |
| `respawn` | Peut réapparaître après mort ou épuisement |
| `dialogue` | Peut initier ou répondre à une conversation |
| `quest` | Porte une relation avec le système de quêtes |
| `interactable` | Peut être la cible d'une interaction générique |
| `mountable` | Peut être utilisée comme monture |
| `carriable` | Peut être ramassée et transportée |
| `persistence` | Son état survit à un redémarrage du Runtime |

La liste des capacités n'est pas figée. Chaque nouveau système de gameplay
peut introduire une nouvelle capacité. L'existant n'est pas modifié.

---

## 7. Comportements

Un comportement est la logique qui décide quand et comment une capacité est
utilisée.

### Capacité vs comportement

La distinction est fondamentale :

```
Capacité  →  "cette Entity PEUT faire X"
Comportement →  "cette Entity DÉCIDE de faire X quand Y"
```

**Un Loup a la capacité `combat`** — il peut infliger et recevoir des dégâts.
**Son comportement IA décide quand attaquer** — quand un joueur entre dans son
rayon d'aggro, quand sa fuite échoue, quand sa cible est à portée.

**Un Player a la capacité `combat`** — identique à celle du Loup.
**Son comportement est dicté par le joueur** — via les inputs transmis au
Runtime. Ce n'est pas une IA qui décide, c'est l'intention du joueur.

**Un Arbre Mort a la capacité `harvestable`** — il peut être récolté.
**Il n'a aucun comportement propre** — la récolte est initiée par un Player,
pas par l'Arbre.

### Règle d'isolation des comportements IA

**Une IA ne lit jamais directement la base de données, le moteur de rendu,
ou les composants d'interface. Elle ne lit qu'une vue fournie par le Runtime.**

Ce n'est pas une recommandation — c'est une règle permanente du projet.

Concrètement, un comportement IA reçoit du Runtime :
- la liste des Entities dans son rayon de perception ;
- les propriétés des tiles proches (walkabilité, type) ;
- son propre état (LifeState, position, HP, cooldowns).

Il ne va jamais chercher ces données lui-même. Le Runtime les lui fournit
sous une forme adaptée. Ce découplage protège l'IA contre les changements
de base de données, de protocole réseau, ou de moteur de rendu.

### Types de comportements

| Source | Description | Exemples |
|---|---|---|
| IA autonome | Règles internes, FSM, planification | Patrouille, aggro, fuite d'un Animal |
| Input joueur | Intentions transmises par le client | Déplacement, attaque, interaction d'un Player |
| Règle passive | Réaction à un événement externe | Dégâts reçus, épuisement d'une Resource |
| Interaction Object | Déclenché par un système dédié | Ouverture d'une Door par un Trigger |
| Temps | Déclenché par un timer Runtime | Respawn d'une Resource après 120 s |

Un même type d'Entity peut avoir plusieurs comportements combinés. Un NPC
peut avoir une IA de patrouille, réagir aux inputs du joueur (dialogue), et
répondre à des Interaction Objects externes (ouvre une porte à une heure précise).

---

## 8. Événements

Les événements de vie sont les moments significatifs du cycle d'une Entity.
Ils marquent une transition d'état ou une interaction avec d'autres systèmes.

### Événements génériques

| Événement | Signification | Déclencheur |
|---|---|---|
| `spawn` | L'Entity apparaît dans le monde | Runtime (Spawn Point, commande) |
| `move` | L'Entity change de position | IA, input joueur, téléportation |
| `state_change` | L'état de l'Entity change | Règle gameplay, timer, interaction |
| `damage` | L'Entity reçoit des dégâts | Combat, zone de danger |
| `heal` | L'Entity récupère des points de vie | Soin, régénération |
| `interact` | Une autre Entity interagit avec elle | Joueur (récolte, dialogue, ouverture) |
| `loot` | L'Entity génère du loot | Mort, récolte complète |
| `death` | L'Entity meurt ou est épuisée | Dégâts fatals, récolte complète |
| `respawn` | L'Entity réapparaît après un cycle | Timer, règle de respawn |
| `destroy` | L'Entity est supprimée définitivement | Admin, règle gameplay |
| `enter_area` | L'Entity entre dans une Area | Mouvement |
| `leave_area` | L'Entity quitte une Area | Mouvement |
| `equip` | Un item est équipé | Inventory |
| `connect` | Un Player se connecte | Session réseau |
| `disconnect` | Un Player se déconnecte | Session réseau |

### Propriétés des événements

**Les événements sont produits par le Runtime.** Il est le seul à décider
qu'un événement a eu lieu. Un `death` n'est pas déclaré par le client — il
est calculé par le Runtime quand les HP atteignent 0.

**Les événements peuvent être consommés par plusieurs systèmes.** Un `death`
est consommé par : le système de loot (génère le drop), le système de respawn
(planifie le retour), le système réseau (diffuse la mort aux clients), le
Studio Monitoring (journalise l'événement).

**Les événements ne sont pas nécessairement persistés.** Un `move` est émis
des dizaines de fois par seconde — il n'est pas stocké. Un `death` peut l'être
(audit, statistiques). La persistance dépend du type d'événement et du besoin.

---

## 9. Autorité

Pour chaque aspect d'une Entity, un seul acteur détient l'autorité : la source
de vérité dont les autres se synchronisent.

### Autorité par aspect

| Aspect | Autorité | Rôle du client | Rôle du Studio |
|---|---|---|---|
| Identité | **Serveur Runtime** | Réception, affichage | Lecture |
| Position | **Serveur Runtime** | Prédiction locale, correction serveur | Lecture, demande de modification |
| État vital | **Serveur Runtime** | Affichage de la copie locale | Lecture, demande de modification via API |
| Transitions d'état | **Serveur Runtime** | Aucune autorité | Peut déclencher via API admin |
| Rendu visuel | **Client** | Décide de l'animation, de l'effet | Peut injecter des overlays de debug |
| Input joueur | **Client** (intention) | Envoie l'intention | Peut simuler une intention via Studio |
| Comportement IA | **Serveur Runtime** | Reçoit le résultat | Peut observer l'état FSM |
| Données de session | **Serveur Runtime** | Cache local | Lecture via API |

### Règle centrale

**Le client exprime des intentions. Le Runtime décide des résultats.**

Un Player clique pour attaquer → le client envoie une intention d'attaque →
le Runtime valide la portée, calcule les dégâts, met à jour les HP, émet
l'événement `damage` → le client reçoit le résultat et l'affiche.

Le client ne décide jamais des dégâts, de la mort, du loot, ni de la position
finale après collision.

### Rôle du Studio

Le Studio observe sans interférer avec le gameplay. Quand il agit (modifier les
HP d'un animal, forcer un respawn), il passe par les mêmes APIs que le jeu
normal. Le Runtime applique les mêmes validations.

Le Studio n'a pas d'accès privilégié au modèle interne des Entities. Il reçoit
une représentation exposée par le Runtime.

---

## 10. Visibilité Studio

Le Studio peut interagir avec une Entity de cinq manières, selon les permissions
du profil actif.

### Observer

Recevoir les mises à jour d'état d'une Entity en temps réel via le Monitoring.

Exemples : un Animal passe de `patrolling` à `aggro` → le Monitoring l'enregistre.
La position d'un Player change → le Monitoring peut l'afficher sur un overlay.

Aucune permission spéciale requise pour observer. C'est la capacité de base du Studio.

### Inspecter

Sélectionner une Entity et afficher l'état détaillé de ses capacités dans
l'Inspector.

Exemples : HP courant et max, liste des items en inventaire, état FSM courant,
cooldown de respawn, template d'origine.

L'Inspector ne modifie rien. Il lit l'état exposé par le Runtime.

### Modifier selon permissions

Envoyer une requête de modification au Runtime. Le Runtime valide et applique
ou rejette.

Exemples : forcer les HP à 100%, changer l'état d'une Door (Open → Closed),
mettre un Animal en état `fleeing`, modifier les récoltes restantes d'une
Resource.

Le Studio ne peut modifier que ce que le Runtime autorise selon le profil.
Un GM peut corriger un état corrompu. Un Developer peut forcer n'importe quel
état en développement. Un Player n'a aucun accès.

### Valider

Vérifier que l'Entity satisfait les règles de cohérence définies par le Runtime.

Exemples : l'Entity est-elle sur un tile walkable ? Son Spawn Point d'origine
existe-t-il encore ? Ses stats sont-elles dans les plages définies par le template ?

La validation produit un rapport. Elle ne modifie pas l'Entity.

### Automatiser

Déclencher des opérations en batch sur un ensemble d'Entities.

Exemples : repositionner tous les Spawn Points d'une zone, régénérer les HP de
toutes les Entities d'un chunk, supprimer toutes les Entities d'un type dans
une Area.

L'automatisation demande toujours une confirmation avant d'agir. Elle passe par
les mêmes APIs que les modifications manuelles.

**Le Studio n'applique jamais directement la logique métier.** Il ne calcule
pas les dégâts, ne génère pas de loot, ne valide pas les règles de gameplay.
Il délègue au Runtime.

---

## 11. Composition

Une Entity est un World Object composé de plusieurs concepts orthogonaux. Chaque
concept peut exister indépendamment des autres.

```
Entity
├── Identity        — qui elle est (id, type, template, propriétaire, mapId)
├── Localization    — où elle est (position WU, orientation, dimensions)
├── State           — dans quel état elle est (vital, mouvement, interaction…)
├── Capabilities    — ce qu'elle peut faire (transform, health, combat, loot…)
├── Behaviors       — pourquoi elle agit (IA, input joueur, règle passive, timer)
└── Events          — ce qui lui arrive (spawn, move, damage, death, respawn…)
```

Ces six concepts sont complémentaires, pas hiérarchiques. Une Entity peut :
- avoir une Identité sans Localisation (état Created, avant placement) ;
- avoir des Capabilities sans Behaviors (une Resource harvestable sans IA) ;
- produire des Events sans Behaviors propres (une Resource produit `loot` quand
  un Player la récolte).

### Entities composites

Les Entities peuvent être organisées en hiérarchies parent/enfant. C'est un
modèle inévitable dès que le monde devient riche.

```
Castle (Building)
  ├── Wall (Building)
  ├── Door (Entity)
  ├── Chest (Entity)
  └── Guard (NPC)
```

Chaque Entity de la hiérarchie conserve son identité propre, son LifeState
et son Lifecycle indépendants. La relation parent/enfant ajoute des règles :
détruire le Castle peut forcer la destruction de ses composants ; les Entities
enfants héritent éventuellement de la localisation du parent.

**Le Studio doit pouvoir naviguer dans cette hiérarchie** : sélectionner un
Castle et inspecter ses Entities enfants, ou sélectionner directement une Door
indépendamment du Castle.

Le modèle exact de composition (capacité `container`, relation explicite en DB,
graph d'Entities) sera défini lors de la conception du premier type composite.
Ce document valide le concept — pas l'implémentation.

---

## 12. Exemples

Quatre Entities comparées par leurs différences conceptuelles, sans référence
à l'implémentation.

### Dead Tree (Arbre Mort)

Une ressource statique harvestable.

| Concept | Description |
|---|---|
| Identity | Id unique, type Resource, template "dead_tree", pas de propriétaire |
| Localization | Position WU fixe, pas d'orientation, dimensions implicites |
| LifeState | alive (available / being harvested) → dead (depleted) |
| Lifecycle | active (pendant l'existence) → removed (en attente de respawn) → active (réapparition) |
| Capabilities | `transform`, `harvestable`, `loot`, `respawn`, `persistence` |
| Behaviors | Aucun comportement autonome — réagit à l'interaction joueur |
| Events | `spawn`, `interact` (récolte), `loot`, `depleted`, `respawn` |

L'Arbre Mort n'agit pas. Il attend. Quand il est épuisé : LifeState=dead,
Lifecycle=active — il existe encore dans le monde (son loot est ramassable,
son timer tourne). Ce n'est pas la même chose qu'être Destroyed.

### Wolf (Loup)

Un animal avec une IA autonome de combat.

| Concept | Description |
|---|---|
| Identity | Id unique, type Animal, template "wolf", pas de propriétaire |
| Localization | Position WU dynamique, orientation (direction de déplacement) |
| LifeState | alive (patrol / aggro / fighting / fleeing) → dead |
| Lifecycle | active → removed (respawn prévu) → active (réapparition) |
| Capabilities | `transform`, `health`, `combat`, `navigation`, `ai`, `loot`, `respawn` |
| Behaviors | IA autonome — ne lit qu'une vue Runtime de son environnement |
| Events | `spawn`, `move`, `state_change`, `damage`, `death`, `loot`, `respawn` |

Le Loup prend des décisions. Son IA lit l'état du monde et choisit ses actions.
Ce n'est pas la capacité `combat` qui décide d'attaquer — c'est le comportement IA.

### Player (Joueur)

Une entité contrôlée par un humain, avec persistance de session.

| Concept | Description |
|---|---|
| Identity | Id unique, type Player, pas de template, propriétaire = lui-même |
| Localization | Position WU dynamique, orientation, dimensions de collision |
| State | connected / disconnected / moving / idle / attacking / harvesting / dead |
| Capabilities | `transform`, `health`, `combat`, `navigation`, `inventory`, `loot` (récolte), `persistence` |
| Behaviors | Dicté par les inputs du joueur humain, transmis au Runtime comme intentions |
| Events | `connect`, `disconnect`, `spawn`, `move`, `damage`, `death`, `respawn`, `interact`, `equip` |

Le Player est unique : son comportement vient d'un humain, pas d'une IA. Mais
du point de vue du Runtime, il expose les mêmes capacités qu'un autre acteur
de combat — la différence est dans la source des intentions.

### Door (Porte)

Une entité interactive sans comportement autonome.

| Concept | Description |
|---|---|
| Identity | Id unique, type Building (ou sous-type Door), template éventuel, propriétaire éventuel |
| Localization | Position WU fixe, orientation (direction de l'ouverture), dimensions |
| State | closed / open / locked / broken |
| Capabilities | `transform`, `interactable`, `collision` (variable selon état) |
| Behaviors | Réagit à un input joueur (interagir), à un Trigger (ouverture automatique), à un état (verrouillée si condition) |
| Events | `state_change` (closed→open, open→closed), `interact`, `destroy` |

La Door n'a pas de `health` standard (sauf si elle peut être détruite). Elle
n'a pas de `navigation`. Elle change d'état uniquement en réponse à d'autres
systèmes. Son état `collision` varie selon qu'elle est ouverte ou fermée.

---

## 13. Non-goals

- Ce document ne définit pas le schéma de base de données des Entities.
- Ce document ne définit pas les classes ou interfaces TypeScript.
- Ce document ne définit pas les DTO ou les payloads réseau.
- Ce document ne définit pas les composants client de rendu.
- Ce document ne définit pas le SDK Studio pour les Entities.
- Ce document ne liste pas toutes les propriétés de chaque type d'Entity.
- Ce document ne remplace pas les ADRs pour les décisions techniques.
- Ce document ne définit pas les règles de gameplay spécifiques à chaque type.

---

## 14. Décisions actées et questions ouvertes

### Décisions actées

**D1 — Règle canonique Entity :** un World Object est une Entity si et seulement
si il peut changer d'état selon des règles gameplay. Voir §1.

**D2 — LifeState vs Lifecycle :** le cycle de vie est modélisé par deux
dimensions orthogonales. `dead` ne signifie pas `destroyed`. Voir §2.

**D3 — Isolation des comportements IA :** une IA ne lit jamais directement la
base de données, le moteur de rendu ou les composants d'interface. Elle ne lit
qu'une vue fournie par le Runtime. Voir §7.

**D4 — Entities composites validées :** la hiérarchie parent/enfant entre
Entities est inévitable. Le Studio doit pouvoir naviguer dans cette hiérarchie.
Le modèle d'implémentation (capacité `container`, graph) est reporté. Voir §11.

**D5 — ADR-0004 Entity Architecture :** l'ADR sera créé après la conception
d'un premier type complet (Resource). Si le modèle tient naturellement, alors
on fige l'ADR. L'ADR ne précède pas la preuve.

**D6 — Interaction Object :** la notion de "Trigger" est remplacée par le
concept plus général d'"Interaction Object" (Trigger, Teleporter, Checkpoint,
Quest Zone). La classification Entity ou Area spécialisée sera décidée lors
de la conception de chaque sous-type.

### Questions encore ouvertes

**Q1 — Entities multi-tiles :**
Un Building peut couvrir plusieurs tiles. Le modèle de localisation actuel
(position + dimensions) est-il suffisant, ou faut-il une liste explicite de
tiles occupés ? À trancher lors de la conception de Building.

**Q2 — Entity sur plusieurs Maps simultanément :**
`entity-model.md` pose cette question. Un portail à cheval sur deux Maps, une
entité en transition — comment gérer ce cas ? À trancher lors de la conception
des Portals.

**Q3 — Propriété d'une Entity :**
Un Player construit un Building — il en est propriétaire. Si le Player est
supprimé, le Building perd-il son propriétaire ou est-il détruit ? La règle
varie selon le type, mais le contrat de base doit anticiper ce cas.

**Q4 — Identifiants des Entities éphémères :**
Un Projectile ou un Effect existe quelques secondes. Un identifiant persistant
est-il nécessaire, ou un identifiant de session suffit-il ?

---

## État actuel

| Concept | État |
|---|---|
| Entity (Player, Animal, Resource) | **Implémenté** — sans contrat formel |
| Cycle de vie Animal | **Implémenté** (partiel — états FSM en mémoire) |
| Cycle de vie Resource | **Implémenté** (partiel — timer respawn) |
| Cycle de vie Player | **Implémenté** (partiel — connect/disconnect/dead) |
| Template CreatureTemplate | **Implémenté** |
| Template ResourceTemplate | **Implémenté** |
| Capacités formelles | **Futur** — implicites dans le code |
| Behaviors (IA) | **Implémenté** (partiel — FSM Animal) |
| Events formels | **Futur** — implicites dans les événements Socket.IO |
| Door, Building, Portal | **Futur** |
| Projectile, Mount, Vehicle | **Futur** |
| Contrat WOM appliqué aux Entities | **Futur** |

---

## Security notes

L'autorité du Runtime sur toutes les transitions d'état est une règle de
sécurité, pas seulement architecturale. Toute transition d'état initiée par
le client sans validation serveur est une surface d'attaque.

Les modifications Studio passent par les mêmes validations. Le profil admin
n'est pas une exception aux règles du Runtime — il est autorisé à déclencher
plus d'actions, pas à contourner les validations.

## Performance notes

Ce document n'a pas d'impact runtime direct.

Le modèle de capacités et de comportements doit anticiper les performances :
un Behavior IA qui parcourt tous les World Objects du monde pour trouver des
cibles est un anti-pattern. Les systèmes spatiaux (grilles, chunks, index)
sont responsables de fournir des candidats pertinents au Behavior, pas le
Behavior lui-même.

## Related files

- [World Object Model](world-object-model.md)
- [Entity Model](entity-model.md)
- [World Model](world-model.md)
- [MMORPG Studio — Vision](../07_Admin/mmorpg-studio.md)
- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Entity Positioning](../01_Architecture/adr/ADR-0002-entity-positioning.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
