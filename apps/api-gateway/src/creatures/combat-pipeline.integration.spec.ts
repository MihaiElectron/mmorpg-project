/**
 * Tests d'INTÉGRATION combat (service-level, sans serveur HTTP/e2e).
 * ---------------------------------------------------------------------------
 * Sécurise la chaîne RÉELLE de valeur, de la stat principale aux dégâts finaux :
 *
 *   stats principales (Character.base*)
 *     → CharacterStatsCalculator.compute (stats dérivées, dont armorPenetrationPercent)
 *     → aggregateMasteryStatModifiers + buildMasteryEffectTargets (Mastery Effects permanents)
 *     → calculateCombatDamage (DamageType physical/raw, armure + pénétration)
 *     → dégâts finaux
 *
 * Ce sont EXACTEMENT les fonctions pures composées par les hooks de combat réels
 * (`CreaturesService.attack` pour l'auto-attaque, `SkillCastService` +
 * `CreaturesService.applySkillDamage` pour les skills) — aucun pipeline
 * parallèle inventé. Les défauts de stats dérivées proviennent de la source de
 * vérité `DEFAULT_DERIVED_STAT_DEFINITIONS`. La défense de la créature est
 * fournie en entrée (valeur `derived.defenseTotal` côté service, ici un nombre).
 */
import { CharacterStatsCalculator } from '../characters/character-stats-calculator';
import { DEFAULT_DERIVED_STAT_DEFINITIONS } from '../derived-stats/derived-stats.constants';
import {
  buildMasteryEffectTargets,
  CONTEXTUAL_MASTERY_EFFECT_STATS,
} from '../masteries/mastery-effect-targets';
import {
  aggregateMasteryStatModifiers,
  MasteryEffectsDefinitionLike,
} from '../masteries/mastery-effects.calculator';
import { calculateCombatDamage, DamageType } from './combat-damage.calculator';
import { Character } from '../characters/entities/character.entity';

// Targets réels construits depuis les DerivedStatDefinition (V3-B).
const TARGETS = buildMasteryEffectTargets(DEFAULT_DERIVED_STAT_DEFINITIONS);

/** Personnage minimal : `attack` brut pilote physicalAttack (strength 0). */
function makeCharacter(attack: number): Character {
  return { attack, defense: 0, maxHealth: 100 } as Character;
}

/** Maîtrise portant un unique modifier permanent sur une stat cible. */
function masteryWith(
  stat: string,
  mode: 'percentPerLevel' | 'flatPerLevel',
  value: number,
  key = 'test_mastery',
  enabled = true,
): MasteryEffectsDefinitionLike {
  return { key, enabled, effects: { modifiers: [{ stat, mode, value }] } };
}

/**
 * Exécute le pipeline réel et renvoie les dérivées + le résultat de dégâts.
 * `attack` = physicalAttack visé (strength 0 → physicalAttack = attack).
 */
function resolve(opts: {
  attack: number;
  targetArmor: number;
  masteryDefs?: MasteryEffectsDefinitionLike[];
  masteryLevels?: Record<string, number>;
  damageType?: DamageType;
  minimumDamage?: number;
}) {
  const modifiers = aggregateMasteryStatModifiers(
    opts.masteryDefs ?? [],
    opts.masteryLevels ?? {},
    TARGETS,
  );
  const stats = CharacterStatsCalculator.compute(
    makeCharacter(opts.attack),
    DEFAULT_DERIVED_STAT_DEFINITIONS,
    undefined,
    modifiers,
  );
  const result = calculateCombatDamage({
    attackerValue: stats.derived.physicalAttack,
    targetDefense: opts.targetArmor,
    armorPenetrationPercent: stats.derived.armorPenetrationPercent,
    damageType: opts.damageType ?? 'physical',
    minimumAttack: 0,
    minimumDamage: opts.minimumDamage ?? 0,
    hpBefore: 1000,
  });
  return { stats, result };
}

describe('Combat pipeline (integration) — physical / armorPenetrationPercent / raw', () => {
  it('physicalAttack dérivé = attack brut quand strength = 0', () => {
    const { stats } = resolve({ attack: 100, targetArmor: 0 });
    expect(stats.derived.physicalAttack).toBe(100);
    expect(stats.derived.armorPenetrationPercent).toBe(0);
  });

  // ── Calcul physique (chiffres simples) ────────────────────────────────────
  it('A. sans armure ni pénétration → dégâts = attaque (100)', () => {
    const { result } = resolve({ attack: 100, targetArmor: 0 });
    expect(result.effectiveArmor).toBe(0);
    expect(result.finalDamage).toBe(100);
  });

  it('B. armure 40, pénétration 0 → 60', () => {
    const { result } = resolve({ attack: 100, targetArmor: 40 });
    expect(result.effectiveArmor).toBe(40);
    expect(result.finalDamage).toBe(60);
  });

  it('C. armure 40, pénétration 50 % (mastery flat) → armure effective 20, dégâts 80', () => {
    const { stats, result } = resolve({
      attack: 100,
      targetArmor: 40,
      masteryDefs: [masteryWith('armorPenetrationPercent', 'flatPerLevel', 50)],
      masteryLevels: { test_mastery: 1 },
    });
    expect(stats.derived.armorPenetrationPercent).toBe(50);
    expect(result.effectiveArmor).toBe(20);
    expect(result.finalDamage).toBe(80);
  });

  it('D. armure 40, pénétration 100 % → armure ignorée, dégâts 100', () => {
    const { result } = resolve({
      attack: 100,
      targetArmor: 40,
      masteryDefs: [masteryWith('armorPenetrationPercent', 'flatPerLevel', 100)],
      masteryLevels: { test_mastery: 1 },
    });
    expect(result.effectiveArmor).toBe(0);
    expect(result.finalDamage).toBe(100);
  });

  it('E. armure supérieure à l’attaque → 0 dégât (minimumDamage 0), jamais négatif', () => {
    const { result } = resolve({ attack: 30, targetArmor: 100 });
    expect(result.finalDamage).toBe(0);
  });

  // ── Progression de maîtrise ───────────────────────────────────────────────
  it('mastery flatPerLevel 5, niveau 3 → +15 % armorPenetrationPercent', () => {
    const { stats } = resolve({
      attack: 100,
      targetArmor: 100,
      masteryDefs: [masteryWith('armorPenetrationPercent', 'flatPerLevel', 5)],
      masteryLevels: { test_mastery: 3 },
    });
    expect(stats.derived.armorPenetrationPercent).toBe(15);
  });

  it('niveau 0 → aucune pénétration (0 %), armure pleine', () => {
    const { stats, result } = resolve({
      attack: 100,
      targetArmor: 40,
      masteryDefs: [masteryWith('armorPenetrationPercent', 'flatPerLevel', 5)],
      masteryLevels: { test_mastery: 0 },
    });
    expect(stats.derived.armorPenetrationPercent).toBe(0);
    expect(result.finalDamage).toBe(60);
  });

  it('la pénétration dérivée > 100 est clampée à 100 par le calculateur', () => {
    const { stats, result } = resolve({
      attack: 100,
      targetArmor: 80,
      // level 5 × 100 (flat) → dérivée 500, mais calc clampe à 100 %.
      masteryDefs: [masteryWith('armorPenetrationPercent', 'flatPerLevel', 100)],
      masteryLevels: { test_mastery: 5 },
    });
    expect(stats.derived.armorPenetrationPercent).toBeGreaterThan(100);
    expect(result.armorPenetrationPercent).toBe(100);
    expect(result.effectiveArmor).toBe(0);
    expect(result.finalDamage).toBe(100);
  });

  it('une maîtrise désactivée n’applique aucune pénétration', () => {
    const { stats } = resolve({
      attack: 100,
      targetArmor: 40,
      masteryDefs: [masteryWith('armorPenetrationPercent', 'flatPerLevel', 50, 'test_mastery', false)],
      masteryLevels: { test_mastery: 3 },
    });
    expect(stats.derived.armorPenetrationPercent).toBe(0);
  });

  // ── DamageType raw ────────────────────────────────────────────────────────
  it('raw : ignore l’armure ET la pénétration (dégâts = attaque)', () => {
    const { result } = resolve({
      attack: 100,
      targetArmor: 40,
      masteryDefs: [masteryWith('armorPenetrationPercent', 'flatPerLevel', 50)],
      masteryLevels: { test_mastery: 1 },
      damageType: 'raw',
    });
    expect(result.damageType).toBe('raw');
    expect(result.effectiveArmor).toBe(0);
    expect(result.finalDamage).toBe(100);
  });

  it('raw vs physical à armure/pénétration identiques : raw ignore l’armure', () => {
    const common = {
      attack: 100,
      targetArmor: 40,
      masteryDefs: [masteryWith('armorPenetrationPercent', 'flatPerLevel', 25)],
      masteryLevels: { test_mastery: 1 },
    };
    const physical = resolve({ ...common, damageType: 'physical' });
    const raw = resolve({ ...common, damageType: 'raw' });
    // physical : armure 40 × (1 − 0.25) = 30 → 70 ; raw : 100.
    expect(physical.result.finalDamage).toBe(70);
    expect(raw.result.finalDamage).toBe(100);
  });

  // ── Pourcentage vs plat : faible armure vs tank ───────────────────────────
  it('30 % de pénétration retire plus d’armure ABSOLUE au tank qu’à la cible légère', () => {
    const PEN = [masteryWith('armorPenetrationPercent', 'flatPerLevel', 30)];
    const levels = { test_mastery: 1 };

    // Cible peu armurée : armure 10 → effective round(10 × 0.7) = 7 → 100 − 7 = 93.
    const light = resolve({ attack: 100, targetArmor: 10, masteryDefs: PEN, masteryLevels: levels });
    expect(light.stats.derived.armorPenetrationPercent).toBe(30);
    expect(light.result.effectiveArmor).toBe(7);
    expect(light.result.finalDamage).toBe(93);

    // Tank : armure 100 → effective round(100 × 0.7) = 70 → 100 − 70 = 30.
    const tank = resolve({ attack: 100, targetArmor: 100, masteryDefs: PEN, masteryLevels: levels });
    expect(tank.result.effectiveArmor).toBe(70);
    expect(tank.result.finalDamage).toBe(30);

    // Le % retire PLUS d'armure absolue au tank (70) qu'à la cible légère (3),
    // sans punir artificiellement les faibles armures (une pénétration plate,
    // elle, aurait retiré la même valeur fixe aux deux).
    const armorIgnoredLight = 10 - light.result.effectiveArmor; // 3
    const armorIgnoredTank = 100 - tank.result.effectiveArmor; // 30
    expect(armorIgnoredTank).toBeGreaterThan(armorIgnoredLight);
    expect(armorIgnoredLight).toBe(3);
    expect(armorIgnoredTank).toBe(30);
  });

  // ── Mastery Effect Targets (source réelle) ────────────────────────────────
  describe('Mastery Effect Targets', () => {
    it('armorPenetrationPercent est exposée comme target permanente (2 modes)', () => {
      const t = TARGETS.find((x) => x.key === 'armorPenetrationPercent');
      expect(t).toBeDefined();
      expect(t!.runtimeStatus).toBe('implemented');
      expect(t!.allowedModes).toEqual(['percentPerLevel', 'flatPerLevel']);
    });

    it("defensePenetration (legacy) n'est pas une target active", () => {
      expect(TARGETS.find((x) => x.key === 'defensePenetration')).toBeUndefined();
    });

    it("armorPenetrationPercent n'est pas une contextual stat (arme)", () => {
      expect(CONTEXTUAL_MASTERY_EFFECT_STATS).not.toContain('armorPenetrationPercent');
    });

    it('contextualStats reste exactement [physicalAttack]', () => {
      expect(CONTEXTUAL_MASTERY_EFFECT_STATS).toEqual(['physicalAttack']);
    });
  });

  // ── Contribution des stats principales ────────────────────────────────────
  it('strength augmente physicalAttack (coef 2) → plus de dégâts physiques', () => {
    const character = { attack: 0, defense: 0, maxHealth: 100, baseStrength: 10 } as Character;
    const stats = CharacterStatsCalculator.compute(character, DEFAULT_DERIVED_STAT_DEFINITIONS);
    // physicalAttack = attack(0) + strength(10) × 2 = 20.
    expect(stats.derived.physicalAttack).toBe(20);
    const result = calculateCombatDamage({
      attackerValue: stats.derived.physicalAttack,
      targetDefense: 5,
      armorPenetrationPercent: stats.derived.armorPenetrationPercent,
      damageType: 'physical',
      minimumAttack: 0,
      minimumDamage: 0,
      hpBefore: 1000,
    });
    expect(result.finalDamage).toBe(15); // 20 − 5
  });
});
