/**
 * Registre de commandes Studio.
 * Chaque commande est pure : elle opère sur un contexte injecté,
 * sans dépendance directe au store ou à React.
 */

export interface StudioCommandContext {
  clearSelectedWorldObject: () => void;
  incrementResourcesRefreshKey: () => void;
  incrementAnimalsRefreshKey: () => void;
}

export interface StudioCommand {
  id: string;
  label: string;
  description: string;
  run(ctx: StudioCommandContext): void;
}

export const STUDIO_COMMANDS: readonly StudioCommand[] = Object.freeze([
  {
    id: "resource.refresh",
    label: "Rafraîchir",
    description: "Recharge la liste des Resources depuis le serveur.",
    run(ctx) {
      ctx.incrementResourcesRefreshKey();
    },
  },
  {
    id: "resource.clearSelection",
    label: "Désélectionner",
    description: "Vide la sélection WorldObject courante.",
    run(ctx) {
      ctx.clearSelectedWorldObject();
    },
  },
  {
    id: "animal.refresh",
    label: "Rafraîchir",
    description: "Recharge la liste des Animals depuis le serveur.",
    run(ctx) {
      ctx.incrementAnimalsRefreshKey();
    },
  },
  {
    id: "animal.clearSelection",
    label: "Désélectionner",
    description: "Vide la sélection WorldObject courante (depuis Animals).",
    run(ctx) {
      ctx.clearSelectedWorldObject();
    },
  },
]);

/** Retourne une commande par son identifiant, ou undefined si inconnue. */
export function getCommand(id: string): StudioCommand | undefined {
  return STUDIO_COMMANDS.find((c) => c.id === id);
}
