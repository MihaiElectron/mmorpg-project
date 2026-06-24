export type DebugEventDetails = Record<
  string,
  string | number | boolean | null | undefined
>;

export type DebugEvent = {
  id: number;
  timestamp: number;
  source: string;
  type: string;
  details?: DebugEventDetails;
};

type DebugEventInput = Omit<DebugEvent, "id" | "timestamp"> & {
  timestamp?: number;
};

type DebugEventListener = (events: DebugEvent[]) => void;

const MAX_DEBUG_EVENTS = 200;

let nextId = 1;
let debugEvents: DebugEvent[] = [];
const listeners = new Set<DebugEventListener>();

function emit() {
  const snapshot = getDebugEvents();
  listeners.forEach((listener) => listener(snapshot));
}

export function pushDebugEvent(event: DebugEventInput): void {
  const entry: DebugEvent = {
    id: nextId,
    timestamp: event.timestamp ?? Date.now(),
    source: event.source,
    type: event.type,
    details: event.details,
  };

  nextId += 1;
  debugEvents = [...debugEvents, entry].slice(-MAX_DEBUG_EVENTS);
  emit();
}

export function getDebugEvents(): DebugEvent[] {
  return [...debugEvents];
}

export function clearDebugEvents(): void {
  debugEvents = [];
  emit();
}

export function subscribeDebugEvents(listener: DebugEventListener): () => void {
  listeners.add(listener);
  listener(getDebugEvents());
  return () => listeners.delete(listener);
}
