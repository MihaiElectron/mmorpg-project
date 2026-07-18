import { useEffect, useRef, useState } from "react";
import { hasFormChanges } from "./shared/formDirty";
import {
  fetchDerivedConfiguration,
  saveDerivedConfiguration,
} from "./creatureDerivedConfig.api";
import type {
  CreatureDerivedConfiguration,
  DerivedStatConfigEntry,
} from "./creatureDerivedConfig.types";
import {
  buildEditorState,
  buildPutPayload,
  derivedDisplayState,
  derivedLabel,
  scalarHelp,
  scalarLabel,
  validateEditorState,
  type DerivedEditorState,
} from "./creatureDerivedConfig.helpers";

type Status = "idle" | "loading" | "loaded" | "error";

/** Provenance lisible (FR) — associée dynamiquement à la valeur serveur. */
const SOURCE_LABEL: Record<string, string> = {
  template: "template",
  global: "global",
  catalog: "catalogue",
};

function fmtCoefs(coefs: { primaryStatKey: string; coefficient: number }[]): string {
  if (coefs.length === 0) return "aucune contribution";
  return coefs.map((c) => `${c.primaryStatKey} × ${c.coefficient}`).join("  +  ");
}

/**
 * Éditeur des coefficients de dérivation PAR TEMPLATE (ADR-0021). Section
 * repliable, ajoutée au Creature Editor via `renderGroupExtra` (à côté des
 * capacités). Alimentée EXCLUSIVEMENT par le serveur (aucune liste en dur).
 * Sauvegarde REST dédiée (Option B) — indépendante de la sauvegarde socket du
 * template. Aucun style inline (SCSS `.creature-derived`).
 */
export default function CreatureDerivedCoefficientsEditor({ templateKey }: { templateKey: string }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [config, setConfig] = useState<CreatureDerivedConfiguration | null>(null);
  const [state, setState] = useState<DerivedEditorState>({ derived: [], scalars: [] });
  const [initial, setInitial] = useState<DerivedEditorState>({ derived: [], scalars: [] });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function load() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("loading");
    setSaveError(null);
    setSaveOk(false);
    fetchDerivedConfiguration(templateKey, ctrl.signal)
      .then((cfg) => {
        if (ctrl.signal.aborted) return;
        const st = buildEditorState(cfg);
        setConfig(cfg);
        setState(st);
        setInitial(st);
        setStatus("loaded");
      })
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error).name === "AbortError") return;
        setStatus("error");
      });
  }

  // Recharge quand le template change (si la section est déjà ouverte).
  useEffect(() => {
    if (expanded) load();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function onToggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && status === "idle") load(); // fetch PARESSEUX à la 1re ouverture
  }

  const dirty = hasFormChanges(initial, state);
  const validationError = validateEditorState(state);

  // ── Mutations d'état (immuables) ────────────────────────────────────────────
  function updateDerived(key: string, fn: (d: DerivedEditorState["derived"][number]) => DerivedEditorState["derived"][number]) {
    setSaveOk(false);
    setState((s) => ({ ...s, derived: s.derived.map((d) => (d.derivedStatKey === key ? fn(d) : d)) }));
  }
  function updateScalar(key: string, fn: (s: DerivedEditorState["scalars"][number]) => DerivedEditorState["scalars"][number]) {
    setSaveOk(false);
    setState((s) => ({ ...s, scalars: s.scalars.map((x) => (x.scalarParamKey === key ? fn(x) : x)) }));
  }

  function toggleOverride(entry: DerivedStatConfigEntry) {
    updateDerived(entry.derivedStatKey, (d) => {
      if (d.overridden) return { ...d, overridden: false }; // retour au fallback
      // Active : pré-remplit avec les coefficients EFFECTIFS actuels (éditables).
      return {
        ...d,
        overridden: true,
        coefficients: entry.effectiveCoefficients.map((c) => ({
          primaryStatKey: c.primaryStatKey,
          coefficient: String(c.coefficient),
        })),
      };
    });
  }
  function addPrimary(key: string, availablePrimaries: string[]) {
    updateDerived(key, (d) => {
      const used = new Set(d.coefficients.map((c) => c.primaryStatKey));
      const free = availablePrimaries.find((p) => !used.has(p)) ?? "";
      return { ...d, coefficients: [...d.coefficients, { primaryStatKey: free, coefficient: "0" }] };
    });
  }
  function removePrimary(key: string, index: number) {
    updateDerived(key, (d) => ({ ...d, coefficients: d.coefficients.filter((_, i) => i !== index) }));
  }
  function setPrimaryKey(key: string, index: number, primaryStatKey: string) {
    updateDerived(key, (d) => ({
      ...d,
      coefficients: d.coefficients.map((c, i) => (i === index ? { ...c, primaryStatKey } : c)),
    }));
  }
  function setCoefficient(key: string, index: number, coefficient: string) {
    updateDerived(key, (d) => ({
      ...d,
      coefficients: d.coefficients.map((c, i) => (i === index ? { ...c, coefficient } : c)),
    }));
  }

  async function save() {
    if (saving || validationError) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const cfg = await saveDerivedConfiguration(templateKey, buildPutPayload(state));
      const st = buildEditorState(cfg);
      setConfig(cfg);
      setState(st);
      setInitial(st);
      setSaveOk(true);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="creature-derived" aria-label="Creature derived coefficients editor">
      <button type="button" className="creature-derived__toggle" onClick={onToggleExpand} aria-expanded={expanded}>
        {expanded ? "▾" : "▸"} COEFFICIENTS DE DÉRIVATION
      </button>

      {expanded && (
        <div className="creature-derived__body">
          {status === "loading" && <p className="creature-derived__muted">Chargement…</p>}
          {status === "error" && <p className="creature-derived__error">Erreur de chargement de la configuration.</p>}

          {status === "loaded" && config && (
            <>
              <p className="creature-derived__note">
                Coefficients propres à ce template. Sans override, la valeur globale/catalogue est utilisée (fallback).
              </p>

              <ul className="creature-derived__list">
                {config.derivedStats.map((entry) => {
                  const edit = state.derived.find((d) => d.derivedStatKey === entry.derivedStatKey)!;
                  const display = derivedDisplayState(edit);
                  return (
                    <li key={entry.derivedStatKey} className={`creature-derived__item creature-derived__item--${display}`}>
                      <div className="creature-derived__item-head">
                        <span className="creature-derived__item-name">{derivedLabel(entry)}</span>
                        <span className="creature-derived__item-key">{entry.derivedStatKey}</span>
                        <span className={`creature-derived__badge creature-derived__badge--${display}`}>
                          {display === "fallback" ? `fallback (${SOURCE_LABEL[entry.source] ?? entry.source})` : display === "empty" ? "override vide" : "override"}
                        </span>
                        <button
                          type="button"
                          className="creature-derived__btn creature-derived__btn--neutral"
                          onClick={() => toggleOverride(entry)}
                        >
                          {edit.overridden ? "Revenir au fallback" : "Activer l'override"}
                        </button>
                      </div>

                      {!edit.overridden && (
                        <p className="creature-derived__effective">Effectif : {fmtCoefs(entry.effectiveCoefficients)}</p>
                      )}

                      {edit.overridden && (
                        <div className="creature-derived__coefs">
                          {edit.coefficients.length === 0 && (
                            <p className="creature-derived__muted">Aucune contribution primaire (override vide).</p>
                          )}
                          {edit.coefficients.map((c, i) => (
                            <div key={i} className="creature-derived__coef-row">
                              <select
                                className="creature-derived__select"
                                value={c.primaryStatKey}
                                onChange={(e) => setPrimaryKey(entry.derivedStatKey, i, e.target.value)}
                              >
                                {config.catalog.primaryStatKeys.map((p) => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                              <span className="creature-derived__times">×</span>
                              <input
                                type="number"
                                step="any"
                                className="creature-derived__coef-input"
                                value={c.coefficient}
                                onChange={(e) => setCoefficient(entry.derivedStatKey, i, e.target.value)}
                              />
                              <button
                                type="button"
                                className="creature-derived__btn creature-derived__btn--danger"
                                onClick={() => removePrimary(entry.derivedStatKey, i)}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="creature-derived__btn creature-derived__btn--neutral"
                            onClick={() => addPrimary(entry.derivedStatKey, config.catalog.primaryStatKeys)}
                          >
                            + Statistique primaire
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <p className="creature-derived__subtitle">Paramètres scalaires</p>
              <ul className="creature-derived__list">
                {config.scalarParams.map((s) => {
                  const edit = state.scalars.find((x) => x.scalarParamKey === s.scalarParamKey)!;
                  const help = scalarHelp(s.scalarParamKey);
                  return (
                    <li key={s.scalarParamKey} className="creature-derived__item">
                      <div className="creature-derived__item-head">
                        <span className="creature-derived__item-name" title={help ?? undefined}>{scalarLabel(s.scalarParamKey)}</span>
                        <span className="creature-derived__item-key">{s.scalarParamKey}</span>
                        <span className={`creature-derived__badge creature-derived__badge--${edit.overridden ? "override" : "fallback"}`}>
                          {edit.overridden ? "override" : `fallback (${SOURCE_LABEL[s.source] ?? s.source})`}
                        </span>
                        <button
                          type="button"
                          className="creature-derived__btn creature-derived__btn--neutral"
                          onClick={() => updateScalar(s.scalarParamKey, (x) => ({ ...x, overridden: !x.overridden, value: x.overridden ? String(s.effectiveValue) : x.value }))}
                        >
                          {edit.overridden ? "Revenir au fallback" : "Activer l'override"}
                        </button>
                      </div>
                      {!edit.overridden && <p className="creature-derived__effective">Effectif : {s.effectiveValue}</p>}
                      {edit.overridden && (
                        <input
                          type="number"
                          step="any"
                          className="creature-derived__coef-input"
                          value={edit.value}
                          onChange={(e) => updateScalar(s.scalarParamKey, (x) => ({ ...x, value: e.target.value }))}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>

              {validationError && <p className="creature-derived__error">{validationError}</p>}
              {saveError && <p className="creature-derived__error">Sauvegarde : {saveError}</p>}
              {saveOk && !dirty && <p className="creature-derived__ok">Configuration enregistrée.</p>}

              <div className="creature-derived__actions">
                <button
                  type="button"
                  className="creature-derived__btn creature-derived__btn--confirm"
                  disabled={!dirty || saving || validationError !== null}
                  onClick={() => void save()}
                >
                  {saving ? "Sauvegarde…" : "Sauvegarder les coefficients"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
