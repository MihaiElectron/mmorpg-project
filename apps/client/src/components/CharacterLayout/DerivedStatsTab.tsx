import { useMemo } from "react";
import { useCharacterStore } from "../../store/character.store";

type DerivedStats = Record<string, number>;

// Libellés FR des 24 dérivées V1 (CharacterStatsCalculator). Seules
// maxHealth/physicalAttack/defense sont branchées au combat ; les autres
// restent affichage/preview V1 (voir commentaires backend).
const DERIVED_ROWS: { key: string; label: string; suffix?: string }[] = [
  // Stats prioritaires (haut de liste) : combat/ressources principales.
  { key: "physicalAttack", label: "Attaque physique" },
  { key: "magicPower", label: "Puissance magique" },
  { key: "maxHealth", label: "PV max" },
  { key: "maxMana", label: "Mana max" },
  { key: "defense", label: "Défense" },
  // Résistances magiques.
  { key: "magicalResistanceFire", label: "Résistance feu" },
  { key: "magicalResistanceWater", label: "Résistance eau" },
  { key: "magicalResistanceAir", label: "Résistance air" },
  { key: "magicalResistanceEarth", label: "Résistance terre" },
  // Reste : ressources secondaires, régénérations, taux, vitesses, divers.
  { key: "maxEnergy", label: "Énergie max" },
  { key: "healingPower", label: "Puissance de soin" },
  { key: "healthRegen", label: "Régén. PV" },
  { key: "manaRegen", label: "Régén. mana" },
  { key: "energyRegen", label: "Régén. énergie" },
  { key: "accuracy", label: "Précision" },
  { key: "criticalChance", label: "Chance critique", suffix: "%" },
  { key: "criticalDamage", label: "Dégâts critiques", suffix: "%" },
  { key: "dodgeChance", label: "Esquive", suffix: "%" },
  { key: "parryChance", label: "Parade", suffix: "%" },
  { key: "blockChance", label: "Blocage", suffix: "%" },
  { key: "attackSpeed", label: "Vitesse d'attaque", suffix: "%" },
  { key: "movementSpeed", label: "Vitesse de déplacement", suffix: "%" },
  { key: "controlResistance", label: "Résistance aux contrôles", suffix: "%" },
  { key: "threatGeneration", label: "Génération d'aggro" },
];

function formatDerived(value: number, suffix?: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${suffix ?? ""}`;
}

/**
 * DerivedStatsTab — stats dérivées en lecture seule (sous la monnaie, dans
 * la colonne inventaire de l'onglet Perso). Jamais calculées côté client :
 * lit directement `character.stats.derived` fourni par le serveur.
 */
export default function DerivedStatsTab() {
  const character = useCharacterStore((s) => s.character) as
    | (Record<string, number> & { stats?: { derived: DerivedStats } })
    | null;
  const previewDerived = useCharacterStore((s) => s.statPreviewDerived) as DerivedStats | null;
  const previewLoading = useCharacterStore((s) => s.statPreviewLoading) as boolean;

  const derived = character?.stats?.derived ?? {};

  const derivedEntries = useMemo(
    () =>
      DERIVED_ROWS.map((r) => {
        const current = derived[r.key];
        const preview = previewDerived ? previewDerived[r.key] : undefined;
        // "Changé" seulement si l'aperçu diffère de l'affichage arrondi actuel.
        const changed =
          preview != null &&
          current != null &&
          formatDerived(preview, r.suffix) !== formatDerived(current, r.suffix);
        return { ...r, current, preview, changed };
      }),
    [derived, previewDerived],
  );

  if (!character) return null;

  return (
    <div className="character-stats__derived character-stats__derived--compact">
      <h3 className="character-stats__derived-title">
        Stats dérivées
        {previewLoading && <span className="character-stats__derived-previewing"> aperçu…</span>}
      </h3>
      <div className="character-stats__derived-list">
        {derivedEntries.map((r) => (
          <div key={r.key} className="character-stats__derived-row">
            <span className="character-stats__derived-label">{r.label}</span>
            <span className="character-stats__derived-value">
              {formatDerived(r.current, r.suffix)}
              {r.changed && (
                <span className="character-stats__derived-preview">
                  {" → "}
                  {formatDerived(r.preview as number, r.suffix)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
