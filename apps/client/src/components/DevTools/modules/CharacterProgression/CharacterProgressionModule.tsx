import { useEffect, useMemo, useState } from "react";
import {
  fetchGameConfig,
  previewGameConfig,
  updateGameConfig,
  recalculateCharacterProgression,
} from "./characterProgressionApi";
import {
  FIELD_GROUPS,
  type GameConfigDto,
  type GameConfigField,
  type GameConfigPreview,
  type CharacterProgressionRecalculationReport,
} from "./characterProgression.types";
import "./CharacterProgressionModule.scss";

type DraftMap = Record<GameConfigField, string>;

const FIELD_KEYS = FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
const DEFAULT_TARGET_LEVEL = "40";

// Coefficients des 24 dérivées V1 (CharacterStatsCalculator, backend) —
// LECTURE SEULE. Non configurables dans ce chantier (portée limitée au
// remplacement des stats primaires) : les rendre éditables nécessiterait de
// migrer ~24 formules vers GameConfig (nouvelles colonnes, DTO, preview
// serveur dédiée) — un chantier séparé, volontairement non entamé ici pour
// rester sur un diff maîtrisé. Cette liste reflète le code serveur tel quel ;
// la maintenir à jour si les formules évoluent.
const DERIVED_STAT_FORMULAS: { label: string; formula: string }[] = [
  { label: "PV max", formula: "maxHealth brut + Vitalité × 10" },
  { label: "Mana max", formula: "Intelligence × 10 + Sagesse × 5" },
  { label: "Énergie max", formula: "Endurance × 8 + Agilité × 2" },
  { label: "Régén. PV", formula: "Vitalité × 0.5 + Endurance × 0.2" },
  { label: "Régén. mana", formula: "Sagesse × 0.5 + Intelligence × 0.2" },
  { label: "Régén. énergie", formula: "Endurance × 0.3 + Agilité × 0.2" },
  { label: "Attaque physique", formula: "attack brut + Force × 2" },
  { label: "Puissance magique", formula: "Intelligence × 2 + Esprit × 1" },
  { label: "Puissance de soin", formula: "Sagesse × 2 + Esprit × 1" },
  { label: "Défense", formula: "defense brut + Endurance × 1" },
  { label: "Résistance feu", formula: "Esprit × 0.5 + Sagesse × 0.2" },
  { label: "Résistance eau", formula: "Esprit × 0.5 + Intelligence × 0.2" },
  { label: "Résistance air", formula: "Esprit × 0.5 + Agilité × 0.2" },
  { label: "Résistance terre", formula: "Esprit × 0.5 + Endurance × 0.2" },
  { label: "Précision", formula: "Dextérité × 0.5" },
  { label: "Chance critique", formula: "min(50, Dextérité × 0.3 + Agilité × 0.2)" },
  { label: "Dégâts critiques", formula: "150 + Dextérité × 1" },
  { label: "Esquive", formula: "min(40, Agilité × 0.3)" },
  { label: "Parade", formula: "min(40, Force × 0.15 + Dextérité × 0.15)" },
  { label: "Blocage", formula: "min(40, Endurance × 0.2 + Force × 0.1)" },
  { label: "Vitesse d'attaque", formula: "100 + Agilité × 0.3" },
  { label: "Vitesse de déplacement", formula: "100 + Agilité × 0.2 (preview — pas encore branché au déplacement réel)" },
  { label: "Résistance aux contrôles", formula: "min(50, Volonté × 0.4)" },
  { label: "Génération d'aggro", formula: "Charisme × 0.5 + Force × 0.3" },
];

function toDraft(config: GameConfigDto): DraftMap {
  const draft = {} as DraftMap;
  for (const key of FIELD_KEYS) draft[key] = String(config[key]);
  return draft;
}

export default function CharacterProgressionModule() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<GameConfigDto | null>(null);
  const [draft, setDraft] = useState<DraftMap | null>(null);
  const [targetLevelInput, setTargetLevelInput] = useState(DEFAULT_TARGET_LEVEL);
  const [preview, setPreview] = useState<GameConfigPreview | null>(null);
  // JSON du brouillon de CONFIG (hors niveau cible de simulation) au moment du
  // dernier aperçu serveur : sert à désactiver "Appliquer" dès que le
  // brouillon change après un aperçu. Le niveau cible de simulation n'affecte
  // jamais ce statut : ce n'est qu'un paramètre d'affichage, pas une règle
  // globale à sauvegarder.
  const [previewedDraftJson, setPreviewedDraftJson] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Zone danger — recalcul global (ADR-0018 §1, Étape 1B). État séparé du
  // formulaire de règles globales ci-dessus : cette action est destructive et
  // indépendante de "Appliquer" / "Aperçu".
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null);
  const [recalcReport, setRecalcReport] = useState<CharacterProgressionRecalculationReport | null>(null);

  useEffect(() => {
    if (!open || current) return;
    let mounted = true;
    setStatus("loading");
    fetchGameConfig()
      .then((cfg) => {
        if (!mounted) return;
        setCurrent(cfg);
        setDraft(toDraft(cfg));
        setStatus("loaded");
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setMessage(err.message);
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [open, current]);

  const draftJson = useMemo(() => (draft ? JSON.stringify(draft) : ""), [draft]);

  const invalidKeys = useMemo(() => {
    if (!draft) return [] as GameConfigField[];
    return FIELD_KEYS.filter((key) => {
      const raw = draft[key];
      return raw.trim() === "" || Number.isNaN(Number(raw));
    });
  }, [draft]);

  const targetLevelInvalid =
    targetLevelInput.trim() === "" ||
    Number.isNaN(Number(targetLevelInput)) ||
    Number(targetLevelInput) < 2;

  const dirty = useMemo(() => {
    if (!draft || !current) return false;
    return FIELD_KEYS.some((key) => Number(draft[key]) !== current[key]);
  }, [draft, current]);

  const hasInvalid = invalidKeys.length > 0;
  const previewStale = preview !== null && previewedDraftJson !== draftJson;
  const canPreview = !hasInvalid && !targetLevelInvalid && !busy;
  const canApply = preview !== null && !previewStale && dirty && !hasInvalid;

  function setField(key: GameConfigField, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function buildPayload(): Partial<GameConfigDto> {
    const payload: Partial<GameConfigDto> = {};
    if (!draft) return payload;
    for (const key of FIELD_KEYS) payload[key] = Number(draft[key]);
    return payload;
  }

  async function handlePreview() {
    if (!canPreview) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await previewGameConfig(
        buildPayload(),
        Number(targetLevelInput),
      );
      setPreview(result);
      setPreviewedDraftJson(draftJson);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur aperçu.");
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    if (!canApply) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await updateGameConfig(buildPayload());
      setCurrent(saved);
      setDraft(toDraft(saved));
      setPreview(null);
      setPreviewedDraftJson(null);
      setMessage("Règles globales appliquées.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur application.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRecalculate() {
    const confirmed = window.confirm(
      "Action irréversible : cela va recalculer le niveau de TOUS les " +
        "personnages selon leur XP cumulée et la courbe XP actuelle, " +
        "remettre à 0 leurs stats primaires distribuées et recalculer " +
        "leurs points disponibles. Les joueurs devront redistribuer " +
        "leurs points. Continuer ?",
    );
    if (!confirmed) return;
    setRecalcBusy(true);
    setRecalcMessage(null);
    try {
      const report = await recalculateCharacterProgression();
      setRecalcReport(report);
      setRecalcMessage(
        `Recalcul terminé : ${report.processedCharacterCount}/${report.totalCharacterCount} personnage(s) traité(s).`,
      );
    } catch (err) {
      setRecalcMessage(
        err instanceof Error ? err.message : "Erreur recalcul.",
      );
    } finally {
      setRecalcBusy(false);
    }
  }

  return (
    <section
      className="character-progression"
      aria-label="Character Progression"
    >
      <div
        className="character-progression__header"
        onClick={() => setOpen((v) => !v)}
      >
        <h3 className="character-progression__title">
          <span className="character-progression__chevron">
            {open ? "▼" : "▶"}
          </span>
          Character Progression
        </h3>
        <span className="character-progression__count">Règles globales</span>
      </div>

      {open && (
        <>
          {status === "loading" && (
            <p className="character-progression__status">Chargement...</p>
          )}
          {status === "error" && (
            <p className="character-progression__status character-progression__status--error">
              {message ?? "Impossible de charger les règles globales."}
            </p>
          )}

          {status === "loaded" && current && draft && (
            <div className="character-progression__body">
              <p className="character-progression__note character-progression__note--warn">
                ⚠ "Appliquer" ne modifie que les règles globales. Les
                personnages existants ne sont PAS recalculés par cette action —
                utiliser la zone danger ci-dessous pour recalculer leurs points
                de stats.
              </p>

              {FIELD_GROUPS.map((group) => (
                <fieldset
                  key={group.id}
                  className="character-progression__group"
                >
                  <legend className="character-progression__group-title">
                    {group.title}
                  </legend>
                  {group.fields.map((field) => {
                    const raw = draft[field.key];
                    const num = Number(raw);
                    const invalid = raw.trim() === "" || Number.isNaN(num);
                    const modified = !invalid && num !== current[field.key];
                    return (
                      <label
                        key={field.key}
                        className={
                          "character-progression__field" +
                          (modified
                            ? " character-progression__field--modified"
                            : "") +
                          (invalid
                            ? " character-progression__field--invalid"
                            : "")
                        }
                      >
                        <span className="character-progression__label">
                          {field.label}
                        </span>
                        <input
                          className="character-progression__input"
                          type="number"
                          step={field.step}
                          value={raw}
                          onChange={(e) => setField(field.key, e.target.value)}
                        />
                        <span className="character-progression__field-current">
                          actuel : {current[field.key]}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}

              <fieldset className="character-progression__group character-progression__group--formulas">
                <legend className="character-progression__group-title">
                  Coefficients des stats dérivées (lecture seule)
                </legend>
                <p className="character-progression__note">
                  Formules V1 codées côté serveur (CharacterStatsCalculator),
                  non configurables dans ce chantier. Rendre ces coefficients
                  éditables est un chantier séparé (migration vers GameConfig).
                </p>
                <ul className="character-progression__formulas">
                  {DERIVED_STAT_FORMULAS.map((f) => (
                    <li key={f.label} className="character-progression__formula-row">
                      <span className="character-progression__formula-label">{f.label}</span>
                      <span className="character-progression__formula-value">{f.formula}</span>
                    </li>
                  ))}
                </ul>
              </fieldset>

              <fieldset className="character-progression__group character-progression__group--simulation">
                <legend className="character-progression__group-title">
                  Simulation XP
                </legend>
                <label
                  className={
                    "character-progression__field" +
                    (targetLevelInvalid
                      ? " character-progression__field--invalid"
                      : "")
                  }
                >
                  <span className="character-progression__label">
                    Niveau cible
                  </span>
                  <input
                    className="character-progression__input"
                    type="number"
                    min={2}
                    step={1}
                    value={targetLevelInput}
                    onChange={(e) => setTargetLevelInput(e.target.value)}
                  />
                  <span className="character-progression__field-current">
                    ex : 40
                  </span>
                </label>

                {preview && (
                  <div className="character-progression__simulation-result">
                    <span className="character-progression__simulation-transition">
                      {preview.simulation.previousLevel} → {preview.simulation.targetLevel}
                    </span>
                    <span className="character-progression__simulation-xp">
                      {preview.simulation.xpForTransition} XP requis
                    </span>
                    <span className="character-progression__simulation-cumulative">
                      Cumul depuis niveau 1 : {preview.simulation.cumulativeXpToTarget} XP
                    </span>
                  </div>
                )}
                {!preview && (
                  <p className="character-progression__status">
                    Lancer un aperçu pour voir la simulation.
                  </p>
                )}
              </fieldset>

              <div className="character-progression__actions">
                {message && (
                  <span
                    className={
                      "character-progression__message" +
                      (message.startsWith("Erreur")
                        ? " character-progression__message--error"
                        : "")
                    }
                  >
                    {message}
                  </span>
                )}
                <button
                  type="button"
                  className="character-progression__btn"
                  onClick={handlePreview}
                  disabled={!canPreview}
                >
                  Aperçu
                </button>
                <button
                  type="button"
                  className="character-progression__btn character-progression__btn--primary"
                  onClick={handleApply}
                  disabled={!canApply || busy}
                  title={
                    preview === null
                      ? "Lancer un aperçu avant d'appliquer"
                      : previewStale
                        ? "Brouillon modifié depuis l'aperçu — relancer l'aperçu"
                        : undefined
                  }
                >
                  Appliquer
                </button>
              </div>

              {preview && (
                <div className="character-progression__preview">
                  <div className="character-progression__preview-head">
                    <span className="character-progression__preview-title">
                      Aperçu serveur
                    </span>
                    {previewStale && (
                      <span className="character-progression__preview-stale">
                        Brouillon modifié — relancer l'aperçu
                      </span>
                    )}
                  </div>
                  <p className="character-progression__preview-line">
                    Personnages concernés : {preview.affectedCharacterCount}
                  </p>
                  <table className="character-progression__samples">
                    <thead>
                      <tr>
                        <th>Niveau</th>
                        <th>Points de stats (total)</th>
                        <th>XP pour ce niveau</th>
                        <th>XP cumulée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.samples.map((s) => (
                        <tr key={s.level}>
                          <td>{s.level}</td>
                          <td>{s.totalStatPoints}</td>
                          <td>{s.xpToReachLevel}</td>
                          <td>{s.cumulativeXp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="character-progression__preview-note">
                    {preview.note}
                  </p>
                </div>
              )}

              <section
                className="character-progression__danger-zone"
                aria-label="Zone danger — recalcul de la progression"
              >
                <h4 className="character-progression__danger-title">
                  ⚠ Zone danger
                </h4>
                <p className="character-progression__danger-text">
                  Cette action recalcule le niveau des personnages selon leur
                  XP cumulée et la courbe XP actuelle, remet les stats
                  attribuées à zéro et rend les points disponibles.
                </p>
                <div className="character-progression__danger-actions">
                  {recalcMessage && (
                    <span
                      className={
                        "character-progression__message" +
                        (recalcMessage.startsWith("Erreur")
                          ? " character-progression__message--error"
                          : "")
                      }
                    >
                      {recalcMessage}
                    </span>
                  )}
                  <button
                    type="button"
                    className="character-progression__btn character-progression__btn--danger"
                    onClick={handleRecalculate}
                    disabled={recalcBusy}
                  >
                    Recalculer la progression de tous les personnages
                  </button>
                </div>

                {recalcReport && (
                  <div className="character-progression__danger-report">
                    <p className="character-progression__preview-line">
                      Personnages traités : {recalcReport.processedCharacterCount} / {recalcReport.totalCharacterCount}
                    </p>
                    <p className="character-progression__preview-line">
                      Niveaux modifiés : {recalcReport.levelsChangedCount}
                    </p>
                    <p className="character-progression__preview-line">
                      XP cumulée totale utilisée : {recalcReport.totalCumulativeExperienceUsed}
                    </p>
                    <p className="character-progression__preview-line">
                      Ancienne somme de points distribués : {recalcReport.oldDistributedTotal}
                    </p>
                    <p className="character-progression__preview-line">
                      Nouveau total disponible : {recalcReport.newAvailableTotal}
                    </p>
                    <p className="character-progression__preview-line">
                      Joueurs connectés notifiés en temps réel : {recalcReport.notifiedConnectedCharacterCount}
                    </p>
                    {recalcReport.errors.length > 0 && (
                      <div className="character-progression__danger-errors">
                        <span className="character-progression__status character-progression__status--error">
                          {recalcReport.errors.length} erreur(s) :
                        </span>
                        <ul>
                          {recalcReport.errors.map((e) => (
                            <li key={e.characterId}>
                              {e.characterId} — {e.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
