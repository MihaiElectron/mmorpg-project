/**
 * Formatage d'horodatage pour la fenêtre Chat / Logs (pur, testable).
 * Heure locale du navigateur au format HH:mm:ss ; fallback sobre si invalide.
 */
export function formatClock(ts: string | number | Date | null | undefined): string {
  if (ts === null || ts === undefined) return "--:--:--";
  const date = ts instanceof Date ? ts : new Date(ts);
  const time = date.getTime();
  if (Number.isNaN(time)) return "--:--:--";

  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
