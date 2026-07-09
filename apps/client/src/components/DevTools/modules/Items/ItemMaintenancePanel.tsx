import { useCallback, useEffect, useState } from "react";
import { ackPromise, getSocket } from "../../../AdminPanel/adminPanel.shared";
import type { ItemMaintenanceReport, LootPoolReferenceDetail, RecipeReferenceDetail } from "./itemEditor.types";
import { useConfirmDialog } from "../../../common/useConfirmDialog";

const API = import.meta.env.VITE_API_URL as string;

async function patchAdmin(path: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const token = localStorage.getItem("token") ?? "";
    const res = await fetch(`${API}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, message: "OK" };
    const b = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, message: typeof b.message === "string" ? b.message : `Erreur ${res.status}` };
  } catch {
    return { ok: false, message: "Erreur réseau" };
  }
}

async function getAdmin<T>(path: string): Promise<T | null> {
  try {
    const token = localStorage.getItem("token") ?? "";
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

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

  const { confirm, dialog: confirmDialog } = useConfirmDialog();

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

  async function run(
    event: string,
    payload: unknown,
    confirmMsg: string,
    opts: { title?: string; variant?: "default" | "danger"; requireTypedConfirmation?: string } = {},
  ): Promise<void> {
    const confirmed = await confirm({
      title: opts.title ?? "Confirmer l'action",
      message: confirmMsg,
      variant: opts.variant ?? "danger",
      requireTypedConfirmation: opts.requireTypedConfirmation,
    });
    if (!confirmed) return;
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
      { title: "Supprimer une stack inventaire" },
    );

  const handleDestroyInstance = (instanceId: string, state: string) =>
    run(
      "admin:delete_item_instance",
      { itemInstanceId: instanceId },
      `Détruire (DESTROYED) l'instance de "${itemName}" [${state}] ?`,
      { title: "Détruire une instance d'objet" },
    );

  // Retire une entrée de loot pool (resource ou creature) via PATCH template.
  // Recharge le pool courant, retire l'entrée ciblée (index + itemRef), sauvegarde.
  async function handleRemoveLootRef(ref: LootPoolReferenceDetail): Promise<void> {
    const confirmed = await confirm({
      title: "Retirer du loot pool",
      message: `Retirer "${itemName}" du loot pool de ${ref.sourceName} (${ref.path}) ?`,
      variant: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setMessage(null);

    const isResource = ref.sourceKind === "resource_template";
    const listPath = isResource ? "/admin/resource-templates" : "/admin/templates";
    const idField = isResource ? "type" : "key";
    const list = await getAdmin<any[]>(listPath);
    const src = list?.find((t) => t[idField] === ref.sourceName);
    if (!src) { setMessage(`Source ${ref.sourceName} introuvable.`); setBusy(false); setStale(true); return; }

    const pool: any[] = Array.isArray(src.lootPool) ? src.lootPool : [];
    const idxMatch = Number(ref.path.replace(/[^0-9]/g, ""));
    const nextPool = pool.filter((e, i) =>
      !(i === idxMatch && e?.itemId === ref.itemRef),
    );
    // Sécurité : si l'index n'a pas matché (pool modifié entre-temps), retire la 1re occurrence.
    const finalPool = nextPool.length === pool.length
      ? pool.filter((e) => e?.itemId !== ref.itemRef)
      : nextPool;

    const savePath = isResource
      ? `/admin/resource-templates/${encodeURIComponent(ref.sourceName)}`
      : `/admin/templates/${encodeURIComponent(ref.sourceName)}`;
    const res = await patchAdmin(savePath, { lootPool: finalPool });
    setMessage(res.message === "OK" ? `Retiré du loot pool de ${ref.sourceName}.` : res.message);
    setBusy(false);
    if (res.ok) { await loadReport(); onChanged(); } else setStale(true);
  }

  const handleRemoveRecipeRef = (ref: RecipeReferenceDetail) =>
    run(
      ref.role === "output" ? "admin:remove_result" : "admin:remove_ingredient",
      ref.role === "output" ? { resultId: ref.refId } : { ingredientId: ref.refId },
      `Retirer "${itemName}" (${ref.role === "output" ? "résultat" : "ingrédient"}) de la recette "${ref.recipeName}" ?`,
      { title: "Retirer une référence de recette" },
    );

  const handleRepairOrphan = (instanceId: string) =>
    run(
      "admin:repair_orphan_equipped_instance",
      { itemInstanceId: instanceId },
      `Réparer l'instance équipée orpheline de "${itemName}" ? Elle repassera disponible dans l'inventaire du propriétaire.`,
      { title: "Réparer une instance orpheline", variant: "default" },
    );

  const handleDisable = () =>
    run(
      "admin:disable_item_template",
      { itemId },
      `Désactiver le template "${itemName}" ? Les instances existantes sont conservées.`,
      { title: "Désactiver le template", variant: "default" },
    );

  const handleDeleteTemplate = () =>
    run(
      "admin:delete_item_template",
      { itemId },
      `SUPPRIMER DÉFINITIVEMENT le template "${itemName}" ? Action irréversible (autorisée uniquement si zéro référence).`,
      { title: "Supprimer le template définitivement", requireTypedConfirmation: itemName },
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
      {confirmDialog}
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
        <button
          type="button"
          className="item-editor__save item-editor__save--ghost"
          disabled={busy}
          onClick={() => void loadReport()}
          title="Recalculer les références (après édition dans un autre éditeur)"
        >
          Rafraîchir
        </button>
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

      {/* Références loot pools (actionnables) */}
      {report.referencesDetail.lootPools.length > 0 && (
        <div className="item-maintenance__block">
          <h4 className="item-maintenance__block-title">
            Loot pools ({report.referencesDetail.lootPools.length}) — à modifier dans Resource Editor / LootPool Editor
          </h4>
          <ul className="item-maintenance__list">
            {report.referencesDetail.lootPools.map((ref, i) => (
              <li key={i} className="item-maintenance__row">
                <span>
                  <strong>{ref.sourceKind === "resource_template" ? "Ressource" : "Créature"} : {ref.sourceName}</strong>
                  {" · "}{ref.path}{" · "}<code>{ref.itemRef}</code>
                </span>
                <button
                  type="button"
                  className="item-maintenance__danger"
                  disabled={busy}
                  onClick={() => void handleRemoveLootRef(ref)}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Références recettes (actionnables) */}
      {report.referencesDetail.recipes.length > 0 && (
        <div className="item-maintenance__block">
          <h4 className="item-maintenance__block-title">
            Recettes craft ({report.referencesDetail.recipes.length}) — à modifier dans Recipe Editor
          </h4>
          <ul className="item-maintenance__list">
            {report.referencesDetail.recipes.map((ref, i) => (
              <li key={i} className="item-maintenance__row">
                <span>
                  <strong>{ref.recipeName}</strong>{" · "}{ref.role === "output" ? "résultat" : "ingrédient"}
                </span>
                <button
                  type="button"
                  className="item-maintenance__danger"
                  disabled={busy}
                  onClick={() => void handleRemoveRecipeRef(ref)}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
