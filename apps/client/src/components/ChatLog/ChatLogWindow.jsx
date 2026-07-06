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
import { useDraggableResizable } from "./useDraggableResizable";
import { formatClock } from "../../phaser/combat/timeFormat";

const TABS = [
  { id: "combat", label: "Combat" },
  { id: "events", label: "Événements" },
  { id: "chat", label: "Chat" },
  { id: "guild", label: "Guilde" },
];

// Poignées de redimensionnement : 4 côtés + 4 coins.
const RESIZE_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

// Géométrie initiale : coin bas-gauche.
function initialRect() {
  const width = 340;
  const height = 220;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 720;
  return { x: 12, y: Math.max(12, vh - height - 12), width: Math.min(width, vw), height };
}

// Liste de logs filtrée par catégories, avec horodatage local HH:mm:ss.
function LogList({ categories, emptyText }) {
  const entries = useCombatLogStore((s) => s.entries);
  const filtered = useMemo(
    () => entries.filter((e) => categories.includes(e.category)),
    [entries, categories],
  );
  const listRef = useRef(null);

  // Auto-scroll vers la dernière entrée.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  if (filtered.length === 0) {
    return <p className="chat-log__empty">{emptyText}</p>;
  }

  return (
    <ul className="chat-log__list" ref={listRef}>
      {filtered.map((entry) => (
        <li key={entry.id} className="chat-log__line">
          <span className="chat-log__time">{formatClock(entry.createdAt)}</span>
          <span className="chat-log__message">{entry.message}</span>
        </li>
      ))}
    </ul>
  );
}

const COMBAT_CATEGORIES = ["combat"];
const EVENT_CATEGORIES = ["event", "loot"];

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
  const { rect, startDrag, startResize } = useDraggableResizable(initialRect);

  // Géométrie dynamique (position/taille) : seul cas d'inline style, l'apparence
  // reste dans le SCSS. La hauteur n'est appliquée que déplié.
  const geometry = {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    ...(open ? { height: `${rect.height}px` } : {}),
  };

  return (
    <div
      className={`chat-log ${open ? "chat-log--open" : "chat-log--collapsed"}`}
      style={geometry}
    >
      <div className="chat-log__header" onMouseDown={startDrag}>
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
          {activeTab === "combat" && (
            <LogList categories={COMBAT_CATEGORIES} emptyText="Aucun combat pour le moment." />
          )}
          {activeTab === "events" && (
            <LogList categories={EVENT_CATEGORIES} emptyText="Aucun événement pour le moment." />
          )}
          {activeTab === "chat" && <ChatTab />}
          {activeTab === "guild" && (
            <PlaceholderTab text="Guilde à venir." />
          )}
        </div>
      )}

      {/* Poignées de redimensionnement (masquées si replié). */}
      {open &&
        RESIZE_DIRS.map((dir) => (
          <div
            key={dir}
            className={`chat-log__resize chat-log__resize--${dir}`}
            onMouseDown={(e) => startResize(e, dir)}
          />
        ))}
    </div>
  );
}
