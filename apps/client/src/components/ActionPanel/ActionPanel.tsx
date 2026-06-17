import { useEffect, useRef, useState } from "react";
import { useActionPanelStore } from "../../store/actionPanel.store";
import { useCharacterStore } from "../../store/character.store";
import HealthBar from "../HealthBar/HealthBar";

type GameWindow = Window &
  typeof globalThis & {
    game?: {
      socket?: {
        connected?: boolean;
        emit: (event: string, payload: unknown) => void;
      };
    };
  };

function decodeJwtRole(token: string): string | null {
  try {
    return JSON.parse(atob(token.split(".")[1]))?.role ?? null;
  } catch {
    return null;
  }
}

export default function ActionPanel() {
  const isOpen = useActionPanelStore((s) => s.isOpen);
  const target = useActionPanelStore((s) => s.target);
  const actions = useActionPanelStore((s) => s.actions);
  const overlappingTargets = useActionPanelStore((s) => s.overlappingTargets);
  const closePanel = useActionPanelStore((s) => s.closePanel);
  const selectOverlapTarget = useActionPanelStore((s) => s.selectOverlapTarget);
  const character = useCharacterStore((s) => s.character);

  const panelRef = useRef<HTMLDivElement>(null);
  const consoleInputRef = useRef<HTMLInputElement>(null);
  const [command, setCommand] = useState("");

  const token = localStorage.getItem("token") ?? "";
  const isAdmin = decodeJwtRole(token) === "admin";
  const hasOverlap = overlappingTargets.length > 1;

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      const clickTarget = e.target as HTMLElement;
      if (clickTarget.tagName === "CANVAS") return;
      if (panelRef.current && !panelRef.current.contains(clickTarget)) {
        closePanel();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [closePanel]);

  // Focus automatique sur la console admin à l'ouverture du panel
  useEffect(() => {
    if (isOpen && isAdmin) {
      // setTimeout 0 laisse React finir le rendu avant de focus
      setTimeout(() => consoleInputRef.current?.focus(), 0);
    }
  }, [isOpen, isAdmin]);

  // Pré-remplir la console avec /select quand plusieurs objets se superposent
  useEffect(() => {
    if (isAdmin && hasOverlap) {
      setCommand("/select ");
      setTimeout(() => consoleInputRef.current?.focus(), 0);
    } else {
      setCommand("");
    }
  }, [isAdmin, hasOverlap, target?.id]);

  if (!isOpen || !target) return null;

  const handleAction = (action: string) => {
    const socket = (window as GameWindow).game?.socket;
    if (!socket?.connected) { closePanel(); return; }
    if (!character?.id) { closePanel(); return; }

    if (target.kind === "animal") {
      const scene = (window as any).game?.scene?.getScene?.("WorldScene");
      if (scene?.startAutoAttack) scene.startAutoAttack(target.id);
    } else {
      socket.emit("interact_resource", { targetId: target.id, characterId: character.id });
    }
    closePanel();
  };

  function handleCommandKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !command.trim()) return;
    // Le parsing complet des commandes sera implémenté dans la prochaine étape
    setCommand("");
  }

  function handleOverlapChange(e: React.ChangeEvent<HTMLSelectElement>) {
    selectOverlapTarget(e.target.value);
    setCommand("");
  }

  return (
    <div className="action-panel" ref={panelRef}>
      <div className="action-panel__title">
        {target.type.replace(/_/g, " ").toUpperCase()}
      </div>

      {target.kind === "animal" &&
        target.health != null &&
        target.maxHealth != null && (
          <HealthBar health={target.health} maxHealth={target.maxHealth} />
        )}

      {/* Console admin — visible uniquement pour le rôle admin */}
      {isAdmin && (
        <div className="action-panel__console">
          {hasOverlap && (
            <div className="action-panel__overlap">
              <span className="action-panel__overlap-label">Superposés :</span>
              <select
                className="action-panel__overlap-select"
                value={target.id}
                onChange={handleOverlapChange}
              >
                {overlappingTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.type.replace(/_/g, " ")} ({t.kind})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="action-panel__console-input">
            <span className="action-panel__console-prefix">&gt;</span>
            <input
              ref={consoleInputRef}
              className="action-panel__console-field"
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleCommandKey}
              placeholder={hasOverlap ? "/select <index>" : "/commande..."}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      )}

      <div className="action-panel__actions">
        {actions.map((action) => (
          <button
            key={action}
            className="action-panel__button"
            onClick={() => handleAction(action)}
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}
