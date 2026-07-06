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
import { getSocket } from "./adminPanel.shared";

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
  };
  inventory: {
    id: string;
    equipped: boolean;
    quantity: number;
    slotIndex: number | null;
    item: { id: string; name: string; image?: string | null };
  }[];
  equipment: {
    slot: string;
    name: string | null;
    image: string | null;
  }[];
}

export default function AdminCharacterPanel({ characterId }: { characterId: string }) {
  const [activeTab, setActiveTab] = useState("perso");
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      map[eq.slot] = { name: eq.name, image: eq.image };
    }
    return map;
  }, [data]);

  const inventoryEntries: InventoryGridEntry[] = useMemo(
    () =>
      (data?.inventory ?? [])
        .filter((inv) => !inv.equipped)
        .map((inv) => ({ id: inv.id, quantity: inv.quantity, slotIndex: inv.slotIndex, item: inv.item })),
    [data],
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
          <CharacterEquipmentView
            character={{
              name: data.character.name,
              sex: data.character.sex,
              level: data.character.level,
              health: data.character.health,
              maxHealth: data.character.maxHealth,
              experience: data.character.experience,
              // attaque/défense = valeurs dérivées serveur (lecture seule).
              attack: data.character.stats?.derived?.physicalAttack ?? 0,
              defense: data.character.stats?.derived?.defense ?? 0,
            }}
            equipmentBySlot={equipmentBySlot}
          />
          <InventoryGridView entries={inventoryEntries} />
        </div>
      )}

      {data && !loading && !error && activeTab !== "perso" && (
        <p className="admin-character-panel__soon">Onglet « {TABS.find((t) => t.id === activeTab)?.label} » à venir.</p>
      )}
    </div>
  );
}
