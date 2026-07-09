import { useEffect, useId, useRef, useState } from "react";
import type { KeySuggestion } from "./skills.types";

interface Row {
  id: number;
  key: string;
  value: string;
}

interface KeyValueRowsEditorProps {
  /** Change ce token pour réinitialiser les lignes depuis `initial` (ex: skill édité). */
  resetToken: string;
  initial: Record<string, number>;
  onChange: (record: Record<string, number>) => void;
  /** Suggestions de clés (datalist). Vide = saisie libre. */
  suggestions?: KeySuggestion[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Entiers seulement (ex: niveau de mastery requis). Sinon flottant. */
  integer?: boolean;
  addLabel?: string;
  emptyLabel?: string;
}

let ROW_SEQ = 0;

function toRows(record: Record<string, number>): Row[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({
    id: ROW_SEQ++,
    key,
    value: String(value),
  }));
}

/**
 * Éditeur générique de paires clé → nombre (add/remove), avec datalist de
 * suggestions optionnelle. Réutilisé pour requiredMasteries et pour chaque
 * groupe de scaling. Reconstruit un `Record<string, number>` à chaque mutation
 * (clés vides ignorées, valeurs non numériques traitées comme 0 — la
 * validation stricte reste serveur).
 */
export default function KeyValueRowsEditor({
  resetToken,
  initial,
  onChange,
  suggestions = [],
  keyPlaceholder = "clé",
  valuePlaceholder = "valeur",
  integer = false,
  addLabel = "+ Ajouter",
  emptyLabel = "Aucune entrée.",
}: KeyValueRowsEditorProps) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const datalistId = useId();
  // Ne réinitialiser QUE lorsque la cible change (resetToken), jamais à chaque
  // frappe — sinon on écraserait la saisie en cours.
  const lastToken = useRef(resetToken);

  useEffect(() => {
    if (lastToken.current !== resetToken) {
      lastToken.current = resetToken;
      setRows(toRows(initial));
    }
  }, [resetToken, initial]);

  function emit(next: Row[]) {
    const record: Record<string, number> = {};
    for (const r of next) {
      const k = r.key.trim();
      if (!k) continue;
      const n = Number(r.value);
      record[k] = Number.isFinite(n) ? n : 0;
    }
    onChange(record);
  }

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      emit(next);
      return next;
    });
  }

  function addRow() {
    setRows((prev) => [...prev, { id: ROW_SEQ++, key: "", value: integer ? "0" : "0" }]);
  }

  function removeRow(id: number) {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      emit(next);
      return next;
    });
  }

  return (
    <div className="skills-editor__kv">
      {suggestions.length > 0 && (
        <datalist id={datalistId}>
          {suggestions.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </datalist>
      )}

      {rows.length === 0 && <p className="skills-editor__kv-empty">{emptyLabel}</p>}

      {rows.map((row) => (
        <div key={row.id} className="skills-editor__kv-row">
          <input
            className="skills-editor__kv-key"
            type="text"
            value={row.key}
            placeholder={keyPlaceholder}
            list={suggestions.length > 0 ? datalistId : undefined}
            onChange={(e) => updateRow(row.id, { key: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
          <input
            className="skills-editor__kv-value"
            type="number"
            step={integer ? 1 : "any"}
            value={row.value}
            placeholder={valuePlaceholder}
            onChange={(e) => updateRow(row.id, { value: e.target.value })}
          />
          <button
            type="button"
            className="skills-editor__kv-remove"
            onClick={() => removeRow(row.id)}
            aria-label="Supprimer l'entrée"
          >
            ✕
          </button>
        </div>
      ))}

      <button type="button" className="skills-editor__kv-add" onClick={addRow}>
        {addLabel}
      </button>
    </div>
  );
}
