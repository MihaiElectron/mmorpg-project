# AI Agent Rules — Checklists opérationnelles

## Metadata

- Status: Implemented
- Last updated: 2026-07-06
- Audience : tout agent IA (y compris modèles moins performants) intervenant sur ce repo.
- Complète (sans les remplacer) : `CLAUDE.md`, `docs/10_AI/golden-rules.md`,
  `docs/10_AI/implementation-rules.md`, `docs/10_AI/commit-policy.md`,
  `docs/09_Workflow/ai-assistant-workflow.md`, les ADR (`docs/01_Architecture/adr/`).

Ce document est volontairement court et mécanique : c'est la checklist à suivre
avant, pendant et après toute modification. En cas de doute, ne pas improviser :
lire l'ADR du domaine ou demander validation.

---

## Règles générales (non négociables)

1. **Lire les ADR du domaine avant de coder** (`docs/01_Architecture/adr/README.md`).
2. **`git status` avant toute modification.** Jamais de `git add .` — staging explicite fichier par fichier.
3. **Pas de commit sans tests verts** (`npm run test` backend au minimum sur les fichiers touchés) ni sans validation utilisateur.
4. **Serveur autoritaire.** Le client n'est jamais cru pour : dégâts, portée, position critique, inventaire, loot, or, ownership, rôle admin.
5. **Le client admin/DevTools/Studio n'est pas fiable.** Chaque handler `admin:*` revérifie le rôle côté serveur depuis le JWT (`client.data.role`), jamais depuis un claim client.
6. **Pas de logique métier dans React.** Aucune formule (dégâts, stats dérivées, XP) recopiée côté client — le frontend affiche ce que le serveur calcule.
7. **Toute mutation métier passe par un service serveur.** Jamais de mutation DB directe dans un gateway ou un controller.
8. **Mouvements d'items = `ItemTransferService` uniquement** (verrou pessimiste + machine à états). Ne jamais créer un chemin parallèle.
9. **Économie = `EconomyService` uniquement** (wallet locké, ledger, idempotence). Jamais de mutation directe de solde.
10. **XP / stats = `ProgressionService` / `SkillsService` / `CharacterStatsCalculator`.** Ne jamais écrire directement une stat dérivée : elles sont calculées, pas stockées.
11. **Socket : événement "dirty" léger + refetch snapshot par HTTP.** Pas de snapshot complet poussé par socket, pas de polling pour compenser un événement dirty manquant.
12. **Rooms Socket.IO par map** (`getMapRoomId`, `src/common/socket-rooms.ts`) pour tout nouvel événement — pas de `server.emit` global.
13. **Frontend : SCSS uniquement.** Style inline autorisé seulement pour la géométrie dynamique (ex. `width: pct%`).
14. **Assets hors scope** : ne jamais mélanger assets, docs et code dans un même commit ; exclure explicitement les dossiers d'assets en cours.
15. **Ownership systématique** : tout endpoint joueur dérive le personnage du JWT (`req.user.userId`) et vérifie `character.userId === userId` (pattern : `InventoryService.assertCharacterOwnership`). Les variantes admin (`*AsAdmin`) sont séparées et role-gated en amont.

## Checklist avant modification d'un domaine

- Quel domaine ? (voir `docs/00_Project/domains.md`)
- Quelle source de vérité ? (DB via service ; `ConnectedPlayer` pour la position live d'un joueur connecté)
- Quelle mutation serveur ? (service existant à étendre, jamais un chemin parallèle)
- Quel DTO class-validator ? (HTTP : obligatoire ; WS : validation manuelle stricte du payload)
- Quels guards ? (`JwtAuthGuard` classe entière ; `RolesGuard + @Roles(ADMIN)` pour `/admin/*`)
- Ownership vérifié ? (JWT → character)
- Transaction + verrou pessimiste si mutation sensible ? (modèle : `WorldItemService.pickupItem`)
- Événement reload/dirty à émettre ? (`character:reload`, `emitAdminCharacterDirty`)
- Tests co-localisés mis à jour ? (guillemets doubles `"..."` dans les nouveaux specs — jamais de quotes courbes)
- Doc/ADR/STATUS.md à mettre à jour dans le même commit ?

## Checklists par domaine

**Personnage / stats** : mutations via `ProgressionService` (transaction + lock) ; stats finales par `CharacterStatsCalculator` côté serveur ; jamais d'écriture directe de `health/maxHealth` incohérente ; `emitCharacterReload()` après mutation.

**Inventaire / équipement** : transitions par `ItemTransferService` (INSTANCE) ; chemin legacy stack borné et documenté (TD-002/005/006) ; `slotIndex` = seule mutation autorisée par `updateSlots` ; recalcul stats équipement après equip/unequip ; ownership JWT sur tous les endpoints joueur.

**Combat** : dégâts, portée, cooldown, ciblage calculés serveur (`creatures.service`) ; le client n'émet que `attack_creature { targetId }` ; toute nouvelle stat de combat branchée via les stats dérivées serveur.

**Créatures / IA** : états gérés par le runtime serveur ; respawn côté serveur ; pas de position créature acceptée du client.

**Loot / ressources / world items** : matérialisation via `ItemMaterializationService` ; pickup = transaction + lock + validation distance (`checkInteraction`/`chebyshevDistanceWU`) ; expiration côté serveur.

**Skills / crafting** : XP skill via `SkillsService` (dans la transaction de l'appelant) ; craft = `CraftJob` (launch → complete scheduler → claim), output uniquement au claim (ADR-0009) ; jamais de craft instantané.

**Économie** : `EconomyService` seul point d'entrée ; montants en `bigint`/`BigInt` (jamais float) ; `assertPositiveAmount` ; ledger append-only ; idempotencyKey pour les opérations rejouables.

**DevTools / Admin / Studio** : jamais nécessaire au client joueur (`WorldScene` n'appelle jamais `/admin/*`) ; position live via `ConnectedPlayer`, pas la DB ; mutations admin suivies d'un dirty/reload joueur ; allowlist stricte de champs pour `admin:update_character`.

**Sockets** : auth JWT à la connexion (déconnexion sinon) ; payloads validés avant usage ; rooms par map ; chaque `on` côté client a son `off` dans le cleanup (`WorldScene.shutdownCleanup`, effets React).

**Frontend UI** : stores Zustand singletons `window.__GLOBAL_*` pour tout état partagé React/Phaser ; stores bornés (caps sur les logs) ; cleanup systématique des listeners/intervals ; clés React stables.

**Phaser runtime** : conversions WU↔écran uniquement via `phaser/utils/worldCoordinates.ts` ; le teardown passe par l'événement `shutdown` (pas de méthode `destroy()` custom — Phaser ne l'appelle pas) ; sprites/overlays détruits explicitement.

**DB / migrations** : toute évolution de schéma destinée à la prod = migration TypeORM explicite (le `synchronize` dev ne compte pas) ; mutation sensible = transaction + `pessimistic_write` ; pas de cascade destructrice nouvelle sans validation.

## Anti-patterns interdits

- Copier une formule métier côté React ou dans le Studio.
- Faire confiance au client admin (rôle, position, characterId).
- Muter un store Zustand joueur depuis les DevTools comme « vérité ».
- Envoyer un snapshot complet par socket au lieu d'un dirty + refetch.
- Ajouter du polling pour compenser un événement dirty manquant.
- Écrire en DB directement depuis un gateway/controller.
- Ignorer l'ownership (« le client envoie son characterId, il est honnête »).
- Mélanger assets/docs/features dans le même commit ; `git add .`.
- Supprimer/ignorer un test pour faire passer la suite ; masquer une erreur par `any`/`@ts-ignore` sans justification.
- Créer un système parallèle quand une architecture existante couvre le besoin (Runtime, ItemTransfer, Economy, WOM).
