import { useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL as string;

/** Miroir de `CreatureAbilityDto` (serveur) — aucune donnée inventée côté client. */
interface Ability {
  skillKey: string;
  enabled: boolean;
  displayOrder: number;
  skillName: string | null;
  skillKind: string | null;
  skillEnabled: boolean | null;
  // V5-C3 : métadonnées catalogue read-only (jamais renvoyées au PUT).
  effectType: string | null;
  damageType: string | null;
  rangeWU: number | null;
  cooldownMs: number | null;
  missing: boolean;
}

interface SkillCatalogEntry {
  key: string;
  name: string;
  skillKind?: string;
}

type Status = "idle" | "loading" | "loaded" | "error";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Affiche une valeur read-only du catalogue, "—" si absente. Aucun calcul métier. */
function val(v: string | number | null | undefined): string {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

/** Ligne compacte de métadonnées catalogue (read-only serveur). */
function metaLine(a: Ability): string {
  return [
    `Priorité ${a.displayOrder}`,
    val(a.effectType),
    val(a.damageType),
    `portée ${a.rangeWU != null ? `${a.rangeWU} WU` : "—"}`,
    `CD ${a.cooldownMs != null ? `${a.cooldownMs} ms` : "—"}`,
  ].join(" · ");
}

/** Ligne d'état association + catalogue. */
function stateLine(a: Ability): string {
  const assoc = a.enabled ? "Association active" : "Association inactive";
  const cat = a.missing
    ? "Skill introuvable dans le catalogue"
    : a.skillEnabled === false
      ? "Skill désactivé dans le catalogue"
      : "Skill catalogue actif";
  return `${assoc} · ${cat}`;
}

/**
 * Éditeur des capacités configurables d'un CreatureTemplate (V5-A).
 * Config uniquement : associe des SkillDefinition existants au template. Les
 * skills NE sont PAS déclenchés en combat à ce stade. Affecte toutes les
 * instances du template.
 */
export default function CreatureAbilitiesEditor({ templateKey }: { templateKey: string }) {
  const [expanded, setExpanded] = useState(false);
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [catalog, setCatalog] = useState<SkillCatalogEntry[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pick, setPick] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  function load() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("loading");
    setDirty(false);
    Promise.all([
      fetch(`${API}/admin/templates/${templateKey}/abilities`, {
        headers: authHeaders(),
        signal: ctrl.signal,
      }).then((r) => (r.ok ? (r.json() as Promise<Ability[]>) : Promise.reject(new Error(`HTTP ${r.status}`)))),
      fetch(`${API}/admin/skill-definitions`, {
        headers: authHeaders(),
        signal: ctrl.signal,
      }).then((r) => (r.ok ? (r.json() as Promise<SkillCatalogEntry[]>) : Promise.reject(new Error(`HTTP ${r.status}`)))),
    ])
      .then(([abi, cat]) => {
        if (ctrl.signal.aborted) return;
        setAbilities(abi);
        setCatalog(cat);
        setStatus("loaded");
      })
      .catch((e) => {
        if (ctrl.signal.aborted || e?.name === "AbortError") return;
        setStatus("error");
      });
  }

  // Recharge quand le template change (si la section est déjà ouverte).
  useEffect(() => {
    if (expanded) load();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function onToggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && status === "idle") load(); // fetch PARESSEUX à la 1re ouverture
  }

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
        // Métadonnées catalogue renseignées par le serveur au prochain reload.
        effectType: null,
        damageType: null,
        rangeWU: null,
        cooldownMs: null,
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
    <div className="creature-abilities" aria-label="Creature abilities editor">
      <button
        type="button"
        className="creature-abilities__toggle"
        onClick={onToggleExpand}
        aria-expanded={expanded}
      >
        {expanded ? "▾" : "▸"} CAPACITÉS
      </button>

      {expanded && (
        <div className="creature-abilities__body">
          <p className="creature-abilities__note">
            Config uniquement — non déclenchées en combat (V5-A). Affecte toutes les instances.
          </p>

          {status === "loading" && <p className="creature-abilities__muted">Chargement…</p>}
          {status === "error" && (
            <p className="creature-abilities__error">Erreur (chargement ou sauvegarde).</p>
          )}

          {status === "loaded" && (
            <>
              {abilities.length === 0 ? (
            <p className="creature-abilities__muted">Aucune capacité configurée.</p>
          ) : (
            <ul className="creature-abilities__list">
              {abilities.map((a) => (
                <li
                  key={a.skillKey}
                  className={`creature-abilities__item${a.enabled ? " creature-abilities__item--active" : ""}`}
                >
                  <div className="creature-abilities__item-main">
                    <span className="creature-abilities__item-name">{a.skillName ?? a.skillKey}</span>
                    <span className="creature-abilities__item-key">{a.skillKey}</span>
                    <span className="creature-abilities__item-tags">{metaLine(a)}</span>
                    <span
                      className={`creature-abilities__item-state${a.missing || a.skillEnabled === false ? " creature-abilities__item-state--warn" : ""}`}
                    >
                      {stateLine(a)}
                    </span>
                  </div>
                  <div className="creature-abilities__item-actions">
                    <span
                      className={`creature-abilities__badge creature-abilities__badge--${a.enabled ? "on" : "off"}`}
                    >
                      {a.enabled ? "activé" : "désactivé"}
                    </span>
                    <button
                      type="button"
                      className="creature-abilities__btn creature-abilities__btn--neutral"
                      onClick={() => toggleEnabled(a.skillKey)}
                    >
                      {a.enabled ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      type="button"
                      className="creature-abilities__btn creature-abilities__btn--danger"
                      onClick={() => removeSkill(a.skillKey)}
                    >
                      Retirer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="creature-abilities__toolbar">
            <select
              className="creature-abilities__select"
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
            <button
              type="button"
              className="creature-abilities__btn creature-abilities__btn--neutral"
              onClick={addSkill}
              disabled={!pick}
            >
              Ajouter
            </button>
            <button
              type="button"
              className="creature-abilities__btn creature-abilities__btn--confirm"
              onClick={save}
              disabled={!dirty || saving}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
