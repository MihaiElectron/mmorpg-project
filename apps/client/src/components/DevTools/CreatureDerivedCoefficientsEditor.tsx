import { useEffect, useRef, useState } from "react";
import { hasFormChanges } from "./shared/formDirty";
import {
  fetchDerivedConfiguration,
  saveDerivedConfiguration,
} from "./creatureDerivedConfig.api";
import type {
  CreatureDerivedConfiguration,
  DerivedStatConfigEntry,
  ScalarParamConfigEntry,
} from "./creatureDerivedConfig.types";
import {
  buildEditorState,
  buildPutPayload,
  cloneEffectiveCoefficients,
  derivedLabel,
  EMPTY_CONTRIBUTIONS_MESSAGE,
  formatEffectiveCoefficients,
  scalarHelp,
  scalarLabel,
  validateEditorState,
  type DerivedEditorState,
} from "./creatureDerivedConfig.helpers";

type Status = "idle" | "loading" | "loaded" | "error";

/** Clés en cours d'édition (mode formulaire ouvert) — état d'UI, hors dirty. */
interface EditingKeys {
  derived: Set<string>;
  scalars: Set<string>;
}

/**
 * Éditeur des coefficients de dérivation PAR TEMPLATE (ADR-0021). Section
 * repliable, ajoutée au Creature Editor via `renderGroupExtra` (à côté des
 * capacités). Alimentée EXCLUSIVEMENT par le serveur (aucune liste en dur).
 * Sauvegarde REST dédiée (Option B) — indépendante de la sauvegarde socket du
 * template. Aucun style inline (SCSS `.creature-derived`).
 *
 * UX : lecture directe des coefficients utilisés + bouton « Edit » ; en édition,
 * actions « Save » / « Cancel ». La terminologie technique interne (override /
 * fallback / provenance) n'est jamais exposée à l'utilisateur ; le mécanisme
 * interne (activation d'override, payload PUT) reste strictement inchangé.
 */
export default function CreatureDerivedCoefficientsEditor({ templateKey }: { templateKey: string }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [config, setConfig] = useState<CreatureDerivedConfiguration | null>(null);
  const [state, setState] = useState<DerivedEditorState>({ derived: [], scalars: [] });
  const [initial, setInitial] = useState<DerivedEditorState>({ derived: [], scalars: [] });
  const [editing, setEditing] = useState<EditingKeys>({ derived: new Set(), scalars: new Set() });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function resetEditing() {
    setEditing({ derived: new Set(), scalars: new Set() });
  }

  function load() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("loading");
    setSaveError(null);
    setSaveOk(false);
    resetEditing();
    fetchDerivedConfiguration(templateKey, ctrl.signal)
      .then((cfg) => {
        if (ctrl.signal.aborted) return;
        const st = buildEditorState(cfg);
        setConfig(cfg);
        setState(st);
        setInitial(st);
        resetEditing();
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
  const anyEditing = editing.derived.size > 0 || editing.scalars.size > 0;

  // ── Mutations d'état (immuables) ────────────────────────────────────────────
  function updateDerived(key: string, fn: (d: DerivedEditorState["derived"][number]) => DerivedEditorState["derived"][number]) {
    setSaveOk(false);
    setState((s) => ({ ...s, derived: s.derived.map((d) => (d.derivedStatKey === key ? fn(d) : d)) }));
  }
  function updateScalar(key: string, fn: (s: DerivedEditorState["scalars"][number]) => DerivedEditorState["scalars"][number]) {
    setSaveOk(false);
    setState((s) => ({ ...s, scalars: s.scalars.map((x) => (x.scalarParamKey === key ? fn(x) : x)) }));
  }

  /**
   * Clic « Edit » sur une dérivée : ouvre les champs éditables. Réutilise le
   * mécanisme interne d'activation d'override (overridden = true) et CLONE
   * PROFONDÉMENT les coefficients actuellement utilisés (jamais de mutation de la
   * réponse GET). Ne sauvegarde rien.
   */
  function beginEditDerived(entry: DerivedStatConfigEntry) {
    updateDerived(entry.derivedStatKey, (d) => ({
      ...d,
      overridden: true,
      coefficients: cloneEffectiveCoefficients(entry),
    }));
    setEditing((e) => ({ ...e, derived: new Set(e.derived).add(entry.derivedStatKey) }));
  }

  /** Clic « Edit » sur un scalaire : ouvre le champ, clone la valeur utilisée. */
  function beginEditScalar(entry: ScalarParamConfigEntry) {
    updateScalar(entry.scalarParamKey, (x) => ({
      ...x,
      overridden: true,
      value: String(entry.effectiveValue),
    }));
    setEditing((e) => ({ ...e, scalars: new Set(e.scalars).add(entry.scalarParamKey) }));
  }

  /**
   * « Cancel » : restaure EXACTEMENT le dernier état chargé ou sauvegardé et
   * referme tous les champs d'édition. Aucune requête, aucune perte d'un état
   * persisté.
   */
  function cancel() {
    setState(initial);
    resetEditing();
    setSaveError(null);
    setSaveOk(false);
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
      resetEditing();
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
              <ul className="creature-derived__list">
                {config.derivedStats.map((entry) => {
                  const edit = state.derived.find((d) => d.derivedStatKey === entry.derivedStatKey)!;
                  const isEditing = editing.derived.has(entry.derivedStatKey);
                  return (
                    <li key={entry.derivedStatKey} className="creature-derived__item">
                      <div className="creature-derived__item-head">
                        <span className="creature-derived__item-name">{derivedLabel(entry)}</span>
                        {!isEditing && (
                          <button
                            type="button"
                            className="creature-derived__btn creature-derived__btn--neutral"
                            onClick={() => beginEditDerived(entry)}
                          >
                            Edit
                          </button>
                        )}
                      </div>

                      {!isEditing && (
                        <p className="creature-derived__effective">{formatEffectiveCoefficients(entry.effectiveCoefficients)}</p>
                      )}

                      {isEditing && (
                        <div className="creature-derived__coefs">
                          {edit.coefficients.length === 0 && (
                            <p className="creature-derived__muted">{EMPTY_CONTRIBUTIONS_MESSAGE}</p>
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
                  const isEditing = editing.scalars.has(s.scalarParamKey);
                  const help = scalarHelp(s.scalarParamKey);
                  return (
                    <li key={s.scalarParamKey} className="creature-derived__item">
                      <div className="creature-derived__item-head">
                        <span className="creature-derived__item-name" title={help ?? undefined}>{scalarLabel(s.scalarParamKey)}</span>
                        {!isEditing && (
                          <button
                            type="button"
                            className="creature-derived__btn creature-derived__btn--neutral"
                            onClick={() => beginEditScalar(s)}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {!isEditing && <p className="creature-derived__effective">{s.effectiveValue}</p>}
                      {isEditing && (
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

              {(anyEditing || dirty) && (
                <div className="creature-derived__actions">
                  <button
                    type="button"
                    className="creature-derived__btn creature-derived__btn--confirm"
                    disabled={!dirty || saving || validationError !== null}
                    onClick={() => void save()}
                  >
                    {saving ? "Sauvegarde…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="creature-derived__btn creature-derived__btn--neutral"
                    disabled={saving}
                    onClick={cancel}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
