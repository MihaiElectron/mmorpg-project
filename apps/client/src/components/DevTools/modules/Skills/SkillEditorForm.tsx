import { useEffect, useState } from "react";
import AssetPicker from "../../AssetPicker";
import KeyValueRowsEditor from "./KeyValueRowsEditor";
import {
  SKILL_EFFECT_TYPES,
  SKILL_RESOURCE_TYPES,
  SKILL_TARGET_MODES,
  PRIMARY_STAT_KEYS,
  type SkillDefinitionDto,
  type SkillEffectType,
  type SkillResourceType,
  type SkillTargetMode,
  type KeySuggestion,
  type CreateSkillDefinitionPayload,
  type SkillScaling,
} from "./skills.types";

const KEY_PATTERN = /^[a-z0-9_]+$/;

// Champs numériques + plancher (aligné sur les DTO backend @Min).
const NUMERIC_FIELDS = [
  { key: "requiredLevel", label: "requiredLevel", min: 1 },
  { key: "resourceCost", label: "resourceCost", min: 0 },
  { key: "cooldownMs", label: "cooldownMs", min: 0 },
  { key: "castTimeMs", label: "castTimeMs", min: 0 },
  { key: "rangeWU", label: "rangeWU", min: 0 },
  { key: "radiusWU", label: "radiusWU", min: 0 },
] as const;

type NumericKey = (typeof NUMERIC_FIELDS)[number]["key"];

interface Draft {
  name: string;
  description: string;
  iconAssetPath: string;
  enabled: boolean;
  requiredClass: string;
  resourceType: "" | SkillResourceType;
  targetMode: SkillTargetMode;
  effectType: SkillEffectType;
  requiredLevel: string;
  resourceCost: string;
  cooldownMs: string;
  castTimeMs: string;
  rangeWU: string;
  radiusWU: string;
}

const PRIMARY_SUGGESTIONS: KeySuggestion[] = PRIMARY_STAT_KEYS.map((k) => ({
  key: k,
  label: k,
}));

function draftFrom(skill: SkillDefinitionDto | null): Draft {
  return {
    name: skill?.name ?? "",
    description: skill?.description ?? "",
    iconAssetPath: skill?.iconAssetPath ?? "",
    enabled: skill?.enabled ?? true,
    requiredClass: skill?.requiredClass ?? "",
    resourceType: skill?.resourceType ?? "",
    targetMode: skill?.targetMode ?? "creature",
    effectType: skill?.effectType ?? "damage",
    requiredLevel: String(skill?.requiredLevel ?? 1),
    resourceCost: String(skill?.resourceCost ?? 0),
    cooldownMs: String(skill?.cooldownMs ?? 1000),
    castTimeMs: String(skill?.castTimeMs ?? 0),
    rangeWU: String(skill?.rangeWU ?? 1),
    radiusWU: String(skill?.radiusWU ?? 0),
  };
}

interface SkillEditorFormProps {
  mode: "create" | "edit";
  /** Skill édité (edit) — sert de valeurs initiales. Null en création. */
  skill: SkillDefinitionDto | null;
  /** Change à chaque cible pour réinitialiser le formulaire (key ou "new"). */
  resetToken: string;
  masterySuggestions: KeySuggestion[];
  derivedSuggestions: KeySuggestion[];
  busy: boolean;
  onSubmit: (key: string, payload: CreateSkillDefinitionPayload) => void;
  onCancel: () => void;
}

export default function SkillEditorForm({
  mode,
  skill,
  resetToken,
  masterySuggestions,
  derivedSuggestions,
  busy,
  onSubmit,
  onCancel,
}: SkillEditorFormProps) {
  const [keyInput, setKeyInput] = useState(skill?.key ?? "");
  const [draft, setDraft] = useState<Draft>(() => draftFrom(skill));
  const [requiredMasteries, setRequiredMasteries] = useState<Record<string, number>>(
    skill?.requiredMasteries ?? {},
  );
  const [primaryCoef, setPrimaryCoef] = useState<Record<string, number>>(
    skill?.scaling?.primaryCoefficients ?? {},
  );
  const [derivedCoef, setDerivedCoef] = useState<Record<string, number>>(
    skill?.scaling?.derivedCoefficients ?? {},
  );
  const [masteryCoef, setMasteryCoef] = useState<Record<string, number>>(
    skill?.scaling?.masteryCoefficients ?? {},
  );
  const [localError, setLocalError] = useState<string | null>(null);

  // Réinitialise tout le formulaire quand la cible change.
  useEffect(() => {
    setKeyInput(skill?.key ?? "");
    setDraft(draftFrom(skill));
    setRequiredMasteries(skill?.requiredMasteries ?? {});
    setPrimaryCoef(skill?.scaling?.primaryCoefficients ?? {});
    setDerivedCoef(skill?.scaling?.derivedCoefficients ?? {});
    setMasteryCoef(skill?.scaling?.masteryCoefficients ?? {});
    setLocalError(null);
    // resetToken est le déclencheur voulu ; skill est lu à travers lui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (mode === "create") {
      if (!keyInput.trim()) return "La clé est requise.";
      if (!KEY_PATTERN.test(keyInput)) return "Clé invalide ([a-z0-9_] uniquement).";
    }
    if (!draft.name.trim()) return "Le nom est requis.";
    for (const f of NUMERIC_FIELDS) {
      const raw = draft[f.key as NumericKey];
      const n = Number(raw);
      if (raw.trim() === "" || !Number.isInteger(n)) return `${f.label} doit être un entier.`;
      if (n < f.min) return `${f.label} doit être >= ${f.min}.`;
    }
    return null;
  }

  function buildScaling(): SkillScaling {
    const scaling: SkillScaling = {};
    if (Object.keys(primaryCoef).length) scaling.primaryCoefficients = primaryCoef;
    if (Object.keys(derivedCoef).length) scaling.derivedCoefficients = derivedCoef;
    if (Object.keys(masteryCoef).length) scaling.masteryCoefficients = masteryCoef;
    return scaling;
  }

  function handleSubmit() {
    const err = validate();
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    const payload: CreateSkillDefinitionPayload = {
      key: keyInput.trim(),
      name: draft.name.trim(),
      description: draft.description,
      iconAssetPath: draft.iconAssetPath.trim() === "" ? null : draft.iconAssetPath,
      enabled: draft.enabled,
      requiredLevel: Number(draft.requiredLevel),
      requiredClass: draft.requiredClass.trim() === "" ? null : draft.requiredClass.trim(),
      requiredMasteries,
      resourceType: draft.resourceType === "" ? null : draft.resourceType,
      resourceCost: Number(draft.resourceCost),
      cooldownMs: Number(draft.cooldownMs),
      castTimeMs: Number(draft.castTimeMs),
      rangeWU: Number(draft.rangeWU),
      radiusWU: Number(draft.radiusWU),
      targetMode: draft.targetMode,
      effectType: draft.effectType,
      scaling: buildScaling(),
    };
    const key = mode === "create" ? payload.key : (skill?.key ?? "");
    onSubmit(key, payload);
  }

  return (
    <div className="skills-editor">
      <h4 className="skills-editor__title">
        {mode === "create" ? "Nouveau skill" : `Édition — ${skill?.key}`}
      </h4>

      {/* ── Identité ─────────────────────────────────────────────── */}
      <div className="skills-editor__grid">
        <label className="skills-editor__field">
          <span className="skills-editor__label">key {mode === "edit" && "(immuable)"}</span>
          <input
            className="skills-editor__input"
            type="text"
            value={keyInput}
            disabled={mode === "edit"}
            placeholder="power_strike"
            onChange={(e) => setKeyInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="skills-editor__field">
          <span className="skills-editor__label">name</span>
          <input
            className="skills-editor__input"
            type="text"
            value={draft.name}
            onChange={(e) => setField("name", e.target.value)}
          />
        </label>

        <label className="skills-editor__field skills-editor__field--wide">
          <span className="skills-editor__label">description</span>
          <textarea
            className="skills-editor__textarea"
            rows={2}
            value={draft.description}
            onChange={(e) => setField("description", e.target.value)}
          />
        </label>

        <label className="skills-editor__field skills-editor__field--wide">
          <span className="skills-editor__label">iconAssetPath</span>
          <AssetPicker
            value={draft.iconAssetPath}
            onChange={(path) => setField("iconAssetPath", path)}
            category="images"
          />
        </label>
      </div>

      {/* ── Prérequis ────────────────────────────────────────────── */}
      <fieldset className="skills-editor__group">
        <legend className="skills-editor__legend">Prérequis</legend>
        <div className="skills-editor__grid">
          <label className="skills-editor__field">
            <span className="skills-editor__label">requiredLevel</span>
            <input
              className="skills-editor__input"
              type="number"
              min={1}
              value={draft.requiredLevel}
              onChange={(e) => setField("requiredLevel", e.target.value)}
            />
          </label>
          <label className="skills-editor__field">
            <span className="skills-editor__label">requiredClass (différé)</span>
            <input
              className="skills-editor__input"
              type="text"
              value={draft.requiredClass}
              placeholder="(aucune)"
              onChange={(e) => setField("requiredClass", e.target.value)}
            />
          </label>
        </div>
        <div className="skills-editor__subblock">
          <span className="skills-editor__label">requiredMasteries</span>
          <KeyValueRowsEditor
            resetToken={resetToken}
            initial={skill?.requiredMasteries ?? {}}
            onChange={setRequiredMasteries}
            suggestions={masterySuggestions}
            keyPlaceholder="masteryKey"
            valuePlaceholder="niveau"
            integer
            addLabel="+ mastery requise"
            emptyLabel="Aucune mastery requise."
          />
        </div>
      </fieldset>

      {/* ── Coût / timing / portée ───────────────────────────────── */}
      <fieldset className="skills-editor__group">
        <legend className="skills-editor__legend">Coût, timing, portée</legend>
        <div className="skills-editor__grid">
          <label className="skills-editor__field">
            <span className="skills-editor__label">resourceType</span>
            <select
              className="skills-editor__input"
              value={draft.resourceType}
              onChange={(e) => setField("resourceType", e.target.value as Draft["resourceType"])}
            >
              <option value="">(aucun)</option>
              {SKILL_RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="skills-editor__field">
            <span className="skills-editor__label">resourceCost</span>
            <input
              className="skills-editor__input"
              type="number"
              min={0}
              value={draft.resourceCost}
              onChange={(e) => setField("resourceCost", e.target.value)}
            />
          </label>
          <label className="skills-editor__field">
            <span className="skills-editor__label">cooldownMs</span>
            <input
              className="skills-editor__input"
              type="number"
              min={0}
              value={draft.cooldownMs}
              onChange={(e) => setField("cooldownMs", e.target.value)}
            />
          </label>
          <label className="skills-editor__field">
            <span className="skills-editor__label">castTimeMs</span>
            <input
              className="skills-editor__input"
              type="number"
              min={0}
              value={draft.castTimeMs}
              onChange={(e) => setField("castTimeMs", e.target.value)}
            />
          </label>
          <label className="skills-editor__field">
            <span className="skills-editor__label">rangeWU</span>
            <input
              className="skills-editor__input"
              type="number"
              min={0}
              value={draft.rangeWU}
              onChange={(e) => setField("rangeWU", e.target.value)}
            />
          </label>
          <label className="skills-editor__field">
            <span className="skills-editor__label">radiusWU</span>
            <input
              className="skills-editor__input"
              type="number"
              min={0}
              value={draft.radiusWU}
              onChange={(e) => setField("radiusWU", e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      {/* ── Ciblage / effet ──────────────────────────────────────── */}
      <fieldset className="skills-editor__group">
        <legend className="skills-editor__legend">Ciblage & effet</legend>
        <div className="skills-editor__grid">
          <label className="skills-editor__field">
            <span className="skills-editor__label">targetMode</span>
            <select
              className="skills-editor__input"
              value={draft.targetMode}
              onChange={(e) => setField("targetMode", e.target.value as SkillTargetMode)}
            >
              {SKILL_TARGET_MODES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="skills-editor__field">
            <span className="skills-editor__label">effectType</span>
            <select
              className="skills-editor__input"
              value={draft.effectType}
              onChange={(e) => setField("effectType", e.target.value as SkillEffectType)}
            >
              {SKILL_EFFECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="skills-editor__field skills-editor__field--checkbox">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setField("enabled", e.target.checked)}
            />
            <span className="skills-editor__label">enabled</span>
          </label>
        </div>
      </fieldset>

      {/* ── Scaling ──────────────────────────────────────────────── */}
      <fieldset className="skills-editor__group">
        <legend className="skills-editor__legend">Scaling (coefficients serveur)</legend>

        <div className="skills-editor__subblock">
          <span className="skills-editor__label">primaryCoefficients</span>
          <KeyValueRowsEditor
            resetToken={resetToken}
            initial={skill?.scaling?.primaryCoefficients ?? {}}
            onChange={setPrimaryCoef}
            suggestions={PRIMARY_SUGGESTIONS}
            keyPlaceholder="stat primaire"
            valuePlaceholder="coef"
            addLabel="+ primaire"
            emptyLabel="Aucun coefficient primaire."
          />
        </div>

        <div className="skills-editor__subblock">
          <span className="skills-editor__label">derivedCoefficients</span>
          <KeyValueRowsEditor
            resetToken={resetToken}
            initial={skill?.scaling?.derivedCoefficients ?? {}}
            onChange={setDerivedCoef}
            suggestions={derivedSuggestions}
            keyPlaceholder="stat dérivée"
            valuePlaceholder="coef"
            addLabel="+ dérivée"
            emptyLabel="Aucun coefficient dérivé."
          />
        </div>

        <div className="skills-editor__subblock">
          <span className="skills-editor__label">masteryCoefficients</span>
          <KeyValueRowsEditor
            resetToken={resetToken}
            initial={skill?.scaling?.masteryCoefficients ?? {}}
            onChange={setMasteryCoef}
            suggestions={masterySuggestions}
            keyPlaceholder="masteryKey"
            valuePlaceholder="coef"
            addLabel="+ mastery"
            emptyLabel="Aucun coefficient mastery."
          />
        </div>
      </fieldset>

      {localError && <p className="skills-editor__error">{localError}</p>}

      <div className="skills-editor__actions">
        <button
          type="button"
          className="skills-editor__btn skills-editor__btn--neutral"
          onClick={onCancel}
          disabled={busy}
        >
          Annuler
        </button>
        <button
          type="button"
          className="skills-editor__btn skills-editor__btn--confirm"
          onClick={handleSubmit}
          disabled={busy}
        >
          {busy ? "…" : mode === "create" ? "Créer" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
