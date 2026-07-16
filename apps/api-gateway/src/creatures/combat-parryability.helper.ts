// apps/api-gateway/src/creatures/combat-parryability.helper.ts
//
// Helper PUR (aucune I/O, aucune dépendance Nest) — parabilité d'une attaque.
// Décide si une attaque PEUT être parée d'après sa **seule nature défensive**
// (`attackDefenseKind`), INDÉPENDAMMENT de la portée (melee/ranged), du type de
// mitigation (`damageType`) et de la capacité du défenseur.
//
// Contrat (docs/08_Gameplay/combat-resolution.md §11.7) :
//   - `attackDefenseKind: physical` → parable, **même si `damageType: raw`** ;
//   - `attackDefenseKind: magic`    → non parable (sort pur) ;
//   - `attackDefenseKind` absent/null → `physical` par défaut → parable ;
//   - la portée ne change JAMAIS la parabilité.
//
// `damageType` (`physical`/`raw`) est une règle de MITIGATION, PAS une nature
// défensive : `raw` ignore armure/résistances/blocage QUAND l'attaque touche,
// mais n'empêche NI la parade NI l'esquive. Il n'entre donc pas dans ce helper.
//
// Ce helper ne décide PAS si le défenseur pare : il ne renseigne que la
// parabilité de l'ATTAQUE. La décision finale reste
// `defender.canParry = defenderPeutParer && isAttackParryable(...)`, calculée par
// l'appelant.

import { DamageType } from './combat-damage.calculator';
import { SkillAttackDefenseKind } from '../active-skills/active-skills.constants';

export interface AttackParryabilityInput {
  /**
   * Nature défensive de l'attaque — **seul critère de parabilité**. `undefined`
   * → traité comme `physical` (rétrocompatibilité : auto-attaques et anciennes
   * données sans le champ).
   */
  attackDefenseKind?: SkillAttackDefenseKind | null;
  /**
   * Type de mitigation (`physical`/`raw`). Conservé pour compatibilité d'appel
   * mais **volontairement ignoré** ici : `raw` n'empêche pas la parade. La
   * mitigation `raw` (ignore armure/blocage) est gérée par le calculateur au
   * moment de l'impact, pas par la parabilité.
   */
  damageType?: DamageType | null;
}

/**
 * `true` si l'attaque est parable, d'après sa **seule nature défensive** :
 *   - `magic` (sort pur) → **false** (non parable, futur pipeline résistances) ;
 *   - `physical` (ou absent/null → défaut physical) → **true**, **quel que soit
 *     `damageType`** (`physical` comme `raw`).
 *
 * La portée (melee/ranged) et `damageType` ne sont PAS des critères : « ranged »
 * ni « raw » ne signifient jamais « non parable » — seule la nature décide.
 */
export function isAttackParryable(input: AttackParryabilityInput): boolean {
  const defenseKind = input.attackDefenseKind ?? 'physical';
  return defenseKind !== 'magic';
}
