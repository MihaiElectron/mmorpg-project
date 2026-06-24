# Crafting Runtime

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-24
- Depends on: docs/08_Gameplay/world-object-model.md, docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md, docs/01_Architecture/client-server-boundaries.md
- Used by: Project owner, developers, Codex, tout agent IA travaillant sur le craft runtime

## Scope

Ce document décrit l'état réel du craft runtime joueur après l'ajout des
stations de craft placées dans le monde.

Il ne décrit pas le craft admin, les quêtes, les NPC, les talents, les
achievements, `FormulaEngine` ou `ModifierEngine`.

## État actuel

Le craft runtime joueur est implémenté pour les recettes existantes :

- les recettes sont définies par `CraftingRecipe` ;
- les stations sont représentées par `CraftingStationTemplate` et
  `CraftingStation` ;
- une recette avec `stationType = "none"` peut être craftée sans station ;
- une recette avec `stationType != "none"` nécessite une station compatible
  proche du joueur ;
- la validation de station, distance, inventaire, skill et résultat reste
  serveur autoritaire.

## Modèle station

### CraftingStationTemplate

Un template de station décrit une famille de stations.

Champs fonctionnels :

- `key` : identifiant stable snake_case ;
- `name` : label lisible ;
- `stationType` : type utilisé par `CraftingRecipe.stationType` ;
- `category` : regroupement métier ou admin ;
- `requiredSkillKey` : skill associé si pertinent ;
- `interactionRadiusWU` : rayon d'interaction en World Units ;
- `enabled` : active ou désactive toutes les instances liées.

`stationType = "none"` est réservé aux recettes sans station et ne doit pas
être utilisé par un template de station.

### CraftingStation

Une instance de station est un objet placé dans le monde.

Champs fonctionnels :

- `templateId` : template de station ;
- `mapId` : carte ;
- `worldX`, `worldY` : position en World Units ;
- `enabled` : active ou désactive cette instance.

Les coordonnées WU sont la source de vérité. Les pixels écran sont dérivés
côté client pour le rendu.

## Cycle runtime joueur

Le cycle réel est :

```text
CraftingStation visible dans le monde
↓
ActionPanel station
↓
Recettes compatibles chargées par stationType
↓
POST /crafting/craft { recipeId, quantity }
↓
Validation serveur
↓
Inventaire consommé / produit
↓
Skill XP mis à jour
```

Le client ne fournit jamais `characterId` ni `stationId` pour lancer le craft.
Le personnage est résolu côté serveur depuis l'utilisateur authentifié. La
station valide est choisie côté serveur à partir de la position connectée du
joueur.

## Validation serveur

Pour `stationType = "none"`, le comportement ne dépend d'aucune station.

Pour `stationType != "none"`, le serveur recherche une station :

- `enabled = true` ;
- template `enabled = true` ;
- même `mapId` que le joueur connecté ;
- `template.stationType === recipe.stationType` ;
- distance euclidienne WU entre joueur et station inférieure ou égale à
  `template.interactionRadiusWU`.

La distance utilisée est euclidienne en WU.

Le client peut afficher des aides visuelles, mais ne décide jamais si le craft
est autorisé.

## UI runtime

Le joueur peut cliquer une station de craft visible dans `WorldScene`. Le clic
ouvre l'`ActionPanel` avec une action `Ouvrir <station>`. Le panneau runtime :

- affiche les recettes compatibles avec le `stationType` de la station ;
- lance le craft via `POST /crafting/craft` ;
- affiche le résultat ;
- rafraîchit inventaire et skills après succès ;
- affiche les erreurs serveur telles que retournées.

Le payload craft reste limité à :

```json
{
  "recipeId": "uuid",
  "quantity": 1
}
```

## Indicateur de portée estimée

L'UI peut afficher :

- `Station à portée` ;
- `Hors de portée estimée` ;
- `Portée estimée indisponible`.

Cet indicateur compare côté client la position WU connue du personnage avec
`station.worldX/worldY` et `interactionRadiusWU`.

Il est strictement informatif :

- il ne bloque pas le bouton Craft ;
- il ne remplace pas les erreurs serveur ;
- il n'est pas une validation métier ;
- le serveur reste la seule source de vérité.

Même si l'UI affiche `Hors de portée estimée`, le client envoie toujours la
requête et seul le serveur décide.

## Erreurs serveur station

Quand une recette nécessite une station et qu'aucune station valide proche
n'est trouvée, le serveur retourne une erreur structurée.

### CRAFTING_STATION_REQUIRED

Utilisé lorsqu'aucune station compatible active ne peut être utilisée ou
lorsque la position runtime du personnage n'est pas disponible.

Format :

```json
{
  "code": "CRAFTING_STATION_REQUIRED",
  "message": "Forge requise : aucune station compatible active à portée.",
  "stationType": "forge"
}
```

### CRAFTING_STATION_OUT_OF_RANGE

Utilisé lorsqu'une station compatible active existe, mais que la plus proche
est hors rayon.

Format :

```json
{
  "code": "CRAFTING_STATION_OUT_OF_RANGE",
  "message": "Forge trop éloignée.",
  "stationType": "forge",
  "nearestDistanceWU": 2048,
  "requiredRadiusWU": 1536
}
```

`nearestDistanceWU` et `requiredRadiusWU` servent à l'UX et au debug. Ils ne
donnent aucune autorité au client.

Les autres erreurs de craft restent inchangées : inventaire insuffisant,
skill insuffisant, recette désactivée, item ou skill introuvable.

## Rendu debug et overlays

Les stations enabled sont rendues dans `WorldScene` avec un rendu debug simple :

| stationType | Rendu debug |
|---|---|
| `forge` | carré orange |
| `workbench` | carré bleu |
| `sawmill` | carré vert |
| `alchemy_table` | carré violet |
| `cooking_station` | carré rouge |
| fallback | carré gris |

Le label court est le nom de la station ou son `stationType`.

Le toggle DevTools `Station Radius` affiche le rayon d'interaction autour des
stations enabled à partir de `interactionRadiusWU`.

Ces éléments sont des outils visuels :

- ce ne sont pas des assets définitifs ;
- ce ne sont pas des collisions ;
- ce ne sont pas des validations gameplay ;
- ils servent à vérifier visuellement la cohérence avec la validation serveur.

## Admin et WOM

Les stations sont exposées via le World Object Model :

- `CraftingStationTemplate` : World Object de définition ;
- `CraftingStation` : World Object d'entité placée ;
- capabilities : `crafting_station`, `placement`, `validation`.

L'AdminPanel/WOM permet de gérer templates et instances, de placer des stations
sur la carte et de téléporter un personnage près d'une station pour debug.

## Non-goals actuels

Ne sont pas inclus dans ce runtime :

- assets définitifs de stations ;
- NPC ;
- quêtes ;
- talents ;
- achievements ;
- `FormulaEngine` ;
- `ModifierEngine` ;
- validation client autoritaire.

