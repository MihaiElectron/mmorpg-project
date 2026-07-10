import { useEffect, useRef, useState } from "react";
import { useActionPanelStore, getActionPanelStore } from "../../store/actionPanel.store";
import { getWindowManagerStore } from "../../store/windowManager.store";
import { useCharacterStore } from "../../store/character.store";
import HealthBar from "../HealthBar/HealthBar";
import { getDevToolsSocket, getWorldScene } from "../DevTools/devtoolsBridge";
import CraftingRuntimePanel from "./CraftingRuntimePanel";
import ActionPanelSkills from "./ActionPanelSkills";
import { isCraftStationPanelOpenFor, type CraftingStationTarget } from "./craftingRuntime";

function decodeJwtRole(token: string): string | null {
  try { return JSON.parse(atob(token.split(".")[1]))?.role ?? null; }
  catch { return null; }
}

export default function ActionPanel() {
  const isOpen            = useActionPanelStore((s) => s.isOpen);
  const target            = useActionPanelStore((s) => s.target);
  const actions           = useActionPanelStore((s) => s.actions);
  const overlappingTargets = useActionPanelStore((s) => s.overlappingTargets);
  const closePanel        = useActionPanelStore((s) => s.closePanel);
  const selectOverlapTarget = useActionPanelStore((s) => s.selectOverlapTarget);
  const character         = useCharacterStore((s) => s.character);

  const panelRef = useRef<HTMLDivElement>(null);

  const [craftingStation, setCraftingStation] = useState<CraftingStationTarget | null>(null);

  const token   = localStorage.getItem("token") ?? "";
  const isAdmin = decodeJwtRole(token) === "admin";
  const hasOverlap = overlappingTargets.length > 1;
  // Vrai quand le CraftingRuntimePanel est ouvert POUR la station ciblée (même id).
  // Pilote à la fois le masquage du bouton « Ouvrir … » redondant (l'unique action
  // d'une station) ET le rendu du panneau : on n'affiche jamais l'ancien panneau
  // (station A) sous l'en-tête d'une autre station ciblée (station B).
  const craftPanelOpenForTarget = isCraftStationPanelOpenFor(target, craftingStation);
  const visibleActions = craftPanelOpenForTarget ? [] : actions;
  // Vue craft station pure : uniquement titre + fermer + CraftingRuntimePanel.
  const isCraftStationPanelMode = craftPanelOpenForTarget;

  // ── Fermeture au clic extérieur (sauf canvas Phaser) ─────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "CANVAS") return;
      // Cliquer la barre de skills ne doit PAS désélectionner la cible : sinon
      // un skill sur créature (ex: strike) perd sa cible avant le cast.
      if (t.closest?.(".skill-action-bar")) return;
      if (panelRef.current && !panelRef.current.contains(t)) closePanel();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [closePanel]);

  // Reset du panneau craft à chaque changement de cible. Déclaré AVANT l'effet
  // d'ouverture ci-dessous → sur une nouvelle station, on repart d'un état
  // « fermé » avant de rouvrir net.
  useEffect(() => {
    setCraftingStation(null);
  }, [target?.id]);

  // Ouverture automatique du panneau craft quand WorldScene ouvre une station.
  // WorldScene n'ouvre une station QUE lorsque le joueur est à portée (garde WU
  // dans updatePendingCraftStationOpen) : l'ouverture ne donne donc aucun avantage
  // hors portée, le serveur restant l'autorité (POST /crafting/craft). Chaque
  // openPanel passe un nouvel objet `target` → l'effet refire même pour la même
  // station (ré-approche).
  useEffect(() => {
    if (target?.kind === "crafting_station") {
      setCraftingStation(target as CraftingStationTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // ── Suppression admin ─────────────────────────────────────────────────────
  function handleAdminDelete() {
    const socket = getDevToolsSocket();
    if (!socket?.connected || !target || target.kind === "crafting_station" || target.kind === "building") return;

    const event = target.kind === "creature" ? "admin:delete_creature" : "admin:delete_resource";
    socket.emit(event, { id: target.id }, (res: any) => {
      if (!res?.success) console.warn("[admin delete]", res?.message);
    });
    closePanel();
  }

  // ── Actions gameplay ──────────────────────────────────────────────────────
  function handleAction(action: string) {
    // Read target from the store directly at click time to avoid stale React closures.
    // openPanel() can be called from Phaser before React re-renders the component,
    // so the `target` variable captured at render time may refer to the previous item.
    const currentTarget = getActionPanelStore().getState().target;

    if (currentTarget?.kind === "building") {
      getWindowManagerStore().getState().openWindow(
        currentTarget.type,
        currentTarget.id,
        currentTarget.name,
      );
      closePanel();
      return;
    }

    if (currentTarget?.kind === "crafting_station") {
      setCraftingStation(currentTarget as CraftingStationTarget);
      return;
    }

    const socket = getDevToolsSocket();
    if (!socket?.connected || !character?.id) { closePanel(); return; }

    if (currentTarget?.kind === "world_item") {
      const itemId = currentTarget.id;
      socket.emit("pickup_world_item", { worldItemId: itemId }, (ack: any) => {
        if (!ack?.success) {
          console.error("[pickup] worldItemId=" + itemId, ack?.message ?? "Pickup failed");
        }
      });
      closePanel();
      return;
    }

    if (currentTarget?.kind === "creature") {
      const scene = getWorldScene();
      if (scene?.startAutoAttack) scene.startAutoAttack(currentTarget.id);
    } else {
      socket.emit("interact_resource", { targetId: currentTarget!.id, characterId: character.id });
    }
    closePanel();
  }

  if (!isOpen || !target) return null;

  return (
    <div className="action-panel" ref={panelRef}>
      <div className="action-panel__title">
        {(target.name ?? target.type).replace(/_/g, " ").toUpperCase()}
        {isCraftStationPanelMode && (
          <button
            type="button"
            className="action-panel__title-close"
            onClick={closePanel}
            aria-label="Fermer"
          >
            ×
          </button>
        )}
      </div>

      {target.kind === "creature" &&
        target.health != null &&
        target.maxHealth != null && (
          <HealthBar health={target.health} maxHealth={target.maxHealth} />
        )}

      {target.kind === "creature" && !isCraftStationPanelMode && (
        <ActionPanelSkills key={target.id} creatureId={target.id} />
      )}

      {isAdmin && !isCraftStationPanelMode && hasOverlap && (
        <div className="action-panel__overlap">
          <span className="action-panel__overlap-label">Superposés :</span>
          <select
            className="action-panel__overlap-select"
            value={target.id}
            onChange={(e) => selectOverlapTarget(e.target.value)}
          >
            {overlappingTargets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.type.replace(/_/g, " ")} ({t.kind})
              </option>
            ))}
          </select>
        </div>
      )}

      {target.kind !== "player" && (
        <div className="action-panel__actions">
          {visibleActions.map((action) => (
            <button
              key={action}
              className="action-panel__button"
              onClick={() => handleAction(action)}
            >
              {action}
            </button>
          ))}
          {isAdmin && target.kind !== "crafting_station" && target.kind !== "building" && target.kind !== "world_item" && (
            <button
              className="action-panel__button action-panel__button--danger"
              onClick={() => handleAdminDelete()}
            >
              supprimer
            </button>
          )}
        </div>
      )}

      {craftPanelOpenForTarget && craftingStation && (
        <CraftingRuntimePanel
          station={craftingStation}
          onClose={() => setCraftingStation(null)}
          hideHeader
        />
      )}
    </div>
  );
}
