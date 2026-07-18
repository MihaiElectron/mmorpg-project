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

/** Ressource de coût. Toutes consommées au cast par SkillCastService (V1-J-B). */
export const SKILL_RESOURCE_TYPES = ['health', 'mana', 'energy'] as const;
export type SkillResourceType = (typeof SKILL_RESOURCE_TYPES)[number];

/**
 * `true` si le type de ressource est supporté au cast (Skills V1-J-B) :
 * `null` (aucun coût) ou l'un des `SKILL_RESOURCE_TYPES`. Seul un type hors de
 * cette liste (donnée DB corrompue — impossible via l'enum en temps normal)
 * reste non supporté (`unsupported_resource`). Ne vérifie PAS la quantité
 * courante : le manque de ressource est refusé au cast, pas ici.
 */
export function isSupportedResourceType(resourceType: string | null | undefined): boolean {
  if (resourceType == null) return true;
  return (SKILL_RESOURCE_TYPES as readonly string[]).includes(resourceType);
}

/** Ciblage V1-A : soi-même ou une créature. Pas de joueur/allié/zone. */
export const SKILL_TARGET_MODES = ['self', 'creature'] as const;
export type SkillTargetMode = (typeof SKILL_TARGET_MODES)[number];

/** Effet instantané V1 : dégâts ou soin. Pas de buff/debuff/contrôle. */
export const SKILL_EFFECT_TYPES = ['damage', 'heal'] as const;
export type SkillEffectType = (typeof SKILL_EFFECT_TYPES)[number];

/**
 * Type de dégâts d'un skill (V4-B). Miroir de `DamageType`
 * (`combat-damage.calculator`) : `physical` applique armure +
 * `armorPenetrationPercent`, `raw` ignore les deux. Défaut `physical`.
 * Pertinent seulement pour `effectType: 'damage'`. Pas d'autre type en V4.
 */
export const SKILL_DAMAGE_TYPES = ['physical', 'raw'] as const;
export type SkillDamageType = (typeof SKILL_DAMAGE_TYPES)[number];

/**
 * Nature défensive d'une attaque (V6-B5) — AXE INDÉPENDANT de `damageType`.
 * `damageType` (physical/raw) décrit la mitigation d'armure ; `attackDefenseKind`
 * décrit contre quel pipeline défensif l'attaque se résout, et sert de base à la
 * parabilité future (V6-B6) : `physical` = parable (mêlée ou distance),
 * `magic` = sort pur non parable (futur pipeline résistances magiques). Défaut
 * `physical` (rétrocompatible). Aucun effet combat en V6-B5 Lot 1.
 */
export const SKILL_ATTACK_DEFENSE_KINDS = ['physical', 'magic'] as const;
export type SkillAttackDefenseKind = (typeof SKILL_ATTACK_DEFENSE_KINDS)[number];

/**
 * Écoles magiques (ADR-0022 — lot fondation). Vocabulaire FERMÉ du moteur de
 * combat : aucune école générique (`magic`/`arcane`/`generic`). `null` = skill
 * sans école (physique ou raw). Persisté sur `skill_definition.magicSchool`.
 *
 * Axe DISTINCT de `damageType` (mitigation d'armure) et de `attackDefenseKind`
 * (pipeline défensif). Dans ce lot : donnée persistée et validée seulement —
 * AUCUN effet combat (résistances, mitigation par école, immunités = Planned).
 */
export const SKILL_MAGIC_SCHOOLS = [
  'fire',
  'water',
  'air',
  'earth',
  'sacred',
  'poison',
] as const;
export type MagicSchool = (typeof SKILL_MAGIC_SCHOOLS)[number];

/** `true` si `value` est l'une des six écoles autorisées (jamais pour `null`). */
export function isMagicSchoolValue(value: unknown): value is MagicSchool {
  return (
    typeof value === 'string' &&
    (SKILL_MAGIC_SCHOOLS as readonly string[]).includes(value)
  );
}

/**
 * Codes de cohérence école ↔ nature défensive (lot fondation écoles magiques).
 * `null` = cohérent. Règles génériques adossées à l'axe `attackDefenseKind`
 * existant (aucune structure multi-effets prématurée) :
 *  - une valeur d'école hors des six autorisées est invalide ;
 *  - un skill `physical` ne porte JAMAIS d'école (`magicSchool` doit être `null`) ;
 *  - un skill `magic` DOIT porter une école (`magicSchool` requis).
 *
 * Ainsi Strike (`physical`) → `null`, et Heal (`magic`) → une école (seedée
 * `sacred`). La spécificité « Heal = sacred » relève de la donnée (backfill /
 * création), pas d'un verrou par-heal — pour ne pas interdire de futurs soins
 * d'une autre école. Le modèle hybride (physique + composante magique) reste
 * `Planned` : ces règles n'y font pas obstacle (un seul axe défensif aujourd'hui).
 */
export type MagicSchoolCoherenceCode =
  | 'magic_school_invalid'
  | 'magic_school_forbidden_for_physical'
  | 'magic_school_required_for_magic';

export function checkMagicSchoolCoherence(
  attackDefenseKind: SkillAttackDefenseKind,
  magicSchool: MagicSchool | null,
): MagicSchoolCoherenceCode | null {
  if (magicSchool !== null && !isMagicSchoolValue(magicSchool)) {
    return 'magic_school_invalid';
  }
  if (attackDefenseKind === 'physical' && magicSchool !== null) {
    return 'magic_school_forbidden_for_physical';
  }
  if (attackDefenseKind === 'magic' && magicSchool === null) {
    return 'magic_school_required_for_magic';
  }
  return null;
}

/**
 * Skills CANONIQUES verrouillés sur une configuration défensive/école précise
 * (identifiés par leur clé stable, jamais par leur libellé). Verrou ciblé — il
 * ne s'applique PAS à tous les soins ni à tous les skills magiques : de futurs
 * soins d'une autre école utiliseront d'autres clés.
 *
 *  - `heal` : soin sacré canonique → `magic` + `sacred`.
 */
export const CANONICAL_SKILL_COHERENCE: Readonly<
  Record<string, { attackDefenseKind: SkillAttackDefenseKind; magicSchool: MagicSchool }>
> = {
  heal: { attackDefenseKind: 'magic', magicSchool: 'sacred' },
};

export type CanonicalSkillCoherenceCode =
  | 'canonical_skill_attack_defense_kind_mismatch'
  | 'canonical_skill_magic_school_mismatch';

/**
 * Vérifie le verrou canonique d'un skill (par clé stable) sur l'état FINAL.
 * `null` si la clé n'est pas canonique ou si la configuration correspond au
 * contrat figé. Complète (ne remplace pas) `checkMagicSchoolCoherence`.
 */
export function checkCanonicalSkillCoherence(
  key: string,
  attackDefenseKind: SkillAttackDefenseKind,
  magicSchool: MagicSchool | null,
): CanonicalSkillCoherenceCode | null {
  const canonical = CANONICAL_SKILL_COHERENCE[key];
  if (!canonical) return null;
  if (attackDefenseKind !== canonical.attackDefenseKind) {
    return 'canonical_skill_attack_defense_kind_mismatch';
  }
  if (magicSchool !== canonical.magicSchool) {
    return 'canonical_skill_magic_school_mismatch';
  }
  return null;
}

/**
 * Nature du skill (V1-H). Le modèle de déverrouillage est kind-agnostique, mais
 * seuls les `active` sont lançables (`skill:cast`, /active-skills) :
 *   - active  : déclenché volontairement par le joueur ;
 *   - passive : effet permanent/conditionnel une fois débloqué (non implémenté V1) ;
 *   - aura    : effet passif projeté (non implémenté V1).
 * `passive`/`aura` sont persistables et déverrouillables dès maintenant, mais
 * jamais castables ni renvoyés par /characters/me/active-skills en V1-H.
 */
export const SKILL_KINDS = ['active', 'passive', 'aura'] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];

/** Origines possibles d'un déverrouillage (`player_skill_unlock.source`). */
export const SKILL_UNLOCK_SOURCES = ['admin', 'level', 'quest', 'item', 'trainer', 'debug'] as const;
export type SkillUnlockSource = (typeof SKILL_UNLOCK_SOURCES)[number];

/** Clé stable : minuscules, chiffres et underscore uniquement. */
export const SKILL_KEY_PATTERN = /^[a-z0-9_]+$/;

/**
 * Barre d'action persistante (Skills V1-I). Nombre de slots par personnage.
 * `slotIndex` valide : 0 .. ACTION_BAR_SLOT_COUNT - 1. Source unique — aligné
 * sur `MAX_SLOTS`/`HOTKEYS` du frontend (A,Z,E,R,Q,S,D,F).
 */
export const ACTION_BAR_SLOT_COUNT = 8;

/** `true` si `slotIndex` est un entier dans les bornes de la barre. */
export function isValidActionBarSlotIndex(slotIndex: number): boolean {
  return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < ACTION_BAR_SLOT_COUNT;
}

/**
 * Raison d'indisponibilité d'un slot de barre d'action (Skills V1-I).
 * `null` = disponible ; `empty` = slot vide.
 */
export const ACTION_BAR_UNAVAILABLE_REASONS = [
  'empty',
  'disabled',
  'non_active',
  'locked',
  'level_required',
  'mastery_required',
  'unsupported_resource',
  'unsupported_target',
  'unknown',
] as const;
export type ActionBarUnavailableReason = (typeof ACTION_BAR_UNAVAILABLE_REASONS)[number];
