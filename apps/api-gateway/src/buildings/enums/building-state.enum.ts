export enum BuildingState {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
  LOCKED = 'LOCKED',
  UNDER_CONSTRUCTION = 'UNDER_CONSTRUCTION',
  DESTROYED = 'DESTROYED',
}

export const BUILDING_STATE_VALUES = Object.values(BuildingState);
