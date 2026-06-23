import { useEffect, useState } from "react";
import { useDevToolsStore } from "../../../../store/devtools.store";
import "./ResourceTemplateControls.scss";

const API = import.meta.env.VITE_API_URL as string;
const MAX_RESPAWN_MS = 86_400_000;
const MAX_LOOTS = 999_999;

interface Props {
  onRefresh: () => void;
}

export function ResourceTemplateControls({ onRefresh }: Props) {
  const obj = useDevToolsStore((s) => s.selectedWorldObject);

  const isResource = obj?.category === "resource";
  const type = obj?.type ?? null;
  const rawDelay =
    typeof obj?.metadata?.respawnDelayMs === "number" ? obj.metadata.respawnDelayMs : null;
  const rawLoots =
    typeof obj?.metadata?.defaultRemainingLoots === "number"
      ? obj.metadata.defaultRemainingLoots
      : null;

  const [delay, setDelay] = useState<string>("");
  const [loots, setLoots] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDelay(rawDelay != null ? String(rawDelay) : "");
    setLoots(rawLoots != null ? String(rawLoots) : "");
    setError(null);
  }, [obj?.id, rawDelay, rawLoots]);

  if (!isResource || !type) return null;

  function buildPatch(): { respawnDelayMs?: number; defaultRemainingLoots?: number } | null {
    const patch: { respawnDelayMs?: number; defaultRemainingLoots?: number } = {};
    let hasField = false;

    if (delay !== "") {
      const v = parseInt(delay, 10);
      if (!Number.isFinite(v) || v <= 0 || v > MAX_RESPAWN_MS) {
        return null;
      }
      patch.respawnDelayMs = v;
      hasField = true;
    }

    if (loots !== "") {
      const v = parseInt(loots, 10);
      if (!Number.isFinite(v) || v < 1 || v > MAX_LOOTS) {
        return null;
      }
      patch.defaultRemainingLoots = v;
      hasField = true;
    }

    return hasField ? patch : {};
  }

  async function handleSave() {
    const patch = buildPatch();
    if (patch === null) {
      setError(
        `Valeurs invalides — respawnDelay : 1–${MAX_RESPAWN_MS} ms, loots : 1–${MAX_LOOTS}`,
      );
      return;
    }
    if (Object.keys(patch).length === 0) {
      setError("Aucun champ à sauvegarder");
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
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
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
      </div>

      <div className="rtc__row">
        <label className="rtc__label" htmlFor="rtc-loots">
          defaultLoots
        </label>
        <input
          id="rtc-loots"
          className="rtc__input"
          type="number"
          min="1"
          max={MAX_LOOTS}
          step="1"
          value={loots}
          onChange={(e) => setLoots(e.target.value)}
        />
      </div>

      <div className="rtc__actions">
        <button className="rtc__save" onClick={handleSave} disabled={saving}>
          {saving ? "…" : "Sauver"}
        </button>
      </div>

      {error && <p className="rtc__error">{error}</p>}
    </div>
  );
}
