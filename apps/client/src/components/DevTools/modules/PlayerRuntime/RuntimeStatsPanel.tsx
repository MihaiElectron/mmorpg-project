// apps/client/src/components/DevTools/modules/PlayerRuntime/RuntimeStatsPanel.tsx

import { useState, useCallback } from "react";

const API = import.meta.env.VITE_API_URL as string;

// ─── Types (miroir du backend, sans dépendance) ────────────────────────────

type StatKey =
  | "maxHp"
  | "attackPower"
  | "defenseTotal"
  | "speed"
  | "gatheringRange"
  | "attackRange";

type ModifierOperation = "flat" | "percent_add" | "percent_multiply";

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

interface RuntimeModifier {
  id: string;
  sourceType: string;
  sourceLabel: string;
  targetStat: StatKey;
  operation: ModifierOperation;
  value: number;
  priority: number;
  enabled: boolean;
  reason?: string;
}

interface RuntimeSourceEntry {
  kind: string;
  modifiers: RuntimeModifier[];
}

interface ModifierApplication {
  modifierId: string;
  sourceType: string;
  sourceLabel: string;
  operation: ModifierOperation;
  value: number;
  contribution: number;
}

interface StatTrace {
  stat: StatKey;
  baseValue: number;
  modifiers: ModifierApplication[];
  finalValue: number;
}

interface RuntimeTrace {
  stats: Partial<Record<StatKey, StatTrace>>;
  modifierCount: number;
  computedAt: string;
}

interface PlayerRuntimeSnapshot {
  characterId: string;
  name: string;
  baseStats: BaseStats;
  derivedStats: DerivedStats;
  sources: RuntimeSourceEntry[];
  modifiers: RuntimeModifier[];
  trace: RuntimeTrace;
  computedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const STAT_LABELS: Record<StatKey, string> = {
  maxHp: "Max HP",
  attackPower: "Attack Power",
  defenseTotal: "Defense Total",
  speed: "Speed",
  gatheringRange: "Gather Range",
  attackRange: "Attack Range",
};

const OP_LABELS: Record<ModifierOperation, string> = {
  flat: "flat",
  percent_add: "%+",
  percent_multiply: "×%",
};

function formatStatValue(key: StatKey, value: number): string {
  return value === 0 && (key === "speed" || key === "gatheringRange" || key === "attackRange")
    ? "—"
    : String(value);
}

// ─── Sous-composants ──────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="devtools-world__coordinate-row">
      <strong className="devtools-world__coordinate-label">{label}</strong>
      <span className="devtools-world__coordinate-value">{value}</span>
    </div>
  );
}

function SectionHeader({ label, spaced = false }: { label: string; spaced?: boolean }) {
  return (
    <div
      className={
        "devtools-world__section-header" +
        (spaced ? " devtools-world__section-header--spaced" : "")
      }
    >
      {label}
    </div>
  );
}

function SourceRow({ source }: { source: RuntimeSourceEntry }) {
  const count = source.modifiers.length;
  return (
    <div className="devtools-world__source-row">
      <span className="devtools-world__source-kind">{source.kind}</span>
      <span className="devtools-world__source-count">
        {count} {count === 1 ? "mod" : "mods"}
      </span>
    </div>
  );
}

function TraceStat({ statTrace }: { statTrace: StatTrace }) {
  const label = STAT_LABELS[statTrace.stat] ?? statTrace.stat;
  const changed = statTrace.finalValue !== statTrace.baseValue;

  return (
    <div className="devtools-world__trace-stat">
      <div className="devtools-world__trace-stat-header">
        <span className="devtools-world__trace-stat-name">{label}</span>
        <span className="devtools-world__trace-stat-values">
          {changed
            ? `${statTrace.baseValue} → ${statTrace.finalValue}`
            : String(statTrace.finalValue)}
        </span>
      </div>
      {statTrace.modifiers.map((app) => (
        <div key={app.modifierId} className="devtools-world__trace-modifier">
          <span className="devtools-world__trace-modifier-source">{app.sourceLabel}</span>
          <span className="devtools-world__trace-modifier-op">{OP_LABELS[app.operation]}</span>
          <span className="devtools-world__trace-modifier-contribution">
            {app.contribution >= 0 ? "+" : ""}
            {app.contribution}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Panneau principal ────────────────────────────────────────────────────

const STAT_KEYS: StatKey[] = [
  "maxHp",
  "attackPower",
  "defenseTotal",
  "speed",
  "gatheringRange",
  "attackRange",
];

export default function RuntimeStatsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<PlayerRuntimeSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/player-runtime/me/snapshot`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSnapshot(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && !snapshot) loadSnapshot();
  };

  const handleTraceToggle = () => setTraceOpen((v) => !v);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    loadSnapshot();
  };

  return (
    <section className="devtools-world__inspector" aria-label="Player Runtime">
      <h3
        className="devtools-world__title devtools-world__title--clickable"
        onClick={handleToggle}
      >
        <span className="devtools-world__chevron">{isOpen ? "▼" : "▶"}</span>
        Player Runtime
        <button className="devtools-world__refresh-btn" onClick={handleRefresh} title="Rafraîchir">
          ↺
        </button>
      </h3>

      {isOpen && (
        <div className="devtools-world__coordinate-list">
          {loading && (
            <div className="devtools-world__coordinate-row">Chargement…</div>
          )}
          {error && (
            <div className="devtools-world__error">{error}</div>
          )}

          {snapshot && (
            <>
              <SectionHeader label="Base Stats" />
              <StatRow label="Level" value={snapshot.baseStats.level} />
              <StatRow label="HP" value={`${snapshot.baseStats.health} / ${snapshot.baseStats.maxHealth}`} />
              <StatRow label="Attack" value={snapshot.baseStats.attack} />
              <StatRow label="Defense" value={snapshot.baseStats.defense} />
              <StatRow label="XP" value={snapshot.baseStats.experience} />

              <SectionHeader label="Derived Stats" spaced />
              {STAT_KEYS.map((key) => (
                <StatRow
                  key={key}
                  label={STAT_LABELS[key]}
                  value={formatStatValue(key, snapshot.derivedStats[key])}
                />
              ))}

              <SectionHeader
                label={`Sources (${snapshot.modifiers.length} mod${snapshot.modifiers.length !== 1 ? "s" : ""} actif${snapshot.modifiers.length !== 1 ? "s" : ""})`}
                spaced
              />
              {snapshot.sources.map((src) => (
                <SourceRow key={src.kind} source={src} />
              ))}

              <h3
                className="devtools-world__title devtools-world__title--clickable devtools-world__title--spaced"
                onClick={handleTraceToggle}
              >
                <span className="devtools-world__chevron">
                  {traceOpen ? "▼" : "▶"}
                </span>
                Trace
                <span className="devtools-world__trace-badge">
                  {snapshot.trace.modifierCount} mod.
                </span>
              </h3>

              {traceOpen && (
                snapshot.trace.modifierCount === 0 ? (
                  <div className="devtools-world__trace-empty">
                    Aucun modifier actif.
                  </div>
                ) : (
                  STAT_KEYS.map((key) => {
                    const st = snapshot.trace.stats[key];
                    if (!st || st.modifiers.length === 0) return null;
                    return <TraceStat key={key} statTrace={st} />;
                  })
                )
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
