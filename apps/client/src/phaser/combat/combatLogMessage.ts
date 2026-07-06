/**
 * Formatage lisible d'un `combat:event` pour le journal de combat (pur, testable).
 * Le client n'invente aucune donnée : si une identité manque, on retombe sur un
 * libellé sobre ("la créature", "un joueur").
 */
import type { CombatEventPayload } from "./floatingText";

export interface CombatLogFormatOptions {
  /** Id du personnage local (pour dire "Vous" / "vous"). */
  localCharacterId?: string | null;
  /** Résout un nom lisible pour un acteur ; null si inconnu. */
  resolveName?: (actorType: string | undefined, id: string | undefined) => string | null;
}

function isLocalPlayer(
  actorType: string | undefined,
  id: string | undefined,
  localCharacterId?: string | null,
): boolean {
  return actorType === "player" && !!id && !!localCharacterId && id === localCharacterId;
}

function actorLabel(
  actorType: string | undefined,
  id: string | undefined,
  opts: CombatLogFormatOptions,
  { subject }: { subject: boolean },
): string {
  if (isLocalPlayer(actorType, id, opts.localCharacterId)) {
    return subject ? "Vous" : "vous";
  }
  const name = opts.resolveName?.(actorType, id) ?? null;
  if (name) return name;
  return actorType === "creature" ? "la créature" : "un joueur";
}

/**
 * Retourne un message lisible, ou null si l'event ne doit pas être loggé.
 * Exemples : "Vous infligez 8 dégâts à turkey", "turkey vous inflige 3 dégâts",
 * "turkey est mort".
 */
export function formatCombatLogMessage(
  event: CombatEventPayload | null | undefined,
  opts: CombatLogFormatOptions = {},
): string | null {
  if (!event || typeof event !== "object") return null;

  if (event.type === "death") {
    const target = actorLabel(event.targetType, event.targetId, opts, { subject: true });
    if (isLocalPlayer(event.targetType, event.targetId, opts.localCharacterId)) {
      return "Vous êtes mort";
    }
    return `${target} est mort`;
  }

  if (event.type === "damage") {
    const hasAmount = typeof event.amount === "number" && Number.isFinite(event.amount) && event.amount > 0;
    if (!hasAmount) return null;
    const amount = event.amount as number;

    const sourceLocal = isLocalPlayer(event.sourceType, event.sourceId, opts.localCharacterId);
    const targetLocal = isLocalPlayer(event.targetType, event.targetId, opts.localCharacterId);

    if (sourceLocal) {
      const target = actorLabel(event.targetType, event.targetId, opts, { subject: false });
      return `Vous infligez ${amount} dégâts à ${target}`;
    }
    if (targetLocal) {
      const source = actorLabel(event.sourceType, event.sourceId, opts, { subject: true });
      return `${source} vous inflige ${amount} dégâts`;
    }
    const source = actorLabel(event.sourceType, event.sourceId, opts, { subject: true });
    const target = actorLabel(event.targetType, event.targetId, opts, { subject: false });
    return `${source} inflige ${amount} dégâts à ${target}`;
  }

  return null;
}
