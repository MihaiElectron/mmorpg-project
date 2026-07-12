import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureTemplateSkill } from './entities/creature-template-skill.entity';
import { SkillDefinition } from '../active-skills/entities/skill-definition.entity';
import {
  CreatureAbilityDto,
  CreatureAbilityInputDto,
} from './dto/creature-ability.dto';

/**
 * Gestion des capacités configurables d'un CreatureTemplate (V5-A).
 *
 * Seul point de mutation de `creature_template_skill`. Config uniquement :
 * associe des `SkillDefinition` existants à un template, sans jamais lancer les
 * skills en combat (l'IA consommatrice viendra plus tard). Valide l'existence
 * des clés via le repository `SkillDefinition` (référence par clé stable) — pas
 * de dépendance à `ActiveSkillsService` pour éviter un cycle de modules.
 */
@Injectable()
export class CreatureAbilitiesService {
  constructor(
    @InjectRepository(CreatureTemplate)
    private readonly templateRepo: Repository<CreatureTemplate>,
    @InjectRepository(CreatureTemplateSkill)
    private readonly abilityRepo: Repository<CreatureTemplateSkill>,
    @InjectRepository(SkillDefinition)
    private readonly skillRepo: Repository<SkillDefinition>,
    private readonly dataSource: DataSource,
  ) {}

  private async requireTemplate(key: string): Promise<CreatureTemplate> {
    const template = await this.templateRepo.findOne({ where: { key } });
    if (!template) throw new NotFoundException(`Template "${key}" introuvable.`);
    return template;
  }

  /** Enrichit chaque association avec les infos du catalogue skill (nom/kind/enabled). */
  private async enrich(rows: CreatureTemplateSkill[]): Promise<CreatureAbilityDto[]> {
    const keys = rows.map((r) => r.skillKey);
    const skills = keys.length
      ? await this.skillRepo.find({ where: { key: In(keys) } })
      : [];
    const byKey = new Map(skills.map((s) => [s.key, s]));
    return rows.map((r) => {
      const skill = byKey.get(r.skillKey);
      return {
        skillKey: r.skillKey,
        enabled: r.enabled,
        displayOrder: r.displayOrder,
        skillName: skill?.name ?? null,
        skillKind: skill?.skillKind ?? null,
        skillEnabled: skill?.enabled ?? null,
        // V5-C3-A : métadonnées read-only issues du SkillDefinition (jamais mutées ici).
        effectType: skill?.effectType ?? null,
        damageType: skill?.damageType ?? null,
        rangeWU: skill?.rangeWU ?? null,
        cooldownMs: skill?.cooldownMs ?? null,
        missing: !skill,
      };
    });
  }

  async listForTemplate(key: string): Promise<CreatureAbilityDto[]> {
    const template = await this.requireTemplate(key);
    const rows = await this.abilityRepo.find({
      where: { creatureTemplateId: template.id },
      order: { displayOrder: 'ASC', skillKey: 'ASC' },
    });
    return this.enrich(rows);
  }

  /**
   * Remplace TOUTE la liste des capacités du template (idempotent). Valide :
   * clés uniques (pas de doublon) + chaque `skillKey` existe au catalogue.
   * Transaction : delete + insert. Aucun déclenchement combat.
   */
  async replaceForTemplate(
    key: string,
    abilities: CreatureAbilityInputDto[],
  ): Promise<CreatureAbilityDto[]> {
    const template = await this.requireTemplate(key);

    const seen = new Set<string>();
    for (const a of abilities) {
      if (seen.has(a.skillKey)) {
        throw new BadRequestException(`skillKey en double : "${a.skillKey}".`);
      }
      seen.add(a.skillKey);
    }

    if (abilities.length > 0) {
      const existing = await this.skillRepo.find({
        where: { key: In([...seen]) },
        select: { key: true },
      });
      const known = new Set(existing.map((s) => s.key));
      const unknown = [...seen].filter((k) => !known.has(k));
      if (unknown.length > 0) {
        throw new BadRequestException(
          `skillKey inconnu(s) au catalogue : ${unknown.join(', ')}.`,
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CreatureTemplateSkill, { creatureTemplateId: template.id });
      if (abilities.length > 0) {
        const rows = abilities.map((a, idx) =>
          manager.create(CreatureTemplateSkill, {
            creatureTemplateId: template.id,
            skillKey: a.skillKey,
            enabled: a.enabled ?? true,
            displayOrder: a.displayOrder ?? idx,
          }),
        );
        await manager.save(rows);
      }
    });

    return this.listForTemplate(key);
  }
}
