import { Fragment, useEffect, useState } from "react";
import { useDevToolsStore } from "../../store/devtools.store";
import {
  buildMaxHealthRows,
  formatAppliedContribution,
  formatFilteredContribution,
  MaxHealthTrace,
} from "./creatureMaxHealthTrace";
import type { CreatureRuntimeSnapshot } from "./creatureDerivedConfig.types";

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
  // V6-B2→V6-B6 : secondaires CALCULÉES depuis les primaires. dodgeChance
  // (canDodge), blockChance/blockReductionPercent (canBlock) et parryChance
  // (canParry) sont actifs en défense ; counterAttackPower/maxHealthDerived
  // restent informatifs.
  derivedSecondaryStats?: {
    dodgeChance: number;
    blockChance: number;
    blockReductionPercent: number;
    parryChance: number;
    counterAttackPower: number;
    /** @deprecated alias de maxHealth (voir maxHealthTrace). */
    maxHealthDerived: number;
  };
  /** Lot 3 : trace serveur du calcul du PV max final (optionnel : compat ancien payload). */
  maxHealthTrace?: MaxHealthTrace;
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

export default function CreatureRuntimeInspector({ creatureId }: { creatureId: string }) {
  // Refetch quand la liste créatures est rafraîchie (bouton Rafraîchir).
  const refreshKey = useDevToolsStore((s) => s.creaturesRefreshKey);
  const [data, setData] = useState<CreatureRuntimeCombat | null>(null);
  // ADR-0021 : snapshot des dérivées + traces (serveur autoritaire, aucun calcul
  // client). Récupéré dans le MÊME cycle de polling que le combat (un seul
  // AbortController par tick, un seul intervalle).
  const [snapshot, setSnapshot] = useState<CreatureRuntimeSnapshot | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [openTraces, setOpenTraces] = useState<Set<string>>(new Set());

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
        setSnapshot(null);
      }
      // UN SEUL AbortController pour les deux requêtes du tick (combat + snapshot).
      const controller = new AbortController();
      const token = localStorage.getItem("token") ?? "";
      const headers = { Authorization: `Bearer ${token}` };

      fetch(`${API}/admin/creatures/${creatureId}/runtime-combat`, { headers, signal: controller.signal })
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

      // Snapshot dérivées + traces (même controller). N'altère pas `status` :
      // 404/erreur → snapshot null (l'instance a pu disparaître entre-temps).
      fetch(`${API}/admin/creatures/instances/${creatureId}/runtime-stats`, { headers, signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<CreatureRuntimeSnapshot>) : null))
        .then((json) => {
          if (!active) return;
          setSnapshot(json);
        })
        .catch((e) => {
          if (!active || e?.name === "AbortError") return;
          setSnapshot(null);
        });
    };

    load(true);
    // Polling léger 1 s, uniquement pour l'instance sélectionnée (un seul intervalle).
    const timer = window.setInterval(() => load(false), POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [creatureId, refreshKey]);

  function toggleTrace(key: string) {
    setOpenTraces((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

            {/* D. Combat défensif — V6-B3 esquive + V6-B4 blocage + V6-B6 parade actifs.
                Parade résolue en premier (attaques physical non-raw ; magic/raw non
                parables) ; esquive/blocage ensuite. */}
            <Row label="esquive">
              {data.canDodge ? (
                <span className="creature-runtime__hint">
                  Active
                  {data.derivedSecondaryStats
                    ? ` (${data.derivedSecondaryStats.dodgeChance} %)`
                    : ""}
                </span>
              ) : (
                <span className="creature-runtime__hint">Inactive (0 %)</span>
              )}
            </Row>
            <Row label="blocage">
              {data.canBlock ? (
                <span className="creature-runtime__hint">
                  Active
                  {data.derivedSecondaryStats
                    ? ` (${data.derivedSecondaryStats.blockChance} %, réduction ${data.derivedSecondaryStats.blockReductionPercent} %)`
                    : ""}
                </span>
              ) : (
                <span className="creature-runtime__hint">Inactive (0 %)</span>
              )}
            </Row>
            <Row label="parade">
              {data.canParry ? (
                <span className="creature-runtime__hint">
                  Active
                  {data.derivedSecondaryStats
                    ? ` (${data.derivedSecondaryStats.parryChance} %)`
                    : ""}
                </span>
              ) : (
                <span className="creature-runtime__hint">Inactive (0 %)</span>
              )}
            </Row>

            {/* E. Loot / XP */}
            <Row label="XP au kill">{data.killCharacterXpReward}</Row>
            <Row label="lootPool">
              {data.hasLootPool ? `${data.lootPoolSize} entrée(s)` : "aucune"}
            </Row>
          </dl>

          {/* B-bis. PV maximum — trace SERVEUR du calcul (Lot 3). Aucun calcul
              client : on affiche les lignes produites depuis la trace serveur.
              `baseHealth` = socle configuré, la valeur finale est mise en avant. */}
          <p className="creature-runtime__title">PV maximum</p>
          <dl className="creature-runtime__grid">
            {buildMaxHealthRows(data.maxHealthTrace, {
              currentHealth: data.currentHealth,
              fallbackFinal: data.maxHealth,
            }).map((r) => (
              <Row key={r.key} label={r.label}>
                {r.strong ? (
                  <strong className="creature-runtime__value--strong">{r.value}</strong>
                ) : (
                  r.value
                )}
              </Row>
            ))}
          </dl>
          {data.maxHealthTrace &&
            data.maxHealthTrace.appliedContributions.length > 0 && (
              <ul className="creature-runtime__contributions">
                {data.maxHealthTrace.appliedContributions.map((c, i) => (
                  <li key={`app-${i}`} className="creature-runtime__hint">
                    {formatAppliedContribution(c)}
                  </li>
                ))}
              </ul>
            )}
          {data.maxHealthTrace &&
            data.maxHealthTrace.filteredContributions.length > 0 && (
              <ul className="creature-runtime__contributions">
                {data.maxHealthTrace.filteredContributions.map((f, i) => (
                  <li key={`filt-${i}`} className="creature-runtime__hint">
                    {formatFilteredContribution(f)}
                  </li>
                ))}
              </ul>
            )}
          <p className="creature-runtime__hint">
            Base = socle configuré ; PV max = valeur finale serveur. Filtres et
            modificateurs futurs encore non branchés au gameplay.
          </p>

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
              </dl>
              <p className="creature-runtime__hint">
                Calculées depuis les primaires. Esquive, blocage et parade actifs.
                Puissance de contre-attaque informative. Le PV max final et son
                détail sont dans la section « PV maximum » ci-dessus.
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

      {/* ADR-0021 : dérivées résolues serveur + traces (aucun calcul client). */}
      {snapshot && (
        <div className="creature-runtime__derived">
          <p className="creature-runtime__title">Statistiques dérivées (serveur)</p>
          <dl className="creature-runtime__grid">
            <dt className="creature-runtime__label">instance</dt>
            <dd className="creature-runtime__value creature-runtime__hint">{snapshot.instanceId}</dd>
            <dt className="creature-runtime__label">template</dt>
            <dd className="creature-runtime__value">{snapshot.templateKey} (#{snapshot.templateId})</dd>
            <dt className="creature-runtime__label">état</dt>
            <dd className="creature-runtime__value">{snapshot.state}</dd>
            <dt className="creature-runtime__label">PV</dt>
            <dd className="creature-runtime__value creature-runtime__value--strong">
              {snapshot.currentHealth} / {snapshot.maxHealth}
            </dd>
          </dl>

          <p className="creature-runtime__subtitle">Primaires finales</p>
          <dl className="creature-runtime__grid">
            {Object.entries(snapshot.primaryStats).map(([k, v]) => (
              <Fragment key={k}>
                <dt className="creature-runtime__label">{k}</dt>
                <dd className="creature-runtime__value">{v}</dd>
              </Fragment>
            ))}
          </dl>

          <p className="creature-runtime__subtitle">Dérivées finales</p>
          <ul className="creature-runtime__derived-list">
            {Object.entries(snapshot.derivedStats).map(([key, value]) => {
              const trace = snapshot.traces.find((t) => t.derivedStatKey === key) ?? null;
              const open = openTraces.has(key);
              return (
                <li key={key} className="creature-runtime__derived-item">
                  <button
                    type="button"
                    className="creature-runtime__derived-row"
                    onClick={trace ? () => toggleTrace(key) : undefined}
                    disabled={!trace}
                    aria-expanded={trace ? open : undefined}
                  >
                    <span className="creature-runtime__derived-name">
                      {trace ? (open ? "▾ " : "▸ ") : ""}{key}
                    </span>
                    <span className="creature-runtime__derived-val">{value}</span>
                    {trace && (
                      <span className="creature-runtime__derived-src">
                        {trace.source}{trace.overrideState !== "none" ? ` · ${trace.overrideState}` : ""}
                      </span>
                    )}
                  </button>
                  {trace && open && (
                    <div className="creature-runtime__trace">
                      <div className="creature-runtime__trace-row">
                        <span>Base{trace.baseSource ? ` (${trace.baseSource})` : ""}</span>
                        <span>{trace.baseValue}</span>
                      </div>
                      {trace.contributions.map((c, i) => (
                        <div key={i} className="creature-runtime__trace-row">
                          <span>{c.primaryStatKey} {c.primaryValue} × {c.coefficient}</span>
                          <span>{c.contribution}</span>
                        </div>
                      ))}
                      <div className="creature-runtime__trace-row">
                        <span>Modificateurs</span>
                        <span>{trace.modifiers}</span>
                      </div>
                      <div className="creature-runtime__trace-row creature-runtime__trace-row--total">
                        <span>Total</span>
                        <span>{trace.finalValue}</span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
