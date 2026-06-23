import { STUDIO_COMMANDS } from "../../../components/DevTools/commands/studioCommands";
import type { CommandProvider } from "./CapabilityProvider";

// IDs des commandes module-level exposées pour les Resources.
// Elles sont identiques quelle que soit l'instance Resource sélectionnée.
const RESOURCE_COMMAND_IDS = new Set([
  "resource.refresh",
  "resource.clearSelection",
  "resource.forceRespawn",
  "resource.resetFromTemplate",
]);

/**
 * Provider de commandes pour les WorldObjects portant la capability "harvestable".
 *
 * Les commandes exposées sont module-level (refresh liste + vider sélection).
 * Elles ne dépendent pas de l'instance spécifique sélectionnée.
 * STUDIO_COMMANDS reste la source de vérité — ce provider filtre et redirige.
 */
export const resourceCommandProvider: CommandProvider = {
  kind: "command",
  capabilities: ["harvestable"],
  getCommands(_context) {
    return STUDIO_COMMANDS.filter((c) => RESOURCE_COMMAND_IDS.has(c.id));
  },
};
