import { useEffect, useMemo, useRef, useState } from "react";
import { createDerivedStat, fetchDerivedStats, updateDerivedStat } from "./derivedStatsApi";
import {
  buildCreateDerivedStatPayload,
  buildUpdateDerivedStatPayload,
  draftFromDerivedStat,
  emptyDerivedStatDraft,
  validateDerivedStatDraft,
  DERIVED_STAT_CATEGORY_LABELS,
  MODIFIER_MODE_OPTIONS,
  PRIMARY_STAT_KEYS,
  RUNTIME_STATUS_OPTIONS,
  type DerivedStatCategory,
  type DerivedStatDraft,
  type DerivedStatFullDto,
  type DerivedStatModifierMode,
  type DerivedStatRuntimeStatus,
} from "./derivedStats.types";
import { hasFormChanges } from "../../shared/formDirty";
import "./DerivedStatsModule.scss";

const CATEGORY_LABEL = new Map(DERIVED_STAT_CATEGORY_LABELS.map((c) => [c.key, c.label]));

/** Tri d'affichage : catégorie (ordre officiel) puis displayOrder puis label. */
function sortDefinitions(defs: DerivedStatFullDto[]): DerivedStatFullDto[] {
  const order = new Map(DERIVED_STAT_CATEGORY_LABELS.map((c, i) => [c.key, i]));
  return [...defs].sort((a, b) => {
    const ca = order.get(a.category) ?? 99;
    const cb = order.get(b.category) ?? 99;
    if (ca !== cb) return ca - cb;
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.label.localeCompare(b.label);
  });
}

interface EditorFormProps {
  mode: "create" | "edit";
  draft: DerivedStatDraft;
  onDraft: (partial: Partial<DerivedStatDraft>) => void;
  busy: boolean;
}

/** Formulaire partagé création/édition (la key n'est éditable qu'en création). */
function EditorFields({ mode, draft, onDraft, busy }: EditorFormProps) {
  function toggleMode(modeKey: DerivedStatModifierMode, checked: boolean) {
    const set = new Set(draft.allowedModifierModes);
    if (checked) set.add(modeKey);
    else set.delete(modeKey);
    onDraft({ allowedModifierModes: [...set] });
  }

  return (
    <>
      <div className="derived-stats-editor__grid">
        <label className="derived-stats-editor__field">
          <span className="derived-stats-editor__label">
            key {mode === "edit" && "(immuable)"}
          </span>
          <input
            className="derived-stats-editor__input"
            type="text"
            value={draft.key}
            disabled={mode === "edit" || busy}
            readOnly={mode === "edit"}
            placeholder="luck"
            onChange={(e) => onDraft({ key: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="derived-stats-editor__field">
          <span className="derived-stats-editor__label">label</span>
          <input
            className="derived-stats-editor__input"
            type="text"
            value={draft.label}
            placeholder="Chance"
            onChange={(e) => onDraft({ label: e.target.value })}
          />
        </label>
        <label className="derived-stats-editor__field">
          <span className="derived-stats-editor__label">category</span>
          <select
            className="derived-stats-editor__input"
            value={draft.category}
            onChange={(e) => onDraft({ category: e.target.value as DerivedStatCategory })}
          >
            {DERIVED_STAT_CATEGORY_LABELS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="derived-stats-editor__field">
          <span className="derived-stats-editor__label">runtimeStatus</span>
          <select
            className="derived-stats-editor__input"
            value={draft.runtimeStatus}
            onChange={(e) =>
              onDraft({ runtimeStatus: e.target.value as DerivedStatRuntimeStatus })
            }
          >
            {RUNTIME_STATUS_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="derived-stats-editor__field">
          <span className="derived-stats-editor__label">baseValue</span>
          <input
            className="derived-stats-editor__input"
            type="number"
            value={draft.baseValue}
            onChange={(e) => onDraft({ baseValue: e.target.value })}
          />
        </label>
        <label className="derived-stats-editor__field">
          <span className="derived-stats-editor__label">minValue (vide = aucun)</span>
          <input
            className="derived-stats-editor__input"
            type="number"
            value={draft.minValue}
            onChange={(e) => onDraft({ minValue: e.target.value })}
          />
        </label>
        <label className="derived-stats-editor__field">
          <span className="derived-stats-editor__label">maxValue (vide = aucun)</span>
          <input
            className="derived-stats-editor__input"
            type="number"
            value={draft.maxValue}
            onChange={(e) => onDraft({ maxValue: e.target.value })}
          />
        </label>
        <label className="derived-stats-editor__field derived-stats-editor__field--checkbox">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => onDraft({ enabled: e.target.checked })}
          />
          <span className="derived-stats-editor__label">enabled (désactivée = forcée à 0)</span>
        </label>
      </div>

      <fieldset className="derived-stats-editor__group">
        <legend className="derived-stats-editor__legend">
          Coefficients des stats principales (valeur = baseValue + Σ coef × stat)
        </legend>
        <div className="derived-stats-editor__coef-grid">
          {PRIMARY_STAT_KEYS.map((k) => (
            <label className="derived-stats-editor__coef-field" key={k}>
              <span className="derived-stats-editor__label">{k}</span>
              <input
                className="derived-stats-editor__input"
                type="number"
                step={0.1}
                value={draft.coefficients[k] ?? ""}
                onChange={(e) =>
                  onDraft({ coefficients: { ...draft.coefficients, [k]: e.target.value } })
                }
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="derived-stats-editor__group">
        <legend className="derived-stats-editor__legend">Maîtrises (préparation V3-B)</legend>
        <div className="derived-stats-editor__grid">
          <label className="derived-stats-editor__field derived-stats-editor__field--checkbox">
            <input
              type="checkbox"
              checked={draft.masteryEligible}
              onChange={(e) => onDraft({ masteryEligible: e.target.checked })}
            />
            <span className="derived-stats-editor__label">masteryEligible</span>
          </label>
          {MODIFIER_MODE_OPTIONS.map((m) => (
            <label
              className="derived-stats-editor__field derived-stats-editor__field--checkbox"
              key={m.key}
            >
              <input
                type="checkbox"
                checked={draft.allowedModifierModes.includes(m.key)}
                onChange={(e) => toggleMode(m.key, e.target.checked)}
              />
              <span className="derived-stats-editor__label">{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="derived-stats-editor__field derived-stats-editor__field--wide">
        <span className="derived-stats-editor__label">description</span>
        <textarea
          className="derived-stats-editor__textarea"
          rows={2}
          value={draft.description}
          onChange={(e) => onDraft({ description: e.target.value })}
        />
      </label>
    </>
  );
}

export default function DerivedStatsModule() {
  const [open, setOpen] = useState(false);
  const [definitions, setDefinitions] = useState<DerivedStatFullDto[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [draft, setDraft] = useState<DerivedStatDraft>(emptyDerivedStatDraft);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<DerivedStatDraft>(emptyDerivedStatDraft);
  const [createError, setCreateError] = useState<string | null>(null);

  const initialDraftRef = useRef<DerivedStatDraft>(draft);

  const sorted = useMemo(() => sortDefinitions(definitions), [definitions]);
  const selected = useMemo(
    () => sorted.find((d) => d.key === selectedKey) ?? null,
    [sorted, selectedKey],
  );

  function syncDraftFrom(def: DerivedStatFullDto | null) {
    const next = def ? draftFromDerivedStat(def) : emptyDerivedStatDraft();
    setDraft(next);
    initialDraftRef.current = next;
    setLocalError(null);
  }

  async function reload(): Promise<DerivedStatFullDto[]> {
    setStatus("loading");
    try {
      const list = await fetchDerivedStats();
      setDefinitions(list);
      setStatus("loaded");
      return list;
    } catch (err) {
      setMessage((err as Error).message);
      setStatus("error");
      return [];
    }
  }

  useEffect(() => {
    if (!open || status !== "idle") return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    syncDraftFrom(selected);
    // selectedKey est le déclencheur voulu ; selected est lu à travers lui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const isDirty = hasFormChanges(initialDraftRef.current, draft);

  async function handleSave() {
    if (!selected) return;
    const err = validateDerivedStatDraft(draft, "edit");
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    const patch = buildUpdateDerivedStatPayload(selected, draft);
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      await updateDerivedStat(selected.key, patch);
      const list = await reload();
      syncDraftFrom(list.find((d) => d.key === selected.key) ?? null);
      setMessage(`Stat "${selected.key}" enregistrée.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    setDraft(initialDraftRef.current);
    setLocalError(null);
  }

  async function handleCreate() {
    const err = validateDerivedStatDraft(createDraft, "create");
    if (err) {
      setCreateError(err);
      return;
    }
    setCreateError(null);
    setBusy(true);
    setMessage(null);
    try {
      const created = await createDerivedStat(buildCreateDerivedStatPayload(createDraft));
      await reload();
      setSelectedKey(created.key);
      setCreateDraft(emptyDerivedStatDraft());
      setCreateOpen(false);
      setMessage(`Stat "${created.key}" créée.`);
    } catch (error) {
      setCreateError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="derived-stats-module">
      <button
        type="button"
        className="derived-stats-module__header"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="derived-stats-module__header-title">📈 Stats secondaires</span>
        <span className="derived-stats-module__header-chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="derived-stats-module__body">
          {status === "loading" && <p className="derived-stats-module__muted">Chargement…</p>}
          {status === "error" && (
            <p className="derived-stats-module__error">Erreur de chargement.</p>
          )}

          {status === "loaded" && (
            <>
              <div className="derived-stats-module__toolbar">
                <button
                  type="button"
                  className="derived-stats-module__btn derived-stats-module__btn--confirm"
                  onClick={() => {
                    setCreateOpen((v) => !v);
                    setCreateError(null);
                  }}
                  disabled={busy}
                >
                  {createOpen ? "Annuler la création" : "+ Créer une stat"}
                </button>
              </div>

              <p className="derived-stats-module__hint">
                Créer une stat ne garantit pas qu'elle soit consommée en jeu —
                elle est calculée serveur (baseValue + coefficients, clamp
                min/max) et exposée, mais un hook runtime doit exister pour
                qu'elle agisse. Les maîtrises ne peuvent cibler que les stats
                exposées par le serveur.
              </p>

              {createOpen && (
                <div className="derived-stats-editor">
                  <h4 className="derived-stats-editor__title">Créer une stat dérivée</h4>
                  <EditorFields
                    mode="create"
                    draft={createDraft}
                    onDraft={(partial) => setCreateDraft((prev) => ({ ...prev, ...partial }))}
                    busy={busy}
                  />
                  {createError && (
                    <p className="derived-stats-editor__error">{createError}</p>
                  )}
                  <div className="derived-stats-editor__actions">
                    <button
                      type="button"
                      className="derived-stats-editor__btn derived-stats-editor__btn--confirm"
                      onClick={() => void handleCreate()}
                      disabled={busy}
                    >
                      {busy ? "…" : "Créer"}
                    </button>
                  </div>
                </div>
              )}

              <label className="derived-stats-module__field derived-stats-module__field--wide">
                <span className="derived-stats-module__label">Stat dérivée</span>
                <select
                  className="derived-stats-module__input"
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                >
                  <option value="">— choisir une stat —</option>
                  {DERIVED_STAT_CATEGORY_LABELS.map((c) => (
                    <optgroup key={c.key} label={c.label}>
                      {sorted
                        .filter((d) => d.category === c.key)
                        .map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.label} ({d.key}){d.enabled ? "" : " — désactivée"} [
                            {d.runtimeStatus}]
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {selected && (
                <div className="derived-stats-editor">
                  <div className="derived-stats-editor__head">
                    <h4 className="derived-stats-editor__title">{selected.label}</h4>
                    <span
                      className={
                        "derived-stats-editor__badge" +
                        (selected.runtimeStatus === "implemented"
                          ? " derived-stats-editor__badge--on"
                          : " derived-stats-editor__badge--muted")
                      }
                    >
                      {selected.runtimeStatus}
                    </span>
                    <span
                      className={
                        "derived-stats-editor__badge" +
                        (selected.enabled
                          ? " derived-stats-editor__badge--on"
                          : " derived-stats-editor__badge--off")
                      }
                    >
                      {selected.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>

                  <EditorFields
                    mode="edit"
                    draft={draft}
                    onDraft={(partial) => setDraft((prev) => ({ ...prev, ...partial }))}
                    busy={busy}
                  />

                  <div className="derived-stats-module__hints">
                    <p className="derived-stats-module__hint">
                      implemented = calculée et consommée par au moins un hook
                      runtime. calculatedOnly = calculée/visible mais pas
                      forcément utilisée. notHooked = définie mais sans effet
                      gameplay.
                    </p>
                  </div>

                  {localError && (
                    <p className="derived-stats-editor__error">{localError}</p>
                  )}
                  {message && <p className="derived-stats-editor__message">{message}</p>}

                  <div className="derived-stats-editor__actions">
                    <button
                      type="button"
                      className="derived-stats-editor__btn derived-stats-editor__btn--neutral"
                      onClick={handleReset}
                      disabled={busy || !isDirty}
                    >
                      Réinitialiser
                    </button>
                    <button
                      type="button"
                      className="derived-stats-editor__btn derived-stats-editor__btn--confirm"
                      onClick={() => void handleSave()}
                      disabled={busy || !isDirty}
                      title={!isDirty ? "Aucune modification à enregistrer" : undefined}
                    >
                      {busy ? "…" : "Sauvegarder"}
                    </button>
                  </div>
                </div>
              )}

              {!selected && message && (
                <p className="derived-stats-module__message">{message}</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
