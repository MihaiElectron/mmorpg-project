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
 * V4-H : suffixe " (N bloqués)" quand le DÉFENSEUR a bloqué le hit. Le serveur
 * est seul juge (`isBlocked` + `blockedDamage`, dégâts absorbés). Vide si le hit
 * n'est pas bloqué ou si aucun montant absorbé n'est fourni — jamais deviné.
 */
/** Accord singulier/pluriel du mot "dégât(s)" selon le montant. */
function damageWord(amount: number): string {
  return amount === 1 ? "dégât" : "dégâts";
}

function blockedSuffix(event: CombatEventPayload): string {
  if (!event.isBlocked) return "";
  const blocked = event.blockedDamage;
  if (typeof blocked !== "number" || !Number.isFinite(blocked) || blocked <= 0) return "";
  return blocked === 1 ? " (1 bloqué)" : ` (${blocked} bloqués)`;
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

  if (event.type === "heal") {
    // V5-D1-B : soin (info serveur `amount`). Source = cible (self-heal créature).
    const hasAmount =
      typeof event.amount === "number" && Number.isFinite(event.amount) && event.amount > 0;
    if (!hasAmount) return null;
    const amount = event.amount as number;
    const who = isLocalPlayer(event.targetType, event.targetId, opts.localCharacterId)
      ? "Vous récupérez"
      : `${actorLabel(event.targetType, event.targetId, opts, { subject: true })} récupère`;
    const withSkill =
      typeof event.skillName === "string" && event.skillName.length > 0
        ? ` avec ${event.skillName}`
        : "";
    return `${who} ${amount} PV${withSkill}`;
  }

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
      return `${target} succombe après avoir subi ${critPart}${event.amount} ${damageWord(event.amount as number)}`;
    }
    return `${target} succombe`;
  }

  if (event.type === "damage") {
    // V4-I : parade (info serveur `isParried`, jamais devinée depuis amount 0).
    // Prioritaire sur esquive/blocage/critique : le hit entrant est ANNULÉ
    // (0 dégât) et convertit en contre-attaque (event séparé). Jamais "0 dégât",
    // jamais "esquive", jamais "bloqué", jamais "coup critique" sur le hit paré.
    if (event.isParried) {
      const src = actorLabel(event.sourceType, event.sourceId, opts, { subject: false });
      if (isLocalPlayer(event.targetType, event.targetId, opts.localCharacterId)) {
        return `Vous parez l'attaque de ${src}`;
      }
      const target = actorLabel(event.targetType, event.targetId, opts, { subject: true });
      return `${target} pare l'attaque de ${src}`;
    }

    // V4-F : esquive (info serveur `isDodged`, jamais devinée depuis amount 0).
    // Le DÉFENSEUR (cible) esquive → aucun montant, aucun critique.
    if (event.isDodged) {
      const targetLocalDodge = isLocalPlayer(event.targetType, event.targetId, opts.localCharacterId);
      if (targetLocalDodge) {
        const source = actorLabel(event.sourceType, event.sourceId, opts, { subject: false });
        return `Vous esquivez l'attaque de ${source}`;
      }
      const target = actorLabel(event.targetType, event.targetId, opts, { subject: true });
      if (isLocalPlayer(event.sourceType, event.sourceId, opts.localCharacterId)) {
        return `${target} esquive votre attaque`;
      }
      const src = actorLabel(event.sourceType, event.sourceId, opts, { subject: false });
      return `${target} esquive l'attaque de ${src}`;
    }

    const hasAmount = typeof event.amount === "number" && Number.isFinite(event.amount) && event.amount > 0;
    if (!hasAmount) return null;
    const amount = event.amount as number;

    // Attribution du skill si le serveur l'a fourni (absent = auto-attaque).
    const withSkill =
      typeof event.skillName === "string" && event.skillName.length > 0
        ? ` avec ${event.skillName}`
        : "";
    const crit = event.isCritical === true; // V4-E : info serveur fiable
    const block = blockedSuffix(event); // V4-H : " (N bloqués)" si le défenseur a bloqué

    const sourceLocal = isLocalPlayer(event.sourceType, event.sourceId, opts.localCharacterId);
    const targetLocal = isLocalPlayer(event.targetType, event.targetId, opts.localCharacterId);

    const word = damageWord(amount);

    // V4-I : contre-attaque (event damage SÉPARÉ, `isCounterAttack`). Verbe dédié
    // « contre-attaque » ; conserve critique et accord singulier/pluriel. La mort
    // éventuelle reste gérée par l'event death séparé (pas de doublon ici).
    if (event.isCounterAttack) {
      if (sourceLocal) {
        const target = actorLabel(event.targetType, event.targetId, opts, { subject: false });
        return crit
          ? `Vous contre-attaquez ${target} avec un coup critique : ${amount} ${word}`
          : `Vous contre-attaquez ${target} : ${amount} ${word}`;
      }
      if (targetLocal) {
        const source = actorLabel(event.sourceType, event.sourceId, opts, { subject: true });
        return crit
          ? `${source} vous contre-attaque avec un coup critique : ${amount} ${word}`
          : `${source} vous contre-attaque : ${amount} ${word}`;
      }
      const source = actorLabel(event.sourceType, event.sourceId, opts, { subject: true });
      const target = actorLabel(event.targetType, event.targetId, opts, { subject: false });
      return crit
        ? `${source} contre-attaque ${target} avec un coup critique : ${amount} ${word}`
        : `${source} contre-attaque ${target} : ${amount} ${word}`;
    }

    if (sourceLocal) {
      const target = actorLabel(event.targetType, event.targetId, opts, { subject: false });
      return crit
        ? `Vous infligez un coup critique à ${target}${withSkill} : ${amount} ${word}${block}`
        : `Vous infligez ${amount} ${word} à ${target}${withSkill}${block}`;
    }
    if (targetLocal) {
      const source = actorLabel(event.sourceType, event.sourceId, opts, { subject: true });
      return crit
        ? `${source} vous inflige un coup critique${withSkill} : ${amount} ${word}${block}`
        : `${source} vous inflige ${amount} ${word}${withSkill}${block}`;
    }
    const source = actorLabel(event.sourceType, event.sourceId, opts, { subject: true });
    const target = actorLabel(event.targetType, event.targetId, opts, { subject: false });
    return crit
      ? `${source} inflige un coup critique à ${target}${withSkill} : ${amount} ${word}${block}`
      : `${source} inflige ${amount} ${word} à ${target}${withSkill}${block}`;
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
