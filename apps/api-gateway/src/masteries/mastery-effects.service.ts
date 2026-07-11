import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MasteryDefinition } from './entities/mastery-definition.entity';
import { MasteriesService } from './masteries.service';
import {
  CombatMasteryContext,
  CombatMasteryEffectsResult,
  computeCombatMasteryEffects,
  MasteryEffectsDefinitionLike,
} from './mastery-effects.calculator';

/**
 * MasteryEffectsService (Masteries V1-D-A) — point d'entrée serveur UNIQUE
 * pour les effets contextuels de maîtrises. Le calcul lui-même est délégué au
 * calculateur pur `computeCombatMasteryEffects` ; ce service ne fait que
 * charger les données.
 *
 * NON BRANCHÉ au gameplay en V1-D-A : l'API est prête pour le branchement
 * combat (V1-D-B) mais aucun chemin ne l'appelle encore.
 *
 * Pas de cache des définitions dans cette phase : aucun appelant n'existe,
 * donc aucune pression de lecture. Quand V1-D-B branchera l'auto-attaque
 * (1 appel par hit), ajouter un cache mémoire invalidé sur CRUD, sur le
 * modèle exact de `DerivedStatsService.getDefinitions()`/`invalidateCache()`.
 */
@Injectable()
export class MasteryEffectsService {
  constructor(
    @InjectRepository(MasteryDefinition)
    private readonly masteryDefinitionRepo: Repository<MasteryDefinition>,
    private readonly masteriesService: MasteriesService,
  ) {}

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
      this.masteryDefinitionRepo.find({ where: { enabled: true } }),
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
