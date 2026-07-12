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
    <section className="woi__abilities" aria-label="Creature abilities editor">
      <h4 className="woi__subtitle">Capacités du template « {templateKey} »</h4>
      <p className="woi__abilities-note">
        Config uniquement — non déclenchées en combat (V5-A). Affecte toutes les instances.
      </p>

      {status === "loading" && <p className="woi__empty">Chargement…</p>}
      {status === "error" && <p className="woi__empty">Erreur (chargement ou sauvegarde).</p>}

      {status === "loaded" && (
        <>
          {abilities.length === 0 ? (
            <p className="woi__empty">Aucune capacité configurée.</p>
          ) : (
            <ul className="woi__abilities-list">
              {abilities.map((a) => (
                <li key={a.skillKey} className="woi__ability-row">
                  <label className="woi__ability-main">
                    <input
                      type="checkbox"
                      checked={a.enabled}
                      onChange={() => toggleEnabled(a.skillKey)}
                      aria-label={`Activer ${a.skillKey}`}
                    />
                    <span className="woi__ability-name">
                      {a.skillName ?? a.skillKey}
                      {a.skillKind && <span className="woi__value--muted"> · {a.skillKind}</span>}
                    </span>
                  </label>
                  {a.missing && (
                    <span className="woi__ability-warn" title="Clé absente du catalogue skill">
                      ⚠ orpheline
                    </span>
                  )}
                  <button
                    type="button"
                    className="woi__ability-remove"
                    onClick={() => removeSkill(a.skillKey)}
                    aria-label={`Retirer ${a.skillKey}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="woi__abilities-add">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label="Choisir un skill à ajouter"
            >
              <option value="">— Ajouter un skill —</option>
              {available.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name} ({c.key})
                </option>
              ))}
            </select>
            <button type="button" onClick={addSkill} disabled={!pick}>
              Ajouter
            </button>
          </div>

          <button
            type="button"
            className="woi__abilities-save"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      )}
    </section>
  );
}
