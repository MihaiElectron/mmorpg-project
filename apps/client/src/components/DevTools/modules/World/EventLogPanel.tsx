import { useEffect, useMemo, useState } from "react";
import {
  clearDebugEvents,
  getDebugEvents,
  subscribeDebugEvents,
  type DebugEvent,
} from "../../debugEventLog";

type QuickFilter =
  | "All"
  | "Movement"
  | "Mouse"
  | "Keyboard"
  | "Socket"
  | "Stop"
  | "Error/Suspect";

const QUICK_FILTERS: QuickFilter[] = [
  "All",
  "Movement",
  "Mouse",
  "Keyboard",
  "Socket",
  "Stop",
  "Error/Suspect",
];

function formatRelativeTime(event: DebugEvent, firstTimestamp: number | null): string {
  if (firstTimestamp === null) return "+0.00s";
  return `+${((event.timestamp - firstTimestamp) / 1000).toFixed(2)}s`;
}

function getReason(event: DebugEvent): string | null {
  const reason = event.details?.reason;
  return reason === undefined || reason === null ? null : String(reason);
}

function formatDetails(details: DebugEvent["details"], { includeReason = true } = {}): string {
  if (!details) return "";

  return Object.entries(details)
    .filter(([key, value]) => value !== undefined && (includeReason || key !== "reason"))
    .map(([key, value]) => `${key}:${value ?? "null"}`)
    .join(" ");
}

function matchesQuickFilter(event: DebugEvent, filter: QuickFilter): boolean {
  const source = event.source.toLowerCase();
  const type = event.type.toLowerCase();
  const reason = getReason(event)?.toLowerCase() ?? "";
  const details = formatDetails(event.details).toLowerCase();

  switch (filter) {
    case "Movement":
      return type.includes("move") || type.includes("drag") || type.includes("path");
    case "Mouse":
      return source.includes("mouse") || type.includes("mouse") || type.includes("pointer");
    case "Keyboard":
      return type.includes("key") || reason.includes("keyboard") || details.includes("keyboard");
    case "Socket":
      return source.includes("socket") || type.includes("socket");
    case "Stop":
      return type.includes("stop") || reason.includes("stop");
    case "Error/Suspect":
      return (
        type.includes("error") ||
        type.includes("suspect") ||
        type.includes("fallback") ||
        reason.includes("error") ||
        reason.includes("suspect")
      );
    case "All":
    default:
      return true;
  }
}

function matchesTextFilter(event: DebugEvent, query: string): boolean {
  if (!query) return true;

  const text = [
    event.source,
    event.type,
    getReason(event),
    formatDetails(event.details),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes(query);
}

export default function EventLogPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<DebugEvent[]>(() => getDebugEvents());
  const [isPaused, setPaused] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("All");
  const [filter, setFilter] = useState("");
  const [stopOnly, setStopOnly] = useState(false);

  useEffect(() => {
    if (isPaused) return undefined;
    return subscribeDebugEvents(setEvents);
  }, [isPaused]);

  const visibleEvents = useMemo(() => {
    const query = filter.trim().toLowerCase();

    return events.filter((event) => {
      if (stopOnly && !matchesQuickFilter(event, "Stop")) return false;
      if (!matchesQuickFilter(event, quickFilter)) return false;
      return matchesTextFilter(event, query);
    });
  }, [events, filter, quickFilter, stopOnly]);

  const firstTimestamp = visibleEvents[0]?.timestamp ?? null;

  return (
    <section className="devtools-world__event-log" aria-label="Movement event log">
      <div className="devtools-world__event-log-header">
        <h3 className="devtools-world__title devtools-world__title--clickable" onClick={() => setIsOpen((o) => !o)}>
          <span className="devtools-world__chevron">{isOpen ? "▼" : "▶"}</span>
          Event Log
        </h3>
        {isOpen && <div className="devtools-world__event-log-actions">
          <button
            className="devtools-world__event-log-button"
            type="button"
            onClick={() => setPaused((paused) => !paused)}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button
            className="devtools-world__event-log-button"
            type="button"
            onClick={() => {
              clearDebugEvents();
              setEvents([]);
            }}
          >
            Clear
          </button>
        </div>}
      </div>

      {isOpen && <>
      <input
        className="devtools-world__event-log-filter"
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter type, source, reason, details"
        aria-label="Filter event log"
      />

      <div className="devtools-world__event-log-quick-filters" aria-label="Quick filters">
        {QUICK_FILTERS.map((entry) => (
          <button
            className={`devtools-world__event-log-filter-button${
              quickFilter === entry ? " is-active" : ""
            }`}
            type="button"
            key={entry}
            onClick={() => setQuickFilter(entry)}
          >
            {entry}
          </button>
        ))}
        <button
          className={`devtools-world__event-log-filter-button${
            stopOnly ? " is-active" : ""
          }`}
          type="button"
          onClick={() => setStopOnly((active) => !active)}
        >
          Stop only
        </button>
      </div>

      <div className="devtools-world__event-log-list">
        {visibleEvents.length === 0 ? (
          <div className="devtools-world__event-log-empty">No movement events</div>
        ) : (
          visibleEvents.map((event) => {
            const reason = getReason(event);
            const details = formatDetails(event.details, { includeReason: false });
            const isStop = event.type === "mouse_movement_stop";

            return (
              <div
                className={`devtools-world__event-log-row${isStop ? " is-stop" : ""}`}
                key={event.id}
              >
                <span className="devtools-world__event-log-time">
                  {formatRelativeTime(event, firstTimestamp)}
                </span>
                <span className="devtools-world__event-log-source">{event.source}</span>
                <span className="devtools-world__event-log-type">{event.type}</span>
                <span className="devtools-world__event-log-details">
                  {reason ? (
                    <strong className="devtools-world__event-log-reason">
                      reason:{reason}
                    </strong>
                  ) : null}
                  {details ? (
                    <span className="devtools-world__event-log-detail-text">
                      {details}
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })
        )}
      </div>
      </>}
    </section>
  );
}
