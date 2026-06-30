import { BuildingType } from '../enums/building-type.enum';
import { BuildingState } from '../enums/building-state.enum';
import { Building } from '../entities/building.entity';
import { BuildingTemplate } from '../entities/building-template.entity';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BuildingCapability =
  | 'placement'
  | 'persistence'
  | 'validation'
  | 'interaction'
  | 'auction_house'
  | 'mailbox'
  | 'bank'
  | 'guild_hall'
  | 'house_door'
  | 'teleport'
  | 'dungeon_entrance'
  | 'shrine';

const BASE_CAPABILITIES: readonly BuildingCapability[] = Object.freeze([
  'placement',
  'persistence',
  'validation',
  'interaction',
]);

function typeCapability(buildingType: BuildingType): BuildingCapability | null {
  const map: Partial<Record<BuildingType, BuildingCapability>> = {
    [BuildingType.AUCTION_HOUSE]: 'auction_house',
    [BuildingType.MAILBOX]: 'mailbox',
    [BuildingType.BANK]: 'bank',
    [BuildingType.GUILD_HALL]: 'guild_hall',
    [BuildingType.HOUSE_DOOR]: 'house_door',
    [BuildingType.TELEPORT]: 'teleport',
    [BuildingType.DUNGEON_ENTRANCE]: 'dungeon_entrance',
    [BuildingType.SHRINE]: 'shrine',
  };
  return map[buildingType] ?? null;
}

// ─── WOM interfaces ───────────────────────────────────────────────────────────

export interface BuildingTemplateWorldObject {
  readonly kind: 'definition';
  readonly category: 'building';
  readonly id: string;
  readonly type: BuildingType;
  readonly mapId: null;
  readonly position: null;
  readonly state: 'enabled' | 'disabled';
  readonly capabilities: readonly BuildingCapability[];
  readonly metadata: {
    readonly key: string;
    readonly name: string;
    readonly buildingType: BuildingType;
    readonly textureKey: string | null;
    readonly interactionRadiusWU: number;
    readonly enabled: boolean;
  };
}

export interface BuildingWorldObject {
  readonly kind: 'entity';
  readonly category: 'building';
  readonly id: string;
  readonly type: BuildingType;
  readonly mapId: number;
  readonly position: { readonly worldX: number; readonly worldY: number };
  readonly state: BuildingState;
  readonly capabilities: readonly BuildingCapability[];
  readonly metadata: {
    readonly templateId: string;
    readonly templateKey: string;
    readonly name: string;
    readonly buildingType: BuildingType;
    readonly textureKey: string | null;
    readonly interactionRadiusWU: number;
    readonly templateEnabled: boolean;
  };
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

export function toBuildingTemplateWorldObject(
  template: BuildingTemplate,
): BuildingTemplateWorldObject {
  const cap = typeCapability(template.buildingType);
  const capabilities: BuildingCapability[] = [...BASE_CAPABILITIES];
  if (cap) capabilities.push(cap);

  return Object.freeze({
    kind: 'definition',
    category: 'building',
    id: template.id,
    type: template.buildingType,
    mapId: null,
    position: null,
    state: template.enabled ? 'enabled' : 'disabled',
    capabilities: Object.freeze(capabilities),
    metadata: Object.freeze({
      key: template.key,
      name: template.name,
      buildingType: template.buildingType,
      textureKey: template.textureKey ?? null,
      interactionRadiusWU: template.interactionRadiusWU,
      enabled: template.enabled,
    }),
  });
}

export function toBuildingWorldObject(building: Building): BuildingWorldObject {
  const template = building.template;
  const cap = typeCapability(template.buildingType);
  const capabilities: BuildingCapability[] = [...BASE_CAPABILITIES];
  if (cap) capabilities.push(cap);

  return Object.freeze({
    kind: 'entity',
    category: 'building',
    id: building.id,
    type: template.buildingType,
    mapId: building.mapId,
    position: Object.freeze({ worldX: building.worldX, worldY: building.worldY }),
    state: building.state,
    capabilities: Object.freeze(capabilities),
    metadata: Object.freeze({
      templateId: building.templateId,
      templateKey: template.key,
      name: template.name,
      buildingType: template.buildingType,
      textureKey: template.textureKey ?? null,
      interactionRadiusWU: template.interactionRadiusWU,
      templateEnabled: template.enabled,
    }),
  });
}
