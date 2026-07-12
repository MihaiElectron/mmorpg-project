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
function makeCharacter(attack: number, dexterity = 0): Character {
  return { attack, defense: 0, maxHealth: 100, baseDexterity: dexterity } as Character;
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
  dexterity?: number;
  defenderDodgeChancePercent?: number;
  masteryDefs?: MasteryEffectsDefinitionLike[];
  masteryLevels?: Record<string, number>;
  damageType?: DamageType;
  minimumDamage?: number;
  /** rng injecté → roll esquive/critique déterministe (défaut : ni esquive ni critique). */
  rng?: () => number;
}) {
  const modifiers = aggregateMasteryStatModifiers(
    opts.masteryDefs ?? [],
    opts.masteryLevels ?? {},
    TARGETS,
  );
  const stats = CharacterStatsCalculator.compute(
    makeCharacter(opts.attack, opts.dexterity ?? 0),
    DEFAULT_DERIVED_STAT_DEFINITIONS,
    undefined,
    modifiers,
  );
  const result = calculateCombatDamage({
    attackerValue: stats.derived.physicalAttack,
    targetDefense: opts.targetArmor,
    armorPenetrationPercent: stats.derived.armorPenetrationPercent,
    damageType: opts.damageType ?? 'physical',
    // V4-D : critique alimenté par les stats dérivées serveur (bloc attaque).
    criticalChancePercent: stats.derived.criticalChance,
    criticalDamagePercent: stats.derived.criticalDamage,
    // V4-G : précision de l'attaquant (dérivée) vs esquive du défenseur fournie.
    attackerAccuracyPercent: stats.derived.accuracy,
    defenderDodgeChancePercent: opts.defenderDodgeChancePercent ?? 0,
    rng: opts.rng ?? (() => 0.999999), // par défaut : ni esquive ni critique
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

  // ── Critique (bloc attaque) via stats dérivées ────────────────────────────
  describe('critique (V4-D)', () => {
    // Maîtrise portant criticalChance à 100 % (roll forcé) ; criticalDamage
    // reste à son défaut dérivé 150 → ×1.5.
    const critMastery = [masteryWith('criticalChance', 'flatPerLevel', 100)];
    const levels = { test_mastery: 1 };

    it('criticalChance dérivée = 100 après mastery flat, criticalDamage 150 par défaut', () => {
      const { stats } = resolve({ attack: 100, targetArmor: 40, masteryDefs: critMastery, masteryLevels: levels });
      expect(stats.derived.criticalChance).toBe(100);
      expect(stats.derived.criticalDamage).toBe(150);
    });

    it('physical critique : 100 attaque, armure 40 → 110', () => {
      const { result } = resolve({
        attack: 100,
        targetArmor: 40,
        masteryDefs: critMastery,
        masteryLevels: levels,
        rng: () => 0, // roll < 1 → critique
      });
      expect(result.isCritical).toBe(true);
      expect(result.finalDamage).toBe(110); // round(100 × 1.5) − 40
    });

    it('raw critique : 100 attaque → 150 (ignore armure)', () => {
      const { result } = resolve({
        attack: 100,
        targetArmor: 40,
        masteryDefs: critMastery,
        masteryLevels: levels,
        damageType: 'raw',
        rng: () => 0,
      });
      expect(result.isCritical).toBe(true);
      expect(result.finalDamage).toBe(150);
    });

    it('sans maîtrise critique → criticalChance 0, jamais de critique', () => {
      const { stats, result } = resolve({ attack: 100, targetArmor: 40, rng: () => 0 });
      expect(stats.derived.criticalChance).toBe(0);
      expect(result.isCritical).toBe(false);
      expect(result.finalDamage).toBe(60);
    });
  });

  // ── Précision (V4-G) : dexterity → accuracy → réduit l'esquive effective ───
  describe('précision (V4-G)', () => {
    it('dexterity augmente accuracy (coef 0.5)', () => {
      const { stats } = resolve({ attack: 100, targetArmor: 40, dexterity: 40 });
      expect(stats.derived.accuracy).toBe(20); // 40 × 0.5
    });

    it("accuracy dérivée réduit l'esquive effective du défenseur", () => {
      // dexterity 40 → accuracy 20 ; défenseur dodge 30 → effective 30 − 20 = 10.
      const { stats, result } = resolve({
        attack: 100,
        targetArmor: 40,
        dexterity: 40,
        defenderDodgeChancePercent: 30,
        rng: () => 0.15, // 0.15 >= 0.10 → non esquivé
      });
      expect(stats.derived.accuracy).toBe(20);
      expect(result.effectiveDodgeChancePercent).toBe(10);
      expect(result.isDodged).toBe(false);
      expect(result.finalDamage).toBe(60);
    });

    it("sous le seuil réduit, l'esquive réussit encore", () => {
      const { result } = resolve({
        attack: 100,
        targetArmor: 40,
        dexterity: 40, // accuracy 20
        defenderDodgeChancePercent: 30, // effective 10
        rng: () => 0.05, // 0.05 < 0.10 → esquivé
      });
      expect(result.isDodged).toBe(true);
      expect(result.finalDamage).toBe(0);
    });

    it('sans précision (dexterity 0), esquive pleine', () => {
      const { stats, result } = resolve({
        attack: 100,
        targetArmor: 40,
        defenderDodgeChancePercent: 30,
        rng: () => 0.29, // 0.29 < 0.30 → esquivé
      });
      expect(stats.derived.accuracy).toBe(0);
      expect(result.effectiveDodgeChancePercent).toBe(30);
      expect(result.isDodged).toBe(true);
    });
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

  // ── V4-I : parade + contre-attaque (stats dérivées réelles) ────────────────
  describe('parade + contre-attaque (V4-I)', () => {
    it('strength + dexterity augmentent parryChance (coefs 0.15 / 0.15)', () => {
      const character = {
        attack: 0,
        defense: 0,
        maxHealth: 100,
        baseStrength: 20,
        baseDexterity: 20,
      } as Character;
      const stats = CharacterStatsCalculator.compute(character, DEFAULT_DERIVED_STAT_DEFINITIONS);
      // parryChance = 20 × 0.15 + 20 × 0.15 = 6.
      expect(stats.derived.parryChance).toBe(6);
    });

    it('dexterity/agility/intelligence augmentent counterAttackPower (0.4 / 0.3 / 0.2)', () => {
      const character = {
        attack: 0,
        defense: 0,
        maxHealth: 100,
        baseDexterity: 10,
        baseAgility: 10,
        baseIntelligence: 10,
      } as Character;
      const stats = CharacterStatsCalculator.compute(character, DEFAULT_DERIVED_STAT_DEFINITIONS);
      // counterAttackPower = 10 × 0.4 + 10 × 0.3 + 10 × 0.2 = 9.
      expect(stats.derived.counterAttackPower).toBe(9);
    });

    it('une maîtrise (flatPerLevel) augmente parryChance', () => {
      const modifiers = aggregateMasteryStatModifiers(
        [masteryWith('parryChance', 'flatPerLevel', 5)],
        { test_mastery: 3 },
        TARGETS,
      );
      const stats = CharacterStatsCalculator.compute(
        makeCharacter(0),
        DEFAULT_DERIVED_STAT_DEFINITIONS,
        undefined,
        modifiers,
      );
      // base 0 + flat (level 3 × 5) = 15.
      expect(stats.derived.parryChance).toBe(15);
    });

    it('une maîtrise (flatPerLevel) augmente counterAttackPower', () => {
      const modifiers = aggregateMasteryStatModifiers(
        [masteryWith('counterAttackPower', 'flatPerLevel', 10)],
        { test_mastery: 2 },
        TARGETS,
      );
      const stats = CharacterStatsCalculator.compute(
        makeCharacter(0),
        DEFAULT_DERIVED_STAT_DEFINITIONS,
        undefined,
        modifiers,
      );
      // base 0 + flat (level 2 × 10) = 20.
      expect(stats.derived.counterAttackPower).toBe(20);
    });
  });
});
