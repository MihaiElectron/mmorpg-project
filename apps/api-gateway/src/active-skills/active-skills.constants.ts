/**
 * Constantes du catalogue Skills actifs V1-A (ADR-0019).
 *
 * Aucune donnée de gameplay imposée ici : le catalogue `skill_definition`
 * démarre vide. Ces constantes ne servent qu'à la validation des enums et à la
 * cohérence des types entre entité, DTO et service.
 *
 * Ne pas confondre avec les masteries (`mastery_definition`) : les Skills sont
 * un domaine distinct (action active), jamais adossé au catalogue de masteries.
 */

/** Ressource de coût (préparée V1 — mana/energy non exécutables tant qu'absents). */
export const SKILL_RESOURCE_TYPES = ['health', 'mana', 'energy'] as const;
export type SkillResourceType = (typeof SKILL_RESOURCE_TYPES)[number];

/** Ciblage V1-A : soi-même ou une créature. Pas de joueur/allié/zone. */
export const SKILL_TARGET_MODES = ['self', 'creature'] as const;
export type SkillTargetMode = (typeof SKILL_TARGET_MODES)[number];

/** Effet instantané V1 : dégâts ou soin. Pas de buff/debuff/contrôle. */
export const SKILL_EFFECT_TYPES = ['damage', 'heal'] as const;
export type SkillEffectType = (typeof SKILL_EFFECT_TYPES)[number];

/** Clé stable : minuscules, chiffres et underscore uniquement. */
export const SKILL_KEY_PATTERN = /^[a-z0-9_]+$/;
