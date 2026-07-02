import { useEffect, useState } from "react";
import { useDevToolsStore } from "../../../../store/devtools.store";
import "./ResourceTemplateControls.scss";

const API = import.meta.env.VITE_API_URL as string;
const MAX_RESPAWN_MS = 86_400_000;
const MAX_LOOTS = 999_999;
const MAX_XP = 999_999;

// XP skill estimée (lecture seule) — miroir EXACT du Runtime (ResourcesGateway +
// calculateSkillXp). TODO(shared): le module skill-xp-calculator vit dans
// api-gateway (pas d'alias cross-app côté client). Duplication d'affichage
// uniquement — domain=gathering, action=gather, success=true, quality=null.
// xpAmount = base 10 + floor(difficulty / 10).
const GATHERING_RESOURCE_SKILL_MAP: Record<string, string> = {
  dead_tree: "woodcutting",
  ore: "mining",
};

function gatherSkillXpEstimateLabel(resourceType: string, difficulty: number): string {
  const skillKey = GATHERING_RESOURCE_SKILL_MAP[resourceType];
  if (!skillKey) return "aucune";
  const d = Math.max(0, Math.min(100, Number(difficulty) || 0));
  const xpAmount = Math.max(1, Math.round(10 + Math.floor(d / 10)));
  const skillName = skillKey.charAt(0).toUpperCase() + skillKey.slice(1);
  return `+${xpAmount} ${skillName}`;
}

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
  const rawCharXp =
    typeof obj?.metadata?.gatherCharacterXpReward === "number"
      ? obj.metadata.gatherCharacterXpReward
      : null;
  const rawDifficulty =
    typeof obj?.metadata?.gatheringDifficulty === "number"
      ? obj.metadata.gatheringDifficulty
      : null;

  const [delay, setDelay] = useState<string>("");
  const [loots, setLoots] = useState<string>("");
  const [charXp, setCharXp] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDelay(rawDelay != null ? String(rawDelay) : "");
    setLoots(rawLoots != null ? String(rawLoots) : "");
    setCharXp(rawCharXp != null ? String(rawCharXp) : "");
    setDifficulty(rawDifficulty != null ? String(rawDifficulty) : "");
    setError(null);
  }, [obj?.id, rawDelay, rawLoots, rawCharXp, rawDifficulty]);

  if (!isResource || !type) return null;

  function buildPatch():
    | { respawnDelayMs?: number; defaultRemainingLoots?: number; gatherCharacterXpReward?: number; gatheringDifficulty?: number }
    | null {
    const patch: {
      respawnDelayMs?: number;
      defaultRemainingLoots?: number;
      gatherCharacterXpReward?: number;
      gatheringDifficulty?: number;
    } = {};

    if (delay !== "") {
      const v = parseInt(delay, 10);
      if (!Number.isFinite(v) || v <= 0 || v > MAX_RESPAWN_MS) return null;
      patch.respawnDelayMs = v;
    }
    if (loots !== "") {
      const v = parseInt(loots, 10);
      if (!Number.isFinite(v) || v < 1 || v > MAX_LOOTS) return null;
      patch.defaultRemainingLoots = v;
    }
    if (charXp !== "") {
      const v = parseInt(charXp, 10);
      if (!Number.isFinite(v) || v < 0 || v > MAX_XP) return null;
      patch.gatherCharacterXpReward = v;
    }
    if (difficulty !== "") {
      const v = parseInt(difficulty, 10);
      if (!Number.isFinite(v) || v < 0 || v > 100) return null;
      patch.gatheringDifficulty = v;
    }

    return patch;
  }

  async function handleSave() {
    const patch = buildPatch();
    if (patch === null) {
      setError(
        `Valeurs invalides — respawn : 1–${MAX_RESPAWN_MS}, loots : 1–${MAX_LOOTS}, XP perso : 0–${MAX_XP}, difficulté : 0–100`,
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
        <label className="rtc__label" htmlFor="rtc-respawn">respawnDelay (ms)</label>
        <input id="rtc-respawn" className="rtc__input" type="number" min="1" max={MAX_RESPAWN_MS}
          step="1000" value={delay} onChange={(e) => setDelay(e.target.value)} />
      </div>

      <div className="rtc__row">
        <label className="rtc__label" htmlFor="rtc-loots">defaultLoots</label>
        <input id="rtc-loots" className="rtc__input" type="number" min="1" max={MAX_LOOTS}
          step="1" value={loots} onChange={(e) => setLoots(e.target.value)} />
      </div>

      <div className="rtc__row">
        <label className="rtc__label" htmlFor="rtc-charxp">XP perso récolte</label>
        <input id="rtc-charxp" className="rtc__input" type="number" min="0" max={MAX_XP}
          step="1" value={charXp} onChange={(e) => setCharXp(e.target.value)} />
      </div>

      <div className="rtc__row">
        <label className="rtc__label" htmlFor="rtc-difficulty">Difficulté récolte (0–100)</label>
        <input id="rtc-difficulty" className="rtc__input" type="number" min="0" max="100"
          step="1" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} />
      </div>

      <div className="rtc__row">
        <span className="rtc__label">XP skill estimée</span>
        <span className="rtc__readonly" title="Calculée par le Runtime depuis la difficulté (non éditable)">
          {gatherSkillXpEstimateLabel(type, difficulty === "" ? (rawDifficulty ?? 0) : Number(difficulty))}
        </span>
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
