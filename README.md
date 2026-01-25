# 🎮 MMORPG Project

## 📋 Table des matières

- [Stack Technique](#-stack-technique)
- [Prérequis](#-prérequis)
- [Architecture du Projet](#-architecture-du-projet)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Commandes de Développement](#-commandes-de-développement)
- [Documentation API](#-documentation-api)

## 🛠️ Stack Technique

### Backend

- **Node.js** - Runtime JavaScript
- **NestJS** - Framework backend progressif
- **Express** - Serveur HTTP
- **Socket.io** - Communication WebSocket temps réel
- **Prisma** - ORM pour PostgreSQL
- **Passport** - Authentification
- **JWT** - Gestion des tokens

### Frontend

- **React 18** - Bibliothèque UI
- **Vite** - Build tool et dev server
- **Three.js** - Rendu 3D
- **PixiJS** - Alternative 2D performante
- **Zustand** - Gestion d'état
- **React Query** - Data fetching et cache
- **Socket.io-client** - WebSocket client

### Base de Données & Cache

- **PostgreSQL** - Base de données principale
- **Redis** - Cache et sessions
- **RabbitMQ** - Message broker

### DevOps & Tools

- **Docker** - Conteneurisation
- **Docker Compose** - Orchestration locale
- **Swagger/OpenAPI** - Documentation API
- **Postman** - Tests API
- **Faker.js** - Génération de données de test
- **Jest** - Tests unitaires
- **Supertest** - Tests d'intégration API
- **Playwright** - Tests end-to-end

## 📦 Prérequis

- Node.js >= 18.x
- Docker >= 20.x
- Docker Compose >= 2.x
- npm >= 9.x ou pnpm >= 8.x

## 🏗️ Architecture du Projet

```
mmorpg-project/
│
├── apps/
│   ├── client/                  # Application React + Vite
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── services/
│   │   │   ├── hooks/
│   │   │   └── utils/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.js
│   │
│   ├── api-gateway/             # Gateway principal NestJS
│   │   ├── src/
│   │   │   ├── auth/            - gestion Passport + JWT
│   │   │   ├── gateway/         - contrôleurs principaux (routes REST, WebSocket)
│   │   │   └── common/          - utils, guards, interceptors
│   │   ├── package.json
│   │   └── nest-cli.json
│   │
│   ├── game-server/             # Serveur de jeu NestJS
│   │   ├── src/
│   │   │   ├── player/
│   │   │   ├── world/
│   │   │   ├── combat/
│   │   │   └── websocket/
│   │   └── package.json
│   │
│   ├── auth-service/            # Service d'authentification
│   │   ├── src/
│   │   │   ├── users/
│   │   │   ├── jwt/
│   │   │   └── strategies/
│   │   └── package.json
│   │
│   └── economy-service/         # Service économie/marketplace
│       ├── src/
│       │   ├── inventory/
│       │   ├── marketplace/
│       │   └── trading/
│       └── package.json
│
├── packages/
│   ├── shared/                  # Code partagé entre services
│   │   ├── constants/
│   │   ├── interfaces/
│   │   └── utils/
│   │
│   ├── game-engine/             # Logique métier du jeu
│   │   ├── entities/
│   │   ├── mechanics/
│   │   └── calculations/
│   │
│   └── database/                # Schemas Prisma
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       └── seed.js
│
├── docker/
│   ├── docker-compose.yml       # Configuration développement
│   ├── docker-compose.prod.yml  # Configuration production
│   ├── postgres/
│   ├── redis/
│   └── rabbitmq/
│
├── docs/
│   ├── swagger/                 # Documentation Swagger
│   ├── postman/                 # Collections Postman
│   └── architecture/            # Diagrammes et specs
│
├── scripts/
│   ├── init-db.sh
│   ├── seed-data.js
│   └── generate-fake-users.js
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## 🚀 Installation

### 1. Cloner le projet

```bash
git clone https://github.com/mihaielectron/mmorpg-project.git
cd mmorpg-project
```

### 2. Installer les dépendances

```bash
# Installation globale (si monorepo)
npm install

# Ou installation par service
cd apps/client && npm install
cd apps/api-gateway && npm install
cd apps/game-server && npm install
cd apps/auth-service && npm install
cd apps/economy-service && npm install
```

### 3. Initialiser l'environnement Docker

```bash
# Démarrer tous les services (PostgreSQL, Redis, RabbitMQ)
cd docker
docker compose up -d

# Vérifier que les services sont actifs
docker-compose ps
```

### 4. Configuration de la base de données

```bash
# Copier le fichier d'environnement
cp .env.example .env

# Générer le client Prisma
cd packages/database
npx prisma generate

# Exécuter les migrations
npx prisma migrate dev --name init

# Seed la base avec des données de test (utilise Faker)
npm run seed
```

## ⚙️ Configuration

### Variables d'environnement (.env)

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/mmorpgdb"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRATION=3600

# API
API_PORT=3000
GATEWAY_PORT=3001
GAME_SERVER_PORT=3002
AUTH_SERVICE_PORT=3003
ECONOMY_SERVICE_PORT=3004

# Client
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3002
```

## 🎯 Commandes de Développement

### Docker Services

```bash
# Démarrer tous les services
docker compose up -d

# Arrêter tous les services
docker compose down

# Voir les logs
docker compose logs -f

# Redémarrer un service spécifique
docker compose restart postgres
```

### Backend Services

#### API Gateway (NestJS)

```bash
cd apps/api-gateway

# Créer un nouveau projet NestJS
npx @nestjs/cli new api-gateway

# Installer Socket.io ?
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io

# Démarrer en mode dev
npm run start:dev

# Build pour production
npm run build

# Lancer les tests
npm run test
```

#### Auth Service (NestJS)

````bash
cd apps/auth-service

# Créer le projet
npx @nestjs/cli new auth-service

# Installer les dépendances d'authentification
npm install @nestjs/jwt @nestjs/passport passport passport-local passport-jwt bcrypt


#### Economy Service (NestJS)

```bash
cd apps/economy-service

# Créer le projet
npx @nestjs/cli new economy-service

# Installer Redis
npm install @nestjs/cache-manager cache-manager cache-manager-redis-store

# Démarrer
npm run start:dev
````

### Frontend (React + Vite)

```bash
cd apps/client

# Créer le projet React avec Vite
npm create vite@latest client -- --template react

# Installer les dépendances

npm install

## Validation des DTOs

Pour activer la validation automatique des données reçues par l’API, il faut installer deux dépendances :

npm install class-validator class-transformer

# Configuration de TypeORM avec NestJS

## 1. Installation des dépendances

Installez TypeORM, le module NestJS associé et le driver de votre base de données (exemple PostgreSQL) :

npm install @nestjs/typeorm typeorm pg

# Installer Three.js pour le rendu 3D
npm install three @react-three/fiber @react-three/drei

# Alternative 2D avec PixiJS
npm install pixi.js @pixi/react

# Installer Zustand pour la gestion d'état
npm install zustand

# Installer React Query
npm install @tanstack/react-query

# Installer Socket.io client
npm install socket.io-client

# Démarrer le dev server
npm run dev

# Build pour production
npm run build

# Preview du build
npm run preview
```

### Database (Prisma)

```bash
cd packages/database

# Initialiser Prisma
npx prisma init

# Créer une migration
npx prisma migrate dev --name add_users_table

# Générer le client Prisma
npx prisma generate

# Ouvrir Prisma Studio (interface visuelle)
npx prisma studio

# Seed la base de données avec Faker
npm run seed

# Reset la base (⚠️ supprime toutes les données)
npx prisma migrate reset
```

### Tests

```bash
# Tests unitaires (Jest)
npm run test

# Tests en mode watch
npm run test:watch

# Coverage
npm run test:cov

# Tests E2E avec Playwright
cd apps/client
npx playwright install
npm run test:e2e
```

### Génération de données de test avec Faker

```bash
# Générer des utilisateurs fake
node scripts/generate-fake-users.js

# Générer des items de jeu
node scripts/generate-fake-items.js

# Générer un monde complet
node scripts/generate-world-data.js
```

## 📚 Documentation API

### Swagger

Une fois l'API Gateway lancée, accéder à :

```
http://localhost:3001/api/docs
```

### Postman

Les collections Postman sont disponibles dans `docs/postman/`

```bash
# Importer dans Postman
docs/postman/MMORPG-API.postman_collection.json
docs/postman/Environment.postman_environment.json
```

### Génération de la doc Swagger

```bash
cd apps/api-gateway

# La configuration Swagger est dans main.js
npm run start:dev

# Accéder à http://localhost:3001/api/docs
```

## 🔧 Scripts Utiles

```bash
# Générer un nouveau module NestJS
npx nest generate module users

# Générer un controller
npx nest generate controller users

# Générer un service
npx nest generate service users

# Générer une ressource complète
npx nest generate resource players
```

## 🐛 Debugging

```bash
# Logs Docker
docker-compose logs -f [service-name]

# Logs PostgreSQL
docker-compose logs -f postgres

# Se connecter à PostgreSQL
docker exec -it mmorpg-postgres psql -U postgres -d mmorpg_db

# Se connecter à Redis CLI
docker exec -it mmorpg-redis redis-cli

# Monitorer RabbitMQ
# Interface web: http://localhost:15672 (guest/guest)
```

## 📈 Monitoring

```bash
# Installer les outils de monitoring (optionnel)
npm install @nestjs/terminus

# Health check endpoint
curl http://localhost:3001/health
```

## 🚀 Déploiement

```bash
# Build tous les services
npm run build:all

# Utiliser docker-compose production
docker-compose -f docker/docker-compose.prod.yml up -d
```

## 📝 Notes Importantes

- Toujours utiliser `.env.example` comme template
- Ne jamais commit le fichier `.env`
- Utiliser Faker.js pour les données de test uniquement
- Les ports par défaut peuvent être modifiés dans `.env`
- Swagger est accessible uniquement en développement par défaut

## 🤝 Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amazing-feature`)
3. Commit les changes (`git commit -m 'Add amazing feature'`)
4. Push vers la branche (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

## 📄 License

MIT

---

**Bon développement ! 🎮**
