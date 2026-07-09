import { useEffect, useRef, useState, type ReactNode } from "react";
import "./ConfirmDialog.scss";

export type ConfirmDialogVariant = "default" | "danger";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  onConfirm: () => void;
  onCancel: () => void;
  /** Bouton Confirmer en état de chargement (empêche double-clic, bloque Escape). */
  loading?: boolean;
  /** Désactive le bouton Confirmer indépendamment du texte de confirmation. */
  disabled?: boolean;
  /**
   * Si fourni, le bouton Confirmer reste désactivé tant que l'admin n'a pas
   * retapé exactement ce texte — garde-fou supplémentaire pour une action
   * vraiment destructive (ex: suppression définitive d'un template).
   */
  requireTypedConfirmation?: string;
}

/**
 * Modale de confirmation générique, réutilisable dans tout le client
 * (DevTools et pages joueur) — remplace window.confirm/alert. Ne contient
 * aucune logique métier : le composant appelant décide de l'action réelle
 * dans onConfirm (appel API, payload confirm:true côté serveur, etc.).
 *
 * Usage direct via les props, ou via le hook `useConfirmDialog` (même
 * dossier) pour un usage impératif proche de `window.confirm` (await).
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "default",
  onConfirm,
  onCancel,
  loading = false,
  disabled = false,
  requireTypedConfirmation,
}: ConfirmDialogProps) {
  const [typedText, setTypedText] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setTypedText("");
      // Focus sur Annuler par défaut : évite qu'un Entrée accidentel
      // déclenche une action destructive.
      cancelRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const typedMismatch =
    requireTypedConfirmation != null && typedText !== requireTypedConfirmation;
  const confirmDisabled = disabled || loading || typedMismatch;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && !loading) onCancel();
  }

  return (
    <div className="confirm-dialog__overlay" onKeyDown={handleKeyDown}>
      <div
        className={`confirm-dialog${variant === "danger" ? " confirm-dialog--danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3 className="confirm-dialog__title">{title}</h3>
        <div className="confirm-dialog__message">{message}</div>

        {requireTypedConfirmation != null && (
          <label className="confirm-dialog__typed-field">
            <span className="confirm-dialog__typed-label">
              Tapez "{requireTypedConfirmation}" pour confirmer :
            </span>
            <input
              className="confirm-dialog__typed-input"
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        <div className="confirm-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--cancel"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              "confirm-dialog__btn" +
              (variant === "danger" ? " confirm-dialog__btn--danger" : " confirm-dialog__btn--confirm")
            }
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {loading ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
