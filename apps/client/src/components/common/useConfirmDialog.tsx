import { useCallback, useRef, useState, type ReactNode } from "react";
import ConfirmDialog, { type ConfirmDialogVariant } from "./ConfirmDialog";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  requireTypedConfirmation?: string;
}

/**
 * Équivalent impératif de `window.confirm`, mais rendu via ConfirmDialog
 * (React, intégré au style DevTools) au lieu de la boîte de dialogue
 * navigateur. Usage :
 *
 *   const { confirm, dialog } = useConfirmDialog();
 *   ...
 *   if (!(await confirm({ title: "...", message: "..." }))) return;
 *   ...
 *   return <>{dialog}{...reste du composant}</>;
 *
 * Ne gère aucune logique métier ni appel réseau : uniquement la décision
 * utilisateur (true = confirmé, false = annulé/Escape).
 */
export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={options !== null}
      title={options?.title ?? ""}
      message={options?.message ?? ""}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      variant={options?.variant}
      requireTypedConfirmation={options?.requireTypedConfirmation}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}
