import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDerivedStat,
  deleteDerivedStatDefinition,
  fetchDerivedStatReferences,
  fetchDerivedStats,
  removeDerivedStatMasteryReference,
  updateDerivedStat,
} from "./derivedStatsApi";
import {
  buildCreateDerivedStatPayload,
  buildDuplicateDerivedStatPayload,
  buildUpdateDerivedStatPayload,
  draftFromDerivedStat,
  emptyDerivedStatDraft,
  validateDerivedStatDraft,
  validateDerivedStatKey,
  DERIVED_STAT_CATEGORY_LABELS,
  MODIFIER_MODE_OPTIONS,
  PRIMARY_STAT_KEYS,
  RUNTIME_STATUS_OPTIONS,
  type DerivedStatCategory,
  type DerivedStatDraft,
  type DerivedStatFullDto,
  type DerivedStatMasteryReference,
  type DerivedStatModifierMode,
  type DerivedStatReferencesReport,
  type DerivedStatRuntimeStatus,
} from "./derivedStats.types";
import { hasFormChanges } from "../../shared/formDirty";
import { useConfirmDialog } from "../../../common/useConfirmDialog";
import { notifyDerivedStatsChanged } from "./derivedStatsEvents";
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

  // Maintenance V3 (références, suppression, retrait de référence, duplication).
  const [references, setReferences] = useState<DerivedStatReferencesReport | null>(null);
  const [refBusy, setRefBusy] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateKey, setDuplicateKey] = useState("");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const { confirm, dialog: confirmDialog } = useConfirmDialog();

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

  async function loadReferences(key: string): Promise<void> {
    if (!key) {
      setReferences(null);
      return;
    }
    setRefBusy(true);
    try {
      setReferences(await fetchDerivedStatReferences(key));
    } catch (err) {
      setReferences(null);
      setMessage((err as Error).message);
    } finally {
      setRefBusy(false);
    }
  }

  useEffect(() => {
    syncDraftFrom(selected);
    setDuplicateOpen(false);
    setDuplicateKey("");
    setDuplicateError(null);
    void loadReferences(selectedKey);
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
      notifyDerivedStatsChanged();
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
      notifyDerivedStatsChanged();
      setMessage(`Stat "${created.key}" créée.`);
    } catch (error) {
      setCreateError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected || !references?.canDelete) return;
    const confirmed = await confirm({
      title: "Confirmer la suppression",
      message: `Supprimer la stat dérivée "${selected.label}" est définitif. Cette action est possible uniquement parce qu'aucune référence bloquante n'existe.`,
      confirmLabel: "Supprimer",
      cancelLabel: "Annuler",
      variant: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteDerivedStatDefinition(selected.key);
      const removedKey = selected.key;
      const list = await reload();
      // Sélectionne une autre stat (jamais de suppression silencieuse).
      setSelectedKey(sortDefinitions(list)[0]?.key ?? "");
      notifyDerivedStatsChanged();
      setMessage(`Stat "${removedKey}" supprimée.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveReference(ref: DerivedStatMasteryReference) {
    if (!selected) return;
    setRefBusy(true);
    setMessage(null);
    try {
      await removeDerivedStatMasteryReference(selected.key, {
        masteryKey: ref.masteryKey,
        modifierIndex: ref.modifierIndex,
      });
      // Recharge le rapport (les index se décalent) puis la liste.
      await loadReferences(selected.key);
      await reload();
      // Le retrait modifie les modificateurs de maîtrise → stats.derived joueur.
      notifyDerivedStatsChanged();
      setMessage(`Référence "${ref.masteryName}" (#${ref.modifierIndex}) retirée.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setRefBusy(false);
    }
  }

  async function handleDuplicate() {
    if (!selected) return;
    const err = validateDerivedStatKey(duplicateKey);
    if (err) {
      setDuplicateError(err);
      return;
    }
    setDuplicateError(null);
    setBusy(true);
    setMessage(null);
    try {
      const created = await createDerivedStat(
        buildDuplicateDerivedStatPayload(selected, duplicateKey),
      );
      await reload();
      setSelectedKey(created.key);
      setDuplicateKey("");
      setDuplicateOpen(false);
      notifyDerivedStatsChanged();
      setMessage(
        "Nouvelle stat créée. Tu peux désactiver ou supprimer l'ancienne si elle n'est plus référencée.",
      );
    } catch (error) {
      setDuplicateError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const deleteReason = references?.isSystem
    ? "Stat système non supprimable."
    : (references?.counts.masteryEffects ?? 0) > 0
      ? "Stat encore référencée par des effets de maîtrise."
      : null;

  return (
    <section className="derived-stats-module">
      {confirmDialog}
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

                  <fieldset className="derived-stats-editor__group derived-stats-maintenance">
                    <legend className="derived-stats-editor__legend">Maintenance</legend>

                    {refBusy && !references && (
                      <p className="derived-stats-module__muted">Chargement des références…</p>
                    )}

                    {references && (
                      <>
                        <div className="derived-stats-maintenance__status">
                          <span
                            className={
                              "derived-stats-editor__badge" +
                              (references.isSystem
                                ? " derived-stats-editor__badge--muted"
                                : " derived-stats-editor__badge--on")
                            }
                          >
                            {references.isSystem ? "Stat système" : "Stat custom"}
                          </span>
                          <span className="derived-stats-maintenance__count">
                            {references.counts.masteryEffects} référence
                            {references.counts.masteryEffects > 1 ? "s" : ""} mastery
                          </span>
                          <span className="derived-stats-maintenance__count">
                            canDelete : {references.canDelete ? "oui" : "non"}
                          </span>
                        </div>

                        <div className="derived-stats-editor__actions">
                          <button
                            type="button"
                            className="derived-stats-editor__btn derived-stats-editor__btn--neutral"
                            onClick={() => void loadReferences(selected.key)}
                            disabled={busy || refBusy}
                          >
                            Rafraîchir
                          </button>
                          <button
                            type="button"
                            className="derived-stats-editor__btn derived-stats-editor__btn--danger"
                            onClick={() => void handleDelete()}
                            disabled={busy || refBusy || !references.canDelete}
                            title={deleteReason ?? undefined}
                          >
                            {busy ? "…" : "Supprimer la stat"}
                          </button>
                        </div>

                        {deleteReason && (
                          <p className="derived-stats-module__hint">{deleteReason}</p>
                        )}

                        {references.references.masteryEffects.length > 0 && (
                          <ul className="derived-stats-maintenance__refs">
                            {references.references.masteryEffects.map((ref) => (
                              <li
                                className="derived-stats-maintenance__ref"
                                key={`${ref.masteryKey}#${ref.modifierIndex}`}
                              >
                                <span className="derived-stats-maintenance__ref-info">
                                  <strong>{ref.masteryName}</strong> ({ref.masteryKey}) · #
                                  {ref.modifierIndex} · {ref.mode} · {ref.value}
                                </span>
                                <button
                                  type="button"
                                  className="derived-stats-editor__btn derived-stats-editor__btn--neutral"
                                  onClick={() => void handleRemoveReference(ref)}
                                  disabled={busy || refBusy}
                                >
                                  Retirer
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="derived-stats-maintenance__duplicate">
                          {!duplicateOpen ? (
                            <button
                              type="button"
                              className="derived-stats-editor__btn derived-stats-editor__btn--neutral"
                              onClick={() => {
                                setDuplicateOpen(true);
                                setDuplicateKey("");
                                setDuplicateError(null);
                              }}
                              disabled={busy}
                            >
                              Dupliquer
                            </button>
                          ) : (
                            <div className="derived-stats-maintenance__duplicate-form">
                              <label className="derived-stats-editor__field">
                                <span className="derived-stats-editor__label">
                                  Nouvelle key (camelCase)
                                </span>
                                <input
                                  className="derived-stats-editor__input"
                                  type="text"
                                  value={duplicateKey}
                                  placeholder="luckReworked"
                                  onChange={(e) => setDuplicateKey(e.target.value)}
                                  autoComplete="off"
                                  spellCheck={false}
                                />
                              </label>
                              {duplicateError && (
                                <p className="derived-stats-editor__error">{duplicateError}</p>
                              )}
                              <div className="derived-stats-editor__actions">
                                <button
                                  type="button"
                                  className="derived-stats-editor__btn derived-stats-editor__btn--neutral"
                                  onClick={() => {
                                    setDuplicateOpen(false);
                                    setDuplicateError(null);
                                  }}
                                  disabled={busy}
                                >
                                  Annuler
                                </button>
                                <button
                                  type="button"
                                  className="derived-stats-editor__btn derived-stats-editor__btn--confirm"
                                  onClick={() => void handleDuplicate()}
                                  disabled={busy}
                                >
                                  {busy ? "…" : "Créer la copie"}
                                </button>
                              </div>
                            </div>
                          )}
                          <p className="derived-stats-module__hint">
                            Duplique la configuration sous une nouvelle key (pas de rename
                            direct). Les références de maîtrise ne sont pas copiées.
                          </p>
                        </div>
                      </>
                    )}
                  </fieldset>
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
