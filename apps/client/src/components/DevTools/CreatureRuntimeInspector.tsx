import { useEffect, useState } from "react";
import { useDevToolsStore } from "../../store/devtools.store";

const API = import.meta.env.VITE_API_URL as string;

// Rafraîchissement auto du runtime de l'instance sélectionnée (V5-C4). 1 s : assez
// réactif pour voir les cooldowns décroître sans spammer l'API admin.
const POLL_INTERVAL_MS = 1000;

/** Miroir de `CreatureRuntimeAbilityDto` (serveur, V5-C1) — cooldowns déjà calculés serveur. */
interface CreatureRuntimeAbility {
  skillKey: string;
  skillName: string;
  effectType: string;
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
  // Stats de combat avancées (V5-D2-A) — valeurs effectives serveur, lecture seule.
  healingPower: number;
  criticalChance: number;
  criticalDamage: number;
  accuracy: number;
  armorPenetrationPercent: number;
  // V6-B1 : primaires informatives (aucun effet combat aujourd'hui).
  primaryStats?: {
    strength: number;
    vitality: number;
    endurance: number;
    agility: number;
    dexterity: number;
    intelligence: number;
    wisdom: number;
    spirit: number;
    willpower: number;
    charisma: number;
  };
  // V6-B2 : secondaires CALCULÉES depuis les primaires — informatif seulement,
  // non actives en défense (canDodge/canBlock/canParry restent false).
  derivedSecondaryStats?: {
    dodgeChance: number;
    blockChance: number;
    blockReductionPercent: number;
    parryChance: number;
    counterAttackPower: number;
    maxHealthDerived: number;
  };
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
    <>
      <dt className="creature-runtime__label">{label}</dt>
      <dd className="creature-runtime__value">{children}</dd>
    </>
  );
}

/** Étiquette explicite pour une capacité défensive non supportée côté créature. */
function Unsupported() {
  return <span className="creature-runtime__hint">Non supporté runtime</span>;
}

export default function CreatureRuntimeInspector({ creatureId }: { creatureId: string }) {
  // Refetch quand la liste créatures est rafraîchie (bouton Rafraîchir).
  const refreshKey = useDevToolsStore((s) => s.creaturesRefreshKey);
  const [data, setData] = useState<CreatureRuntimeCombat | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    // Garde anti-stale : une sélection rapide d'une autre créature (ou un unmount)
    // invalide toute réponse en vol (ignore via `active` + abort). Le polling est
    // strictement lié à CETTE créature sélectionnée ; il s'arrête au cleanup.
    let active = true;

    // `initial` = 1er chargement (affiche "Chargement…") ; les ticks de polling
    // mettent à jour silencieusement (pas de flicker, pas de reset des données).
    const load = (initial: boolean) => {
      if (initial) {
        setStatus("loading");
        setData(null);
      }
      const controller = new AbortController();
      const token = localStorage.getItem("token") ?? "";
      fetch(`${API}/admin/creatures/${creatureId}/runtime-combat`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
        .then((r) => {
          if (!active) return null;
          if (r.status === 404) {
            // Créature non live (respawn possible) : on garde le polling actif.
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
    };

    load(true);
    // Polling léger 1 s, uniquement pour l'instance sélectionnée.
    const timer = window.setInterval(() => load(false), POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [creatureId, refreshKey]);

  return (
    <div className="creature-runtime" aria-label="Creature runtime combat">
      <span className="creature-runtime__hint">Auto-refresh 1s</span>

      {status === "loading" && <p className="creature-runtime__muted">Chargement…</p>}
      {status === "error" && <p className="creature-runtime__error">Erreur de chargement.</p>}
      {status === "absent" && (
        <p className="creature-runtime__muted">Runtime indisponible (créature non vivante en mémoire).</p>
      )}

      {status === "loaded" && data && (
        <>
          <dl className="creature-runtime__grid">
            {/* A. Identité / état */}
            <Row label="état">{data.state}</Row>
            <Row label="cible">
              {data.currentTargetId ? (
                <span className="creature-runtime__hint" title={data.currentTargetId}>
                  {shortId(data.currentTargetId)}
                </span>
              ) : (
                <span className="creature-runtime__hint">aucune</span>
              )}
            </Row>
            <Row label="position (WU)">
              {data.worldX != null && data.worldY != null ? `${data.worldX} / ${data.worldY}` : "-"}
            </Row>

            {/* B. Survie */}
            <Row label="PV">{data.currentHealth} / {data.maxHealth}</Row>
            <Row label="défense (effective)">
              {data.defenseTotal}
              <span className="creature-runtime__hint"> (base {data.baseArmor})</span>
            </Row>
            <Row label="vivant">{data.alive ? "oui" : "non"}</Row>
            {data.respawnAt && <Row label="respawnAt">{String(data.respawnAt)}</Row>}

            {/* C. Combat offensif */}
            <Row label="attaque (effective)">
              {data.attackPower}
              <span className="creature-runtime__hint"> (base {data.baseAttack})</span>
            </Row>
            <Row label="portée">
              {data.attackRangeWU} WU <span className="creature-runtime__hint">(mêlée)</span>
            </Row>
            <Row label="cooldown auto">{data.autoAttackCooldownMs} ms</Row>
            <Row label="prochain hit">
              {data.nextAutoAttackAt != null ? (
                new Date(data.nextAutoAttackAt).toLocaleTimeString()
              ) : (
                <span className="creature-runtime__hint">—</span>
              )}
            </Row>

            {/* D. Combat défensif — non supporté côté créature aujourd'hui : une
                créature ne peut ni esquiver, ni bloquer, ni parer un hit entrant. */}
            <Row label="esquive"><Unsupported /></Row>
            <Row label="blocage"><Unsupported /></Row>
            <Row label="parade"><Unsupported /></Row>

            {/* E. Loot / XP */}
            <Row label="XP au kill">{data.killCharacterXpReward}</Row>
            <Row label="lootPool">
              {data.hasLootPool ? `${data.lootPoolSize} entrée(s)` : "aucune"}
            </Row>
          </dl>

          {/* E-bis. Stats de combat avancées (V5-D2-A) — valeurs effectives serveur, lecture seule. */}
          <p className="creature-runtime__title">Stats avancées</p>
          <dl className="creature-runtime__grid">
            <Row label="soin (effectif)">
              {data.healingPower}
              <span className="creature-runtime__hint"> (fallback ATK si 0)</span>
            </Row>
            <Row label="critique">{data.criticalChance} %</Row>
            <Row label="dégâts crit">{data.criticalDamage} %</Row>
            <Row label="précision">{data.accuracy}</Row>
            <Row label="pénétration armure">{data.armorPenetrationPercent} %</Row>
          </dl>

          {/* E-ter. Stats primaires (V6-B1) — informatif seulement, aucun effet combat. */}
          {data.primaryStats && (
            <>
              <p className="creature-runtime__title">Primaires</p>
              <dl className="creature-runtime__grid">
                <Row label="force (STR)">{data.primaryStats.strength}</Row>
                <Row label="vitalité (VIT)">{data.primaryStats.vitality}</Row>
                <Row label="endurance (END)">{data.primaryStats.endurance}</Row>
                <Row label="agilité (AGI)">{data.primaryStats.agility}</Row>
                <Row label="dextérité (DEX)">{data.primaryStats.dexterity}</Row>
                <Row label="intelligence (INT)">{data.primaryStats.intelligence}</Row>
                <Row label="sagesse (WIS)">{data.primaryStats.wisdom}</Row>
                <Row label="esprit (ESP)">{data.primaryStats.spirit}</Row>
                <Row label="volonté (VOL)">{data.primaryStats.willpower}</Row>
                <Row label="charisme (CHA)">{data.primaryStats.charisma}</Row>
              </dl>
            </>
          )}

          {/* E-quater. Secondaires CALCULÉES depuis les primaires (V6-B2) —
              informatif seulement. Les défenses ne sont PAS actives : la créature
              n'esquive/bloque/pare toujours pas (voir bloc défensif ci-dessus). */}
          {data.derivedSecondaryStats && (
            <>
              <p className="creature-runtime__title">Secondaires calculées</p>
              <dl className="creature-runtime__grid">
                <Row label="esquive %">{data.derivedSecondaryStats.dodgeChance}</Row>
                <Row label="blocage %">{data.derivedSecondaryStats.blockChance}</Row>
                <Row label="réduction blocage %">{data.derivedSecondaryStats.blockReductionPercent}</Row>
                <Row label="parade %">{data.derivedSecondaryStats.parryChance}</Row>
                <Row label="puissance contre-attaque">{data.derivedSecondaryStats.counterAttackPower}</Row>
                <Row label="PV max dérivés">
                  {data.derivedSecondaryStats.maxHealthDerived}
                  <span className="creature-runtime__hint"> (PV max actif {data.maxHealth})</span>
                </Row>
              </dl>
              <p className="creature-runtime__hint">
                Calculées depuis les primaires. Défenses non actives avant V6-B3/V6-B4/V6-B6.
              </p>
            </>
          )}

          {/* F. Capacités runtime + cooldowns live (V5-C1) — lecture seule serveur. */}
          <p className="creature-runtime__title">Capacités runtime</p>
          {!data.abilities || data.abilities.length === 0 ? (
            <p className="creature-runtime__muted">Aucune capacité damage configurée.</p>
          ) : (
            <div className="creature-runtime__abilities">
              {data.abilities.map((a) => (
                <div key={a.skillKey} className="creature-runtime__ability">
                  <span className="creature-runtime__ability-name">
                    {a.skillName} <span className="creature-runtime__ability-key">({a.skillKey})</span>
                  </span>
                  <span
                    className={`creature-runtime__ability-status${a.onCooldown ? "" : " creature-runtime__ability-status--ready"}`}
                  >
                    {a.effectType} · {a.rangeWU} WU · {a.cooldownMs} ms · {abilityStatus(a)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
