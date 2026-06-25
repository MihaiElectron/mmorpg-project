/**
 * Registre de commandes Studio.
 * Chaque commande est pure : elle opère sur un contexte injecté,
 * sans dépendance directe au store ou à React.
 */

export interface StudioCommandContext {
  clearSelectedWorldObject: () => void;
  incrementResourcesRefreshKey: () => void;
  incrementCreaturesRefreshKey: () => void;
  incrementCreatureSpawnsRefreshKey: () => void;
  /** ID du WorldObject sélectionné — requis pour les commandes object-level. */
  selectedWorldObjectId: string | null;
}

export interface StudioCommand {
  id: string;
  label: string;
  description: string;
  run(ctx: StudioCommandContext): void | Promise<void>;
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
    id: "creature.refresh",
    label: "Rafraîchir",
    description: "Recharge la liste des Creatures depuis le serveur.",
    run(ctx) {
      ctx.incrementCreaturesRefreshKey();
    },
  },
  {
    id: "creature.clearSelection",
    label: "Désélectionner",
    description: "Vide la sélection WorldObject courante (depuis Creatures).",
    run(ctx) {
      ctx.clearSelectedWorldObject();
    },
  },
  {
    id: "creature_spawn.refresh",
    label: "Rafraîchir",
    description: "Recharge la liste des CreatureSpawns depuis le serveur.",
    run(ctx) {
      ctx.incrementCreatureSpawnsRefreshKey();
    },
  },
  {
    id: "resource.forceRespawn",
    label: "Force Respawn",
    description: "Force le respawn immédiat de la Resource sélectionnée via l'API admin.",
    async run(ctx) {
      const id = ctx.selectedWorldObjectId;
      if (!id) return;
      const apiUrl = (import.meta as Record<string, any>).env?.VITE_API_URL ?? "";
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(`${apiUrl}/admin/resources/${id}/force-respawn`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        ctx.incrementResourcesRefreshKey();
      }
    },
  },
  {
    id: "resource.resetFromTemplate",
    label: "Reset from Template",
    description: "Réinitialise remainingLoots et state depuis le template de la Resource sélectionnée.",
    async run(ctx) {
      const id = ctx.selectedWorldObjectId;
      if (!id) return;
      const apiUrl = (import.meta as Record<string, any>).env?.VITE_API_URL ?? "";
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(`${apiUrl}/admin/resources/${id}/reset-from-template`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        ctx.incrementResourcesRefreshKey();
      }
    },
  },
]);

/** Retourne une commande par son identifiant, ou undefined si inconnue. */
export function getCommand(id: string): StudioCommand | undefined {
  return STUDIO_COMMANDS.find((c) => c.id === id);
}
