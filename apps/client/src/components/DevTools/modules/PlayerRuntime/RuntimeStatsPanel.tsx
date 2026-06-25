// apps/client/src/components/DevTools/modules/PlayerRuntime/RuntimeStatsPanel.tsx

import { useState, useCallback } from "react";

const API = import.meta.env.VITE_API_URL as string;

interface BaseStats {
  level: number;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  experience: number;
}

interface DerivedStats {
  maxHp: number;
  attackPower: number;
  defenseTotal: number;
  speed: number;
  gatheringRange: number;
  attackRange: number;
}

interface RuntimeStats {
  base: BaseStats;
  derived: DerivedStats;
}

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="devtools-world__coordinate-row">
      <strong className="devtools-world__coordinate-label">{label}</strong>
      <span className="devtools-world__coordinate-value">{value}</span>
    </div>
  );
}

export default function RuntimeStatsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<RuntimeStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/player-runtime/me/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && !stats) load();
  };

  return (
    <section className="devtools-world__inspector" aria-label="Runtime stats">
      <h3
        className="devtools-world__title devtools-world__title--clickable"
        onClick={handleToggle}
      >
        <span className="devtools-world__chevron">{isOpen ? "▼" : "▶"}</span>
        Player Runtime
        <button
          className="devtools-world__refresh-btn"
          onClick={(e) => { e.stopPropagation(); load(); }}
          title="Rafraîchir"
          style={{ marginLeft: "auto", fontSize: "10px", padding: "1px 5px" }}
        >
          ↺
        </button>
      </h3>

      {isOpen && (
        <div className="devtools-world__coordinate-list">
          {loading && <div className="devtools-world__coordinate-row">Chargement…</div>}
          {error && <div className="devtools-world__coordinate-row" style={{ color: "#f66" }}>{error}</div>}

          {stats && (
            <>
              <div className="devtools-world__coordinate-row" style={{ fontWeight: "bold", color: "#aaa", fontSize: "10px", textTransform: "uppercase" }}>
                Base Stats
              </div>
              <StatRow label="Level" value={stats.base.level} />
              <StatRow label="HP" value={`${stats.base.health} / ${stats.base.maxHealth}`} />
              <StatRow label="Attack" value={stats.base.attack} />
              <StatRow label="Defense" value={stats.base.defense} />
              <StatRow label="XP" value={stats.base.experience} />

              <div className="devtools-world__coordinate-row" style={{ fontWeight: "bold", color: "#aaa", fontSize: "10px", textTransform: "uppercase", marginTop: "4px" }}>
                Derived Stats
              </div>
              <StatRow label="Max HP" value={stats.derived.maxHp} />
              <StatRow label="Attack Power" value={stats.derived.attackPower} />
              <StatRow label="Defense Total" value={stats.derived.defenseTotal} />
              <StatRow label="Speed" value={stats.derived.speed === 0 ? "—" : stats.derived.speed} />
              <StatRow label="Gather Range" value={stats.derived.gatheringRange === 0 ? "—" : stats.derived.gatheringRange} />
              <StatRow label="Attack Range" value={stats.derived.attackRange === 0 ? "—" : stats.derived.attackRange} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
