# ADR Consistency Review

## Metadata

- Status: Review
- Date: 2026-06-21
- Documents reviewed:
  - `docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md`
  - `docs/01_Architecture/adr/ADR-0002-entity-positioning.md`
  - `docs/01_Architecture/adr/ADR-0003-movement-authority.md`
  - `docs/08_Gameplay/movement-model.md`
  - `docs/08_Gameplay/movement-study.md`
  - `docs/08_Gameplay/world-units-study.md`
- Trigger: mise à jour d'ADR-0001 (renommage `worldTileX/worldTileY` → `worldX/worldY`,
  unité logique rendue ouverte)
- Ce document ne prend aucune décision. Il recense uniquement les incohérences.

---

## 1. Incohérences restantes

### 1.1 Renommage `worldTileX/worldTileY` → `worldX/worldY` non propagé

ADR-0001 utilise désormais `worldX` et `worldY` comme noms canoniques. Les cinq
autres documents utilisent encore `worldTileX` et `worldTileY` comme si la mise à
jour n'avait pas eu lieu.

| Document | Occurrences de `worldTileX/worldTileY` | Statut |
|---|---|---|
| ADR-0002 | Partout : colonnes, payloads, impacted components, open questions | Non mis à jour |
| ADR-0003 | Partout : context, validation pipeline, payload contracts, migration plan, open questions | Non mis à jour |
| movement-model.md | Section scope, bounds rule, speed formulas, pathfinding, server authority | Non mis à jour |
| movement-study.md | Fixed constraints, analyses, recommendations, code samples | Non mis à jour |
| world-units-study.md | Section "Current state" (intentionnel comme état actuel), puis mélange des deux conventions | Partiellement cohérent |

Conséquence directe : un lecteur qui ouvre ADR-0002 ou ADR-0003 après avoir lu ADR-0001
voit deux termes pour la même chose, sans explication de la relation entre eux.

### 1.2 Contradiction interne à ADR-0001 : Option B vs Decision

ADR-0001, section Considered options, Option B :

> "The server stores world positions as **tile coordinates** with sub-tile precision.
> This is the **selected option**."

ADR-0001, section Decision :

> "**The logical unit of `worldX` and `worldY` is not fixed by this ADR.** The unit —
> tile float, World Unit (WU), fixed-point sub-tile integer — is an open question."

Ces deux affirmations coexistent dans le même document. Option B déclare que le
système utilise des coordonnées en tiles et que c'est la décision retenue. La
section Decision dit que l'unité n'est pas encore tranchée.

L'intention est que le nom (`worldX/worldY`) est fixé et que l'unité reste ouverte.
Mais Option B ne distingue pas entre le nom et l'unité, ce qui crée la contradiction.

### 1.3 movement-model.md déclare l'unité comme fixée

`movement-model.md`, section Movement type :

> "Its position is expressed as `worldTileX` and `worldTileY` as defined by ADR-0001.
> **The unit is one tile.**"

`movement-model.md`, section Speed, Base speed :

> "Every entity has a `baseSpeed` expressed in **tiles per second**."

Ces déclarations posent l'unité comme décidée. Après la mise à jour d'ADR-0001, elles
sont en contradiction avec la question ouverte sur l'unité logique.

La même contradiction se retrouve dans les formules d'intégration du mouvement :

```
worldTileX += dirX × effectiveSpeed × dt
worldTileY += dirY × effectiveSpeed × dt
```

Si l'unité n'est pas "un tile", ces formules sont incomplètes (les unités de
`effectiveSpeed` et `dt` sont sous-spécifiées).

### 1.4 movement-study.md déclare l'unité comme fixée dans ses contraintes fixes

`movement-study.md`, Fixed constraints (troisième bullet) :

> "Every entity has a continuous logical position expressed in `worldTileX / worldTileY`
> (ADR-0001). **The unit is one tile.** The fractional part represents sub-tile offset."

Cette section est intitulée "Fixed constraints — These constraints are not open questions."
Elle positionne l'unité = 1 tile comme un fait non discutable, ce qui est maintenant
contradictoire avec ADR-0001.

### 1.5 Erreur dans un exemple de code de movement-study.md

`movement-study.md`, ligne 85-86 :

```js
newX = creature.x + dirX * speed * dt
newY = creature.y + creature.y + dirY * speed * dt   ← creature.y apparaît deux fois
```

La ligne `newY` contient `creature.y + creature.y` au lieu de `creature.y`. Il s'agit
d'une copie du code source avec une coquille. Ce n'est pas une incohérence
architecturale mais une erreur dans le document d'étude.

---

## 2. Hypothèses contradictoires

### 2.1 Métrique de distance dans ADR-0003 sous-spécifiée

ADR-0003, section Distance gate :

```
distance ≤ effectiveSpeed × dt × tolerance
```

Cette formule suppose que `distance`, `effectiveSpeed` et `dt` sont dans des unités
cohérentes. Après la mise à jour d'ADR-0001, les unités de `distance` sont
indéterminées : distance en tiles ? en WU ? en pixels ?

De plus, `world-units-study.md` démontre que la distance euclidienne en espace tile
n'est pas proportionnelle à la distance euclidienne en espace pixel pour la
projection isométrique actuelle. La formule du distance gate ne précise pas dans
quel espace la distance est calculée.

Si ADR-0003 est implémenté avec `worldX/worldY` en tiles et `Math.hypot(Δx, Δy)`
en espace tile, la portée effective en pixels varie selon la direction (71.55 px/tile
sur les axes, 45.25 px/tile sur la diagonale X+Y, 90.51 px/tile sur la diagonale
X-Y). Le jeu de tir ou de mêlée aura une portée visuellement incohérente selon l'axe
d'approche.

### 2.2 ADR-0003 migration step 0.1 : libellé incomplet après ADR-0001

ADR-0003, Phase 0, step 0.1 :

> "Resolve ADR-0001 **storage type** and **conversion factor**"

Après la mise à jour d'ADR-0001, la question primaire bloquant tout le reste est
le **choix de l'unité logique**, qui précède le type de stockage. Le libellé de
step 0.1 ne mentionne pas la question sur l'unité, alors qu'elle est désormais
explicitement ouverte dans ADR-0001.

Formulation correcte attendue : "Resolve ADR-0001 logical unit choice, then storage
type and conversion factor."

### 2.3 ADR-0002 suppose une colonne nommée `worldTileX/worldTileY`

ADR-0002 décide :

> "All position-bearing entities adopt the following columns: `worldTileX`, `worldTileY`"

Or ADR-0001 dit désormais que les noms canoniques sont `worldX` et `worldY`.
ADR-0002 prend une décision de nommage de colonne qui contredit son document de
dépendance.

Cette contradiction affecte directement les noms de colonnes qui seront générés
par TypeORM si ADR-0002 est implémenté tel quel.

### 2.4 Bounds check : deux formulations légèrement différentes

`movement-model.md`, Map boundary rule :

```
0 ≤ worldTileX < mapWidthTiles
mapWidthTiles = mapWidthChunks × CHUNK_SIZE
```

`ADR-0003`, section 2, check 2 :

```
0 ≤ worldTileX < mapWidthChunks × CHUNK_SIZE
```

Ces deux expressions sont mathématiquement équivalentes, mais `movement-model.md`
introduit les variables intermédiaires `mapWidthTiles` et `mapHeightTiles` absentes
d'ADR-0003. La cohérence formelle est assurée, mais la définition des variables
diffère entre les deux documents.

---

## 3. Termes encore ambigus

| Terme | Document(s) | Ambiguïté |
|---|---|---|
| `worldTileX / worldTileY` | ADR-0002, ADR-0003, movement-model.md, movement-study.md | Ancien nom canonique, remplacé par `worldX/worldY` dans ADR-0001 mais pas dans les autres documents |
| `worldX / worldY` | ADR-0001, world-units-study.md (partiel) | Nouveau nom canonique, absent d'ADR-0002 et ADR-0003 |
| "tile units" | movement-model.md, movement-study.md, ADR-0002, ADR-0003 | Suppose que l'unité = 1 tile, mais ADR-0001 laisse l'unité ouverte |
| "WU" (World Unit) | ADR-0001 Decision, world-units-study.md | Introduit comme candidat pour l'unité logique. Non défini formellement. Absent d'ADR-0002 et ADR-0003. |
| "tile coordinates" | ADR-0001 Option B, ADR-0002 Rationale | Désigne le système de coordonnées mais implique implicitement que l'unité est le tile |
| "sub-tile precision" | ADR-0002, movement-model.md, movement-study.md | "Sub-tile" implique que le tile est l'unité de base. Contradictoire avec l'unité ouverte d'ADR-0001. |
| "pixel-equivalent" | Tous les documents | Désigne les valeurs actuelles (Phaser world px). Ne signifie pas "screen pixels" (px Phaser ≠ px écran en cas de zoom). |
| "screenX / screenY" | ADR-0001, movement-model.md, movement-study.md | Désigne les Phaser world pixels selon ADR-0001 mais pourrait être interprété comme des pixels écran physiques |
| "conversion factor" | ADR-0001 OQ, ADR-0003 step 0.1, movement-study.md | `world-units-study.md` démontre qu'il n'y a pas de facteur scalaire unique. Le terme "conversion factor" est donc trompeur. |
| `HALF_TILE_W = 64`, `HALF_TILE_H = 32` | ADR-0001, movement-model.md | Ces constantes sont valides pour la projection isométrique si et seulement si `worldX/worldY` est en tiles. Si l'unité change, leur valeur change. |

---

## 4. Dépendances entre ADR

### Dépendances déclarées

```
ADR-0001
  └── ADR-0002 (dépend de ADR-0001)
       └── ADR-0003 (dépend de ADR-0001, ADR-0002)
```

### Dépendances manquantes

| Document | Devrait dépendre de | Statut |
|---|---|---|
| ADR-0002 | `world-units-study.md` | Non déclaré. ADR-0002 prend des décisions de nommage de colonnes sans référencer l'étude qui analyse les unités. |
| ADR-0003 | `world-units-study.md` | Non déclaré. ADR-0003 spécifie des formules de validation de distance sans référencer l'étude qui démontre la non-scalarité de la conversion. |
| movement-model.md | ADR-0003 | Non déclaré. movement-model.md définit le modèle de mouvement que ADR-0003 cite comme document de référence, mais le lien inverse est absent. movement-model.md a été créé avant ADR-0003. |
| movement-study.md | ADR-0003 | Non déclaré. La recommandation de movement-study.md (Approach B) correspond exactement à ce que ADR-0003 propose, mais le lien est absent. |

### Tension dans la hiérarchie de dépendance

`world-units-study.md` est le document d'analyse qui doit précéder toute décision
sur l'unité logique. Or ADR-0001, ADR-0002 et ADR-0003 ont été rédigés avant lui.
La hiérarchie formelle de dépendance est donc inversée par rapport à l'ordre logique
de décision :

```
Ordre logique attendu :
world-units-study.md → [décision unité] → ADR-0001 complet → ADR-0002 → ADR-0003

Ordre réel de rédaction :
ADR-0001 (partiel) → ADR-0002 → ADR-0003 → world-units-study.md
→ [ADR-0001 mis à jour pour ouvrir la question d'unité]
```

---

## 5. Décisions encore ouvertes

Les décisions ouvertes ci-dessous sont classées par domaine. Leur identification est
exhaustive au regard des six documents relus. Certaines sont déjà listées dans les
sections Open questions des ADR ; elles sont reprises ici de façon consolidée.

### Domaine A — Unité logique de monde (bloquant tout le reste)

| # | Question | Document porteur |
|---|---|---|
| A.1 | Quel est l'unité logique de `worldX/worldY` ? (tile float, WU, sous-tile entier, autre) | ADR-0001 OQ #1, world-units-study.md OQ #1 |
| A.2 | L'unité est-elle un scalaire unique ou varie-t-elle par axe ? (`world-units-study.md` démontre que la conversion px→tile est directionnelle) | world-units-study.md OQ #3 |
| A.3 | Quelle précision sous-tile est nécessaire au niveau de la simulation serveur ? | ADR-0001 OQ #4, world-units-study.md OQ #4 |

### Domaine B — Stockage base de données (dépend de A)

| # | Question | Document porteur |
|---|---|---|
| B.1 | Quel type de colonne DB pour `worldX/worldY` ? (FLOAT, DOUBLE PRECISION, INT pair, fixed-point) | ADR-0001 OQ #2, ADR-0002 OQ dernier |
| B.2 | Quel type et quelle FK target pour `mapId` ? | ADR-0002 OQ #1 |
| B.3 | Quelle valeur de `mapId` par défaut pendant la migration ? | ADR-0002 OQ #4 |

### Domaine C — Conversion et calibration (dépend de A)

| # | Question | Document porteur |
|---|---|---|
| C.1 | Quel est l'offset tilemap final ? (`TILEMAP_TEST_OFFSET_X = 936` est temporaire) | world-units-study.md OQ #5 |
| C.2 | Comment convertir les vitesses actuelles en pixel-équivalent vers l'unité logique choisie ? | ADR-0001 OQ #3, movement-study.md OQ #1 |
| C.3 | Comment convertir les constantes de portée (`MELEE_RANGE = 60`, `RESOURCE_INTERACT_RANGE = 100`) vers l'unité logique choisie ? | ADR-0001 OQ #3, movement-model.md OQ #3 |

### Domaine D — Checks de distance et portée de gameplay (dépend de A et C)

| # | Question | Document porteur |
|---|---|---|
| D.1 | Quelle métrique de distance pour les checks de portée après migration ? (Euclidien tile, Euclidien px, Chebyshev, Manhattan) | world-units-study.md OQ #2 |
| D.2 | Quel facteur de tolérance pour le distance gate d'ADR-0003 ? | ADR-0003 OQ #1 |
| D.3 | Sur quel clic vs drag : refus ou clamp de destination hors bounds ? | movement-model.md OQ #7 |

### Domaine E — Validation côté serveur (dépend de A, B, D)

| # | Question | Document porteur |
|---|---|---|
| E.1 | Format et livraison des données de collision au serveur (TMJ, fichier séparé, colonne DB) | ADR-0003 OQ #6, OQ #7 |
| E.2 | Nom de l'événement de correction (`player_position_correction` proposé) | ADR-0003 OQ #2 |
| E.3 | UX de correction côté client (snap ou lerp) | ADR-0003 OQ #3 |
| E.4 | Validation event-driven ou tick serveur pour les joueurs ? | ADR-0003 OQ #5 |

### Domaine F — Modèle de prédiction et réconciliation (futur)

| # | Question | Document porteur |
|---|---|---|
| F.1 | Quand introduire la prédiction + réconciliation avec sequence numbers ? | ADR-0003 OQ #4, movement-study.md OQ #3 |
| F.2 | Le pathfinding doit-il s'exécuter côté serveur ou côté client ? | movement-model.md OQ #10, movement-study.md OQ #6 |
| F.3 | Protocole de transition de map (changement de `mapId` en live) | ADR-0003 OQ #10 |

### Domaine G — Migration (dépend de tous les autres)

| # | Question | Document porteur |
|---|---|---|
| G.1 | Ordre de migration des entités (quelle entité en premier, stratégie atomique) | ADR-0002 OQ #2 |
| G.2 | Comment convertir les positions pixel existantes en DB ? (positions dans tuiles bloquées après conversion ?) | ADR-0003 OQ #8, ADR-0002 OQ #3 |
| G.3 | Compatibilité de payload pendant la transition (double format ou hard cutover ?) | ADR-0002 OQ #5 |

---

## 6. Recommandations d'ordre de décision avant toute migration du code

Les décisions ci-dessous doivent être prises dans cet ordre. Chaque item est bloqué
par ceux qui le précèdent.

### Palier 1 — Décisions architecturales préalables (ne bloque pas de code existant)

**1a. Valider ADR-0001, ADR-0002, ADR-0003.**
Les trois ADR sont en état Draft/Proposed. Aucun code ne doit être migré avant
qu'ils soient approuvés, car toute modification non approuvée pourrait être contredite
par une correction d'ADR.

**1b. Mettre à jour ADR-0002 et ADR-0003 pour utiliser `worldX/worldY`.**
Les deux documents utilisent encore `worldTileX/worldTileY`. Les ramener en cohérence
avec ADR-0001 est une correction de terminologie sans impact sur les décisions.

### Palier 2 — Décisions bloquant l'implémentation (must have avant tout code)

**2a. Décider l'unité logique (A.1).**
C'est la décision primaire. Toutes les autres en dépendent. Entrée : `world-units-study.md`.
Cette décision tranche entre les quatre configurations (A, B, C, D de l'étude).

**2b. Décider le type de stockage DB (B.1).**
Découle de 2a. Si l'unité est tile float → DOUBLE ou FLOAT. Si sous-tile entier →
BIGINT ou INT. Ce choix détermine le type TypeORM de toutes les colonnes de position.

**2c. Décider l'offset tilemap final (C.1).**
`TILEMAP_TEST_OFFSET_X = 936` est explicitement temporaire. Sa valeur finale est
nécessaire pour exprimer l'origine par-map, pour calibrer les seeds, et pour vérifier
les formules de projection.

**2d. Décider la valeur de `mapId` pour les entités existantes pendant la migration (B.3).**
Sans cette décision, aucune entité ne peut recevoir `mapId`. Un placeholder (`"map_default"`,
`1`, etc.) suffit pour démarrer la migration, mais il doit être décidé explicitement.

### Palier 3 — Calibration des constantes (après 2a et 2c)

**3a. Exprimer `player.speed`, `speedMin/Max`, `aggroRadius`, `patrolRadius`
dans l'unité logique choisie.**
Actuellement en px-équivalent. Dépend de 2a (unité) et de 2c (offset, pour valider
les formules de conversion isométriques).

**3b. Exprimer `MELEE_RANGE`, `RESOURCE_INTERACT_RANGE`, `MOVE_TOLERANCE`
dans l'unité logique choisie, et choisir la métrique de distance (D.1).**
La métrique de distance doit être décidée en même temps que les valeurs de constantes,
car elle change leur signification (cercle en pixels ≠ cercle en tiles dans une
projection isométrique — cf. `world-units-study.md`).

### Palier 4 — Infrastructure de validation (après palier 3)

**4a. Décider le format et la livraison des données de collision serveur (E.1).**
Prérequis pour ADR-0003 step 1.4 (walkability check). Peut être traité en parallèle
de 3a et 3b mais doit être résolu avant d'implémenter les checks serveur.

**4b. Décider le facteur de tolérance du distance gate (D.2).**
Dépend de 3a (vitesses calibrées) et de mesures réseau sous conditions réelles.
Ne peut pas être décidé théoriquement.

### Palier 5 — Implémentation (après validation des paliers 1-4)

Ordre d'implémentation recommandé selon ADR-0002 et ADR-0003 :

1. Entités statiques (resources, creature_spawn, respawn_point) — pas d'état runtime
2. WebSocket payloads (avec double format temporaire si nécessaire)
3. Entité character + player_move validation côté serveur
4. Entité creature + recalibration du tick
5. Client pathfinding (rebuid de la grille)
6. Distance gate + walkability check + bounds check

---

## Annexe — Matrice de cohérence par paire de documents

| Document | ADR-0001 | ADR-0002 | ADR-0003 | movement-model | movement-study | world-units-study |
|---|---|---|---|---|---|---|
| ADR-0001 | — | Contradition nommage (§1.3) | Contradiction nommage (§1.3) | Contradiction unité (§1.3, §1.4) | Contradiction unité (§1.4) | Cohérent |
| ADR-0002 | Contradiction nommage | — | Cohérent | Contradiction nommage | Contradiction nommage | Référence manquante |
| ADR-0003 | Contradiction nommage + step 0.1 (§2.2) | Cohérent | — | Cohérent en intention | Cohérent en intention | Référence manquante |
| movement-model | Contradiction unité | Contradiction nommage | Cohérent en intention | — | Cohérent | Référence manquante |
| movement-study | Contradiction unité | Contradiction nommage | Lien inverse absent | Cohérent | — | Référence manquante |
| world-units-study | Cohérent | Contradiction nommage | Contradiction nommage | Contradiction nommage | Contradiction nommage | — |

"Contradiction nommage" : `worldTileX/worldTileY` vs `worldX/worldY`.
"Contradiction unité" : "unit is one tile" vs "unit is an open question".
"Référence manquante" : document non cité alors qu'une dépendance existe.
"Cohérent en intention" : les décisions s'alignent malgré le nommage divergent.
