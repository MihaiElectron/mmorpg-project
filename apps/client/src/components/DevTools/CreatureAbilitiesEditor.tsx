import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL as string;

/** Miroir de `CreatureAbilityDto` (serveur) — aucune donnée inventée côté client. */
interface Ability {
  skillKey: string;
  enabled: boolean;
  displayOrder: number;
  skillName: string | null;
  skillKind: string | null;
  skillEnabled: boolean | null;
  missing: boolean;
}

interface SkillCatalogEntry {
  key: string;
  name: string;
  skillKind?: string;
}

type Status = "loading" | "loaded" | "error";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/**
 * Éditeur des capacités configurables d'un CreatureTemplate (V5-A).
 * Config uniquement : associe des SkillDefinition existants au template. Les
 * skills NE sont PAS déclenchés en combat à ce stade. Affecte toutes les
 * instances du template.
 */
export default function CreatureAbilitiesEditor({ templateKey }: { templateKey: string }) {
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [catalog, setCatalog] = useState<SkillCatalogEntry[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pick, setPick] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setStatus("loading");
    setDirty(false);
    Promise.all([
      fetch(`${API}/admin/templates/${templateKey}/abilities`, {
        headers: authHeaders(),
        signal: controller.signal,
      }).then((r) => (r.ok ? (r.json() as Promise<Ability[]>) : Promise.reject(new Error(`HTTP ${r.status}`)))),
      fetch(`${API}/admin/skill-definitions`, {
        headers: authHeaders(),
        signal: controller.signal,
      }).then((r) => (r.ok ? (r.json() as Promise<SkillCatalogEntry[]>) : Promise.reject(new Error(`HTTP ${r.status}`)))),
    ])
      .then(([abi, cat]) => {
        if (!active) return;
        setAbilities(abi);
        setCatalog(cat);
        setStatus("loaded");
      })
      .catch((e) => {
        if (!active || e?.name === "AbortError") return;
        setStatus("error");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [templateKey]);

  function addSkill() {
    if (!pick) return;
    if (abilities.some((a) => a.skillKey === pick)) return;
    const entry = catalog.find((c) => c.key === pick);
    setAbilities((prev) => [
      ...prev,
      {
        skillKey: pick,
        enabled: true,
        displayOrder: prev.length,
        skillName: entry?.name ?? null,
        skillKind: entry?.skillKind ?? null,
        skillEnabled: true,
        missing: !entry,
      },
    ]);
    setPick("");
    setDirty(true);
  }

  function removeSkill(key: string) {
    setAbilities((prev) => prev.filter((a) => a.skillKey !== key));
    setDirty(true);
  }

  function toggleEnabled(key: string) {
    setAbilities((prev) =>
      prev.map((a) => (a.skillKey === key ? { ...a, enabled: !a.enabled } : a)),
    );
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        abilities: abilities.map((a, idx) => ({
          skillKey: a.skillKey,
          enabled: a.enabled,
          displayOrder: idx,
        })),
      };
      const r = await fetch(`${API}/admin/templates/${templateKey}/abilities`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const fresh = (await r.json()) as Ability[];
      setAbilities(fresh);
      setDirty(false);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const available = catalog.filter((c) => !abilities.some((a) => a.skillKey === c.key));

  return (
    <div className="admin-panel__template-stats" aria-label="Creature abilities editor">
      <span className="admin-panel__template-stat-label">Capacités du template « {templateKey} »</span>
      <p className="admin-panel__info-line">
        Config uniquement — non déclenchées en combat (V5-A). Affecte toutes les instances.
      </p>

      {status === "loading" && <p className="admin-panel__info-line">Chargement…</p>}
      {status === "error" && (
        <p className="admin-panel__info-line">Erreur (chargement ou sauvegarde).</p>
      )}

      {status === "loaded" && (
        <>
          {abilities.length === 0 ? (
            <p className="admin-panel__info-line">Aucune capacité configurée.</p>
          ) : (
            abilities.map((a) => (
              <label key={a.skillKey} className="admin-panel__template-stat">
                <span className="admin-panel__template-stat-label">
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={() => toggleEnabled(a.skillKey)}
                    aria-label={`Activer ${a.skillKey}`}
                  />{" "}
                  {a.skillName ?? a.skillKey}
                  {a.skillKind ? ` · ${a.skillKind}` : ""}
                  {a.missing ? " ⚠ orpheline" : ""}
                </span>
                <button
                  type="button"
                  className="admin-panel__del-toggle"
                  onClick={() => removeSkill(a.skillKey)}
                  title={`Retirer ${a.skillKey}`}
                  aria-label={`Retirer ${a.skillKey}`}
                >
                  ✕
                </button>
              </label>
            ))
          )}

          <label className="admin-panel__template-stat">
            <span className="admin-panel__template-stat-label">Ajouter un skill</span>
            <select
              className="admin-panel__template-stat-select"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label="Choisir un skill à ajouter"
            >
              <option value="">—</option>
              {available.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name} ({c.key})
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="admin-panel__apply-btn" onClick={addSkill} disabled={!pick}>
            Ajouter
          </button>
          <button
            type="button"
            className="admin-panel__apply-btn"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      )}
    </div>
  );
}
