import { useEffect, useState } from "react";
import { useDevToolsStore } from "../../store/devtools.store";

const API = import.meta.env.VITE_API_URL as string;

/** Miroir du DTO serveur `CreatureRuntimeCombatDto` — lecture seule, aucun calcul client. */
interface CreatureRuntimeCombat {
  id: string;
  templateKey: string;
  name: string;
  state: string;
  currentTargetId: string | null;
  worldX: number | null;
  worldY: number | null;
  mapId: number | null;
  currentHealth: number;
  maxHealth: number;
  defenseTotal: number;
  baseArmor: number;
  alive: boolean;
  respawnAt: string | null;
  baseAttack: number;
  attackPower: number;
  attackRangeWU: number;
  autoAttackCooldownMs: number;
  lastAutoAttackAt: number | null;
  nextAutoAttackAt: number | null;
  canDodge: boolean;
  canBlock: boolean;
  canParry: boolean;
  killCharacterXpReward: number;
  hasLootPool: boolean;
  lootPoolSize: number;
}

type Status = "loading" | "loaded" | "absent" | "error";

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + "…" : id;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="woi__label">{label}</dt>
      <dd className="woi__value">{children}</dd>
    </>
  );
}

/** Étiquette explicite pour une capacité défensive non supportée côté créature. */
function Unsupported() {
  return <span className="woi__value--muted">Non supporté runtime</span>;
}

export default function CreatureRuntimeInspector({ creatureId }: { creatureId: string }) {
  // Refetch quand la liste créatures est rafraîchie (bouton Rafraîchir).
  const refreshKey = useDevToolsStore((s) => s.creaturesRefreshKey);
  const [data, setData] = useState<CreatureRuntimeCombat | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    // Garde anti-stale : une sélection rapide d'une autre créature invalide
    // la réponse en vol (ignore + abort).
    let active = true;
    const controller = new AbortController();
    setStatus("loading");
    setData(null);

    const token = localStorage.getItem("token") ?? "";
    fetch(`${API}/admin/creatures/${creatureId}/runtime-combat`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((r) => {
        if (!active) return null;
        if (r.status === 404) {
          setStatus("absent");
          return null;
        }
        if (!r.ok) {
          setStatus("error");
          return null;
        }
        return r.json() as Promise<CreatureRuntimeCombat>;
      })
      .then((json) => {
        if (!active || !json) return;
        setData(json);
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
  }, [creatureId, refreshKey]);

  return (
    <section className="woi__runtime-combat" aria-label="Creature runtime combat">
      <h4 className="woi__subtitle">Combat runtime</h4>

      {status === "loading" && <p className="woi__empty">Chargement…</p>}
      {status === "error" && <p className="woi__empty">Erreur de chargement.</p>}
      {status === "absent" && (
        <p className="woi__empty">Créature non vivante en mémoire (aucune donnée runtime).</p>
      )}

      {status === "loaded" && data && (
        <dl className="woi__grid">
          {/* A. Identité / état */}
          <Row label="état">{data.state}</Row>
          <Row label="cible actuelle">
            {data.currentTargetId ? (
              <span className="woi__value--muted" title={data.currentTargetId}>
                {shortId(data.currentTargetId)}
              </span>
            ) : (
              <span className="woi__value--muted">aucune</span>
            )}
          </Row>
          <Row label="position (WU)">
            {data.worldX != null && data.worldY != null
              ? `${data.worldX} / ${data.worldY}`
              : "-"}
          </Row>

          {/* B. Survie */}
          <Row label="PV">
            {data.currentHealth} / {data.maxHealth}
          </Row>
          <Row label="défense (runtime)">
            {data.defenseTotal}
            <span className="woi__value--muted"> (base {data.baseArmor})</span>
          </Row>
          <Row label="vivant">{data.alive ? "oui" : "non"}</Row>
          {data.respawnAt && <Row label="respawnAt">{String(data.respawnAt)}</Row>}

          {/* C. Combat offensif */}
          <Row label="attaque (runtime)">
            {data.attackPower}
            <span className="woi__value--muted"> (base {data.baseAttack})</span>
          </Row>
          <Row label="portée">
            {data.attackRangeWU} WU <span className="woi__value--muted">(MELEE_RANGE_WU)</span>
          </Row>
          <Row label="cooldown auto-attaque">{data.autoAttackCooldownMs} ms</Row>
          <Row label="dernière attaque">
            {data.lastAutoAttackAt != null ? (
              new Date(data.lastAutoAttackAt).toLocaleTimeString()
            ) : (
              <span className="woi__value--muted">jamais</span>
            )}
          </Row>
          <Row label="prochain hit">
            {data.nextAutoAttackAt != null ? (
              new Date(data.nextAutoAttackAt).toLocaleTimeString()
            ) : (
              <span className="woi__value--muted">—</span>
            )}
          </Row>

          {/* D. Combat défensif — non supporté côté créature aujourd'hui */}
          <Row label="esquive"><Unsupported /></Row>
          <Row label="blocage"><Unsupported /></Row>
          <Row label="parade"><Unsupported /></Row>

          {/* E. Loot / XP */}
          <Row label="XP au kill">{data.killCharacterXpReward}</Row>
          <Row label="lootPool">
            {data.hasLootPool ? `${data.lootPoolSize} entrée(s)` : "aucune"}
          </Row>
        </dl>
      )}
    </section>
  );
}
