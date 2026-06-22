// Compatibilité — console, historique et lastClickedPos ont migré vers
// devtools.store.ts. Supprimer ce fichier quand tous les imports sont mis à jour.
export {
  useDevToolsStore as useAdminStore,
  getDevToolsStore as getAdminStore,
} from "./devtools.store";
export type { DevToolsPos as AdminPos } from "./devtools.store";
