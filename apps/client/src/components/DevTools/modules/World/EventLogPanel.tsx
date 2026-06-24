import { useEffect, useMemo, useState } from "react";
import {
  clearDebugEvents,
  getDebugEvents,
  subscribeDebugEvents,
  type DebugEvent,
} from "../../debugEventLog";

function formatRelativeTime(event: DebugEvent, firstTimestamp: number | null): string {
  if (firstTimestamp === null) return "+0.00s";
  return `+${((event.timestamp - firstTimestamp) / 1000).toFixed(2)}s`;
}

function formatDetails(details: DebugEvent["details"]): string {
  if (!details) return "";

  return Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}:${value ?? "null"}`)
    .join(" ");
}

export default function EventLogPanel() {
  const [events, setEvents] = useState<DebugEvent[]>(() => getDebugEvents());
  const [isPaused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (isPaused) return undefined;
    return subscribeDebugEvents(setEvents);
  }, [isPaused]);

  const visibleEvents = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return events;

    return events.filter((event) => {
      const text = `${event.source} ${event.type} ${formatDetails(event.details)}`;
      return text.toLowerCase().includes(query);
    });
  }, [events, filter]);

  const firstTimestamp = visibleEvents[0]?.timestamp ?? null;

  return (
    <section className="devtools-world__event-log" aria-label="Movement event log">
      <div className="devtools-world__event-log-header">
        <h3 className="devtools-world__title">Event Log</h3>
        <div className="devtools-world__event-log-actions">
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
        </div>
      </div>

      <input
        className="devtools-world__event-log-filter"
        type="search"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter"
        aria-label="Filter event log"
      />

      <div className="devtools-world__event-log-list">
        {visibleEvents.length === 0 ? (
          <div className="devtools-world__event-log-empty">No movement events</div>
        ) : (
          visibleEvents.map((event) => (
            <div className="devtools-world__event-log-row" key={event.id}>
              <span className="devtools-world__event-log-time">
                {formatRelativeTime(event, firstTimestamp)}
              </span>
              <span className="devtools-world__event-log-source">{event.source}</span>
              <span className="devtools-world__event-log-type">{event.type}</span>
              <span className="devtools-world__event-log-details">
                {formatDetails(event.details)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
