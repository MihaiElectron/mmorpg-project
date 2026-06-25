# DevTools — Architecture et spécification fonctionnelle

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/README.md, docs/10_AI/project-philosophy.md, docs/01_Architecture/admin-tool-roadmap.md, docs/01_Architecture/project-audit.md, docs/07_Admin/admin-tool.md
- Used by: Project owner, developers, Claude Code, Claude, Codex, tout agent IA travaillant sur ce projet

## Scope

Ce document définit la vision, l'architecture cible et les règles permanentes du
DevTools, en tant que composant du **MMORPG Studio**.

Le MMORPG Studio est la plateforme interne de développement et d'opération du
jeu. Le DevTools en est le composant de développement — celui qui expose les
outils d'inspection, de visualisation et de debug. Les autres composants du
Studio (LiveOps, Monitoring, Automation, Validation, Analytics, SDK) sont
définis dans `docs/07_Admin/mmorpg-studio.md`.

Ce document ne documente pas l'implémentation courante dans le détail — `STATUS.md`
et le code servent à cela. Il définit ce que le DevTools doit devenir, pourquoi,
et les règles que toute future contribution devra respecter.

Il ne doit pas être traité comme un backlog. C'est une spécification fondatrice.

---

## 1. Vision

Le DevTools est le composant de développement du MMORPG Studio.

Un monde multijoueur persistant est un système vivant : des entités se déplacent,
des mécaniques interagissent, des états évoluent en continu. Sans outil de
visualisation et d'inspection directement intégré au runtime, le développement
ralentit, les bugs se cachent, les régressions passent inaperçues.

Le DevTools résout ce problème fondamental en permettant :

- **Observer** — voir l'état réel du monde tel que le serveur le connaît.
- **Comprendre** — inspecter une entité, un tile, un chunk, une zone, un état IA.
- **Modifier** — spawner, téléporter, ajuster des paramètres en live.
- **Tester** — simuler des actions, forcer des états, rejouer des scénarios.
- **Diagnostiquer** — identifier l'origine d'un comportement inattendu.

Sans quitter le jeu.

Le principe fondateur est énoncé dans `docs/10_AI/project-philosophy.md` :

> **Tout ce que le serveur sait doit pouvoir être visualisé.**

Le DevTools est l'implémentation de ce principe.

---

## 2. Ce que le DevTools n'est pas

**Pas un panneau d'administration.**
L'administration concerne la gestion opérationnelle (comptes, permissions, modération).
Le DevTools concerne le développement du jeu. Certains outils se recoupent
(spawner une entité, téléporter un personnage), mais la finalité diffère.

**Pas une accumulation de fenêtres indépendantes.**
Chaque nouvelle mécanique ne justifie pas un nouveau panneau isolé. Le DevTools
est une plateforme unifiée : les modules partagent une infrastructure commune
(sélection, overlays, console, inspector).

**Pas un endroit contenant de la logique métier.**
Le DevTools observe et déclenche les mécaniques du jeu via les APIs et événements
existants. Il ne calcule pas de dégâts, ne prend pas de décision de gameplay, ne
modifie pas le comportement des entités par un chemin parallèle.

---

## 3. Philosophie

### Observabilité d'abord

La chaîne est : **visualisable → inspectable → modifiable**.

Toute information doit d'abord être rendue visible avant d'être modifiable.
Un overlay qui affiche les chunks précède un éditeur de chunks. Un inspector qui
lit les stats d'un creature précède un formulaire pour les modifier.

### Indépendance des modules

Chaque module DevTools connaît son domaine et ignore les autres. Le DevTools core
sait orchestrer les modules, mais un module Combat ne dépend pas d'un module World.

### Pas d'opinion sur le gameplay

Le DevTools ne décide pas si une valeur est correcte. Il l'affiche, il permet de
la modifier, il laisse le développeur décider.

### Intégration naturelle

Chaque nouvelle mécanique majeure du MMORPG doit réfléchir à son intégration
DevTools dès sa conception. Ce n'est pas une phase ultérieure — c'est une condition
de complétude. Une mécanique qu'on ne peut pas observer est une mécanique qu'on
ne peut pas maintenir.

---

## 4. Contextes de travail

Le DevTools opère selon quatre contextes. Un seul contexte est actif à la fois.
Il définit ce que le développeur est en train de faire.

| Contexte | Identifiant | Description |
|---|---|---|
| **Player** | `player` | Le développeur joue normalement. Le DevTools est fermé ou en mode minimal. |
| **Observe** | `observe` | Le développeur observe le monde sans agir. Les overlays sont actifs. Les interactions joueur sont désactivées. |
| **Edit** | `edit` | Le développeur modifie des entités, des spawns, des paramètres. Les actions sont permises selon les permissions. |
| **Debug** | `debug` | Le développeur diagnostique un comportement. Les overlays de debug sont actifs. La console est au premier plan. |

**Important :** les overlays et le monitoring sont transversaux. Ils peuvent rester
actifs dans n'importe quel contexte, y compris `player`.

**État actuel :** `activeTool: "legacy-admin"` dans `devtools.store.ts`. Les
quatre contextes sont l'architecture cible — non implémentée.

---

## 5. Architecture — zones fonctionnelles

Le DevTools est organisé en zones fonctionnelles indépendantes. Leur agencement
visuel précis (layout, dimensions) n'est pas figé à ce stade.

```
┌─────────────────────────────────────────────────────────────────┐
│  Toolbar                                                         │
│  contexte actif │ outils actifs │ overlays │ accès rapide       │
├──────────────────────────┬──────────────────────────────────────┤
│  Toolbox                 │  Inspector                           │
│  modules disponibles     │  entité / tile / zone sélectionnée  │
│  outils par domaine      │  contenu selon la sélection          │
├──────────────────────────┴──────────────────────────────────────┤
│  Console                                                         │
│  commandes │ historique │ résultats │ autocomplétion             │
├─────────────────────────────────────────────────────────────────┤
│  Monitoring                                                      │
│  événements temps réel │ métriques │ logs structurés             │
└─────────────────────────────────────────────────────────────────┘

Overlays : superposés à la scène Phaser, indépendants du panneau DevTools
```

### Toolbar

La Toolbar est la barre de contrôle globale du DevTools.

Elle affiche :
- le contexte de travail actif et permet de le changer ;
- les outils actifs du contexte courant ;
- les overlays activés ;
- les accès rapides (snapshot, reset, reload).

Elle est toujours visible quand le DevTools est ouvert.

**État actuel :** fondation HUD présente (bouton compact, toggle panneau).
Toolbar complète non implémentée.

### Toolbox

La Toolbox liste les modules disponibles et les outils de chaque module.

Un module peut exposer plusieurs outils (ex : le module World expose
"CoordinateInspector", "ChunkOverlay", "CollisionOverlay").

La Toolbox permet d'activer/désactiver chaque outil.

**État actuel :** non implémentée. Le module World (`WorldModule`) est le premier
module et expose `CoordinateInspector`.

### Inspector

L'Inspector affiche les détails de la sélection courante.

**Il y a un seul Inspector.** Son contenu change selon ce qui est sélectionné.
Le panneau ne change pas.

L'Inspector reçoit un **World Object** (voir `docs/08_Gameplay/world-object-model.md`)
et délègue l'affichage de chaque section à un **capability provider** enregistré
pour la capacité correspondante. Il ne connaît pas les types spécifiques (Loup,
Arbre Mort) — seulement les capacités qu'ils exposent.

Exemples de contenu selon la sélection :
- Creature sélectionné → capacités `health`, `combat`, `ai`, `navigation`, `loot`
- Tile sélectionné → capacités `terrain`, `collision`, `height`, coordonnées (screen/WU/tile/chunk)
- Chunk sélectionné → capacités `bounds`, `streaming`, `entities`
- Joueur sélectionné → capacités `transform`, `health`, `inventory`

**État actuel :** `CoordinateInspector` affiche les données du dernier clic (lecture
seule). Inspector universel avec délégation aux capability providers : non implémenté.

### Overlays

Les overlays sont des couches visuelles superposées à la scène Phaser.

Chaque overlay :
- est activable/désactivable indépendamment ;
- persiste entre les ouvertures/fermetures du panneau DevTools ;
- peut être configuré (couleur, opacité, filtre) ;
- peut être superposé à d'autres overlays.

Exemples d'overlays à terme :
- Grille de chunks (64×64 tiles)
- Grille de tiles
- Zones de collision
- Zones d'aggro des animaux
- Zones de patrouille et de leash
- Nœuds et coûts de pathfinding
- Spawn points et respawn points
- Indicateurs de performance (FPS, latence)

**État actuel :** non implémentés. Architecture en place (devtools.store.ts contient
les fondations pour l'état des overlays).

### Console

La Console est le point d'entrée textuel du DevTools.

Elle permet :
- d'exécuter des commandes par leur nom (`/spawn goblin`, `/tp 300 400`) ;
- de naviguer dans l'historique (flèches) ;
- d'autocompléter les commandes disponibles (Tab) ;
- de lire les résultats avec indication succès/erreur ;
- de découvrir les commandes exposées par les modules.

**Découverte automatique :** chaque module peut enregistrer ses propres commandes
dans le registre global. La Console ne connaît pas les modules — elle exécute
les commandes disponibles.

**État actuel :** console implémentée dans `AdminPanel.tsx` et `ActionPanel.tsx`,
avec `commandRegistry.ts` + `commandParser.ts`. La double console (duplication
de logique) est une dette connue. À terme, une Console unique hébergée par
le DevTools.

### Monitoring

Le Monitoring centralise les événements temps réel.

Chaque module peut publier des événements :
- actions admin exécutées ;
- transitions d'état IA ;
- événements WebSocket (join, move, attack, gather) ;
- erreurs et timeouts ;
- métriques (nombre d'entités actives, latence socket).

Le DevTools les agrège, les filtre par source ou niveau, et les affiche en flux
ou en graphique selon leur nature.

**État actuel :** non implémenté. `AdminPanel.tsx` écoute `creature_update`,
`resource_update`, `player_joined`, `player_left` pour mettre à jour ses listes —
c'est le précurseur naturel du Monitoring.

### Modules

Les modules sont les unités d'extension du DevTools.

Un module :
- connaît un domaine du jeu (World, Entities, Combat, Crafting…) ;
- expose ses outils à la Toolbox ;
- expose ses commandes à la Console ;
- expose ses overlays au gestionnaire d'overlays ;
- expose son contenu Inspector pour ses types de sélection ;
- publie ses événements au Monitoring.

Le DevTools core ne connaît pas les domaines du jeu. Les modules font le lien.

**État actuel :** premier module `WorldModule` créé dans
`src/components/DevTools/modules/World/`, contient `CoordinateInspector`.

---

## 6. Sélection

Le DevTools possède une sélection universelle gérée par un **Selection Manager**.

La sélection est globale : toutes les zones du DevTools partagent la même
sélection courante.

Une sélection peut porter sur :
- une entité (creature, ressource, joueur, NPC) ;
- un tile ;
- un chunk ;
- une zone (rectangle de tiles) ;
- rien (sélection vide).

Quand la sélection change :
- l'Inspector met à jour son contenu en déléguant au module concerné ;
- les overlays pertinents peuvent se focaliser sur la sélection ;
- la Console peut préfixer ses commandes avec la sélection courante.

**Interaction avec `actionPanel.store` :** la sélection contextuelle gameplay
(clic sur une entité → `ActionPanel`) reste distincte de la sélection DevTools.
À terme, un clic en mode DevTools peut alimenter la sélection DevTools sans
ouvrir l'ActionPanel.

**État actuel :** sélection non implémentée en tant que système. `actionPanel.store`
contient une sélection contextuelle gameplay. `devtools.store.ts` contient le
contexte de clic (coordonnées).

---

## 7. Intégration des nouvelles mécaniques

Toute nouvelle mécanique majeure du MMORPG doit, lorsque pertinent, réfléchir à
son intégration DevTools avant d'être considérée comme terminée.

Cette réflexion doit répondre à au moins ces questions :

| Question | Exemples |
|---|---|
| Quel overlay permet de visualiser cette mécanique ? | Zone d'aggro, rayon de récolte, zone de spawn |
| Quel Inspector permet de lire son état ? | Stats d'une entité, état d'une FSM, valeurs d'un timer |
| Quelles commandes permettent de la déclencher manuellement ? | `/spawn`, `/tp`, futur `/craft`, `/trigger_event` |
| Quels événements Monitoring publie-t-elle ? | `creature:state_changed`, `resource:depleted`, `player:respawned` |
| Quels outils d'automatisation sont utiles ? | Génération de spawns, validation de zones, reconstruction de tables |

Une mécanique sans aucune intégration DevTools n'est pas interdite — elle doit
être documentée comme telle dans `STATUS.md`.

---

## 8. Automation

L'automation regroupe les opérations en batch ou de validation déclenchables
depuis le DevTools.

Exemples d'opérations à terme :
- Valider la cohérence des spawn points d'une zone
- Générer une grille de spawn points à partir d'une zone sélectionnée
- Reconstruire les index de collision d'un chunk
- Exporter l'état courant des templates en fichier de seed

Ces opérations ne doivent jamais modifier la base de données sans confirmation
explicite. Elles opèrent via les mêmes APIs que les actions manuelles.

**État actuel :** non implémenté.

---

## 9. DevToolsBridge

Le DevToolsBridge est le point d'accès unifié aux ressources runtime nécessaires
au DevTools : instance Phaser, scène active, socket, mapId courant, caméra.

Il remplace les accès directs à `window.game` dispersés dans les composants.

Le bridge :
- ne stocke pas d'état ;
- ne connaît pas les mécaniques du jeu ;
- retourne `null` ou une valeur safe si Phaser n'est pas initialisé ;
- est le seul endroit où `window.game` est lu depuis le code DevTools.

**État actuel :** `src/components/DevTools/devtoolsBridge.ts` implémenté avec
`getPhaserGame`, `getWorldScene`, `getDevToolsSocket`, `getCurrentMapId`,
`getMainCamera`.

---

## 10. DevToolsStore

`devtools.store.ts` est le store Zustand singleton du DevTools.

Il centralise l'état transversal :
- console active / historique / historyIndex
- outil actif (`activeTool`)
- ouverture HUD (`isDevToolsOpen`) / mode édition (`isEditMode`)
- position du panneau flottant
- contexte du dernier clic (screen / WU / tile / chunk)

Il ne stocke pas :
- les données métier (templates, animaux, ressources — ce sont des états du jeu)
- les états propres à chaque module (chaque module gère son propre état local)

**Singleton global :** `window.__GLOBAL_DEVTOOLS_STORE__` — partagé React et Phaser.

---

## 11. État actuel et architecture cible

### Implémenté

| Composant | Fichier | Description |
|---|---|---|
| DevToolsShell | `src/components/DevTools/DevToolsShell.tsx` | Conteneur racine |
| DevToolsPanel | `src/components/DevTools/DevToolsPanel.tsx` | Panel actif |
| DevToolsBridge | `src/components/DevTools/devtoolsBridge.ts` | Accès runtime |
| DevToolsStore | `src/store/devtools.store.ts` | Store global |
| WorldModule | `src/components/DevTools/modules/World/` | Premier module |
| CoordinateInspector | (dans WorldModule) | Dernier clic en 4 espaces (lecture seule) |
| HUD DevTools | GameLayout | Bouton compact + panneau flottant draggable |
| AdminPanel legacy | `src/components/AdminPanel/AdminPanel.tsx` | Monté dans DevToolsPanel |

### Architecture cible (non implémentée)

| Composant | Description | Priorité |
|---|---|---|
| Toolbar | Contexte, outils actifs, overlays, accès rapides | Phase B |
| Toolbox | Liste des modules et de leurs outils | Phase B |
| Selection Manager | Sélection universelle partagée entre zones | Phase C |
| Inspector universel | Contenu délégué au module | Phase C |
| Overlay Manager | Activation/désactivation/config des overlays | Phase B |
| Overlay Chunks | Grille 64×64 sur la scène | Phase B |
| Overlay Collisions | Zones de collision | Phase B |
| Overlay Aggro/Patrouille | Zones IA | Phase B |
| Monitoring | Flux d'événements temps réel | Phase C |
| Console unifiée | Console unique avec découverte de commandes | Phase C |
| Automation | Opérations batch avec confirmation | Phase D |

---

## 12. Règles d'implémentation

Ces règles s'appliquent à toute contribution au DevTools.

**Le DevTools ne contient pas de logique métier.**
Il déclenche les APIs existantes. Toute logique de calcul ou de validation
appartient aux services du jeu, pas au DevTools.

**Un module ne dépend pas d'un autre module.**
Les modules peuvent dépendre du DevTools core (store, bridge, selection). Ils
ne dépendent pas entre eux.

**Le bridge est le seul accès à `window.game` depuis le DevTools.**
`AdminPanel` et `ActionPanel` ont des accès directs legacy — ils sont tolérants
pour l'instant et devront migrer.

**L'admin legacy reste intact tant qu'il n'est pas remplacé.**
`AdminPanel.tsx` est monté dans `DevToolsPanel` comme module legacy. Il ne doit
pas être modifié pour intégrer du code DevTools. La migration se fait module par
module.

**Tout nouveau module documente ses zones d'entrée.**
Un module doit documenter : les outils qu'il expose, les commandes qu'il
enregistre, les overlays qu'il propose, les événements qu'il publie.

**Les overlays sont additifs.**
Un overlay ne supprime pas d'information du rendu. Il superpose.

**La sélection est un signal, pas une commande.**
Sélectionner une entité n'exécute aucune action. C'est l'utilisateur qui décide
de ce qu'il fait avec la sélection.

---

## Non-goals

- Ce document ne remplace pas `admin-tool.md` pour l'outil admin existant.
- Ce document ne définit pas le layout pixel-perfect du DevTools.
- Ce document ne définit pas les APIs WebSocket ou HTTP backend.
- Ce document ne liste pas les bugs ou la dette technique.
- Ce document n'est pas un backlog — les priorités sont dans `docs/ROADMAP.md` et `STATUS.md`.

## Security notes

Le DevTools est réservé aux utilisateurs avec le rôle `admin`. La vérification
s'effectue côté serveur sur chaque action (HTTP guards, WebSocket role checks).

L'affichage conditionnel côté client (décodage JWT navigateur) est du display
uniquement — il ne constitue pas une protection.

Le DevTools ne doit pas créer de surface d'attaque supplémentaire : il passe
par les mêmes endpoints et validations que les actions admin existantes.

## Performance notes

Le DevTools est actif uniquement pendant le développement. Les overlays en
particulier peuvent consommer des ressources Phaser (Graphics objects, re-renders).

Chaque overlay doit être désactivable et ne pas impacter les performances lorsqu'il
est inactif.

## Related files

- [MMORPG Studio — Vision](mmorpg-studio.md)
- [Admin Tool](admin-tool.md)
- [Admin Tool Roadmap](../01_Architecture/admin-tool-roadmap.md)
- [Project Audit](../01_Architecture/project-audit.md)
- [Project Philosophy](../10_AI/project-philosophy.md)
- [Domain Map](../00_Project/domains.md)
- [Documentation Index](../README.md)
- [ROADMAP.md](../ROADMAP.md)
- [STATUS.md](../../STATUS.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)

## Open questions

- Le mode `Observe` doit-il désactiver les interactions joueur ou simplement
  ignorer les événements de gameplay entrants ?
- Le Selection Manager doit-il interférer avec `actionPanel.store` ou opérer
  en parallèle sur un canal séparé ?
- À quel moment la double console (`AdminPanel` + `ActionPanel`) doit-elle
  être consolidée ? Une seule Console dans le DevTools, ou garder la console
  contextuelle de l'ActionPanel ?
- L'overlay persistance (rappel de l'état actif entre sessions) doit-il
  passer par `localStorage` ou par un endpoint serveur ?

## TODO

- [ ] Valider les contextes de travail (Player/Observe/Edit/Debug) avec le responsable.
- [ ] Définir l'ordre de priorité des modules à développer après World.
- [ ] Décider si la Console unifiée remplace ou s'ajoute aux consoles existantes.
- [ ] Documenter les modules au fur et à mesure de leur implémentation.
