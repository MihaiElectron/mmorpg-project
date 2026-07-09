import { useEffect, useState } from "react";
import {
  fetchSkillDefinitions,
  createSkillDefinition,
  updateSkillDefinition,
  deleteSkillDefinition,
  fetchMasterySuggestions,
  fetchDerivedStatSuggestions,
} from "./skillsApi";
import type {
  SkillDefinitionDto,
  CreateSkillDefinitionPayload,
  KeySuggestion,
} from "./skills.types";
import SkillEditorForm from "./SkillEditorForm";
import { notifySkillDefinitionsChanged } from "./skillEvents";
import { useConfirmDialog } from "../../../common/useConfirmDialog";
import "./SkillsModule.scss";

type Selection =
  | { mode: "create"; skill: null }
  | { mode: "edit"; skill: SkillDefinitionDto }
  | null;

export default function SkillsModule() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<SkillDefinitionDto[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selection, setSelection] = useState<Selection>(null);
  const [editorNonce, setEditorNonce] = useState(0);

  const [masterySuggestions, setMasterySuggestions] = useState<KeySuggestion[]>([]);
  const [derivedSuggestions, setDerivedSuggestions] = useState<KeySuggestion[]>([]);

  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  async function reload() {
    setStatus("loading");
    try {
      const list = await fetchSkillDefinitions();
      setSkills(list);
      setStatus("loaded");
    } catch (err) {
      setMessage((err as Error).message);
      setStatus("error");
    }
  }

  useEffect(() => {
    if (!open || status !== "idle") return;
    void reload();
    // Suggestions lecture seule (ne modifient rien) — échec silencieux.
    void fetchMasterySuggestions().then(setMasterySuggestions);
    void fetchDerivedStatSuggestions().then(setDerivedSuggestions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function openCreate() {
    setSelection({ mode: "create", skill: null });
    setEditorNonce((n) => n + 1);
    setMessage(null);
  }

  function openEdit(skill: SkillDefinitionDto) {
    setSelection({ mode: "edit", skill });
    setEditorNonce((n) => n + 1);
    setMessage(null);
  }

  function closeEditor() {
    setSelection(null);
  }

  async function handleSubmit(key: string, payload: CreateSkillDefinitionPayload) {
    setBusy(true);
    setMessage(null);
    try {
      if (selection?.mode === "create") {
        await createSkillDefinition(payload);
        setMessage(`Skill "${key}" créé.`);
      } else {
        const { key: _omit, ...patch } = payload;
        await updateSkillDefinition(key, patch);
        setMessage(`Skill "${key}" enregistré.`);
      }
      await reload();
      setSelection(null);
      // Signale aux surfaces dérivées (SkillActionBar, panneau admin) de refetch.
      notifySkillDefinitionsChanged();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(skill: SkillDefinitionDto) {
    setBusy(true);
    setMessage(null);
    try {
      await updateSkillDefinition(skill.key, { enabled: !skill.enabled });
      await reload();
      notifySkillDefinitionsChanged();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(skill: SkillDefinitionDto) {
    const ok = await confirm({
      title: "Supprimer définitivement",
      message: (
        <>
          Suppression <strong>irréversible</strong> du skill{" "}
          <code>{skill.key}</code>. Pour simplement le retirer du jeu, préférez{" "}
          <em>Désactiver</em>.
        </>
      ),
      variant: "danger",
      confirmLabel: "Supprimer",
      requireTypedConfirmation: skill.key,
    });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteSkillDefinition(skill.key);
      setMessage(`Skill "${skill.key}" supprimé.`);
      if (selection?.mode === "edit" && selection.skill.key === skill.key) {
        setSelection(null);
      }
      await reload();
      notifySkillDefinitionsChanged();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="skills-module">
      <button
        type="button"
        className="skills-module__header"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="skills-module__header-title">⚔️ Skills actifs</span>
        <span className="skills-module__header-chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="skills-module__body">
          <div className="skills-module__toolbar">
            <button
              type="button"
              className="skills-module__btn skills-module__btn--confirm"
              onClick={openCreate}
              disabled={busy}
            >
              + Nouveau skill
            </button>
            <button
              type="button"
              className="skills-module__btn skills-module__btn--neutral"
              onClick={() => void reload()}
              disabled={busy || status === "loading"}
            >
              ↻ Recharger
            </button>
          </div>

          {message && <p className="skills-module__message">{message}</p>}
          {status === "loading" && <p className="skills-module__muted">Chargement…</p>}
          {status === "error" && (
            <p className="skills-module__error">Erreur de chargement.</p>
          )}

          {status === "loaded" && skills.length === 0 && (
            <p className="skills-module__muted">
              Aucun skill défini. Le catalogue démarre vide (V1-A).
            </p>
          )}

          {skills.length > 0 && (
            <ul className="skills-module__list">
              {skills.map((skill) => (
                <li
                  key={skill.key}
                  className={
                    "skills-module__item" +
                    (selection?.mode === "edit" && selection.skill.key === skill.key
                      ? " skills-module__item--active"
                      : "")
                  }
                >
                  <div className="skills-module__item-main">
                    <span className="skills-module__item-name">{skill.name}</span>
                    <code className="skills-module__item-key">{skill.key}</code>
                    <span className="skills-module__item-tags">
                      {skill.effectType} · {skill.targetMode}
                    </span>
                  </div>
                  <span
                    className={
                      "skills-module__badge" +
                      (skill.enabled
                        ? " skills-module__badge--on"
                        : " skills-module__badge--off")
                    }
                  >
                    {skill.enabled ? "activé" : "désactivé"}
                  </span>
                  <div className="skills-module__item-actions">
                    <button
                      type="button"
                      className="skills-module__btn skills-module__btn--neutral"
                      onClick={() => openEdit(skill)}
                      disabled={busy}
                    >
                      Éditer
                    </button>
                    <button
                      type="button"
                      className="skills-module__btn skills-module__btn--neutral"
                      onClick={() => void toggleEnabled(skill)}
                      disabled={busy}
                    >
                      {skill.enabled ? "Désactiver" : "Réactiver"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {selection && (
            <>
              <SkillEditorForm
                mode={selection.mode}
                skill={selection.skill}
                resetToken={String(editorNonce)}
                masterySuggestions={masterySuggestions}
                derivedSuggestions={derivedSuggestions}
                busy={busy}
                onSubmit={handleSubmit}
                onCancel={closeEditor}
              />

              {selection.mode === "edit" && (
                <div className="skills-module__danger">
                  <span className="skills-module__danger-title">Zone danger</span>
                  <p className="skills-module__danger-hint">
                    La suppression est irréversible. Préférez <em>Désactiver</em>{" "}
                    pour retirer un skill sans perdre sa clé.
                  </p>
                  <button
                    type="button"
                    className="skills-module__btn skills-module__btn--danger"
                    onClick={() => void handleDelete(selection.skill)}
                    disabled={busy}
                  >
                    Supprimer définitivement
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {confirmDialog}
    </section>
  );
}
