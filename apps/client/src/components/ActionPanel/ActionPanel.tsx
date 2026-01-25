import React from "react";
import { useActionPanelStore } from "../../store/actionPanel.store";

export default function ActionPanel() {
  const isOpen = useActionPanelStore((s) => s.isOpen);
  const target = useActionPanelStore((s) => s.target);
  const actions = useActionPanelStore((s) => s.actions);
  const closePanel = useActionPanelStore((s) => s.closePanel);

  console.log("🎨 [ActionPanel] Render, isOpen:", isOpen);

  if (!isOpen || !target) {
    return null;
  }

  const handleAction = (action) => {
    console.log("▶️ [ActionPanel] Action clicked:", action);

    // 🔍 LOG DIAGNOSTIC : socket au moment exact du clic
    console.log("🔌 SOCKET AT CLICK:", window.game?.socket);

    if (window.game?.socket) {
      /**
       * 🔧 FIX : dead_tree est géré par ResourcesGateway
       * → on doit émettre "interact_resource" et non "interact_object"
       */
      window.game.socket.emit("interact_resource", {
        targetId: target.id,
      });
    }

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
