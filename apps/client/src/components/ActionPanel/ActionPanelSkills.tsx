import { useEffect, useRef, useState } from "react";
import { fetchMyActiveSkills, type PlayerActiveSkill } from "./activeSkillsApi";

interface ActionPanelSkillsProps {
  /** Id de la créature ciblée (cible unique V1-E). */
  creatureId: string;
}

type SocketLike = {
  emit: (event: string, payload: unknown) => void;
  on: (event: string, cb: (data: unknown) => void) => void;
  off: (event: string, cb: (data: unknown) => void) => void;
};

function getSocket(): SocketLike | null {
  return (window as unknown as { game?: { socket?: SocketLike } }).game?.socket ?? null;
}

/**
 * Section « Skills » de l'ActionPanel affichée quand une créature est ciblée
 * (Skills V1-E). Le client envoie UNIQUEMENT une intention `skill:cast` ; le
 * serveur valide portée/cooldown/coût/dégâts. On écoute `skill:cooldown` et
 * `skill:error` pour le feedback, jamais pour recalculer une règle.
 */
export default function ActionPanelSkills({ creatureId }: ActionPanelSkillsProps) {
  const [skills, setSkills] = useState<PlayerActiveSkill[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  // readyAt (timestamp ms) par skillKey — cooldown côté affichage uniquement.
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());

  // Chargement de la liste (dépend du personnage, pas de la créature) : une fois.
  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    fetchMyActiveSkills()
      .then((list) => {
        if (!mounted) return;
        setSkills(list);
        setStatus("loaded");
      })
      .catch(() => {
        if (!mounted) return;
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Listeners socket : cooldown + erreur (nettoyés au démontage).
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onCooldown(data: unknown) {
      const d = data as { skillKey?: string; readyAt?: number; cooldownMs?: number };
      if (!d?.skillKey) return;
      const readyAt = d.readyAt ?? Date.now() + (d.cooldownMs ?? 0);
      setCooldowns((prev) => ({ ...prev, [d.skillKey as string]: readyAt }));
      setFeedback(null);
    }
    function onError(data: unknown) {
      const d = data as { error?: string };
      setFeedback({ text: d?.error ?? "Skill refusé.", ok: false });
    }

    socket.on("skill:cooldown", onCooldown);
    socket.on("skill:error", onError);
    return () => {
      socket.off("skill:cooldown", onCooldown);
      socket.off("skill:error", onError);
    };
  }, []);

  // Tick léger uniquement s'il reste un cooldown actif (réactive les boutons).
  const hasActiveCooldown = Object.values(cooldowns).some((t) => t > now);
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!hasActiveCooldown) return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 500);
    return () => {
      if (tickRef.current != null) window.clearInterval(tickRef.current);
    };
  }, [hasActiveCooldown]);

  function cast(skill: PlayerActiveSkill) {
    const socket = getSocket();
    if (!socket) {
      setFeedback({ text: "Socket indisponible.", ok: false });
      return;
    }
    setFeedback(null);
    socket.emit("skill:cast", {
      skillKey: skill.key,
      targetType: "creature",
      targetId: creatureId,
    });
  }

  return (
    <div className="action-panel__skills">
      <div className="action-panel__skills-title">Skills</div>

      {status === "loading" && (
        <div className="action-panel__skills-empty">Chargement…</div>
      )}
      {status === "error" && (
        <div className="action-panel__skills-empty">Skills indisponibles.</div>
      )}
      {status === "loaded" && skills.length === 0 && (
        <div className="action-panel__skills-empty">Aucun skill actif disponible.</div>
      )}

      {status === "loaded" &&
        skills.map((skill) => {
          const readyAt = cooldowns[skill.key] ?? 0;
          const remainingMs = Math.max(0, readyAt - now);
          const onCooldown = remainingMs > 0;
          const disabled = !skill.executable || onCooldown;
          const reason = !skill.executable
            ? skill.disabledReason
            : onCooldown
              ? `Recharge ${Math.ceil(remainingMs / 1000)}s`
              : undefined;

          return (
            <div key={skill.key} className="action-panel__skill">
              {skill.iconAssetPath && (
                <img
                  className="action-panel__skill-icon"
                  src={skill.iconAssetPath}
                  alt=""
                  loading="lazy"
                />
              )}
              <div className="action-panel__skill-info">
                <span className="action-panel__skill-name">{skill.name}</span>
                <span className="action-panel__skill-meta">
                  CD {Math.round(skill.cooldownMs / 100) / 10}s · portée {skill.rangeWU}
                  {skill.resourceType && skill.resourceCost > 0
                    ? ` · ${skill.resourceCost} ${skill.resourceType}`
                    : ""}
                </span>
                {reason && <span className="action-panel__skill-reason">{reason}</span>}
              </div>
              <button
                type="button"
                className="action-panel__skill-cast"
                onClick={() => cast(skill)}
                disabled={disabled}
                title={reason ?? "Lancer"}
              >
                Lancer
              </button>
            </div>
          );
        })}

      {feedback && (
        <div
          className={`action-panel__skills-feedback action-panel__skills-feedback--${feedback.ok ? "ok" : "err"}`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
