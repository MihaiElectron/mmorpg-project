import { spawnCreature, teleportCharacter, updateTemplate, respawnAll, moveAnimal } from "./admin.actions";
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
    description: "Téléporte/déplace la cible sélectionnée (joueur ou animal) à la position donnée.",
    usage: "/tp [id] <x> <y>",
    argNames: ["id?", "x", "y"],
    handler: async (args, _flags, ctx) => {
      let entityId: string | null = null;
      let entityKind: string | null = null;
      let rawX: string | undefined;
      let rawY: string | undefined;

      // Si le premier arg n'est pas un nombre, c'est un id explicite (joueur)
      if (args[0] && isNaN(parseFloat(args[0]))) {
        entityId = args[0];
        entityKind = "player";
        rawX = args[1];
        rawY = args[2];
      } else {
        const target = ctx.getTarget();
        if (!target) {
          return {
            success: false,
            message: "Erreur : sélectionnez une cible ou fournissez un id. Ex: /tp <id> 300 400",
          };
        }
        entityId = target.id;
        entityKind = target.kind;
        rawX = args[0];
        rawY = args[1];
      }

      const pos = resolvePos(rawX, rawY, ctx);
      if (!pos) {
        return { success: false, message: "Erreur : x et y requis. Ex: /tp 300 400" };
      }

      if (entityKind === "animal") {
        return moveAnimal(entityId!, pos.x, pos.y, ctx.socket);
      }
      return teleportCharacter(entityId!, pos.x, pos.y, ctx.socket);
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

  respawn: {
    description: "Force le respawn de tous les animaux d'un template à leur position d'origine.",
    usage: "/respawn all <template>",
    argNames: ["all", "template"],
    handler: async (args, _flags, ctx) => {
      if (args[0] !== "all") {
        return { success: false, message: "Syntaxe : /respawn all <template>. Ex: /respawn all turkey" };
      }
      const templateKey = args[1];
      if (!templateKey) {
        return { success: false, message: "Template requis. Ex: /respawn all turkey" };
      }
      return respawnAll(templateKey, ctx.socket);
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
