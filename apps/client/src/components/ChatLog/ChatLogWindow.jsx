/**
 * ChatLogWindow
 * ----------------------------------------------------------------------------
 * Fenêtre locale "Chat / Logs" avec onglets. V1 :
 * - Combat : actif, alimenté par le store local (combat:event → WorldScene).
 * - Événements : préparé (placeholder), futurs events système/loot/progression.
 * - Chat / Guilde : préparés visuellement, AUCUN réseau (input désactivé).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useCombatLogStore } from "../../store/combatLog.store";

const TABS = [
  { id: "combat", label: "Combat" },
  { id: "events", label: "Événements" },
  { id: "chat", label: "Chat" },
  { id: "guild", label: "Guilde" },
];

function CombatTab() {
  const entries = useCombatLogStore((s) => s.entries);
  const combatEntries = useMemo(
    () => entries.filter((e) => e.category === "combat"),
    [entries],
  );
  const listRef = useRef(null);

  // Auto-scroll vers la dernière entrée.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [combatEntries.length]);

  if (combatEntries.length === 0) {
    return <p className="chat-log__empty">Aucun combat pour le moment.</p>;
  }

  return (
    <ul className="chat-log__list" ref={listRef}>
      {combatEntries.map((entry) => (
        <li key={entry.id} className="chat-log__line">
          {entry.message}
        </li>
      ))}
    </ul>
  );
}

function PlaceholderTab({ text }) {
  return <p className="chat-log__empty">{text}</p>;
}

function ChatTab() {
  return (
    <div className="chat-log__chat">
      <PlaceholderTab text="Chat non disponible pour le moment." />
      <input
        className="chat-log__input"
        type="text"
        placeholder="Chat non disponible…"
        disabled
        aria-label="Champ de chat désactivé"
      />
    </div>
  );
}

export default function ChatLogWindow() {
  const [activeTab, setActiveTab] = useState("combat");
  const [open, setOpen] = useState(true);

  return (
    <div className={`chat-log ${open ? "chat-log--open" : "chat-log--collapsed"}`}>
      <div className="chat-log__header">
        <div className="chat-log__tabs">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`chat-log__tab${activeTab === id ? " chat-log__tab--active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="chat-log__toggle"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Réduire" : "Agrandir"}
        >
          {open ? "▾" : "▸"}
        </button>
      </div>

      {open && (
        <div className="chat-log__body">
          {activeTab === "combat" && <CombatTab />}
          {activeTab === "events" && (
            <PlaceholderTab text="Aucun événement pour le moment." />
          )}
          {activeTab === "chat" && <ChatTab />}
          {activeTab === "guild" && (
            <PlaceholderTab text="Guilde à venir." />
          )}
        </div>
      )}
    </div>
  );
}
