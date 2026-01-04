/**
 * EquipmentSlot Enum
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Définit l’ensemble des emplacements d’équipement possibles pour un personnage.
 * - Utilisé dans :
 *   - EquipItemDto (validation)
 *   - CharacterEquipment entity (stockage DB)
 *   - Logique métier (vérification compatibilité item/slot)
 *
 * Emplacement :
 * mmorpg-project/apps/api-gateway/src/characters/enums/equipment-slot.enum.ts
 *
 * Remarques :
 * - Les noms sont en anglais pour respecter les conventions des RPG/MMO.
 * - Chaque valeur correspond à un slot unique dans l’UI et dans la base.
 * -----------------------------------------------------------------------------
 */

export enum EquipmentSlot {
    LEFT_EARRING = 'LEFT_EARRING',
    RIGHT_EARRING = 'RIGHT_EARRING',
    HEADGEAR = 'HEADGEAR',
    RANGED_WEAPON = 'RANGED_WEAPON',
    NECKLACE = 'NECKLACE',
    CHEST_ARMOR = 'CHEST_ARMOR',
    LEFT_BRACELET = 'LEFT_BRACELET',
    MAIN_WEAPON = 'MAIN_WEAPON',
    OFF_HAND = 'OFF_HAND',
    GLOVES = 'GLOVES',
    RIGHT_BRACELET = 'RIGHT_BRACELET',
    LEG_ARMOR = 'LEG_ARMOR',
    LEFT_RING = 'LEFT_RING',
    RIGHT_RING = 'RIGHT_RING',
    BOOTS = 'BOOTS',
    BAG = 'BAG',
  }
  