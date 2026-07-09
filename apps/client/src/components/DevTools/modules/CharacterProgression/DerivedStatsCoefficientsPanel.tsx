import { useEffect, useMemo, useState } from "react";
import {
  fetchDerivedStatDefinitions,
  updateDerivedStatDefinition,
  previewDerivedStats,
} from "./derivedStatsApi";
import {
  DERIVED_STAT_CATEGORY_LABELS,
  PRIMARY_STAT_KEYS,
  CRITICAL_DERIVED_STAT_KEYS,
  type DerivedStatDefinitionDto,
  type DerivedStatCategory,
} from "./derivedStats.types";

const RAW_STAT_KEYS = ["maxHealth", "attack", "defense"] as const;
const CRITICAL_KEY_SET = new Set<string>(CRITICAL_DERIVED_STAT_KEYS);

function emptyPrimaryDraft(): Record<string, string> {
  return Object.fromEntries(PRIMARY_STAT_KEYS.map((k) => [k, "0"]));
}

function emptyRawDraft(): Record<string, string> {
  return Object.fromEntries(RAW_STAT_KEYS.map((k) => [k, "0"]));
}

/** "dexterity:0.3, agility:0.2" → { dexterity: 0.3, agility: 0.2 } */
function parseCoefficientsText(text: string): Record<string, number> | null {
  const trimmed = text.trim();
  if (trimmed === "") return {};
  const result: Record<string, number> = {};
  for (const part of trimmed.split(",")) {
    const [rawKey, rawValue] = part.split(":").map((s) => s.trim());
    if (!rawKey || rawValue === undefined) return null;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return null;
    result[rawKey] = value;
  }
  return result;
}

function formatCoefficientsText(coefficients: Record<string, number>): string {
  return Object.entries(coefficients)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
}

interface RowDraft {
  enabled: boolean;
  baseValue: string;
  coefficientsText: string;
  minValue: string;
  maxValue: string;
}

function toDraft(d: DerivedStatDefinitionDto): RowDraft {
  return {
    enabled: d.enabled,
    baseValue: String(d.baseValue),
    coefficientsText: formatCoefficientsText(d.primaryCoefficients),
    minValue: d.minValue == null ? "" : String(d.minValue),
    maxValue: d.maxValue == null ? "" : String(d.maxValue),
  };
}

function isRowDirty(draft: RowDraft, original: DerivedStatDefinitionDto): boolean {
  return (
    draft.enabled !== original.enabled ||
    draft.baseValue !== String(original.baseValue) ||
    draft.coefficientsText !== formatCoefficientsText(original.primaryCoefficients) ||
    draft.minValue !== (original.minValue == null ? "" : String(original.minValue)) ||
    draft.maxValue !== (original.maxValue == null ? "" : String(original.maxValue))
  );
}

/**
 * Éditeur compact des coefficients de dérivées (config serveur
 * DerivedStatDefinition) — groupé par catégorie, une ligne par dérivée.
 * Le serveur reste seul calculateur : ce panneau lit/écrit la config et
 * affiche un aperçu calculé serveur (jamais recalculé côté client).
 */
export default function DerivedStatsCoefficientsPanel() {
  const [definitions, setDefinitions] = useState<DerivedStatDefinitionDto[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<DerivedStatCategory>>(
    new Set([DERIVED_STAT_CATEGORY_LABELS[0].key]),
  );

  // ── Preview serveur ──────────────────────────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false);
  const [primaryDraft, setPrimaryDraft] = useState<Record<string, string>>(emptyPrimaryDraft());
  const [rawDraft, setRawDraft] = useState<Record<string, string>>(emptyRawDraft());
  const [previewResult, setPreviewResult] = useState<Record<string, number> | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchDerivedStatDefinitions()
      .then((defs) => {
        if (!mounted) return;
        setDefinitions(defs);
        const nextDrafts: Record<string, RowDraft> = {};
        for (const d of defs) nextDrafts[d.key] = toDraft(d);
        setDrafts(nextDrafts);
        setStatus("loaded");
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setMessage(err.message);
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const byCategory = useMemo(() => {
    const map = new Map<DerivedStatCategory, DerivedStatDefinitionDto[]>();
    for (const d of definitions ?? []) {
      const list = map.get(d.category) ?? [];
      list.push(d);
      map.set(d.category, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.displayOrder - b.displayOrder);
    return map;
  }, [definitions]);

  function toggleCategory(cat: DerivedStatCategory) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function setDraftField(key: string, field: keyof RowDraft, value: string | boolean) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function handlePreview() {
    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const primaryStats = Object.fromEntries(
        Object.entries(primaryDraft).map(([k, v]) => [k, Number(v) || 0]),
      );
      const rawStats = Object.fromEntries(
        Object.entries(rawDraft).map(([k, v]) => [k, Number(v) || 0]),
      );
      const result = await previewDerivedStats({ primaryStats, rawStats });
      setPreviewResult(result);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Erreur d'aperçu.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleSaveRow(original: DerivedStatDefinitionDto) {
    const draft = drafts[original.key];
    const parsedCoefficients = parseCoefficientsText(draft.coefficientsText);
    if (parsedCoefficients === null) {
      setMessage(`Erreur "${original.key}" : coefficients mal formés (attendu "primaire:valeur, ...").`);
      return;
    }
    const unknown = Object.keys(parsedCoefficients).filter(
      (k) => !(PRIMARY_STAT_KEYS as readonly string[]).includes(k),
    );
    if (unknown.length > 0) {
      setMessage(`Erreur "${original.key}" : stat(s) primaire(s) inconnue(s) : ${unknown.join(", ")}.`);
      return;
    }
    const baseValue = Number(draft.baseValue);
    if (!Number.isFinite(baseValue)) {
      setMessage(`Erreur "${original.key}" : baseValue invalide.`);
      return;
    }
    const minValue = draft.minValue.trim() === "" ? null : Number(draft.minValue);
    const maxValue = draft.maxValue.trim() === "" ? null : Number(draft.maxValue);
    if ((minValue != null && !Number.isFinite(minValue)) || (maxValue != null && !Number.isFinite(maxValue))) {
      setMessage(`Erreur "${original.key}" : minValue/maxValue invalide.`);
      return;
    }

    setSavingKey(original.key);
    setMessage(null);
    try {
      const updated = await updateDerivedStatDefinition(original.key, {
        enabled: draft.enabled,
        baseValue,
        primaryCoefficients: parsedCoefficients,
        minValue,
        maxValue,
      });
      setDefinitions((prev) => (prev ? prev.map((d) => (d.key === updated.key ? updated : d)) : prev));
      setDrafts((prev) => ({ ...prev, [updated.key]: toDraft(updated) }));
      setMessage(`"${updated.label}" mis à jour.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur de sauvegarde.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="character-progression__derived-editor">
      <p className="character-progression__note">
        Coefficients des 24 stats dérivées — config serveur (DerivedStatDefinition).
        Seules maxHealth/physicalAttack/defense affectent le combat en V1 ;
        les autres restent affichage/preview. Coefficients au format
        "primaire:valeur, primaire:valeur".
      </p>

      {status === "loading" && <p className="character-progression__status">Chargement...</p>}
      {status === "error" && (
        <p className="character-progression__status character-progression__status--error">
          {message ?? "Impossible de charger les coefficients."}
        </p>
      )}

      {status === "loaded" && (
        <fieldset className="character-progression__group character-progression__derived-preview">
          <legend
            className="character-progression__group-title"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            <span className="character-progression__chevron">{previewOpen ? "▼" : "▶"}</span>
            Aperçu serveur (exemple de stats)
          </legend>

          {previewOpen && (
            <>
              <div className="character-progression__derived-preview-inputs">
                {PRIMARY_STAT_KEYS.map((k) => (
                  <label key={k} className="character-progression__derived-preview-field">
                    <span className="character-progression__label">{k}</span>
                    <input
                      className="character-progression__input"
                      type="number"
                      step="any"
                      value={primaryDraft[k]}
                      onChange={(e) => setPrimaryDraft((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  </label>
                ))}
                {RAW_STAT_KEYS.map((k) => (
                  <label key={k} className="character-progression__derived-preview-field">
                    <span className="character-progression__label">{k} (brut)</span>
                    <input
                      className="character-progression__input"
                      type="number"
                      step="any"
                      value={rawDraft[k]}
                      onChange={(e) => setRawDraft((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                className="character-progression__btn character-progression__btn--primary"
                onClick={handlePreview}
                disabled={previewBusy}
              >
                {previewBusy ? "…" : "Aperçu"}
              </button>

              {previewError && (
                <span className="character-progression__message character-progression__message--error">
                  {previewError}
                </span>
              )}

              {previewResult && (
                <div className="character-progression__derived-preview-results">
                  {Object.entries(previewResult).map(([key, value]) => (
                    <span key={key} className="character-progression__derived-preview-result">
                      <span className="character-progression__derived-preview-result-label">{key}</span>
                      <span className="character-progression__derived-preview-result-value">
                        {Math.round(value * 100) / 100}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </fieldset>
      )}

      {status === "loaded" && (
        <>
          {message && (
            <span
              className={
                "character-progression__message" +
                (message.startsWith("Erreur") ? " character-progression__message--error" : "")
              }
            >
              {message}
            </span>
          )}

          {DERIVED_STAT_CATEGORY_LABELS.map(({ key: cat, label }) => {
            const rows = byCategory.get(cat) ?? [];
            const isOpen = openCategories.has(cat);
            return (
              <fieldset key={cat} className="character-progression__group character-progression__derived-category">
                <legend
                  className="character-progression__group-title character-progression__derived-category-title"
                  onClick={() => toggleCategory(cat)}
                >
                  <span className="character-progression__chevron">{isOpen ? "▼" : "▶"}</span>
                  {label} ({rows.length})
                </legend>

                {isOpen &&
                  rows.map((d) => {
                    const draft = drafts[d.key];
                    if (!draft) return null;
                    const dirty = isRowDirty(draft, d);
                    const isCritical = CRITICAL_KEY_SET.has(d.key);
                    return (
                      <div key={d.key} className="character-progression__derived-row-edit">
                        <label
                          className="character-progression__derived-enabled"
                          title={isCritical ? "Dérivée système requise" : "Activée"}
                        >
                          <input
                            type="checkbox"
                            checked={draft.enabled}
                            disabled={isCritical}
                            onChange={(e) => setDraftField(d.key, "enabled", e.target.checked)}
                          />
                        </label>

                        <span className="character-progression__derived-row-label">
                          {d.label}
                          {isCritical && (
                            <span
                              className="character-progression__field-current character-progression__derived-locked-note"
                              title="Dérivée système requise"
                            >
                              {" "}
                              🔒 système
                            </span>
                          )}
                        </span>

                        {d.rawStatSource ? (
                          <span
                            className="character-progression__field-current character-progression__derived-raw-source"
                            title="Base = colonne brute Character (non éditable ici)"
                          >
                            base = {d.rawStatSource}
                          </span>
                        ) : (
                          <input
                            className="character-progression__input character-progression__derived-base-input"
                            type="number"
                            step="any"
                            value={draft.baseValue}
                            onChange={(e) => setDraftField(d.key, "baseValue", e.target.value)}
                          />
                        )}

                        <input
                          className="character-progression__input character-progression__derived-coef-input"
                          type="text"
                          placeholder="dexterity:0.3, agility:0.2"
                          value={draft.coefficientsText}
                          onChange={(e) => setDraftField(d.key, "coefficientsText", e.target.value)}
                        />

                        <input
                          className="character-progression__input character-progression__derived-minmax-input"
                          type="number"
                          step="any"
                          placeholder="min"
                          value={draft.minValue}
                          onChange={(e) => setDraftField(d.key, "minValue", e.target.value)}
                        />
                        <input
                          className="character-progression__input character-progression__derived-minmax-input"
                          type="number"
                          step="any"
                          placeholder="max"
                          value={draft.maxValue}
                          onChange={(e) => setDraftField(d.key, "maxValue", e.target.value)}
                        />

                        {dirty && (
                          <button
                            type="button"
                            className="character-progression__btn character-progression__btn--primary character-progression__derived-save-btn"
                            disabled={savingKey === d.key}
                            onClick={() => handleSaveRow(d)}
                          >
                            {savingKey === d.key ? "…" : "Save"}
                          </button>
                        )}
                      </div>
                    );
                  })}
              </fieldset>
            );
          })}
        </>
      )}
    </div>
  );
}
