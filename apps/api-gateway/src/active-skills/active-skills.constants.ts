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
 * Type de dégâts d'un skill. Miroir de `DamageType` (`combat-damage.calculator`) :
 *  - `physical` (défaut) : applique l'armure + `armorPenetrationPercent` ;
 *  - `magic`   : ignore l'armure, applique la **résistance magique** de l'école
 *    (`magicSchool` obligatoire côté définition) — pas de pénétration magique ;
 *  - `raw`     : ignore armure ET résistance.
 * Pertinent seulement pour `effectType: 'damage'`.
 */
export const SKILL_DAMAGE_TYPES = ['physical', 'magic', 'raw'] as const;
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
 * Règle canonique du critique (serveur-autoritaire). Un critique n'est possible
 * QUE pour des DÉGÂTS PHYSIQUES explicitement marqués `canCrit`. `magic`, `raw`
 * et tout `effectType` non-`damage` (soin) ne critiquent JAMAIS — même à
 * `criticalChance` 100 %. Point UNIQUE réutilisé sur les deux directions
 * (joueur → créature et créature → joueur) et par le Studio (affichage).
 */
export function resolveEffectiveCanCrit(input: {
  effectType: string | null | undefined;
  damageType: string | null | undefined;
  canCrit: boolean | null | undefined;
}): boolean {
  return (
    (input.effectType ?? 'damage') === 'damage' &&
    (input.damageType ?? 'physical') === 'physical' &&
    input.canCrit === true
  );
}

/** Flags combat normalisés par skill (serveur-autoritaire). */
export interface NormalizedSkillCombatFlags {
  canCrit: boolean;
  attackDefenseKind: SkillAttackDefenseKind;
  canBeDodged: boolean;
  canBeBlocked: boolean;
  canBeParried: boolean;
}

/**
 * NORMALISE les flags combat d'un skill (serveur-autoritaire, jamais délégué au
 * client) pour GARANTIR les invariants gameplay, quelle que soit l'entrée :
 *  1. `canCrit` n'est conservé que pour des DÉGÂTS PHYSIQUES ; magic, raw et tout
 *     effet non-`damage` (soin) → `canCrit = false` (jamais critique) ;
 *  2. des DÉGÂTS `magic` imposent les DÉFENSES MAGIQUES : `attackDefenseKind =
 *     magic`, et **aucune défense d'évitement** — `canBeDodged = false`,
 *     `canBeBlocked = false`, `canBeParried = false` (jamais esquivé, bloqué ni
 *     paré). Les dégâts magiques ne peuvent ni être esquivés/bloqués/parés ni
 *     critiques.
 * Pour tout autre cas, les valeurs fournies (ou défauts entité) sont conservées.
 * Idempotent : re-normaliser un skill déjà cohérent ne le change pas.
 */
export function normalizeSkillCombatFlags(input: {
  effectType: string | null | undefined;
  damageType: string | null | undefined;
  attackDefenseKind: SkillAttackDefenseKind | null | undefined;
  canCrit: boolean | null | undefined;
  canBeDodged: boolean | null | undefined;
  canBeBlocked: boolean | null | undefined;
  canBeParried: boolean | null | undefined;
}): NormalizedSkillCombatFlags {
  const effectType = input.effectType ?? 'damage';
  const damageType = input.damageType ?? 'physical';
  const isPhysicalDamage = effectType === 'damage' && damageType === 'physical';
  const isMagicDamage = effectType === 'damage' && damageType === 'magic';

  return {
    // Dégâts physiques : `canCrit` OMIS (undefined) → défaut TRUE (nouveaux skills
    // physiques critiquables par défaut) ; explicite `false` conservé ; sur mise à
    // jour, `input.canCrit` est la valeur EXISTANTE (jamais undefined) → préservée.
    // Hors dégâts physiques (magic/raw/soin) → toujours false.
    canCrit: isPhysicalDamage ? (input.canCrit ?? true) : false,
    attackDefenseKind: isMagicDamage ? 'magic' : (input.attackDefenseKind ?? 'physical'),
    // Dégâts magiques : jamais esquivés/bloqués/parés (défenses forcées à false).
    canBeDodged: isMagicDamage ? false : (input.canBeDodged ?? true),
    canBeBlocked: isMagicDamage ? false : (input.canBeBlocked ?? true),
    canBeParried: isMagicDamage ? false : (input.canBeParried ?? false),
  };
}

/**
 * Résolution RUNTIME de l'esquivabilité EFFECTIVE d'un skill, serveur-autoritaire
 * dans LES DEUX directions (joueur → créature et créature → joueur). Protège même
 * une définition héritée INCOHÉRENTE (`damageType: 'magic'` + `canBeDodged: true`)
 * jamais re-normalisée : les DÉGÂTS MAGIQUES ne peuvent JAMAIS être esquivés.
 * Physical/raw : conservent le flag configuré (défaut true).
 */
export function resolveEffectiveCanBeDodged(
  damageType: string | null | undefined,
  canBeDodged: boolean | null | undefined,
): boolean {
  if ((damageType ?? 'physical') === 'magic') return false;
  return canBeDodged ?? true;
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
