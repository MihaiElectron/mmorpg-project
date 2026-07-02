import { useCallback, useEffect, useState } from "react";
import { ackPromise, getSocket } from "../../../AdminPanel/adminPanel.shared";
import type { ItemMaintenanceReport } from "./itemEditor.types";

/**
 * Panneau de maintenance d'un item (DevTools admin).
 * Affiche le rapport d'usage complet et propose des operations securisees :
 * suppression d'une stack inventory, destruction d'une ItemInstance,
 * desactivation et suppression du template.
 *
 * Toutes les mutations passent par des events admin:* (guard admin serveur).
 * Aucune suppression silencieuse : confirmation obligatoire avec le nom de l'item.
 */
type AckResult = { success: boolean; message: string; data?: unknown };

async function ack(event: string, payload: unknown): Promise<AckResult> {
  const socket = getSocket();
  if (!socket?.connected) return { success: false, message: "Socket non connecté." };
  return (await ackPromise(socket, event, payload)) as AckResult;
}

interface Props {
  itemId: string;
  itemName: string;
  onChanged: () => void;
}

export default function ItemMaintenancePanel({ itemId, itemName, onChanged }: Props) {
  const [report, setReport] = useState<ItemMaintenanceReport | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Vrai quand une mutation a echoue : le report affiche peut ne plus refleter la DB.
  const [stale, setStale] = useState(false);

  const loadReport = useCallback(async () => {
    setStatus("loading");
    setMessage(null);
    const res = await ack("admin:item_usage_report", { itemId });
    if (res.success && res.data) {
      setReport(res.data as ItemMaintenanceReport);
      setStatus("loaded");
      setStale(false);
    } else {
      setStatus("error");
      setMessage(res.message);
    }
  }, [itemId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  async function run(event: string, payload: unknown, confirmMsg: string): Promise<void> {
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    setMessage(null);
    const res = await ack(event, payload);
    setMessage(res.message);
    setBusy(false);
    if (res.success) {
      await loadReport();
      onChanged();
    } else {
      // L'operation a echoue : la DB a pu changer partiellement ou pas du tout.
      // On ne pretend pas que le report affiche est a jour.
      setStale(true);
    }
  }

  const handleDeleteStack = (stackId: string, characterName: string | null, quantity: number) =>
    run(
      "admin:delete_inventory_stack",
      { inventoryId: stackId },
      `Supprimer la stack de "${itemName}" (${quantity}× chez ${characterName ?? "inconnu"}) ?`,
    );

  const handleDestroyInstance = (instanceId: string, state: string) =>
    run(
      "admin:delete_item_instance",
      { itemInstanceId: instanceId },
      `Détruire (DESTROYED) l'instance de "${itemName}" [${state}] ?`,
    );

  const handleRepairOrphan = (instanceId: string) =>
    run(
      "admin:repair_orphan_equipped_instance",
      { itemInstanceId: instanceId },
      `Réparer l'instance équipée orpheline de "${itemName}" ? Elle repassera disponible dans l'inventaire du propriétaire.`,
    );

  const handleDisable = () =>
    run(
      "admin:disable_item_template",
      { itemId },
      `Désactiver le template "${itemName}" ? Les instances existantes sont conservées.`,
    );

  const handleDeleteTemplate = () =>
    run(
      "admin:delete_item_template",
      { itemId },
      `SUPPRIMER DÉFINITIVEMENT le template "${itemName}" ? Action irréversible (autorisée uniquement si zéro référence).`,
    );

  if (status === "loading") return <p className="item-editor__status">Chargement du rapport…</p>;
  if (status === "error")
    return (
      <div className="item-maintenance">
        <p className="item-editor__status item-editor__status--error">{message ?? "Erreur."}</p>
        <button type="button" className="item-editor__save" onClick={() => void loadReport()}>
          Réessayer
        </button>
      </div>
    );
  if (!report) return null;

  const canDeleteTemplate = report.totalReferences === 0;

  return (
    <div className="item-maintenance">
      {message && (
        <p
          className={
            "item-editor__message" +
            (message.toLowerCase().includes("erreur") || message.toLowerCase().includes("interdit")
              ? " item-editor__message--error"
              : "")
          }
        >
          {message}
        </p>
      )}

      {stale && (
        <div className="item-maintenance__stale">
          <span>
            ⚠ La dernière opération a échoué — ce rapport peut ne plus refléter la base.
          </span>
          <button
            type="button"
            className="item-editor__save item-editor__save--ghost"
            disabled={busy}
            onClick={() => void loadReport()}
          >
            Rafraîchir
          </button>
        </div>
      )}

      <div className="item-maintenance__summary">
        <span>Références au template : <strong>{report.totalReferences}</strong></span>
        <span>Template : {report.template.enabled ? "actif" : "désactivé"}</span>
      </div>

      <div className="item-maintenance__refs">
        <span>Stacks inventaire : {report.references.inventoryStacks}</span>
        <span>Instances actives : {report.references.activeItemInstances}</span>
        <span>Équipements : {report.references.equipped}</span>
        <span>Objets au sol : {report.references.worldItems}</span>
        <span>Ventes auction : {report.references.auctionListings}</span>
        <span>Pièces jointes mail : {report.references.mailAttachments}</span>
        <span>Loot pools : {report.references.lootPoolRefs}</span>
        <span>Recettes craft : {report.references.recipeRefs}</span>
      </div>

      <p className="item-maintenance__hint">
        Une même épée équipée peut compter comme instance active + équipement, car ce
        sont deux références différentes au même modèle.
      </p>

      {/* Inventory stacks */}
      <div className="item-maintenance__block">
        <h4 className="item-maintenance__block-title">Stacks inventory ({report.inventory.stackCount})</h4>
        {report.inventory.stacks.length === 0 ? (
          <p className="item-editor__status">Aucune stack.</p>
        ) : (
          <ul className="item-maintenance__list">
            {report.inventory.stacks.map((s) => (
              <li key={s.id} className="item-maintenance__row">
                <span>
                  {s.characterName ?? "inconnu"} · ×{s.quantity}
                  {s.equipped ? " · équipé" : ""}
                </span>
                <button
                  type="button"
                  className="item-maintenance__danger"
                  disabled={busy || s.equipped}
                  title={s.equipped ? "Stack équipée : déséquiper d'abord" : "Supprimer cette stack"}
                  onClick={() => void handleDeleteStack(s.id, s.characterName, s.quantity)}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Item instances */}
      <div className="item-maintenance__block">
        <h4 className="item-maintenance__block-title">
          Instances actives ({report.instances.activeTotal})
          {report.instances.linesTruncated ? " — liste tronquée" : ""}
        </h4>
        {report.instances.lines.length === 0 ? (
          <p className="item-editor__status">Aucune instance active.</p>
        ) : (
          <ul className="item-maintenance__list">
            {report.instances.lines.map((inst) => {
              const destroyable =
                inst.state !== "EQUIPPED" && inst.state !== "LISTED" && inst.state !== "IN_MAIL";
              return (
                <li key={inst.id} className="item-maintenance__row">
                  <span>
                    {inst.instanceType} · {inst.state} · {inst.containerType}
                    {inst.ownerId ? ` · ${inst.ownerId.slice(0, 8)}…` : ""}
                    {inst.orphanEquipped ? " · ⚠ orpheline" : ""}
                  </span>
                  <span className="item-maintenance__row-actions">
                    {inst.orphanEquipped && (
                      <button
                        type="button"
                        className="item-maintenance__warn"
                        disabled={busy}
                        title="Instance EQUIPPED sans ligne d'équipement : la remettre en inventaire"
                        onClick={() => void handleRepairOrphan(inst.id)}
                      >
                        Réparer instance équipée orpheline
                      </button>
                    )}
                    <button
                      type="button"
                      className="item-maintenance__danger"
                      disabled={busy || !destroyable}
                      title={destroyable ? "Détruire cette instance" : `Non destructible à l'état ${inst.state}`}
                      onClick={() => void handleDestroyInstance(inst.id, inst.state)}
                    >
                      Détruire
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Template actions */}
      <div className="item-maintenance__block">
        <h4 className="item-maintenance__block-title">Template</h4>
        <div className="item-maintenance__template-actions">
          <button
            type="button"
            className="item-maintenance__warn"
            disabled={busy || !report.template.enabled}
            onClick={() => void handleDisable()}
          >
            {report.template.enabled ? "Désactiver template" : "Déjà désactivé"}
          </button>
          {canDeleteTemplate && (
            <button
              type="button"
              className="item-maintenance__danger"
              disabled={busy}
              onClick={() => void handleDeleteTemplate()}
            >
              Supprimer template
            </button>
          )}
        </div>
        {!canDeleteTemplate && (
          <p className="item-editor__status">
            Suppression du template indisponible : ce modèle est encore référencé.
          </p>
        )}
      </div>
    </div>
  );
}
