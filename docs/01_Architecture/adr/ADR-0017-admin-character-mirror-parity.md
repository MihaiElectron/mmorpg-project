# ADR-0017 — Parité panneau personnage joueur ↔ miroir admin DevTools

**Statut :** Accepted  
**Date :** 2026-07-06  
**Contexte :** Player Inspector (DevTools) — miroir read-only + mutations admin inventaire/équipement

---

## Contexte

Le panneau personnage **joueur** (`CharacterLayout` / `CharacterLayer` / `Inventory`)
est interactif : il équipe, déséquipe, réordonne l'inventaire, affiche stats,
gold, skills.

Le **miroir admin** du Player Inspector (`AdminCharacterPanel`) doit **observer**
le même personnage et **manipuler** son inventaire/équipement, mais depuis un
compte admin agissant sur le personnage d'un **autre** utilisateur.

Sans règle explicite, chaque UI tend à inventer ses propres champs et ses
propres calculs. On a déjà observé une divergence : le panneau joueur affichait
la colonne brute `character.attack`, tandis que le miroir admin affichait la
valeur dérivée serveur `stats.derived.physicalAttack` (attaque + bonus de Force).
Deux UI, deux valeurs, pour la même donnée.

Cette ADR verrouille les règles de parité pour que **toute** évolution du
panneau joueur soit répliquée proprement côté admin, sans dupliquer de logique
métier ni streamer d'état complet.

---

## Décision

1. **Snapshot serveur contrôlé.** Toute donnée du panneau joueur qui doit
   exister côté admin est exposée par un **snapshot serveur unique et borné** :
   `GET /admin/characters/:id/details` (`AdminService.getCharacterDetails`). Le
   miroir admin ne lit jamais `character.store` (état joueur local) et ne
   recalcule jamais une valeur métier.

2. **Mutations via services métier serveur.** Les actions admin passent par des
   handlers WebSocket `admin:*` role-gated qui délèguent aux services existants
   (`InventoryService` → `ItemTransferService`, `recalculateEquipmentStats`,
   projection serveur). Aucune écriture DB directe, aucune logique métier React.

3. **Socket = signaux légers uniquement.** Le socket ne transporte que
   l'invalidation `admin:character_details_dirty` (payload minimal :
   `{ characterId, reason, updatedAt }`). L'état complet est récupéré par
   **refetch** du snapshot. On ne streame jamais un snapshot complet du
   personnage par socket à chaque action.

4. **Serveur autoritaire, priorité admin.** L'état final est celui de la
   dernière transaction serveur réussie (verrous pessimistes de
   `ItemTransferService`). Après une action admin : `character:reload` vers le
   joueur ciblé + `admin:character_details_dirty` vers la room admin. Une action
   joueur sur un état périmé échoue proprement (validation d'état) ou est
   écrasée par le reload.

5. **Valeur finale, jamais brute.** Quand une valeur dérivée/finale serveur
   existe (`stats.derived`, wallet consolidé), les **deux** panneaux l'affichent.
   On n'affiche pas une colonne brute (`character.attack`) quand une valeur
   finale (`stats.derived.physicalAttack`) existe.

---

## Règles

Quand on ajoute un champ ou une action au **panneau joueur**, décider
explicitement de sa classe :

1. **Joueur only** — aucun impact admin.
2. **Admin read-only** — ajouter le champ au **snapshot admin** depuis une
   source serveur fiable (jamais recalculé côté React). Exemples : stats
   dérivées, gold, skills.
3. **Admin mutable** — ajouter une **mutation serveur dédiée** (handler `admin:*`
   role-gated), avec validations, tests, `character:reload` joueur + dirty admin,
   et retour d'une projection fraîche.

Sources autoritaires par domaine (ne jamais contourner) :

- Inventaire / équipement : `InventoryService` + `ItemTransferService`.
- Stats dérivées : `CharacterStatsCalculator` (jamais éditées directement).
- Gold / solde : `EconomyService` — **lecture pure** pour un snapshot
  (`readBalanceBronze`, aucun `getOrCreateWallet` qui matérialiserait un wallet
  par simple consultation).
- Skills : `SkillsService`.
- XP / progression : `ProgressionService`.

---

## Sécurité

Le client admin est **non fiable** (peut être entièrement réécrit). Chaque
handler admin doit donc vérifier **côté serveur** :

- rôle admin (`client.data.role`, posé par JWT vérifié — jamais par le client) ;
- `characterId` cible valide ;
- appartenance de l'item au personnage (`ownerId` / stack `character.id`) ;
- état et conteneur cohérents (transitions `ItemTransferService`) ;
- compatibilité slot ↔ `item.slot` (revalidée serveur, jamais le slot brut du
  client) ;
- `slotIndex` entier borné, doublons refusés ;
- transaction + verrous pessimistes dès qu'un item / état change.

Un client falsifié ne doit pouvoir ni équiper l'item d'autrui, ni déplacer une
instance équipée hors service, ni dupliquer/perdre un item, ni forcer deux
entrées sur le même `slotIndex`, ni éditer une stat dérivée.

---

## Tests obligatoires

- Backend service + gateway pour chaque mutation admin (refus non-admin,
  appartenance, état, compatibilité, émission reload + dirty, projection fraîche).
- Snapshot admin : champs exposés (dont wallet lecture seule) testés.
- Build client.
- Test manuel de parité joueur ↔ miroir admin (equip/unequip/réordonnancement,
  double-clic, gold, attaque/défense).

---

## Anti-patterns interdits

- Copier une formule métier côté React (admin **ou** joueur).
- Muter le `character.store` joueur depuis les DevTools.
- Streamer un snapshot complet du personnage par socket à chaque action.
- Écrire directement en DB depuis un handler admin.
- Créer un wallet par simple lecture d'un snapshot.
- Afficher une valeur brute quand une valeur finale serveur existe.
- Introduire un second flux réseau fragile côté React quand le snapshot peut
  porter la donnée proprement.

---

## Conséquences

- Le miroir admin reste un **observateur + télécommande** : il lit un snapshot
  serveur et déclenche des mutations serveur, sans jamais détenir d'état
  autoritaire local.
- L'ajout d'un champ au panneau joueur devient une **décision explicite** de
  classe (joueur only / admin read-only / admin mutable), documentée et testée.
- La divergence attaque/défense est résolue : joueur et admin lisent tous deux
  `stats.derived`.
- Hors périmètre de cette itération (à traiter par une évolution ultérieure
  respectant ces règles) : permutation directe équipement ↔ équipement, et
  édition admin des stats/skills.
