# Commit Policy

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/10_AI/session-workflow.md, CLAUDE.md, docs/09_Workflow/development.md
- Used by: Claude Code, Codex, tout agent IA qui propose ou crée des commits sur ce projet

## Scope

Ce document définit la politique de commit pour les agents IA travaillant sur
ce projet MMORPG.

Il couvre le format des messages, les règles de staging, les vérifications
pré-commit, et ce qu'un résumé de commit doit contenir.

---

## 1. Format des messages de commit

### Langue

Tous les messages de commit sont **en français**.

### Format Conventional Commits

```
type(scope): description courte en français
```

- La description commence par une minuscule.
- La description ne dépasse pas 72 caractères.
- Pas de point final.
- Le présent de l'indicatif est utilisé ("ajouter", "corriger", "migrer",
  non "ajouté", "corrigé", "migré").

---

## 2. Types autorisés

| Type | Usage |
|---|---|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `docs` | Documentation uniquement |
| `refactor` | Refactoring sans changement de comportement |
| `test` | Ajout ou correction de tests |
| `chore` | Tâche de maintenance (dépendances, config, CI) |
| `style` | Formatage, typos (pas de changement de logique) |
| `perf` | Optimisation de performance |

---

## 3. Scopes du projet

Le scope est **obligatoire**. Il identifie le module ou domaine concerné.

| Scope | Domaine |
|---|---|
| `world` | WorldService, WorldGateway, position, respawn |
| `animals` | AnimalsService, AnimalsGateway, IA, combat |
| `resources` | ResourcesGateway, ResourcesService, récolte |
| `combat` | Dégâts, attaque, formule de combat |
| `auth` | Authentification, JWT, registration |
| `characters` | CharacterService, CharacterController, équipement |
| `inventory` | InventoryService, InventoryController |
| `items` | ItemService, ItemController, entité Item |
| `admin` | AdminGateway, AdminService, AdminPanel, console |
| `devtools` | Outils de développement, overlays, monitoring |
| `phaser` | WorldScene, Player, PlayerController, rendu |
| `ui` | Composants React (CharacterLayout, ActionPanel, etc.) |
| `store` | Stores Zustand |
| `socket` | Configuration Socket.IO, événements réseau |
| `db` | Entités TypeORM, migrations, schéma |
| `wu` | Migration World Units, coordonnées, projections |
| `config` | Configuration NestJS, environnement, modules |
| `ai` | Documentation IA, golden rules, workflow |
| `docs` | Documentation (si scope générique insuffisant) |

Si plusieurs scopes sont concernés, utiliser le scope dominant ou le scope
du fichier principal modifié.

---

## 4. Exemples adaptés au projet

```
feat(devtools): ajouter le module d'overlay chunks

fix(world): corriger la validation des coordonnées serveur

docs(ai): formaliser le workflow de session

refactor(resources): isoler la logique de portée d'interaction

test(combat): couvrir la portée d'attaque en WU

feat(admin): rendre les spawns créatables depuis le panneau

fix(characters): corriger la validation d'ownership dans equipItem

feat(animals): persister les timers de respawn via Redis

docs(architecture): ajouter l'audit complet du projet

chore(config): importer ItemModule dans AppModule

test(world): ajouter les cas limites de updatePlayer

feat(phaser): brancher MapLoader dans WorldScene

fix(db): ajouter la valeur par défaut sur la colonne worldX

refactor(admin): paginer les endpoints /admin/animals et /admin/resources

style(phaser): corriger le formatage de WorldScene
```

---

## 5. Corps du commit (optionnel mais recommandé)

Pour les changements non triviaux, ajouter un corps après une ligne vide.

Le corps doit mentionner :

- Pourquoi ce changement (contexte, bug reproduit, objectif).
- Ce qui a changé concrètement (fichiers principaux, comportement avant/après).
- Ce qui n'est pas fait (hors scope, dette laissée).

```
feat(admin): ajouter la pagination serveur sur /admin/animals

Les endpoints admin renvoyaient toutes les entités en une seule réponse.
Ajout de ?page= et ?limit= sur /admin/animals, /admin/resources et
/admin/characters.

Hors scope : pagination côté frontend (AdminPanel.tsx) — à faire dans un
second commit.
```

---

## 6. Règles de staging

- Stager uniquement les fichiers dans le scope de la tâche.
- Ne jamais utiliser `git add .` ou `git add -A` sans validation explicite.
- Vérifier `git diff --cached --name-only` avant de créer le commit.
- Ne pas mélanger des changements de code et de documentation sans lien dans
  le même commit, sauf si la tâche le demande explicitement.

---

## 7. Obligations pré-commit

Avant de proposer un commit, vérifier :

- [ ] Le build passe (`npm run build` dans le workspace concerné).
- [ ] Les tests impactés passent (`npm run test -- <fichier>`).
- [ ] Aucun fichier hors scope n'est stagé.
- [ ] Aucun secret, token ou valeur `.env` n'est inclus.
- [ ] Le message de commit respecte le format ci-dessus.
- [ ] La description est en français et au présent.
- [ ] Le scope est correct.

Si un build ou un test n'a pas été exécuté, le mentionner explicitement dans
le résumé : "build non exécuté" ou "tests non exécutés".

---

## 8. Ce qu'un résumé de commit doit contenir

Le résumé fourni à l'humain avant création du commit doit lister :

1. **Fichiers modifiés** : liste exacte des fichiers.
2. **Ce qui a été fait** : description fonctionnelle du changement.
3. **Tests ou builds exécutés** : commande + résultat (`✓ 24/24 tests` ou
   `build OK` ou `non exécuté`).
4. **Limites connues** : ce qui n'est pas fait, ce qui reste en dette.
5. **Proposition de commit** : message complet formaté, prêt à être copié.

---

## 9. Ne pas committer automatiquement

Un agent IA **ne crée jamais de commit sans demande explicite**.

"Propose un commit" → fournir le message, attendre validation.
"Commite les changements" ou "crée le commit" → exécuter `git commit`.

Ne pas pousser (`git push`) sans instruction explicite, même après un commit.

---

## 10. Commits de documentation pure

Pour les sessions qui ne modifient que des fichiers `docs/` :

```
docs(ai): créer les quatre documents de workflow IA

docs(architecture): ajouter l'audit complet du projet

docs(admin): ajouter la roadmap de l'outil admin
```

Le scope peut être `docs` si le domaine est générique, ou le domaine spécifique
si le document appartient clairement à un domaine (`architecture`, `admin`,
`ai`, `security`, etc.).

---

## Non-goals

- Ce document ne définit pas les règles d'implémentation.
- Ce document ne définit pas la stratégie de branches.
- Ce document ne remplace pas `git commit --help`.
- Ce document ne définit pas les règles de push ou de PR.

## Security notes

Ne jamais inclure de secret, token, mot de passe ou valeur `.env` dans un
commit, un message de commit ou un corps de commit.

Vérifier `git diff --cached` pour s'assurer qu'aucun fichier sensible n'est
inclus.

## Performance notes

Ce document n'a pas d'impact runtime.

## Related files

- [Session Workflow](session-workflow.md)
- [Implementation Rules](implementation-rules.md)
- [Development Workflow](../09_Workflow/development.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [CLAUDE.md](../../CLAUDE.md)

## Open questions

- Faut-il une convention de branche (feature/, fix/, etc.) ?
- Le corps du commit doit-il être obligatoire pour les `feat` ?
- Comment gérer les commits mixtes code + doc quand c'est justifié ?

## TODO

- [ ] Valider ce format avec le responsable du projet.
- [ ] Tester sur une vraie session et noter les cas non couverts.
- [ ] Aligner avec les exemples de commits dans CLAUDE.md si des divergences
  apparaissent.
