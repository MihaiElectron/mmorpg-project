import { spawnCreature, teleportCharacter, updateTemplate } from "./admin.actions";
import type { ActionResult } from "./admin.actions";

export type CommandContext = {
  socket: any;
  token: string;
  getTarget: () => { id: string; kind: string; type: string } | null;
  getCharacterPos: () => { x: number; y: number } | null;
  getLastClickedPos: () => { x: number; y: number } | null;
  getTemplateKeys: () => string[];
};

export type CommandDef = {
  description: string;
  usage: string;
  argNames: string[];
  destructive?: boolean;
  handler: (
    args: string[],
    flags: Record<string, string>,
    ctx: CommandContext,
  ) => Promise<ActionResult>;
};

/** Résout la position depuis les args ou le contexte admin. */
function resolvePos(
  rawX: string | undefined,
  rawY: string | undefined,
  ctx: CommandContext,
): { x: number; y: number } | null {
  if (rawX !== undefined && rawY !== undefined) {
    const x = parseFloat(rawX);
    const y = parseFloat(rawY);
    if (!isNaN(x) && !isNaN(y)) return { x, y };
  }
  return ctx.getLastClickedPos() ?? ctx.getCharacterPos();
}

export const commandRegistry: Record<string, CommandDef> = {
  spawn: {
    description: "Crée un spawn de créature à la position donnée (ou au dernier clic).",
    usage: "/spawn <template> [x] [y]",
    argNames: ["template", "x?", "y?"],
    handler: async (args, _flags, ctx) => {
      const [templateKey, rawX, rawY] = args;
      if (!templateKey) {
        return { success: false, message: "Erreur : template requis. Ex: /spawn goblin" };
      }
      const known = ctx.getTemplateKeys();
      if (known.length > 0 && !known.includes(templateKey)) {
        return {
          success: false,
          message: `Template "${templateKey}" inconnu. Disponibles : ${known.join(", ")}.`,
        };
      }
      const pos = resolvePos(rawX, rawY, ctx);
      if (!pos) {
        return {
          success: false,
          message: "Erreur : position manquante. Fournissez x y ou cliquez d'abord sur la carte.",
        };
      }
      return spawnCreature(templateKey, pos.x, pos.y, ctx.socket);
    },
  },

  tp: {
    description: "Téléporte le joueur sélectionné à la position donnée.",
    usage: "/tp <x> <y>",
    argNames: ["x", "y"],
    handler: async (args, _flags, ctx) => {
      const target = ctx.getTarget();
      if (!target || target.kind !== "player") {
        return {
          success: false,
          message: "Erreur : sélectionnez d'abord un personnage joueur dans le panel.",
        };
      }
      const pos = resolvePos(args[0], args[1], ctx);
      if (!pos) {
        return {
          success: false,
          message: "Erreur : x et y requis. Ex: /tp 300 400",
        };
      }
      return teleportCharacter(target.id, pos.x, pos.y, ctx.socket);
    },
  },

  sethp: {
    description: "Modifie les PV max d'une catégorie de créature.",
    usage: "/sethp <template> <valeur>",
    argNames: ["template", "valeur"],
    handler: async (args, _flags, ctx) => {
      const [templateKey, rawValue] = args;
      if (!templateKey || rawValue === undefined) {
        return { success: false, message: "Erreur : /sethp <template> <valeur>" };
      }
      const value = parseInt(rawValue, 10);
      if (isNaN(value) || value <= 0) {
        return { success: false, message: "Erreur : valeur doit être un entier > 0." };
      }
      return updateTemplate(templateKey, { baseHealth: value }, ctx.socket);
    },
  },

  aggro: {
    description: "Modifie le rayon d'aggro d'une catégorie de créature.",
    usage: "/aggro <template> <rayon>",
    argNames: ["template", "rayon"],
    handler: async (args, _flags, ctx) => {
      const [templateKey, rawValue] = args;
      if (!templateKey || rawValue === undefined) {
        return { success: false, message: "Erreur : /aggro <template> <rayon>" };
      }
      const value = parseInt(rawValue, 10);
      if (isNaN(value) || value < 0) {
        return { success: false, message: "Erreur : rayon doit être un entier >= 0." };
      }
      return updateTemplate(templateKey, { aggroRadius: value }, ctx.socket);
    },
  },

  decor: {
    description: "Place un élément de décor (à venir).",
    usage: "/decor <sprite> [x] [y] [--rotation=0]",
    argNames: ["sprite", "x?", "y?"],
    handler: async () => ({
      success: false,
      message: "Commande 'decor' non encore implémentée.",
    }),
  },

  help: {
    description: "Affiche la liste des commandes disponibles.",
    usage: "/help [commande]",
    argNames: ["commande?"],
    handler: async (args) => {
      if (args[0]) {
        const cmd = commandRegistry[args[0].toLowerCase()];
        if (!cmd) {
          return { success: false, message: `Commande "${args[0]}" inconnue.` };
        }
        return {
          success: true,
          message: `${cmd.usage} — ${cmd.description}`,
        };
      }
      const list = Object.entries(commandRegistry)
        .map(([name, def]) => `/${name} — ${def.description}`)
        .join("\n");
      return { success: true, message: list };
    },
  },
};

/** Retourne les noms de commandes commençant par le préfixe donné. */
export function autocompleteCommand(prefix: string): string[] {
  const lower = prefix.toLowerCase();
  return Object.keys(commandRegistry)
    .filter((k) => k.startsWith(lower))
    .map((k) => `/${k}`);
}
