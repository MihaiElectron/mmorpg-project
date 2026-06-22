import CoordinateInspector from "./CoordinateInspector";
import "./WorldModule.scss";

export default function WorldModule() {
  return (
    <section className="devtools-world" aria-label="World DevTools module">
      <CoordinateInspector />
    </section>
  );
}
