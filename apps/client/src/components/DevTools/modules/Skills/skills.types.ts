// Types du DevTools Skill Editor (Skills V1-B).
// Miroir lecture seule du contrat backend `skill_definition` (ADR-0019 V1-A).
// Le frontend ne calcule rien : il configure et affiche.

export const SKILL_RESOURCE_TYPES = ["health", "mana", "energy"] as const;
export type SkillResourceType = (typeof SKILL_RESOURCE_TYPES)[number];

export const SKILL_TARGET_MODES = ["self", "creature"] as const;
export type SkillTargetMode = (typeof SKILL_TARGET_MODES)[number];

export const SKILL_EFFECT_TYPES = ["damage", "heal"] as const;
export type SkillEffectType = (typeof SKILL_EFFECT_TYPES)[number];

// Type de dégâts (V4-B) : physical applique armure + armorPenetrationPercent ;
// raw ignore les deux. Pertinent seulement pour effectType "damage".
export const SKILL_DAMAGE_TYPES = ["physical", "raw"] as const;
export type SkillDamageType = (typeof SKILL_DAMAGE_TYPES)[number];

// Nature défensive (V6-B5) — AXE DISTINCT de damageType. physical = parable ;
// magic = sort pur non parable (futur pipeline résistances magiques, non actif).
// Défaut physical. Ne remplace pas damageType (mitigation d'armure).
export const SKILL_ATTACK_DEFENSE_KINDS = ["physical", "magic"] as const;
export type SkillAttackDefenseKind = (typeof SKILL_ATTACK_DEFENSE_KINDS)[number];

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

// Suggestions de weaponType : désormais centralisées dans DevTools/shared
// (réutilisées par Skills et MasteryEffects). Ré-export pour compatibilité.
export { WEAPON_TYPE_SUGGESTIONS } from "../../shared/weaponTypes";

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
  /** Type de dégâts (V4-B). physical par défaut ; raw ignore armure + pénétration. */
  damageType: SkillDamageType;
  /** Nature défensive (V6-B5). physical par défaut ; magic = sort pur non parable. */
  attackDefenseKind: SkillAttackDefenseKind;
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
  damageType?: SkillDamageType;
  attackDefenseKind?: SkillAttackDefenseKind;
  scaling?: SkillScaling;
}

export type UpdateSkillDefinitionPayload = Omit<CreateSkillDefinitionPayload, "key">;

// Suggestions de clés (masteries / dérivées) chargées depuis l'admin en lecture
// seule pour l'autocomplétion des éditeurs. `{ key, label }`.
export interface KeySuggestion {
  key: string;
  label: string;
}
