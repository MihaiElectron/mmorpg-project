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
    if (isLocalPlayer(event.targetType, event.targetId, opts.localCharacterId)) {
      return "Vous êtes mort";
    }
    const target = actorLabel(event.targetType, event.targetId, opts, { subject: true });
    // V4-E : mort liée au dernier hit (montant + éventuel critique) si fournis.
    const hasAmount =
      typeof event.amount === "number" && Number.isFinite(event.amount) && event.amount > 0;
    if (hasAmount) {
      const critPart = event.isCritical ? "un coup critique de " : "";
      return `${target} succombe après avoir subi ${critPart}${event.amount} dégâts`;
    }
    return `${target} succombe`;
  }

  if (event.type === "damage") {
    const hasAmount = typeof event.amount === "number" && Number.isFinite(event.amount) && event.amount > 0;
    if (!hasAmount) return null;
    const amount = event.amount as number;

    // Attribution du skill si le serveur l'a fourni (absent = auto-attaque).
    const withSkill =
      typeof event.skillName === "string" && event.skillName.length > 0
        ? ` avec ${event.skillName}`
        : "";
    const crit = event.isCritical === true; // V4-E : info serveur fiable

    const sourceLocal = isLocalPlayer(event.sourceType, event.sourceId, opts.localCharacterId);
    const targetLocal = isLocalPlayer(event.targetType, event.targetId, opts.localCharacterId);

    if (sourceLocal) {
      const target = actorLabel(event.targetType, event.targetId, opts, { subject: false });
      return crit
        ? `Vous infligez un coup critique à ${target}${withSkill} : ${amount} dégâts`
        : `Vous infligez ${amount} dégâts à ${target}${withSkill}`;
    }
    if (targetLocal) {
      const source = actorLabel(event.sourceType, event.sourceId, opts, { subject: true });
      return crit
        ? `${source} vous inflige un coup critique${withSkill} : ${amount} dégâts`
        : `${source} vous inflige ${amount} dégâts${withSkill}`;
    }
    const source = actorLabel(event.sourceType, event.sourceId, opts, { subject: true });
    const target = actorLabel(event.targetType, event.targetId, opts, { subject: false });
    return crit
      ? `${source} inflige un coup critique à ${target}${withSkill} : ${amount} dégâts`
      : `${source} inflige ${amount} dégâts à ${target}${withSkill}`;
  }

  return null;
}

/**
 * Message lisible d'une transition d'état de créature (catégorie "event").
 * N'est appelé QUE lorsqu'un changement d'état réel est détecté côté client
 * (jamais sur un update de position). Retourne null si la mort est déjà couverte
 * par `combat:event death` (on ne logge pas deux fois la mort).
 */
export function formatCreatureStateTransition(
  prevState: string | undefined,
  nextState: string | undefined,
  creatureName?: string | null,
): string | null {
  if (!prevState || !nextState || prevState === nextState) return null;

  const name = creatureName && creatureName.length > 0 ? creatureName : "la créature";

  // La mort est déjà journalisée via combat:event (type "death").
  if (nextState === "dead") return null;

  if (prevState === "alive" && nextState === "fighting") return `${name} engage le combat`;
  if (prevState === "fighting" && nextState === "escaping") return `${name} s'enfuit`;
  if (prevState === "escaping" && nextState === "alive") return `${name} abandonne et retourne à sa zone`;
  if (prevState === "fighting" && nextState === "alive") return `${name} abandonne le combat`;

  return `${name} change d'état : ${prevState} → ${nextState}`;
}

export interface LootLogPayload {
  itemId?: string;
  lootItemId?: string;
  name?: string;
  quantity?: number;
}

/**
 * Message lisible d'un loot reçu par le joueur (catégorie "loot").
 * N'utilise QUE les infos présentes dans l'event serveur ; n'invente rien.
 */
export function formatLootMessage(payload: LootLogPayload | null | undefined): string | null {
  if (!payload || typeof payload !== "object") return null;

  const rawName = payload.name || payload.lootItemId || payload.itemId || null;
  const name = rawName ? rawName.replace(/_/g, " ") : null;

  const hasQty =
    typeof payload.quantity === "number" && Number.isFinite(payload.quantity) && payload.quantity > 0;

  // Ne jamais inventer un montant : sans quantité valide, on n'affiche pas "1 ×".
  if (hasQty) {
    return `Vous obtenez ${Math.floor(payload.quantity as number)} × ${name ?? "objet"}`;
  }
  return name ? `Vous obtenez ${name}` : "Vous obtenez un objet";
}
