import { useState } from "react";
import { useCharacterStore } from "../../store/character.store";
import {
  STAT_FIELDS_COLUMN_1,
  STAT_FIELDS_COLUMN_2,
  emptyBuffer,
  totalAllocated,
  remainingPoints,
  increment,
  decrement,
  buildAllocationPayload,
} from "./statsAllocation";

type PrimaryStats = Record<string, number>;
type DerivedStats = Record<string, number>;

/**
 * StatsTab — stats primaires distribuables (sous l'équipement, onglet Perso).
 * Les stats dérivées sont affichées séparément par DerivedStatsTab (sous la
 * monnaie, dans la colonne inventaire) — voir CharacterLayout.jsx.
 */
export default function StatsTab() {
  const character = useCharacterStore((s) => s.character) as
    | (Record<string, number> & {
        unspentStatPoints?: number;
        stats?: { base: PrimaryStats; final: PrimaryStats; derived: DerivedStats };
      })
    | null;
  const allocateStats = useCharacterStore((s) => s.allocateStats);

  const [buffer, setBuffer] = useState<Record<string, number>>(emptyBuffer());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const unspent = character?.unspentStatPoints ?? 0;
  const allocated = totalAllocated(buffer);
  const remaining = remainingPoints(unspent, buffer);

  const base = character?.stats?.base ?? {};
  const final = character?.stats?.final ?? {};

  const hasPending = allocated > 0;

  if (!character) {
    return <div className="character-stats character-stats--empty">Chargement du personnage…</div>;
  }

  function handleInc(key: string) {
    setError(null);
    setBuffer((b) => increment(b, key, unspent));
  }

  function handleDec(key: string) {
    setError(null);
    setBuffer((b) => decrement(b, key));
  }

  function handleCancel() {
    setError(null);
    setBuffer(emptyBuffer());
  }

  async function handleValidate() {
    if (!hasPending || submitting) return;
    setSubmitting(true);
    setError(null);
    const payload = buildAllocationPayload(buffer);
    const result = await allocateStats(payload);
    setSubmitting(false);
    if (result?.ok) {
      setBuffer(emptyBuffer());
    } else {
      setError(result?.error ?? "Allocation refusée");
    }
  }

  function renderStatRow(f: { key: string; label: string; base: string; final: string }) {
    const baseVal = base[f.final] ?? character[f.base] ?? 0;
    const finalVal = final[f.final] ?? baseVal;
    const pending = buffer[f.key] || 0;
    const showFinal = finalVal !== baseVal;
    return (
      <div key={f.key} className="character-stats__row">
        <span className="character-stats__row-label">{f.label}</span>
        <span className="character-stats__row-value">
          {baseVal}
          {showFinal && <span className="character-stats__row-final"> ({finalVal})</span>}
          {pending > 0 && <span className="character-stats__row-pending"> +{pending}</span>}
        </span>
        <span className="character-stats__controls">
          <button
            type="button"
            className="character-stats__btn character-stats__btn--minus"
            onClick={() => handleDec(f.key)}
            disabled={pending <= 0}
            aria-label={`Retirer un point de ${f.label}`}
          >
            −
          </button>
          <button
            type="button"
            className="character-stats__btn character-stats__btn--plus"
            onClick={() => handleInc(f.key)}
            disabled={remaining <= 0}
            aria-label={`Ajouter un point à ${f.label}`}
          >
            +
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="character-stats character-stats--compact">
      <div className="character-stats__points">
        <span className="character-stats__points-label">Points disponibles</span>
        <span className="character-stats__points-value">{remaining}</span>
      </div>

      <div className="character-stats__columns">
        <div className="character-stats__list">{STAT_FIELDS_COLUMN_1.map(renderStatRow)}</div>
        <div className="character-stats__list">{STAT_FIELDS_COLUMN_2.map(renderStatRow)}</div>
      </div>

      {error && <div className="character-stats__error">{error}</div>}

      <div className="character-stats__actions">
        <button
          type="button"
          className="character-stats__action character-stats__action--validate"
          onClick={handleValidate}
          disabled={!hasPending || submitting}
        >
          {submitting ? "Validation…" : "Valider"}
        </button>
        {hasPending && (
          <button
            type="button"
            className="character-stats__action character-stats__action--cancel"
            onClick={handleCancel}
            disabled={submitting}
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
