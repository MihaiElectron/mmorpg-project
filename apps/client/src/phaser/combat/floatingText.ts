/**
 * Dégâts flottants V1 — feedback visuel Phaser alimenté par `combat:event`.
 * ---------------------------------------------------------------------------
 * Le client n'affiche QUE ce que le serveur émet (aucun dégât inventé). Ce
 * module sépare la logique pure (formatage/style, testable) du rendu Phaser.
 */

export type CombatEventType = "damage" | "death" | "heal";
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
  /** V4-F : true si le défenseur a esquivé le hit (0 dégât). */
  isDodged?: boolean;
  /** V4-H : true si le défenseur a bloqué le hit (dégâts réduits, pas annulés). */
  isBlocked?: boolean;
  /** V4-H : montant absorbé par le blocage (0 si non bloqué). */
  blockedDamage?: number;
  /** V4-I : true si le défenseur a paré le hit (annulé, 0 dégât, + contre-attaque). */
  isParried?: boolean;
  /** V4-I : true si ce hit EST la contre-attaque déclenchée par une parade. */
  isCounterAttack?: boolean;
  createdAt?: number;
}

// Couleurs centralisées (pas dispersées dans WorldScene).
export const FLOATING_COLORS = {
  damageToPlayer: "#ff5b5b", // le joueur encaisse : rouge vif
  damageToCreature: "#ffe066", // le joueur inflige : jaune
  critical: "#ff3b3b", // coup critique : rouge (distinct du jaune normal)
  dodge: "#8fd3ff", // esquive : bleu clair sobre (V4-F)
  blocked: "#b8c4d0", // blocage : gris acier (dégâts réduits, distinct de l'esquive) (V4-H)
  parried: "#6fe0a8", // parade : vert martial sobre (réaction active, distinct) (V4-I)
  heal: "#5fd67a", // soin : vert (V5-D1-B)
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

  if (event.type === "heal") {
    // V5-D1-B : soin → "+N" (jamais "+0"). Le serveur fournit le montant réel.
    const hasAmount = typeof event.amount === "number" && Number.isFinite(event.amount);
    if (hasAmount && (event.amount as number) <= 0) return null;
    if (typeof event.text === "string" && event.text.length > 0) return event.text;
    return hasAmount ? `+${event.amount}` : null;
  }

  if (event.type === "damage") {
    // V4-I : parade → "Parade" (hit annulé, 0 dégât), AVANT esquive/montant.
    // Réaction active du défenseur, jamais confondue avec une esquive.
    if (event.isParried) return "Parade";
    // V4-F : esquive → "Esquive" (jamais "-0"), avant le test de montant.
    if (event.isDodged) return "Esquive";
    const hasAmount = typeof event.amount === "number" && Number.isFinite(event.amount);
    if (hasAmount && (event.amount as number) <= 0) return null; // anti-spam : ignore <= 0
    let base: string | null = null;
    if (typeof event.text === "string" && event.text.length > 0) base = event.text;
    else if (hasAmount) base = `-${event.amount}`;
    if (base === null) return null;
    // V4-H : le hit bloqué inflige quand même `amount` dégâts, mais on signale le
    // blocage (jamais confondu avec une esquive). Le serveur reste seul juge.
    return event.isBlocked ? `${base} (bloqué)` : base;
  }

  return null;
}

/**
 * Couleur du texte selon type/cible. Parade → vert martial (V4-I, avant tout —
 * réaction active) ; esquive → bleu clair (V4-F) ; blocage → gris acier (V4-H,
 * dégâts réduits) ; un coup critique (dégâts) passe en rouge (V4-E). La
 * contre-attaque n'a PAS de couleur dédiée : elle suit le rendu normal (cible
 * créature = jaune, ou rouge si critique).
 */
export function resolveFloatingColor(event: CombatEventPayload): string {
  if (event.type === "death") return FLOATING_COLORS.death;
  if (event.type === "heal") return FLOATING_COLORS.heal; // V5-D1-B : soin → vert
  if (event.type === "damage" && event.isParried) return FLOATING_COLORS.parried;
  if (event.type === "damage" && event.isDodged) return FLOATING_COLORS.dodge;
  if (event.type === "damage" && event.isBlocked) return FLOATING_COLORS.blocked;
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

  // `released` garantit une SEULE décrémentation même si `onComplete` ET `onStop`
  // se déclenchent (tween tué avant fin : sleep/shutdown de scène). Sans ce
  // filet, un tween stoppé sans `onComplete` laisserait fuir le compteur, qui
  // finirait par bloquer l'affichage (cap MAX_FLOATING_TEXTS jamais rendu).
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
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
    // Tween stoppé/tué avant complétion (scène endormie/détruite) → libère aussi.
    onStop: release,
  });
}
