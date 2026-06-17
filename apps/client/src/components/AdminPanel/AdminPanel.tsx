import { useEffect, useState, useRef } from "react";

type CreatureTemplate = {
  id: number;
  key: string;
  name: string;
  baseHealth: number;
  baseAttack: number;
  baseArmor: number;
  aggroRadius: number;
  fleeThresholdPct: number;
  patrolRadius: number;
  speedMin: number;
  speedMax: number;
};

type Overview = {
  templates: number;
  spawns: number;
  activeAnimals: number;
};

const API = import.meta.env.VITE_API_URL as string;

function fetchAdmin<T>(path: string, token: string): Promise<T> {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<T>;
  });
}

export default function AdminPanel() {
  const token = localStorage.getItem("token") ?? "";
  const [overview, setOverview] = useState<Overview | null>(null);
  const [templates, setTemplates] = useState<CreatureTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetchAdmin<Overview>("/admin/overview", token),
      fetchAdmin<CreatureTemplate[]>("/admin/templates", token),
    ])
      .then(([ov, tpl]) => {
        setOverview(ov);
        setTemplates(tpl);
      })
      .catch(() => setError("Impossible de charger les données admin."));
  }, [token]);

  function handleCommandKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && command.trim()) {
      // Le parsing des commandes sera implémenté dans la prochaine étape
      setCommand("");
    }
  }

  return (
    <div className="admin-panel">
      {/* Champ de commande */}
      <div className="admin-panel__command">
        <span className="admin-panel__command-prefix">&gt;</span>
        <input
          ref={inputRef}
          className="admin-panel__command-input"
          type="text"
          placeholder="commande... (ex: /spawn turkey 300 400)"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleCommandKey}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {error && <p className="admin-panel__error">{error}</p>}

      {/* Vue d'ensemble */}
      {overview && (
        <section className="admin-panel__section">
          <h3 className="admin-panel__section-title">Vue d&apos;ensemble</h3>
          <div className="admin-panel__overview">
            <div className="admin-panel__stat">
              <span className="admin-panel__stat-value">{overview.templates}</span>
              <span className="admin-panel__stat-label">Templates</span>
            </div>
            <div className="admin-panel__stat">
              <span className="admin-panel__stat-value">{overview.spawns}</span>
              <span className="admin-panel__stat-label">Spawns</span>
            </div>
            <div className="admin-panel__stat">
              <span className="admin-panel__stat-value">{overview.activeAnimals}</span>
              <span className="admin-panel__stat-label">Animaux actifs</span>
            </div>
          </div>
        </section>
      )}

      {/* Templates de créatures */}
      <section className="admin-panel__section">
        <h3 className="admin-panel__section-title">Créatures</h3>
        {templates.length === 0 && !error && (
          <p className="admin-panel__loading">Chargement…</p>
        )}
        <div className="admin-panel__template-list">
          {templates.map((t) => (
            <div key={t.id} className="admin-panel__template-item">
              <span className="admin-panel__template-name">{t.name}</span>
              <div className="admin-panel__template-stats">
                <span className="admin-panel__template-stat">
                  <span>PV</span><span>{t.baseHealth}</span>
                </span>
                <span className="admin-panel__template-stat">
                  <span>ATK</span><span>{t.baseAttack}</span>
                </span>
                <span className="admin-panel__template-stat">
                  <span>Aggro</span><span>{t.aggroRadius}</span>
                </span>
                <span className="admin-panel__template-stat">
                  <span>Fuite</span><span>{t.fleeThresholdPct}%</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
