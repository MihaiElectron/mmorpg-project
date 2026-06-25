# Audit de compatibilité DB — Migration World Units (WU)

## Métadonnées

- Status: Draft — lecture seule, aucune migration implémentée
- Owner: Project
- Last updated: 2026-06-22
- Depends on: ADR-0001, ADR-0002, coordinate-system-migration-plan.md,
  coordinate-system-phase-0-decisions.md
- Scope: entités TypeORM, configuration TypeORM, seeds, valeurs hardcodées

---

## 1. État actuel des entités TypeORM liées aux coordonnées

### 1.1 `character` (table `character`)

Fichier : `src/characters/entities/character.entity.ts`

| Colonne | Type TypeORM | Type PG inféré | Nullable | Défaut | Rôle |
|---|---|---|---|---|---|
| `positionX` | `@Column({ default: 400 })` | `integer` | non | `400` | Position X en pixels Phaser |
| `positionY` | `@Column({ default: 300 })` | `integer` | non | `300` | Position Y en pixels Phaser |

- Pas de `mapId`.
- `positionX` et `positionY` sont des entiers signés PostgreSQL (`integer = int4`).
  Leur type est déjà compatible avec la future colonne `worldX / worldY`.
- Les valeurs par défaut (`400`, `300`) sont des pixels Phaser.
  Après migration : `400 px ≈ worldX = (400 − 1000) × 16 = −9600 WU` — négatif,
  donc hors de la grille de jeu isométrique. Le défaut devra être recalibré.
- Aucun conflit structurel de type, mais conflit sémantique sur les valeurs stockées.

### 1.2 `creatures` (table `creatures`)

Fichier : `src/creatures/entities/creature.entity.ts`

| Colonne | Type TypeORM | Type PG inféré | Nullable | Défaut |
|---|---|---|---|---|
| `x` | `@Column('int')` | `integer` | non | aucun |
| `y` | `@Column('int')` | `integer` | non | aucun |

- Pas de `mapId`.
- Types `int` explicites : compatibles avec WU.
- Valeurs à l'écriture : copiées depuis `spawn.spawnX` / `spawn.spawnY` au démarrage,
  puis mises à jour en continu par `CreaturesService` via arithmétique pixel.
- Les colonnes `x` et `y` portent des noms courts qui **n'indiquent pas l'espace de
  coordonnées**. Après migration, des colonnes `worldX / worldY` distinctes évitent
  toute ambiguïté.

### 1.3 `resources` (table `resources`)

Fichier : `src/resources/entities/resource.entity.ts`

| Colonne | Type TypeORM | Type PG inféré | Nullable | Défaut |
|---|---|---|---|---|
| `x` | `@Column('int')` | `integer` | non | aucun |
| `y` | `@Column('int')` | `integer` | non | aucun |

- Pas de `mapId`.
- Même situation que `creatures` : noms courts, types int compatibles, valeurs pixel.
- Les ressources sont placées manuellement via le drag-and-drop admin.
  Les coordonnées enregistrées sont les positions Phaser au moment du drop.
- Aucune mise à jour continue en runtime (ressources statiques), donc pas de
  double-écriture pendant la migration.

### 1.4 `creature_spawn` (table `creature_spawn`)

Fichier : `src/creatures/entities/creature-spawn.entity.ts`

| Colonne | Type TypeORM | Type PG inféré | Nullable | Défaut |
|---|---|---|---|---|
| `spawnX` | `@Column('int')` | `integer` | non | aucun |
| `spawnY` | `@Column('int')` | `integer` | non | aucun |

- Pas de `mapId`.
- Types int compatibles avec WU.
- `spawnX` / `spawnY` sont les positions de spawn des animaux.
  Ils sont utilisés comme point de référence pour le patrol (`creature.spawn.spawnX`)
  et pour la contrainte de leash. Toute la logique de patrol dans `CreaturesService`
  repose sur ces valeurs en pixels.
- La colonne `key` a une contrainte `UNIQUE`.

### 1.5 `respawn_point` (table `respawn_point`)

Fichier : `src/world/entities/respawn-point.entity.ts`

| Colonne | Type TypeORM | Type PG inféré | Nullable | Défaut |
|---|---|---|---|---|
| `x` | `@Column('int')` | `integer` | non | aucun |
| `y` | `@Column('int')` | `integer` | non | aucun |
| `radius` | `@Column('int', { default: 20 })` | `integer` | non | `20` |

- Pas de `mapId`.
- `radius` est en pixels (distance Euclidienne).
  Après migration, `radius` devra être exprimé en WU.
- Une seule ligne existante (seedée au démarrage avec `x=600, y=300, radius=20`).

### 1.6 Résumé — conformité des types actuels

| Entité | Colonnes pixel actuelles | Type actuel PG | Conflit de type avec WU | Conflit de valeur |
|---|---|---|---|---|
| `character` | `positionX`, `positionY` | `integer` | **Non** | **Oui** — valeurs pixel |
| `creatures` | `x`, `y` | `integer` | **Non** | **Oui** — valeurs pixel |
| `resources` | `x`, `y` | `integer` | **Non** | **Oui** — valeurs pixel |
| `creature_spawn` | `spawnX`, `spawnY` | `integer` | **Non** | **Oui** — valeurs pixel |
| `respawn_point` | `x`, `y`, `radius` | `integer` | **Non** | **Oui** — valeurs pixel |

Bonne nouvelle : aucun type de colonne ne change pour passer en WU. Seules les
**valeurs stockées** sont actuellement incorrectes (elles sont en pixels Phaser).

---

## 2. État actuel des migrations existantes

Résultat de recherche : **aucun fichier de migration TypeORM n'existe dans le
dépôt** (`find` ne retourne aucun résultat dans `src/migrations/` ou autre
répertoire de migration).

La configuration TypeORM dans `app.module.ts` ne spécifie pas de clé `migrations`,
`migrationsRun`, ni `migrationsTableName`. Le projet fonctionne entièrement en
mode `synchronize: true` — TypeORM inspecte les entités au démarrage et aligne
le schéma automatiquement.

**Conséquences :**
- Il n'y a aucune migration SQL à risque de conflits avec l'ajout de colonnes WU.
- Il n'y a aucune migration à mettre à jour ou à rejouer.
- Il n'y a aucune migration qui seede des coordonnées.
- Les seeds sont intégrées directement dans les services (`OnModuleInit`) et ne
  passent pas par le système de migrations TypeORM.

---

## 3. État actuel des seeds et valeurs hardcodées

### 3.1 Personnage — position par défaut

Fichier : `src/world/world.service.ts:140`

```ts
x: character.positionX ?? payload.x ?? 400,
y: character.positionY ?? payload.y ?? 300,
```

**Valeur fallback :** `(400, 300)` — pixels Phaser. Ce fallback est aussi le
défaut TypeORM dans l'entité (`@Column({ default: 400 })`).

### 3.2 Creature — seed de spawn

Fichier : `src/creatures/creatures.service.ts:638`

```ts
spawnX: 600,
spawnY: 580,
```

Seul spawn seedé : `turkey_spawn_1` à `(600, 580)` en pixels Phaser.
L'instance creaturee est créée avec `x = spawn.spawnX`, `y = spawn.spawnY`.

### 3.3 Respawn point — seed unique

Fichier : `src/world/world.service.ts:56`

```ts
{ x: 600, y: 300, radius: 20 }
```

Un seul `RespawnPoint` hardcodé. Le `radius: 20` est en pixels. Il sert à la
fonction `findNearestRespawnPoint` qui utilise `Math.hypot` pour trouver le point
le plus proche d'un personnage mourant.

### 3.4 Ressources — aucune seed de position

Les seeds de ressources (`resources.service.ts:22`) ne seèdent que les templates
(`dead_tree`, `ore`) sans position. Les ressources concrètes sont placées par
drag-and-drop admin et stockent les positions Phaser reçues du client.

### 3.5 Coordonnées passées par l'API admin

L'admin panel envoie des positions depuis le client Phaser via WebSocket.
Ces positions sont des pixels Phaser bruts. Elles sont stockées sans transformation
dans :

- `creatures_spawn.spawnX / spawnY` (via `admin.gateway.ts:handleSpawn`)
- `resources.x / y` (via `admin.gateway.ts:handleAddResource`)
- Téléportation : `character.positionX / positionY` (via
  `world.service.ts:teleportCharacter`)

**Toutes les coordonnées actuellement en base sont des pixels Phaser.**

---

## 4. Configuration TypeORM

### 4.1 `synchronize: true`

Fichier : `src/app.module.ts:55`

```ts
synchronize: true, // auto-create/update tables pour dev
```

Ce paramètre est actif en développement. Son comportement lors de l'ajout de
colonnes WU est prévisible mais doit être anticipé :

**Ajout de colonne nullable :** TypeORM émet un `ALTER TABLE ... ADD COLUMN ...`
sans détruire les données existantes. Sûr.

**Ajout de colonne NOT NULL sans défaut :** TypeORM échoue si des lignes
existent déjà (erreur PostgreSQL). Les nouvelles colonnes WU doivent être
déclarées **nullable** ou avec une `default` dans l'entité avant d'être
peuplées.

**Renommage de colonne :** TypeORM ne supporte pas le renommage. Il émet un
`DROP COLUMN` suivi d'un `ADD COLUMN`, ce qui détruit les données. À éviter
absolument — ne jamais renommer `positionX` en `worldX` via l'entité seule.

**Suppression de colonne de l'entité :** TypeORM ne supprime pas les colonnes
orphelines (comportement par défaut `synchronize: true`). Les anciennes colonnes
pixel restent en base même si retirées de l'entité. Cela autorise une
coexistence temporaire.

### 4.2 Aucun système de migrations actif

Il n'existe pas de `DataSource` exportée, pas de fichier `typeorm.config.ts`,
pas de répertoire `migrations/`. La première migration réelle devra configurer
tout cela.

### 4.3 Risque dev vs prod

En **dev** : `synchronize: true` applique les changements automatiquement au
démarrage. Risque limité car les données sont régénérées par les seeds.

En **prod** : `synchronize: true` est documenté comme à désactiver (commentaire
dans `app.module.ts`). Aucune production n'est en place actuellement.
Le risque prod est nul pour l'instant, mais la migration WU doit être accompagnée
de la mise en place d'un système de migrations TypeORM avant tout déploiement.

---

## 5. Risques d'interférence identifiés

### 5.1 Colonnes actuelles encore utilisées massivement par le runtime

Toutes les colonnes pixel sont lues et écrites en continu :

- `character.positionX / positionY` : lues à la connexion, écrites à chaque
  déplacement (`world.service.ts:189–190`) et au respawn (`world.service.ts:246`).
- `creature.x / y` : lues et écrites à chaque tick patrol/fight/escape dans
  `CreaturesService` (≈ 5 ticks/seconde).
- `creature_spawn.spawnX / spawnY` : lues à chaque tick pour calculer le patrol
  radius et la contrainte de leash. Jamais écrites après le seed.
- `resource.x / y` : lues au démarrage et à chaque `findAll`.
- `respawn_point.x / y` : lues à chaque mort de personnage.

Aucune de ces colonnes ne peut être supprimée avant que le runtime soit
entièrement migré vers les colonnes WU.

### 5.2 Nouvelles colonnes absentes

`worldX`, `worldY`, `mapId` n'existent dans aucune entité ni aucune table.
Tout code qui tenterait de lire `character.worldX` obtiendrait `undefined`.

### 5.3 Données existantes en pixels Phaser

La conversion depuis les valeurs pixel actuelles vers WU dépend de la formule
inverse de projection isométrique :

```
worldX = round(8 × (pxX − originX) + 16 × (pxY − originY))
worldY = round(−8 × (pxX − originX) + 16 × (pxY − originY))
```

Avec `originX = 1000`, `originY = 0`.

**Exemples de conversion des seeds actuelles :**

| Entité | pxX | pxY | worldX (WU) | worldY (WU) | Tile (tileX, tileY) |
|---|---|---|---|---|---|
| `character` défaut | 400 | 300 | `round(8×(−600) + 16×300)` = **0** | `round(−8×(−600) + 16×300)` = **9600** | (0, 9) |
| `turkey_spawn_1` | 600 | 580 | `round(8×(−400) + 16×580)` = **6080** | `round(−8×(−400) + 16×580)` = **12480** | (5, 12) |
| `respawn_point` | 600 | 300 | `round(8×(−400) + 16×300)` = **1600** | `round(−8×(−400) + 16×300)` = **8000** | (1, 7) |

Ces valeurs WU correspondent à des positions dans la grille isométrique visible.
La conversion est mathématiquement déterministe et réversible.

**Cas limite :** le personnage par défaut à `(400, 300)` donne `worldX = 0,
worldY = 9600` — soit la tile (0, 9), qui est dans la première colonne
isométrique, 9 tiles en bas. Visuellement correct si la map est suffisamment
grande, mais la position par défaut devrait être recalibrée vers un point de
départ visible (ex : tile (5, 5) = WU (5120, 5120) ≈ pixels (1000+0, 320)).

### 5.4 Risque de double source de vérité

Si des colonnes `worldX / worldY` sont ajoutées sans retirer les anciennes,
deux représentations de la même position coexistent en DB. Tout code qui lit
l'une mais écrit l'autre désynchronise les deux. C'est le risque principal de
la Phase transitoire.

Mitigation : pendant la Phase transitoire, maintenir un service centralisé
(`WorldCoordinateAdapter`) qui encapsule la lecture/écriture dans les deux
colonnes simultanément.

### 5.5 Risque d'écriture dans les anciennes colonnes après ajout des nouvelles

`CreaturesService` repose entièrement sur `creature.x` et `creature.y` pour le mouvement
(40+ références directes aux colonnes pixel). Ces valeurs sont calculées via
arithmétique pixel (`dx/dist * speed * dt`). Après l'ajout des colonnes WU, si
le code continue d'écrire `creature.x / y` en pixel et que le runtime commence à
lire `creature.worldX / worldY`, les deux divergent immédiatement.

La bascule doit donc être atomique par module : soit le module entier lit/écrit
en WU, soit il reste entièrement en pixel. Pas de mélange intra-module.

---

## 6. Stratégie de migration DB sûre (sans implémentation)

### Étape 1 — Ajouter les nouvelles colonnes, nullables, sans supprimer les anciennes

Pour chaque entité impactée, ajouter les colonnes suivantes avec `nullable: true`
(pour ne pas bloquer `synchronize: true`) :

```
worldX     INTEGER NULL
worldY     INTEGER NULL
mapId      INTEGER NULL DEFAULT 1
```

La valeur `DEFAULT 1` sur `mapId` permet à `synchronize: true` de peupler
automatiquement les lignes existantes avec `mapId = 1`.
`worldX` et `worldY` restent NULL jusqu'au backfill.

Précondition : réinitialiser la DB de dev (les données sont régénérées par les
seeds) plutôt que de gérer des migrations complexes sur des données de dev.

### Étape 2 — Backfill des colonnes WU depuis les colonnes pixel

Exécuter un script SQL ou une migration TypeORM de backfill :

```sql
-- character
UPDATE character
SET "worldX" = ROUND(8 * ("positionX" - 1000) + 16 * ("positionY" - 0)),
    "worldY" = ROUND(-8 * ("positionX" - 1000) + 16 * ("positionY" - 0));

-- creatures
UPDATE creatures
SET "worldX" = ROUND(8 * (x - 1000) + 16 * (y - 0)),
    "worldY" = ROUND(-8 * (x - 1000) + 16 * (y - 0));

-- creature_spawn
UPDATE creature_spawn
SET "worldX" = ROUND(8 * ("spawnX" - 1000) + 16 * ("spawnY" - 0)),
    "worldY" = ROUND(-8 * ("spawnX" - 1000) + 16 * ("spawnY" - 0));

-- resources
UPDATE resources
SET "worldX" = ROUND(8 * (x - 1000) + 16 * (y - 0)),
    "worldY" = ROUND(-8 * (x - 1000) + 16 * (y - 0));

-- respawn_point
UPDATE respawn_point
SET "worldX" = ROUND(8 * (x - 1000) + 16 * (y - 0)),
    "worldY" = ROUND(-8 * (x - 1000) + 16 * (y - 0));
```

En dev, il est préférable de réinitialiser la DB et de recalibrer les seeds
directement en WU plutôt que de backfiller des données de dev.

### Étape 3 — Double lecture temporaire si nécessaire

Pendant la bascule runtime, certains services peuvent lire les nouvelles colonnes
WU tout en continuant d'écrire dans les anciennes pour les modules non encore
migrés. Ce n'est recommandé que si la migration est déployée de manière
progressive par module.

En dev avec `synchronize: true`, la double lecture n'est pas nécessaire : on
peut basculer module par module et réinitialiser la DB entre les phases.

### Étape 4 — Bascule runtime

Module par module (ordre recommandé dans le plan de migration) :

1. `world.service.ts` — lecture/écriture `worldX/worldY` pour `character`
2. `creatures.service.ts` — lecture/écriture `worldX/worldY` pour `creatures` et
   `creature_spawn`
3. `resources.gateway.ts` — lecture `worldX/worldY` pour `resources`
4. `admin.gateway.ts` et `admin.service.ts` — lecture/écriture admin en WU

Chaque bascule doit s'accompagner d'une réinitialisation de la DB de dev (seeds
recalibrées en WU).

### Étape 5 — Suppression des anciennes colonnes (uniquement après validation)

Supprimer `positionX`, `positionY`, `x`, `y`, `spawnX`, `spawnY` des entités
**uniquement** après :

- Validation gameplay complète en WU.
- Tests manuels sur la map (alignement visuel sprites/tiles).
- Confirmation que le runtime ne lit plus jamais les anciennes colonnes.

Sous `synchronize: true`, retirer la propriété de l'entité TypeORM ne supprime
pas la colonne en DB — la suppression doit être faite via une migration SQL
explicite.

---

## 7. Validations SQL à effectuer après le backfill

Ces requêtes doivent être exécutées pour vérifier l'intégrité des données
avant la bascule runtime.

### 7.1 Compter les lignes avec `worldX / worldY` null

```sql
SELECT COUNT(*) FROM character WHERE "worldX" IS NULL OR "worldY" IS NULL;
SELECT COUNT(*) FROM creatures   WHERE "worldX" IS NULL OR "worldY" IS NULL;
SELECT COUNT(*) FROM creature_spawn WHERE "worldX" IS NULL OR "worldY" IS NULL;
SELECT COUNT(*) FROM resources WHERE "worldX" IS NULL OR "worldY" IS NULL;
SELECT COUNT(*) FROM respawn_point WHERE "worldX" IS NULL OR "worldY" IS NULL;
```

Résultat attendu après backfill : `0` pour chaque requête.

### 7.2 Vérifier la cohérence pixel ↔ WU (round-trip)

```sql
-- Vérifier que la reconversion WU → pixel retrouve les pixels d'origine
SELECT id,
  "positionX", "positionY",
  "worldX", "worldY",
  ROUND((("worldX" - "worldY")::float / 16) + 1000) AS check_px,
  ROUND((("worldX" + "worldY")::float / 32) + 0)   AS check_py
FROM character
WHERE ABS("positionX" - (ROUND((("worldX" - "worldY")::float / 16) + 1000))) > 1
   OR ABS("positionY" - (ROUND((("worldX" + "worldY")::float / 32) + 0)))    > 1;
```

Résultat attendu : 0 lignes (tolérance de ±1 pour les arrondis).

### 7.3 Vérifier la présence de `mapId`

```sql
SELECT COUNT(*) FROM character WHERE "mapId" IS NULL OR "mapId" != 1;
SELECT COUNT(*) FROM creatures   WHERE "mapId" IS NULL OR "mapId" != 1;
-- etc. pour toutes les entités avec mapId
```

Résultat attendu : `0`.

### 7.4 Vérifier les bornes int32

```sql
SELECT COUNT(*) FROM character
WHERE "worldX" < -2147483648 OR "worldX" > 2147483647
   OR "worldY" < -2147483648 OR "worldY" > 2147483647;
```

Résultat attendu : `0`. En pratique, avec des pixels Phaser dans [0, 2000],
les WU restent dans [−16000, 16000] — très loin des limites int32.

### 7.5 Cohérence des seeds recalibrées

Après réinitialisation en dev, vérifier que les positions WU seedées sont dans
la grille visible :

```sql
-- Les positions WU doivent correspondre à des tiles positives
SELECT id, "worldX", "worldX" / 1024 AS tile_x,
           "worldY", "worldY" / 1024 AS tile_y
FROM character;
```

---

## 8. Recommandations

### 8.1 La DB actuelle bloque-t-elle le branchement du module central ?

**Non.** Le module `world-coordinates.ts` (Phase 1) ne touche pas la base de
données. Il s'agit de fonctions pures sans état. Il peut être importé et utilisé
dès maintenant dans tout service, sans aucun changement de schéma DB.

### 8.2 La DB actuelle bloque-t-elle la migration des entités ?

**Non immédiatement**, mais des précautions sont nécessaires :

- Les types de colonnes existantes (`integer`) sont déjà compatibles avec WU.
- L'ajout de colonnes `worldX`, `worldY`, `mapId` nullables est non-destructif.
- Le risque principal est `synchronize: true` avec des colonnes NOT NULL sans
  défaut — à éviter (déclarer toujours les nouvelles colonnes avec `nullable:
  true` ou `default` pendant la migration).

### 8.3 Précautions avant la première migration SQL

Avant d'ajouter `worldX / worldY / mapId` aux entités TypeORM :

1. **Réinitialiser la DB de dev** (`docker compose down -v` + `up`) pour partir
   d'un état vierge. Les seeds régénèrent tout au démarrage.
2. **Déclarer les nouvelles colonnes nullable** dans les entités pour que
   `synchronize: true` ne les rejette pas sur les lignes existantes.
3. **Ne pas renommer** les colonnes existantes via TypeORM (`positionX` → rien
   d'analogue dans l'entité) — TypeORM ferait un DROP + ADD et perdrait les
   données.
4. **Ne pas supprimer** les anciennes propriétés d'entité tant que le runtime
   les lit encore (même sous `synchronize: true`, les colonnes orphelines restent
   en DB mais le code ne peut plus les lire via TypeORM).
5. **Recalibrer les seeds** pour émettre directement des WU, afin que la DB de
   dev soit toujours en WU après réinitialisation — jamais de backfill de données
   de dev.
6. **Configurer un système de migrations TypeORM** (`DataSource` + répertoire
   `migrations/`) avant tout déploiement hors dev, même sur un environnement de
   test persistant.

---

## Related files

- [Plan de migration WU](coordinate-system-migration-plan.md)
- [Décisions Phase 0](coordinate-system-phase-0-decisions.md)
- [ADR-0002 — Positionnement des entités](adr/ADR-0002-entity-positioning.md)
- [ADR-0001 — Système de coordonnées](adr/ADR-0001-world-coordinate-system.md)
- [STATUS.md](../../STATUS.md)
- Code : `src/characters/entities/character.entity.ts`
- Code : `src/creatures/entities/creature.entity.ts`
- Code : `src/creatures/entities/creature-spawn.entity.ts`
- Code : `src/resources/entities/resource.entity.ts`
- Code : `src/world/entities/respawn-point.entity.ts`
- Code : `src/app.module.ts`
- Code : `src/world/world.service.ts`
- Code : `src/creatures/creatures.service.ts`
- Code : `src/common/world-coordinates.ts`
