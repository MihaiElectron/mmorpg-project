import { useEffect, useRef } from "react";
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

export default function ActionPanel() {
  const isOpen = useActionPanelStore((s) => s.isOpen);
  const target = useActionPanelStore((s) => s.target);
  const actions = useActionPanelStore((s) => s.actions);
  const closePanel = useActionPanelStore((s) => s.closePanel);
  const character = useCharacterStore((s) => s.character);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Le canvas Phaser gère ses propres clics (WorldScene.pointerdown).
      // Interférer ici provoquerait une fermeture immédiate après l'ouverture.
      if (target.tagName === "CANVAS") return;
      if (panelRef.current && !panelRef.current.contains(target)) {
        closePanel();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [closePanel]);

  if (!isOpen || !target) return null;

  const handleAction = (action: string) => {
    const socket = (window as GameWindow).game?.socket;

    if (!socket || !socket.connected) {
      console.warn("No socket available or not connected");
      closePanel();
      return;
    }

    if (!character?.id) {
      console.warn("No character available for resource interaction");
      closePanel();
      return;
    }

    if (target.kind === "animal") {
      const scene = (window as any).game?.scene?.getScene?.("WorldScene");
      if (scene?.startAutoAttack) scene.startAutoAttack(target.id);
    } else {
      socket.emit("interact_resource", {
        targetId: target.id,
        characterId: character.id,
      });
    }

    closePanel();
  };

  return (
    <div className="action-panel" ref={panelRef}>
      <div className="action-panel__title">
        {target.type.replace("_", " ").toUpperCase()}
      </div>

      {target.kind === "animal" &&
        target.health != null &&
        target.maxHealth != null && (
          <HealthBar health={target.health} maxHealth={target.maxHealth} />
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
