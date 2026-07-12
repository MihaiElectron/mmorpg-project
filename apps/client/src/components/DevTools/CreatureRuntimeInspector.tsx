import { useEffect, useState } from "react";
import { useDevToolsStore } from "../../store/devtools.store";

const API = import.meta.env.VITE_API_URL as string;

/** Miroir de `CreatureRuntimeAbilityDto` (serveur, V5-C1) — cooldowns déjà calculés serveur. */
interface CreatureRuntimeAbility {
  skillKey: string;
  skillName: string;
  rangeWU: number;
  cooldownMs: number;
  lastCastAt: number | null;
  nextCastAt: number | null;
  cooldownRemainingMs: number;
  onCooldown: boolean;
}

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
  abilities?: CreatureRuntimeAbility[];
}

type Status = "loading" | "loaded" | "absent" | "error";

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + "…" : id;
}

/**
 * Statut d'une capacité — valeurs serveur (V5-C1), le client ne fait QUE formater
 * les ms en s pour lisibilité (aucun calcul de cooldown côté client).
 */
function abilityStatus(a: CreatureRuntimeAbility): string {
  if (!a.onCooldown) return "Disponible";
  const ms = a.cooldownRemainingMs;
  return ms >= 1000 ? `Cooldown : ${(ms / 1000).toFixed(1)} s` : `Cooldown : ${ms} ms`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="admin-panel__template-stat">
      <span className="admin-panel__template-stat-label">{label}</span>
      <span>{children}</span>
    </div>
  );
}

/** Étiquette explicite pour une capacité défensive non supportée côté créature. */
function Unsupported() {
  return <span>Non supporté runtime</span>;
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
    <div className="admin-panel__template-stats" aria-label="Creature runtime combat">
      <span className="admin-panel__template-stat-label">Combat runtime</span>

      {status === "loading" && <p className="admin-panel__info-line">Chargement…</p>}
      {status === "error" && <p className="admin-panel__info-line">Erreur de chargement.</p>}
      {status === "absent" && (
        <p className="admin-panel__info-line">Runtime indisponible (créature non vivante en mémoire).</p>
      )}

      {status === "loaded" && data && (
        <>
          {/* A. Identité / état */}
          <Row label="état">{data.state}</Row>
          <Row label="cible actuelle">
            {data.currentTargetId ? (
              <span title={data.currentTargetId}>
                {shortId(data.currentTargetId)}
              </span>
            ) : (
              <span>aucune</span>
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
            <span> (base {data.baseArmor})</span>
          </Row>
          <Row label="vivant">{data.alive ? "oui" : "non"}</Row>
          {data.respawnAt && <Row label="respawnAt">{String(data.respawnAt)}</Row>}

          {/* C. Combat offensif */}
          <Row label="attaque (runtime)">
            {data.attackPower}
            <span> (base {data.baseAttack})</span>
          </Row>
          <Row label="portée">
            {data.attackRangeWU} WU <span>(MELEE_RANGE_WU)</span>
          </Row>
          <Row label="cooldown auto-attaque">{data.autoAttackCooldownMs} ms</Row>
          <Row label="dernière attaque">
            {data.lastAutoAttackAt != null ? (
              new Date(data.lastAutoAttackAt).toLocaleTimeString()
            ) : (
              <span>jamais</span>
            )}
          </Row>
          <Row label="prochain hit">
            {data.nextAutoAttackAt != null ? (
              new Date(data.nextAutoAttackAt).toLocaleTimeString()
            ) : (
              <span>—</span>
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

          {/* F. Capacités runtime + cooldowns live (V5-C1) — lecture seule serveur. */}
          <div className="admin-panel__template-stat">
            <span className="admin-panel__template-stat-label">Capacités runtime</span>
          </div>
          {!data.abilities || data.abilities.length === 0 ? (
            <p className="admin-panel__info-line">Aucune capacité damage configurée.</p>
          ) : (
            data.abilities.map((a) => (
              <div key={a.skillKey} className="admin-panel__template-stat">
                <span className="admin-panel__template-stat-label">
                  {a.skillName} ({a.skillKey})
                </span>
                <span>
                  portée {a.rangeWU} WU · CD {a.cooldownMs} ms · {abilityStatus(a)}
                </span>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
