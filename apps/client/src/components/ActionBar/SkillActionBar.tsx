import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMyActiveSkills, type PlayerActiveSkill } from "../ActionPanel/activeSkillsApi";
import {
  fetchActionBar,
  setActionBarSlot,
  type ActionBarSlot,
  type ActionBarUnavailableReason,
} from "./actionBarApi";
import { getActionPanelStore } from "../../store/actionPanel.store";
import { useCharacterStore } from "../../store/character.store";
import { onSkillDefinitionsChanged } from "../DevTools/modules/Skills/skillEvents";

/**
 * Raccourcis clavier par slot (AZERTY : A,Z,E,R,Q,S,D,F). L'index correspond au
 * `slotIndex` serveur (0..7).
 */
const HOTKEYS = ["a", "z", "e", "r", "q", "s", "d", "f"] as const;
const SLOT_COUNT = HOTKEYS.length;

/** Libellés humains des raisons d'indisponibilité (title/tooltip). */
const REASON_LABELS: Record<ActionBarUnavailableReason, string> = {
  empty: "Slot vide",
  disabled: "Skill désactivé",
  non_active: "Non lançable",
  locked: "Skill verrouillé",
  level_required: "Niveau requis",
  mastery_required: "Maîtrise requise",
  unsupported_resource: "Ressource non supportée",
  unsupported_target: "Cible non supportée",
  unknown: "Indisponible",
};

type SocketLike = {
  emit: (event: string, payload: unknown) => void;
  on: (event: string, cb: (data: unknown) => void) => void;
  off: (event: string, cb: (data: unknown) => void) => void;
};

function getSocket(): SocketLike | null {
  return (window as unknown as { game?: { socket?: SocketLike } }).game?.socket ?? null;
}

/** Cible créature actuellement sélectionnée dans l'ActionPanel, sinon null. */
function getSelectedCreature(): { id: string } | null {
  const target = getActionPanelStore().getState().target;
  return target && target.kind === "creature" ? { id: target.id } : null;
}

function shortLabel(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/** Pourcentage de remplissage [0..100], garde toute division par zéro. */
function resourcePercent(current: number | undefined, max: number | undefined): number {
  if (!max || max <= 0 || !current || current <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

/** Palier 0..100 par pas de 5 → classe SCSS `--fill-XX` (aucun style inline). */
function fillBucket(percent: number): number {
  return Math.round(percent / 5) * 5;
}

const RESOURCE_LABELS = { hp: "PV", mana: "Mana", energy: "Énergie" } as const;
type ResourceKind = keyof typeof RESOURCE_LABELS;

/** Libellé de coût pour le tooltip : « Mana 5 » / « Énergie 5 » / « Santé 5 » / « aucun ». */
function costLabel(meta: PlayerActiveSkill): string {
  if (!meta.resourceType || meta.resourceCost <= 0) return "aucun";
  const label =
    meta.resourceType === "mana" ? "Mana" : meta.resourceType === "energy" ? "Énergie" : "Santé";
  return `${label} ${meta.resourceCost}`;
}

/**
 * Tooltip natif compact d'un slot (V1-L-A) : nom, coût, recharge, portée, cible,
 * état. `title` multi-ligne — pas de fenêtre custom. Retombe sur un libellé
 * simple si les métadonnées du skill ne sont pas encore chargées.
 */
function buildSlotTitle(slot: ActionBarSlot, meta: PlayerActiveSkill | undefined): string {
  if (!slot.skillKey) return "Slot vide — équiper un skill";
  const reason = REASON_LABELS[slot.unavailableReason ?? "unknown"];
  if (!meta) {
    return slot.available ? (slot.name ?? "") : `${slot.name} — ${reason}`;
  }
  const cible = meta.targetMode === "self" ? "soi-même" : "créature";
  const etat = slot.available ? "Disponible" : `Indisponible — ${reason}`;
  return [
    meta.name,
    `Coût : ${costLabel(meta)}`,
    `Recharge : ${Math.round(meta.cooldownMs / 1000)} s`,
    `Portée : ${meta.rangeWU}   Cible : ${cible}`,
    etat,
  ].join("\n");
}

type CharacterResources = {
  health?: number;
  mana?: number;
  energy?: number;
  stats?: { derived?: { maxHealth?: number; maxMana?: number; maxEnergy?: number } };
} | null;

/**
 * Mini-jauges verticales PV / Mana / Énergie (V1-L-A), à gauche des slots.
 * Lecture SEULE du store (serveur autoritaire) ; aucun recalcul de stat client.
 * Remplissage bas → haut via classes de paliers SCSS (pas de style inline).
 */
function ResourceGauges() {
  const character = useCharacterStore((s: { character: CharacterResources }) => s.character);
  const derived = character?.stats?.derived;

  const gauges: { kind: ResourceKind; current: number; max: number }[] = [
    { kind: "hp", current: character?.health ?? 0, max: derived?.maxHealth ?? 0 },
    { kind: "mana", current: character?.mana ?? 0, max: derived?.maxMana ?? 0 },
    { kind: "energy", current: character?.energy ?? 0, max: derived?.maxEnergy ?? 0 },
  ];

  const gauge = (kind: ResourceKind, current: number, max: number) => {
    const percent = resourcePercent(current, max);
    const title = `${RESOURCE_LABELS[kind]} ${current ?? 0} / ${max ?? 0}`;
    return (
      <div className={`skill-action-bar__gauge skill-action-bar__gauge--${kind}`} title={title}>
        <div
          className={`skill-action-bar__gauge-fill skill-action-bar__gauge-fill--fill-${fillBucket(percent)}`}
        />
      </div>
    );
  };

  return (
    <div className="skill-action-bar__resources">
      {gauge("hp", gauges[0].current, gauges[0].max)}
      <div className="skill-action-bar__gauge-group">
        {gauge("mana", gauges[1].current, gauges[1].max)}
        {gauge("energy", gauges[2].current, gauges[2].max)}
      </div>
    </div>
  );
}

function emptySlots(): ActionBarSlot[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({
    slotIndex: i,
    skillKey: null,
    name: null,
    iconAssetPath: null,
    skillKind: null,
    enabled: null,
    available: false,
    unavailableReason: "empty" as ActionBarUnavailableReason,
  }));
}

/**
 * SkillActionBar — barre d'action PERSISTANTE (Skills V1-I-B).
 *
 * Affiche les 8 slots persistés côté serveur (`GET /characters/me/action-bar`),
 * dans l'ordre serveur. N'auto-remplit plus la barre. `/characters/me/active-skills`
 * sert uniquement (a) à la liste des skills équipables du sélecteur, (b) à
 * résoudre `targetMode`/`effectType` pour construire l'intention `skill:cast`
 * (que la vue de slot n'expose pas). Le serveur reste l'autorité au cast.
 */
export default function SkillActionBar() {
  const [slots, setSlots] = useState<ActionBarSlot[]>(emptySlots);
  const [skillMeta, setSkillMeta] = useState<Record<string, PlayerActiveSkill>>({});
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const showFeedback = useCallback((text: string) => {
    setFeedback(text);
    if (feedbackTimer.current != null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2500);
  }, []);

  // Charge les slots (barre) + les skills équipables/métadonnées (sélecteur, cast).
  const loadAll = useCallback(() => {
    fetchActionBar()
      .then((s) => { if (mountedRef.current && s.length > 0) setSlots(s); })
      .catch(() => { /* garde l'affichage courant */ });
    fetchMyActiveSkills()
      .then((list) => {
        if (!mountedRef.current) return;
        const byKey: Record<string, PlayerActiveSkill> = {};
        for (const s of list) byKey[s.key] = s;
        setSkillMeta(byKey);
      })
      .catch(() => { /* sélecteur simplement vide */ });
  }, []);

  const reloadBar = useCallback(() => {
    fetchActionBar()
      .then((s) => { if (mountedRef.current && s.length > 0) setSlots(s); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAll(); // montage

    const onFocus = () => loadAll();
    window.addEventListener("focus", onFocus);

    const socket = getSocket();
    const onReload = () => loadAll();
    socket?.on("character:reload", onReload);

    const offCatalog = onSkillDefinitionsChanged(loadAll);

    return () => {
      window.removeEventListener("focus", onFocus);
      socket?.off("character:reload", onReload);
      offCatalog();
    };
  }, [loadAll]);

  // Listeners socket : cooldown + erreur (nettoyés au démontage).
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    function onCooldown(data: unknown) {
      const d = data as { skillKey?: string; readyAt?: number; cooldownMs?: number };
      if (!d?.skillKey) return;
      const readyAt = d.readyAt ?? Date.now() + (d.cooldownMs ?? 0);
      setCooldowns((prev) => ({ ...prev, [d.skillKey as string]: readyAt }));
    }
    function onError(data: unknown) {
      const d = data as { error?: string };
      showFeedback(d?.error ?? "Skill refusé.");
    }
    socket.on("skill:cooldown", onCooldown);
    socket.on("skill:error", onError);
    return () => {
      socket.off("skill:cooldown", onCooldown);
      socket.off("skill:error", onError);
    };
  }, [showFeedback]);

  // Tick léger uniquement s'il reste un cooldown actif.
  const hasActiveCooldown = Object.values(cooldowns).some((t) => t > now);
  useEffect(() => {
    if (!hasActiveCooldown) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [hasActiveCooldown]);

  // Lancer le skill d'un slot (rempli + disponible). No-op sinon.
  const castSlot = useCallback(
    (slot: ActionBarSlot | undefined) => {
      if (!slot || !slot.skillKey || !slot.available) return;
      if ((cooldowns[slot.skillKey] ?? 0) > Date.now()) return; // cooldown affichage
      const meta = skillMeta[slot.skillKey];
      if (!meta) {
        showFeedback("Skill indisponible.");
        return;
      }
      const socket = getSocket();
      if (!socket) {
        showFeedback("Socket indisponible.");
        return;
      }
      if (meta.targetMode === "self") {
        socket.emit("skill:cast", { skillKey: slot.skillKey, targetType: "self" });
        return;
      }
      const creature = getSelectedCreature();
      if (!creature) {
        showFeedback("Sélectionne une créature.");
        return;
      }
      socket.emit("skill:cast", {
        skillKey: slot.skillKey,
        targetType: "creature",
        targetId: creature.id,
      });
    },
    [cooldowns, skillMeta, showFeedback],
  );

  // Raccourcis clavier A/Z/E/R/Q/S/D/F → cast du slot correspondant (no-op si vide/indispo).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const index = HOTKEYS.indexOf(e.key.toLowerCase() as (typeof HOTKEYS)[number]);
      if (index < 0 || index >= slots.length) return;
      e.preventDefault();
      castSlot(slots[index]);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slots, castSlot]);

  // Équipement / vidage d'un slot → PUT puis refetch de la barre, ferme le sélecteur.
  const applySlot = useCallback(
    async (slotIndex: number, skillKey: string | null) => {
      try {
        const next = await setActionBarSlot(slotIndex, skillKey);
        if (mountedRef.current && next.length > 0) setSlots(next);
      } catch (err) {
        showFeedback((err as Error).message);
        reloadBar();
      } finally {
        if (mountedRef.current) setPickerSlot(null);
      }
    },
    [reloadBar, showFeedback],
  );

  function onSlotClick(slot: ActionBarSlot) {
    if (!slot.skillKey) {
      setPickerSlot(slot.slotIndex); // slot vide → équiper
      return;
    }
    if (slot.available) {
      castSlot(slot); // rempli + dispo → cast
      return;
    }
    setPickerSlot(slot.slotIndex); // rempli + indispo → gérer (remplacer/vider)
  }

  // Skills équipables = actifs exécutables retournés par active-skills.
  const equippable = Object.values(skillMeta).filter((s) => s.executable);
  const pickerFilledSlot =
    pickerSlot != null ? slots.find((s) => s.slotIndex === pickerSlot) ?? null : null;

  return (
    <div className="skill-action-bar">
      {feedback && <div className="skill-action-bar__feedback">{feedback}</div>}

      {pickerSlot != null && (
        <div className="skill-action-bar__picker">
          <div className="skill-action-bar__picker-head">
            <span>Slot {pickerSlot + 1}</span>
            <button
              type="button"
              className="skill-action-bar__picker-close"
              onClick={() => setPickerSlot(null)}
            >
              Fermer
            </button>
          </div>
          {equippable.length === 0 ? (
            <div className="skill-action-bar__picker-empty">Aucun skill équipable.</div>
          ) : (
            <ul className="skill-action-bar__picker-list">
              {equippable.map((s) => (
                <li key={s.key}>
                  <button
                    type="button"
                    className="skill-action-bar__picker-item"
                    onClick={() => void applySlot(pickerSlot, s.key)}
                  >
                    {s.iconAssetPath && (
                      <img className="skill-action-bar__picker-icon" src={s.iconAssetPath} alt="" />
                    )}
                    <span>{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pickerFilledSlot?.skillKey && (
            <button
              type="button"
              className="skill-action-bar__picker-clear"
              onClick={() => void applySlot(pickerSlot, null)}
            >
              Vider le slot
            </button>
          )}
        </div>
      )}

      <div className="skill-action-bar__slots">
        <ResourceGauges />
        {slots.map((slot, i) => {
          const filled = !!slot.skillKey;
          const readyAt = filled ? cooldowns[slot.skillKey as string] ?? 0 : 0;
          const remainingMs = Math.max(0, readyAt - now);
          const onCooldown = remainingMs > 0;
          const unavailable = filled && !slot.available;
          const title = buildSlotTitle(slot, slot.skillKey ? skillMeta[slot.skillKey] : undefined);
          const cls =
            "skill-action-bar__slot" +
            (filled ? "" : " skill-action-bar__slot--empty") +
            (unavailable ? " skill-action-bar__slot--unavailable" : "");
          return (
            <div key={i} className="skill-action-bar__slot-wrap">
              <button type="button" className={cls} onClick={() => onSlotClick(slot)} title={title}>
                <span className="skill-action-bar__hotkey">{HOTKEYS[i].toUpperCase()}</span>
                {filled ? (
                  slot.iconAssetPath ? (
                    <img className="skill-action-bar__icon" src={slot.iconAssetPath} alt="" loading="lazy" />
                  ) : (
                    <span className="skill-action-bar__fallback">{shortLabel(slot.name ?? "")}</span>
                  )
                ) : (
                  <span className="skill-action-bar__plus">+</span>
                )}
                {onCooldown && (
                  <span className="skill-action-bar__cooldown">{Math.ceil(remainingMs / 1000)}s</span>
                )}
              </button>
              {filled && (
                <button
                  type="button"
                  className="skill-action-bar__slot-edit"
                  onClick={() => setPickerSlot(slot.slotIndex)}
                  title="Remplacer / vider"
                  aria-label="Gérer le slot"
                >
                  ✎
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
