import CoordinateInspector from "./CoordinateInspector";
import EventLogPanel from "./EventLogPanel";
import "./WorldModule.scss";

export default function WorldModule() {
  return (
    <section className="devtools-world" aria-label="World DevTools module">
      <CoordinateInspector />
      <EventLogPanel />
    </section>
  );
}
