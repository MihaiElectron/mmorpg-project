# Architecture des Resources

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/08_Gameplay/entity-architecture.md, docs/08_Gameplay/world-object-model.md, docs/08_Gameplay/entity-model.md, docs/07_Admin/mmorpg-studio.md
- Used by: Project owner, developers, Claude Code, Claude, tout agent IA travaillant sur ce projet

## Scope

Ce document définit l'architecture conceptuelle d'une Resource dans le MMORPG Runtime.

Il est indépendant de toute implémentation : aucune base de données, aucune classe,
aucune API, aucun protocole réseau. Il définit ce qu'est une Resource, comment elle
vit, ce qu'elle expose, et comment le Runtime et le Studio interagissent avec elle.

Il ne remplace pas `entity-architecture.md` (architecture générique des Entities) ni
`world-object-model.md` (contrat WOM commun). Il spécialise ces deux documents pour
le domaine des Resources.

---

## 1. Définition

Une **Resource** est une Entity exploitable, située dans le monde, dont l'état peut
être modifié par une interaction gameplay — récolte, transformation, destruction ou
consommation.

Elle est le lien entre le monde physique du jeu et le flux matière : une Resource
existe dans la géographie, et une interaction la convertit en quelque chose d'utile
— un loot, un composant, un item, ou une autre forme de Resource.

### Propriétés essentielles

**Exploitable** — une Resource peut faire l'objet d'une interaction gameplay qui
produit un résultat. L'exploitation peut prendre plusieurs formes : récolte
(extraction directe), transformation (changement de forme), destruction (disparition
avec effet). Elle est toujours délibérée — une Resource ne s'exploite pas seule.

**Localisée** — une Resource existe à une position précise dans le monde, exprimée
en World Units (ADR-0001). Sa présence dans l'espace est réelle et significative :
elle occupe un ou plusieurs tiles, elle peut bloquer le passage, elle est visible
depuis une certaine distance.

**Consommable ou régénérable** — une Resource peut s'épuiser au fil des interactions
et se régénérer selon des règles gameplay (timer, condition, biome). Elle peut aussi
être détruite de façon définitive, ou transformée en une autre forme.

### Ce qui fait d'une Resource une Entity

Par la règle canonique d'`entity-architecture.md` :

> Un World Object est une Entity si et seulement si il peut changer d'état selon
> des règles gameplay.

Une Resource peut passer de `available` à `depleted`, de `available` à
`transformed`, ou de `alive` à `destroyed`. Son état évolue selon des règles
gameplay. Elle est donc une Entity.

---

## 2. Ce qu'une Resource n'est pas

**Pas un simple item.**
Un item est ce que le joueur possède dans son inventaire après la récolte. La
Resource est ce qui existe dans le monde avant la récolte. Un `wood log` obtenu
en récoltant un `dead_tree` est un item — le `dead_tree` est la Resource.

**Pas uniquement un décor.**
Un objet purement décoratif — un rocher sculpté, un lampadaire — n'est pas une
Resource s'il ne peut être exploité. Un objet décoratif peut devenir une Resource
si une règle gameplay lui ajoute une interaction. La différence est fonctionnelle,
pas visuelle.

**Pas forcément un arbre.**
Le terme "Resource" ne désigne pas un archétype visuel. Une veine de minerai, une
herbe sauvage, une carcasse abandonnée, un nœud d'énergie magique, une flaque
d'eau — tous peuvent être des Resources si la règle de la définition s'applique.

**Pas forcément statique.**
La majorité des Resources sont fixes dans le monde. Certaines pourraient se
déplacer : un troupeau de plantes flottantes, une colonie de champignons mobiles,
un dépôt temporaire laissé par un événement. La localization d'une Resource peut
être dynamique sans qu'elle cesse d'être une Resource.

**Pas forcément récoltable une seule fois.**
Une Resource peut être récoltée plusieurs fois avant d'être épuisée (déplétions
progressives), régénérer partiellement entre deux récoltes, ou être inépuisable
(certains points d'eau). Le nombre de récoltes est une propriété configurable,
pas une contrainte du concept.

**Pas forcément visible.**
Une Resource peut être cachée (grotte invisible depuis la surface, mineral caché
sous la neige) jusqu'à ce qu'une condition soit remplie (compétence de détection,
quête, outil spécial).

---

## 3. Concepts fondamentaux

### Resource Type

La catégorie fonctionnelle de la Resource. Elle définit sa nature dans l'économie
du jeu : matière première brute, composant intermédiaire, produit agricole, essence
magique.

Le type détermine quels métiers peuvent l'exploiter, quels outils sont nécessaires,
et vers quels outputs elle peut être convertie.

Exemples : `raw_wood`, `ore_iron`, `wild_herb`, `stone`, `essence_magic`.

### Template

La définition abstraite d'un type de Resource particulier. Le template porte les
propriétés communes à toutes les instances de ce type : le loot pool de base, le
timer de respawn par défaut, les capacités exposées, les conditions d'exploitation.

Un template est une règle, pas une instance. Il n'a pas de position dans le monde.

Exemples : `dead_tree`, `iron_vein`, `chamomile_bush`, `granite_block`.

### Resource Node

Un **Node** est un groupe logique d'instances de Resources d'un même type,
organisées dans une zone géographique délimitée.

```
Template
    │
    ▼
  Node  ←─ responsable de : densité, quota, régénération, équilibre
    │
    ├── Instance A
    ├── Instance B
    └── Instance C
```

Le Node n'est pas une Resource lui-même — il n'est pas exploitable directement.
C'est le niveau de gestion écologique : il sait combien d'instances de son
type doivent exister dans sa zone, à quel rythme elles se régénèrent ou
respawnent, et maintient la cohérence de la zone.

**Responsabilités du Node :**

- **Densité** — combien d'instances actives la zone peut contenir simultanément.
- **Quota** — plafond absolu (même si la régénération est disponible, on ne
  dépasse pas N instances).
- **Régénération** — le Node orchestre les timers de régénération de ses
  instances, et peut décider d'en spawner une nouvelle si une instance est
  détruite et que le quota n'est pas atteint.
- **Équilibre écologique** — un Node surexploité peut réduire sa vitesse de
  régénération ; un Node sous-exploité peut accélérer. Il peut tenir compte
  de l'activité joueur dans sa zone.

**Exemples :**

- Une forêt est un Node de type `woodland`. Il contient N arbres de différents
  templates (`dead_tree`, `oak`, `birch`). Si un arbre est abattu, le Node
  décide si et quand un nouvel arbre apparaît dans la zone.
- Une mine de fer est un Node de type `iron_deposit`. Il contient plusieurs
  veines de type `iron_vein`. Le Node gère le quota total de veines actives
  et le temps de régénération global de la mine.

Le Node est un **World Object de type Area spécialisée**, pas une Entity. Il
ne change pas d'état selon des règles gameplay directes — il administre un
ensemble d'Entities. Sa conception complète (relations, identité, storage)
sera définie lors de l'implémentation.

### Instance

Une Resource concrète dans le monde. Elle dérive d'un template et appartient
à un Node (optionnel pour les Resources isolées). Elle peut surcharger certaines
propriétés du template (loot pool modifié, timer spécifique, quantité initiale).

Deux instances du même template `dead_tree` peuvent avoir des quantités restantes
différentes, des états différents, des positions différentes.

### State

L'état courant de la Resource, combinant LifeState et Lifecycle (voir §6).

Le state est géré par le Runtime. Le client en a une copie pour le rendu. Le Studio
peut le lire et, selon les permissions, le modifier via les APIs Runtime.

### Quantity / Remaining Loots

Le nombre d'interactions restantes avant épuisement. Cette valeur est décrémentée
par le Runtime à chaque récolte réussie. Elle n'est jamais décidée par le client.

La quantité peut être :
- un entier fixe (3 récoltes max) ;
- progressive (régénère 1 charge toutes les X secondes) ;
- illimitée (certains points d'eau, sources éternelles) ;
- absente (Resource transformée en une fois, pas de charge).

### Interaction

L'action gameplay qui déclenche l'exploitation d'une Resource. Une interaction
implique toujours un acteur (Player ou NPC), une Resource cible, et une règle
(distance, outil, compétence, durée).

L'interaction produit un résultat : loot, transformation, destruction, ou
déclenchement d'un événement.

Le Runtime valide toutes les interactions : distance, autorisation, état de la
Resource, état de l'acteur. Le client ne fait qu'exprimer une intention.

### Ownership

Une Resource peut appartenir à un propriétaire : un Player (mine personnelle),
une guilde (territoire), un système (Resource publique sans propriétaire).

L'ownership détermine qui peut exploiter la Resource et dans quelles conditions.
Une Resource publique est exploitable par tous. Une Resource privée nécessite une
autorisation. Une Resource protégée peut nécessiter une compétence ou une quête.

L'ownership est facultatif. La majorité des Resources dans le monde actuel sont
publiques.

### Visibility

Certaines Resources ne sont pas visibles par tous les joueurs dans toutes les
conditions. La visibilité peut dépendre d'une compétence de détection, d'un
équipement, d'une quête active, de la distance, ou du biome.

Une Resource invisible n'existe pas pour le joueur qui ne peut pas la voir —
elle n'apparaît pas dans son interface, ne peut pas être sélectionnée ou ciblée.

### Persistence

Une Resource persiste-t-elle entre les sessions ? La majorité des Resources en
monde ouvert sont persistantes : leur état (quantité restante, timer de respawn)
est conservé quand les joueurs se déconnectent. Certaines Resources temporaires
(événement, instance de donjon) ne persistent pas.

---

## 4. Cycle de vie

### Deux dimensions : LifeState et Lifecycle

Conformément à l'architecture des Entities (`entity-architecture.md §2`), le cycle
de vie d'une Resource est décrit par deux dimensions orthogonales :

- **LifeState** : condition fonctionnelle courante (`alive` ou `dead`).
- **Lifecycle** : phase d'existence dans le monde (`active`, `removed`, `destroyed`).

### Parcours principaux

**Parcours standard — Resource récoltable avec respawn :**
```
Created
  │
  ▼
Spawned → Active (LifeState: alive / available)
             │
             │ ← interaction joueur (récolte partielle)
             │   quantity diminue
             │
             │ ← interaction joueur (dernière charge)
             ▼
          Active (LifeState: dead / depleted)
             │
             │ ← timer de respawn atteint
             ▼
          Removed
             │
             ▼
          Spawned → Active (LifeState: alive / available)
             ...
```

**Parcours régénération — Resource qui se reconstitue sans disparaître :**
```
Active (LifeState: alive / exhausted ou partially_depleted)
  │
  │ ← temps, saison, maturité
  ▼
Active (LifeState: alive / harvestable)
  │
  │ ← interaction joueur
  ...
```
La Resource reste active tout au long. Son identifiant ne change pas.

**Parcours maturité — Resource qui grandit avant d'être exploitable :**
```
Spawned → Active (LifeState: alive / seed)
                │
                │ ← temps
                ▼
             alive / growing
                │
                │ ← temps
                ▼
             alive / mature / harvestable
                │
                │ ← interaction joueur
                ▼
             alive / exhausted
                │
                │ ← régénération ou respawn selon template
                ...
```

**Parcours transformation sur place — mutation d'identité fonctionnelle :**
```
Active [id:42] (LifeState: alive / dead_tree)
  │
  │ ← interaction joueur (brûler)
  ▼
Active [id:42] (LifeState: alive / burned_tree) ← même instance, même id
  │
  │ ← interaction joueur (récolter les cendres)
  ▼
Active [id:42] (LifeState: dead / ashes) ← dernière forme
  │
  │ ← aucun respawn
  ▼
Destroyed [id:42]
```

**Parcours transformation — Resource remplacée par une nouvelle instance :**
```
Active (LifeState: alive)
  │
  │ ← interaction joueur (couper, raffiner, sculpter)
  ▼
Active (LifeState: dead / transformed)
  │
  │ ← selon règle : peut spawner une nouvelle Resource à cet emplacement
  ▼
Destroyed (et remplacement par une nouvelle instance avec un nouvel id)
```

**Parcours destruction définitive :**
```
Active (LifeState: alive)
  │
  │ ← destruction (événement gameplay, admin, décision serveur)
  ▼
Active (LifeState: dead)
  │
  │ ← aucun respawn prévu
  ▼
Destroyed
```

**Parcours Resource cachée :**
```
Active (LifeState: alive / hidden)
  │
  │ ← condition remplie (compétence, quête, distance)
  ▼
Active (LifeState: alive / visible / available)
  │
  │ ← interaction joueur
  ...
```

### La distinction dépletion / destruction / transformation

| Situation | LifeState | Lifecycle | Signification |
|---|---|---|---|
| Resource disponible | alive | active | Peut être récoltée |
| Resource en cours de récolte | alive | active | Interaction en cours |
| Resource épuisée (respawn prévu) | dead | active | Existe toujours, timer actif |
| Resource en attente de respawn | dead | removed | Temporairement absente |
| Resource détruite définitivement | dead | destroyed | N'existe plus |
| Resource transformée (remplacée) | dead | destroyed | Instance remplacée par une autre |
| Resource cachée | inactive | active | Existe, non visible |

---

## 5. Capacités

Une Resource expose un sous-ensemble des capacités WOM. Le template définit les
capacités par défaut. Une instance peut en ajouter ou en restreindre.

### Capacités actuelles

| Capacité | Pertinence Resource | Description |
|---|---|---|
| `transform` | Toujours | Position WU, orientation, dimensions |
| `harvestable` | Oui si récoltable | Nombre de charges, timer, outil requis |
| `loot` | Oui si produit un loot | Pool de loot, probabilités, quantités |
| `respawn` | Oui si régénère | Timer, condition, spawn point associé |
| `persistence` | Oui si persistante | État conservé entre sessions |
| `validation` | Toujours (Studio) | Règles de validité pour la map edition |

### Capacités facultatives

| Capacité | Pertinence Resource | Description |
|---|---|---|
| `bounds` | Si couvre plusieurs tiles | Étendue spatiale de la Resource |
| `collision` | Si bloque le passage | Tiles bloquées selon l'état |
| `inventory` | Si contient des items | Resource qui stocke avant loot |
| `quest` | Si liée à une quête | Relation avec le système de quêtes |
| `ownership` | Si appartient à quelqu'un | Propriétaire, permissions d'accès |

### Capacités futures

| Capacité | Pertinence Resource | Description |
|---|---|---|
| `maturity` | Futur | Cycle de maturité (seed → growing → mature → harvestable → exhausted) |
| `regeneration` | Futur | Reconstitution progressive des charges sans disparaître |
| `in_place_transform` | Futur | Mutation d'identité fonctionnelle sur place (même instance, forme change) |
| `node_member` | Futur | Appartient à un Resource Node qui orchestre sa zone |
| `crafting_input` | Futur | Peut servir d'input pour une recette de crafting |
| `processing_input` | Futur | Peut être transformée par un système de traitement |
| `depletion` | Futur | Modèle de dépletion progressive et partielle |
| `studio_editable` | Futur | Définit ce que le Studio peut modifier en direct |
| `weather_sensitive` | Futur | Quantité ou disponibilité dépend de la météo |

---

## 6. États

### LifeStates d'une Resource

| LifeState | Signification |
|---|---|
| `alive` | Existe et peut être exploitée (selon les conditions d'interaction) |
| `dead` | Épuisée, transformée ou détruite — n'est plus exploitable |
| `inactive` | Existe mais temporairement hors gameplay (cachée, désactivée) |

### États internes dans LifeState=alive

Ces états affinent `alive` sans le remplacer. Plusieurs peuvent coexister.

| État interne | Signification |
|---|---|
| `available` | Peut être récoltée maintenant |
| `being_harvested` | Interaction en cours par un acteur |
| `hidden` | Existe mais non visible (condition de détection non remplie) |
| `partially_depleted` | Charges restantes réduites, mais pas à zéro |

### États internes dans LifeState=dead

| État interne | Signification |
|---|---|
| `depleted` | Charges épuisées — respawn ou régénération éventuelle |
| `transformed` | A changé de forme sur place (voir §8) |
| `destroyed` | Détruite définitivement, aucun retour possible |

### Dimension de maturité

La maturité est une dimension d'état orthogonale au LifeState. Elle décrit le
**degré de développement** d'une Resource sur son cycle de croissance naturel.

```
Seed → Growing → Mature → Harvestable → Exhausted
  │        │         │          │            │
  │      pas encore │      pleinement    plus récoltable
  │      récoltable │     récoltable     (sauf régénération)
  │                 │
  │            peut être récoltée partiellement
  │            (mais pénalité ou rendement réduit)
```

| Stade | Signification |
|---|---|
| `seed` | Vient d'être planté ou d'apparaître — pas encore exploitable |
| `growing` | En développement — peut être exploité mais avec rendement réduit |
| `mature` | Pleinement développé — rendement optimal |
| `harvestable` | Prêt à être récolté (sous-état de mature, pour resources cycliques) |
| `exhausted` | A produit tout ce qu'il pouvait — attend régénération ou transformation |

La maturité n'est pas obligatoire pour toutes les Resources. Elle s'applique
naturellement aux :
- plantes et herbes sauvages ;
- arbres fruitiers et cultures ;
- champignons et végétaux cycliques ;
- mines à recharge progressive (le minerai se "reconstitue").

Pour les Resources sans cycle de croissance (`granite_block`, `dead_tree`), la
maturité est absente — elles sont immédiatement disponibles au spawn.

La maturité est gérée par le Runtime (ou le Node). Elle évolue avec le temps,
indépendamment des interactions.

Cette liste n'est pas fermée. Des types spécifiques de Resources peuvent introduire
des stades supplémentaires cohérents avec leurs règles gameplay.

---

## 7. Loot et extraction

### La chaîne matière

Une Resource dans le monde produit du loot. Ce loot peut être des items bruts,
des composants, ou des monnaies. Ces produits peuvent ensuite être transformés
par d'autres systèmes (crafting, métiers, échange).

```
Resource dans le monde
        │
        │ ← interaction joueur (récolte)
        ▼
     Loot produit
  (items, matières premières)
        │
        │ ← crafting runtime / traitement
        ▼
   Item transformé
  (planche, barre, fiole…)
        │
        │ ← transformation avancée future
        ▼
   Objet fini
  (arme, armure, consommable…)
```

### Séparation des concepts

**Resource** — l'objet dans le monde, avec une position, un état, un cycle de vie.

**Loot** — ce que la Resource produit lors d'une interaction. Le loot est une règle
Runtime : le client n'en décide pas le contenu, la quantité ou la probabilité.

**Item** — ce que le joueur obtient après que le loot a été résolu par le Runtime
et ajouté à son inventaire. Un item n'a plus de position dans le monde.

**Matière première** — sous-catégorie d'item : produit brut obtenu directement d'une
Resource, non transformé. Distinction conceptuelle importante pour l'économie future.

**Composant de crafting** — sous-catégorie d'item : produit intermédiaire issu
d'une transformation de matière première.

### Exemples de chaînes

| Resource | Loot direct | Transformation future |
|---|---|---|
| Dead Tree | wood_log | wood_log → plank → furniture |
| Iron Vein | iron_ore | iron_ore → iron_bar → sword_blade |
| Chamomile Bush | chamomile_flower | chamomile_flower → herbal_potion |
| Granite Block | stone_chunk | stone_chunk → carved_stone → building_block |

### Loot déterministe vs probabiliste

Le loot d'une Resource peut être :
- **déterministe** : chaque récolte produit exactement X items (dead_tree donne
  toujours 3 wood_logs) ;
- **probabiliste** : chaque récolte tire dans un pool avec des probabilités (50 %
  wood_log, 10 % rare_wood, 40 % nothing) ;
- **quantitatif variable** : entre 1 et 5 items par récolte, selon compétence ou
  hasard.

Le modèle exact (déterministe / probabiliste / mixte) est une décision par type de
Resource, pas une contrainte du modèle conceptuel.

---

## 8. Transformation

Une Resource peut se transformer plutôt que de simplement disparaître. La
transformation est une forme d'interaction qui produit un résultat différent
de la récolte standard.

### Formes de transformation

**Couper** — une action mécanique qui divise ou tronçonne. Un arbre coupé devient
un tronc (nouvelle Resource) et des branches (loot direct).

**Brûler** — une action thermique. Un arbuste brûlé produit des cendres (loot) et
disparaît. Un feu appliqué à du minerai peut initier une fusion.

**Sculpter** — une action de façonnage. Un bloc de pierre brut peut être sculpté
en pierre taillée (nouvelle Resource ou item).

**Raffiner** — un processus de purification. Du minerai brut passé dans un système
de traitement produit un métal affiné. Ce processus nécessitera probablement une
installation (four, établi).

**Déplacer** — certaines Resources pourraient être repositionnées dans le monde
(blocs de construction, caisses, barils). La Resource conserve son identité mais
sa position change.

**Détruire** — la Resource est consumée sans loot significatif, ou avec des
sous-produits de destruction (décombres, cendres, ruines).

### Transformation sur place — mutation d'identité fonctionnelle

Une Resource peut se transformer **en restant à la même position, avec le même
identifiant**, mais en changeant d'identité fonctionnelle. Ce n'est pas une
nouvelle Resource créée à côté — c'est la même instance qui mute.

```
Dead Tree  →  Burned Tree  →  Ashes
   [id:42]       [id:42]      [id:42]
```

```
Iron Ore  →  Broken Ore  →  Empty Vein
  [id:7]       [id:7]         [id:7]
```

```
Crop  →  Harvested Crop  →  Field
[id:5]       [id:5]         [id:5]
```

L'instance conserve son identifiant. Ce qui change :
- le template actif (ou la "forme" courante du template) ;
- les capacités exposées (un `Burned Tree` n'est plus `harvestable` mais `lootable` pour les cendres) ;
- le sprite / représentation visuelle côté client ;
- les interactions disponibles.

Ce mécanisme rend le monde vivant : un arbre incendié laisse des cendres sur
place, une mine épuisée reste visible comme veine vide. Le monde garde une
mémoire des transformations.

**Différence avec un remplacement par une nouvelle instance :**

| Mécanique | Identifiant | Usage |
|---|---|---|
| Transformation sur place | Conservé (`id:42`) | Mutation naturelle, histoire de la Resource |
| Remplacement | Nouveau (`id:43`) | Respawn, spawn d'une Resource distincte |

La décision de transformer sur place vs remplacer est une propriété du template.
Elle a des implications sur le monitoring (historique des mutations) et le Studio
(inspector qui affiche l'évolution de l'instance).

### Règles de transformation

- Une transformation est toujours une action Runtime : le client exprime une
  intention, le serveur valide et exécute.
- Une transformation sur place conserve l'identifiant de l'instance.
- Une transformation peut produire un loot direct (cendres, fragments) et/ou
  changer la forme de la Resource en place.
- Une transformation peut être conditionnelle : nécessiter un outil, une compétence,
  un niveau minimum, une quête active.
- Les transformations complexes (raffinage, alchimie) dépendront de systèmes
  futurs (métiers, installations). Ce document ne les définit pas — il prépare
  le lien conceptuel.

---

## 9. Respawn et Régénération

Ce sont deux mécaniques distinctes. Les confondre produit des modèles incorrects.

### Respawn — une nouvelle instance apparaît

Le **Respawn** concerne une Resource dont le Lifecycle est `removed` ou
`destroyed`. Elle n'existe plus (ou plus fonctionnellement). Le Respawn fait
apparaître une nouvelle instance, ou réactive l'ancienne, à une position donnée.

```
Arbre abattu
  Lifecycle: destroyed
      │
      │ ← timer écoulé, conditions réunies
      ▼
Nouvel arbre spawn à la même position (ou dans la zone du Node)
  Lifecycle: active
  LifeState: alive / growing ou mature
```

Le Respawn est un événement de naissance ou de renaissance. L'instance qui
réapparaît peut être la même (identifiant conservé, Lifecycle: removed → active)
ou une nouvelle (nouvel identifiant, si l'ancienne était Destroyed).

**Types de Respawn :**

**Fixe** — réapparition à la position exacte d'origine après un délai fixe.
Implémenté pour `dead_tree` et les animaux.

**Dynamique** — réapparition dans la zone du Node selon des règles de placement
(tile walkable, distance aux autres instances, biome). Géré par le Node.

**Conditionnel** — le Respawn n'a lieu que si des conditions sont réunies (biome
compatible, quota non atteint, heure de la journée, événement actif).

---

### Régénération — la même instance se reconstitue

La **Régénération** concerne une Resource dont le Lifecycle est `active` — elle
existe toujours dans le monde. Elle récupère progressivement des charges, des
fruits, des branches, ou du minerai sans disparaître ni être remplacée.

```
Arbre fruitier
  LifeState: alive / exhausted (fruits récoltés)
      │
      │ ← temps qui passe, saison
      ▼
  LifeState: alive / harvestable (fruits repoussés)
```

```
Mine de fer
  LifeState: alive / partially_depleted
      │
      │ ← régénération 1 charge / 30 min
      ▼
  LifeState: alive / available (veine rechargée)
```

La Resource ne quitte jamais le monde pendant la Régénération. Son identifiant
ne change pas. Sa maturité peut progresser (seed → growing → mature → harvestable).

**Formes de Régénération :**

**Progressive (par charges)** — la Resource récupère des charges au fil du temps.
Applicable aux mines, aux buissons, aux sources.

**Par maturité** — la Resource progresse dans son cycle de maturité. Un stade
`growing` devient `mature`, puis `harvestable`. Applicable aux cultures et arbres
fruitiers.

**Partielle** — la Resource ne récupère pas toutes ses charges, seulement une
fraction, selon la saison ou l'état du sol.

---

### Tableau comparatif

| Aspect | Respawn | Régénération |
|---|---|---|
| Lifecycle de la Resource | removed ou destroyed | active (reste dans le monde) |
| L'instance disparaît ? | Oui (temporairement ou définitivement) | Non |
| Identifiant conservé ? | Peut-être (si removed → active) | Toujours |
| Ce qui se reconstitue | L'existence dans le monde | Les charges / la maturité |
| Géré par | Runtime + Node | Runtime + Node |
| Exemples | Creature mort, arbre abattu | Arbre fruitier, mine, buisson |

---

### Dépendances communes (Respawn et Régénération)

- **Biome** : certaines Resources ne peuvent spawner ou régénérer que dans un
  biome compatible. Contrainte du template.
- **Temps de jeu** : plante lunaire (nuit), fruit saisonnier (été), post-événement.
- **Activité joueur** : surexploitation d'une zone peut ralentir la régénération
  (simulation écologique). Géré par le Node.
- **Quota** : le Node plafonne le nombre d'instances actives. Si le quota est
  atteint, un Respawn est bloqué jusqu'à ce qu'une instance disparaisse.

### Règles d'autorité

- Le Runtime décide si et quand une Resource respawn ou se régénère.
- Le Node orchestre les décisions à l'échelle de la zone.
- Le client n'a aucun rôle dans ces décisions.
- Tout Respawn ou saut de maturité significatif génère un événement diffusé
  aux clients concernés.

---

## 10. Autorité

### Serveur (Runtime autoritatif)

Le Runtime est la seule source de vérité sur :

- l'état de la Resource (LifeState, Lifecycle, charges restantes) ;
- la validité d'une interaction (distance, outil, permissions) ;
- le contenu du loot produit ;
- le timer et les conditions de respawn ;
- le résultat d'une transformation ;
- la création et la suppression d'instances.

**Le Runtime ne fait jamais confiance aux coordonnées, actions ou états envoyés
par le client.** Toute interaction est validée avant d'être exécutée.

### Client

Le client est responsable de :

- le rendu de la Resource (sprite, animation, particules) ;
- l'affichage de l'état (Resource épuisée visuellement différente) ;
- l'expression des intentions du joueur (clic, sélection, demande d'interaction) ;
- l'affichage du feedback d'interaction (barre de progression, réussite, échec).

Le client ne décide jamais de l'état d'une Resource, ne calcule jamais le loot,
ne déclenche jamais un respawn.

### Studio

Le Studio peut, selon les permissions :

- **Inspecter** : lire l'état courant, les capacités, les propriétés, le template.
- **Modifier** : changer l'état, la quantité, le timer, les propriétés du template
  (en passant par les APIs Runtime, jamais directement en DB).
- **Valider** : signaler les Resources en état invalide (hors map, superposées,
  template absent).
- **Monitorer** : observer en temps réel le taux d'exploitation, les respawns
  actifs, les anomalies.
- **Automatiser** : spawner en lot, réinitialiser une zone, migrer des templates.

---

## 11. Intégration Studio

Le Studio doit traiter les Resources comme des World Objects de catégorie Entity,
sous-type Resource. Il inspecte leurs capacités, pas leur type spécifique.

### Resource Overlay

Couche d'affichage qui superpose au monde des informations sur les Resources
présentes :

- position, type, état (couleur selon LifeState) ;
- charges restantes ;
- timer de respawn ;
- zone d'ownership ;
- biome associé.

L'overlay est une vue de lecture seule du Runtime. Il ne modifie rien.

### Resource Inspector

Panneau d'inspection d'une Resource sélectionnée. Affiche :

- identité (id, template, instance) ;
- localisation (mapId, position WU, bounds) ;
- LifeState et Lifecycle courants ;
- état interne (available, depleted, hidden…) ;
- quantité restante ;
- timer de respawn (si applicable) ;
- capacités exposées ;
- ownership (si défini) ;
- métadonnées du template.

L'Inspector délègue le rendu à des capability providers (voir WOM §9). Il ne
connaît pas le type spécifique de la Resource.

### Resource Editor

Interface permettant de modifier les propriétés d'une Resource ou de son template,
en passant par les APIs Runtime :

- modifier l'état ;
- modifier la quantité restante ;
- modifier le timer de respawn ;
- modifier les propriétés du template (loot pool, conditions) ;
- ajouter ou supprimer des instances.

L'édition est soumise à permissions. Certaines opérations (modifier un template en
production) nécessitent un profil Lead ou Owner.

### Resource Console Commands

Commandes texte pour les opérations rapides :

- `/spawn <template> <mapId> <x> <y>` — spawner une instance ;
- `/deplete <id>` — épuiser une Resource ;
- `/respawn <id>` — forcer un respawn immédiat ;
- `/reset_zone <mapId> <areaId>` — réinitialiser toutes les Resources d'une zone ;
- `/set_quantity <id> <n>` — modifier la quantité restante.

Ces commandes sont transmises au Runtime et validées côté serveur.

### Resource Monitoring

Vue temps réel de l'activité des Resources :

- taux d'exploitation par zone ;
- nombre de Resources active / depleted / respawning par map ;
- anomalies détectées (Resource hors bounds, template absent, timer bloqué) ;
- activité par template (quelles Resources sont le plus récoltées).

### Resource Automation

Opérations en lot :

- spawner toutes les Resources d'une zone selon un template de placement ;
- réinitialiser une map à son état initial ;
- migrer un template (renommer, modifier les propriétés pour toutes les instances).

### Resource Validation

Vérification automatique de la cohérence avant déploiement ou en production
(voir §12).

---

## 12. Validation

Le Studio peut valider les Resources selon des règles de cohérence.

### Règles de validation

**Position invalide :**
- Resource hors des bounds de la Map ;
- Resource sur un tile non walkable (si elle doit être accessible) ;
- Resource dans l'eau (si incompatible avec son type).

**Superposition :**
- Deux Resources dont les bounds se chevauchent ;
- Resource superposée à un obstacle terrain.

**Template absent ou invalide :**
- Instance référençant un template qui n'existe plus ;
- Template avec un loot pool vide ;
- Template avec un timer de respawn négatif.

**Biome incompatible :**
- Resource d'un type incompatible avec le biome de son tile (herbe alpine en désert).

**Quantité incohérente :**
- Quantité négative ou supérieure au maximum du template ;
- Quantité = 0 sans LifeState=dead.

**Ownership incohérent :**
- Owner référençant un Player ou une guilde qui n'existe plus.

**Respawn invalide :**
- Spawn Point de respawn hors bounds de la Map ;
- Spawn Point de respawn sur un tile non walkable.

**Accessibilité bloquée :**
- Resource entourée de tiles bloquées sur tous les côtés (inaccessible).

La validation produit des rapports avec niveau de sévérité (erreur bloquante,
avertissement, info). Elle peut être exécutée en mode sec (dry-run) sans modifier
l'état du monde.

---

## 13. Lien Resource → Crafting

Ce document décrit le lien conceptuel entre Resources et crafting. Le runtime
craft joueur via stations est désormais documenté dans
`docs/08_Gameplay/crafting-runtime.md`. Les transformations avancées de
Resources, la traçabilité économique complète et les installations de traitement
spécialisées restent des extensions futures.

### Principes à respecter pour le crafting

**Une Resource produit des inputs, pas le crafting lui-même.**
Le crafting consomme des items produits par les Resources. La chaîne est :
Resource → loot (item) → input de crafting. Le crafting ne bypass pas la Resource.

**La provenance doit être traçable.**
L'économie du jeu gagnera à connaître l'origine des items. Une barre de fer sait
qu'elle vient d'un iron_ore récolté dans telle zone. Cette traçabilité n'est pas
obligatoire au départ, mais le modèle ne doit pas l'empêcher.

**La rareté est une propriété du template.**
La rareté d'une Resource (commune, rare, épique) est définie dans son template.
Elle affecte les probabilités de loot, le timer de respawn, et à terme les recettes
de crafting qui consomment ce type.

**Les métiers filtrent les Resources.**
Un système de métiers (bûcheron, mineur, alchimiste) nécessite de savoir quelles
Resources sont accessibles à un métier donné. Cette information doit être dans le
template, pas dans le système de crafting lui-même.

**Les installations de traitement sont des Entities.**
Un four, un établi, un alambic sont des Resources particulières ou des Entities
de type Building. Ils consomment des items (inputs) et produisent d'autres items
(outputs). Ils n'exploitent pas eux-mêmes les Resources du monde.

---

## 14. Exemples

### Dead Tree (Arbre Mort)

Resource récoltable statique, implémentée. Illustre la transformation sur place.

| Concept | Description |
|---|---|
| Type | raw_wood, sous-biome forêt tempérée |
| Template | `dead_tree` — défini dans les seeds |
| Node | `woodland_node` (à venir) — gère densité et quota de la forêt |
| LifeState | alive (available) → dead (depleted) |
| Lifecycle | active → removed (respawn prévu) → active |
| Maturité | absente (arbre mort déjà prêt à être récolté au spawn) |
| Charges | 3 récoltes par défaut |
| Loot | wood_log (1 à 3 par récolte) |
| Respawn | 120 s, position fixe |
| Transformation sur place | dead_tree → burned_tree → ashes (futur) |
| Capacités | `transform`, `harvestable`, `loot`, `respawn`, `persistence` |
| Futur | `in_place_transform`, `crafting_input`, `node_member` |

**État actuel** : implémenté en backend (`ResourceTemplate`, instances) et en
frontend (sprite, interaction). Dépletion/respawn fonctionne. Loot pas encore
généré côté serveur. Node et transformation sur place sont futurs.

### Iron Vein (Veine de Minerai)

Resource non implémentée. Illustre la régénération progressive et le Node de mine.

| Concept | Description |
|---|---|
| Type | raw_ore, sous-biome montagne / mine |
| Template | `iron_vein` (à créer) |
| Node | `iron_mine_node` — gère quota de veines actives et régénération de la mine |
| LifeState | alive (available / partially_depleted) → dead (depleted) |
| Lifecycle | active — ne disparaît pas, se régénère sur place |
| Maturité | absente (minerai soit disponible, soit épuisé) |
| Charges | 10 récoltes, **Régénération** 1 charge / 30 min (pas de Respawn) |
| Loot | iron_ore (1 par récolte) |
| Régénération | La veine reste en place, ses charges se reconstituent progressivement |
| Respawn | Aucun sur l'instance — c'est le Node qui spawne une nouvelle veine si nécessaire |
| Transformation sur place | iron_vein → broken_ore → empty_vein (futur) |
| Capacités | `transform`, `harvestable`, `loot`, `persistence`, `depletion`, `node_member` |
| Futur | `regeneration`, `in_place_transform`, `crafting_input` |

### Wild Herb (Herbe Sauvage)

Resource non implémentée. Illustre la maturité et la régénération cyclique.

| Concept | Description |
|---|---|
| Type | plant, sous-biome prairie / forêt |
| Template | `chamomile_bush` (à créer) |
| Node | `herb_patch_node` — gère densité du tapis herbacé dans une zone |
| LifeState | alive (growing → mature → harvestable → exhausted) |
| Lifecycle | active — régénère sur place sans disparaître |
| Maturité | seed → growing → mature → harvestable → exhausted → (régénération) → harvestable |
| Charges | 2 récoltes au stade harvestable |
| Loot | chamomile_flower (1 à 2 par récolte) |
| Régénération | La plante repousse sur place après épuisement (pas de Respawn) |
| Respawn | Aucun sur l'instance — Node spawne de nouvelles herbes si quota bas |
| Capacités | `transform`, `harvestable`, `loot`, `persistence`, `node_member` |
| Futur | `maturity`, `regeneration`, `weather_sensitive`, `crafting_input` |

### Dead Tree → Burned Tree → Ashes

Illustration complète de la transformation sur place (futur).

```
[id:42] Dead Tree
  alive / available
      │
      │ ← joueur allume un feu (outil: torche, compétence: pyromancie)
      ▼
[id:42] Burned Tree              ← même instance, même identifiant
  alive / transformed
  (loot: charcoal)
      │
      │ ← joueur récolte les cendres
      ▼
[id:42] Ashes                   ← troisième forme, même identifiant
  dead / depleted
      │
      │ ← aucun respawn (les cendres se dissipent)
      ▼
[id:42] Destroyed
```

À chaque étape, l'instance [id:42] change de forme (template actif, sprite,
capacités disponibles), mais conserve son identifiant et son historique. Le
Studio peut afficher toute l'évolution d'un [id:42] dans son inspector.

---

## 15. Non-goals

- Ce document ne définit pas le schéma de base de données des Resources.
- Ce document ne définit pas les classes TypeORM ou les entités de persistance.
- Ce document ne définit pas les DTOs ou les payloads réseau des interactions.
- Ce document ne définit pas les composants client de rendu des Resources.
- Ce document ne définit pas les APIs HTTP ou WebSocket des Resources.
- Ce document ne définit pas le système de crafting.
- Ce document ne définit pas le système de métiers.
- Ce document ne définit pas l'économie du jeu.
- Ce document ne définit pas les algorithmes de respawn ou de placement.
- Ce document ne liste pas toutes les propriétés de chaque type de Resource.
- Ce document ne remplace pas les ADRs pour les décisions techniques.

---

## 16. Questions ouvertes

**Q1 — Une Resource est-elle toujours une Entity ?**
La règle canonique dit oui : toute Resource peut changer d'état. Mais une
Resource purement décorative, sans interaction possible, est-elle encore une
Resource ? Ou devient-elle un objet de décor (Decoration dans le WOM) ? La
frontière entre Resource sans interaction et Decoration mérite d'être précisée
lors de la conception du système Décor.

**Q2 — Transformation sur place : critère de décision template vs nouvelle instance ?**
Le modèle distingue transformation sur place (même id) et remplacement (nouvel id).
Mais le critère qui détermine lequel s'applique reste à définir. Proposition :
transformation sur place si la "mémoire de l'objet" (son histoire, sa position,
son appartenance à un Node) doit être conservée ; remplacement si l'objet résultant
est fonctionnellement distinct et sans lien identitaire avec l'original.

**Q3 — Resource épuisée vs détruite : persistance de l'identité à travers le Respawn ?**
Si une Resource est removed (pas destroyed), le Respawn réactive-t-il la même instance
(id conservé) ou spawne-t-il une nouvelle ? Conséquences : monitoring (on peut voir
"cet arbre en est à son 4e cycle de vie"), quota Node (l'instance est encore comptée
pendant le removed), traçabilité. À trancher lors de l'implémentation du Respawn.

**Q9 — Maturité : le stade initial au spawn est-il configurable par le Node ?**
Un Node pourrait spawner une herbe directement au stade `mature` (pour un monde
déjà vivant à l'ouverture) ou au stade `seed` (pour simuler la croissance). Cette
décision appartient-elle au template, au Node, ou aux deux ?

**Q10 — Resource Node : World Object de type Area ou type dédié ?**
Le Node est décrit comme une Area spécialisée. Mais il a des comportements propres
(quota, régénération, écologie). Faut-il une catégorie WOM dédiée `ResourceNode`,
ou le modéliser comme une Area avec des capacités `node_*` ? À trancher lors de la
conception du Node.

**Q4 — Loot déterministe ou probabiliste par défaut ?**
Le modèle actuel (`dead_tree`) semble utiliser un loot fixe. Faut-il définir une
convention de projet (toujours probabiliste avec min=max pour le déterministe) ou
laisser le choix par template ?

**Q5 — Respawn par instance ou par zone ?**
Le modèle de respawn actuel est par instance (chaque Resource a son propre timer).
Un modèle de quota par zone (la zone maintient N Resources d'un type) est plus
réaliste mais plus complexe. Ce choix aura un impact sur le monitoring et l'éditeur
Studio.

**Q6 — Rareté et impact économique ?**
La rareté est une propriété du template. Mais comment se traduit-elle concrètement :
dans le loot pool (probabilités plus faibles) ? dans le timer de respawn (plus long
= plus rare) ? dans le spawn lui-même (moins de points de spawn) ? Les trois ?

**Q7 — Ownership privé vs public : granularité ?**
L'ownership peut être individuel (Player), collectif (guilde), ou public. Est-ce
qu'une Resource peut avoir des droits d'accès partiels (récolte libre mais
transformation réservée au propriétaire) ?

**Q8 — Interaction multi-joueurs sur la même Resource ?**
Plusieurs joueurs peuvent-ils récolter simultanément la même Resource (partage des
charges) ? Ou la Resource est-elle verrouillée pendant une interaction (lock
exclusif) ? Ce choix impacte le modèle d'état et l'expérience de jeu.

---

## Fichiers associés

- [World Object Model](world-object-model.md)
- [Entity Architecture](entity-architecture.md)
- [Entity Model](entity-model.md)
- [World Model](world-model.md)
- [MMORPG Studio](../07_Admin/mmorpg-studio.md)
- [DevTools Architecture](../07_Admin/devtools-architecture.md)
- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
