import { useEffect, useMemo, useState } from "react";
import { useCharacterStore } from "../../store/character.store";

type DerivedStats = Record<string, number>;

interface DerivedStatDef {
  key: string;
  label: string;
  category: string;
  runtimeStatus: string;
  description: string | null;
}

// Suffixe d'affichage PUR (présentation seulement — aucune règle métier) :
// certaines dérivées sont des pourcentages. Les valeurs et labels viennent du
// serveur ; ce map ne fait qu'ajouter "%" au rendu.
const PERCENT_SUFFIX_KEYS = new Set<string>([
  "criticalChance",
  "criticalDamage",
  "dodgeChance",
  "parryChance",
  "blockChance",
  "attackSpeed",
  "movementSpeed",
  "controlResistance",
]);

function formatDerived(value: number | undefined, suffix: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${suffix}`;
}

/**
 * DerivedStatsTab — stats dérivées en lecture seule. Les CLÉS, LABELS et
 * l'ORDRE viennent du catalogue serveur (`GET /characters/stat-definitions`,
 * V3-B) ; les VALEURS de `character.stats.derived` calculées par le serveur.
 * Jamais de calcul client. Repli sur les clés présentes dans stats.derived si
 * le catalogue ne charge pas (jamais d'écran vide).
 */
export default function DerivedStatsTab() {
  const character = useCharacterStore((s) => s.character) as
    | (Record<string, number> & { stats?: { derived: DerivedStats } })
    | null;
  const previewDerived = useCharacterStore((s) => s.statPreviewDerived) as DerivedStats | null;
  const previewLoading = useCharacterStore((s) => s.statPreviewLoading) as boolean;

  const [catalog, setCatalog] = useState<DerivedStatDef[]>([]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/characters/stat-definitions`,
          { headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` } },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { derivedStats?: DerivedStatDef[] };
        if (mounted && Array.isArray(data.derivedStats)) setCatalog(data.derivedStats);
      } catch {
        // Échec silencieux : repli sur les clés de stats.derived (voir rows).
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const derived = character?.stats?.derived ?? {};

  const rows = useMemo(() => {
    // Source des lignes : catalogue serveur si chargé, sinon repli sur les
    // clés réellement présentes dans stats.derived (label = clé).
    const source: { key: string; label: string }[] =
      catalog.length > 0
        ? catalog.map((d) => ({ key: d.key, label: d.label }))
        : Object.keys(derived).map((key) => ({ key, label: key }));

    return source.map((r) => {
      const suffix = PERCENT_SUFFIX_KEYS.has(r.key) ? "%" : "";
      const current = derived[r.key];
      const preview = previewDerived ? previewDerived[r.key] : undefined;
      const changed =
        preview != null &&
        current != null &&
        formatDerived(preview, suffix) !== formatDerived(current, suffix);
      return { ...r, suffix, current, preview, changed };
    });
  }, [catalog, derived, previewDerived]);

  if (!character) return null;

  return (
    <div className="character-stats__derived character-stats__derived--compact">
      <h3 className="character-stats__derived-title">
        Stats dérivées
        {previewLoading && <span className="character-stats__derived-previewing"> aperçu…</span>}
      </h3>
      <div className="character-stats__derived-list">
        {rows.map((r) => (
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
