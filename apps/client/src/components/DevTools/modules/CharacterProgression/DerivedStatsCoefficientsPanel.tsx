import { useEffect, useMemo, useState } from "react";
import {
  fetchDerivedStatDefinitions,
  updateDerivedStatDefinition,
  previewDerivedStats,
} from "./derivedStatsApi";
import {
  DERIVED_STAT_CATEGORY_LABELS,
  PRIMARY_STAT_KEYS,
  PRIMARY_STAT_OPTIONS,
  PRIMARY_STAT_LABELS,
  CRITICAL_DERIVED_STAT_KEYS,
  type DerivedStatDefinitionDto,
  type DerivedStatCategory,
} from "./derivedStats.types";
import { useConfirmDialog } from "../../../common/useConfirmDialog";

const RAW_STAT_KEYS = ["maxHealth", "attack", "defense"] as const;
const CRITICAL_KEY_SET = new Set<string>(CRITICAL_DERIVED_STAT_KEYS);
const CATEGORY_LABEL_BY_KEY = new Map(DERIVED_STAT_CATEGORY_LABELS.map((c) => [c.key, c.label]));

function emptyPrimaryDraft(): Record<string, string> {
  return Object.fromEntries(PRIMARY_STAT_KEYS.map((k) => [k, "0"]));
}

function emptyRawDraft(): Record<string, string> {
  return Object.fromEntries(RAW_STAT_KEYS.map((k) => [k, "0"]));
}

/** Une paire (stat primaire impliquée, coefficient) — une ligne d'édition. */
interface CoefficientEntry {
  primary: string;
  value: string;
}

function coefficientsToEntries(coefficients: Record<string, number>): CoefficientEntry[] {
  return Object.entries(coefficients).map(([primary, value]) => ({ primary, value: String(value) }));
}

function entriesToCoefficients(entries: CoefficientEntry[]): Record<string, number> | null {
  const result: Record<string, number> = {};
  for (const entry of entries) {
    const value = Number(entry.value);
    if (!Number.isFinite(value)) return null;
    result[entry.primary] = value;
  }
  return result;
}

/** Première stat primaire non encore utilisée par la ligne (défaut du "+"). */
function firstUnusedPrimary(entries: CoefficientEntry[]): string | null {
  const used = new Set(entries.map((e) => e.primary));
  const free = PRIMARY_STAT_OPTIONS.find((opt) => !used.has(opt.key));
  return free ? free.key : null;
}

interface RowDraft {
  enabled: boolean;
  baseValue: string;
  coefficients: CoefficientEntry[];
  minValue: string;
  maxValue: string;
}

function toDraft(d: DerivedStatDefinitionDto): RowDraft {
  return {
    enabled: d.enabled,
    baseValue: String(d.baseValue),
    coefficients: coefficientsToEntries(d.primaryCoefficients),
    minValue: d.minValue == null ? "" : String(d.minValue),
    maxValue: d.maxValue == null ? "" : String(d.maxValue),
  };
}

function isRowDirty(draft: RowDraft, original: DerivedStatDefinitionDto): boolean {
  const originalEntries = coefficientsToEntries(original.primaryCoefficients);
  const coefficientsChanged =
    draft.coefficients.length !== originalEntries.length ||
    draft.coefficients.some(
      (entry, i) => entry.primary !== originalEntries[i]?.primary || entry.value !== originalEntries[i]?.value,
    );
  return (
    draft.enabled !== original.enabled ||
    draft.baseValue !== String(original.baseValue) ||
    coefficientsChanged ||
    draft.minValue !== (original.minValue == null ? "" : String(original.minValue)) ||
    draft.maxValue !== (original.maxValue == null ? "" : String(original.maxValue))
  );
}

function formatMinMax(minValue: string, maxValue: string): string {
  const min = minValue.trim() === "" ? "–" : minValue;
  const max = maxValue.trim() === "" ? "–" : maxValue;
  return `min ${min} / max ${max}`;
}

/**
 * Éditeur des coefficients de dérivées (config serveur DerivedStatDefinition)
 * — groupé par catégorie repliable. Chaque dérivée affiche une ligne de
 * résumé compacte (toujours visible) ; un clic déplie l'édition détaillée
 * (base/min/max/enabled + liste de coefficients, un select catalogue par
 * stat primaire impliquée). Le serveur reste seul calculateur : ce panneau
 * lit/écrit la config et affiche un aperçu calculé serveur.
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
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const { confirm, dialog: confirmDialog } = useConfirmDialog();

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

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setDraftField(key: string, field: "enabled" | "baseValue" | "minValue" | "maxValue", value: string | boolean) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function addCoefficientEntry(key: string) {
    setDrafts((prev) => {
      const draft = prev[key];
      const nextPrimary = firstUnusedPrimary(draft.coefficients);
      if (!nextPrimary) return prev; // les 10 primaires sont déjà toutes utilisées
      const nextEntry: CoefficientEntry = { primary: nextPrimary, value: "0" };
      return { ...prev, [key]: { ...draft, coefficients: [...draft.coefficients, nextEntry] } };
    });
  }

  async function removeCoefficientEntry(key: string, index: number, label: string) {
    const confirmed = await confirm({
      title: "Retirer une stat de la formule",
      message: `Retirer "${label}" de la formule de cette dérivée ? Le changement n'est appliqué qu'après "Enregistrer".`,
      confirmLabel: "Retirer",
      variant: "danger",
    });
    if (!confirmed) return;
    setDrafts((prev) => {
      const draft = prev[key];
      return { ...prev, [key]: { ...draft, coefficients: draft.coefficients.filter((_, i) => i !== index) } };
    });
  }

  function updateCoefficientEntry(key: string, index: number, field: keyof CoefficientEntry, value: string) {
    setDrafts((prev) => {
      const draft = prev[key];
      const coefficients = draft.coefficients.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry,
      );
      return { ...prev, [key]: { ...draft, coefficients } };
    });
  }

  function handleCancelRow(original: DerivedStatDefinitionDto) {
    setDrafts((prev) => ({ ...prev, [original.key]: toDraft(original) }));
    setMessage(null);
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
    const parsedCoefficients = entriesToCoefficients(draft.coefficients);
    if (parsedCoefficients === null) {
      setMessage(`Erreur "${original.label}" : coefficient non numérique.`);
      return;
    }
    const baseValue = Number(draft.baseValue);
    if (!Number.isFinite(baseValue)) {
      setMessage(`Erreur "${original.label}" : baseValue invalide.`);
      return;
    }
    const minValue = draft.minValue.trim() === "" ? null : Number(draft.minValue);
    const maxValue = draft.maxValue.trim() === "" ? null : Number(draft.maxValue);
    if ((minValue != null && !Number.isFinite(minValue)) || (maxValue != null && !Number.isFinite(maxValue))) {
      setMessage(`Erreur "${original.label}" : minValue/maxValue invalide.`);
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
      {confirmDialog}
      <p className="character-progression__note">
        Coefficients des 24 stats dérivées — config serveur (DerivedStatDefinition).
        Seules maxHealth/physicalAttack/defense affectent le combat en V1 ; les
        autres restent affichage/preview. Cliquer une ligne pour éditer ses
        coefficients (catalogue de stats primaires, sans doublon possible).
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
                    <span className="character-progression__label">{PRIMARY_STAT_LABELS[k]}</span>
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

                {isOpen && (
                  <div className="character-progression__derived-list">
                    {rows.map((d) => {
                      const draft = drafts[d.key];
                      if (!draft) return null;
                      const dirty = isRowDirty(draft, d);
                      const isCritical = CRITICAL_KEY_SET.has(d.key);
                      const isExpanded = expandedKeys.has(d.key);
                      const usedPrimaries = new Set(draft.coefficients.map((e) => e.primary));
                      const canAddCoefficient = usedPrimaries.size < PRIMARY_STAT_OPTIONS.length;

                      return (
                        <div key={d.key} className="character-progression__derived-row">
                          {/* ── Résumé (toujours visible, cliquable) ── */}
                          <button
                            type="button"
                            className="character-progression__derived-summary"
                            onClick={() => toggleExpanded(d.key)}
                            aria-expanded={isExpanded}
                          >
                            <span className="character-progression__chevron">{isExpanded ? "▼" : "▶"}</span>

                            <span className="character-progression__derived-summary-label">
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

                            <span className="character-progression__derived-summary-category">
                              {CATEGORY_LABEL_BY_KEY.get(d.category)}
                            </span>

                            <span
                              className="character-progression__derived-summary-enabled"
                              title={draft.enabled ? "Activée" : "Désactivée"}
                            >
                              {draft.enabled ? "✓" : "✕"}
                            </span>

                            <span className="character-progression__derived-summary-base">
                              {d.rawStatSource ? `base = ${d.rawStatSource}` : `base ${draft.baseValue}`}
                            </span>

                            <span className="character-progression__derived-summary-minmax">
                              {formatMinMax(draft.minValue, draft.maxValue)}
                            </span>

                            <span className="character-progression__derived-summary-coefs">
                              {draft.coefficients.length === 0
                                ? "aucune stat"
                                : draft.coefficients
                                    .map((e) => `${PRIMARY_STAT_LABELS[e.primary] ?? e.primary} ×${e.value}`)
                                    .join(", ")}
                            </span>
                          </button>

                          {/* ── Édition détaillée (dépliable) ── */}
                          {isExpanded && (
                            <div className="character-progression__derived-detail">
                              <div className="character-progression__derived-detail-fields">
                                <label className="character-progression__field">
                                  <span className="character-progression__label">Activée</span>
                                  <input
                                    type="checkbox"
                                    checked={draft.enabled}
                                    disabled={isCritical}
                                    onChange={(e) => setDraftField(d.key, "enabled", e.target.checked)}
                                  />
                                  {isCritical && (
                                    <span
                                      className="character-progression__field-current character-progression__derived-locked-note"
                                      title="Dérivée système requise"
                                    >
                                      🔒 système requise
                                    </span>
                                  )}
                                </label>

                                {d.rawStatSource ? (
                                  <span
                                    className="character-progression__field-current"
                                    title="Base = colonne brute Character (non éditable ici)"
                                  >
                                    Base = {d.rawStatSource} (brut personnage, non éditable)
                                  </span>
                                ) : (
                                  <label className="character-progression__field">
                                    <span className="character-progression__label">baseValue</span>
                                    <input
                                      className="character-progression__input"
                                      type="number"
                                      step="any"
                                      value={draft.baseValue}
                                      onChange={(e) => setDraftField(d.key, "baseValue", e.target.value)}
                                    />
                                  </label>
                                )}

                                <label className="character-progression__field">
                                  <span className="character-progression__label">minValue</span>
                                  <input
                                    className="character-progression__input"
                                    type="number"
                                    step="any"
                                    placeholder="—"
                                    value={draft.minValue}
                                    onChange={(e) => setDraftField(d.key, "minValue", e.target.value)}
                                  />
                                </label>

                                <label className="character-progression__field">
                                  <span className="character-progression__label">maxValue</span>
                                  <input
                                    className="character-progression__input"
                                    type="number"
                                    step="any"
                                    placeholder="—"
                                    value={draft.maxValue}
                                    onChange={(e) => setDraftField(d.key, "maxValue", e.target.value)}
                                  />
                                </label>
                              </div>

                              <div className="character-progression__derived-detail-coefs">
                                <span className="character-progression__derived-detail-coefs-title">
                                  Stats primaires impliquées
                                </span>

                                {draft.coefficients.length === 0 && (
                                  <p className="character-progression__status">
                                    Aucune stat primaire — dérivée constante (baseValue seul).
                                  </p>
                                )}

                                {draft.coefficients.map((entry, idx) => {
                                  const optionsForThisRow = PRIMARY_STAT_OPTIONS.filter(
                                    (opt) => opt.key === entry.primary || !usedPrimaries.has(opt.key),
                                  );
                                  return (
                                    <div key={idx} className="character-progression__derived-coef-row">
                                      <select
                                        className="character-progression__input character-progression__derived-coef-select"
                                        value={entry.primary}
                                        onChange={(e) =>
                                          updateCoefficientEntry(d.key, idx, "primary", e.target.value)
                                        }
                                      >
                                        {optionsForThisRow.map((opt) => (
                                          <option key={opt.key} value={opt.key}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        className="character-progression__input character-progression__derived-coef-value"
                                        type="number"
                                        step="any"
                                        value={entry.value}
                                        onChange={(e) =>
                                          updateCoefficientEntry(d.key, idx, "value", e.target.value)
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="character-progression__derived-coef-remove"
                                        title="Retirer cette stat de la formule"
                                        onClick={() =>
                                          void removeCoefficientEntry(
                                            d.key,
                                            idx,
                                            PRIMARY_STAT_LABELS[entry.primary] ?? entry.primary,
                                          )
                                        }
                                      >
                                        × Retirer
                                      </button>
                                    </div>
                                  );
                                })}

                                <button
                                  type="button"
                                  className="character-progression__derived-coef-add"
                                  disabled={!canAddCoefficient}
                                  title={
                                    canAddCoefficient
                                      ? "Ajouter une stat primaire à la formule"
                                      : "Toutes les stats primaires sont déjà utilisées"
                                  }
                                  onClick={() => addCoefficientEntry(d.key)}
                                >
                                  + Ajouter une stat
                                </button>
                              </div>

                              <div className="character-progression__derived-detail-actions">
                                <button
                                  type="button"
                                  className="character-progression__btn character-progression__btn--primary"
                                  disabled={!dirty || savingKey === d.key}
                                  onClick={() => handleSaveRow(d)}
                                >
                                  {savingKey === d.key ? "…" : "Enregistrer"}
                                </button>
                                {dirty && (
                                  <button
                                    type="button"
                                    className="character-progression__btn"
                                    disabled={savingKey === d.key}
                                    onClick={() => handleCancelRow(d)}
                                  >
                                    Annuler
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            );
          })}
        </>
      )}
    </div>
  );
}
