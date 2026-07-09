import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMyActiveSkills, type PlayerActiveSkill } from "../ActionPanel/activeSkillsApi";
import { getActionPanelStore } from "../../store/actionPanel.store";

/**
 * Raccourcis clavier par slot (AZERTY-friendly : lettres, pas de chiffres qui
 * exigent Shift sans pavé numérique). L'index du slot correspond à l'index dans
 * cette table. `MAX_SLOTS` en découle.
 */
const HOTKEYS = ["a", "z", "e", "r", "q", "s", "d", "f"] as const;
const MAX_SLOTS = HOTKEYS.length;

type SocketLike = {
  emit: (event: string, payload: unknown) => void;
  on: (event: string, cb: (data: unknown) => void) => void;
  off: (event: string, cb: (data: unknown) => void) => void;
};

function getSocket(): SocketLike | null {
  return (window as unknown as { game?: { socket?: SocketLike } }).game?.socket ?? null;
}

/** Cible créature actuellement sélectionnée dans l'ActionPanel, sinon null. */
function getSelectedCreature(): { id: string; name?: string } | null {
  const target = getActionPanelStore().getState().target;
  return target && target.kind === "creature" ? { id: target.id, name: target.name } : null;
}

/** Fallback texte compact quand un skill n'a pas d'icône (2 premières lettres). */
function shortLabel(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * SkillActionBar — barre de raccourcis minimale (Skills V1-F).
 *
 * Affiche les skills actifs exécutables (damage/créature) retournés par la route
 * joueur. Le client envoie UNIQUEMENT une intention `skill:cast` ; le serveur
 * valide portée/cooldown/coût/cible. Aucun calcul de dégât/portée côté client.
 * Pas de persistance, pas de drag/drop, pas d'action bar avancée.
 */
export default function SkillActionBar() {
  const [skills, setSkills] = useState<PlayerActiveSkill[]>([]);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Charge (ou recharge) les skills exécutables, plafonné à MAX_SLOTS.
  // Rechargé au montage, au retour de focus fenêtre et sur `character:reload`
  // pour prendre en compte un skill créé/activé après le chargement initial.
  const loadSkills = useCallback(() => {
    fetchMyActiveSkills()
      .then((list) => {
        if (!mountedRef.current) return;
        // Skills exécutables V1 : dégâts/créature (V1-D) OU soin/soi (V1-G).
        const usable = list
          .filter(
            (s) =>
              s.executable &&
              ((s.effectType === "damage" && s.targetMode === "creature") ||
                (s.effectType === "heal" && s.targetMode === "self")),
          )
          .slice(0, MAX_SLOTS);
        setSkills(usable);
      })
      .catch(() => {
        /* barre simplement vide si indisponible */
      });
  }, []);

  useEffect(() => {
    loadSkills(); // montage

    const onFocus = () => loadSkills();
    window.addEventListener("focus", onFocus);

    const socket = getSocket();
    const onReload = () => loadSkills();
    socket?.on("character:reload", onReload);

    return () => {
      window.removeEventListener("focus", onFocus);
      socket?.off("character:reload", onReload);
    };
  }, [loadSkills]);

  const showFeedback = useCallback((text: string) => {
    setFeedback(text);
    if (feedbackTimer.current != null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2500);
  }, []);

  // Listeners socket : cooldown + erreur, nettoyés au démontage.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onCooldown(data: unknown) {
      const d = data as { skillKey?: string; readyAt?: number; cooldownMs?: number };
      if (!d?.skillKey) return;
      const readyAt = d.readyAt ?? Date.now() + (d.cooldownMs ?? 0);
      setCooldowns((prev) => ({ ...prev, [d.skillKey as string]: readyAt }));
    }
    function onError(data: unknown) {
      const d = data as { error?: string };
      showFeedback(d?.error ?? "Skill refusé.");
    }

    socket.on("skill:cooldown", onCooldown);
    socket.on("skill:error", onError);
    return () => {
      socket.off("skill:cooldown", onCooldown);
      socket.off("skill:error", onError);
    };
  }, [showFeedback]);

  // Tick léger uniquement s'il reste un cooldown actif.
  const hasActiveCooldown = Object.values(cooldowns).some((t) => t > now);
  useEffect(() => {
    if (!hasActiveCooldown) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [hasActiveCooldown]);

  const triggerSkill = useCallback(
    (skill: PlayerActiveSkill | undefined) => {
      if (!skill) return;
      if ((cooldowns[skill.key] ?? 0) > Date.now()) return; // cooldown affichage
      const socket = getSocket();
      if (!socket) {
        showFeedback("Socket indisponible.");
        return;
      }

      // Skill de soin sur soi (V1-G) : aucune cible requise.
      if (skill.targetMode === "self") {
        socket.emit("skill:cast", { skillKey: skill.key, targetType: "self" });
        return;
      }

      // Skill de dégâts sur créature (V1-D) : cible créature obligatoire.
      const creature = getSelectedCreature();
      if (!creature) {
        showFeedback("Sélectionne une créature.");
        return;
      }
      socket.emit("skill:cast", {
        skillKey: skill.key,
        targetType: "creature",
        targetId: creature.id,
      });
    },
    [cooldowns, showFeedback],
  );

  // Raccourcis clavier A,Z,E,R,Q,S,D,F — ignorés si un champ de saisie est focus.
  useEffect(() => {
    if (skills.length === 0) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const index = HOTKEYS.indexOf(e.key.toLowerCase() as (typeof HOTKEYS)[number]);
      if (index < 0 || index >= skills.length) return;
      e.preventDefault();
      triggerSkill(skills[index]);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skills, triggerSkill]);

  if (skills.length === 0) return null;

  return (
    <div className="skill-action-bar">
      {feedback && <div className="skill-action-bar__feedback">{feedback}</div>}
      <div className="skill-action-bar__slots">
        {skills.map((skill, i) => {
          const readyAt = cooldowns[skill.key] ?? 0;
          const remainingMs = Math.max(0, readyAt - now);
          const onCooldown = remainingMs > 0;
          return (
            <button
              key={skill.key}
              type="button"
              className="skill-action-bar__slot"
              onClick={() => triggerSkill(skill)}
              disabled={onCooldown}
              title={skill.name}
            >
              <span className="skill-action-bar__hotkey">{HOTKEYS[i].toUpperCase()}</span>
              {skill.iconAssetPath ? (
                <img
                  className="skill-action-bar__icon"
                  src={skill.iconAssetPath}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="skill-action-bar__fallback">{shortLabel(skill.name)}</span>
              )}
              {onCooldown && (
                <span className="skill-action-bar__cooldown">{Math.ceil(remainingMs / 1000)}s</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
