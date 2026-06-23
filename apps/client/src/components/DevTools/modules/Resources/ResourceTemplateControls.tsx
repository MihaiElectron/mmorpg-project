import { useEffect, useState } from "react";
import { useDevToolsStore } from "../../../../store/devtools.store";
import "./ResourceTemplateControls.scss";

const API = import.meta.env.VITE_API_URL as string;
const MAX_RESPAWN_MS = 86_400_000;

interface Props {
  onRefresh: () => void;
}

export function ResourceTemplateControls({ onRefresh }: Props) {
  const obj = useDevToolsStore((s) => s.selectedWorldObject);

  const isResource = obj?.category === "resource";
  const type = obj?.type ?? null;
  const rawDelay =
    typeof obj?.metadata?.respawnDelayMs === "number" ? obj.metadata.respawnDelayMs : null;

  const [delay, setDelay] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDelay(rawDelay != null ? String(rawDelay) : "");
    setError(null);
  }, [obj?.id, rawDelay]);

  if (!isResource || !type) return null;

  async function handleSave() {
    const value = parseInt(delay, 10);
    if (!Number.isFinite(value) || value <= 0 || value > MAX_RESPAWN_MS) {
      setError(`Entier requis, compris entre 1 et ${MAX_RESPAWN_MS} ms`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(`${API}/admin/resource-templates/${type}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ respawnDelayMs: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        setError(typeof body.message === "string" ? body.message : `Erreur ${res.status}`);
      } else {
        onRefresh();
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rtc">
      <div className="rtc__header">
        Template <span className="rtc__type">{type}</span>
      </div>
      <div className="rtc__row">
        <label className="rtc__label" htmlFor="rtc-respawn">
          respawnDelay (ms)
        </label>
        <input
          id="rtc-respawn"
          className="rtc__input"
          type="number"
          min="1"
          max={MAX_RESPAWN_MS}
          step="1000"
          value={delay}
          onChange={(e) => setDelay(e.target.value)}
        />
        <button className="rtc__save" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Sauver"}
        </button>
      </div>
      {error && <p className="rtc__error">{error}</p>}
    </div>
  );
}
