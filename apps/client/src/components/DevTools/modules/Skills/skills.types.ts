// Types du DevTools Skill Editor (Skills V1-B).
// Miroir lecture seule du contrat backend `skill_definition` (ADR-0019 V1-A).
// Le frontend ne calcule rien : il configure et affiche.

export const SKILL_RESOURCE_TYPES = ["health", "mana", "energy"] as const;
export type SkillResourceType = (typeof SKILL_RESOURCE_TYPES)[number];

export const SKILL_TARGET_MODES = ["self", "creature"] as const;
export type SkillTargetMode = (typeof SKILL_TARGET_MODES)[number];

export const SKILL_EFFECT_TYPES = ["damage", "heal"] as const;
export type SkillEffectType = (typeof SKILL_EFFECT_TYPES)[number];

// Les 10 stats primaires V1 (ADR-0018 §3) — catalogue de suggestions pour
// scaling.primaryCoefficients. Source de vérité serveur ; listées ici seulement
// pour l'autocomplétion de l'éditeur.
export const PRIMARY_STAT_KEYS = [
  "strength",
  "vitality",
  "endurance",
  "agility",
  "dexterity",
  "intelligence",
  "wisdom",
  "spirit",
  "willpower",
  "charisma",
] as const;

export interface SkillScaling {
  primaryCoefficients?: Record<string, number>;
  derivedCoefficients?: Record<string, number>;
  masteryCoefficients?: Record<string, number>;
}

export interface SkillDefinitionDto {
  id: string;
  key: string;
  name: string;
  description: string;
  iconAssetPath: string | null;
  enabled: boolean;
  requiredLevel: number;
  requiredClass: string | null;
  requiredMasteries: Record<string, number>;
  resourceType: SkillResourceType | null;
  resourceCost: number;
  cooldownMs: number;
  castTimeMs: number;
  rangeWU: number;
  radiusWU: number;
  targetMode: SkillTargetMode;
  effectType: SkillEffectType;
  scaling: SkillScaling;
  createdAt: string;
  updatedAt: string;
}

// Payloads envoyés au backend. `key` uniquement à la création (immuable ensuite).
export interface CreateSkillDefinitionPayload {
  key: string;
  name: string;
  description?: string;
  iconAssetPath?: string | null;
  enabled?: boolean;
  requiredLevel?: number;
  requiredClass?: string | null;
  requiredMasteries?: Record<string, number>;
  resourceType?: SkillResourceType | null;
  resourceCost?: number;
  cooldownMs?: number;
  castTimeMs?: number;
  rangeWU?: number;
  radiusWU?: number;
  targetMode?: SkillTargetMode;
  effectType?: SkillEffectType;
  scaling?: SkillScaling;
}

export type UpdateSkillDefinitionPayload = Omit<CreateSkillDefinitionPayload, "key">;

// Suggestions de clés (masteries / dérivées) chargées depuis l'admin en lecture
// seule pour l'autocomplétion des éditeurs. `{ key, label }`.
export interface KeySuggestion {
  key: string;
  label: string;
}
