# STATUS — MMORPG Project

_Dernière mise à jour : 2026-06-18_

---

## État général

Le projet tourne en développement local. Backend NestJS + PostgreSQL opérationnels,
frontend React/Phaser connecté via Socket.IO. Deux types d'animaux (turkey, goblin)
sont définis en template. La boucle combat complète fonctionne de bout en bout.
Un système d'administration complet est en place pour l'utilisateur `semoa` (role=admin).

---

## Fonctionnalités terminées

### Combat / Animaux
- **Aggro / fuite** : turkey attaque à < 50 unités, fuit à < 75 % HP.
  États DB : `alive | fighting | escaping | dead`.
- **Auto-attaque et poursuite** : cliquer "attaquer" lance une boucle
  (emit toutes les 750 ms, tick pursuit 300 ms) jusqu'à la mort de l'animal
  ou clic map. `PlayerController.moveTo()` utilise le steering direct.
- **Respawn animal** : 20 s après la mort, turkey réapparaît à sa position de spawn.
- **Respawn personnage** : à 0 PV réapparition au point le plus proche (x=600, y=300).
- **Barre de vie flottante** : au-dessus du joueur et des animaux en combat.
  Rendu Phaser pur (Rectangle game objects), couleurs SCSS.

### UI
- **ActionPanel** : s'ouvre au clic sur ressource, animal ou joueur distant.
  Se ferme au clic extérieur ou sur la map. Gestion des cibles superposées
  (dropdown de sélection). Fermeture automatique à la mort de la cible.
- **Panneau personnage** : se ferme au clic sur la map (via `pointerdown` Phaser).
- **CharacterLayout** : onglets Perso / Inventaire / Admin (role=admin uniquement).

### Système admin (role=admin)
- **Console de commandes** dans l'ActionPanel et le panneau Admin :
  - Syntaxe `/commande arg1 arg2 [--flag=valeur]`
  - Historique ↑/↓, autocomplete Tab, retour ok/err coloré
  - Phaser `disableGlobalCapture` au focus → espace et Tab fonctionnels
  - Registre de commandes (`commandRegistry.ts`) extensible par config

- **Commandes disponibles** :
  | Commande | Description |
  |---|---|
  | `/spawn <template> [x] [y]` | Crée un animal au dernier clic ou aux coords données |
  | `/tp [id\|nom] <x> <y>` | Téléporte un joueur (par nom, id ou cible sélectionnée) |
  | `/tp <x> <y>` sur animal | Déplace l'animal sélectionné |
  | `/sethp <template> <val>` | Modifie les PV max du template |
  | `/aggro <template> <val>` | Modifie le rayon d'aggro du template |
  | `/respawn all <template>` | Force le respawn de tous les animaux du template |
  | `/help [commande]` | Liste les commandes ou détaille l'une d'elles |

- **Panneau Admin** (onglet dédié) :
  - Vue d'ensemble (templates, spawns, animaux actifs)
  - **Hiérarchie deux niveaux** pour Créatures et Ressources :
    - Niveau 1 (groupe/template) : stats globales éditables + handle drag-and-drop
    - Niveau 2 (instances dans le monde) : dépliable au clic sur le titre du groupe.
      Chaque instance expose ses propres champs éditables (HP/x/y ou x/y/loots),
      un bouton ↓ Tp et un bouton ✕ supprimer.
  - Joueurs : section plate (liste unique, inchangée)
  - Filtre de recherche par nom dans chaque section
  - Pagination 20 groupes/page avec flèches + saisie directe
  - Champs dirty en jaune, bouton "Appliquer" par niveau
  - Badges état colorés sur les instances (alive/fighting/escaping/dead)
  - Architecture : `GroupedSectionConfig` + `GroupedSection` (créatures/ressources),
    `SectionConfig` + `EntitySection` (joueurs) ; ajouter un type = 1 entrée config
  - **Drag-and-drop vers la map** : handle ⠿ sur chaque groupe, ghost DOM avec coords
    monde en temps réel. Créatures → `admin:spawn` (nouvel animal), Joueurs →
    `admin:teleport`, Ressources → `admin:spawn_resource` (nouvelle instance).
  - **Bouton "supprimer"** : dans l'ActionPanel (cibles non-joueur) et dans la liste
    d'instances du panneau admin. Animaux supprimés définitivement en DB
    (+ spawn admin le cas échéant), ressources passées en state=dead.

- **WS admin events** : `admin:spawn`, `admin:spawn_resource`, `admin:teleport`,
  `admin:move_animal`, `admin:update_template`, `admin:update_character`,
  `admin:update_resource`, `admin:update_animal`, `admin:delete_animal`,
  `admin:delete_resource`, `admin:respawn_all` — tous protégés par
  `client.data.role !== 'admin'`.

- **Téléportation** : `teleportCharacter` résout nom ou UUID avant tout accès DB ;
  broadcast `player_moved` à tous les autres clients après téléport.
  `AnimalsService.refreshTemplateInMemory` propage les stats modifiées aux
  animaux vivants en mémoire immédiatement.

### Infrastructure
- Entité `RespawnPoint` seedée au démarrage.
- `seedTemplates()` upsert — turkey et goblin (textureKey: 'turkey' placeholder).
- `AdminModule` : gère `CreatureTemplate`, `CreatureSpawn`, `Animal`, `Character`, `Resource`.
- 15 tests Jest pour `AnimalsService` (tous verts).
- Store admin Zustand singleton `window.__GLOBAL_ADMIN_STORE__` (Phaser ↔ React).

---

## Architecture / Décisions clés

| Sujet | Décision |
|---|---|
| Socket unique | Créé dans `WorldPage.jsx`, partagé via `window.game.socket` |
| Store Zustand | Singleton `window.__GLOBAL_*_STORE__` (Phaser ↔ React) |
| Barre de vie UI | React `HealthBar` dans ActionPanel ; Phaser Rectangles dans le monde |
| `moveTo()` | `isDragging=true` → steering direct, contourne le pathfinder |
| Anti-cheat distance | `WorldService.checkInteraction` — à réutiliser pour toute nouvelle action |
| TypeORM sync | `synchronize: true` en dev — colonnes NOT NULL nécessitent `{ default: x }` |
| Admin clavier | `scene.input.keyboard.disableGlobalCapture()` au focus console |
| Sections admin groupées | `GroupedSectionConfig` + `GroupedSection` (créatures/ressources) — deux niveaux template→instances |
| Sections admin plates | `SectionConfig` + `EntitySection` (joueurs) — liste simple |
| Drag admin → map | `startDrag()` vanilla DOM + ratio `canvas.width/rect.width` × `getWorldPoint()` pour conversion HiDPI-safe |
| Suppression admin animal | `animalRepository.delete()` + `spawnRepository.delete()` si spawn admin — pas de résurrection au redémarrage |

---

## Dette technique connue

- `server.emit` broadcast à **tous** les clients — prévoir rooms/zones en montée en charge.
- Pathfinder peut échouer si l'animal est sur une tuile bloquante (contournement : steering direct).
- Un seul RespawnPoint hardcodé ; pas d'UI de gestion.
- `synchronize: true` convient en dev, migrations TypeORM à prévoir pour la prod.
- Sprite goblin utilise `textureKey: 'turkey'` en placeholder — import sprite à faire.

---

## Prochaines étapes possibles

- [ ] Import sprite goblin (textureKey propre)
- [ ] Autres types d'animaux (loup, sanglier…) avec stats différentes
- [ ] Système de loot sur les animaux tués
- [ ] Dégâts au joueur visibles (animation flash, son)
- [ ] Barre de vie des joueurs distants (envoyer HP dans `player_moved`)
- [ ] Zones / rooms Socket.IO pour limiter les broadcasts
- [ ] Section Décor dans le panneau admin (drag-and-drop + commande `/decor`)
- [ ] PNJ / dialogues
- [ ] Zones de map différenciées (forêt, village, donjon)
- [ ] Audit log des actions admin (journalisation serveur)
- [ ] Migrations TypeORM pour la prod
