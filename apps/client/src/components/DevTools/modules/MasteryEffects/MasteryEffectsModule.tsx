import { useEffect, useMemo, useRef, useState } from "react";
import {
  createMasteryDefinition,
  fetchMasteryDefinitions,
  fetchMasteryEffectTargets,
  updateMasteryEffects,
} from "./masteryEffectsApi";
import {
  buildCreateMasteryDefinitionPayload,
  buildMasteryEffectsPayload,
  draftFromMasteryEffects,
  emptyCreateMasteryDefinitionDraft,
  emptyModifierRow,
  hasActiveMasteryEffects,
  validateCreateMasteryDefinitionDraft,
  validateMasteryEffectsDraft,
  sortTargets,
  valueBoundsFor,
  MASTERY_CATEGORIES,
  type CreateMasteryDefinitionDraft,
  type MasteryDefinitionDto,
  type MasteryEffectsDraft,
  type MasteryEffectTargetsResponse,
  type ModifierRowDraft,
} from "./masteryEffects.types";
import { hasFormChanges } from "../../shared/formDirty";
import { WEAPON_TYPE_SUGGESTIONS, isKnownWeaponType } from "../../shared/weaponTypes";
import "./MasteryEffectsModule.scss";

/** Catégories combat en premier, puis alphabétique ; par nom à l'intérieur. */
function sortDefinitions(defs: MasteryDefinitionDto[]): MasteryDefinitionDto[] {
  return [...defs].sort((a, b) => {
    const aCombat = a.category === "combat" ? 0 : 1;
    const bCombat = b.category === "combat" ? 0 : 1;
    if (aCombat !== bCombat) return aCombat - bCombat;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
}

export default function MasteryEffectsModule() {
  const [open, setOpen] = useState(false);
  const [definitions, setDefinitions] = useState<MasteryDefinitionDto[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [draft, setDraft] = useState<MasteryEffectsDraft>({ weaponType: "", modifiers: [] });
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Catalogue serveur des stats ciblables (V2-E) — pas de liste locale, pas
  // de fallback : sans lui, la sauvegarde des effets est bloquée.
  const [targetsData, setTargetsData] = useState<MasteryEffectTargetsResponse | null>(null);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateMasteryDefinitionDraft>(
    emptyCreateMasteryDefinitionDraft,
  );
  const [createError, setCreateError] = useState<string | null>(null);

  // Snapshot de référence pour la détection dirty — recalculé à chaque
  // (re)synchronisation du draft depuis le serveur, jamais à la frappe.
  const initialDraftRef = useRef<MasteryEffectsDraft>(draft);

  const sorted = useMemo(
    () => sortDefinitions(definitions.filter((d) => d.enabled)),
    [definitions],
  );
  const selected = useMemo(
    () => sorted.find((d) => d.key === selectedKey) ?? null,
    [sorted, selectedKey],
  );

  function syncDraftFrom(def: MasteryDefinitionDto | null) {
    const next = draftFromMasteryEffects(def?.effects);
    setDraft(next);
    initialDraftRef.current = next;
    setLocalError(null);
  }

  async function reload(): Promise<MasteryDefinitionDto[]> {
    setStatus("loading");
    try {
      const list = await fetchMasteryDefinitions();
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
    void fetchMasteryEffectTargets()
      .then((data) => {
        setTargetsData(data);
        setTargetsError(null);
      })
      .catch((err: Error) => setTargetsError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Changement de maîtrise sélectionnée → reset automatique du draft.
  // (Le message n'est pas effacé ici : chaque action le nettoie déjà à son
  // départ, et la création doit pouvoir afficher son succès après sélection.)
  useEffect(() => {
    syncDraftFrom(selected);
    // selectedKey est le déclencheur voulu ; selected est lu à travers lui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const isDirty = hasFormChanges(initialDraftRef.current, draft);

  const sortedTargets = useMemo(
    () => sortTargets(targetsData?.targets ?? []),
    [targetsData],
  );
  const targetsByKey = useMemo(
    () => new Map(sortedTargets.map((t) => [t.key, t])),
    [sortedTargets],
  );
  const targetCategories = useMemo(
    () => [...new Set(sortedTargets.map((t) => t.category))],
    [sortedTargets],
  );

  async function patchEffects(key: string, draftToSend: MasteryEffectsDraft, successMsg: string) {
    setBusy(true);
    setMessage(null);
    try {
      await updateMasteryEffects(key, buildMasteryEffectsPayload(draftToSend));
      // Le serveur est la source de vérité (sanitize/normalisation) :
      // recharger puis resynchroniser le draft depuis la réponse.
      const list = await reload();
      syncDraftFrom(list.find((d) => d.key === key) ?? null);
      setMessage(successMsg);
    } catch (err) {
      // Erreur : draft conservé pour correction, message inline.
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleSave() {
    if (!selected || !targetsData) return;
    const err = validateMasteryEffectsDraft(
      draft,
      targetsData.targets,
      targetsData.contextualStats,
    );
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    const disabling = draft.modifiers.filter((r) => r.stat.trim() !== "").length === 0;
    void patchEffects(
      selected.key,
      draft,
      disabling
        ? `Effets de "${selected.key}" désactivés.`
        : `Effets de "${selected.key}" enregistrés.`,
    );
  }

  function handleDisable() {
    if (!selected) return;
    setLocalError(null);
    void patchEffects(
      selected.key,
      { weaponType: "", modifiers: [] },
      `Effets de "${selected.key}" désactivés.`,
    );
  }

  function handleReset() {
    setDraft(initialDraftRef.current);
    setLocalError(null);
  }

  function patchRow(index: number, partial: Partial<ModifierRowDraft>) {
    setDraft((prev) => ({
      ...prev,
      modifiers: prev.modifiers.map((row, i) => (i === index ? { ...row, ...partial } : row)),
    }));
  }

  function addRow() {
    setDraft((prev) => ({ ...prev, modifiers: [...prev.modifiers, emptyModifierRow()] }));
  }

  function removeRow(index: number) {
    setDraft((prev) => ({
      ...prev,
      modifiers: prev.modifiers.filter((_, i) => i !== index),
    }));
  }

  function setCreateField<K extends keyof CreateMasteryDefinitionDraft>(
    field: K,
    value: CreateMasteryDefinitionDraft[K],
  ) {
    setCreateDraft((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate() {
    const err = validateCreateMasteryDefinitionDraft(createDraft);
    if (err) {
      setCreateError(err);
      return;
    }
    setCreateError(null);
    setBusy(true);
    setMessage(null);
    try {
      const payload = buildCreateMasteryDefinitionPayload(createDraft);
      const created = await createMasteryDefinition(payload);
      await reload();
      // Sélectionne la maîtrise créée : l'utilisateur configure ensuite ses
      // modificateurs dans le formulaire effects.
      setSelectedKey(created.key);
      setCreateDraft(emptyCreateMasteryDefinitionDraft());
      setCreateOpen(false);
      setMessage(
        `Maîtrise "${created.key}" créée — configurez ses effets ci-dessous.`,
      );
    } catch (error) {
      setCreateError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selectedHasActive = hasActiveMasteryEffects(selected?.effects);
  const hasWeaponContext = draft.weaponType.trim() !== "";

  return (
    <section className="mastery-effects-module">
      <button
        type="button"
        className="mastery-effects-module__header"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mastery-effects-module__header-title">🎯 Maîtrises / Effets</span>
        <span className="mastery-effects-module__header-chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mastery-effects-module__body">
          {status === "loading" && <p className="mastery-effects-module__muted">Chargement…</p>}
          {status === "error" && (
            <p className="mastery-effects-module__error">Erreur de chargement.</p>
          )}

          {status === "loaded" && (
            <>
              <div className="mastery-effects-module__toolbar">
                <button
                  type="button"
                  className="mastery-effects-module__btn mastery-effects-module__btn--confirm"
                  onClick={() => {
                    setCreateOpen((v) => !v);
                    setCreateError(null);
                  }}
                  disabled={busy}
                >
                  {createOpen ? "Annuler la création" : "+ Créer une maîtrise"}
                </button>
              </div>

              {createOpen && (
                <div className="mastery-effects-editor">
                  <div className="mastery-effects-editor__head">
                    <h4 className="mastery-effects-editor__title">Créer une maîtrise</h4>
                  </div>

                  <div className="mastery-effects-editor__grid">
                    <label className="mastery-effects-editor__field">
                      <span className="mastery-effects-editor__label">key (immuable)</span>
                      <input
                        className="mastery-effects-editor__input"
                        type="text"
                        value={createDraft.key}
                        placeholder="dagger"
                        onChange={(e) => setCreateField("key", e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <label className="mastery-effects-editor__field">
                      <span className="mastery-effects-editor__label">name</span>
                      <input
                        className="mastery-effects-editor__input"
                        type="text"
                        value={createDraft.name}
                        placeholder="Dague"
                        onChange={(e) => setCreateField("name", e.target.value)}
                      />
                    </label>
                    <label className="mastery-effects-editor__field">
                      <span className="mastery-effects-editor__label">category</span>
                      <select
                        className="mastery-effects-editor__input"
                        value={createDraft.category}
                        onChange={(e) => setCreateField("category", e.target.value)}
                      >
                        {MASTERY_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mastery-effects-editor__field">
                      <span className="mastery-effects-editor__label">maxLevel</span>
                      <input
                        className="mastery-effects-editor__input"
                        type="number"
                        min={1}
                        value={createDraft.maxLevel}
                        onChange={(e) => setCreateField("maxLevel", e.target.value)}
                      />
                    </label>
                    <label className="mastery-effects-editor__field">
                      <span className="mastery-effects-editor__label">baseXpPerLevel</span>
                      <input
                        className="mastery-effects-editor__input"
                        type="number"
                        min={1}
                        value={createDraft.baseXpPerLevel}
                        onChange={(e) => setCreateField("baseXpPerLevel", e.target.value)}
                      />
                    </label>
                    <label className="mastery-effects-editor__field">
                      <span className="mastery-effects-editor__label">xpCurveExponent</span>
                      <input
                        className="mastery-effects-editor__input"
                        type="number"
                        min={0}
                        step={0.1}
                        value={createDraft.xpCurveExponent}
                        onChange={(e) => setCreateField("xpCurveExponent", e.target.value)}
                      />
                    </label>
                    <label className="mastery-effects-editor__field mastery-effects-editor__field--checkbox">
                      <input
                        type="checkbox"
                        checked={createDraft.enabled}
                        onChange={(e) => setCreateField("enabled", e.target.checked)}
                      />
                      <span className="mastery-effects-editor__label">
                        Maîtrise activée (enabled)
                      </span>
                    </label>
                  </div>

                  <p className="mastery-effects-editor__hint">
                    La key est immuable après création (référencée par skills, items
                    et recettes). Les effets se configurent ensuite dans le
                    formulaire ci-dessous.
                  </p>

                  {createError && (
                    <p className="mastery-effects-editor__error">{createError}</p>
                  )}

                  <div className="mastery-effects-editor__actions">
                    <button
                      type="button"
                      className="mastery-effects-editor__btn mastery-effects-editor__btn--confirm"
                      onClick={() => void handleCreate()}
                      disabled={busy}
                    >
                      {busy ? "…" : "Créer"}
                    </button>
                  </div>
                </div>
              )}

              <label className="mastery-effects-module__field mastery-effects-module__field--wide">
                <span className="mastery-effects-module__label">Maîtrise</span>
                <select
                  className="mastery-effects-module__input"
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                >
                  <option value="">— choisir une maîtrise —</option>
                  {sorted.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.name} ({d.key}) — {d.category}
                      {hasActiveMasteryEffects(d.effects) ? " ✦ effet actif" : ""}
                    </option>
                  ))}
                </select>
              </label>

              {selected && (
                <div className="mastery-effects-editor">
                  <div className="mastery-effects-editor__head">
                    <h4 className="mastery-effects-editor__title">
                      Effets — {selected.name}
                    </h4>
                    <span
                      className={
                        "mastery-effects-editor__badge" +
                        (selectedHasActive
                          ? " mastery-effects-editor__badge--on"
                          : " mastery-effects-editor__badge--off")
                      }
                    >
                      {selectedHasActive ? "effet actif" : "aucun effet"}
                    </span>
                  </div>

                  <div className="mastery-effects-editor__grid">
                    <label className="mastery-effects-editor__field">
                      <span className="mastery-effects-editor__label">key</span>
                      <input
                        className="mastery-effects-editor__input"
                        type="text"
                        value={selected.key}
                        disabled
                        readOnly
                      />
                    </label>
                    <label className="mastery-effects-editor__field">
                      <span className="mastery-effects-editor__label">category</span>
                      <input
                        className="mastery-effects-editor__input"
                        type="text"
                        value={selected.category}
                        disabled
                        readOnly
                      />
                    </label>
                    <label className="mastery-effects-editor__field">
                      <span className="mastery-effects-editor__label">
                        Contexte arme (optionnel)
                      </span>
                      <select
                        className="mastery-effects-editor__input"
                        value={draft.weaponType}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, weaponType: e.target.value }))
                        }
                      >
                        <option value="">Aucun (effet permanent)</option>
                        {/* Valeur hors catalogue déjà en base : affichée telle
                            quelle pour ne jamais l'écraser silencieusement. */}
                        {draft.weaponType !== "" && !isKnownWeaponType(draft.weaponType) && (
                          <option value={draft.weaponType}>{draft.weaponType}</option>
                        )}
                        {WEAPON_TYPE_SUGGESTIONS.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {hasWeaponContext && (
                    <p className="mastery-effects-editor__hint">
                      Contexte arme : actuellement seul « Attaque physique »
                      (physicalAttack) est consommé par les hooks weapon-based —
                      le serveur refusera les autres stats avec un contexte.
                    </p>
                  )}

                  {targetsError && (
                    <p className="mastery-effects-editor__error">
                      Catalogue des stats indisponible ({targetsError}) — la
                      sauvegarde des effets est bloquée.
                    </p>
                  )}

                  {/* ── Tableau des modificateurs ─────────────────────────── */}
                  <div className="mastery-effects-editor__rows">
                    {draft.modifiers.length === 0 && (
                      <p className="mastery-effects-editor__hint">
                        Aucun modificateur — sauvegarder ainsi désactive les effets.
                      </p>
                    )}
                    {draft.modifiers.map((row, index) => (
                      <div className="mastery-effects-editor__row" key={index}>
                        <select
                          className="mastery-effects-editor__input mastery-effects-editor__row-stat"
                          value={row.stat}
                          onChange={(e) => patchRow(index, { stat: e.target.value })}
                        >
                          <option value="">— stat —</option>
                          {/* Valeur inconnue du catalogue serveur : affichée
                              telle quelle, la validation la signalera. */}
                          {row.stat !== "" && !targetsByKey.has(row.stat) && (
                            <option value={row.stat}>{row.stat}</option>
                          )}
                          {targetCategories.map((category) => (
                            <optgroup key={category} label={category}>
                              {sortedTargets
                                .filter((t) => t.category === category)
                                .map((t) => (
                                  <option key={t.key} value={t.key}>
                                    {t.label} ({t.key})
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                        <select
                          className="mastery-effects-editor__input mastery-effects-editor__row-mode"
                          value={row.mode}
                          onChange={(e) =>
                            patchRow(index, {
                              mode: e.target.value as ModifierRowDraft["mode"],
                            })
                          }
                        >
                          {(targetsData?.modes ?? []).map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className="mastery-effects-editor__input mastery-effects-editor__row-value"
                          type="number"
                          min={valueBoundsFor(targetsByKey.get(row.stat), row.mode).min}
                          max={valueBoundsFor(targetsByKey.get(row.stat), row.mode).max}
                          step={valueBoundsFor(targetsByKey.get(row.stat), row.mode).step}
                          value={row.value}
                          onChange={(e) => patchRow(index, { value: e.target.value })}
                        />
                        <button
                          type="button"
                          className="mastery-effects-editor__row-remove"
                          onClick={() => removeRow(index)}
                          disabled={busy}
                          title="Supprimer ce modificateur"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="mastery-effects-editor__add-row"
                      onClick={addRow}
                      disabled={busy || !targetsData}
                    >
                      + Ajouter un modificateur
                    </button>
                  </div>

                  <div className="mastery-effects-editor__hints">
                    <p className="mastery-effects-editor__hint">
                      bonus = niveau × coefficient. Clamps serveur : 50 % max
                      par stat en %, 1000 max par stat en valeur fixe.
                    </p>
                    <p className="mastery-effects-editor__hint">
                      Le Studio ne calcule aucun bonus final — le serveur valide,
                      borne et applique. L'effet modifié s'applique immédiatement
                      après sauvegarde.
                    </p>
                  </div>

                  {localError && (
                    <p className="mastery-effects-editor__error">{localError}</p>
                  )}
                  {message && <p className="mastery-effects-editor__message">{message}</p>}

                  <div className="mastery-effects-editor__actions">
                    {selectedHasActive && (
                      <button
                        type="button"
                        className="mastery-effects-editor__btn mastery-effects-editor__btn--danger"
                        onClick={handleDisable}
                        disabled={busy}
                      >
                        Désactiver
                      </button>
                    )}
                    <button
                      type="button"
                      className="mastery-effects-editor__btn mastery-effects-editor__btn--neutral"
                      onClick={handleReset}
                      disabled={busy || !isDirty}
                    >
                      Réinitialiser
                    </button>
                    <button
                      type="button"
                      className="mastery-effects-editor__btn mastery-effects-editor__btn--confirm"
                      onClick={handleSave}
                      disabled={busy || !isDirty || !targetsData}
                      title={
                        !targetsData
                          ? "Catalogue des stats indisponible"
                          : !isDirty
                            ? "Aucune modification à enregistrer"
                            : undefined
                      }
                    >
                      {busy ? "…" : "Sauvegarder"}
                    </button>
                  </div>
                </div>
              )}

              {!selected && message && (
                <p className="mastery-effects-module__message">{message}</p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
