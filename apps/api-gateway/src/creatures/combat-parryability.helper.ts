// apps/api-gateway/src/creatures/combat-parryability.helper.ts
//
// Helper PUR (aucune I/O, aucune dépendance Nest) — parabilité d'une attaque
// (V6-B5 Lot 2). Décide si une attaque PEUT être parée d'après sa **nature
// défensive** (`attackDefenseKind`) et son type de mitigation (`damageType`),
// INDÉPENDAMMENT de la portée (melee/ranged) et de la capacité du défenseur.
//
// Ce helper ne décide PAS si le défenseur pare : il ne renseigne que la
// parabilité de l'ATTAQUE. La décision finale reste
// `defender.canParry = defenderPeutParer && isAttackParryable(...)`, calculée par
// l'appelant. Aucun changement de comportement en V6-B5 (parade créature encore
// inactive) : le helper ne fait que restreindre `canParry` là où il était déjà
// éligible côté joueur (attaques physiques).

import { DamageType } from './combat-damage.calculator';
import { SkillAttackDefenseKind } from '../active-skills/active-skills.constants';

export interface AttackParryabilityInput {
  /**
   * Nature défensive de l'attaque. `undefined` → traité comme `physical`
   * (rétrocompatibilité : auto-attaques et anciennes données sans le champ).
   */
  attackDefenseKind?: SkillAttackDefenseKind | null;
  /**
   * Type de mitigation. `raw` (true damage) ignore la mitigation défensive, y
   * compris la parade. `undefined` → `physical`.
   */
  damageType?: DamageType | null;
}

/**
 * `true` si l'attaque est parable :
 *   - `raw` (true damage) → **false** (contourne la mitigation défensive) ;
 *   - `magic` (sort pur) → **false** (non parable, futur pipeline résistances) ;
 *   - `physical` non-raw → **true** (mêlée OU distance : la portée n'entre PAS
 *     dans la décision).
 *
 * La portée (melee/ranged) n'est volontairement PAS un paramètre : « ranged »
 * ne signifie jamais « non parable » — seule la nature défensive décide.
 */
export function isAttackParryable(input: AttackParryabilityInput): boolean {
  if (input.damageType === 'raw') return false;
  const defenseKind = input.attackDefenseKind ?? 'physical';
  return defenseKind === 'physical';
}
