# Décisions Phase 0 — Prérequis à la migration WU

## Métadonnées

- Status: Draft — en attente de validation humaine
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/01_Architecture/coordinate-system-migration-plan.md,
  docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md
- Used by: Project owner, developers, conversational assistants,
  repository-aware coding agents

---

## Contexte

Le plan de migration (`coordinate-system-migration-plan.md`) identifie cinq
décisions bloquantes à prendre **avant la première modification de code**. Ce
document traite chacune de ces décisions en détail, formule des recommandations
argumentées, et distingue ce qui peut être décidé maintenant de ce qui nécessite
une mesure ou une validation dans le code réel.

Aucun fichier de code, d'entité, de migration ou d'ADR n'est modifié ici.

---

## 1. Offset tilemap final

### 1.1 Où est-il utilisé

`TILEMAP_TEST_OFFSET_X = 936` et `TILEMAP_TEST_OFFSET_Y = 0` n'existent qu'à
**un seul endroit dans le dépôt** :

```
apps/client/src/phaser/core/WorldScene.js:137
apps/client/src/phaser/core/WorldScene.js:138
```

Ils sont passés comme troisième et quatrième argument à `map.createLayer()` :

```js
const layer = map.createLayer(
  map.layers[0].name,
  tileset,
  TILEMAP_TEST_OFFSET_X,   // 936
  TILEMAP_TEST_OFFSET_Y,   // 0
);
```

Cette valeur est utilisée uniquement pour positionner le layer de terrain dans
l'espace Phaser world. Elle n'est transmise à aucun autre composant, aucun
socket, aucun service. La doc `maps-and-collisions.md` et `phaser-world.md`
la mentionnent comme "temporary display alignment".

### 1.2 Pourquoi cet offset est critique pour la migration

Après la migration WU, les sprites seront positionnés via la formule de
projection du module central :

```
screenX = originX + (worldX − worldY) / 16
screenY = originY + (worldX + worldY) / 32
```

Pour que les sprites apparaissent visuellement sur les tiles de terrain,
`(originX, originY)` doit être exactement la position Phaser world du vertex
nord de la tile (0, 0) de la map.

**Si `originX` est incorrect, tous les sprites seront décalés par rapport au
terrain.** C'est le seul paramètre qui lie les coordonnées WU serveur à l'espace
de rendu Phaser client.

Par conséquent, la valeur de `originX` doit être connue et stable avant de
convertir la moindre position existante (seeds, respawn, spawn d'animaux) en WU.

### 1.3 Analyse de la valeur actuelle

La carte `terrain_pipeline_test.tmj` a les caractéristiques suivantes :

```
Dimensions : 64 × 64 tiles
Tile visuelle : 128 × 64 pixels (tilewidth × tileheight)
Orientation : isometric (pure, non staggered)
```

La valeur 936 a été choisie empiriquement pour centrer visuellement le vertex
nord de la map à environ x=1000 dans l'espace world Phaser. Le commentaire dans
le code précise : `// centres north vertex at world x=1000`.

Dans la formule de projection WU :

- `wuToScreenX(0, 0, originX) = originX + (0 − 0) / 16 = originX`

Donc si le vertex nord de la tile (0, 0) doit être à `screenX = 1000`, alors
`originX = 1000`. La valeur 936 utilisée pour `createLayer` n'est pas directement
`originX` — Phaser décale la position en fonction de la géométrie de la tilemap
isométrique. Ces deux valeurs font référence à des repères différents dans le
système de rendu Phaser.

### 1.4 Stratégie recommandée

**Deux approches possibles :**

**A — Mesure dans le code réel** (recommandée si la précision visuelle est requise)

Après le premier déploiement du module central, ajouter temporairement dans
`WorldScene.js` :

```js
// Debug temporaire — à retirer après mesure
console.log('origin tile (0,0):', map.tileToWorldXY(0, 0));
```

Phaser retourne alors la position pixel exacte du centre de la tile (0,0),
qui devient `originX` et `originY`. Cette mesure ne modifie pas l'architecture
et prend moins de 5 minutes.

**B — Décision par convention** (recommandée pour démarrer la migration sans attendre)

Adopter `originX = 1000, originY = 0` comme valeur officielle pour la map test,
en accord avec le commentaire du code (`// centres north vertex at world x=1000`).
Tolérer un décalage visuel résiduel de quelques pixels, corrigible après validation.

### 1.5 Peut-on décider maintenant ?

**Oui, avec l'approche B.** La valeur `originX = 1000, originY = 0` est une
décision de game design (où doit être la tile (0,0) dans l'espace Phaser) et
non une mesure empirique. Elle sera affinée si le décalage visuel est gênant.

**Décision recommandée** : adopter `originX = 1000, originY = 0` comme origin
officielle de la première map (`mapId = 1`). Ces valeurs seront stockées dans
une configuration par-map, pas en constante globale.

---

## 2. Métrique de distance gameplay

### 2.1 Contexte

Trois systèmes utilisent une vérification de distance dans le code actuel :

| Système | Fichier | Implémentation actuelle |
|---|---|---|
| Gathering | `resources.gateway.ts:248` | `Math.hypot(target.x − player.x, target.y − player.y) <= RESOURCE_INTERACT_RANGE` |
| Combat mêlée | `animals.service.ts:259, 267` | `Math.hypot(dx, dy) <= MELEE_RANGE` |
| Aggro | `animals.service.ts:172` | `findNearestPlayer → Math.hypot <= aggroRadius` |

Toutes utilisent `Math.hypot` sur des coordonnées pixel-équivalentes.
Après migration WU, le choix de la métrique détermine la forme effective des
zones de portée — et donc les valeurs de calibration de `MELEE_RANGE`,
`RESOURCE_INTERACT_RANGE` et `aggroRadius`.

### 2.2 Rappel géométrique — isométrique et WU

La projection isométrique est :

```
screenX = originX + (worldX − worldY) / 16
screenY = originY + (worldX + worldY) / 32
```

Un même delta WU `(Δwx, Δwy)` produit des distances screen très différentes
selon la direction : le ratio varie de 45 à 91 pixels par tile logique
(voir `world-units-study.md`). La projection n'est pas un scalaire.

Conséquence : une "sphère" dans un espace n'est pas une "sphère" dans les
autres. Le choix de l'espace de calcul change la forme visuelle des portées.

### 2.3 Comparaison des quatre options

---

#### Option A — Euclidienne en WU

```
d = sqrt(Δwx² + Δwy²)
```

**Combat (mêlée)** : la zone de portée est un cercle dans l'espace WU/tile.
En vue isométrique, ce cercle projette en ellipse. Un joueur peut frapper un
peu plus loin sur l'axe diagonale isométrique que sur l'axe perpendiculaire.
Asymétrie faible mais notable à des portées de mêlée (≤ 2 tiles).

**Gathering** : même comportement. La ressource peut être atteignable sous un
angle mais pas un autre à distance égale.

**Aggro** : ellipse isométrique. Acceptable pour la perception joueur car la
déformation est faible à grande portée.

**Cohérence visuelle isométrique** : moyenne. La forme n'est pas un losange,
ce qui est le référent naturel en isométrique.

**Coût serveur** : `sqrt` par vérification, légèrement plus coûteux.

**Lisibilité gameplay** : "N tiles de rayon" n'est pas une promesse tenue
visuellement dans toutes les directions.

---

#### Option B — Euclidienne en pixels projetés

```
dscreenX = (Δwx − Δwy) / 16
dscreenY = (Δwx + Δwy) / 32
d = sqrt(dscreenX² + dscreenY²)
```

**Combat** : cercle parfait en vue isométrique. La portée visuelle est
rigoureusement identique dans toutes les directions à l'écran.

**Gathering** : idem.

**Aggro** : idem.

**Cohérence visuelle isométrique** : maximale. C'est l'option "ce que le joueur
voit est ce que le serveur calcule".

**Coût serveur** : multiplication, division, addition, `sqrt`. Le coût est plus
élevé et **la valeur dépend de la résolution et du zoom client** — ce qui est
fondamentalement incorrect pour un serveur autoritaire. Le serveur ne doit pas
faire de calculs qui dépendent de la présentation.

**Lisibilité gameplay** : excellente visuellement, mais non implémentable proprement
côté serveur.

**Verdict** : **éliminée**. Un serveur autoritaire ne peut pas fonder ses décisions
gameplay sur des distances pixels liées au rendu client.

---

#### Option C — Chebyshev en WU

```
d = max(|Δwx|, |Δwy|)
```

**Combat (mêlée)** : la zone de portée est un carré dans l'espace WU/tile.
Ce carré tile projette en losange isométrique à l'écran — exactement la forme
attendue par un joueur dans un jeu isométrique. "Porter un coup" = "être dans
le losange qui m'entoure".

**Gathering** : même losange. Visuellement cohérent : on peut récolter tout
ce qui se trouve dans la zone isométrique adjacente.

**Aggro** : losange d'aggro. Le joueur comprend intuitivement qu'il déclenche
l'aggro en entrant dans la zone en losange de la créature.

**Cohérence visométrique isométrique** : maximale pour un jeu à grille.
Le carré tile → losange screen est la forme naturelle de la grille isométrique.

**Coût serveur** : deux soustractions absolues et un max. Moins coûteux que
l'option A (pas de `sqrt`).

**Lisibilité gameplay** : "N tiles en Chebyshev" = "dans un carré de N tiles
de côté centré sur l'entité". Facile à visualiser pour un game designer.

---

#### Option D — Manhattan en WU

```
d = |Δwx| + |Δwy|
```

**Combat** : la zone de portée est un losange dans l'espace WU/tile. Ce losange
tile projette en parallélogramme compressé à l'écran — pas une forme naturelle
en isométrique.

**Gathering** : idem — forme peu intuitive.

**Aggro** : idem.

**Cohérence visuelle isométrique** : faible. La forme projetée n'est pas
un losange propre.

**Coût serveur** : deux soustractions absolues et une addition. Même ordre
que Chebyshev.

**Lisibilité gameplay** : moins intuitive que Chebyshev pour une grille
isométrique.

---

### 2.4 Tableau comparatif

| Critère | Euclidien WU | Euclidien px | Chebyshev WU | Manhattan WU |
|---|---|---|---|---|
| Forme en WU | Cercle | N/A serveur | Carré | Losange |
| Forme à l'écran | Ellipse | Cercle | Losange | Parallélogramme |
| Cohérence isométrique | Moyenne | Maximale* | **Maximale** | Faible |
| Coût CPU | `sqrt` | `sqrt` + proj | `max + abs` | `abs + sum` |
| Acceptable serveur | Oui | **Non** | Oui | Oui |
| Calibration gameplay | Tiles | Pixels | Tiles | Tiles |

*Euclidien px est théoriquement idéal mais incompatible avec un serveur autoritaire.

### 2.5 Recommandation

**Chebyshev en WU** (`max(|Δwx|, |Δwy|)`) est recommandé.

Justification :
- Forme visuelle naturelle en isométrique (losange à l'écran).
- Implémentable côté serveur sans dépendance au rendu client.
- Plus rapide qu'une distance Euclidienne (pas de `sqrt`).
- Intuitive pour le game design : "un carré de N tiles de rayon".
- `isInRange(a, b, R) = max(|a.worldX - b.worldX|, |a.worldY - b.worldY|) <= R`

Le remplacement de `Math.hypot` par `Math.max(Math.abs(...), Math.abs(...))` sera
fait dans la Phase 5 de la migration (logique animaux) et la Phase 3 (service monde).

**Note** : cette décision change la forme des zones de portée par rapport à
l'actuel (qui est Euclidien en pixels). Les valeurs de `MELEE_RANGE`,
`RESOURCE_INTERACT_RANGE` et `aggroRadius` devront être recalibrées en Phase 8
en tenant compte de cette nouvelle métrique.

---

## 3. INTEGER vs BIGINT

### 3.1 Rappel de la plage int32 signé avec 1 tile = 1024 WU

| Grandeur | Formule | Valeur |
|---|---|---|
| Max int32 | 2^31 − 1 | 2 147 483 647 WU |
| Max tile index | 2 147 483 647 / 1024 | **2 097 151 tiles par axe** |
| Map actuelle | 64 tiles × 1024 WU | 65 536 WU — infime fraction du max |
| Max chunk index | 2 097 151 / 64 | 32 767 chunks par axe |
| Volume WU total | (2 × 2^31)^2 (signé) | 1,8 × 10^19 WU² |

La capacité int32 représente un monde de **2 millions de tiles par axe**, soit
environ 256 km × 256 km à raison de 128 pixels visuels par tile — une superficie
équivalente à la France entière, six fois.

### 3.2 Quand INTEGER suffit

Pour tout projet où la taille de chaque carte reste sous **2 millions de tiles
par axe**, `INTEGER` (PostgreSQL int4 signé, 4 octets) est suffisant. Cela
couvre :

- Des cartes d'exploration de centaines à milliers de tiles.
- Un monde procédural de chunks chargés dynamiquement, même très grand.
- Une architecture multi-map (plusieurs `mapId` distincts) : chaque map a son
  propre espace de coordonnées, donc une map de 10 000 × 10 000 tiles reste
  très loin des limites.

**Pour ce projet** : la map actuelle est 64 × 64 tiles. Même en envisageant des
maps de 10 000 × 10 000 tiles, int32 reste 200 fois supérieur à ce besoin.
`INTEGER` est adapté.

### 3.3 Quand BIGINT serait nécessaire

`BIGINT` (int8 signé, 8 octets) est utile si :

- Le monde consiste en un espace **continu sans limite de map** (un seul espace
  de coordonnées global illimité), et que la taille maximale pourrait dépasser
  2 millions de tiles par axe.
- Des coordonnées WU doivent stocker des positions dans le domaine de l'astronomie
  ou de la simulation physique (hors-scope pour un MMORPG).
- La précision sub-tile doit être encore plus fine que 1/1024 sans perte
  (non requis ici).

Aucun de ces cas ne s'applique à ce projet.

### 3.4 Recommandation

**`INTEGER` (int32 signé) est la décision recommandée** pour `worldX` et `worldY`.

Coût de stockage : 4 octets par colonne vs 8 octets pour `BIGINT` — économie de
50 % sur les colonnes de position, avec un impact mesurable sur les tables `animals`
et `character` qui sont lues et écrites à chaque tick et chaque mouvement.

Cette décision peut être prise maintenant et n'impacte aucun calcul — seule
la déclaration de colonne en TypeORM change.

---

## 4. mapId par défaut

### 4.1 Entités sans mapId

Toutes les entités qui portent une position n'ont actuellement pas de `mapId` :

| Entité | Table | Colonnes position | mapId |
|---|---|---|---|
| `Character` | `character` | `positionX`, `positionY` | absent |
| `Animal` | `animals` | `x`, `y` | absent |
| `Resource` | `resources` | `x`, `y` | absent |
| `CreatureSpawn` | `creature_spawn` | `spawnX`, `spawnY` | absent |
| `RespawnPoint` | `respawn_point` | `x`, `y` | absent |

En mémoire, `ConnectedPlayer` dans `world.service.ts` contient `x` et `y` mais
pas de `mapId`. `client.data.player` dans les gateways est dans le même cas.

Aucune table `map` n'existe dans la base.

### 4.2 Contraintes de la valeur par défaut

La valeur par défaut doit :

1. **Être stable** : ne pas changer après la migration initiale, même si une
   vraie table `map` est ajoutée plus tard.
2. **Être convertible en FK** : si `mapId` est un entier, il peut devenir
   une FK vers une future table `map` sans changement de type de colonne.
3. **Permettre le code transitoire** : tout le code qui n'a pas encore de
   notion de map peut hardcoder la valeur par défaut sans violation de logique.

### 4.3 Valeur recommandée

**`mapId = 1` (entier)**.

Justification :
- Type `INT` compatible avec une future FK → table `map(id INT PRIMARY KEY)`.
- Sémantique claire : "la première map" = id 1.
- Aucun risque de collision avec des futurs mapId (qui seront 2, 3, …).
- Pas de problème d'encodage ou de casse (contrairement à une string `'default'`
  ou `'main'`).

### 4.4 Stratégie compatible multi-map

**Phase transitoire (maintenant → première table map)**

Tous les accès au `mapId` dans le code hardcodent `1` comme constante nommée :

```ts
// Constante à ajouter dans world-coordinates.ts
const DEFAULT_MAP_ID = 1;
```

Aucune décision ne prend `mapId` en paramètre mais toutes l'écrivent. Cela
prépare le refactoring.

**Phase future (ajout de la table map)**

Créer la table `map` avec un premier enregistrement `{ id: 1, name: 'world_01', ... }`.
Les FK sur les entités deviennent alors actives sans changer les valeurs stockées.
La constante `DEFAULT_MAP_ID = 1` reste valide et pointe vers un vrai enregistrement.

**Stratégie multi-map réelle**

Quand plusieurs maps existent, `mapId` devient le discriminant de toute requête
positionnelle. Les gateways devront propager le `mapId` du joueur à chaque
événement. Cette évolution est préparée dès la Phase 2 de la migration en
ajoutant `mapId` à toutes les entités et payloads — même si toutes les valeurs
sont `1` au moment de la migration.

### 4.5 Type de colonne pour mapId

`INT` non-nullable avec valeur par défaut `1`. La contrainte FK (`FOREIGN KEY
mapId REFERENCES map(id)`) sera ajoutée uniquement après la création de la table
`map`. Pendant la migration, la colonne est un entier libre (pas de FK active).

---

## 5. Format collision serveur

### 5.1 État actuel

**Client** : `collisions.json` = `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]`

Ce fichier liste les GIDs (tile IDs globaux Tiled) considérés comme bloquants.
Il est chargé par `MapLoader.js` pour configurer les collisions Phaser
(`map.setCollision(tileIndex)`). Usage strictement client.

**Serveur** : aucune donnée de collision. Le serveur ne valide pas la walkabilité.
`WorldService.checkInteraction` mentionné dans `CLAUDE.md` n'existe pas dans le code
actuel — la vérification de distance est faite directement dans `resources.gateway.ts`
via `isInRange`, sans walkabilité.

### 5.2 Lien avec WU, tile index et chunk

Après la migration WU, la walkabilité serveur se calcule ainsi :

```
tileX = worldX >> 10       // index de tile global axe X
tileY = worldY >> 10       // index de tile global axe Y
walkable = !grid[tileX][tileY]
```

Ce calcul dépend directement du module central (`tileXFromWU`). Il n'est donc
pas possible de valider la walkabilité côté serveur avant que le module central
existe (Phase 1 du plan de migration).

### 5.3 Format cible recommandé

**Format : tableau 2D booléen indexé par tile, chargé par map au démarrage du serveur.**

```ts
// Pour une map de largeur W et hauteur H en tiles :
type CollisionGrid = boolean[][];   // [tileX][tileY], true = bloquant

// Accès en O(1)
function isWalkable(worldX: number, worldY: number, grid: CollisionGrid): boolean {
  const tx = tileXFromWU(worldX);
  const ty = tileYFromWU(worldY);
  return !grid[tx]?.[ty] ?? true;   // hors-grille = walkable par défaut (ou false selon politique)
}
```

**Pourquoi ce format :**

- Accès O(1) par index de tile.
- Pour la map actuelle (64 × 64 = 4 096 tiles), la grille occupe 4 096 octets
  (ou ~512 octets si compressée en bitfield) — négligeable en mémoire.
- Générique : valide pour n'importe quelle map chargée.
- Lisible et debuggable sans outil spécial.

**Alternative compacte (bitfield par chunk) :**

```
chunk = Uint8Array(64 × 64 / 8 = 512 bytes)
bit = chunkData[(localTileY * 64 + localTileX) >> 3] >> (localTileX & 7) & 1
```

Plus compact (×8) mais moins lisible. Pertinent si des milliers de chunks sont
chargés simultanément. Pour l'échelle actuelle, le tableau 2D est préférable.

### 5.4 Source des données de collision

**Source recommandée : dériver le `CollisionGrid` serveur depuis les mêmes données
que le client.**

Options :

**A — Lire le fichier TMJ côté serveur** (recommandé)

Le serveur charge `terrain_pipeline_test.tmj` au démarrage, lit la couche de
tiles, et identifie les GIDs bloquants (liste identique à `collisions.json`).
Il construit un `CollisionGrid[tileX][tileY]`.

Avantage : source unique de vérité — le même fichier TMJ dicte la géographie
côté client et côté serveur. Toute modification de map est automatiquement
reflétée des deux côtés.

**B — Générer un fichier `collision-server.json`** à l'export Tiled

Un export post-process génère un fichier JSON plat `{ "blocked": [[tx, ty], ...] }`
que le serveur charge. Moins fragile mais introduit un artefact de build
supplémentaire.

### 5.5 Ce qui peut être fait avant ou après la migration WU

**Avant la migration** (independant, peut commencer dès maintenant) :

- Écrire le module de chargement de `CollisionGrid` côté serveur.
- Tester unitairement la fonction `isWalkable(worldX, worldY, grid)`.

Ces deux tâches ne dépendent d'aucune migration de position (elles opèrent
uniquement sur les indices de tiles).

**Après la migration** (dépend des coordonnées WU) :

- Brancher `isWalkable` dans `WorldGateway.handlePlayerMove` pour rejeter les
  positions invalides.
- Utiliser `isWalkable` dans `AnimalsService.doPatrolMovement` pour empêcher
  les animaux d'entrer dans des tuiles bloquées.

Le chargement de la collision peut être développé en parallèle de la Phase 1
(module central) sans conflit.

---

## 6. Résumé final

### 6.1 Décisions recommandées

| Point | Décision recommandée | Peut-on décider maintenant ? |
|---|---|---|
| **Offset tilemap** | `originX = 1000, originY = 0` pour mapId 1 (à affiner si décalage visuel gênant) | **Oui** |
| **Métrique distance** | **Chebyshev en WU** : `max(|Δwx|, |Δwy|) ≤ R` | **Oui** |
| **Type DB colonne** | **`INTEGER` (int32 signé)** | **Oui** |
| **mapId par défaut** | **`1` (int)** avec constante `DEFAULT_MAP_ID = 1` | **Oui** |
| **Format collision serveur** | Tableau 2D booléen `CollisionGrid[tileX][tileY]`, dérivé du TMJ | **Oui** (implémentation en parallèle) |

### 6.2 Décisions encore ouvertes

| Question | Pourquoi encore ouverte | Quand la trancher |
|---|---|---|
| Valeur exacte de `originX` | À vérifier visuellement en jouant après Phase 7 | Après Phase 7, affinement si besoin |
| Valeurs numériques de `MELEE_RANGE`, `RESOURCE_INTERACT_RANGE` en WU Chebyshev | Nécessitent gameplay testing après migration | Phase 8 |
| `NULL` vs `0` en politique hors-grille pour `isWalkable` | Dépend de si les entités peuvent être en bordure de map | Avant Phase B d'ADR-0003 |
| Table `map` réelle | Non requis pour la migration WU, mais requis pour FK active | Après Phase 8, en parallèle |

### 6.3 Risques résiduels

| Risque | Probabilité | Mitigation |
|---|---|---|
| `originX = 1000` décalé de quelques pixels par rapport au vrai vertex nord | Faible — valeur intentionnelle dans le commentaire | Mesure rapide en Phase 7, ajustable sans refactoring |
| Chebyshev change le ressenti des combats vs actuel (ellipse px) | Moyen | Recalibration explicite en Phase 8; pas régressif car les valeurs seront de toute façon recalibrées |
| `synchronize: true` drop + recreate les colonnes renommées, perte de données | Certain en dev | Réinitialiser la DB avant Phase 2 (seeds regénèrent tout) |
| CollisionGrid serveur désynchronisée avec TMJ client si format diverge | Faible si source unique TMJ | Lire le même fichier TMJ des deux côtés |

### 6.4 Ordre d'application recommandé

```
Décision 1 — mapId par défaut (1)          → immédiatement, simple
Décision 2 — INTEGER pour worldX/worldY    → immédiatement, simple
Décision 3 — Chebyshev en WU               → avant d'écrire isInRange WU
Décision 4 — originX = 1000, originY = 0  → avant de convertir les seeds en WU
Décision 5 — Format CollisionGrid           → en parallèle de la Phase 1 du plan
```

Les décisions 1 et 2 sont sans dépendances. Les décisions 3 et 4 doivent
précéder la calibration numérique (Phase 8). La décision 5 peut être développée
en parallèle dès la Phase 1.

---

## Related files

- [Plan de migration WU](coordinate-system-migration-plan.md)
- [ADR-0001 — Système de coordonnées](adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 — Positionnement des entités](adr/ADR-0002-entity-positioning.md)
- [ADR-0003 — Autorité serveur sur le mouvement](adr/ADR-0003-movement-authority.md)
- [World Units Study](../../docs/08_Gameplay/world-units-study.md)
- [Phaser World](../../docs/03_Client/phaser-world.md)
- [Maps and Collisions](../../docs/05_World/maps-and-collisions.md)
- [STATUS.md](../../STATUS.md)
