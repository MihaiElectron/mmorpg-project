// apps/client/src/components/DevTools/modules/PlayerRuntime/RuntimeInspectorPanel.tsx

import { useState, useCallback } from "react";
import {
  STAT_KEYS,
  STAT_LABELS,
  OP_LABELS,
  OP_DISPLAY,
  type ModifierFormInput,
  type ModifierOperation,
  type RuntimeInspectableSnapshot,
  type RuntimeModifier,
  type StatKey,
} from "./player-runtime.types";
import {
  fetchSnapshot,
  addDebugModifier,
  clearDebugModifiers,
  fetchCreatureSnapshot,
  addCreatureDebugModifier,
  clearCreatureDebugModifiers,
} from "./runtimeApi";
import { getDebugModifiers, getEquipmentModifiers, validateModifierValue, formatModifierCount } from "./modifierForm";
import "./RuntimeInspector.scss";

// ─── Sous-composants génériques ───────────────────────────────────────────────

/**
 * Barre de section avec badge optionnel et slot d'actions enfants.
 * Générique — utilisable pour toute catégorie de modifiers.
 */
function SectionBar({
  label,
  badge,
  spaced = false,
  children,
}: {
  label: string;
  badge?: string;
  spaced?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={
        "rt-inspector__section-bar" +
        (spaced ? " rt-inspector__section-bar--spaced" : "")
      }
    >
      <span className="rt-inspector__section-label">{label}</span>
      {badge !== undefined && (
        <span className="rt-inspector__section-badge">{badge}</span>
      )}
      {children}
    </div>
  );
}

/**
 * Affiche un seul RuntimeModifier en ligne.
 * Générique — indépendant du sourceType.
 */
function ModifierRow({ modifier }: { modifier: RuntimeModifier }) {
  const stat = STAT_LABELS[modifier.targetStat] ?? modifier.targetStat;
  const op = OP_LABELS[modifier.operation] ?? modifier.operation;
  const sign = modifier.value >= 0 ? "+" : "";

  return (
    <div className="rt-inspector__modifier-row" title={modifier.reason}>
      <span className="rt-inspector__modifier-label">{modifier.sourceLabel}</span>
      <span className="rt-inspector__modifier-stat">{stat}</span>
      <span className="rt-inspector__modifier-op">{op}</span>
      <span className="rt-inspector__modifier-value">
        {sign}{modifier.value}
      </span>
    </div>
  );
}

/**
 * Liste de modifiers avec label configurable et bouton "clear all" optionnel.
 * Générique — prend des RuntimeModifier[] et un callback onClear.
 */
function ModifierList({
  modifiers,
  onClear,
  emptyLabel,
  label = "Modifiers actifs",
}: {
  modifiers: RuntimeModifier[];
  onClear?: () => void;
  emptyLabel: string;
  label?: string;
}) {
  return (
    <>
      <SectionBar
        label={label}
        badge={`(${formatModifierCount(modifiers.length)})`}
        spaced
      >
        {modifiers.length > 0 && onClear && (
          <button className="rt-inspector__clear-btn" onClick={onClear} type="button">
            Clear all
          </button>
        )}
      </SectionBar>

      {modifiers.length === 0 ? (
        <div className="devtools-world__trace-empty">{emptyLabel}</div>
      ) : (
        modifiers.map((m) => <ModifierRow key={m.id} modifier={m} />)
      )}
    </>
  );
}

/**
 * Formulaire d'ajout de modifier.
 * Générique — prend un callback onSubmit sans connaître l'endpoint.
 */
function ModifierForm({
  onSubmit,
  disabled,
  error,
}: {
  onSubmit: (input: ModifierFormInput) => Promise<void>;
  disabled: boolean;
  error: string | null;
}) {
  const [stat, setStat] = useState<StatKey>("maxHp");
  const [operation, setOperation] = useState<ModifierOperation>("flat");
  const [value, setValue] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = validateModifierValue(value);
    if (num === null) return;

    await onSubmit({
      targetStat: stat,
      operation,
      value: num,
      sourceLabel: sourceLabel.trim() || undefined,
      reason: reason.trim() || undefined,
    });

    setValue("");
    setSourceLabel("");
    setReason("");
  };

  const isValueValid = validateModifierValue(value) !== null;

  return (
    <form className="rt-inspector__form" onSubmit={handleSubmit}>
      <SectionBar label="Ajouter" spaced />

      <div className="rt-inspector__field">
        <label className="rt-inspector__label">Stat</label>
        <select
          className="rt-inspector__select"
          value={stat}
          onChange={(e) => setStat(e.target.value as StatKey)}
          disabled={disabled}
        >
          {STAT_KEYS.map((k) => (
            <option key={k} value={k}>{STAT_LABELS[k]}</option>
          ))}
        </select>
      </div>

      <div className="rt-inspector__field">
        <label className="rt-inspector__label">Op.</label>
        <select
          className="rt-inspector__select"
          value={operation}
          onChange={(e) => setOperation(e.target.value as ModifierOperation)}
          disabled={disabled}
        >
          {(Object.keys(OP_DISPLAY) as ModifierOperation[]).map((op) => (
            <option key={op} value={op}>{OP_DISPLAY[op]}</option>
          ))}
        </select>
      </div>

      <div className="rt-inspector__field">
        <label className="rt-inspector__label">Valeur</label>
        <input
          className="rt-inspector__input"
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          required
        />
      </div>

      <div className="rt-inspector__field">
        <label className="rt-inspector__label">Label</label>
        <input
          className="rt-inspector__input rt-inspector__input--full"
          type="text"
          placeholder="Debug"
          value={sourceLabel}
          onChange={(e) => setSourceLabel(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="rt-inspector__field">
        <label className="rt-inspector__label">Reason</label>
        <input
          className="rt-inspector__input rt-inspector__input--full"
          type="text"
          placeholder="optionnel"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled}
        />
      </div>

      {error && <p className="rt-inspector__error">{error}</p>}

      <div className="rt-inspector__actions">
        <button
          className="rt-inspector__submit"
          type="submit"
          disabled={disabled || !isValueValid}
        >
          {disabled ? "…" : "Ajouter"}
        </button>
      </div>
    </form>
  );
}

// ─── Panneau principal ────────────────────────────────────────────────────────

/**
 * Cible d'inspection : player courant (absent) ou creature par entityId.
 * Détermine les endpoints appelés — la UI est identique dans les deux modes.
 */
export interface InspectorTarget {
  entityId: string;
  entityKind: "creature";
}

/**
 * Runtime Inspector — inspecte et manipule les RuntimeModifier d'une entité.
 *
 * Lecture : sources, modifiers actifs (snapshot).
 * Manipulation : ajout debug, clear debug, refresh.
 *
 * Modes :
 *   - sans prop target : inspecte le player courant (/player-runtime/me/snapshot)
 *   - target.entityKind === 'creature' : inspecte une créature par entityId
 *
 * Les endpoints debug sont admin-only côté serveur.
 * Le panneau ne vérifie pas le rôle — la UI est déjà dans un HUD admin-only.
 */
export default function RuntimeInspectorPanel({ target }: { target?: InspectorTarget } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<RuntimeInspectableSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (target?.entityKind === "creature") {
        setSnapshot(await fetchCreatureSnapshot(target.entityId));
      } else {
        setSnapshot(await fetchSnapshot());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [target]);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && !snapshot) load();
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    load();
  };

  const handleAdd = useCallback(
    async (input: ModifierFormInput) => {
      if (!snapshot) return;
      setSubmitting(true);
      setFormError(null);
      try {
        if (target?.entityKind === "creature") {
          await addCreatureDebugModifier(snapshot.entityId, input);
        } else {
          await addDebugModifier(snapshot.entityId, input);
        }
        await load();
      } catch (e: unknown) {
        setFormError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setSubmitting(false);
      }
    },
    [snapshot, load, target],
  );

  const handleClear = useCallback(async () => {
    if (!snapshot) return;
    setError(null);
    try {
      if (target?.entityKind === "creature") {
        await clearCreatureDebugModifiers(snapshot.entityId);
      } else {
        await clearDebugModifiers(snapshot.entityId);
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }, [snapshot, load, target]);

  const equipmentModifiers = snapshot ? getEquipmentModifiers(snapshot) : [];
  const debugModifiers = snapshot ? getDebugModifiers(snapshot) : [];

  return (
    <section className="devtools-world__inspector" aria-label="Runtime Inspector">
      <h3
        className="devtools-world__title devtools-world__title--clickable"
        onClick={handleToggle}
      >
        <span className="devtools-world__chevron">{isOpen ? "▼" : "▶"}</span>
        Runtime Inspector
        <button
          className="devtools-world__refresh-btn"
          onClick={handleRefresh}
          title="Rafraîchir"
          type="button"
        >
          ↺
        </button>
      </h3>

      {isOpen && (
        <div className="devtools-world__coordinate-list rt-inspector">
          {loading && (
            <div className="devtools-world__coordinate-row">Chargement…</div>
          )}
          {error && (
            <div className="devtools-world__error">{error}</div>
          )}

          {snapshot && (
            <>
              <ModifierList
                label="Equipment"
                modifiers={equipmentModifiers}
                emptyLabel="Aucun équipement avec modificateurs."
              />

              <ModifierList
                modifiers={debugModifiers}
                onClear={handleClear}
                emptyLabel="Aucun modifier debug actif."
              />

              <ModifierForm
                onSubmit={handleAdd}
                disabled={submitting}
                error={formError}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
