import { CraftingStationTemplate } from '../entities/crafting-station-template.entity';
import { CraftingStation } from '../entities/crafting-station.entity';

export type CraftingStationCapability = 'crafting_station' | 'placement' | 'validation';

const CAPABILITIES: readonly CraftingStationCapability[] = Object.freeze([
  'crafting_station',
  'placement',
  'validation',
]);

export interface CraftingStationTemplateWorldObject {
  readonly kind: 'definition';
  readonly category: 'crafting_station_template';
  readonly id: string;
  readonly type: string;
  readonly mapId: null;
  readonly position: null;
  readonly state: 'enabled' | 'disabled';
  readonly capabilities: readonly CraftingStationCapability[];
  readonly metadata: {
    readonly key: string;
    readonly name: string;
    readonly stationType: string;
    readonly category: string;
    readonly requiredSkillKey: string | null;
    readonly interactionRadiusWU: number;
    readonly textureKey: string | null;
    readonly enabled: boolean;
  };
}

export interface CraftingStationWorldObject {
  readonly kind: 'entity';
  readonly category: 'crafting_station';
  readonly id: string;
  readonly type: string;
  readonly mapId: number;
  readonly position: { readonly worldX: number; readonly worldY: number };
  readonly state: 'enabled' | 'disabled';
  readonly capabilities: readonly CraftingStationCapability[];
  readonly metadata: {
    readonly templateId: string;
    readonly templateKey: string;
    readonly name: string;
    readonly stationType: string;
    readonly templateCategory: string;
    readonly requiredSkillKey: string | null;
    readonly interactionRadiusWU: number;
    readonly textureKey: string | null;
    readonly templateEnabled: boolean;
    readonly enabled: boolean;
  };
}

export function toCraftingStationTemplateWorldObject(
  template: CraftingStationTemplate,
): CraftingStationTemplateWorldObject {
  return Object.freeze({
    kind: 'definition',
    category: 'crafting_station_template',
    id: template.id,
    type: template.key,
    mapId: null,
    position: null,
    state: template.enabled ? 'enabled' : 'disabled',
    capabilities: CAPABILITIES,
    metadata: Object.freeze({
      key: template.key,
      name: template.name,
      stationType: template.stationType,
      category: template.category,
      requiredSkillKey: template.requiredSkillKey ?? null,
      interactionRadiusWU: template.interactionRadiusWU,
      textureKey: template.textureKey ?? null,
      enabled: template.enabled,
    }),
  });
}

export function toCraftingStationWorldObject(
  station: CraftingStation,
): CraftingStationWorldObject {
  const template = station.template;
  return Object.freeze({
    kind: 'entity',
    category: 'crafting_station',
    id: station.id,
    type: template?.key ?? station.templateId,
    mapId: station.mapId,
    position: Object.freeze({ worldX: station.worldX, worldY: station.worldY }),
    state: station.enabled ? 'enabled' : 'disabled',
    capabilities: CAPABILITIES,
    metadata: Object.freeze({
      templateId: station.templateId,
      templateKey: template?.key ?? station.templateId,
      name: template?.name ?? station.templateId,
      stationType: template?.stationType ?? '',
      templateCategory: template?.category ?? '',
      requiredSkillKey: template?.requiredSkillKey ?? null,
      interactionRadiusWU: template?.interactionRadiusWU ?? 0,
      textureKey: template?.textureKey ?? null,
      templateEnabled: template?.enabled ?? false,
      enabled: station.enabled,
    }),
  });
}
