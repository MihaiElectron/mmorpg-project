import { useEffect, useMemo, useState } from "react";
import {
  fetchCreatureSecondaryCoefficients,
  updateCreatureSecondaryCoefficients,
} from "./creatureCoefficientsApi";
import {
  COEFFICIENT_GROUPS,
  CreatureCoefficientKey,
  CoefficientDraft,
  CreatureSecondaryCoefficients,
} from "./creatureCoefficients.types";
import {
  buildPatch,
  invalidKeys,
  isDirty,
  isFieldInvalid,
  isFieldModified,
  toDraft,
} from "./creatureCoefficientsHelpers";
import "./CreatureCoefficientsModule.scss";

type Status = "idle" | "loading" | "loaded" | "error";

export default function CreatureCoefficientsModule() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<CreatureSecondaryCoefficients | null>(null);
  const [draft, setDraft] = useState<CoefficientDraft | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setStatus("loading");
    setMessage(null);
    try {
      const cfg = await fetchCreatureSecondaryCoefficients();
      setCurrent(cfg);
      setDraft(toDraft(cfg));
      setStatus("loaded");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur de chargement.");
      setStatus("error");
    }
  }

  // Chargement au premier déploiement du panneau.
  useEffect(() => {
    if (!open || current) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const invalid = useMemo(() => (draft ? invalidKeys(draft) : []), [draft]);
  const dirty = useMemo(
    () => (draft && current ? isDirty(draft, current) : false),
    [draft, current],
  );
  const hasInvalid = invalid.length > 0;
  const canApply = dirty && !hasInvalid && !busy;

  function setField(key: CreatureCoefficientKey, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleApply() {
    if (!canApply || !draft || !current) return;
    const patch = buildPatch(draft, current);
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await updateCreatureSecondaryCoefficients(patch);
      setCurrent(saved);
      setDraft(toDraft(saved));
      setMessage("Coefficients appliqués.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur application.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReload() {
    if (busy) return;
    setBusy(true);
    await load();
    setBusy(false);
  }

  return (
    <section className="creature-coefficients" aria-label="Creature Coefficients">
      <div
        className="creature-coefficients__header"
        onClick={() => setOpen((v) => !v)}
      >
        <h3 className="creature-coefficients__title">
          <span aria-hidden="true">🐾</span>
          Coefficients créature
        </h3>
        <span className="creature-coefficients__count">Dérivation secondaires</span>
        <span className="creature-coefficients__chevron">{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <>
          {status === "loading" && (
            <p className="creature-coefficients__status">Chargement...</p>
          )}
          {status === "error" && (
            <p className="creature-coefficients__status creature-coefficients__status--error">
              {message ?? "Impossible de charger les coefficients."}
            </p>
          )}

          {status === "loaded" && current && draft && (
            <div className="creature-coefficients__body">
              <p className="creature-coefficients__note">
                Ces coefficients sont appliqués par le serveur.
              </p>
              <p className="creature-coefficients__note">
                Actifs actuellement : attaque, défense, précision.
              </p>
              <p className="creature-coefficients__note creature-coefficients__note--muted">
                Esquive, blocage, parade et PV max dérivés restent informatifs
                tant que les lots V6-B3/V6-B4/V6-B6 ne sont pas activés.
              </p>

              {COEFFICIENT_GROUPS.map((group) => (
                <fieldset key={group.id} className="creature-coefficients__group">
                  <legend className="creature-coefficients__group-title">
                    {group.title}
                  </legend>
                  {group.fields.map((field) => {
                    const raw = draft[field.key];
                    const invalidField = isFieldInvalid(raw);
                    const modified = isFieldModified(raw, current[field.key]);
                    return (
                      <label
                        key={field.key}
                        className={
                          "creature-coefficients__field" +
                          (modified ? " creature-coefficients__field--modified" : "") +
                          (invalidField ? " creature-coefficients__field--invalid" : "")
                        }
                      >
                        <span className="creature-coefficients__label">
                          {field.label}
                        </span>
                        <input
                          className="creature-coefficients__input"
                          type="number"
                          step="any"
                          min={0}
                          value={raw}
                          onChange={(e) => setField(field.key, e.target.value)}
                        />
                        <span className="creature-coefficients__field-current">
                          serveur : {current[field.key]}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}

              <div className="creature-coefficients__actions">
                <button
                  type="button"
                  className="creature-coefficients__button creature-coefficients__button--primary"
                  disabled={!canApply}
                  onClick={handleApply}
                >
                  Appliquer
                </button>
                <button
                  type="button"
                  className="creature-coefficients__button"
                  disabled={busy}
                  onClick={handleReload}
                >
                  Recharger
                </button>
                {hasInvalid && (
                  <span className="creature-coefficients__hint creature-coefficients__hint--error">
                    Un champ est invalide.
                  </span>
                )}
                {message && !hasInvalid && (
                  <span className="creature-coefficients__hint">{message}</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
