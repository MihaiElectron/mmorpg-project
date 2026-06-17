# STATUS — MMORPG Project

_Dernière mise à jour : 2026-06-17_

---

## État général

Le projet tourne en développement local. Backend NestJS + PostgreSQL opérationnels,
frontend React/Phaser connecté via Socket.IO. Un seul type d'animal (turkey) est en
jeu, la boucle combat complète fonctionne de bout en bout.

---

## Fonctionnalités terminées (session courante)

### Combat / Animaux
- **Aggro / fuite** : turkey attaque à < 50 unités, fuit à < 75 % HP.
  États DB : `alive | fighting | escaping | dead`.
- **Auto-attaque et poursuite** : cliquer "attaquer" lance une boucle
  (emit toutes les 750 ms, tick pursuit 300 ms) jusqu'à la mort de l'animal
  ou clic map. `PlayerController.moveTo()` utilise le steering direct (pas de
  pathfinding) pour garantir le déplacement.
- **Respawn animal** : 20 s après la mort, turkey réapparaît à sa position de spawn.
- **Respawn personnage** : à 0 PV le personnage réapparaît au point de respawn le
  plus proche (x=600, y=300, radius=20). `WorldService.onModuleInit` remet les
  personnages morts à plein PV au redémarrage.
- **Panneau action** : se ferme automatiquement à la mort de l'animal ciblé.
- **Barre de vie flottante** : affichée au-dessus du joueur (pendant l'auto-attaque
  ou si attaqué) et des animaux en `fighting | escaping`. Couleurs issues des
  variables SCSS (`$hp-color-high/medium/low/critical`). Rendu Phaser pur
  (Rectangle game objects), mise à jour chaque frame dans `update()`.

### Infrastructure
- Entité `RespawnPoint` (table `respawn_point`) seedée au démarrage.
- `seedTemplates()` upsert — turkey : aggroRadius=50, fleeThresholdPct=75,
  pauseMinMs=2000, pauseMaxMs=12000, respawnDelayMs=20000.
- 15 tests Jest pour `AnimalsService` (tous verts).

---

## Architecture / Décisions clés

| Sujet | Décision |
|---|---|
| Socket unique | Créé dans `WorldPage.jsx`, partagé via `window.game.socket` |
| Store Zustand | Singleton `window.__GLOBAL_CHARACTER_STORE__` (Phaser ↔ React) |
| Barre de vie UI | React `HealthBar` dans ActionPanel ; Phaser Rectangles dans le monde |
| `moveTo()` | `isDragging=true` → steering direct, contourne le pathfinder |
| Anti-cheat distance | `WorldService.checkInteraction` — à réutiliser pour toute nouvelle action |
| TypeORM sync | `synchronize: true` en dev — colonnes NOT NULL nécessitent `{ default: x }` |

---

## Dette technique connue

- `server.emit` broadcast à **tous** les clients — prévoir rooms/zones en montée en charge.
- Pathfinder peut échouer si l'animal est sur une tuile bloquante (contournement : steering direct).
- Un seul RespawnPoint hardcodé ; pas d'UI de gestion.
- `synchronize: true` convient en dev, migrations TypeORM à prévoir pour la prod.

---

## Prochaines étapes possibles

- [ ] Autres types d'animaux (loup, sanglier…) avec stats différentes
- [ ] Dégâts au joueur visibles (animation flash, son)
- [ ] Barre de vie des joueurs distants (nécessite d'envoyer le HP dans `player_moved`)
- [ ] Zones / rooms Socket.IO pour limiter les broadcasts
- [ ] Système de loot sur les animaux tués
- [ ] PNJ / dialogues
- [ ] Zones de map différenciées (forêt, village, donjon)
