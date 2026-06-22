# Session Workflow

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/README.md, docs/10_AI/golden-rules.md, docs/09_Workflow/ai-assistant-workflow.md, CLAUDE.md, STATUS.md, docs/ROADMAP.md
- Used by: Claude Code, Claude, ChatGPT, Codex, tout agent IA travaillant sur ce projet

## Scope

Ce document définit le protocole obligatoire de chaque session IA sur ce projet.

Il s'applique à Claude Code, Claude, ChatGPT, Codex et tout agent équivalent qui
analyse, modifie, documente ou planifie du travail dans ce dépôt.

Il ne remplace pas les Golden Rules ni les documents de domaine. Il les synthétise
en un protocole concret, ordonné, applicable à chaque session.

---

## Protocole de session — 14 étapes

### Étape 1 — Lire ROADMAP.md

`docs/ROADMAP.md` est le point d'entrée de toute session.

Il contient :

- Les décisions figées (Frozen Decisions) — à ne jamais remettre en question
  sans ADR.
- Le milestone actuel — la priorité active du projet.
- L'état des chantiers en cours (marqueurs `[x]`, `[ ]`, `[>]`, `[!]`).

Ne pas démarrer sans avoir lu le milestone actuel.

---

### Étape 2 — Lire STATUS.md

`STATUS.md` décrit l'état d'implémentation réel du projet.

Il contient :

- Ce qui fonctionne réellement.
- Les derniers changements importants.
- La dette technique connue et classée.
- Les prochaines priorités possibles.
- Les règles à ne pas oublier.

C'est le document le plus à jour sur l'état du code. Le lire après ROADMAP.md.

---

### Étape 3 — Lire CLAUDE.md

`CLAUDE.md` contient les conventions de travail spécifiques à ce projet.

Il définit :

- L'architecture backend et frontend en résumé.
- Les principes de travail (scope strict, étapes, diffs limités).
- Les règles de sécurité et de performance temps réel.
- Le workflow attendu de bout en bout.
- Le format des commits.

C'est le document qui définit comment travailler sur ce projet en particulier.

---

### Étape 4 — Lire les ADR concernés

Si la tâche touche au système de coordonnées, au réseau, à la base de données,
à la sécurité, au mouvement ou à l'autorité des données :

- Lire `docs/01_Architecture/adr/ADR-0001-world-coordinate-system.md` pour
  toute question de coordonnées.
- Lire `docs/01_Architecture/adr/ADR-0002-entity-positioning.md` pour les
  entités positionnées.
- Lire `docs/01_Architecture/adr/ADR-0003-movement-authority.md` pour le
  mouvement et la validation serveur.
- Lire `docs/01_Architecture/adr/README.md` pour comprendre le processus ADR.

Une décision dont le statut est `Accepted` est figée. Ne pas la contredire
sans créer un nouvel ADR qui la superseède explicitement.

---

### Étape 5 — Lire la documentation du domaine concerné

Identifier le domaine de la tâche dans `docs/README.md`.

Exemples :

- Monde, coordonnées, chunks → `docs/05_World/` + `docs/01_Architecture/`
- Sécurité, permissions, trust → `docs/02_Security/`
- Réseau, WebSocket → `docs/04_Server/websockets.md`
- Admin, DevTools → `docs/07_Admin/admin-tool.md` +
  `docs/01_Architecture/admin-tool-roadmap.md`
- Base de données → `docs/06_Database/`
- IA, workflow → `docs/10_AI/` + `docs/09_Workflow/`

Ne pas se limiter à un seul document si plusieurs domaines sont concernés.

---

### Étape 6 — Lire le code concerné

Après les documents, lire les fichiers source directement impactés par la
tâche.

Règles :

- Ne jamais décrire le comportement d'un fichier sans l'avoir lu.
- Ne pas supposer qu'un système est absent sans avoir cherché.
- Pour les fichiers de plus de 50 lignes, utiliser `Read` avec `offset/limit`
  plutôt que `cat`.
- Utiliser `grep` ou `find` pour localiser rapidement les symbols pertinents.

---

### Étape 7 — Identifier l'existant

Avant toute modification, documenter mentalement (ou dans une note) :

- Quels fichiers sont concernés.
- Quels systèmes existent déjà (services, gateways, stores, composants).
- Quelles conventions sont déjà utilisées dans le voisinage du code à modifier.
- Quelle est la limite exacte du changement demandé.

**Ne jamais proposer une solution avant d'avoir identifié l'existant.**

---

### Étape 8 — Chercher une extension possible

Avant de créer quelque chose de nouveau, vérifier s'il est possible :

- D'étendre un service existant plutôt que d'en créer un nouveau.
- D'ajouter une méthode plutôt que de dupliquer une logique.
- D'étendre un composant React ou un store Zustand existant.
- D'ajouter un événement dans une gateway existante plutôt qu'une nouvelle
  gateway.

L'extension est préférable à la réécriture. La réécriture nécessite une
justification explicite.

---

### Étape 9 — Proposer un plan minimal

Pour toute tâche non triviale, proposer un plan avant d'implémenter.

Le plan doit :

- Lister les fichiers à modifier.
- Décrire le changement minimal cohérent.
- Identifier les impacts sur d'autres modules.
- Signaler les risques de sécurité ou de performance si présents.
- Proposer des étapes séquentielles si le changement est complexe.

Ne pas implémenter avant que le plan soit validé si le changement dépasse la
demande initiale.

---

### Étape 10 — Attendre validation si le changement dépasse la demande

Si l'analyse révèle qu'un changement correct implique :

- Des modifications dans plus de 3 fichiers non prévus,
- Un refactoring opportuniste,
- Un changement d'architecture,
- Une décision de sécurité,
- Un impact sur le protocole WebSocket ou la base de données,

alors **proposer et attendre la validation humaine** avant d'implémenter.

Ne pas agir seul sur une décision architecturale ou sécuritaire.

---

### Étape 11 — Implémenter petit

Appliquer le changement minimal cohérent avec l'architecture existante.

Règles :

- Un seul diff à la fois.
- Ne pas profiter d'un changement pour en faire un autre non demandé.
- Préserver les changements utilisateur existants.
- Ne pas renommer, déplacer ou supprimer sans demande explicite.
- Ne pas ajouter de dépendance sans validation.

---

### Étape 12 — Vérifier

Après implémentation, exécuter les commandes de vérification adaptées.

| Changement | Commande |
|---|---|
| Code backend | `npm --workspace api-gateway run build` |
| Logique métier backend | `npm --workspace api-gateway run test -- <fichier>` |
| Code frontend | `npm --workspace client run build` |
| Erreur ESLint signalée | `npm --workspace api-gateway run lint` ou `npm --workspace client run lint` |

Ne jamais affirmer que les tests passent sans les avoir exécutés. Distinguer
clairement : vérifié / non vérifié / supposé / non implémenté.

---

### Étape 13 — Résumer

Fournir un résumé de fin de tâche contenant :

- Fichiers modifiés (liste exacte).
- Ce qui a été fait.
- Ce qui n'a pas été fait (hors scope ou non implémenté).
- Tests ou builds exécutés et leur résultat.
- Limites connues ou dettes introduites.
- Contradictions ou incohérences détectées (sans les corriger arbitrairement).

---

### Étape 14 — Proposer un commit

Proposer un message de commit en français au format Conventional Commits.

Voir `docs/10_AI/commit-policy.md` pour le format complet, les exemples et les
règles.

Ne pas créer le commit sans demande explicite.

---

## Mise à jour de la documentation

### Quand mettre à jour STATUS.md

Mettre à jour `STATUS.md` après une session de code si :

- Une fonctionnalité a changé d'état (terminée, partiellement implémentée,
  soldée).
- Une dette technique nouvelle est apparue.
- Une règle importante a été ajoutée ou modifiée.
- Des documents potentiellement impactés doivent être listés.

Ne pas mettre à jour STATUS.md pour une session de documentation pure qui n'a
pas modifié le code.

### Quand mettre à jour ROADMAP.md

Mettre à jour `ROADMAP.md` uniquement si :

- Un item change de statut (`[ ]` → `[x]`, `[ ]` → `[>]`, etc.).
- Un nouveau domaine majeur est identifié.
- Le milestone actuel est atteint et un nouveau milestone est défini.
- Une décision est officiellement validée et doit rejoindre Frozen Decisions.

Ne pas utiliser ROADMAP.md comme journal de développement.

### Quand mettre à jour la documentation de domaine

Mettre à jour un document `docs/` de domaine si le changement affecte :

- Une règle d'architecture.
- Une API ou un protocole réseau.
- Un comportement sécuritaire.
- Un schéma de base de données.
- Un workflow durable.

Ne pas documenter un comportement comme implémenté s'il ne l'est pas.
Utiliser `TBD` pour les informations inconnues.

---

## Gestion des limites connues

Si une limite connue est atteinte pendant la session :

- La signaler clairement dans le résumé.
- Ne pas inventer une solution de contournement non demandée.
- Proposer une note dans STATUS.md sous "Dette technique" si la limite est
  significative.
- Proposer un ADR si la limite implique une décision d'architecture.

---

## Raccourcis pour les tâches simples

Pour les tâches à faible impact (correction de typo, ajout d'un champ mineur,
ajout d'un test unitaire isolé), le protocole peut être réduit aux étapes :
6 → 7 → 11 → 12 → 13 → 14.

Les étapes 1 à 5 restent obligatoires si la tâche touche à l'architecture,
à la sécurité, au réseau ou à la base de données.

---

## Non-goals

- Ce document ne remplace pas les Golden Rules.
- Ce document ne définit pas la stratégie de déploiement.
- Ce document ne décrit pas l'architecture en détail.
- Ce document ne valide pas automatiquement une décision.

## Security notes

Le serveur NestJS reste l'autorité pour les règles de gameplay.

Le client Phaser et l'interface admin sont non fiables. Aucune donnée client ne
doit devenir autoritative sans validation serveur.

Ne jamais copier de secrets, tokens, mots de passe ou valeurs `.env` dans la
documentation ou les prompts.

## Performance notes

Ce document n'a pas d'impact runtime.

Toute proposition d'implémentation doit considérer la charge serveur, le trafic
réseau, la fréquence des mises à jour, et la scalabilité MMORPG.

## Related files

- [Documentation Index](../README.md)
- [Golden Rules](golden-rules.md)
- [AI Assistant Workflow](../09_Workflow/ai-assistant-workflow.md)
- [Implementation Rules](implementation-rules.md)
- [Architecture Review](architecture-review.md)
- [Commit Policy](commit-policy.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [CLAUDE.md](../../CLAUDE.md)
- [STATUS.md](../../STATUS.md)
- [ROADMAP.md](../ROADMAP.md)

## Open questions

- Quand ce protocole peut-il être allégé pour des sessions de documentation
  pure ?
- Comment automatiser la vérification des étapes 1 à 5 dans Claude Code ?
- Quel niveau de détail est attendu dans le résumé de fin de tâche selon la
  taille du changement ?

## TODO

- [ ] Valider ce protocole avec le responsable du projet.
- [ ] Tester ce protocole sur une session réelle et noter les friction points.
- [ ] Aligner avec golden-rules.md si des contradictions apparaissent.
