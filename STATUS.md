# STATUS — MMORPG Project

_Dernière mise à jour : 2026-06-19_
_Session : 2026-06-18 / 2026-06-19_
_Branche : main_
_État : développement local_

---

## État général

Backend NestJS + PostgreSQL opérationnels. Frontend React/Vite + Phaser connecté
via Socket.IO. Combat animal complet. Panneau admin fonctionnel avec console de
commandes, hiérarchie deux niveaux (template → instances), drag-and-drop vers la
map, suppression d'entités et vue d'ensemble temps réel (joueurs connectés,
personnages enregistrés, animaux actifs, templates, spawns).

---

## Derniers changements importants

- **Vue d'ensemble admin** : ajout du nombre de joueurs connectés (temps réel via
  `player_joined` / `player_left`) et du total de personnages enregistrés en DB.
  `WorldService.getConnectedCount()` déduplique par `characterId`.
- **Panneau admin — mises à jour temps réel** : souscriptions socket `animal_update`
  et `resource_update` ; rafraîchissement de la vue d'ensemble après spawn (debounce
  600 ms).
- **Suppression admin** : animaux supprimés en DB (`animalRepository.delete()` +
  spawn admin si applicable) ; ressources supprimées en DB (`resourceRepo.delete()`).
- **Sélecteur d'état** sur les instances : `alive/fighting/escaping/dead` (créatures),
  `alive/dead` (ressources) — passer à `alive` restaure les HP au max.
- **Templates ressources** : entité `ResourceTemplate` seedée (`dead_tree`, `ore`,
  `defaultRemainingLoots = 9999`), éditable depuis le panneau admin.
- **Téléportation** : bouton ↓ Tp toujours visible sur les instances, même si `dead`.

---

## Fonctionnalités actuellement opérationnelles

| Domaine | Ce qui fonctionne |
|---|---|
| Combat | Aggro, fuite, auto-attaque, poursuite, états `alive/fighting/escaping/dead` |
| Respawn | Animal (20 s) et personnage (point le plus proche à 0 PV) |
| Récolte | Gathering avec timer serveur, anti-cheat distance (`WorldService.checkInteraction`) |
| UI | ActionPanel, barre de vie flottante, panneau personnage, onglets Perso/Inventaire/Admin |
| Admin — commandes | `/spawn`, `/tp`, `/sethp`, `/aggro`, `/respawn all`, `/help` — voir `docs/07_Admin/admin-tool.md` |
| Admin — panneau | Vue d'ensemble live, hiérarchie template → instances, drag-and-drop map, suppression, pagination, recherche |
| Templates | Animaux (turkey, goblin) et ressources (dead_tree, ore) seedés au démarrage |
| Tests | 15 tests Jest `AnimalsService` (verts) |

---

## Décisions et règles à ne pas oublier

- Le client ne fait jamais autorité sur les dégâts, positions critiques, loot ou
  ownership — voir `docs/02_Security/client-server-trust.md`.
- Les actions admin doivent être autorisées côté serveur. Les événements admin observés
  vérifient `client.data.role`, mais l'authentification indépendante de `AdminGateway`
  et la provenance garantie de `client.data.role` restent à auditer — voir
  `docs/02_Security/admin-permissions.md`.
- `WorldService.checkInteraction` est la barrière anti-cheat de distance ; toute
  nouvelle interaction doit la réutiliser — voir `docs/01_Architecture/client-server-boundaries.md`.
- `server.emit` broadcast à tous les clients (pas de rooms) — acceptable maintenant,
  dette de scalabilité — voir `docs/01_Architecture/realtime-socketio.md`.
- `synchronize: true` en développement local uniquement — colonnes NOT NULL
  nécessitent `{ default: x }` — voir `docs/04_Server/typeorm.md`.
- Le socket Socket.IO est un singleton créé dans `WorldPage.jsx`, partagé via
  `window.game.socket`. Les stores Zustand sont des singletons `window.__GLOBAL_*_STORE__`.

---

## Dette technique connue

- `server.emit` broadcast global — prévoir rooms/zones à la montée en charge.
- Pathfinder peut échouer si un animal est sur une tuile bloquante (contournement actuel : steering direct).
- Un seul `RespawnPoint` hardcodé (x=600, y=300) ; pas d'UI de gestion.
- `synchronize: true` — migrations TypeORM à prévoir pour la prod.
- Sprite goblin utilise `textureKey: 'turkey'` en placeholder.

---

## Prochaines priorités possibles

- [ ] Import sprite goblin (textureKey propre)
- [ ] Système de loot sur les animaux tués
- [ ] Barre de vie des joueurs distants (envoyer HP dans `player_moved`)
- [ ] Dégâts au joueur visibles (animation flash, son)
- [ ] Zones / rooms Socket.IO pour limiter les broadcasts
- [ ] Autres types d'animaux (loup, sanglier…)
- [ ] Section Décor dans le panneau admin
- [ ] Migrations TypeORM pour la prod
- [ ] Audit log des actions admin

---

## Documents potentiellement impactés

Cette liste indique les documents à vérifier après une session de code. Elle ne signifie pas qu'ils doivent tous être modifiés.

- [ ] `docs/07_Admin/admin-tool.md`
- [ ] `docs/02_Security/admin-permissions.md`
- [ ] `docs/01_Architecture/realtime-socketio.md`
- [ ] `docs/04_Server/websockets.md`
- [ ] `docs/04_Server/modules.md`
- [ ] `docs/03_Client/phaser-world.md`
- [ ] `docs/03_Client/zustand-state.md`
- [ ] `docs/06_Database/schema.md`
- [ ] `docs/06_Database/postgresql.md`

---

## Règle de mise à jour

Après une session de code :

1. Mettre à jour `STATUS.md`.
2. Résumer ce qui a changé.
3. Ajouter ou retirer les dettes techniques.
4. Lister les documents `docs/` potentiellement impactés.
5. Ne modifier les documents `docs/` que si le changement affecte une règle, une architecture, une API, une sécurité, une base de données ou un workflow durable.

---

## Historique court des sessions

### 2026-06-18 / 2026-06-19

- Documentation projet restructurée et complétée dans `docs/`.
- Documents client, serveur, sécurité, monde, base de données, admin et workflow complétés.
- `STATUS.md` transformé en tableau de bord synthétique.
- Vue d'ensemble admin enrichie : joueurs connectés (temps réel) et personnages enregistrés.
- Panneau admin : mises à jour temps réel via socket, suppression définitive en DB,
  sélecteur d'état sur les instances, templates ressources éditables.

### 2026-06-17 et avant

- Boucle combat complète (aggro, fuite, auto-attaque, respawn).
- Panneau admin : hiérarchie deux niveaux, drag-and-drop map, console de commandes.
- Entités `ResourceTemplate`, `CreatureTemplate`, `CreatureSpawn`, `RespawnPoint` seedées.
