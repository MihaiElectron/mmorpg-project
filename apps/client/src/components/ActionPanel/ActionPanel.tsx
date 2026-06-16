import React from "react";
import { useActionPanelStore } from "../../store/actionPanel.store";
import { useCharacterStore } from "../../store/character.store";

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

  if (!isOpen || !target) {
    return null;
  }

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

    const eventName =
      target.kind === "animal" ? "attack_animal" : "interact_resource";

    socket.emit(eventName, {
      targetId: target.id,
      characterId: character.id,
    });

    closePanel();
  };

  return (
    <div className="action-panel">
      <div className="action-panel__title">
        {target.type.replace("_", " ").toUpperCase()}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {actions.map((action) => (
          <button
            key={action}
            className="action-panel__button"
            onClick={() => handleAction(action)}
          >
            {action}
          </button>
        ))}

        <button
          className="action-panel__button action-panel__button--cancel"
          onClick={closePanel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
