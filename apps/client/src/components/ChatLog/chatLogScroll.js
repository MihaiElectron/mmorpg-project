/**
 * chatLogScroll.js
 * ----------------------------------------------------------------------------
 * Logique PURE du défilement du journal (Combat/Événements). Extraite du
 * composant pour rester testable sans DOM (env vitest "node"), aucun état
 * partagé, aucun effet de bord. Le composant applique ces décisions sur le
 * conteneur scrollable réel.
 */

// Tolérance basse : les arrondis CSS peuvent laisser quelques pixels d'écart
// entre le bas réel et `scrollTop`. On considère l'utilisateur "en bas" tant
// que la distance restante est inférieure ou égale à ce seuil.
export const BOTTOM_THRESHOLD_PX = 8;

/**
 * Distance (px) entre la position actuelle et le bas du conteneur.
 * distanceBottom = scrollHeight - scrollTop - clientHeight
 */
export function distanceFromBottom({ scrollHeight, scrollTop, clientHeight }) {
  return scrollHeight - scrollTop - clientHeight;
}

/** L'utilisateur est-il "en bas" (à la tolérance près) ? */
export function isAtBottom(metrics, threshold = BOTTOM_THRESHOLD_PX) {
  return distanceFromBottom(metrics) <= threshold;
}

/** Id de la dernière entrée affichée, ou null si la liste est vide. */
export function lastEntryId(entries) {
  return entries.length ? entries[entries.length - 1].id : null;
}

/**
 * Décompose une transition de la liste filtrée entre deux rendus :
 * - `addedCount` : entrées ajoutées en fin (ids strictement supérieurs au
 *   dernier id connu ; ids monotones croissants garantis par le store) ;
 * - `removedCount` : entrées retirées en tête par le trimming du store
 *   (déduit sans stocker l'ancienne liste : prevLen + added - newLen).
 */
export function computeTrimDelta({ prevLen, prevLastId, entries }) {
  const lastId = prevLastId ?? 0;
  let addedCount = 0;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].id > lastId) addedCount += 1;
    else break;
  }
  const removedCount = Math.max(0, prevLen + addedCount - entries.length);
  return { addedCount, removedCount };
}

/**
 * Action de défilement à appliquer après l'ajout de messages :
 * - "follow"     : l'utilisateur était en bas → suivre le nouveau bas ;
 * - "compensate" : l'utilisateur consulte l'historique ET un trim a retiré des
 *   entrées en tête → compenser pour garder la ligne consultée stable ;
 * - "none"       : ne rien toucher (append pur pendant la lecture d'historique).
 */
export function resolveScrollAction({ stick, removedCount }) {
  if (stick) return "follow";
  if (removedCount > 0) return "compensate";
  return "none";
}

/**
 * Nouveau `scrollTop` préservant visuellement la position consultée lorsqu'un
 * trim retire `removedCount` entrées en tête. On estime la hauteur retirée à
 * partir de la hauteur moyenne d'une entrée (entrées de log ~ hauteur uniforme)
 * et on remonte `scrollTop` d'autant. Aucun trim → position inchangée.
 */
export function computeHistoryScrollTop({
  prevScrollTop,
  prevScrollHeight,
  prevLen,
  removedCount,
}) {
  if (removedCount <= 0 || prevLen <= 0) return prevScrollTop;
  const avgHeight = prevScrollHeight / prevLen;
  return Math.max(0, prevScrollTop - removedCount * avgHeight);
}
