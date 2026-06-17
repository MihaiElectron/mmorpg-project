# MMORPG Project

MMORPG Project est un prototype de jeu en ligne 2D top-down construit autour d'un client React/Vite avec Phaser et d'une API NestJS. Le projet couvre les bases d'un MMORPG web: authentification, création de personnage, inventaire, équipement, scène de monde, ressources récoltables et communication temps réel via Socket.IO.

Le dépôt est organisé en monorepo npm avec une application frontend, une API gateway backend et un petit package partagé.

## Sommaire

- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Fonctionnalités actuelles](#fonctionnalites-actuelles)
- [Prérequis](#prerequis)
- [Installation](#installation)
- [Configuration](#configuration)
- [Démarrage local](#demarrage-local)
- [Commandes utiles](#commandes-utiles)
- [API et temps réel](#api-et-temps-reel)
- [Notes de développement](#notes-de-developpement)

## Stack technique

### Frontend

- React 19
- Vite 7
- React Router 7
- Phaser 3 pour le rendu et les interactions de la scène de jeu
- Zustand 5 pour l'état client partagé entre React et Phaser
- Socket.IO Client pour les événements temps réel
- Sass pour l'organisation des styles
- ESLint pour l'analyse statique

### Backend

- Node.js
- NestJS 11
- TypeScript
- TypeORM 0.3
- PostgreSQL
- Passport et JWT pour l'authentification
- bcrypt pour le hash des mots de passe
- Socket.IO via `@nestjs/websockets` et `@nestjs/platform-socket.io`
- Swagger/OpenAPI pour la documentation HTTP
- Jest et Supertest pour les tests backend

### Infrastructure locale

- Docker Compose
- PostgreSQL 18
- Redis 7
- RabbitMQ 3 avec interface d'administration

Redis et RabbitMQ sont disponibles dans l'environnement Docker, mais le code actuel utilise principalement PostgreSQL et Socket.IO.

## Architecture

```text
mmorpg-project/
├── apps/
│   ├── api-gateway/
│   │   ├── src/
│   │   │   ├── auth/           # Inscription, connexion, JWT, guards
│   │   │   ├── characters/     # Personnages, équipement, inventaire lié
│   │   │   ├── common/         # Module commun
│   │   │   ├── inventory/      # Inventaire et équipement
│   │   │   ├── items/          # Items et seed d'items
│   │   │   ├── resources/      # Ressources récoltables et gateway Socket.IO
│   │   │   ├── users/          # Entité et service utilisateur
│   │   │   └── world/          # Logique monde, loot et gateway de gathering
│   │   ├── tools/cli/          # Générateur local d'entités/modules
│   │   └── package.json
│   │
│   └── client/
│       ├── public/assets/      # Maps et assets statiques
│       ├── src/
│       │   ├── api/            # Appels API
│       │   ├── components/     # UI React
│       │   ├── layouts/        # Layout de jeu
│       │   ├── pages/          # Login, création personnage, monde
│       │   ├── phaser/         # Scènes, joueur, map, réseau, pathfinding
│       │   ├── store/          # Stores Zustand
│       │   ├── styles/         # Sass par couches
│       │   └── types/          # Types frontend
│       └── package.json
│
├── packages/
│   └── shared/                 # Package partagé minimal
│
├── docker/
│   └── docker-compose.yml      # PostgreSQL, Redis, RabbitMQ
│
├── package.json                # Workspaces npm
└── README.md
```

## Fonctionnalités actuelles

- Authentification utilisateur par JWT.
- Inscription et connexion via `/auth/register` et `/auth/login`.
- Création, lecture et suppression de personnages.
- Chargement du personnage courant via `/characters/me`.
- Inventaire personnage et équipement/déséquipement d'items.
- Client React avec routes `/`, `/create-character` et `/world`.
- Scène Phaser intégrée dans la page monde.
- Contrôle du joueur à la souris.
- Panneau d'action React synchronisé avec la scène Phaser.
- Ressources interactives et génération de loot côté serveur.
- Synchronisation temps réel par événements Socket.IO.
- Documentation Swagger générée par NestJS.

## Prérequis

- Node.js 22 recommandé, ou Node.js 20 minimum
- npm 10 recommandé
- Docker
- Docker Compose

Le dépôt contient un `package-lock.json`; npm est donc le gestionnaire de paquets attendu.

## Installation

Depuis la racine du projet:

```bash
npm install
```

Cette commande installe les dépendances des workspaces déclarés dans le `package.json` racine:

```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

## Configuration

### Docker

Créer ou adapter le fichier `.env` à la racine du projet pour Docker Compose:

```env
POSTGRES_USER=replace-with-db-user
POSTGRES_PASSWORD=replace-with-db-password
POSTGRES_DB=mmorpgdb
```

### Backend

Créer ou adapter `apps/api-gateway/.env` (voir `apps/api-gateway/.env.example`):

```env
PORT=3000
JWT_SECRET=replace-with-a-long-random-secret

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=replace-with-db-user
DB_PASSWORD=replace-with-db-password
DB_NAME=mmorpgdb
```

La connexion PostgreSQL est lue depuis ces variables d'environnement (`app.module.ts` via `ConfigService`). En développement local, elle doit rester cohérente avec le service PostgreSQL défini dans `docker/docker-compose.yml`.

Ne pas documenter de mot de passe réel dans le README. Si les identifiants changent, mettre à jour `.env` et le fichier Docker Compose de développement en conséquence.

### Frontend

Créer ou adapter `apps/client/.env`:

```env
VITE_API_URL=http://localhost:3000
```

Une partie du client appelle encore directement `http://localhost:3000`; conserver ce port pour l'API évite les écarts de configuration en développement.

## Démarrage local

### 1. Démarrer les services Docker

Depuis la racine:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Services exposés:

```text
PostgreSQL: localhost:5432
Redis:      localhost:6379
RabbitMQ:   localhost:5672
RabbitMQ UI: http://localhost:15672
```

### 2. Démarrer l'API NestJS

```bash
npm --workspace api-gateway run start:dev
```

L'API écoute par défaut sur:

```text
http://localhost:3000
```

La documentation Swagger est disponible sur:

```text
http://localhost:3000/api/docs
```

### 3. Démarrer le client Vite

Dans un autre terminal:

```bash
npm --workspace client run dev
```

Le client est disponible sur:

```text
http://localhost:5173
```

## Commandes utiles

### Racine

```bash
npm install
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml logs -f
```

### API

```bash
npm --workspace api-gateway run start:dev
npm --workspace api-gateway run build
npm --workspace api-gateway run lint
npm --workspace api-gateway run test
npm --workspace api-gateway run test:cov
npm --workspace api-gateway run make:entity
```

### Client

```bash
npm --workspace client run dev
npm --workspace client run build
npm --workspace client run lint
npm --workspace client run preview
```

## API et temps réel

### Routes HTTP principales

```text
POST   /auth/register
POST   /auth/login

POST   /characters
GET    /characters
GET    /characters/me
GET    /characters/:id
POST   /characters/:id/equip
POST   /characters/:id/unequip
DELETE /characters/:id

POST   /inventory
GET    /inventory/:characterId
POST   /inventory/:characterId/equip/:itemId
POST   /inventory/:characterId/unequip/:slot
```

Les routes `characters` et `inventory` sont protégées par JWT. Envoyer le token dans l'en-tête:

```text
Authorization: Bearer <access_token>
```

### Evénements Socket.IO présents

```text
interact_resource
resource_loot
resource_update

interact_object
open_gather_window
gather
gather_result
start_gathering
start_gathering_result
stop_gathering
stop_gathering_result
inventory_update
```

Le client Phaser ouvre une connexion Socket.IO vers `http://localhost:3000` lors de l'entrée dans le monde.

## Notes de développement

- TypeORM est configuré avec `synchronize: true`. C'est pratique en développement, mais à désactiver avant une mise en production.
- Le dépôt contient la dépendance Prisma, mais l'API actuelle utilise TypeORM pour les entités et repositories.
- Les modules `ItemsModule`, `WorldModule` et `UserModule` existent dans le code; l'application principale charge actuellement `AuthModule`, `CommonModule`, `CharactersModule`, `InventoryModule` et `ResourcesModule`.
- Le package `packages/shared` est minimal et sert de base pour partager des constantes, types ou utilitaires entre client et serveur.
- Les fichiers `.env` locaux ne doivent pas contenir de secrets de production.

## Licence

Projet privé. Aucune licence open source n'est déclarée pour le moment.
