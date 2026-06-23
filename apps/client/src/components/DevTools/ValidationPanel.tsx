import { useDevToolsStore } from "../../store/devtools.store";
import { validateWorldObject, type Diagnostic } from "./validation/validateWorldObject";
import "./ValidationPanel.scss";

const ICON: Record<string, string> = {
  info: "ℹ",
  warning: "⚠",
  error: "✗",
};

function DiagItem({ d }: { d: Diagnostic }) {
  return (
    <li className={`vp__item vp__item--${d.severity}`}>
      <span className="vp__icon">{ICON[d.severity]}</span>
      <span className="vp__code">{d.code}</span>
      <span className="vp__message">{d.message}</span>
    </li>
  );
}

export default function ValidationPanel() {
  const obj = useDevToolsStore((s) => s.selectedWorldObject);

  return (
    <section className="vp" aria-label="Validation panel">
      <h3 className="vp__title">Validation</h3>
      {!obj ? (
        <p className="vp__empty">Sélectionner un WorldObject.</p>
      ) : (() => {
        const diags = validateWorldObject(obj);
        return diags.length === 0 ? (
          <p className="vp__ok">✓ OK</p>
        ) : (
          <ul className="vp__list">
            {diags.map((d) => (
              <DiagItem key={d.code} d={d} />
            ))}
          </ul>
        );
      })()}
    </section>
  );
}
