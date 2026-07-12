# MMORPG Studio — Vision et architecture

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-07-11
- Depends on: docs/10_AI/project-philosophy.md, docs/00_Project/domains.md, docs/07_Admin/devtools-architecture.md, docs/07_Admin/admin-tool.md
- Used by: Project owner, developers, Claude Code, Claude, tout agent IA travaillant sur ce projet

## Scope

Ce document définit la vision et l'architecture du MMORPG Studio en tant que
produit interne parallèle au MMORPG Runtime.

Il ne documente pas l'implémentation courante — `STATUS.md` et le code servent
à cela. Il définit ce que le Studio est, pourquoi il existe, comment il se
distingue du Runtime, et les règles permanentes qui régissent leur relation.

Il n'est pas un backlog. C'est une spécification fondatrice.

---

## 1. Deux produits, une base de code

Le projet est organisé autour de deux produits développés en parallèle et
partageant la même infrastructure technique.

### 1.1 MMORPG Runtime

Le Runtime est le jeu jouable. C'est le produit visible par les joueurs.

Il englobe :
- le serveur de jeu : monde, entités, gameplay, réseau, persistance ;
- le client joueur : rendu, contrôles, interface joueur ;
- l'infrastructure : base de données, services, déploiement.

Le Runtime est autoritatif sur toutes les règles du monde. Il valide, calcule,
persiste. Il est la source de vérité unique. Les joueurs l'utilisent sans savoir
qu'il existe.

### 1.2 MMORPG Studio

Le Studio est la plateforme interne intégrée au jeu pour développer, exploiter,
surveiller, automatiser et valider le MMORPG.

Il n'est pas un panneau d'administration. C'est un environnement de travail
intégré qui permet aux différents profils de l'équipe (développeurs, game
masters, builders, leads) d'interagir avec le monde sans quitter le contexte
du jeu.

Le Studio est toujours conscient de l'état du Runtime. Il lit les données
réelles du serveur, déclenche des actions via les mêmes APIs que le jeu, et
ne maintient pas de représentation parallèle du monde.

---

## 2. Séparation des responsabilités

| Domaine | Runtime | Studio |
|---|---|---|
| Règles métier | Implémente, valide, persiste | Observe, déclenche via API |
| État du monde | Source de vérité | Lecture seule ou déclencheur |
| Logique de combat | Calcule les résultats | Peut forcer des états via commandes |
| Positions | Authoritative (WU) | Lit et visualise |
| Authentification | Émet et valide les tokens | Consomme les tokens existants |
| UI joueur | Rendu, contrôles, panneaux joueur | Overlays, inspecteur, console |
| Persistence | Écrit en DB | Lit via API, jamais directement |

**Le Studio ne contient pas de logique métier.** Il déclenche les mécaniques
du Runtime via les mêmes interfaces que le reste du jeu. Il ne calcule pas de
dégâts, ne modifie pas directement la base de données, ne court-circuite pas
les validations serveur.

---

## 3. Composants du Studio

Le Studio est organisé en sept composants. Chaque composant a un périmètre
distinct et des profils utilisateurs cibles différents.

### 3.1 DevTools

L'environnement de développement intégré. Réservé au développement.

Périmètre :
- inspection de l'état du monde en temps réel (entités, zones, états IA) ;
- overlays de debug sur la scène Phaser (chunks, collisions, aggro, pathfinding) ;
- console de commandes avec autocomplétion et historique ;
- inspection des payloads WebSocket ;
- modification contrôlée des entités pour tests ;
- édition des catalogues de configuration gameplay (items, skills, masteries)
  via l'API admin HTTP.

Disponibilité : **développement uniquement**. Le DevTools n'est pas disponible
en production. Son bundle doit être séparé ou exclu des builds de production.

Profils : Developer, Lead.

Spécification complète : `docs/07_Admin/devtools-architecture.md`.

État actuel — configuration gameplay (2026-07-11, Mastery Effects V2) :

- le **Skill Editor** expose `skill.weaponType` (select, « Aucun » = null) —
  Implemented. Ce champ déclare la compatibilité d'un skill avec un type
  d'arme pour les bonus de maîtrise ; il n'impose pas l'arme au cast ;
- le **Skill Editor** expose aussi le **Type de dégâts** (`damageType`, V4-C) —
  Implemented. Concerne les skills damage : **Physique** (`physical`, défaut —
  réduit par l'armure, utilise `armorPenetrationPercent`) ou **Brut** (`raw` —
  ignore armure et pénétration). Le select est désactivé pour un soin ;
- le module **« Maîtrises / Effets » est Implemented** : création de
  maîtrise (key/name/category/XP config), édition des
  `mastery_definition.effects` en **tableau stat / mode / value**
  (`percentPerLevel`, `flatPerLevel`), contexte weaponType optionnel. Le
  catalogue des stats ciblables, modes et bornes est **chargé depuis le
  serveur** (`GET /admin/mastery-effect-targets`) — aucune liste codée en dur
  côté frontend, sauvegarde bloquée si le catalogue ne charge pas. Le chemin
  socket admin rejette `effects` volontairement (édition via PATCH HTTP
  validé) ;
- règle constante : le Studio **édite la configuration mais ne calcule aucun
  bonus** ni aucune éligibilité — résolution serveur
  (`MasteryEffectsService`) et validation finale serveur (targets, bornes,
  clamps — ADR-0020 amendé V2).

État actuel — Stats secondaires (2026-07-11, V3) :

- le module **« Stats secondaires » est Implemented** : création et édition des
  `DerivedStatDefinition` (label, category, enabled, baseValue, min/max,
  coefficients primaires, `masteryEligible`, `allowedModifierModes`,
  `runtimeStatus`, description). La `key` est **immuable** après création ;
- les **Mastery Effect Targets sont alimentés depuis ces définitions** : une
  stat devient ciblable dès qu'elle est `enabled` + `masteryEligible` +
  `runtimeStatus: implemented` + au moins un mode. Le module « Maîtrises /
  Effets » consomme ce catalogue serveur (aucune liste en dur) ;
- **maintenance sûre** :
  - une **stat système** (seedée par le code) n'est **jamais supprimable** ;
  - une **stat custom** n'est supprimable **que si aucune référence** ne la
    cible ;
  - **rapport de références** (`GET /admin/derived-stat-definitions/:key/references`)
    listant les modificateurs de maîtrise qui pointent la stat ;
  - **retrait ciblé** d'une référence de Mastery Effect
    (`POST …/:key/remove-mastery-reference`) ;
  - **duplication avec nouvelle key** pour corriger une key mal saisie sans
    rename (les références de maîtrise ne sont pas copiées) ;
  - suppression protégée par une confirmation UI stylée (jamais `window.confirm`) ;
- le **panneau personnage joueur** affiche les stats dérivées via le catalogue
  serveur (`GET /characters/stat-definitions`) — labels et valeurs serveur,
  rechargé en live après toute mutation (événement `devtools:derived-stats-changed`),
  aucun calcul client.

### 3.2 LiveOps

Les outils d'opération en production. Sécurisés, limités et audités.

Périmètre :
- gestion des entités en production (spawn, téléportation, suppression) ;
- interventions de modération (kick, mute, inspection d'un joueur) ;
- application d'événements ponctuels (boost, correction de progression) ;
- visualisation de l'état du monde sans debug overlay ;
- interventions d'urgence (forcer un respawn, corriger un état corrompu).

Disponibilité : **production possible**, avec vérification de rôle côté serveur
sur chaque action, rate limiting, et audit log obligatoire.

Profils : GM, Lead, Owner.

**Distinction clé avec DevTools :** LiveOps n'expose pas les outils de debug.
Il expose des actions opérationnelles à portée limitée, toutes auditées.

État actuel : les fonctionnalités LiveOps sont partiellement couvertes par
`AdminPanel.tsx` (legacy). Pas de composant LiveOps dédié.

### 3.3 Monitoring

La visualisation des événements temps réel du Runtime.

Périmètre :
- flux d'événements WebSocket entrants et sortants ;
- métriques : joueurs connectés, entités actives, latence, erreurs ;
- transitions d'état des entités (IA, ressources, joueurs) ;
- alertes configurables (seuil de joueurs, erreurs répétées) ;
- logs structurés des actions Studio.

Disponibilité : **transversal** — accessible en développement comme en
production selon le profil.

Profils : Developer (monitoring debug), GM (monitoring opérationnel), Owner
(monitoring global).

État actuel : `AdminPanel.tsx` écoute `creature_update`, `resource_update`,
`player_joined`, `player_left`. C'est le précurseur du Monitoring.

### 3.4 Automation

Les opérations en batch sur le monde, déclenchées depuis le Studio.

Périmètre :
- génération de grilles de spawn points depuis une zone sélectionnée ;
- validation de la cohérence des spawn points d'une carte ;
- reconstruction d'index de collision d'un chunk ;
- export de l'état des templates en seed ;
- application de transformations en masse avec aperçu et confirmation.

Toute opération d'Automation doit demander une confirmation explicite avant
de modifier des données. Elle ne modifie jamais directement la base de données
— elle passe par les APIs Runtime.

Disponibilité : **développement et staging**.

Profils : Developer, Builder, Lead.

État actuel : non implémenté.

### 3.5 Validation

La vérification de la cohérence du contenu avant mise en production.

Périmètre :
- validation du monde : chevauchements de spawns, zones inaccessibles, tiles
  non walkables avec entités ;
- validation des templates : valeurs hors plage, références manquantes ;
- validation du réseau de respawn points ;
- rapports de validation exploitables (diff, criticité, suggestions).

La Validation ne modifie pas le monde. Elle produit des rapports.

Disponibilité : **pré-production et staging**.

Profils : Builder, Lead, Developer.

État actuel : non implémenté.

### 3.6 Analytics

L'analyse des données de jeu accumulées dans le temps.

Périmètre :
- comportement des joueurs : zones fréquentées, durée de session, actions ;
- équilibrage : taux de mort par zone, fréquence de récolte, DPS observé ;
- santé du monde : taux de respawn effectif, zones dépeuplées ;
- tendances temporelles : montée en charge, rétention.

L'Analytics lit des données agrégées. Elle ne modifie pas le monde.

Disponibilité : **production**.

Profils : Lead, Owner.

État actuel : non implémenté.

### 3.7 SDK

Le contrat d'interface que chaque module du Runtime expose au Studio.

Périmètre :
- interfaces TypeScript définissant ce qu'un module Runtime peut exposer ;
- registres : commandes, overlays, inspecteurs, événements Monitoring ;
- conventions d'enregistrement pour les modules Studio ;
- contrat de cycle de vie des modules Studio.

Le SDK s'appuie sur le **World Object Model (WOM)** comme abstraction commune :
les modules Runtime exposent des World Objects avec des capacités, les
composants Studio consomment ces capacités sans connaître les types spécifiques.

Référence : `docs/08_Gameplay/world-object-model.md`.

Le SDK est la colonne vertébrale qui permet aux composants Studio d'étendre
leurs capacités sans modifier le Runtime et sans se coupler les uns aux autres.

État actuel : non formalisé. `commandRegistry.ts` est le précurseur du SDK
pour les commandes.

---

## 4. Principes

### Le Studio ne contient pas de logique métier

Le Studio observe et déclenche. Il ne calcule pas, ne valide pas les règles
du jeu, ne prend pas de décision de gameplay. Toute action passe par les
interfaces Runtime existantes.

Violation de ce principe : un composant Studio qui calcule des dégâts pour
les appliquer directement en base de données.

### Les modules Runtime exposent des capacités Studio

Chaque domaine du Runtime qui veut être observable, instrumentable ou
déclenchable depuis le Studio définit un contrat d'exposition via le SDK :

- quels états sont observables ;
- quels événements sont publiables au Monitoring ;
- quelles actions sont déclenchables (commandes, overlays, inspecteurs).

Ce n'est pas au Studio d'aller lire les internals du Runtime. C'est au Runtime
d'exposer ce qu'il autorise.

### Toute mécanique importante doit penser son intégration Studio

Quand une nouvelle mécanique est conçue pour le Runtime, la question de son
intégration Studio fait partie de la conception :

| Question | Composant Studio |
|---|---|
| Comment l'observer en développement ? | DevTools — overlay ou inspecteur |
| Comment la surveiller en production ? | Monitoring |
| Comment la déclencher manuellement ? | Console DevTools ou LiveOps |
| Comment valider sa cohérence ? | Validation |
| Comment mesurer son impact ? | Analytics |

Une mécanique sans intégration Studio n'est pas interdite, mais elle doit être
documentée comme telle dans `STATUS.md`.

### DevTools debug ≠ LiveOps production

Le DevTools expose des capacités qui ne doivent jamais être disponibles en
production : inspection des internals, modification directe d'états IA, debug
de payloads WebSocket, overlays de collision.

LiveOps expose des capacités sécurisées, limitées et auditées qui peuvent
fonctionner en production.

Le Studio doit maintenir cette frontière clairement. Un profil GM en production
ne doit pas avoir accès aux outils Developer.

---

## 5. Profils utilisateurs

Le Studio sert plusieurs profils avec des besoins distincts.

| Profil | Description | Accès Studio |
|---|---|---|
| **Player** | Joueur standard | Aucun accès Studio |
| **GM** (Game Master) | Opérateur en production | LiveOps, Monitoring |
| **Builder** | Créateur de contenu (maps, spawns, templates) | Automation, Validation, DevTools limité |
| **Developer** | Développeur du jeu | DevTools complet, Monitoring, Automation, Validation |
| **Lead** | Responsable de la qualité et de la cohérence | Tout sauf Analytics avancé |
| **Owner** | Propriétaire du projet | Accès complet à tous les composants |

**Important :** ces profils ne sont pas des rôles d'authentification. Le système
d'auth actuel ne connaît que `PLAYER` et `ADMIN`. Les profils Studio sont une
cible fonctionnelle — leur implémentation nécessitera une évolution du système
Identity.

---

## 6. Contextes de travail

Le Studio opère selon quatre contextes. Un seul contexte est actif à la fois
pour l'utilisateur courant.

| Contexte | Identifiant | Description |
|---|---|---|
| **Player** | `player` | L'utilisateur joue normalement. Le Studio est fermé ou en mode minimal. |
| **Observe** | `observe` | L'utilisateur observe le monde sans agir. Les overlays sont actifs. Les interactions joueur sont suspendues. |
| **Edit** | `edit` | L'utilisateur modifie des entités, des spawns, des paramètres. Les actions LiveOps ou DevTools sont disponibles selon le profil. |
| **Debug** | `debug` | Le développeur diagnostique un comportement. Les overlays de debug sont actifs. La console et le Monitoring sont au premier plan. |

Les overlays et le Monitoring sont transversaux aux contextes. Ils peuvent
rester actifs y compris en contexte `player`.

---

## 7. Overlays et Monitoring — indépendance du contexte

Les overlays sont des couches visuelles superposées à la scène de jeu.
Ils sont activables et désactivables indépendamment du contexte de travail.

Un overlay de chunks peut rester visible pendant qu'un développeur joue en
contexte `player`. Un overlay de collisions peut être actif pendant une session
de validation en contexte `edit`.

Le Monitoring peut fonctionner en arrière-plan dans tout contexte. Un GM peut
surveiller le flux d'événements tout en jouant en contexte `player`.

Cette indépendance est une propriété structurelle du Studio, pas une option.
Les overlays et le Monitoring ne sont pas des fonctionnalités du DevTools —
ils sont des composants autonomes du Studio que le DevTools peut afficher.

---

## 8. Validation du monde — vision future

La Validation est un composant Studio qui mérite une mention spéciale.

À terme, aucun contenu (map, spawn, template) ne devrait être mis en production
sans avoir passé une validation automatique. La Validation remplace les
vérifications manuelles par des règles exprimables et reproductibles.

Les règles de validation sont définies par le Runtime (qui connaît les
contraintes du monde) et exécutées par le composant Validation du Studio. Le
Studio ne définit pas les règles — il les exécute.

Exemples de règles à terme :
- Aucune entité ne peut spawner sur un tile non walkable.
- Tout spawn point doit avoir au moins un respawn point à portée.
- Les zones d'aggro de deux templates distincts ne doivent pas se chevaucher
  au-delà d'un seuil configurable.
- Chaque chunk doit avoir au moins N% de tiles walkables.

État actuel : non implémenté. Aucune validation automatique du monde n'existe.

---

## 9. Relation avec les domaines

Le Studio est transversal à tous les domaines du Runtime. Il observe et
interagit avec chacun sans en implémenter les mécaniques.

```
MMORPG Runtime                         MMORPG Studio
─────────────────────────────────────  ──────────────────────────────────────
World          ──expose capacités──► DevTools (overlays world, coordinate inspector)
Entities       ──expose capacités──► DevTools (entity inspector, spawn overlay)
               ──expose capacités──► LiveOps (spawn, delete, edit)
Gameplay       ──expose capacités──► DevTools (FSM overlay, combat debug)
               ──expose capacités──► Analytics (DPS, drop rates, progression)
Identity       ──expose capacités──► Studio (auth, rôles, audit trail)
Networking     ──expose capacités──► Monitoring (événements WebSocket)
               ──expose capacités──► DevTools (payload inspector)
Persistence    ──expose capacités──► Validation (cohérence des données)
               ──expose capacités──► Analytics (données historiques)
Infrastructure ──expose capacités──► Monitoring (métriques système)
```

Le Studio ne crée pas de domaine supplémentaire dans le Runtime. Il s'appuie
sur les APIs et événements existants.

---

## 10. État actuel et trajectoire

### Ce qui existe (implémenté dans le legacy AdminPanel)

Les fonctionnalités suivantes sont partiellement couvertes par `AdminPanel.tsx`
et relèvent de plusieurs composants Studio futurs :

| Fonctionnalité | Composant Studio cible | État |
|---|---|---|
| Dashboard temps réel | Monitoring | Implémenté (partiel) |
| Console de commandes | DevTools | Implémenté (partiel) |
| Gestion créatures (templates + instances) | LiveOps + DevTools | Implémenté |
| Gestion ressources | LiveOps + DevTools | Implémenté |
| Gestion personnages | LiveOps | Implémenté (partiel) |
| Drag-and-drop vers la carte | LiveOps | Implémenté |
| Overlays debug | DevTools | Futur |
| Spawns éditables | Builder / DevTools | Futur |
| Audit log | LiveOps | Futur |
| Validation monde | Validation | Futur |
| Métriques joueurs | Analytics | Futur |
| Auth WebSocket indépendante | SDK / Identity | Futur |

### Trajectoire

1. **Phase actuelle** : consolider l'infrastructure DevTools (store, bridge,
   modules, overlays). Voir `docs/07_Admin/devtools-architecture.md`.
2. **Phase B** : extraire les fonctionnalités LiveOps de `AdminPanel.tsx` dans
   un composant dédié, avec audit log.
3. **Phase C** : formaliser le SDK (contrat d'interface des modules).
4. **Phase D** : Validation et Automation.
5. **Phase E** : Analytics.

---

## Non-goals

- Ce document ne décrit pas l'implémentation de chaque composant.
- Ce document ne remplace pas `devtools-architecture.md` pour le DevTools.
- Ce document ne remplace pas `admin-tool.md` pour l'outil admin existant.
- Ce document ne définit pas les APIs WebSocket ou HTTP.
- Ce document ne contient pas de roadmap — les priorités sont dans `ROADMAP.md`
  et `STATUS.md`.
- Ce document ne définit pas le système d'authentification — c'est le domaine
  Identity.

## Security notes

Chaque composant Studio qui peut modifier le monde doit :
- vérifier le rôle côté serveur sur chaque action (pas seulement côté client) ;
- enregistrer les actions dans un audit log (qui, quoi, quand) ;
- appliquer du rate limiting sur les actions fréquentes ;
- ne jamais modifier la base de données directement — toujours via les services
  Runtime.

Le DevTools, réservé au développement, doit être exclu des builds de production.
Un bundle DevTools accessible en production est une surface d'attaque.

## Performance notes

Le Monitoring et les overlays peuvent générer un volume significatif d'événements
ou de re-renders Phaser. Chaque composant Studio doit être désactivable
indépendamment et ne pas impacter les performances du Runtime quand il est inactif.

## Related files

- [World Object Model](../08_Gameplay/world-object-model.md)
- [DevTools — Architecture](devtools-architecture.md)
- [Admin Tool](admin-tool.md)
- [Admin Tool Roadmap](../01_Architecture/admin-tool-roadmap.md)
- [Domain Map](../00_Project/domains.md)
- [Project Philosophy](../10_AI/project-philosophy.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Admin Permissions](../02_Security/admin-permissions.md)
- [Documentation Index](../README.md)
- [ROADMAP.md](../ROADMAP.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- À quel moment les profils Studio (GM, Builder, Developer…) devront-ils être
  formalisés dans le système Identity ? Déclencher un ADR ?
- Le SDK doit-il être une interface TypeScript formelle dès la Phase C, ou une
  convention de nommage suffit-elle dans un premier temps ?
- Les composants Studio partagent-ils un seul store global ou ont-ils des stores
  indépendants fédérés par le DevToolsStore ?
- Comment gérer la frontière DevTools/LiveOps quand un développeur travaille
  sur un serveur de staging avec des données proches de la production ?

## TODO

- [ ] Valider la liste des composants Studio avec le responsable du projet.
- [ ] Valider les profils utilisateurs (GM, Builder, Developer, Lead, Owner).
- [ ] Décider si un ADR est nécessaire pour la séparation Runtime/Studio.
- [ ] Définir quand les profils Studio doivent être intégrés au système Identity.
