import React from "react";
import { useActionPanelStore } from "../../store/actionPanel.store";

export default function ActionPanel() {
  const { isOpen, target, actions, closePanel } = useActionPanelStore();

  if (!isOpen || !target) return null;

  const handleAction = (action: string) => {
    switch (action) {
      case "gather":
        window.game.socket.emit("interact_object", {
          targetId: target.id,
        });
        break;

      case "mine":
        window.game.socket.emit("interact_object", {
          targetId: target.id,
        });
        break;

      case "talk":
        window.game.socket.emit("npc_talk", {
          npcId: target.id,
        });
        break;

      default:
        console.warn("Action inconnue :", action);
    }

    closePanel();
  };

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "80px",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.7)",
        padding: "12px 16px",
        borderRadius: "8px",
        color: "white",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        zIndex: 9999,
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: "14px" }}>
        {target.type.replace("_", " ").toUpperCase()}
      </div>

      {actions.map((action) => (
        <button
          key={action}
          onClick={() => handleAction(action)}
          style={{
            padding: "6px 10px",
            background: "#27ae60",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            color: "white",
            fontSize: "14px",
          }}
        >
          {action === "gather" && "Gathering: Woods"}
          {action === "mine" && "Mining: Ore"}
          {action === "talk" && "Talk"}
          {action === "open" && "Open"}
          {action === "cut" && "Cut"}
        </button>
      ))}

      <button
        onClick={closePanel}
        style={{
          marginTop: "4px",
          padding: "4px 8px",
          background: "#c0392b",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          color: "white",
          fontSize: "12px",
        }}
      >
        Cancel
      </button>
    </div>
  );
}
