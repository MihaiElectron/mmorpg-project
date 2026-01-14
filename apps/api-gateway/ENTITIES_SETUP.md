# 🎮 Configuration des Entités - MMORPG Project

## 📋 Résumé

Ce document décrit les entités, services et modules créés pour le système d'authentification, de personnages et d'équipement.

## 🗄️ Entités Créées

### 1. User (`users/entities/user.entity.ts`)
- **Champs**:
  - `id` (UUID, Primary Key)
  - `username` (unique)
  - `password` (hashé avec bcrypt)
  - `isActive` (boolean, default: true)
  - `characters` (relation OneToMany avec Character)
  - `createdAt`, `updatedAt`

### 2. Character (`characters/entities/character.entity.ts`)
- **Champs**:
  - `id` (UUID, Primary Key)
  - `name`
  - `level` (default: 1)
  - `health`, `maxHealth` (default: 100)
  - `experience` (default: 0)
  - `attack`, `defense` (stats de base)
  - `userId` (Foreign Key vers User)
  - `equipment` (relation OneToMany avec CharacterEquipment)
  - `createdAt`, `updatedAt`

### 3. CharacterEquipment (`characters/entities/character-equipment.entity.ts`)
- **Champs**:
  - `id` (UUID, Primary Key)
  - `characterId` (Foreign Key vers Character)
  - `itemId` (Foreign Key vers Item)
  - `slot` (string: 'head', 'chest', 'legs', 'weapon', 'shield', etc.)
  - `createdAt`, `updatedAt`
- **Contrainte unique**: Un personnage ne peut avoir qu'un seul item par slot

### 4. Item (mis à jour)
- **Relation ajoutée**: `characterEquipment` (OneToMany avec CharacterEquipment)

## 🔧 Modules Créés

### 1. UserModule (`users/user.module.ts`)
- Exporte `UserService` et `TypeOrmModule`
- Utilisé par `AuthModule`

### 2. CharactersModule (`characters/characters.module.ts`)
- Importe `ItemModule` pour accéder aux items
- Exporte `CharacterService`

## 🛠️ Services Créés

### 1. UserService (`users/user.service.ts`)
- `findOne(id)`: Récupère un utilisateur par ID
- `findByUsername(username)`: Récupère un utilisateur par username
- `findAll()`: Récupère tous les utilisateurs

### 2. CharacterService (`characters/character.service.ts`)
- `create(userId, dto)`: Crée un nouveau personnage
- `findAllByUser(userId)`: Récupère tous les personnages d'un utilisateur
- `findOne(id, userId)`: Récupère un personnage (vérifie la propriété)
- `equipItem(characterId, userId, dto)`: Équipe un item sur un personnage
- `unequipItem(characterId, userId, dto)`: Déséquipe un item
- `remove(id, userId)`: Supprime un personnage

## 📝 DTOs Créés

### Characters
- `CreateCharacterDto`: `{ name: string }`
- `EquipItemDto`: `{ itemId: string, slot: string }`
- `UnequipItemDto`: `{ slot: string }`

## 🔐 Routes API

### Authentification (déjà existantes)
- `POST /auth/register` - Inscription
- `POST /auth/login` - Connexion

### Personnages (nouvelles routes, protégées par JWT)
- `POST /characters` - Créer un personnage
- `GET /characters` - Lister tous les personnages de l'utilisateur
- `GET /characters/:id` - Récupérer un personnage
- `POST /characters/:id/equip` - Équiper un item
- `POST /characters/:id/unequip` - Déséquiper un item
- `DELETE /characters/:id` - Supprimer un personnage

## 🔄 Migrations TypeORM

Avec `synchronize: true` en développement, TypeORM créera automatiquement les tables.

**⚠️ Pour la production**, il faut :
1. Désactiver `synchronize: false` dans `app.module.ts`
2. Créer des migrations avec :
   ```bash
   npm run typeorm migration:generate -- -n InitialSchema
   npm run typeorm migration:run
   ```

## 🧪 Tests

### Exemple d'utilisation

#### 1. Inscription
```bash
POST /auth/register
{
  "username": "player1",
  "password": "password123"
}
```

#### 2. Connexion
```bash
POST /auth/login
{
  "username": "player1",
  "password": "password123"
}
# Retourne: { "access_token": "..." }
```

#### 3. Créer un personnage
```bash
POST /characters
Authorization: Bearer <token>
{
  "name": "Warrior"
}
```

#### 4. Équiper un item
```bash
POST /characters/:characterId/equip
Authorization: Bearer <token>
{
  "itemId": "<item-uuid>",
  "slot": "weapon"
}
```

#### 5. Déséquiper un item
```bash
POST /characters/:characterId/unequip
Authorization: Bearer <token>
{
  "slot": "weapon"
}
```

## 🔒 Sécurité

- ✅ Mots de passe hashés avec bcrypt (10 rounds)
- ✅ Authentification JWT avec expiration (1h)
- ✅ Vérification de propriété pour les personnages
- ✅ Validation des DTOs avec class-validator
- ✅ Transactions pour les opérations d'équipement

## 📊 Relations de Base de Données

```
User (1) ──< (N) Character
Character (1) ──< (N) CharacterEquipment
Item (1) ──< (N) CharacterEquipment
```

## 🚀 Prochaines Étapes

1. Créer des migrations TypeORM pour la production
2. Ajouter des tests unitaires et d'intégration
3. Implémenter un système d'inventaire
4. Ajouter des validations métier supplémentaires
5. Implémenter le calcul des stats totales (base + équipement)

