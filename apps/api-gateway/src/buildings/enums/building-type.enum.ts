export enum BuildingType {
  AUCTION_HOUSE = 'auction_house',
  MAILBOX = 'mailbox',
  BANK = 'bank',
  GUILD_HALL = 'guild_hall',
  HOUSE_DOOR = 'house_door',
  TELEPORT = 'teleport',
  DUNGEON_ENTRANCE = 'dungeon_entrance',
  SHRINE = 'shrine',
}

/** Valeurs valides pour validation serveur. */
export const BUILDING_TYPE_VALUES = Object.values(BuildingType);
