import { useEffect } from "react";
import { useCharacterStore } from "../../store/character.store";

type SkillEntry = {
  skillDefinitionId: string;
  key: string;
  name: string;
  category: string;
  level: number;
  xp: number;
  nextLevelXp: number;
  enabled: boolean;
};

const CATEGORY_ORDER = ["gathering", "crafting", "combat", "social", "leadership", "general"];

function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function groupByCategory(skills: SkillEntry[]): Map<string, SkillEntry[]> {
  const map = new Map<string, SkillEntry[]>();
  for (const skill of skills) {
    if (!map.has(skill.category)) map.set(skill.category, []);
    map.get(skill.category)!.push(skill);
  }
  return map;
}

function sortedCategories(map: Map<string, SkillEntry[]>): string[] {
  return [...map.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export default function SkillsTab() {
  const skills = useCharacterStore((s) => s.skills) as SkillEntry[];
  const loadSkills = useCharacterStore((s) => s.loadSkills);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  if (skills.length === 0) {
    return (
      <div className="skills-tab">
        <p className="skills-tab__empty">Aucun skill acquis pour l'instant.</p>
      </div>
    );
  }

  const grouped = groupByCategory(skills);
  const categories = sortedCategories(grouped);

  return (
    <div className="skills-tab">
      {categories.map((cat) => {
        const catSkills = (grouped.get(cat) ?? []).sort((a, b) => b.level - a.level);
        return (
          <div key={cat} className="skills-tab__category">
            <h3 className="skills-tab__category-name">{categoryLabel(cat)}</h3>
            {catSkills.map((skill) => {
              const isMaxLevel = skill.nextLevelXp === Infinity || skill.nextLevelXp <= 0;
              const pct = isMaxLevel ? 100 : Math.min(100, Math.round((skill.xp / skill.nextLevelXp) * 100));
              return (
                <div key={skill.key} className={`skills-tab__skill${skill.enabled ? "" : " skills-tab__skill--disabled"}`}>
                  <div className="skills-tab__skill-header">
                    <span className="skills-tab__skill-name">{skill.name}</span>
                    <span className="skills-tab__skill-level">Niv. {skill.level}</span>
                  </div>
                  <div className="skills-tab__xp-bar">
                    <div className="skills-tab__xp-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="skills-tab__xp-text">
                    {isMaxLevel
                      ? "Niveau maximum"
                      : `${skill.xp} / ${skill.nextLevelXp} XP`}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
