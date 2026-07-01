# ADR-0014 — Equipment Runtime V2

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-07-01
- Date proposed: 2026-07-01
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on:
  - docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md
  - docs/01_Architecture/adr/ADR-0010-object-runtime-model.md
  - docs/01_Architecture/adr/ADR-0011-item-materialization-pipeline.md
  - docs/01_Architecture/adr/ADR-0012-gameplay-architecture.md
  - docs/01_Architecture/adr/ADR-0013-market-lots.md
  - docs/01_Architecture/client-server-boundaries.md
- Used by: Project owner, backend developers, gameplay designers,
  repository-aware coding agents
- Supersedes: Equipment MVP implicite (legacy `Inventory.equipped`, équipement
  direct via `Item.attack`/`Item.defense` sur `Character.attack`/`Character.defense`)
- Superseded by: None
- Related documents:
  - docs/08_Gameplay/runtime/README.md
  - docs/08_Gameplay/runtime/runtime-modifiers.md
  - docs/08_Gameplay/runtime/runtime-sources.md
  - docs/08_Gameplay/item-taxonomy.md
  - docs/08_Gameplay/object-runtime-architecture.md
  - docs/09_Workflow/runtime-roadmap.md
  - docs/09_Workflow/technical-debt.md
- Related code:
  - apps/api-gateway/src/characters/entities/character-equipment.entity.ts
  - apps/api-gateway/src/characters/equipment-stats.helper.ts
  - apps/api-gateway/src/item-transfer/item-transfer.service.ts
  - apps/api-gateway/src/player-runtime/equipment-modifier.mapper.ts
  - apps/api-gateway/src/player-runtime/runtime-source.ts

---

## Context

### État actuel — deux systèmes coexistent

L'équipement est aujourd'hui géré par deux pipelines parallèles incomplets :

**Pipeline ItemInstance (Implemented — chemin moderne)**

`ItemTransferService.applyEquip` transite une `ItemInstance` de l'état
`AVAILABLE` (containerType `INVENTORY`) vers l'état `EQUIPPED` (containerType
`EQUIPMENT`). La table `CharacterEquipment` reçoit une entrée avec
`itemInstanceId` renseigné. `recalculateEquipmentStats()` recalcule
`Character.attack`/`Character.defense` à partir de `CharacterEquipment` +
`Item.attack`/`Item.defense`. `EquipmentSource` lit `CharacterEquipment` et
produit des `RuntimeModifier[]` pour le pipeline Runtime.

**Pipeline legacy (TD-002, TD-005, TD-006 — chemin à supprimer)**

`CharacterEquipment` peut exister avec `itemInstanceId = null` — une référence
directe à `Item` via `itemId`, sans `ItemInstance` associée. L'endpoint legacy
`POST /characters/:id/equip` crée ce type d'entrée. `Inventory.equipped` (boolean)
marque encore certains items comme équipés côté inventaire stack. `applyUnequip`
sur un item legacy ne passe pas par `ItemTransferService`. Le frontend lit
`equipped: true/false` depuis `Inventory` pour afficher l'état équipé sur les
items STACKABLE (incorrect — les STACKABLE ne s'équipent pas).

**Dette technique ouverte (STATUS.md)**

| ID | Description |
|---|---|
| TD-002 | `Inventory.equipped` encore actif — boolean sur les stacks |
| TD-005 | `CharacterEquipment` non migré vers `ItemInstance` |
| TD-006 | Unequip ne passe pas par `ItemTransferService` pour les items legacy |

### Ce qui bloque la progression

Tant que le pipeline legacy coexiste avec le pipeline `ItemInstance`, il est
impossible de :

- construire un système de buffs/debuffs cohérent (quelle source de vérité ?) ;
- ajouter la durabilité (liée à `ItemInstance`, pas à `Item`) ;
- exposer des sockets, des runes, des enchantements (liés à `ItemInstance`) ;
- calculer des stats finales déterministes dans `RuntimeStatsService` sans
  risque de double-compter ou d'ignorer un item.

---

## Problem

Sans décision explicite, chaque nouvelle mécanique gameplay (combat, skills,
buffs, enchantements, durabilité, runes) risque de :

1. **Lire `Item.attack` directement** au lieu de consommer les stats calculées,
   contournant le pipeline Runtime et créant des calculs incohérents.
2. **Créer un troisième pipeline** (ex. un `BuffService` qui modifie
   `Character.attack` directement en DB) parallèle à `EquipmentSource` et au
   legacy, rendant toute trace de calcul impossible.
3. **Perpétuer le legacy** en ajoutant de la logique au-dessus de
   `Inventory.equipped` ou de `CharacterEquipment` sans `itemInstanceId`, rendant
   la migration future exponentiellement plus coûteuse.
4. **Fragmentation de la source de vérité** : `CharacterEquipment` pour le slot,
   `Inventory.equipped` pour le flag, `ItemInstance.state` pour la transition,
   `Character.attack` pour la stat finale — quatre vecteurs divergents sans
   autorité claire.

---

## Decision Drivers

- Une seule pipeline d'équipement. Zéro chemin alternatif.
- `CharacterEquipment` est la source de vérité des slots équipés, et
  `CharacterEquipment.itemInstanceId` est toujours non-null après la migration.
- `ItemTransferService` est le seul responsable des transitions d'état d'une
  `ItemInstance` lors de l'équipement et du déséquipement.
- `RuntimeStatsService` est la seule source consommée par le gameplay pour les
  stats finales. Aucun système ne lit `Item.attack` directement pour calculer des
  dégâts, des soins, ou tout autre résultat mécanique.
- Le legacy doit être supprimé, pas contourné.
- Les évolutions futures (durabilité, sockets, enchantements, runes, upgrades)
  doivent s'intégrer dans l'architecture décidée ici sans la remettre en cause.
- Compatible ADR-0004 (Runtime-Driven), ADR-0010 (Object Runtime), ADR-0011
  (Materialization Pipeline), ADR-0013 (Market Lots).

---

## Decision

### Décision 1 — Une seule pipeline d'équipement

Après la migration Phase 2 (suppression legacy), le chemin unique est :

```
Inventory (ItemInstance AVAILABLE, containerType INVENTORY)
    │
    │  POST /inventory/:characterId/equip-instance/:instanceId
    │  → ItemTransferService.applyEquip(manager, instance, requesterId, characterId)
    │
    ▼
CharacterEquipment (itemInstanceId NON-NULL, slot)
    │
    │  Lecture par EquipmentSource au moment du calcul Runtime
    │
    ▼
EquipmentSource → RuntimeModifier[]
    │
    │  Agrégation dans PlayerRuntimeService.buildSources()
    │
    ▼
RuntimeStatsService.computeStats(sources[]) → DerivedStats + RuntimeTrace
    │
    ├── Combat
    ├── Skills
    ├── Craft (vérification prérequis)
    └── UI (snapshot en lecture seule)
```

Aucun autre chemin ne peut équiper ou déséquiper un objet.

### Décision 2 — CharacterEquipment est la source de vérité des slots

`CharacterEquipment` représente l'état courant des slots équipés du personnage.
Sa contrainte `UNIQUE(characterId, slot)` garantit qu'un seul objet occupe un
slot à un instant donné.

Après la migration Phase 2 :

- `CharacterEquipment.itemInstanceId` est `NOT NULL`. Une entrée sans
  `ItemInstance` associée n'est pas un état valide.
- `CharacterEquipment.itemId` devient une colonne dénormalisée de confort pour
  les requêtes de lecture, toujours cohérente avec
  `ItemInstance.itemId`. Elle n'est pas la source d'autorité.
- `Inventory.equipped` est supprimé.

### Décision 3 — ItemTransferService contrôle toutes les transitions

`ItemTransferService` reste le seul service autorisé à modifier
`ItemInstance.state`, `ItemInstance.containerType`, et
`ItemInstance.containerId`.

Pour l'équipement :

| Transition | Précondition vérifiée | Résultat |
|---|---|---|
| `EQUIP` | `state = AVAILABLE`, `containerType = INVENTORY`, `instanceType = NORMAL`, `ownerId = requesterId` | `state → EQUIPPED`, `containerType → EQUIPMENT`, `containerId → characterId` + insertion `CharacterEquipment` |
| `UNEQUIP` | `state = EQUIPPED`, `containerType = EQUIPMENT`, `ownerId = requesterId` | `state → AVAILABLE`, `containerType → INVENTORY`, `containerId → characterId` + suppression `CharacterEquipment` |

`recalculateEquipmentStats()` est appelé dans la même transaction après chaque
`EQUIP` ou `UNEQUIP` pour maintenir `Character.attack`/`Character.defense` à
jour. Cette valeur est transitoire — elle est remplacée par `DerivedStats` dès
que `RuntimeStatsService` est la source de vérité unique (Phase 3).

### Décision 4 — RuntimeStatsService est la seule source consommée par le gameplay

`RuntimeStatsService` (extension de `PlayerRuntimeService`, Phase 3) calcule les
stats finales à partir de la pipeline de `RuntimeSource[]`. Le gameplay consomme
uniquement `DerivedStats` et jamais `Item.attack`, `Character.attack`, ou tout
autre champ intermédiaire.

Règle impérative : aucun système ne lit `Item.attack` pour calculer un résultat
mécanique (dégâts, soins, résistance). Tout système qui a besoin de la valeur
d'attaque d'un personnage lit `snapshot.derived.attackTotal`.

### Décision 5 — Les LOT ne s'équipent pas

`ItemTransferService.applyEquip` rejette toute `ItemInstance` dont
`instanceType !== NORMAL`. Les items de type LOT (créés par
`ItemTransferService.createLot()` pour le marché STACKABLE) ne peuvent jamais
occuper un slot d'équipement.

---

## Cycle de vie complet d'un item équipé

```
[Production]
  ItemMaterializationService.materialize()
    → ItemInstance { state: AVAILABLE, containerType: INVENTORY,
                     containerId: characterId, instanceType: NORMAL }
    → Inventory (si STACKABLE — ne s'équipe pas)

[Équipement]
  ItemTransferService.transition(EQUIP)
    → ItemInstance { state: EQUIPPED, containerType: EQUIPMENT,
                     containerId: characterId }
    → CharacterEquipment { itemInstanceId: uuid, slot: "right-hand" }
    → recalculateEquipmentStats() dans la même transaction

[Runtime]
  EquipmentSource.getModifiers()
    → lit CharacterEquipment[] JOIN ItemInstance JOIN Item
    → produit RuntimeModifier[] { targetStat: attackTotal, operation: flat, value: 5 }

[Calcul]
  RuntimeStatsService.computeStats(sources)
    → DerivedStats { attackTotal: baseAttack + 5, ... }
    → RuntimeTrace { stats.attackTotal.modifiers: [ { source: "Iron Sword", value: 5 } ] }

[Combat / Skills / UI]
  Consomme DerivedStats.attackTotal — ne lit jamais Item.attack

[Déséquipement]
  ItemTransferService.transition(UNEQUIP)
    → ItemInstance { state: AVAILABLE, containerType: INVENTORY }
    → CharacterEquipment row supprimée
    → recalculateEquipmentStats() dans la même transaction

[Drop / Transfer]
  ItemTransferService.transition(DROP_TO_WORLD | TRADE | MAIL | BANK | ...)
    Nécessite state = AVAILABLE (item non équipé)
```

---

## Pipeline Runtime — ordre des couches

`RuntimeStatsService` calcule les stats finales en appliquant les sources dans
l'ordre suivant. Chaque couche est **indépendante** : elle produit ses
`RuntimeModifier[]` sans connaître les autres couches. `resolveModifiers()`
agrège et applique dans l'ordre de priorité déclaré.

```
[1] BaseStats
      Source : Character.baseAttack, Character.baseDefense, Character.maxHp, ...
      Opération : flat (fondation, priorité 0)

[2] Equipment
      Source : EquipmentSource ← CharacterEquipment[] JOIN ItemInstance JOIN Item
      Opération : flat par défaut ; percent_add pour items à bonus multiplicatifs
      Exemples : +5 attack (Iron Sword), +10 defense (Iron Chestplate)

[3] Upgrades (+X)
      Source : UpgradeSource ← ItemInstance.upgradeLevel (Phase 4)
      Opération : flat par niveau ; ex. +1 attack par niveau sur une épée +3

[4] Enchantments
      Source : EnchantmentSource ← ItemInstance.enchantments[] (Phase 8)
      Opération : flat ou percent_add selon l'enchantement
      Exemples : +15% attack speed, +8 fire damage

[5] Runes
      Source : RuneSource ← ItemInstance.sockets[].rune (Phase 9)
      Opération : flat ou percent_add selon la rune
      Exemples : +20 HP, +5% critical chance

[6] Passive Skills
      Source : PassiveSkillSource ← SkillRuntime[] du personnage (Phase 6)
      Opération : flat ou percent_add selon le skill
      Exemples : "Swordsmanship Lv.3 → +12% attack"

[7] Buffs temporaires
      Source : EffectSource ← PlayerRuntimeEffect[] en mémoire (Phase 7)
      Opération : flat ou percent_add ; expiration par timestamp
      Exemples : "Rage Potion → +20% attack pendant 60s"

[8] Debuffs
      Source : EffectSource (kind = debuff) ← PlayerRuntimeEffect[] en mémoire
      Opération : flat négatif ou percent_multiply < 1
      Exemples : "Poison → -5 HP/tick", "Slow → -30% speed"

[9] Zone Effects
      Source : ZoneSource ← WOM, zone de terrain active (Phase 5+)
      Opération : flat ou percent_multiply selon la zone
      Exemples : "Sanctified Ground → +10% healing received"

[10] Guild Effects
      Source : GuildAuraSource ← état guild du personnage (Phase 5+)
      Opération : percent_add
      Exemples : "Guild Blessing Lv.2 → +5% all stats"

[11] Final Stats (DerivedStats)
      Résultat immuable, transmis au gameplay et au Studio SDK.
      Aucune couche ne le modifie après ce point.
```

`resolveModifiers()` (existant dans `PlayerRuntimeService`) applique les
opérations dans l'ordre `flat → percent_add → percent_multiply`, quel que soit
l'ordre d'arrivée des sources. L'ordre des couches ci-dessus est l'ordre
d'enregistrement dans `buildSources()`, pas l'ordre d'application mathématique.

---

## Drag & Drop — règles d'interaction

### Inventaire ↔ Inventaire

Réorganisation locale. Pas de transition `ItemInstance` — uniquement un
réordonnancement de présentation côté client. Aucun appel serveur nécessaire sauf
si une swap entre bags distincts implique une mutation de `containerId`.

**V1 — session-local** : un `slotMap[18]` (tableau d'ids) maintenu dans
`Inventory.jsx` préserve le tri pendant la session. Résynchronisation conservative
au `loadCharacter` : les positions connues sont conservées, les nouvelles entrées
sont placées dans les premiers slots libres. Le tri ne survivra pas à un rechargement
de page. La persistance serveur (ADR-0015 `InventorySlot`) est planifiée.

### Inventaire → Slot d'équipement

```
Client : drag ItemInstance depuis Inventory vers slot cible
    ↓
Client : POST /inventory/:characterId/equip-instance/:instanceId
    ↓
Serveur : vérification slot compatible (Item.slot === target slot)
         vérification prérequis skill si applicable (Phase 6)
         ItemTransferService.transition(EQUIP)
         Si slot déjà occupé → auto-swap (voir ci-dessous)
    ↓
Serveur : émet character:reload → Client actualise snapshot
```

### Slot d'équipement → Inventaire

```
Client : drag depuis slot vers Inventory, ou double-clic sur slot
    ↓
Client : POST /inventory/:characterId/unequip/:slot
    ↓
Serveur : ItemTransferService.transition(UNEQUIP)
    ↓
Serveur : émet character:reload → Client actualise snapshot
```

### Auto-swap

Si le slot cible est déjà occupé et que le drag provient de l'inventaire, le
serveur effectue deux transitions atomiques dans la même transaction :

```
UNEQUIP(ancienne instance) → state AVAILABLE, containerType INVENTORY
EQUIP(nouvelle instance)   → state EQUIPPED,  containerType EQUIPMENT
```

Les deux transitions ont lieu sous un verrou pessimiste sur les deux
`ItemInstance` (ordre lexicographique sur `instanceId` pour éviter les
deadlocks — même convention que `TradeService`).

### Auto-slot pour types multi-emplacements

Pour les slots qui existent en plusieurs exemplaires (`left-earring`,
`right-earring`, `left-ring`, `right-ring`, `left-bracelet`, `right-bracelet`),
le serveur détermine automatiquement le slot disponible selon cette règle :

```
1. Le slot demandé par le client (si précisé et disponible).
2. Le premier slot libre parmi les variantes (left avant right).
3. Si tous les slots sont occupés : auto-swap du slot le plus anciennement équipé.
```

Le client peut préciser un slot cible dans le payload. S'il ne le précise pas,
le serveur applique la règle ci-dessus.

---

## RuntimeModifier — comment les objets produisent des modificateurs

Un objet équipé ne modifie jamais directement `Character.attack` ou toute autre
stat persistée. Il produit des `RuntimeModifier[]` via `EquipmentSource`, qui
sont agrégés par `resolveModifiers()` au moment du calcul.

**Exemple — Épée de fer**

```
CharacterEquipment { slot: "right-hand", itemInstanceId: "uuid-sword", itemId: "uuid-iron-sword" }
    ↓
Item { name: "Épée de fer", attack: 5, defense: 0 }
    ↓
equipmentToModifiers([charEquip]) → [
  RuntimeModifier {
    targetStat : "attackTotal",
    operation  : "flat",
    value      : 5,
    sourceType : "equipment",
    sourceId   : "uuid-sword",      // itemInstanceId — traçable
    sourceLabel: "Épée de fer",     // affiché dans RuntimeInspectorPanel
    priority   : 0,
  }
]
    ↓
RuntimeStatsService : baseAttack(10) + flat(5) = attackTotal(15)
    ↓
DerivedStats { attackTotal: 15 }
    ↓
CombatService consomme DerivedStats.attackTotal — jamais Item.attack directement
```

**Règle fondamentale** : `EquipmentSource.getModifiers()` est une transformation
pure en mémoire. Elle ne fait aucune I/O. Les données `CharacterEquipment[]` ont
été chargées en amont par `PlayerRuntimeService.buildSources()`.

---

## Séparation des responsabilités

| Entité | Rôle | Ce qu'elle ne fait pas |
|---|---|---|
| `Item` | Template permanent du catalogue. Définit `attack`, `defense`, `slot`, `objectMode`. | Ne porte pas d'état. Ne change pas en jeu. |
| `ItemInstance` | Données propres à un exemplaire (uuid, état, owner, upgrades, enchantements, durabilité). | Ne calcule pas les stats. Ne connaît pas les slots. |
| `CharacterEquipment` | Mapping slot ↔ ItemInstance pour un personnage. Source de vérité des slots occupés. | Ne calcule pas les stats. Ne valide pas les prérequis. |
| `RuntimeModifier` | Unité atomique d'effet sur une stat dérivée. Produit par une `RuntimeSource`. | N'est jamais persisté. Calculé à la demande. |
| `RuntimeStatsService` | Agrège les sources, applique les modifiers, produit `DerivedStats + RuntimeTrace`. | Ne persiste aucune stat dérivée. Ne connaît pas les règles métier de chaque source. |
| `Character` | Porte `baseAttack`, `baseDefense`, `maxHp` (stats permanentes). Porte `attack`, `defense` (cache transitoire — supprimé Phase 3). | Ne calcule pas lui-même ses stats dérivées. |
| `ItemTransferService` | Seul service autorisé à muter `ItemInstance.state/containerType/containerId`. | Ne calcule pas les stats. Ne lit pas `Item.attack`. |
| `recalculateEquipmentStats()` | Maintient `Character.attack/defense` à jour pendant la Phase transitoire. | Remplacé par `RuntimeStatsService` en Phase 3. |

---

## Évolutions futures — intégration dans l'architecture

Les évolutions ci-dessous s'intègrent sans remettre en cause les décisions prises
dans cette ADR. Elles ajoutent des champs à `ItemInstance` et des `RuntimeSource`
supplémentaires.

### Durabilité (Phase 10)

```
ItemInstance.durability        : nombre entier (0–max)
ItemInstance.maxDurability     : nombre entier
ItemInstance.durabilityPercent : float calculé (not persisted)
```

Quand `durability = 0`, l'item est cassé. `EquipmentSource` ne produit aucun
modifier pour un item cassé. Le slot reste occupé mais sans effet. Un système de
réparation recharge `durability` dans une transaction `ItemTransferService`
ou via un service dédié `RepairService`.

### Sockets et Runes (Phase 9)

```
ItemInstance.sockets : Socket[] — array JSON ou table liée
Socket { index, runeId | null }
```

`RuneSource` lit `ItemInstance.sockets[]` et produit des `RuntimeModifier[]`
par rune insérée. La pose et le retrait de runes passent par
`ItemTransferService` ou un `RuneService` délégué, jamais par mutation directe.

### Enchantements (Phase 8)

```
ItemInstance.enchantments : Enchantment[] — array JSON ou table liée
Enchantment { id, stat, operation, value, tier }
```

`EnchantmentSource` lit `ItemInstance.enchantments[]` et produit des
`RuntimeModifier[]`. L'ajout d'un enchantement est une mutation d'`ItemInstance`
via `EnchantmentService`, pas via `ItemTransferService` (l'état de l'instance ne
change pas, seulement ses données internes).

### Upgrades — Amélioration +X (Phase 4)

```
ItemInstance.upgradeLevel : integer (0–max défini par Item.maxUpgrade)
```

`UpgradeSource` lit `ItemInstance.upgradeLevel` et produit des `RuntimeModifier[]`
additifs par niveau. L'upgrade est une mutation d'`ItemInstance` via
`UpgradeService`.

### Random Rolls — propriétés générées à la production (Phase 4)

```
ItemInstance.rolls : Roll[] — array JSON
Roll { stat, value } — valeur tirée dans [Item.rollMin, Item.rollMax]
```

Générés une seule fois à la création par `ItemMaterializationService`. Jamais
modifiés après création. `EquipmentSource` inclut les rolls dans ses
`RuntimeModifier[]` en complément des stats fixes de l'`Item`.

### Item Binding (Phase 4)

```
ItemInstance.binding : 'NONE' | 'ON_EQUIP' | 'ON_PICKUP' | 'SOULBOUND'
```

`ItemTransferService` vérifie le `binding` avant d'autoriser un transfert.
Un item `SOULBOUND` ne peut pas être tradé, vendu en Auction, ni envoyé par
Mail. Ce contrôle est dans `ItemTransferService` — toutes les transitions
passent par là.

### Crafted By (Phase 4)

```
ItemInstance.craftedByCharacterId : string | null
ItemInstance.craftedAt            : Date | null
```

Renseigné par `CraftService` dans la même transaction que `materialize()`.
Affiché dans le tooltip de l'item. Jamais modifié après la création.

### Skins (Phase visuelle)

```
ItemInstance.skinId : string | null — référence vers un catalogue de skins
```

Modification visuelle uniquement. `EquipmentSource` ignore `skinId`. Le rendu
est résolu côté client par le `textureKey` du skin, pas par les stats.

---

## Règles impératives

Les règles suivantes s'appliquent à toute nouvelle implémentation touchant
l'équipement ou les stats :

1. **Une seule pipeline.** `POST /inventory/:characterId/equip-instance/:instanceId`
   est le seul endpoint d'équipement. L'endpoint legacy `POST /characters/:id/equip`
   est supprimé en Phase 2.

2. **ItemTransferService est le seul responsable des transitions.** Aucun service
   ne modifie directement `ItemInstance.state`, `containerType`, ou `containerId`
   pour une opération d'équipement ou de déséquipement.

3. **CharacterEquipment.itemInstanceId est toujours non-null.** Après la
   migration Phase 2, une entrée `CharacterEquipment` sans `itemInstanceId` est
   un état invalide. Les seeds et migrations doivent garantir cette invariant.

4. **Aucun gameplay ne recalcule les stats.** `CombatService`, `SkillService`,
   `CraftService`, et tous les futurs domaines consomment `DerivedStats` depuis
   `RuntimeStatsService`. Ils ne lisent jamais `Item.attack`, `Item.defense`,
   `Character.attack`, ou `Character.defense` pour des décisions mécaniques.

5. **RuntimeStatsService est la seule source de stats finales.** Il est le seul
   service autorisé à agréger des `RuntimeModifier[]` et à produire des
   `DerivedStats`. Aucun service concurrent n'effectue ce calcul.

6. **Aucune logique legacy n'est autorisée.** Toute nouvelle fonctionnalité doit
   passer par le pipeline `ItemInstance → CharacterEquipment → EquipmentSource →
   RuntimeStatsService`. L'ajout de logique sur `Inventory.equipped` ou sur
   `CharacterEquipment` sans `itemInstanceId` est interdit.

7. **Les LOT ne s'équipent pas.** `ItemTransferService.applyEquip` lève
   `BadRequestException` si `instanceType !== NORMAL`. Cette règle n'a pas
   d'exception.

8. **Le frontend ne recalcule jamais.** Le client reçoit `DerivedStats` en
   lecture seule. Il affiche, il n'interprète pas. Toute valeur mécanique (dégâts
   infligés, résistance, portée) est calculée côté serveur.

9. **`EquipmentSource.getModifiers()` est sans I/O.** Les données sont chargées
   en amont par `buildSources()`. Aucun appel DB dans `getModifiers()`.

10. **Toute nouvelle `RuntimeSource` pour l'équipement est ajoutée dans
    `buildSources()` uniquement.** C'est le point de construction unique de la
    pipeline. Aucune source n'est instanciée ailleurs.

---

## Plan de migration

### Phase 1 — Equipment UX ✓ Implémenté (2026-07-01)

**Objectif** : l'expérience d'équipement est complète et correcte pour l'utilisateur
final, sur le chemin `ItemInstance` uniquement.

Périmètre :
- ✓ Drag inventaire → slot d'équipement (`POST /inventory/:id/equip-instance/:instanceId`)
- ✓ Drag slot d'équipement → inventaire (`POST /inventory/:id/unequip/:slot`)
- ✓ Double-clic equip/unequip (existant, corrigé)
- ✓ Auto-slot pour earring, ring, bracelet (`resolveEquipSlot` côté serveur)
- ✓ Auto-swap : si slot cible occupé, l'ancienne instance est UNEQUIP'd dans la même transaction
- ✓ Réorganisation inventaire ↔ inventaire (session-local, `slotMap`)
- ✓ Feedback visuel : slots vert (compatible vide), orange (swap), rouge (incompatible)
- ✓ Fix store : `equipment` map conserve `instanceId` ; `unequipItem` utilise le bon endpoint
- ✓ 3 nouveaux tests backend (auto-slot : libre, partiellement occupé, tous occupés)
- ⏳ Affichage des stats avant/après équipement dans l'UI (delta) — reporté Phase 3
- ⏳ `character:reload` socket côté serveur — à brancher quand le socket runtime est câblé

Prérequis : aucun. S'appuie sur le pipeline `ItemInstance` existant.

Fin de phase : un joueur peut équiper, déséquiper, swapper et réorganiser ses items
via l'interface en jeu.

---

### Phase 2 — Suppression legacy

**Objectif** : `CharacterEquipment.itemInstanceId` est toujours non-null.
`Inventory.equipped` est supprimé. L'endpoint legacy est retiré.

Périmètre :
- Migration SQL : `CharacterEquipment` rows avec `itemInstanceId = null` →
  création des `ItemInstance` correspondantes (état `EQUIPPED`,
  `containerType EQUIPMENT`) si les `Item` sont en `objectMode INSTANCE`.
  Pour les items STACKABLE mal équipés (cas legacy impossible en théorie), log
  d'erreur et suppression de l'entrée.
- Suppression de `Inventory.equipped` (colonne + logique).
- Suppression de `POST /characters/:id/equip` (endpoint legacy).
- Suppression de la logique legacy dans `CharacterService.unequipItem`.
- `assertObjectModeChangeable()` dans `ItemService` est maintenant complète
  (character_equipment couvert — voir fix(items) 2026-07-01).
- Tests de régression sur equip/unequip via le chemin `ItemInstance`.

Fin de phase : TD-002, TD-005, TD-006 soldées. Un seul pipeline.

---

### Phase 3 — RuntimeModifiers comme source de vérité des stats

**Objectif** : `RuntimeStatsService` remplace `recalculateEquipmentStats()`.
`Character.attack` et `Character.defense` deviennent des caches optionnels ou
sont supprimés.

Périmètre :
- `PlayerRuntimeService` étendu en `RuntimeStatsService` avec l'API
  `computeStats(characterId)` → `DerivedStats + RuntimeTrace`.
- `EquipmentSource` migré pour lire `CharacterEquipment JOIN ItemInstance JOIN Item`
  (actuellement il lit `CharacterEquipment JOIN Item` sans passer par l'instance).
- `recalculateEquipmentStats()` remplacé par un appel à
  `RuntimeStatsService.invalidate(characterId)` qui force le recalcul au prochain
  accès au snapshot.
- `character:reload` retourne `snapshot.derived` au lieu de `Character.attack`.
- Studio SDK : `RuntimeInspectorPanel` déjà fonctionnel — aucune modification.

Fin de phase : aucun gameplay ne lit `Character.attack` directement.
`Item.attack` n'est plus lu que par `EquipmentSource`.

---

### Phase 4 — ItemInstance avancé

**Objectif** : les champs avancés de l'instance sont définis et gérés.

Périmètre :
- `ItemInstance.upgradeLevel` + `UpgradeSource` + `UpgradeService`
- `ItemInstance.rolls[]` (random rolls, générés à la production par
  `ItemMaterializationService`)
- `ItemInstance.craftedByCharacterId` + `craftedAt` (branché sur `CraftService`)
- `ItemInstance.binding` (vérification dans `ItemTransferService`)
- `ItemInstance.skinId` (affichage client uniquement)
- Affichage dans le tooltip item (frontend)

Fin de phase : une `ItemInstance` porte toute l'information nécessaire pour les
mécaniques avancées.

---

### Phase 5 — Combat Runtime

**Objectif** : le combat lit `DerivedStats` exclusivement.

Périmètre :
- `CombatService` refactoré pour consommer `RuntimeStatsService.computeStats()`
  au lieu de lire `Character.attack` directement.
- Dégâts calculés côté serveur : `damage = attackerStats.attackTotal -
  defenderStats.defenseTotal` (formule extensible).
- Résistances, pénétration, types de dégâts comme `RuntimeModifier[]`.
- Anti-cheat : validation que le dégât reçu est cohérent avec les stats connues
  du serveur.

Fin de phase : le combat est entièrement Runtime-driven.

---

### Phase 6 — Skills

**Objectif** : les skills actifs et passifs modifient les stats via `RuntimeModifier`.

Périmètre :
- `SkillRuntime` entity + `SkillRuntimeService`
- `PassiveSkillSource` → produit des `RuntimeModifier[]` selon les skills débloqués
- Vérification des prérequis skill dans `ItemTransferService.applyEquip`
  (ex. niveau 5 requis pour équiper une épée avancée)
- XP award et level-up via événements gameplay

Fin de phase : les skills influencent les stats et l'équipement.

---

### Phase 7 — Buffs et Debuffs

**Objectif** : les effets temporaires sont gérés via `EffectSource`.

Périmètre :
- `PlayerRuntimeEffect[]` en mémoire avec `expiresAt`
- `EffectSource.resolveEffects()` alimenté (actuellement retourne `[]`)
- Potions consommables → effet en mémoire → modifier
- Debuffs de créatures (poison, slow, stun) via `EffectSource`

Fin de phase : buffs et debuffs sont traçables dans le `RuntimeInspectorPanel`.

---

### Phase 8 — Enchantements

**Objectif** : les enchantements sur `ItemInstance` produisent des `RuntimeModifier`.

Périmètre :
- `ItemInstance.enchantments[]` (structure de données)
- `EnchantmentService` pour appliquer/retirer un enchantement
- `EnchantmentSource` → `RuntimeModifier[]`
- Affichage dans le tooltip et dans `RuntimeInspectorPanel`

---

### Phase 9 — Runes

**Objectif** : les sockets et runes sur `ItemInstance` produisent des `RuntimeModifier`.

Périmètre :
- `ItemInstance.sockets[]` (structure de données)
- `RuneService` pour insérer/retirer une rune
- `RuneSource` → `RuntimeModifier[]`

---

### Phase 10 — Durabilité

**Objectif** : les items équipés s'usent et deviennent inactifs à durabilité 0.

Périmètre :
- `ItemInstance.durability` + `ItemInstance.maxDurability`
- Décrémentation à chaque usage en combat
- `EquipmentSource` : modifier nul si `durability = 0`
- `RepairService` pour recharger la durabilité (via NPC ou table d'artisanat)
- Affichage dans le tooltip (barre de durabilité)

---

## Diagramme de dépendances

```
                         ┌──────────────┐
                         │   Item       │ catalogue permanent
                         │  (template)  │ attack, defense, slot, objectMode
                         └──────┬───────┘
                                │ 1 Item → N ItemInstance
                         ┌──────▼───────┐
                         │ ItemInstance │ uuid, state, containerType
                         │              │ upgradeLevel, rolls, enchantments
                         │              │ sockets, binding, durability
                         └──────┬───────┘
                                │ 1 ItemInstance → 0-1 CharacterEquipment
                         ┌──────▼───────────┐
                         │ CharacterEquipment│ slot, characterId
                         │  (source vérité) │ itemInstanceId NOT NULL
                         └──────┬───────────┘
                                │ lu par
                         ┌──────▼───────┐
                         │ EquipmentSource│ getModifiers() — pure, no I/O
                         └──────┬────────┘
                                │ produit
                         ┌──────▼───────────┐     ┌─────────────────────┐
                         │ RuntimeModifier[] │◄────┤ UpgradeSource       │
                         │                  │◄────┤ EnchantmentSource   │
                         └──────┬───────────┘◄────┤ RuneSource          │
                                │             ◄────┤ PassiveSkillSource  │
                                │             ◄────┤ EffectSource (buffs)│
                                │             ◄────┤ EffectSource (debuf)│
                                │             ◄────┤ ZoneSource          │
                                │             ◄────┤ GuildAuraSource     │
                                │
                         ┌──────▼──────────────┐
                         │ RuntimeStatsService  │ resolveModifiers()
                         │                      │ → DerivedStats
                         │                      │ → RuntimeTrace
                         └──────┬───────────────┘
                                │ consommé par
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                   ▼
        CombatService     SkillService         UI (snapshot)
        (Phase 5)         (Phase 6)            (lecture seule)
```

---

## Règles héritées des ADR dépendantes

| ADR | Règle applicable à l'équipement |
|---|---|
| ADR-0004 | `EquipmentSource.getModifiers()` est sans I/O. `buildSources()` est le seul point de construction. |
| ADR-0010 | Un `ItemInstance EQUIPPED` a exactement un `CharacterEquipment` actif (Invariant I1 étendu au slot). |
| ADR-0011 | `ItemMaterializationService` crée les instances. `ItemTransferService` les transite. Jamais les deux en même temps sur la même instance. |
| ADR-0013 | Les LOT ne s'équipent pas. `applyEquip` rejette `instanceType !== NORMAL`. |
| Client/Server | Le client ne calcule jamais les stats. Il reçoit `DerivedStats` en lecture seule via socket ou REST. |

---

## Conséquences

### Positives

- Un seul pipeline. Une seule source de vérité par préoccupation.
- Toutes les sources de stats sont traçables dans `RuntimeInspectorPanel` sans
  développement additionnel.
- L'ajout de durabilité, runes, enchantements, upgrades n'impacte que la couche
  `ItemInstance` et la `RuntimeSource` correspondante — pas `CharacterEquipment`,
  pas `ItemTransferService`, pas `RuntimeStatsService`.
- La suppression du legacy (Phase 2) élimine trois dettes techniques (TD-002,
  TD-005, TD-006) et simplifie définitivement le code.

### Négatives

- La migration Phase 2 requiert une migration SQL avec risque de données
  incohérentes (CharacterEquipment legacy sans ItemInstance). Un script d'audit
  préalable est recommandé.
- `recalculateEquipmentStats()` est une dette transitoire jusqu'en Phase 3. Il
  doit être maintenu fonctionnel pendant les Phases 1 et 2.
- La Phase 3 requiert que tous les consommateurs de `Character.attack` soient
  migrés vers `DerivedStats.attackTotal` avant de pouvoir supprimer la colonne.

### Risques

- **Migration Phase 2 incomplète** : si des entrées `CharacterEquipment` sans
  `itemInstanceId` subsistent après la migration, `EquipmentSource` ignore ces
  slots (il filtre sur `itemInstanceId IS NOT NULL`). Le personnage perd
  silencieusement les stats de ces items. À détecter par un assert au démarrage.
- **Consommateur qui lit `Character.attack` directement après Phase 3** : si un
  service est manqué lors de la migration Phase 3, il opère avec une stat
  potentiellement obsolète (cache non invalidé). À détecter par grep sur
  `Character.attack` dans les services après migration.
- **Source sans `sourceId` traçable** : un `RuntimeModifier` sans `sourceId`
  correctement renseigné ne peut pas être identifié dans la trace en cas de bug
  de calcul. Règle : `sourceId` est toujours `ItemInstance.id` (jamais `Item.id`)
  pour les sources d'équipement.

---

## Relation avec runtime-roadmap.md

`docs/09_Workflow/runtime-roadmap.md` définit **Equipment Runtime V2** comme
une phase d'implémentation ouverte depuis le commit `b8ac4a6`, statut
**In Progress**.

ADR-0014 ne redémarre pas ce chantier. Elle formalise les règles définitives
qui permettent de le terminer et de construire toutes les mécaniques futures
(combat, skills, enchantements, runes, durabilité) sur une base cohérente.

### Travaux déjà validés — restent en vigueur

Les implémentations suivantes sont conformes à l'ADR et ne nécessitent pas
de réécriture :

- **`equipItemInstance`** (`InventoryService`) — chemin moderne d'équipement
  via `ItemInstance`, délègue à `ItemTransferService`.
- **Transitions EQUIP / UNEQUIP** (`ItemTransferService`) — verrou pessimiste,
  validation `state`, `containerType`, `ownerId`, rejet anti-LOT
  (`instanceType !== NORMAL`).
- **`CharacterEquipment`** comme projection des slots occupés, avec
  `itemInstanceId` renseigné sur le chemin `ItemInstance`.
- **Guard anti-LOT** (`applyEquip` lève `BadRequestException` si
  `instanceType !== NORMAL`).
- **`recalculateEquipmentStats()`** — recalcul provisoire de `Character.attack`
  / `Character.defense` dans la même transaction. Reste valide jusqu'à la
  Phase 3 de migration.

### Dettes techniques — à solder pendant la migration

Les dettes TD-002, TD-005 et TD-006 documentées dans `STATUS.md` et
`technical-debt.md` restent ouvertes. Elles sont adressées en Phase 2
(suppression legacy) de ce plan de migration.

| ID | Description |
|---|---|
| TD-002 | `Inventory.equipped` encore actif — boolean sur les stacks |
| TD-005 | `CharacterEquipment` non migré vers `ItemInstance` pour les items legacy |
| TD-006 | Unequip ne passe pas par `ItemTransferService` pour les items legacy |

### Règle de conformité

À partir de l'acceptation de cette ADR, toute nouvelle modification touchant
l'équipement — endpoint, service, entité, transition — doit être conforme aux
décisions définies ici. Aucune logique ne peut être ajoutée sur le chemin
legacy (`Inventory.equipped`, `CharacterEquipment` sans `itemInstanceId`,
endpoint `POST /characters/:id/equip`) en dehors de la migration de suppression
(Phase 2).

---

## Impact sécurité

- Le client ne soumet jamais des stats, des dégâts, ou des valeurs de modifier.
- L'endpoint d'équipement vérifie `character.userId === req.user.userId` avant
  toute transaction (anti-équipement sur le personnage d'un autre joueur).
- `ItemTransferService` vérifie `ownerId = requesterId` avant chaque transition.
- Les stats finales ne sont envoyées au client que via `character:reload` ou
  `GET /characters/me` — jamais précalculées côté client.
- Les endpoints debug Runtime (`addDebugModifier`) restent protégés par
  `@Roles(ADMIN)`.

---

## Impact performance

- `EquipmentSource.getModifiers()` est O(N) sur le nombre de pièces équipées
  (typiquement 1–16 slots). Coût négligeable.
- Le snapshot Runtime n'est pas recalculé en continu — uniquement sur événement
  (equip, unequip, buff ajouté, demande explicite).
- L'auto-swap requiert deux transitions atomiques sous verrou pessimiste. Le coût
  est celui de deux `SELECT FOR UPDATE` + deux `UPDATE` dans la même transaction.
- `RuntimeStatsService.computeStats()` est O(K × M) où K = nombre de stats et
  M = nombre total de modifiers actifs. Pour un joueur avec 16 items équipés, 5
  buffs, et 10 stats, M ≈ 80. Coût sub-milliseconde.

---

## Validation

- [ ] ADR-0004, ADR-0010, ADR-0011, ADR-0012, ADR-0013 relues — aucune contradiction.
- [ ] Code existant audité (CharacterEquipment, ItemTransferService, EquipmentSource,
      recalculateEquipmentStats).
- [ ] Impact sécurité examiné.
- [ ] Impact performance examiné.
- [ ] Validation humaine enregistrée.

---

## Open Questions

- `Character.attack`/`Character.defense` doivent-ils être conservés comme cache
  de `DerivedStats.attackTotal`/`defenseTotal` après Phase 3, ou supprimés
  complètement ? La conservation simplifie les requêtes de lecture directe en DB
  mais crée un double de vérité à maintenir en cohérence.
- Faut-il un `EquipmentPrerequisiteService` distinct pour vérifier les prérequis
  (level, skill, faction) avant equip, ou cette logique est-elle dans
  `ItemTransferService.applyEquip` directement ?
- ~~L'auto-slot pour les types multi-emplacements (ring, earring, bracelet) est-il
  géré côté serveur (décision opaque pour le client) ou le client doit-il spécifier
  explicitement le slot gauche/droit dans le payload ?~~
  **Résolu — V1** : géré côté serveur via `resolveEquipSlot()` (`InventoryService`).
  Le client soumet uniquement l'`instanceId`. Le serveur choisit le premier slot libre
  de la paire (`left` avant `right`) ; si les deux sont occupés, swap sur `pair[0]`.
  Le client peut préciser un slot cible dans une version future.

---

## Non-goals

- Cette ADR ne définit pas l'implémentation de `CombatService` (Phase 5).
- Elle ne définit pas le système de skills (Phase 6).
- Elle ne definit pas l'implémentation de `EnchantmentService`, `RuneService`,
  ou `UpgradeService` — uniquement leur contrat d'intégration.
- Elle ne couvre pas le système d'inventaire UI au-delà des règles d'équipement.
- Elle ne documente pas le système de crafting en dehors de sa consommation de
  `DerivedStats` pour les prérequis.

---

## Related Files

- [ADR-0004 — Runtime-Driven Architecture](ADR-0004-runtime-driven-architecture.md)
- [ADR-0010 — Object Runtime Model](ADR-0010-object-runtime-model.md)
- [ADR-0011 — Item Materialization Pipeline](ADR-0011-item-materialization-pipeline.md)
- [ADR-0012 — Gameplay Architecture V1](ADR-0012-gameplay-architecture.md)
- [ADR-0013 — Market Lots](ADR-0013-market-lots.md)
- [Runtime — Index](../../08_Gameplay/runtime/README.md)
- [Runtime Modifiers](../../08_Gameplay/runtime/runtime-modifiers.md)
- [Runtime Sources](../../08_Gameplay/runtime/runtime-sources.md)
- [Item Taxonomy](../../08_Gameplay/item-taxonomy.md)
- [Object Runtime Architecture](../../08_Gameplay/object-runtime-architecture.md)
- [Runtime Roadmap](../../09_Workflow/runtime-roadmap.md)
- [Technical Debt](../../09_Workflow/technical-debt.md)
- [Client Server Boundaries](../client-server-boundaries.md)

---

## TODO

- [ ] Soumettre à revue humaine pour passage à `Accepted`.
- [ ] Répondre aux open questions (cache `Character.attack`, prerequisite service,
      auto-slot client vs serveur) avant de commencer Phase 1.
- [ ] Mettre à jour `docs/09_Workflow/runtime-roadmap.md` pour référencer
      ADR-0014 dans la section Equipment Runtime V2.
- [ ] Mettre à jour `STATUS.md` quand la Phase 1 est démarrée.
- [ ] Ajouter dans `docs/01_Architecture/adr/README.md` la référence à cette ADR.
