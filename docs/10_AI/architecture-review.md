# Architecture Review

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/10_AI/golden-rules.md, docs/10_AI/session-workflow.md, docs/01_Architecture/adr/README.md, docs/01_Architecture/overview.md, CLAUDE.md
- Used by: Claude Code, Codex, tout agent IA qui analyse ou modifie l'architecture du projet

## Scope

Ce document définit comment un agent IA doit analyser une décision ou une
modification d'architecture dans ce projet MMORPG.

Il explique quand lire les ADRs, quand en proposer un nouveau, comment
détecter une contradiction, comment évaluer l'impact sur la scalabilité, la
sécurité, les performances et la base de données.

Il ne remplace pas les ADRs ni les documents de domaine. Il donne la méthode
pour interagir avec eux correctement.

---

## 1. Décisions acquises — ne pas remettre en question

Les décisions suivantes sont **figées** dans `docs/ROADMAP.md` (Frozen
Decisions). Elles ne peuvent pas être remises en question dans une session
de développement normale.

### Système de coordonnées WU (ADR-0001 — Accepted)

**Le système WU est acquis. Ne pas proposer de refactoring WU sans demande
explicite.**

Points fermes :

- `1 tile = 1024 WU = 2^10`
- `CHUNK_SIZE = 64` tiles par côté — constante invariante.
- `CHUNK_SIZE_WU = 65536`
- `DEFAULT_MAP_ID = 1` (mapId unique actuel)
- Projection isométrique :
  `screenX = 1000 + (worldX − worldY) / 16`
  `screenY = (worldX + worldY) / 32`
- Inverse : `worldX = 8*(sx−1000) + 16*sy`, `worldY = −8*(sx−1000) + 16*sy`
- `worldX/worldY/mapId` = source de vérité serveur.
- Les pixels Phaser (`x`, `y`, `positionX`, `positionY`) sont un cache de
  rendu dérivé des WU.
- Phase 1 (backfill) et Phase 2 (backend WU-authoritative) sont closes.

Ce système est testé (170+ tests), documenté (ADR-0001), backfillé et en
production. Ne proposer aucune modification à ces constantes ni à ces
formules sans ouvrir un ADR qui superseède ADR-0001 avec validation humaine
explicite.

### Format des cartes (ROADMAP.md)

- TMJ : format officiel pour les cartes (JSON natif Tiled).
- TSX : format officiel pour les tilesets d'édition (artefact d'authoring).
- Pas de convertisseur TMX → JSON autorisé.
- Les tilesets sont inlinés dans le TMJ au runtime.

### Pipeline graphique (ROADMAP.md)

- IA → GIMP → Tiled → Phaser.
- Ce pipeline ne change pas sans validation humaine.

---

## 2. Quand lire les ADRs

Lire les ADRs concernés avant toute modification qui touche à :

| Domaine | ADR à lire |
|---|---|
| Coordonnées, position, projection | ADR-0001 |
| Nommage de colonnes, entités positionnées | ADR-0002 |
| Validation de mouvement, autorité serveur | ADR-0003 |
| Tout nouveau domaine | `docs/01_Architecture/adr/README.md` |

Un ADR au statut `Accepted` est une décision figée.
Un ADR au statut `Draft` ou `Proposed` est en cours de validation — ne pas
l'implémenter comme s'il était accepté.

---

## 3. Quand proposer un nouvel ADR

Proposer un ADR (sans l'écrire) quand la tâche implique :

- Un changement de source d'autorité (client vs serveur).
- Un changement de stratégie de persistance.
- L'introduction d'une dépendance majeure (cache, broker, ORM différent).
- Un changement de protocole réseau ou de format de payload WebSocket.
- Une modification des constantes du système de coordonnées.
- Une décision avec coût de maintenance long terme.
- Un changement qui contredit un ADR existant.

Ne pas écrire un ADR sans validation humaine. Proposer d'abord : "Cette
décision mériterait un ADR. Souhaitez-vous que je le prépare ?"

Ne pas créer d'ADR pour des corrections mineures, des changements de format,
des ajouts de champs dans un DTO.

---

## 4. Détecter une contradiction

### Sources de vérité par priorité

En cas de désaccord entre documents :

1. Code implémenté (source absolue de l'état technique réel).
2. ADRs au statut `Accepted`.
3. Documentation de domaine.
4. `STATUS.md`.
5. `CLAUDE.md` et fichiers d'instructions IA.

### Signaler sans corriger

Si une contradiction est détectée entre deux documents, ou entre un document
et le code :

1. La signaler dans le résumé de session avec les deux versions en conflit.
2. Proposer la résolution correcte.
3. Ne pas choisir silencieusement une version.
4. Ne pas modifier un document pour "aligner" sans validation humaine si le
   désaccord touche une décision d'architecture.

Exemples de contradictions courantes à surveiller :

- Un document dit que le backend est WU-only, mais le code contient encore
  une lecture de `positionX`.
- STATUS.md liste un item comme terminé, mais le code contient encore un stub.
- Un ADR Proposed est documenté comme Accepted dans un autre fichier.
- Une constante WU dans le code ne correspond pas à la valeur dans ADR-0001.

---

## 5. Évaluer la scalabilité

Pour toute modification du réseau, de la base de données ou du backend, poser
ces questions :

**Réseau :**
- Est-ce que ce changement augmente la fréquence de broadcast ?
- Est-ce que `server.emit` peut être remplacé par une émission ciblée ?
- Quelle est la taille maximale réaliste d'un payload avec 100 joueurs ?
- Ce changement peut-il être throttlé ou debouncé sans perte de qualité ?

**Base de données :**
- Est-ce que ce changement ajoute une requête par tick ou par événement ?
- Risque de N+1 query ?
- Faut-il un index pour cette requête ?
- Faut-il une transaction ?

**Serveur :**
- Est-ce que ce changement ajoute une boucle `setInterval` ?
- Cet état doit-il survivre à un redémarrage ? Si oui, le persister.
- Combien d'entités ce code parcourt-il par tick ?

**Client :**
- Ce changement augmente-t-il la fréquence des re-renders React ?
- Ce changement crée-t-il un listener WebSocket supplémentaire non nettoyé ?

---

## 6. Vérifier les impacts sécurité

Pour toute modification réseau, admin, mouvement ou gameplay :

**Question obligatoire :**
```
Que se passe-t-il si le client est entièrement modifié par un utilisateur
malveillant ?
```

Vérifications à appliquer :

- Les coordonnées envoyées par le client sont-elles validées côté serveur ?
- Le payload est-il validé par un DTO avec `class-validator` ?
- L'appartenance de l'entité ciblée est-elle vérifiée ?
- Une action admin peut-elle être exécutée sans `client.data.role === 'admin'` ?
- Le résultat d'une action peut-il être dupliqué par replay sans protection ?
- Un événement WebSocket peut-il être spammé sans rate limiting ?

Ces vérifications ne prétendent pas que toutes les protections sont en place.
Elles permettent de détecter les régressions et les nouvelles vulnérabilités.

---

## 7. Vérifier les impacts base de données

Pour toute modification d'entité TypeORM :

- Les colonnes WU (`worldX`, `worldY`, `mapId`) restent nullables le temps
  que la migration soit complète sur toutes les entités.
- Ne pas ajouter de colonne NOT NULL sans `{ default: value }` tant que
  `synchronize: true` est actif.
- Signaler toute modification de schéma qui nécessiterait une migration
  manuelle.
- Ne pas utiliser `synchronize: true` en production — le signaler si une
  migration de production est nécessaire.

---

## 8. Protéger les décisions figées

Les règles suivantes s'appliquent à toute proposition qui touche à une
décision Frozen :

1. **Identifier** qu'une décision figée est concernée (ADR-0001, ADR-0002,
   ADR-0003, format TMJ, pipeline graphique).
2. **Avertir** explicitement : "Ce changement touche une décision figée."
3. **Ne pas implémenter** sans validation humaine explicite.
4. **Proposer un ADR** si la décision doit évoluer.

Un agent ne peut pas décider seul de superseder une décision figée, même si
elle semble sous-optimale pour la tâche en cours.

---

## 9. Architecture cible connue

Ces chantiers architecturaux sont planifiés mais non commencés. Ne pas les
implémenter spontanément — les mentionner si pertinents :

| Chantier | Contexte | Document |
|---|---|---|
| Validation position serveur | ADR-0003 Proposed | `docs/08_Gameplay/movement-authority-audit.md` |
| Rooms WebSocket par zone | Scalabilité broadcast | `docs/01_Architecture/realtime-socketio.md` |
| Chunk streaming | Monde ouvert | `docs/ROADMAP.md` |
| Migrations TypeORM | Production | `docs/06_Database/migrations.md` |
| Pagination serveur admin | DevTools | `docs/01_Architecture/admin-tool-roadmap.md` |

---

## Non-goals

- Ce document ne remplace pas les ADRs.
- Ce document ne définit pas les règles de commit.
- Ce document ne valide pas automatiquement une décision.
- Ce document ne décrit pas en détail les modules de l'application.

## Security notes

Toute décision architecturale qui touche aux frontières client/serveur doit
maintenir le principe que le serveur NestJS est l'autorité unique pour les
règles de gameplay.

Ne jamais créer d'ADR ou de décision qui déplace de l'autorité gameplay vers
le client.

## Performance notes

Ce document n'a pas d'impact runtime.

Les évaluations de scalabilité décrites ici sont des guidelines, pas des
métriques mesurées. Toute affirmation de performance doit être vérifiée par
mesure, pas par supposition.

## Related files

- [Golden Rules](golden-rules.md)
- [Session Workflow](session-workflow.md)
- [ADR README](../01_Architecture/adr/README.md)
- [ADR-0001 World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
- [ADR-0002 Entity Positioning](../01_Architecture/adr/ADR-0002-entity-positioning.md)
- [ADR-0003 Movement Authority](../01_Architecture/adr/ADR-0003-movement-authority.md)
- [Architecture Overview](../01_Architecture/overview.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Admin Tool Roadmap](../01_Architecture/admin-tool-roadmap.md)
- [Project Audit](../01_Architecture/project-audit.md)
- [ROADMAP.md](../ROADMAP.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Quel est le processus exact pour promouvoir ADR-0002 de Proposed à Accepted ?
- Comment signaler une contradiction entre STATUS.md et le code sans interrompre
  le travail en cours ?
- Quand un nouvel ADR doit-il être proposé vs une simple note dans STATUS.md ?

## TODO

- [ ] Valider ces règles avec le responsable du projet.
- [ ] Aligner avec project-audit.md sur les dettes architecturales connues.
- [ ] Ajouter les ADRs futurs quand ils sont créés.
