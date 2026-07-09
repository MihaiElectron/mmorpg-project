import { useEffect } from "react";
import { useCharacterStore } from "../../store/character.store";

type MasteryEntry = {
  masteryDefinitionId: string;
  key: string;
  name: string;
  category: string;
  level: number;
  xp: number;
  nextLevelXp: number;
  enabled: boolean;
};

const CATEGORY_ORDER = ["gathering", "crafting", "combat", "social", "leadership", "general"];

function categoryLabel(cat: string | undefined): string {
  if (!cat) return "Divers";
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function groupByCategory(masteries: MasteryEntry[]): Map<string, MasteryEntry[]> {
  const map = new Map<string, MasteryEntry[]>();
  for (const mastery of masteries) {
    if (!map.has(mastery.category)) map.set(mastery.category, []);
    map.get(mastery.category)!.push(mastery);
  }
  return map;
}

function sortedCategories(map: Map<string, MasteryEntry[]>): string[] {
  return [...map.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export default function MasteriesTab() {
  const masteries = useCharacterStore((s) => s.masteries) as MasteryEntry[];
  const loadMasteries = useCharacterStore((s) => s.loadMasteries);

  useEffect(() => {
    loadMasteries();
  }, [loadMasteries]);

  if (masteries.length === 0) {
    return (
      <div className="masteries-tab">
        <p className="masteries-tab__empty">Aucune maîtrise disponible.</p>
      </div>
    );
  }

  const grouped = groupByCategory(masteries);
  const categories = sortedCategories(grouped);

  return (
    <div className="masteries-tab">
      {categories.map((cat) => {
        const catMasteries = (grouped.get(cat) ?? []).sort((a, b) => b.level - a.level);
        return (
          <div key={cat} className="masteries-tab__category">
            <h3 className="masteries-tab__category-name">{categoryLabel(cat)}</h3>
            {catMasteries.map((mastery) => {
              const isMaxLevel = mastery.nextLevelXp === Infinity || mastery.nextLevelXp <= 0;
              const pct = isMaxLevel ? 100 : Math.min(100, Math.round((mastery.xp / mastery.nextLevelXp) * 100));
              return (
                <div key={mastery.key} className={`masteries-tab__mastery${mastery.enabled ? "" : " masteries-tab__mastery--disabled"}`}>
                  <div className="masteries-tab__mastery-header">
                    <span className="masteries-tab__mastery-name">{mastery.name}</span>
                    <span className="masteries-tab__mastery-level">Niv. {mastery.level}</span>
                  </div>
                  <div className="masteries-tab__xp-bar">
                    <div className="masteries-tab__xp-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="masteries-tab__xp-text">
                    {isMaxLevel
                      ? "Niveau maximum"
                      : `${mastery.xp} / ${mastery.nextLevelXp} XP`}
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
