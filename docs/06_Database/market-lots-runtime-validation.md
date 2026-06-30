# Market Lots — Validation runtime et notes de schéma

## Metadata

- Status: Implemented
- Last updated: 2026-06-30
- Depends on: ADR-0013, `1783555200000-AddInstanceTypeAndQuantityToItemInstance.ts`
- Related: `docs/08_Gameplay/auction-house-specifications.md`

---

## Point critique : `synchronize: true` ne crée pas tout

`synchronize: true` (mode dev) crée les colonnes `instanceType` et `quantity` sur
la table `item_instance`, mais **n'applique pas** :

- la contrainte `CHECK chk_instance_type_quantity`
- l'index partiel `idx_item_instance_lots`

Ces deux objets SQL sont définis dans la migration TypeORM
`1783555200000-AddInstanceTypeAndQuantityToItemInstance.ts`.

**En développement**, les appliquer manuellement une fois après le premier
démarrage du backend :

```sql
ALTER TABLE item_instance
  ADD CONSTRAINT chk_instance_type_quantity
  CHECK (
    (("instanceType"::text = 'NORMAL') AND quantity IS NULL)
    OR (("instanceType"::text = 'LOT')  AND quantity > 0)
  );

CREATE INDEX idx_item_instance_lots
  ON item_instance ("instanceType")
  WHERE "instanceType" = 'LOT';
```

> Note : TypeORM `synchronize: true` utilise les noms de propriété TypeScript
> tels quels (camelCase). La colonne s'appelle `"instanceType"` en base, pas
> `instance_type`. La migration utilise le même nom.

**En production**, la migration s'applique via `typeorm migration:run` et crée
la contrainte et l'index correctement.

---

## Pipeline validé en base (2026-06-30)

Le pipeline complet Inventory → LOT → Auction → Mail → Claim → Inventory a été
déroulé contre PostgreSQL 18.1 avec le backend NestJS en cours d'exécution.

### Cas 1 — Création d'un listing STACKABLE

```
POST /auction/listings { buildingId, itemId, quantity: 500, buyoutPriceBronze, durationHours }
```

État attendu et observé :

```sql
-- ItemInstance LOT
SELECT "instanceType", quantity, state, "containerType", "createdBySource"
FROM item_instance WHERE id = '<lot_id>';
-- LOT | 500 | LISTED | AUCTION | MARKET_LOT  ✓

-- Inventory vendeur décrémenté
SELECT quantity FROM inventory
WHERE "characterId" = '<seller_id>' AND "itemId" = '<item_id>';
-- 500 (était 1000)  ✓

-- AuctionListing créé
SELECT status, "itemInstanceId" FROM auction_listing WHERE id = '<listing_id>';
-- LISTED | <lot_id>  ✓
```

### Cas 2 — Achat + claim acheteur

```
POST /auction/listings/<id>/buy { buildingId }
POST /mail/<mail_id>/claim { buildingId }
```

État après claim :

```sql
SELECT "instanceType", quantity, state, "containerType"
FROM item_instance WHERE id = '<lot_id>';
-- LOT | 500 | DESTROYED | NONE  ✓

SELECT quantity FROM inventory
WHERE "characterId" = '<buyer_id>' AND "itemId" = '<item_id>';
-- 500  ✓
```

### Cas 3 — Annulation vendeur + claim retour

```
DELETE /auction/listings/<id>
POST /mail/<mail_id>/claim { buildingId }
```

```sql
SELECT state FROM item_instance WHERE id = '<lot_id>';
-- DESTROYED  ✓

SELECT quantity FROM inventory
WHERE "characterId" = '<seller_id>' AND "itemId" = '<item_id>';
-- restauré  ✓
```

### Cas 4 — Expiration automatique

Le scheduler `AuctionScheduler` (toutes les 60 s) a traité l'annonce expirée
en ~10 s. État après claim du mail d'expiration :

```sql
SELECT state, "containerType" FROM item_instance WHERE id = '<lot_id>';
-- DESTROYED | NONE  ✓
```

### Cas 5 — Rollback transactionnel (quantity > stock)

```
POST /auction/listings { quantity: 999999 }
→ 400 Insufficient inventory
```

```sql
SELECT COUNT(*) FROM item_instance
WHERE "ownerId" = '<seller_id>' AND "instanceType" = 'LOT' AND state != 'DESTROYED';
-- 0  ✓ (aucun LOT orphelin)
```

---

## Contrôles de sécurité validés

| Test | Résultat |
|---|---|
| `quantity` négative | `400` — rejeté par le DTO (`@IsPositive`) |
| `quantity` = 0 | `400` — rejeté par le DTO |
| Building invalide | `400 Building introuvable` |
| Item INSTANCE dans branche STACKABLE | `400 Only STACKABLE items can be listed as a market lot` |
| Double achat (listing déjà SOLD_CLAIMED) | `400 Listing is not available for purchase` |
| Double claim (mail déjà CLAIMED) | `400 Cannot claim mail with status CLAIMED` |

---

## Circuit économique validé

| Étape | Mouvement |
|---|---|
| Achat | buyer wallet → escrow (`auction_escrow`) |
| Claim acheteur | instance LOT transférée via AUCTION_TO_MAIL + CLAIM_MAIL |
| Claim vendeur | escrow → seller wallet (via mail système `attachedAmountBronze`) |
| Résultat final | escrow = 0, seller + montant, buyer − montant |

---

## Requêtes SQL de monitoring

```sql
-- Tous les LOTs actifs (LISTED ou IN_MAIL)
SELECT ii.id, ii.state, ii.quantity, ii."containerType", it.name
FROM item_instance ii
JOIN item it ON it.id = ii."itemId"
WHERE ii."instanceType" = 'LOT' AND ii.state != 'DESTROYED'
ORDER BY ii."createdAt" DESC;

-- Vérifier la contrainte CHECK en place
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conname = 'chk_instance_type_quantity';

-- Vérifier l'index partiel en place
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'item_instance' AND indexname = 'idx_item_instance_lots';

-- Escrow non vidé (potentielle dette)
SELECT "balanceBronze" FROM wallet
WHERE "ownerType" = 'system' AND "ownerId" = 'auction_escrow';
```
