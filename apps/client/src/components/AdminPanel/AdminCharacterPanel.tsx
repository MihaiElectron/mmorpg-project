/**
 * AdminCharacterPanel — miroir READ-ONLY de l'onglet Perso du panneau joueur.
 * ----------------------------------------------------------------------------
 * Alimenté par GET /admin/characters/:id/details (snapshot serveur = source de
 * vérité). N'utilise JAMAIS character.store (aucun écrasement du joueur local),
 * aucune mutation, aucun socket, aucun polling : un fetch unique à l'ouverture.
 * Phase 1bis-A : onglet Perso actif ; Stats/Skills/Talents/Succès en attente.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CharacterEquipmentView, {
  type EquipmentSlotItem,
} from "../character/CharacterEquipmentView";
import InventoryGridView, {
  type InventoryGridEntry,
} from "../character/InventoryGridView";
import { getSocket, ackPromise } from "./adminPanel.shared";

const API = import.meta.env.VITE_API_URL as string;
const DIRTY_DEBOUNCE_MS = 200;

const TABS = [
  { id: "perso", label: "Perso" },
  { id: "stats", label: "Stats" },
  { id: "skills", label: "Skills" },
  { id: "talents", label: "Talents" },
  { id: "achievements", label: "Succès" },
];

interface Snapshot {
  character: {
    id: string;
    name: string;
    sex: string;
    level: number;
    experience: number;
    health: number;
    maxHealth: number;
    stats: { derived: Record<string, number> };
    wallet: { gold: number; silver: number; bronze: number };
  };
  inventory: {
    id: string;
    instanceId: string | null;
    equipped: boolean;
    quantity: number;
    slotIndex: number | null;
    item: { id: string; name: string; image?: string | null; objectMode?: string; slot?: string | null };
  }[];
  equipment: {
    slot: string;
    itemInstanceId: string | null;
    itemId: string | null;
    name: string | null;
    image: string | null;
    objectMode: string | null;
  }[];
}

export default function AdminCharacterPanel({ characterId }: { characterId: string }) {
  const [activeTab, setActiveTab] = useState("perso");
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Erreur d'action admin (refus serveur) — affichage sobre, non bloquant.
  const [actionError, setActionError] = useState<string | null>(null);

  // Vivant tant que le composant est monté pour le même characterId (évite les
  // setState après démontage / changement de cible).
  const aliveRef = useRef(true);

  // `silent` : refetch live (event dirty) sans écran de chargement bloquant.
  const fetchSnapshot = useCallback(
    (silent: boolean) => {
      const token = localStorage.getItem("token") ?? "";
      if (!silent) {
        setLoading(true);
        setError(null);
        setData(null);
      }
      fetch(`${API}/admin/characters/${characterId}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<Snapshot>;
        })
        .then((json) => {
          if (aliveRef.current) {
            setData(json);
            setError(null);
          }
        })
        .catch((e) => {
          // En refetch silencieux, garder l'affichage courant ; ne pas clignoter.
          if (aliveRef.current && !silent) setError(String(e.message ?? e));
        })
        .finally(() => {
          if (aliveRef.current && !silent) setLoading(false);
        });
    },
    [characterId],
  );

  // Fetch initial (avec chargement) au montage / changement de personnage.
  useEffect(() => {
    aliveRef.current = true;
    fetchSnapshot(false);
    return () => {
      aliveRef.current = false;
    };
  }, [fetchSnapshot]);

  // Live refresh : écoute l'invalidation admin (socket existant), debounce,
  // refetch silencieux si l'event concerne le personnage affiché. Aucun polling.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onDirty = (event: { characterId?: string }) => {
      if (!event || event.characterId !== characterId) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fetchSnapshot(true), DIRTY_DEBOUNCE_MS);
    };

    socket.on("admin:character_details_dirty", onDirty);
    return () => {
      socket.off("admin:character_details_dirty", onDirty);
      if (timer) clearTimeout(timer);
    };
  }, [characterId, fetchSnapshot]);

  const equipmentBySlot = useMemo(() => {
    const map: Record<string, EquipmentSlotItem> = {};
    for (const eq of data?.equipment ?? []) {
      map[eq.slot] = {
        name: eq.name,
        image: eq.image,
        itemInstanceId: eq.itemInstanceId,
        itemId: eq.itemId,
        objectMode: eq.objectMode,
      };
    }
    return map;
  }, [data]);

  const inventoryEntries: InventoryGridEntry[] = useMemo(
    () =>
      (data?.inventory ?? [])
        .filter((inv) => !inv.equipped)
        .map((inv) => ({
          id: inv.id,
          instanceId: inv.instanceId,
          quantity: inv.quantity,
          slotIndex: inv.slotIndex,
          item: inv.item,
        })),
    [data],
  );

  // Émission admin : le serveur est l'autorité. Après un ack succès on ne touche
  // JAMAIS l'état local — l'event `admin:character_details_dirty` (émis par le
  // service) déclenche le refetch silencieux existant. Un échec = message sobre.
  const emitAdmin = useCallback(
    async (event: string, payload: Record<string, unknown>) => {
      const socket = getSocket();
      if (!socket) {
        setActionError("Socket admin indisponible.");
        return;
      }
      const res = await ackPromise(socket, event, { characterId, ...payload });
      setActionError(res.success ? null : res.message || "Action refusée.");
    },
    [characterId],
  );

  const handleReorder = useCallback(
    (entries: { kind: "stack" | "instance"; id: string; slotIndex: number }[]) =>
      emitAdmin("admin:update_inventory_slots", { entries }),
    [emitAdmin],
  );

  const handleEquipmentDropToInventory = useCallback(
    (targetSlotIndex: number, slot: string) =>
      emitAdmin("admin:unequip_item", { slot, targetSlotIndex }),
    [emitAdmin],
  );

  const handleEquip = useCallback(
    (instanceId: string, targetSlot: string) =>
      emitAdmin("admin:equip_item", { instanceId, targetSlot }),
    [emitAdmin],
  );

  // Double-clic inventaire admin : équiper l'instance (résolution slot serveur).
  // Un stack legacy (sans instanceId) n'est pas équipable → message sobre.
  const handleInventoryDoubleClick = useCallback(
    (entry: InventoryGridEntry) => {
      if (!entry.instanceId) {
        setActionError("Objet non équipable (stack).");
        return;
      }
      emitAdmin("admin:equip_item", { instanceId: entry.instanceId });
    },
    [emitAdmin],
  );

  // Double-clic équipement admin : déséquiper vers l'inventaire.
  const handleEquipmentDoubleClick = useCallback(
    (slot: string) => emitAdmin("admin:unequip_item", { slot }),
    [emitAdmin],
  );

  return (
    <div className="admin-character-panel">
      <div className="admin-character-panel__tabs">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`admin-character-panel__tab${activeTab === id ? " admin-character-panel__tab--active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="admin-panel__loading">Chargement…</p>}
      {error && <p className="admin-character-panel__error">Détails indisponibles ({error}).</p>}

      {data && !loading && !error && activeTab === "perso" && (
        <div className="admin-character-panel__perso">
          {actionError && (
            <p className="admin-character-panel__error">Action refusée : {actionError}</p>
          )}
          <div className="admin-character-panel__wallet" title="Solde du joueur (lecture seule)">
            {data.character.wallet.gold > 0 && (
              <span className="character-layout__balance-gold">{data.character.wallet.gold}g</span>
            )}
            {(data.character.wallet.gold > 0 || data.character.wallet.silver > 0) && (
              <span className="character-layout__balance-silver">{data.character.wallet.silver}a</span>
            )}
            <span className="character-layout__balance-bronze">{data.character.wallet.bronze}b</span>
          </div>
          <CharacterEquipmentView
            character={{
              name: data.character.name,
              sex: data.character.sex,
              level: data.character.level,
              health: data.character.health,
              maxHealth: data.character.maxHealth,
              experience: data.character.experience,
              // attaque/défense = valeurs dérivées serveur (parité panneau joueur).
              attack: data.character.stats?.derived?.physicalAttack ?? 0,
              defense: data.character.stats?.derived?.defense ?? 0,
            }}
            equipmentBySlot={equipmentBySlot}
            editable
            onEquip={handleEquip}
            onSlotDoubleClick={handleEquipmentDoubleClick}
          />
          <InventoryGridView
            entries={inventoryEntries}
            editable
            onReorder={handleReorder}
            onEquipmentDrop={handleEquipmentDropToInventory}
            onItemDoubleClick={handleInventoryDoubleClick}
          />
        </div>
      )}

      {data && !loading && !error && activeTab !== "perso" && (
        <p className="admin-character-panel__soon">Onglet « {TABS.find((t) => t.id === activeTab)?.label} » à venir.</p>
      )}
    </div>
  );
}
