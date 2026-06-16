import React from "react";
import { useActionPanelStore } from "../../store/actionPanel.store";
import { useCharacterStore } from "../../store/character.store";

export default function ActionPanel() {
  const isOpen = useActionPanelStore((s) => s.isOpen);
  const target = useActionPanelStore((s) => s.target);
  const actions = useActionPanelStore((s) => s.actions);
  const closePanel = useActionPanelStore((s) => s.closePanel);
  const character = useCharacterStore((s) => s.character);

  console.log("🎨 [ActionPanel] Render, isOpen:", isOpen);

  if (!isOpen || !target) {
    return null;
  }

  const handleAction = (action: string) => {
    console.log("▶️ [ActionPanel] Action clicked:", action);

    const socket = window.game?.socket;
    console.log("🔌 SOCKET AT CLICK:", socket);

    if (!socket || !socket.connected) {
      console.warn("❌ No socket available or not connected");
      closePanel();
      return;
    }

    if (!character?.id) {
      console.warn("❌ No character available for resource interaction");
      closePanel();
      return;
    }

    // 👉 Envoi correct vers ResourcesGateway
    socket.emit("interact_resource", {
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
