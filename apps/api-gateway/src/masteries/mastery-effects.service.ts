import { Injectable } from '@nestjs/common';
import { MasteriesService } from './masteries.service';
import {
  CombatMasteryContext,
  CombatMasteryEffectsResult,
  computeCombatMasteryEffects,
  MasteryEffectsDefinitionLike,
} from './mastery-effects.calculator';

/**
 * MasteryEffectsService (Masteries V1-D) — point d'entrée serveur UNIQUE
 * pour les effets contextuels de maîtrises. Le calcul lui-même est délégué au
 * calculateur pur `computeCombatMasteryEffects` ; ce service ne fait que
 * charger les données.
 *
 * Branché en V1-D-B sur l'auto-attaque (`CreaturesService.attack()`), qui
 * l'appelle à chaque hit : les définitions viennent du cache mémoire de
 * `MasteriesService.getEnabledMasteryDefinitions()` (invalidé sur CRUD),
 * seuls les niveaux du personnage sont lus en DB.
 */
@Injectable()
export class MasteryEffectsService {
  constructor(private readonly masteriesService: MasteriesService) {}

  /**
   * Bonus combat du personnage pour le contexte donné (arme équipée résolue
   * par l'APPELANT côté serveur — jamais fournie par le client).
   * Sans weaponType : court-circuit sans aucune lecture DB.
   */
  async getCombatMasteryEffects(
    characterId: string,
    context: CombatMasteryContext,
  ): Promise<CombatMasteryEffectsResult> {
    if (!context?.weaponType) return { damagePercent: 0 };

    const [definitions, masteryRows] = await Promise.all([
      this.masteriesService.getEnabledMasteryDefinitions(),
      this.masteriesService.getCharacterMasteries(characterId),
    ]);

    const masteryLevels: Record<string, number> = {};
    for (const row of masteryRows) masteryLevels[row.key] = row.level;

    return computeCombatMasteryEffects(definitions, masteryLevels, context);
  }

  /**
   * Variante sans I/O pour les chemins qui possèdent DÉJÀ les définitions et
   * les niveaux (ex: skill-cast charge `masteryLevels` à chaque cast) —
   * évite de doubler les lectures DB. Simple façade du calculateur pur.
   */
  computeCombatEffects(
    definitions: readonly MasteryEffectsDefinitionLike[],
    masteryLevels: Record<string, number>,
    context: CombatMasteryContext,
  ): CombatMasteryEffectsResult {
    return computeCombatMasteryEffects(definitions, masteryLevels, context);
  }
}
