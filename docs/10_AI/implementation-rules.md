# Implementation Rules

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-22
- Depends on: docs/10_AI/golden-rules.md, docs/10_AI/session-workflow.md, CLAUDE.md, docs/01_Architecture/client-server-boundaries.md, docs/02_Security/client-server-trust.md
- Used by: Claude Code, Codex, tout agent IA qui modifie du code sur ce projet

## Scope

Ce document définit les règles d'implémentation concrètes pour les agents IA
travaillant sur ce projet MMORPG.

Il s'applique à tout changement de code dans `apps/api-gateway/` et
`apps/client/`.

Il complète les Golden Rules en les rendant opérationnelles pour ce projet
spécifique.

---

## 1. Avant toute modification

### Lire avant d'écrire

Toujours lire le fichier concerné avant de le modifier. Ne jamais supposer
son contenu à partir du nom ou de la documentation.

Pour les fichiers de plus de 50 lignes, utiliser `Read` avec `offset` et
`limit` pour cibler les sections pertinentes.

### Chercher avant de créer

Avant de créer un nouveau service, gateway, composant ou store, chercher si
un équivalent existe :

```bash
grep -r "nomDuConcept" apps/ --include="*.ts" --include="*.tsx" --include="*.js"
find apps/ -name "*.ts" | xargs grep -l "motClé"
```

Un système existant doit être étendu avant qu'un nouveau soit créé.

### Vérifier git status

Vérifier `git status --short` avant toute modification pour ne pas écraser
des changements utilisateur en cours.

---

## 2. Limiter les diffs

### Un changement, un scope

Ne modifier que les fichiers explicitement demandés. Signaler les problèmes
adjacents sans les corriger.

### Pas de refactoring opportuniste

Ne pas profiter d'une correction de bug pour réécrire la fonction autour.
Ne pas renommer des variables existantes sauf si c'est l'objet de la tâche.
Ne pas réorganiser les imports d'un fichier non demandé.

### Préserver les changements utilisateur

Si `git status` révèle des modifications existantes dans un fichier à modifier,
les identifier et les préserver. Ne pas les écraser silencieusement.

---

## 3. Principe serveur autoritatif

### Le serveur NestJS est l'unique source de vérité

Pour tout ce qui affecte :
- La position des joueurs.
- Les dégâts et le combat.
- L'inventaire et le loot.
- Les ressources et la récolte.
- Les permissions et les rôles.
- Les scores et la progression.

Le serveur valide, calcule et persiste. Le client affiche et prédit.

### Ne jamais faire confiance aux données client

```
Règle : client.data.xxx n'est jamais une vérité de jeu.
```

Valider côté serveur :
- Chaque payload WebSocket entrant.
- Chaque payload HTTP entrant.
- Les coordonnées de position.
- Les identifiants d'entités ciblées.
- L'appartenance des ressources, personnages et inventaires.

### L'interface admin est un client comme les autres

Masquer un bouton React n'est pas une autorisation. Chaque action admin doit
être validée par NestJS avec `client.data.role === 'admin'` ou les guards
HTTP (`JwtAuthGuard + RolesGuard`).

---

## 4. Règles backend (NestJS)

### Structure de module

Chaque nouveau domaine suit le pattern :
```
domaine/
  domaine.module.ts
  domaine.service.ts
  domaine.controller.ts  (si HTTP)
  domaine.gateway.ts     (si WebSocket)
  entities/
  dto/
```

Utiliser `npm run make:entity` pour scaffolding cohérent.

### Gateways WebSocket

- Déléguer la logique métier aux services. Les gateways orchestrent et
  valident ; elles ne calculent pas.
- Vérifier l'authentification en premier dans chaque handler WebSocket.
- Retourner `{ success, message, data? }` de façon cohérente.
- Ne pas broadcast avec `server.emit` si seuls certains clients sont
  concernés.

### Services

- Les services contiennent la logique métier.
- Les calculs de position, de dégâts et de portée appartiennent aux services,
  pas aux gateways.
- Utiliser les transactions TypeORM pour les opérations multi-entités.

### DTOs et validation

- Toujours définir un DTO pour les payloads entrants.
- Utiliser `class-validator` avec décorateurs (`@IsString()`, `@IsNumber()`,
  `@IsUUID()`, etc.).
- La `ValidationPipe` globale (whitelist + forbidNonWhitelisted) est active.
  Tout champ non déclaré dans le DTO est automatiquement rejeté.
- Éviter `any`. Utiliser des types explicites ou des type guards.

### Types TypeScript

Préférer les types stricts :

```typescript
// Mauvais
function update(data: any): void

// Bien
function update(data: UpdatePlayerDto): void
```

Utiliser les enums pour les états (`AnimalState`, `UserRole`, `EquipmentSlot`).
Ne pas utiliser de string brut là où un enum existe.

### Entités TypeORM

- Les colonnes WU (`worldX`, `worldY`, `mapId`) sont la source de vérité pour
  les positions. Les colonnes pixel (`x`, `y`, `positionX`, `positionY`) sont
  un cache de rendu.
- Ne pas ajouter de colonne NOT NULL sans valeur par défaut (`{ default: x }`)
  tant que `synchronize: true` est actif.
- Utiliser les transactions pour toute opération qui modifie plusieurs entités
  liées.

---

## 5. Règles frontend (React + Phaser)

### Séparation React / Phaser

- Phaser gère le rendu du monde : sprites, tilemap, profondeur, animations,
  interactions map.
- React gère les panneaux UI : personnage, inventaire, admin, ActionPanel.
- Ne pas créer de grosse UI Phaser là où React peut l'assumer.
- Ne pas créer de logique métier React là où Phaser doit la gérer.

### Stores Zustand

Utiliser les stores existants avant d'en créer un nouveau :

| Store | Rôle |
|---|---|
| `character.store.js` | Personnage, inventaire, équipement |
| `actionPanel.store.ts` | Cible sélectionnée, actions contextuelles |
| `admin.store.ts` | Console admin, historique, position clic |

Les stores critiques partagés entre Phaser et React utilisent le pattern
singleton `window.__GLOBAL_*_STORE__`. Respecter ce pattern pour tout nouveau
store partagé.

### Socket.IO

Le socket est un singleton créé dans `WorldPage.jsx` et attaché à
`window.game.socket`. Ne pas créer de socket supplémentaire. Accéder via
`window.game?.socket` ou via la prop passée aux composants.

### Coordonnées

Ne jamais hardcoder les constantes de projection. Utiliser les formules
documentées :

```javascript
// Projection WU → pixels Phaser
screenX = Math.round(1000 + (worldX - worldY) / 16)
screenY = Math.round((worldX + worldY) / 32)

// Inverse pixels → WU
worldX = 8 * (px - 1000) + 16 * py
worldY = -8 * (px - 1000) + 16 * py
```

La fonction `resolveScreen()` dans `WorldScene.js` centralise cette logique.
L'utiliser plutôt que de recalculer localement.

### Composants React

- Ne pas créer un composant de plus de 200 lignes sans proposition de découpage.
- Signaler si un composant existant dépasse 400 lignes (dette connue :
  `AdminPanel.tsx` à 959 lignes, `ActionPanel.tsx` à 294 lignes).
- Utiliser TypeScript (`.tsx`) pour les nouveaux composants.
- Nettoyer les listeners et intervals dans les `useEffect` return.

---

## 6. Dépendances

Ne pas ajouter de dépendance npm sans validation explicite.

Avant d'ajouter une dépendance :

1. Vérifier si la fonctionnalité est déjà disponible via une dépendance
   existante.
2. Proposer la dépendance avec sa justification.
3. Attendre la validation humaine.
4. Ne jamais ajouter de dépendance dans un commit non relié à son usage.

---

## 7. Commandes de vérification

Exécuter les commandes adaptées après chaque modification :

| Type de changement | Commande obligatoire | Commande recommandée |
|---|---|---|
| Code backend | `npm --workspace api-gateway run build` | `npm --workspace api-gateway run test -- <fichier>` |
| Logique métier modifiée | `npm --workspace api-gateway run test -- <fichier>` | `npm --workspace api-gateway run test` |
| Code frontend | `npm --workspace client run build` | — |
| Erreur ESLint signalée | lint ciblé | — |

Ne pas utiliser de commande inventée. Toutes les commandes doivent exister
dans les `package.json` respectifs.

Ne jamais affirmer qu'un build ou un test passe sans l'avoir exécuté.

---

## 8. Patterns interdits

| Pattern | Raison |
|---|---|
| `any` sans justification | Perd la sécurité des types |
| Données client sans validation serveur | Exploitable |
| `server.emit` pour un sous-ensemble de clients | Performance, scalabilité |
| `setTimeout` pour état critique | Perdu au redémarrage |
| Logique métier dans une gateway | Couplage fort, non testable |
| Duplication de logique existante | Dette technique |
| `git add .` ou `git add -A` | Risque d'inclure des fichiers hors scope |
| Commit sans demande explicite | Contraire au workflow |
| Réécriture globale d'un module | Nécessite validation humaine |

---

## Non-goals

- Ce document ne définit pas l'architecture globale.
- Ce document ne remplace pas les ADRs.
- Ce document ne décrit pas le workflow de session complet.
- Ce document ne définit pas les règles de commit.

## Security notes

Le serveur NestJS est l'autorité unique pour les règles de gameplay. Toute
donnée envoyée par le client (Phaser, React, admin) est traitée comme non
fiable jusqu'à validation serveur.

Ne jamais inclure de secret, token, mot de passe ou valeur `.env` dans le code
ou la documentation.

## Performance notes

- Éviter les boucles coûteuses par tick côté serveur.
- Éviter les broadcasts inutiles : préférer une émission ciblée à `server.emit`.
- Debouncer/throttler les événements fréquents (position, tick IA).
- Envoyer des deltas plutôt que des états complets quand le volume augmente.

## Related files

- [Golden Rules](golden-rules.md)
- [Session Workflow](session-workflow.md)
- [Architecture Review](architecture-review.md)
- [Commit Policy](commit-policy.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [CLAUDE.md](../../CLAUDE.md)

## Open questions

- Quand les règles de coordonnées peuvent-elles être relaxées pour le code de
  test ?
- Comment documenter les cas où un pattern interdit est temporairement
  acceptable ?

## TODO

- [ ] Valider ces règles avec le responsable du projet.
- [ ] Ajouter des exemples de code pour les patterns les plus fréquents.
- [ ] Aligner avec l'audit project-audit.md pour les dettes connues.
