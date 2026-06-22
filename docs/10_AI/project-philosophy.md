# Philosophie du projet

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/README.md, docs/ROADMAP.md, docs/10_AI/golden-rules.md
- Used by: Project owner, developers, Claude Code, Claude, ChatGPT, Codex, tout agent IA travaillant sur ce projet

## Scope

Ce document décrit les principes immuables du projet MMORPG.

Il ne contient aucune implémentation, aucune roadmap, aucune décision
temporaire, aucune dette technique. Il ne liste pas de technologies, ne
cite pas de frameworks, ne décrit pas de fonctionnalités spécifiques.

Il répond à une seule question : **quelle est la philosophie de conception
de ce MMORPG ?**

Il est conçu pour rester valable pendant plusieurs années, indépendamment
des choix techniques du moment.

---

## 1. Vision

Ce projet vise à construire un MMORPG web multijoueur persistant — robuste,
scalable, maintenable et évolutif sur le long terme.

L'ambition n'est pas de produire un prototype rapide ou une démonstration
technique. C'est de poser des fondations suffisamment solides pour accueillir
progressivement des centaines, puis des milliers de joueurs, sans devoir
réécrire les couches fondamentales à chaque palier de croissance.

Chaque décision architecturale est prise avec cette trajectoire en tête : elle
doit rester valide demain, et ne pas entraver la capacité d'évoluer après-demain.

Le projet avance par strates. Chaque strate doit être stable avant que la
suivante ne soit posée. La vitesse de développement est secondaire à la solidité
de ce qui est construit.

---

## 2. Principes fondamentaux

### Le serveur est la source de vérité unique

Dans un jeu multijoueur, le client ne peut pas être l'arbitre de la réalité.
Tout ce qui a une conséquence sur le monde partagé — position, dégâts, loot,
progression, permissions — est calculé, validé et persisté par le serveur.

Le client exprime des intentions. Le serveur décide des résultats.

Cette règle est non négociable. Elle protège l'intégrité du monde contre la
triche, les bugs client et les comportements imprévus.

### Le client est un moteur de rendu et d'interaction

Le client traduit l'état du serveur en expérience visuelle et interactive. Il
peut prédire localement pour fluidifier le ressenti, mais le serveur peut
toujours corriger cette prédiction.

Le client ne prend aucune décision de gameplay définitive seul.

### Chaque système doit être observable

Un système qu'on ne peut pas voir est un système qu'on ne peut pas déboguer.
Tout état significatif du monde — positions, comportements, zones, timers,
états d'IA — doit pouvoir être visualisé par les outils de développement.

L'observabilité n'est pas un luxe. C'est une condition de la maintenabilité.

### Chaque système doit être extensible

Un bon système est conçu de façon à ce qu'ajouter un nouveau type d'entité,
un nouveau comportement ou une nouvelle règle ne nécessite pas de modifier les
fondations.

L'extensibilité est une propriété qui se conçoit en amont. Elle ne se rattrape
pas facilement après coup.

### La performance est une fonctionnalité

Un MMORPG qui ne tient pas à l'échelle n'est pas un MMORPG. Les choix
techniques doivent préparer la montée en charge dès la conception — non pas en
optimisant prématurément, mais en évitant les architectures qui condamnent à
refaire.

Diffuser moins, cibler mieux, persister intelligemment, calculer côté serveur :
ces réflexes doivent s'appliquer à chaque nouvelle mécanique.

### La sécurité est pensée dès la conception

La sécurité n'est pas une couche ajoutée après coup. Chaque interaction avec
le monde — mouvement, récolte, combat, échange, administration — est conçue
avec la question : *que se passe-t-il si le client est entièrement contrôlé
par un utilisateur malveillant ?*

Les garde-fous ne sont pas des optimisations. Ils sont structurels.

---

## 3. Philosophie d'architecture

### Évolution plutôt que réécriture

Un système qui fonctionne est un actif. Le remplacer entièrement est coûteux
et risqué. La règle est d'étendre, d'adapter, de migrer progressivement —
jamais de jeter ce qui fonctionne pour repartir de zéro sans raison validée.

### Petits changements plutôt que gros refactorings

Les grands refactorings introduisent des régressions difficiles à localiser.
Les petits changements sont vérifiables, réversibles, explicables. Quand une
évolution semble exiger un grand refactoring, c'est souvent le signal qu'une
fondation mérite d'être repensée — mais progressivement, et avec validation.

### Séparation claire des responsabilités

Chaque composant du système a un rôle défini. Le rendu rend. La logique
métier calcule. Le réseau transporte. La persistance stocke. Ces frontières
ne se négocient pas au nom de la commodité du moment.

Un couplage fort entre deux couches qui n'auraient pas dû se connaître est
une dette architecturale, pas une optimisation.

### Composition plutôt que duplication

Quand deux endroits ont besoin du même comportement, la bonne réponse est un
composant partagé — pas deux copies qui divergent. La duplication crée de la
complexité accidentelle et des bugs invisibles.

### Les décisions durables sont documentées

Une décision d'architecture qui n'est pas écrite est une décision qui sera
remise en question, contredite ou redécouverte à chaque nouvelle session. Les
décisions durables vivent dans des ADRs. Elles ont un contexte, une
justification, et un statut clair.

---

## 4. Philosophie du DevTools

Le DevTools n'est pas un outil de débogage accessoire. C'est une partie
intégrante du moteur du jeu, au même titre que le système de combat ou le
système de récolte.

La règle fondamentale est : **tout ce que le serveur connaît doit pouvoir être
visualisé.**

Ce principe se décline en une chaîne :

- **Tout état serveur est visualisable.** Positions, zones d'influence,
  comportements d'IA, états de ressources, timers — chaque donnée significative
  du monde peut être affichée dans le DevTools.

- **Tout ce qui est visualisable est inspectable.** L'outil ne se limite pas
  à afficher. Il permet de lire les valeurs précises, de comprendre l'état
  interne d'une entité.

- **Tout ce qui est inspectable est modifiable selon les permissions.** Un
  administrateur autorisé peut modifier les paramètres d'une entité, repositionner
  un spawn, ajuster une statistique — directement depuis le DevTools, avec les
  mêmes garde-fous que n'importe quelle autre opération serveur.

- **Chaque nouvelle mécanique s'intègre naturellement au DevTools.** Quand un
  nouveau système est conçu, la question "comment l'observer dans le DevTools ?"
  fait partie de la conception, pas d'une phase ultérieure.

- **Le DevTools ne multiplie pas les panneaux spécifiques.** Un outil générique
  et extensible vaut mieux qu'une accumulation de vues ad hoc. Chaque nouveau
  domaine s'intègre dans le cadre existant plutôt que d'ajouter une nouvelle
  interface isolée.

Cette philosophie garantit que le projet reste compréhensible à mesure qu'il
grandit. Un monde complexe sans outils pour l'observer devient rapidement
incontrôlable.

---

## 5. Philosophie IA

Les assistants IA — qu'il s'agisse d'agents de code, d'assistants
conversationnels ou d'outils d'analyse — sont des collaborateurs, pas des
décideurs.

Leur rôle est défini par cinq obligations :

**Comprendre avant d'écrire.** Un agent qui modifie du code sans avoir lu le
contexte existant est un agent qui produit des régressions. L'analyse précède
l'action, toujours.

**Préserver l'architecture.** Les décisions validées dans les ADRs, les
conventions établies dans le code, les frontières définies entre les systèmes —
tout cela est à respecter, pas à optimiser spontanément.

**Proposer avant de transformer.** Pour tout changement qui dépasse la demande
initiale, la bonne posture est de proposer et d'attendre la validation humaine.
Un agent qui improvise de l'architecture est un agent qui sort de son rôle.

**Respecter les ADRs.** Une décision acceptée est une frontière. Elle ne se
contourne pas, ne se réinterprète pas, ne se dépasse pas sans un nouveau
processus de décision explicite.

**Documenter les décisions durables.** Quand une décision significative est
prise pendant une session, elle doit être tracée. Ce qui n'est pas écrit sera
oublié, redécouvert, ou contredit.

---

## 6. Ce que le projet n'est pas

Clarifier ce qu'un projet n'est pas est aussi important que définir ce qu'il est.

Ce projet n'est **pas un prototype jetable**. Chaque composant est conçu
avec l'intention de durer. Les solutions temporaires sont identifiées comme
telles, documentées, et ont une date de vie connue.

Ce projet n'est **pas une démonstration technique**. L'objectif n'est pas
de montrer qu'une technologie particulière peut faire tourner un jeu. C'est
de construire un jeu qui peut accueillir des joueurs.

Ce projet n'est **pas un projet scolaire**. Les choix de conception prennent
en compte la robustesse, la sécurité, la maintenabilité et l'évolutivité —
pas uniquement la fonctionnalité minimale.

Ce projet n'est **pas un jeu solo rendu multijoueur**. L'architecture
multijoueur est une contrainte de premier ordre, pas une fonctionnalité
ajoutée après coup. Chaque système est conçu avec la multiplicité des
joueurs en tête dès le départ.

Ce projet n'est **pas une accumulation de solutions temporaires**. Les
raccourcis sont acceptables dans un périmètre borné, documentés, et
accompagnés d'un chemin clair vers une solution durable. Ils ne s'accumulent
pas sans limite.

---

## 7. Critères de décision

Lorsqu'il existe plusieurs solutions à un problème, l'ordre de préférence est :

1. **Robustesse** — La solution tient-elle dans le temps, sous la charge, en
   cas d'erreur ?

2. **Maintenabilité** — Un développeur qui arrive dans six mois peut-il
   comprendre, modifier et tester cette solution ?

3. **Extensibilité** — La solution peut-elle accueillir les évolutions
   prévisibles sans être réécrite ?

4. **Sécurité** — La solution résiste-t-elle à un client malveillant ? Les
   frontières de confiance sont-elles respectées ?

5. **Performances** — La solution est-elle acceptable à l'échelle cible ?
   Prépare-t-elle la montée en charge, ou la compromet-elle ?

6. **Simplicité** — La solution est-elle aussi simple que le problème le
   permet ? La complexité est-elle justifiée ?

7. **Rapidité d'implémentation** — La solution peut-elle être livrée dans
   un délai raisonnable ? Ce critère n'est pertinent qu'en dernier recours,
   après les six précédents.

Une solution rapide qui sacrifie la robustesse ou la sécurité n'est pas une
solution : c'est une dette.

---

## Non-goals

- Ce document ne remplace pas les ADRs.
- Ce document ne remplace pas `ROADMAP.md`.
- Ce document ne décrit pas l'implémentation technique.
- Ce document ne cite pas les technologies ou frameworks utilisés.
- Ce document ne documente pas les fonctionnalités du jeu.
- Ce document ne décrit pas le workflow de développement.
- Ce document ne liste pas la dette technique.
- Ce document ne définit pas les priorités du projet.

## Security notes

Le principe selon lequel le serveur est la source de vérité unique pour les
règles de gameplay est un principe de sécurité fondamental, pas seulement
une préférence architecturale.

Aucune décision ne peut affaiblir ce principe sans validation humaine explicite
et sans ADR dédié.

## Performance notes

Ce document n'a pas d'impact runtime.

Le principe que la performance est une fonctionnalité implique que les
décisions de conception intègrent les contraintes de performance dès le
départ — et non comme une optimisation tardive.

## Related files

- [Documentation Index](../README.md)
- [Golden Rules](golden-rules.md)
- [Session Workflow](session-workflow.md)
- [Implementation Rules](implementation-rules.md)
- [Architecture Review](architecture-review.md)
- [ROADMAP.md](../ROADMAP.md)
- [ADR-0001 — World Coordinate System](../01_Architecture/adr/ADR-0001-world-coordinate-system.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Admin Tool Roadmap](../01_Architecture/admin-tool-roadmap.md)

## Open questions

- Faut-il une version courte de ce document (1 page) utilisable comme
  introduction rapide pour un nouvel agent IA ou un nouveau contributeur ?
- Comment aligner ce document avec un éventuel "Game Design Document" si
  le projet en définit un ?

## TODO

- [ ] Valider ce document avec le responsable du projet.
- [ ] Vérifier que les principes ici décrits ne contredisent aucun ADR
  existant ou futur.
- [ ] Envisager une version condensée si l'usage le justifie.
