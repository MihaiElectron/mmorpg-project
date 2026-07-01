# STATUS — MMORPG Project

_Dernière mise à jour : 2026-07-01_
_Branche : main — État : développement local_

---

## État général

Backend NestJS + PostgreSQL opérationnels. Frontend React/Vite + Phaser connecté via Socket.IO.
Coordonnées monde **WU pur** (migration P0–P7 soldée, `worldX/worldY/mapId` source de vérité unique).
**Runtime V2 terminé** : `ItemTransferService` couvre 20 transitions sur 10 domaines, verrou pessimiste systématique.
**Building Runtime implémenté** : `BuildingTemplate`/`Building`, WOM adapter, CRUD admin, rendu WorldScene, WindowManager, Auction/Mail connectés aux buildings avec validation distance.
**Market Lots implémentés** : objets STACKABLE vendables via l'Auction House — pipeline Inventory → LOT → Auction → Mail → Claim → Inventory validé en base (5 cas + 6 contrôles de sécurité).
**Gameplay V1 ouvert** : ADR-0012 proposé, prochaine phase à démarrer.
**Studio Asset System V1** : `GET /admin/assets/tree` sandboxé, composant `AssetPicker` générique, intégré sur Items/Creatures/Resources/Buildings. `loadTextureIfMissing` helper Phaser pour chargement dynamique sans rebuild.

---

## Fonctionnalités opérationnelles

| Domaine | État |
|---|---|
| Combat creature | Aggro, fuite, auto-attaque, respawn (20 s) |
| Récolte | Timer serveur, anti-cheat distance (`WorldService.checkInteraction`) |
| Loot | Hybrid STACKABLE/INSTANCE — `ItemMaterializationService` 4 chemins |
| Crafting | Stations placées en WU, validation distance serveur, ActionPanel → craft |
| Skills joueur | Niveau, XP, nextLevelXp par skill — onglet panneau personnage |
| Runtime V2 | `ItemTransferService` 20 transitions — Equipment, WorldItem, Loot, Craft, Auction, Bank, Mail, GuildStorage, Housing, Trade |
| Trade | Peer-to-peer `ItemInstance`, sessions PENDING/COMPLETED/CANCELLED, anti-deadlock lexicographique |
| Bank / Mail / Guild / Housing | MVPs Instance-only opérationnels (endpoints REST, pas d'UI en jeu) |
| Auction | Listing INSTANCE + STACKABLE (Market Lot), achat → 2 mails système (acheteur+vendeur), wallet Economy + escrow `auction_escrow` — `AuctionHouseWindow` avec formulaire STACKABLE, badge LOT, affichage ×qty |
| Mail | Inbox, claim pièce jointe ou argent, courrier système (sender `SYSTEM`) — `MailboxWindow` (validation distance building) |
| Buildings | `BuildingTemplate`/`Building`, WOM adapter, CRUD admin WS, rendu WorldScene, drag-to-map, WindowManager |
| Économie joueur | `GET /economy/me/balance` — solde gold/argent/bronze affiché dans le panneau Perso ; admin crédit/débit via `admin:add_balance` (EconomyService, ledger, rôle vérifié) |
| DevTools | AdminPanelWOM, drag-to-map, overlays Resources/Creatures/Stations/Buildings, Command Palette, Studio SDK ActionRegistry, Player Inspector (stats, monnaie, injection d'objets) |
| Studio Asset System | `GET /admin/assets/tree` sandboxé, `AssetPicker` (navigation, aperçu, dimensions, sélection), intégré Items/Creatures/Resources/Buildings, `loadTextureIfMissing` Phaser |
| Equipment UX Phase 1 | Drag inventaire → slot, drag slot → inventaire, double-clic equip/unequip, auto-slot earring/ring/bracelet (serveur), auto-swap atomique, feedback visuel vert/orange/rouge, réorganisation inventaire session-local (`slotMap`), `recalculateEquipmentStats` sur equip et unequip, 30 tests backend |
| Terrain | Tilemap isométrique grass 64×64, pathfinding NavGrid A\* |

---

## Dette technique ouverte

| ID | Description | Priorité | Phase |
|---|---|---|---|
| TD-002 | Equipment legacy par `Item` catalogue — `Inventory.equipped` encore actif | High | Equipment Runtime V2 |
| TD-005 | `CharacterEquipment` non migré vers `ItemInstance` | High | Equipment Runtime V2 |
| TD-006 | Unequip ne passe pas par `ItemTransferService` pour les items legacy | High | Equipment Runtime V2 |
| TD-009 | `craftedBy`/`quality` absents des `ItemInstance` craftées | Medium | Craft avancé |
| TD-013 | `removeExpiredItems` scheduler non branché | Medium | WorldItem maintenance |
| TD-014 | Race condition `removeExpiredItems` sur les stacks | Low | WorldItem hardening |
| TD-015 | Bank MVP — stacks non supportés, pas de limite de slots | Medium | Bank V2 |
| TD-016 | Mail MVP — pièce jointe unique, stacks non supportés, pas de scheduler | Medium | Mail V2 |
| TD-017 | Guild Storage MVP — propriétaire uniquement, stacks non supportés | Medium | Guild V2 |
| TD-018 | Housing MVP — propriétaire uniquement, stacks non supportés | Medium | Housing V2 |
| TD-019 | Trade MVP — expiration session absente, stacks non supportés | Medium | Trade V2 |
| — | `auth.controller.spec.ts` — 1 test pré-existant en échec (AuthService manquant) | High | avant CI/prod |
| — | `RespawnPoint.radius` en pixels (drift respawn) — `legacyRadiusToWU()` disponible | Low | WU cleanup |
| — | Templates IA (`aggroRadius`, `patrolRadius`, `speedMin/Max`) encore en pixels en DB | Medium | WU cleanup |
| — | `mapId` hardcodé à `1` dans DevToolsStore/WorldScene | Medium | multi-cartes |
| — | `wuToScreen` dupliquée dans `WorldScene.js` (`resolveScreen()` local) | Low | TS migration WorldScene |
| — | Double console admin (`ActionPanel.tsx` + `AdminPanelWOM.tsx`) | Low | — |
| — | `server.emit` broadcast global — pas de rooms/zones | Medium | montée en charge |
| — | `TILEMAP_TEST_OFFSET_X = 936` temporaire dans `WorldScene.js` | Low | — |
| — | Sprite goblin utilise `textureKey: 'turkey'` en placeholder | Low | contenu |
| — | `synchronize: true` en dev — migrations TypeORM pour prod non créées | Medium | prod-readiness |
| — | Mail monétaire expiré — l'argent reste bloqué dans le wallet `auction_escrow` (pas de retour vendeur automatique) | Medium | Auction MVP 2 |
| — | Building : aucun seed créé, aucune texture réelle — placeholder debug diamond visible seulement | Low | contenu |
| — | `CraftingRuntimePanel` toujours embarqué dans ActionPanel (devrait passer par WindowManager) | Low | WindowManager V2 |

---

## Prochaines priorités

**Gameplay V1** — voir `docs/09_Workflow/runtime-roadmap.md` section "Gameplay V1" et ADR-0012.

1. **Skills Runtime Foundation** — entité `SkillRuntime`, XP award, level-up, validation craft/récolte
2. **Combat avancé** — effets, cooldowns, résistances
3. **Récolte avancée** — skill check, XP, qualité
4. **Craft avancé** — `craftedBy`, quality, `SkillRuntime` check
5. **Économie** — UI Auction/Mail en jeu via buildings (WindowManager livré, buildings à créer en DB via AdminPanel)
6. **Social, Quêtes, IA, Contenu**

**DevTools — Admin WOM** :
- [ ] Phase A — auth WS admin, pagination serveur, spawns éditables (`docs/01_Architecture/admin-tool-roadmap.md`)
- [ ] Phase B — overlays debug (chunks, collisions, aggro, pathfinding)

---

## Règles critiques (non documentées ailleurs)

- **`ItemTransferService`** est le seul point de mutation de `state/containerType/containerId/ownerId` sur `ItemInstance`. Zéro mutation directe autorisée hors de ce service.
- **`ItemMaterializationService`** reçoit toujours un `EntityManager` de l'appelant et n'ouvre jamais sa propre transaction.
- **`LootService`** est pur et synchrone — `generateLoot()` retourne `LootEntry[]`, `generateLootFromPool()` retourne `LootEntry | null`.
- **`buildResourceBroadcast`** obligatoire pour tout `resource_update` — sans `type/worldX/worldY/mapId`, le client ne peut pas recréer le sprite après `dead`.
- **`WorldService.validateInteraction(char, target, radiusWU)`** est la barrière anti-cheat de distance (chebyshevDistanceWU, L∞) — toute nouvelle interaction doit la réutiliser.
- **`BuildingsService`** est le seul service autorisé à créer/modifier les `Building` et `BuildingTemplate`. Les contrôleurs Auction/Mail lui délèguent la recherche du building pour valider la proximité.
- **`buildingId` obligatoire** sur toute mutation Auction (createListing, buyListing) et Mail (inbox, send, claim). Le serveur valide type, état ACTIVE, template.enabled et distance WU avant toute action sensible. `GET /auction/listings`, `GET /auction/listings/mine`, `DELETE /auction/listings/:id` et `GET /mail/sent` restent publics sans contrainte de proximité.
- **Market Lots** : `ItemTransferService.createLot()` est la seule voie pour créer un `ItemInstance` de type LOT. `applyClaimMail()` branché sur LOT : `Inventory += quantity` puis `state = DESTROYED`. Un LOT n'est jamais AVAILABLE, jamais INSTANCE, jamais en stock direct.
- **`AuctionListingDto`** expose `instanceType`, `quantity` et `objectMode` — l'UI ne déduit jamais le type d'un lot.
- **Contrainte SQL `chk_instance_type_quantity`** et index partiel `idx_item_instance_lots` non créés par `synchronize: true` — à appliquer manuellement ou via la migration Phase 1 en prod.
- **Pipeline Auction → Mailbox** : `buyListing()` transfère l'argent acheteur → escrow `auction_escrow`, crée 2 mails système (objet pour acheteur, montant pour vendeur), transitione l'instance via `AUCTION_TO_MAIL` (LISTED+AUCTION → IN_MAIL+MAIL). `cancelListing()` et expiration créent un mail système objet pour le vendeur. `claimBuyer`/`claimSeller` supprimés. Tout claim passe par `MailService.claim()`.
- **`MailService.sendSystemMailWithinManager(manager, input)`** : seul point d'entrée autorisé pour les mails système (sender `SYSTEM`). Fonctionne dans la transaction de l'appelant. Pas de validation ownership ni de transition ItemTransfer — l'appelant en est responsable.
- **WindowManager** (`window-manager.store.ts`) est le seul point d'ouverture des fenêtres runtime (Auction, Mailbox, etc.). ActionPanel route uniquement — il ne contient pas la logique métier de ces fenêtres.
- **Coordonnées** : DB/Runtime = `worldX/worldY/mapId` (WU). Pixel cache `x/y` uniquement dans `ConnectedPlayer` (rendu). Ne jamais persister les pixels Phaser.
- **`lootPool`** non éditable via socket — `admin:update_resource_template` n'accepte que `defaultRemainingLoots` et `respawnDelayMs`.
- **Tiled** : format TMJ natif uniquement, tileset inliné dans le TMJ. Aucun convertisseur TMX→JSON.
- **Socket** : singleton créé dans `WorldPage.jsx`, partagé via `window.game.socket`. Stores Zustand = singletons `window.__GLOBAL_*_STORE__`.
- **Équipement ItemInstance** : `POST /inventory/:characterId/equip-instance/:instanceId` vérifie que `character.userId === req.user.userId` avant toute transaction — un joueur ne peut pas équiper sur le personnage d'un autre compte. `ItemTransferService.applyEquip` refuse explicitement tout `instanceType !== NORMAL` (`Cannot equip a LOT item instance`).
- **Stats Equipment** : `Character.baseAttack`/`baseDefense` = stats permanentes (jamais modifiées par l'équipement). `Character.attack`/`defense` = stats finales calculées. `recalculateEquipmentStats(manager, characterId)` (`characters/equipment-stats.helper.ts`) applique `finalAttack = baseAttack + Σ item.attack` après chaque equip/unequip, dans la même transaction. Le frontend reçoit les stats à jour via `GET /characters/me`.
- **`character:reload`** : événement socket émis par le serveur vers le socket du personnage concerné après toute mutation admin (`update_character`, `add_balance`, `give_item`). `WorldScene` écoute cet événement et appelle `loadCharacter()`. Réutilisable par tous les domaines (équipement, bank, mail, crafting, level-up, skills, etc.).
- **`admin:give_item`** : `{ characterId, itemId, quantity? }` — délègue exclusivement à `ItemMaterializationService.materialize()` dans une transaction DataSource. Le serveur détermine automatiquement STACKABLE vs INSTANCE depuis `item.objectMode`. Le Studio ne choisit jamais. Suivi de `character:reload`.
- **Studio SDK / ItemTemplate** : le Studio manipule uniquement les `ItemTemplate` (catalogue). Les `ItemInstance` sont créées exclusivement par les Runtime Services (`ItemMaterializationService`, `ItemTransferService`). Aucun INSERT direct depuis l'admin.
- **Studio Asset System** : le Studio stocke toujours des AssetPath publics Vite (`/assets/…`). Les `textureKey` Phaser courtes (`"turkey"`, `"dead_tree"`) sont un détail interne de `PreloadScene`. `GET /admin/assets/tree` est sandboxé dans `apps/client/public/assets/`. `loadTextureIfMissing` (`phaser/utils/textureLoader.js`) gère le chargement dynamique quand `textureKey` est un AssetPath. `resolveAppearanceTexture` retourne les AssetPath tels quels (pas de vérification `isLoaded`).

---

## Règle de mise à jour

Mettre à jour STATUS.md uniquement sur demande explicite ou évolution structurante.
Ne pas dupliquer ce qui est dans `docs/` — pointer vers les ADR et documents concernés.
Supprimer les dettes soldées, ne pas conserver l'historique des sessions (rôle de `git log`).
