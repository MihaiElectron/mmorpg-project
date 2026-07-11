// Types du DevTools Skill Editor (Skills V1-B).
// Miroir lecture seule du contrat backend `skill_definition` (ADR-0019 V1-A).
// Le frontend ne calcule rien : il configure et affiche.

export const SKILL_RESOURCE_TYPES = ["health", "mana", "energy"] as const;
export type SkillResourceType = (typeof SKILL_RESOURCE_TYPES)[number];

export const SKILL_TARGET_MODES = ["self", "creature"] as const;
export type SkillTargetMode = (typeof SKILL_TARGET_MODES)[number];

export const SKILL_EFFECT_TYPES = ["damage", "heal"] as const;
export type SkillEffectType = (typeof SKILL_EFFECT_TYPES)[number];

// Nature du skill (V1-H) : seuls les `active` sont lançables ; passive/aura sont
// configurables/déverrouillables mais non implémentés en runtime.
export const SKILL_KINDS = ["active", "passive", "aura"] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];

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

// Suggestions de weaponType pour l'éditeur (datalist, saisie libre acceptée —
// le serveur valide le format [a-z0-9_]). Même liste que WEAPON_TYPES du
// module Items. TODO : partager cette liste (DevTools/shared) quand un
// troisième usage apparaîtra, et l'alimenter depuis les items existants.
export const WEAPON_TYPE_SUGGESTIONS = [
  "two_handed_sword",
  "two_handed_axe",
  "bow",
  "crossbow",
] as const;

export interface SkillDefinitionDto {
  id: string;
  key: string;
  name: string;
  description: string;
  iconAssetPath: string | null;
  enabled: boolean;
  skillKind: SkillKind;
  autoUnlock: boolean;
  requiredLevel: number;
  requiredClass: string | null;
  requiredMasteries: Record<string, number>;
  /**
   * Lien explicite skill → arme (Masteries V1-D-Skills). null = skill non lié
   * à une arme : aucun bonus de maîtrise d'arme. N'impose pas l'arme au cast.
   */
  weaponType: string | null;
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
  skillKind?: SkillKind;
  autoUnlock?: boolean;
  requiredLevel?: number;
  requiredClass?: string | null;
  requiredMasteries?: Record<string, number>;
  weaponType?: string | null;
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
