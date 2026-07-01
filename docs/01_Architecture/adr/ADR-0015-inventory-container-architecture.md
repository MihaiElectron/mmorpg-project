# ADR-0015 — Inventory Container Architecture

## Metadata

- Status: Accepted
- Decision status: Accepted
- Owner: Project
- Last updated: 2026-07-01
- Date proposed: 2026-07-01
- Date accepted: 2026-07-01
- Depends on:
  - docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md
  - docs/01_Architecture/adr/ADR-0010-object-runtime-model.md
  - docs/01_Architecture/adr/ADR-0011-item-materialization-pipeline.md
  - docs/01_Architecture/adr/ADR-0014-equipment-runtime-v2.md
  - docs/01_Architecture/client-server-boundaries.md
  - docs/10_AI/implementation-rules.md
- Used by: Project owner, backend developers, gameplay designers,
  repository-aware coding agents
- Supersedes: Modèle d'inventaire implicite (conteneur unique par personnage,
  sans slotIndex, sans capacité, sans bag distinct)
- Superseded by: None
- Related documents:
  - docs/08_Gameplay/item-taxonomy.md
  - docs/08_Gameplay/object-runtime-architecture.md
  - docs/09_Workflow/runtime-roadmap.md
  - docs/09_Workflow/technical-debt.md
- Related code:
  - apps/api-gateway/src/inventory/entities/inventory.entity.ts
  - apps/api-gateway/src/inventory/projection/inventory-projection.service.ts
  - apps/api-gateway/src/inventory/projection/inventory-entry.dto.ts
  - apps/api-gateway/src/item-instances/entities/item-instance.entity.ts
  - apps/api-gateway/src/item-transfer/item-transfer.service.ts
  - apps/api-gateway/src/characters/dto/equip-item.dto.ts

---

## Context

Le modèle actuel d'inventaire repose sur un conteneur implicite unique par
personnage. Il n'existe aucune entité `InventoryContainer`, aucun `slotIndex`
persisté, aucune notion de capacité. Les bags sont absents. Les tables
`Inventory` (STACKABLE) et `ItemInstance` (INSTANCE) sont deux tables
distinctes partageant le même espace de slots sans contrainte d'unicité
cross-table.

Cette architecture atteint ses limites dès qu'on introduit :

- des bags équipables augmentant la capacité d'inventaire ;
- un drag & drop persisté côté serveur avec position de slot garantie ;
- des conteneurs multiples (banque, coffre maison, coffre guilde, véhicules) ;
- une vue client fidèle à la structure réelle (base vs bag vs banque).

Sans décision explicite, chaque nouvelle mécanique risque de :

1. Créer un slotIndex sur une seule des deux tables (`Inventory` ou
   `ItemInstance`), laissant l'autre sans position et rendant les requêtes de
   slot libre incorrectes.
2. Dupliquer le concept de "position dans un sac" dans plusieurs domaines
   (inventaire, banque, housing) avec des modèles incompatibles.
3. Retourner une liste plate d'items au client, rendant le drag inter-bag
   ambigu et le debug impossible.

---

## Problem

Sans architecture de conteneur explicite :

- un slot `(containerId, slotIndex)` ne peut pas avoir de contrainte `UNIQUE`
  couvrant simultanément `Inventory` et `ItemInstance` — deux items peuvent
  occuper le même slot logique sans erreur DB ;
- il est impossible de vérifier la capacité d'un bag avant d'y déposer un
  item ;
- le déséquipement d'un bag est ambigu (que faire des items qu'il contient ?) ;
- la vue unifiée plate masque la structure réelle : on ne sait plus si un item
  est dans le bag ou dans l'inventaire de base, le drag inter-conteneurs est
  incorrect, et le déséquipement d'un bag perd le contexte de ses items.

---

## Decision Drivers

- Un seul modèle de conteneur pour tous les domaines (inventaire, bags, banque,
  housing, guilde, véhicules). Zéro système parallèle.
- `ItemTransferService` reste le seul responsable des mutations d'`ItemInstance`.
- Le client ne décide jamais la validité d'un déplacement — il envoie une
  intention, le serveur valide, exécute, répond.
- La vue retournée au client reflète la structure réelle : par conteneur, pas
  en liste plate.
- La structure supporte les évolutions long terme (véhicules, wagons, bateaux,
  PNJ porteurs, coffres imbriqués) sans refonte.
- Compatible ADR-0004, ADR-0010, ADR-0011, ADR-0014.

---

## Decisions

### Décision 1 — `InventoryContainer` comme entité explicite

Tout conteneur d'items est une entité `InventoryContainer` persistée :

```
InventoryContainer
  id                      uuid PK
  parentContainerId       uuid FK → InventoryContainer nullable
  ownerCharacterId        uuid nullable
  ownerGuildId            uuid nullable
  ownerBuildingId         uuid nullable
  ownerHouseId            uuid nullable
  sourceType              enum BASE | BAG | BANK | HOUSE_CHEST | GUILD_CHEST
                               | TRADE | MAIL | AUCTION | CRAFT | LOOT | TEMP
  sourceItemInstanceId    uuid nullable UNIQUE FK → ItemInstance
  capacitySlots           int NOT NULL
  capacityWeight          int nullable  -- null = illimité ; gameplay poids différé
  currentWeight           int NOT NULL DEFAULT 0
  metadata                jsonb nullable
  createdAt               timestamp
  updatedAt               timestamp
  CONSTRAINT chk_has_owner CHECK (
    ownerCharacterId IS NOT NULL OR ownerGuildId IS NOT NULL
    OR ownerBuildingId IS NOT NULL OR ownerHouseId IS NOT NULL
  )
```

Un bag n'est pas lui-même le conteneur. Il crée un conteneur lors de
l'équipement via `sourceItemInstanceId`.

### Décision 2 — `InventorySlot` comme entité d'occupation de slot

Un `InventorySlot` matérialise l'occupation d'un slot dans un conteneur.
Il n'est créé que pour les slots **occupés** — pas de pré-allocation.

```
InventorySlot
  id                uuid PK
  containerId       uuid FK → InventoryContainer NOT NULL
  slotIndex         int NOT NULL
  locked            boolean NOT NULL DEFAULT false
  reserved          boolean NOT NULL DEFAULT false
  itemInstanceId    uuid nullable FK → ItemInstance
  inventoryStackId  uuid nullable FK → Inventory
  UNIQUE(containerId, slotIndex)
  CHECK (itemInstanceId IS NULL OR inventoryStackId IS NULL)
```

Cette entité résout le problème fondamental de l'Option B (slotIndex sur
`Inventory` + `ItemInstance`) : une seule contrainte `UNIQUE` couvre les deux
types d'occupants, sans ambiguïté cross-table.

### Décision 3 — `InventoryProjectionService` retourne une vue par conteneur

La projection retourne une structure par conteneur, pas une liste plate.
La liste plate est bannie — elle masque la structure réelle et rend le drag
inter-bag ambigu.

**Format de réponse** :

```typescript
interface InventoryContainerView {
  id: string;
  sourceType: ContainerSourceType;
  label: string;                  // "Inventaire", "Sac en cuir", "Banque", etc.
  capacitySlots: number;
  capacityWeight: number | null;
  currentWeight: number;
  slots: InventorySlotView[];
}

interface InventorySlotView {
  slotIndex: number;
  locked: boolean;
  reserved: boolean;
  entry: InventoryEntryDto | null;  // null = slot vide
}

interface InventoryResponse {
  containers: InventoryContainerView[];
}
```

**Règles d'ordre des conteneurs** :

1. `BASE` — toujours en premier.
2. `BAG` — ensuite, dans l'ordre d'équipement.
3. `BANK`, `HOUSE_CHEST`, `GUILD_CHEST` — selon le contexte ouvert
   (uniquement si le joueur est devant le bâtiment ou coffre concerné).
4. `TRADE`, `CRAFT`, `LOOT`, `TEMP` — selon le contexte de la session en cours.

Le client affiche les conteneurs dans cet ordre. Il ne peut pas réordonner
les conteneurs — seul le serveur détermine l'ordre.

### Décision 4 — Bag équipé → création de conteneur dans la même transaction

L'équipement d'un bag dans le slot `bag` déclenche dans la même transaction :

1. `ItemTransferService.transfer(EQUIP_BAG)` →
   `state: EQUIPPED, containerType: EQUIPMENT` + `CharacterEquipment`.
2. Création de l'`InventoryContainer { sourceType: BAG, sourceItemInstanceId,
   capacitySlots: item.bagCapacity }`.

`Item.bagCapacity` est un nouveau champ du catalogue. Valeur par défaut : 16.
Un item sans `bagCapacity` ne peut pas être équipé dans le slot `bag`.

### Décision 5 — Bag déséquipé non vide → blocage en V1

Si `COUNT(inventory_slot WHERE containerId = bagContainerId) > 0`,
le déséquipement est rejeté avec `ForbiddenException("Videz le bag avant
de le retirer")`.

La contrainte `ON DELETE RESTRICT` sur `InventorySlot.containerId` constitue
la garde finale côté DB.

Cette règle est choisie pour sa simplicité et sa sécurité. Les alternatives
(migration automatique vers BASE, bag transportable) sont possibles en V2
via une extension de cette ADR.

### Décision 6 — `POST /inventory/:characterId/move` comme endpoint unique

Tout déplacement intra ou inter-conteneurs passe par cet endpoint :

```
POST /inventory/:characterId/move
Body: {
  entryId: string,           // Inventory.id (stack) ou ItemInstance.id
  fromContainerId: string,
  fromSlot: number,
  toContainerId: string,
  toSlot: number
}
```

Le serveur détermine si l'opération est un MOVE intra, un MOVE inter, ou
délègue vers EQUIP/UNEQUIP si le conteneur cible est de type EQUIPMENT.
Le client n'interprète jamais la sémantique — il envoie l'intention.

Les endpoints d'équipement directs (`equip-instance`, `unequip`) coexistent
pour les cas sans slot cible connu (double-clic, auto-slot).

### Décision 7 — `capacityWeight` présent dès V1, gameplay différé

`capacityWeight` et `currentWeight` existent sur `InventoryContainer` dès
la création de la table. `Item.weight` est nullable — `null` = poids 0.
`currentWeight` est toujours 0 jusqu'à l'activation du gameplay poids.

La structure est prête. Aucune migration ne sera nécessaire lors de
l'activation.

### Décision 8 — `parentContainerId` présent, activé en phase véhicules

`parentContainerId` existe en DB dès V1 mais est toujours `null` jusqu'à la
phase véhicules/housing avancé. Aucun code ne l'utilise en V1.

### Décision 9 — Vérification de capacité avant insertion, sous verrou

La séquence d'insertion dans un conteneur :

```
1. SELECT FOR UPDATE InventoryContainer WHERE id = toContainerId
2. IF COUNT(inventory_slot WHERE containerId = toContainerId) >= capacitySlots
     → ConflictException("Container full")
3. INSERT INTO inventory_slot(containerId, slotIndex, ...)
4. COMMIT
```

Le verrou pessimiste sur `InventoryContainer` empêche les race conditions
d'overflow simultané.

---

## Comparaison `InventorySlot` vs `slotIndex` sur les tables existantes

### Option A — `InventorySlot` entité dédiée (retenue)

| Critère | Évaluation |
|---|---|
| Unicité cross-table STACK + INSTANCE | ✓ Une seule contrainte UNIQUE |
| Slot verrouillable / réservable | ✓ Colonnes first-class |
| Requête "slots libres" | ✓ COUNT sur une seule table |
| Volume | 1 row par slot occupé — acceptable |
| Extensibilité | ✓ `metadata` par slot possible |
| Cohérence | Seule source pour l'occupation d'un slot |

### Option B — `slotIndex` sur `Inventory` + `ItemInstance` (rejetée)

| Critère | Évaluation |
|---|---|
| Unicité cross-table STACK + INSTANCE | ✗ Impossible — deux tables, deux champs |
| Slot verrouillable / réservable | ✗ Colonnes sur deux tables |
| Requête "slots libres" | ✗ Union sur deux tables + gap-finding |
| Volume | Nul (champs en ligne) |
| Extensibilité | Faible — table additionnelle de toute façon |
| Cohérence | Risque de double-occupation sans garde SQL |

**L'unicité cross-table est l'argument décisif.** Sans `InventorySlot`, un
slot peut être revendiqué simultanément par un stack `Inventory` et une
`ItemInstance` sans qu'aucune contrainte DB ne le détecte.

---

## Pipeline complète d'un bag

### Équipement

```
[Drag sac depuis inventaire vers slot bag]
    │
    ▼
POST /inventory/:characterId/equip-instance/:instanceId
    │
    ├─ Vérification : item.slot = 'bag', item.bagCapacity > 0
    │
    ├─ ItemTransferService.transfer(EQUIP_BAG, manager, instanceId, characterId)
    │     → ItemInstance { state: EQUIPPED, containerType: EQUIPMENT }
    │     → CharacterEquipment { slot: 'bag', itemInstanceId }
    │
    └─ InventoryContainerService.createBagContainer(characterId, instanceId, capacity)
          → InventoryContainer { sourceType: BAG, sourceItemInstanceId,
                                 ownerCharacterId, capacitySlots }
    │
    ▼
character:reload → Client recharge la vue par conteneur
```

### Déséquipement (V1 — blocage)

```
[Drag bag depuis slot vers inventaire]
    │
    ▼
POST /inventory/:characterId/unequip-instance/:instanceId
    │
    ├─ Récupérer InventoryContainer { sourceItemInstanceId = instanceId }
    ├─ SELECT COUNT(*) FROM inventory_slot WHERE container_id = bagContainerId
    ├─ Si > 0 → ForbiddenException
    │
    ├─ InventoryContainerService.deleteBagContainer(bagContainerId)
    │     → DELETE inventory_container (RESTRICT FK bloque si non vide — double garde)
    │
    └─ ItemTransferService.transfer(UNEQUIP, manager, instanceId, characterId)
          → ItemInstance { state: AVAILABLE, containerType: INVENTORY }
          → DELETE CharacterEquipment
    │
    ▼
character:reload → Client recharge la vue par conteneur
```

### Déplacement intra-conteneur (drag slot → slot)

```
POST /inventory/:characterId/move
  { entryId, fromContainerId, fromSlot: 3, toContainerId, toSlot: 7 }
    │
    ├─ Vérification ownership (ownerCharacterId = requesterId)
    ├─ SELECT FOR UPDATE InventorySlot { containerId, slotIndex: 3 }
    ├─ SELECT FOR UPDATE InventorySlot { containerId, slotIndex: 7 } (ou NULL si libre)
    │
    ├─ Si slot 7 vide :
    │     UPDATE inventory_slot SET slot_index = 7 WHERE id = slotSource
    │
    └─ Si slot 7 occupé (SWAP) :
          UPDATE inventory_slot SET slot_index = 7 WHERE id = slotSource
          UPDATE inventory_slot SET slot_index = 3 WHERE id = slotCible
    │
    ▼
Response (nouvelle vue conteneur) → Client affiche
```

---

## Diagramme de structure

```
Character
  │
  ▼
InventoryContainer (sourceType=BASE)
  │  capacitySlots=24, sourceItemInstanceId=null
  │
  ├── InventorySlot { slotIndex=0, itemInstanceId=uuid-sword }
  │     └── ItemInstance { containerType=INVENTORY, containerId=<containerBase.id> }
  │
  ├── InventorySlot { slotIndex=1, inventoryStackId=uuid-stack }
  │     └── Inventory  { containerId=<containerBase.id> }
  │
  └── InventorySlot { slotIndex=2, itemInstanceId=uuid-bag } ← bag dans l'inventaire

CharacterEquipment { slot='bag', itemInstanceId=uuid-bag }
  └── ItemInstance { containerType=EQUIPMENT } ← bag équipé

InventoryContainer (sourceType=BAG, sourceItemInstanceId=uuid-bag)
  │  capacitySlots=16
  │
  ├── InventorySlot { slotIndex=0, itemInstanceId=uuid-potion }
  └── InventorySlot { slotIndex=1, inventoryStackId=uuid-herbs }

                    ▲
                    │
          [UNEQUIP_BAG bloqué si non vide]
```

---

## Sécurité

### Transactions

Toute opération mutant un slot utilise `DataSource.transaction()`. Les
services `InventoryContainerService` et `InventorySlotService` opèrent dans
la transaction de l'appelant — jamais d'ouverture autonome.

### Verrou pessimiste

Ordre d'acquisition des verrous sur `ItemInstance` : lexicographique sur `id`
(anti-deadlock, même convention que `TradeService`). Pour les `InventorySlot`
dans un même conteneur : verrou dans l'ordre de `slotIndex` croissant.

### Anti-duplication

La contrainte `UNIQUE(containerId, slotIndex)` est la garde finale. Le service
effectue néanmoins un check applicatif en amont pour retourner une erreur
lisible au client.

### Ownership

`InventoryContainer.ownerCharacterId === requesterId` vérifié avant toute
mutation. Un personnage ne peut pas déplacer les items d'un autre personnage.
Pour les conteneurs de guilde : vérification `guildMembership` + rôle.

### Perte de connexion / crash serveur

Les transactions PostgreSQL garantissent le rollback atomique. Aucun état
intermédiaire n'est persisté. La reconstitution de `ConnectedPlayer` après
redémarrage n'impacte pas la cohérence des slots.

### Bag non vide — double garde

1. Guard applicatif : `COUNT(inventory_slot) > 0 → ForbiddenException`.
2. Contrainte FK `ON DELETE RESTRICT` sur `InventorySlot.containerId` :
   toute tentative de DELETE d'un conteneur non vide échoue au niveau DB.

---

## Impacts base de données

### Nouvelles tables

```sql
CREATE TABLE inventory_container (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_container_id     UUID REFERENCES inventory_container(id) ON DELETE SET NULL,
  owner_character_id      UUID REFERENCES character(id) ON DELETE CASCADE,
  owner_guild_id          UUID REFERENCES guild(id) ON DELETE CASCADE,
  owner_building_id       UUID REFERENCES building(id) ON DELETE CASCADE,
  owner_house_id          UUID REFERENCES house(id) ON DELETE CASCADE,
  source_type             VARCHAR(30) NOT NULL,
  source_item_instance_id UUID UNIQUE REFERENCES item_instance(id) ON DELETE RESTRICT,
  capacity_slots          INT NOT NULL,
  capacity_weight         INT,
  current_weight          INT NOT NULL DEFAULT 0,
  metadata                JSONB,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_has_owner CHECK (
    owner_character_id IS NOT NULL OR owner_guild_id IS NOT NULL
    OR owner_building_id IS NOT NULL OR owner_house_id IS NOT NULL
  )
);

CREATE TABLE inventory_slot (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id        UUID NOT NULL REFERENCES inventory_container(id) ON DELETE RESTRICT,
  slot_index          INT NOT NULL,
  locked              BOOLEAN NOT NULL DEFAULT false,
  reserved            BOOLEAN NOT NULL DEFAULT false,
  item_instance_id    UUID REFERENCES item_instance(id) ON DELETE RESTRICT,
  inventory_stack_id  UUID REFERENCES inventory(id) ON DELETE RESTRICT,
  UNIQUE(container_id, slot_index),
  CONSTRAINT chk_single_occupant CHECK (
    item_instance_id IS NULL OR inventory_stack_id IS NULL
  )
);
```

### Modifications existantes

```sql
-- Inventory : ajout containerId (nullable pendant migration, NOT NULL après)
ALTER TABLE inventory ADD COLUMN container_id UUID REFERENCES inventory_container(id);

-- Item : ajout bagCapacity
ALTER TABLE item ADD COLUMN bag_capacity INT DEFAULT NULL;
```

### Index

```sql
CREATE INDEX idx_inventory_slot_container   ON inventory_slot(container_id);
CREATE INDEX idx_inv_container_owner_char   ON inventory_container(owner_character_id)
  WHERE owner_character_id IS NOT NULL;
CREATE INDEX idx_inv_container_source_inst  ON inventory_container(source_item_instance_id)
  WHERE source_item_instance_id IS NOT NULL;
```

---

## Impacts Runtime

### `ItemTransferService` — nouvelles transitions

| Transition | Précondition | Résultat |
|---|---|---|
| `EQUIP_BAG` | `state=AVAILABLE, containerType=INVENTORY, item.slot='bag', item.bagCapacity>0` | `state→EQUIPPED, containerType→EQUIPMENT` + création `InventoryContainer { sourceType: BAG }` |
| `UNEQUIP_BAG` | `state=EQUIPPED, containerType=EQUIPMENT, item.slot='bag'`, conteneur vide | `state→AVAILABLE, containerType→INVENTORY` + suppression `InventoryContainer` |
| `MOVE` | `state=AVAILABLE, containerType=INVENTORY`, capacité OK, slot libre | `ItemInstance.containerId` et `InventorySlot` mis à jour — pas de changement d'état |

### `InventoryContainerService` — nouveau service

```
createBaseContainer(characterId, capacity)     → appelé à la création d'un personnage
createBagContainer(characterId, instanceId, capacity) → appelé par EQUIP_BAG
deleteBagContainer(containerId)               → appelé par UNEQUIP_BAG
getContainersByOwner(characterId)             → BASE + BAG actifs, ordonnés
findFreeSlot(containerId)                     → premier slotIndex libre
```

Ce service ne mute jamais `ItemInstance` directement.

### `InventoryProjectionService` — refonte

La méthode `project(characterId)` retourne `InventoryResponse` (vue par
conteneur) au lieu de `InventoryEntryDto[]`.

```typescript
interface InventoryContainerView {
  id: string;
  sourceType: ContainerSourceType;
  label: string;
  capacitySlots: number;
  capacityWeight: number | null;
  currentWeight: number;
  slots: InventorySlotView[];
}

interface InventorySlotView {
  slotIndex: number;
  locked: boolean;
  reserved: boolean;
  entry: InventoryEntryDto | null;
}

interface InventoryResponse {
  containers: InventoryContainerView[];
}
```

`InventoryEntryDto` est inchangé — il décrit un item, pas son slot.

**Ordre garanti des conteneurs dans `containers[]`** :

1. `BASE` — toujours en premier.
2. `BAG` — dans l'ordre d'équipement (date de création du conteneur).
3. `BANK` / `HOUSE_CHEST` / `GUILD_CHEST` — selon le contexte ouvert.
4. `TRADE` / `CRAFT` / `LOOT` / `TEMP` — selon la session active.

Le serveur garantit cet ordre. Le client affiche sans le modifier.

---

## Compatibilité ADR-0014

| Règle ADR-0014 | Impact ADR-0015 | Conflit |
|---|---|---|
| Une seule pipeline d'équipement | `EQUIP_BAG` est une transition dans `ItemTransferService` — même pipeline | Non |
| `ItemTransferService` seul responsable des mutations | `InventoryContainerService` crée/supprime des `InventoryContainer`, pas des `ItemInstance` — les transitions restent dans `ItemTransferService` | Non |
| `CharacterEquipment` source de vérité des slots équipés | Le slot `bag` dans `CharacterEquipment` déclenche la création du conteneur — `CharacterEquipment` reste la source | Non |
| LOT ne s'équipe pas | Un bag ne peut pas être un LOT — règle inchangée | Non |
| Client ne recalcule jamais | Le client reçoit `containers[]` en lecture seule | Non |
| `character:reload` après mutation | Émis après `EQUIP_BAG` / `UNEQUIP_BAG` / `MOVE` | Non |

ADR-0015 est une extension de l'architecture ADR-0014. Elle n'en redéfinit
aucune règle. Elle ajoute des entités, des transitions et un nouveau format
de projection.

---

## Plan de migration

### Phase 0 — Préparation (sans rupture, avant Phase Bag)

1. Ajouter `Item.bagCapacity` nullable.
2. Ajouter `Inventory.containerId` nullable (sans FK active).
3. Créer les tables `inventory_container` et `inventory_slot`.

### Phase 1 — Création des conteneurs de base

4. Script one-shot :

```sql
-- Créer un conteneur BASE par personnage
INSERT INTO inventory_container (owner_character_id, source_type, capacity_slots)
  SELECT DISTINCT character_id, 'BASE', 24 FROM inventory;

-- Rattacher les stacks existants
UPDATE inventory inv
SET container_id = (
  SELECT id FROM inventory_container ic
  WHERE ic.owner_character_id = inv.character_id AND ic.source_type = 'BASE'
);

-- Rattacher les instances INVENTORY existantes
UPDATE item_instance ii
SET container_id = (
  SELECT id FROM inventory_container ic
  WHERE ic.owner_character_id = ii.owner_id AND ic.source_type = 'BASE'
)
WHERE ii.container_type = 'INVENTORY';
```

5. Activer `NOT NULL` sur `Inventory.containerId`.
6. Créer les `InventorySlot` pour les occupants existants (assignment séquentiel
   par `id` — la position cosmétique sera modifiable par drag ensuite).

### Phase 2 — Bags

7. Implémenter `InventoryContainerService`.
8. Implémenter transitions `EQUIP_BAG` / `UNEQUIP_BAG` dans `ItemTransferService`.
9. Implémenter `POST /inventory/:characterId/move`.
10. Refondre `InventoryProjectionService` → vue par conteneur.
11. Mettre à jour le store client pour consommer `containers[]`.
12. Interface drag & drop persistée.

### Phase 3 — Nesting et conteneurs étendus

13. Activer `parentContainerId` pour véhicules / coffres imbriqués.
14. `capacityWeight` gameplay branché sur `Item.weight`.

---

## Règles impératives

1. **`InventoryContainer` est la seule abstraction de conteneur.** Aucun
   système ne peut créer une nouvelle notion de "sac" ou "stockage" en dehors
   de cette entité.

2. **`InventorySlot` est la seule source d'occupation d'un slot.** Aucun
   service ne peut positionner un item dans un conteneur sans créer/mettre à
   jour un `InventorySlot`.

3. **`ItemTransferService` est le seul responsable des mutations
   d'`ItemInstance`.** `InventoryContainerService` ne touche pas `ItemInstance`
   directement.

4. **La vue retournée au client est toujours par conteneur.** La liste plate
   d'items est bannie pour l'inventaire joueur. `GET /characters/me` et
   `GET /inventory/:characterId` retournent `InventoryResponse { containers }`.

5. **BASE toujours premier.** L'ordre des conteneurs dans `containers[]` est
   garanti côté serveur. Le client n'a pas d'influence sur cet ordre.

6. **Bag non vide non déséquipable en V1.** L'exception `ForbiddenException`
   et la contrainte `ON DELETE RESTRICT` sont toutes deux actives — les deux
   gardes sont requises.

7. **`capacityWeight` nullable = illimité.** `null` ne signifie pas "non
   géré" mais "aucune limite". Le code ne traite jamais `null` comme une
   erreur.

8. **`parentContainerId` null en V1.** Aucun code ne le renseigne ni ne le
   lit avant la phase véhicules.

9. **Le client envoie l'intention, le serveur décide.** Le client ne valide
   jamais la compatibilité d'un déplacement avant d'envoyer la requête. Le
   serveur rejette et le client affiche l'erreur.

10. **Tout drag persisté passe par `POST /inventory/move`.** Aucune
    réorganisation locale permanente côté client.

---

## Limites connues

- **Performance gap-finding** : trouver le premier slot libre dans un
  conteneur dense nécessite une requête SQL avec recherche de gap
  (`GENERATE_SERIES` ou logique applicative). Pour 1 000 joueurs × 24 slots,
  le volume est acceptable. À réévaluer à l'échelle.

- **`InventoryProjectionService` — N+1** : charger les slots de chaque
  conteneur requiert des JOINs ou des requêtes supplémentaires. Un seul
  `SELECT` avec JOIN `inventory_container → inventory_slot → item_instance |
  inventory` est réalisable et évite le N+1.

- **Bag dans bag** : `parentContainerId` prépare le nesting, mais la
  sémantique "bag contenant un autre bag" n'est pas définie dans cette ADR.
  Elle fera l'objet d'une extension si et quand le gameplay le requiert.

- **Inventaires PNJ / créatures** : `ownerCharacterId` ne couvre pas les PNJ.
  Une colonne `ownerNpcId` ou un `ownerType` enum sera nécessaire lors de
  l'introduction des marchands PNJ à inventaire persisté.

---

## Conséquences

### Positives

- Un seul modèle de conteneur pour tous les domaines — zéro système parallèle.
- Le problème d'unicité cross-table (STACK + INSTANCE) est résolu une fois
  pour toutes par `InventorySlot`.
- La vue par conteneur reflète la réalité du jeu, facilite le drag
  inter-bag, simplifie le debug DevTools.
- L'architecture est extensible sans refonte : véhicules, bateaux, wagons,
  PNJ porteurs s'ajoutent comme de nouveaux `InventoryContainer` avec un
  `sourceType` et un `ownerXxx` appropriés.

### Négatives

- Deux nouvelles tables, migrations one-shot nécessaires.
- `InventoryProjectionService` doit être réécrit (vue plate → vue par
  conteneur).
- Le store client doit être adapté pour consommer `containers[]` au lieu de
  `inventory[]`.
- La `InventoryEntryDto` actuelle est conservée pour décrire les items,
  mais elle est maintenant imbriquée dans `InventorySlotView`.

### Risques

- **Migration Phase 1 incomplète** : si des stacks `Inventory` n'ont pas de
  `containerId` après la migration, la projection échoue. Un assert au
  démarrage est recommandé.
- **Double garde insuffisante** : si la contrainte `ON DELETE RESTRICT` n'est
  pas posée en migration (oubli), le guard applicatif seul peut être contourné
  par un bug. Les deux gardes sont obligatoires.

---

## Points restant à arbitrer (open questions non bloquantes en V1)

| Question | Options | À décider avant |
|---|---|---|
| Capacité du BASE | Fixe 24 / configurable par race ou classe | Phase Bag |
| Nombre de slots bag max | 1 bag (`bag` slot) / plusieurs (`bag-1..4`) | Phase Bag |
| Gap-finding | `MAX(slotIndex)+1` / requête gap SQL | Implémentation `findFreeSlot` |
| Inventaires PNJ | `ownerNpcId` / `ownerType` enum | Phase marchands PNJ |
| Bag dans bag | Interdit explicitement / autorisé (nesting) | Phase véhicules |
| Bag non vide V2 | Migration BASE si capacité / bag transportable | Phase Bag V2 |
| `InventoryContainerView.label` | Clé i18n / nom de l'item bag | Phase client |

---

## Validation

- [x] ADR-0004, ADR-0010, ADR-0011, ADR-0014 relues — aucune contradiction.
- [x] Architecture actuelle auditée (Inventory, ItemInstance, InventoryProjectionService,
      ItemTransferService, CharacterEquipment).
- [x] Comparaison InventorySlot vs slotIndex argumentée.
- [x] Règle bag non vide décidée (blocage V1).
- [x] Vue par conteneur décidée et format figé.
- [x] Impact sécurité examiné.
- [x] Plan de migration défini.
- [x] Validation humaine enregistrée — 2026-07-01.

---

## Related Files

- [ADR-0004 — Runtime-Driven Architecture](ADR-0004-runtime-driven-architecture.md)
- [ADR-0010 — Object Runtime Model](ADR-0010-object-runtime-model.md)
- [ADR-0011 — Item Materialization Pipeline](ADR-0011-item-materialization-pipeline.md)
- [ADR-0014 — Equipment Runtime V2](ADR-0014-equipment-runtime-v2.md)
- [Client Server Boundaries](../client-server-boundaries.md)
- [Implementation Rules](../../10_AI/implementation-rules.md)
- [Runtime Roadmap](../../09_Workflow/runtime-roadmap.md)
- [Item Taxonomy](../../08_Gameplay/item-taxonomy.md)
- [Object Runtime Architecture](../../08_Gameplay/object-runtime-architecture.md)
