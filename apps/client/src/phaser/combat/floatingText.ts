/**
 * Dégâts flottants V1 — feedback visuel Phaser alimenté par `combat:event`.
 * ---------------------------------------------------------------------------
 * Le client n'affiche QUE ce que le serveur émet (aucun dégât inventé). Ce
 * module sépare la logique pure (formatage/style, testable) du rendu Phaser.
 */

export type CombatEventType = "damage" | "death";
export type CombatActorType = "player" | "creature";

export interface CombatEventPayload {
  id?: string;
  type?: CombatEventType | string;
  amount?: number;
  sourceType?: CombatActorType | string;
  sourceId?: string;
  targetType?: CombatActorType | string;
  targetId?: string;
  worldX?: number;
  worldY?: number;
  text?: string;
  /** Nom du skill à l'origine des dégâts (absent pour une auto-attaque). */
  skillName?: string;
  /** V4-E : true si le hit est un coup critique (info serveur). */
  isCritical?: boolean;
  /** V4-E : nom lisible de la cible. */
  targetName?: string;
  /** V4-E : true si ce hit a tué la cible. */
  targetDied?: boolean;
  createdAt?: number;
}

// Couleurs centralisées (pas dispersées dans WorldScene).
export const FLOATING_COLORS = {
  damageToPlayer: "#ff5b5b", // le joueur encaisse : rouge vif
  damageToCreature: "#ffe066", // le joueur inflige : jaune
  critical: "#ff3b3b", // coup critique : rouge (distinct du jaune normal)
  death: "#c0c0c0", // mort : gris
} as const;

/**
 * Texte à afficher pour un combat:event, ou null si l'event doit être ignoré.
 * - death → text fourni sinon "Mort" ;
 * - damage → text fourni sinon `-${amount}` ; ignoré si amount <= 0 ;
 * - type inconnu / payload invalide → null.
 */
export function formatFloatingCombatText(event: CombatEventPayload | null | undefined): string | null {
  if (!event || typeof event !== "object") return null;

  if (event.type === "death") {
    return typeof event.text === "string" && event.text.length > 0 ? event.text : "Mort";
  }

  if (event.type === "damage") {
    const hasAmount = typeof event.amount === "number" && Number.isFinite(event.amount);
    if (hasAmount && (event.amount as number) <= 0) return null; // anti-spam : ignore <= 0
    if (typeof event.text === "string" && event.text.length > 0) return event.text;
    if (hasAmount) return `-${event.amount}`;
    return null;
  }

  return null;
}

/** Couleur du texte selon type/cible. Un coup critique (dégâts) passe en rouge. */
export function resolveFloatingColor(event: CombatEventPayload): string {
  if (event.type === "death") return FLOATING_COLORS.death;
  if (event.targetType === "player") return FLOATING_COLORS.damageToPlayer;
  if (event.isCritical) return FLOATING_COLORS.critical; // V4-E : crit → rouge
  return FLOATING_COLORS.damageToCreature;
}

/** Style de police : italique pour un coup critique, gras sinon (V4-E). */
export function resolveFloatingFontStyle(event: CombatEventPayload): string {
  return event.type === "damage" && event.isCritical ? "bold italic" : "bold";
}

// Cap anti-spam très léger : nb max de textes simultanés par scène.
export const MAX_FLOATING_TEXTS = 40;
// Durée d'affichage du texte flottant (montée + fondu).
export const FLOATING_TEXT_DURATION_MS = 1125;
const FLOATING_RISE_PX = 34;
const FLOATING_DEPTH = 10000; // au-dessus des sprites et barres HP

/** Position écran d'une ancre (sprite Phaser) ou fallback si absente/inactive. */
export interface ScreenPos {
  x: number;
  y: number;
}
export interface FloatingAnchor {
  x?: number;
  y?: number;
  active?: boolean;
}

/**
 * Résout la position à suivre : l'ancre si elle est vivante et a des coordonnées
 * valides, sinon la position de repli. Pur et testable.
 */
export function resolveAnchorPosition(
  anchor: FloatingAnchor | null | undefined,
  fallback: ScreenPos,
): ScreenPos {
  if (
    anchor &&
    anchor.active !== false &&
    typeof anchor.x === "number" &&
    typeof anchor.y === "number"
  ) {
    return { x: anchor.x, y: anchor.y };
  }
  return fallback;
}

/**
 * Affiche un texte flottant temporaire puis le détruit à la fin de l'animation.
 * - Si `anchor` (sprite Phaser) est vivant, le texte SUIT l'entité pendant toute
 *   l'animation (joueur/créature mobile), avec `offsetY` au-dessus + montée relative.
 * - Sinon, position fixe `fallbackX/fallbackY` (+ offsetY). Si l'ancre disparaît
 *   en cours d'animation, on garde la dernière position valide (pas de crash).
 * No-op si `text` est vide.
 */
export function showFloatingCombatText(
  scene: Phaser.Scene,
  options: {
    text: string;
    fallbackX: number;
    fallbackY: number;
    anchor?: FloatingAnchor | null;
    offsetY?: number;
    color?: string;
    fontStyle?: string;
  },
): void {
  if (!scene || !options?.text) return;

  // Cap simultané : évite l'accumulation en cas de burst.
  const active = (scene as { __floatingTextCount?: number }).__floatingTextCount ?? 0;
  if (active >= MAX_FLOATING_TEXTS) return;
  (scene as { __floatingTextCount?: number }).__floatingTextCount = active + 1;

  const offsetY = options.offsetY ?? 0;
  let lastX = options.fallbackX;
  let lastY = options.fallbackY;

  const label = scene.add
    .text(lastX, lastY + offsetY, options.text, {
      fontSize: "14px",
      color: options.color ?? FLOATING_COLORS.damageToCreature,
      stroke: "#000000",
      strokeThickness: 3,
      fontStyle: options.fontStyle ?? "bold",
    })
    .setOrigin(0.5)
    .setDepth(FLOATING_DEPTH);

  const release = () => {
    const s = scene as { __floatingTextCount?: number };
    s.__floatingTextCount = Math.max(0, (s.__floatingTextCount ?? 1) - 1);
    if (label.active) label.destroy();
  };

  // Tween d'un proxy 0→1 : à chaque frame, on recale le texte sur l'ancre
  // (position relative) plutôt que d'animer vers un point écran figé.
  const progress = { t: 0 };
  scene.tweens.add({
    targets: progress,
    t: 1,
    duration: FLOATING_TEXT_DURATION_MS,
    ease: "Cubic.easeOut",
    onUpdate: () => {
      if (!label.active) return;
      const pos = resolveAnchorPosition(options.anchor, { x: lastX, y: lastY });
      lastX = pos.x;
      lastY = pos.y;
      label.x = pos.x;
      label.y = pos.y + offsetY - FLOATING_RISE_PX * progress.t;
      label.alpha = 1 - progress.t;
    },
    onComplete: release,
  });
}
