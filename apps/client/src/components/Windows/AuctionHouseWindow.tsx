import { useState, useEffect, useCallback } from "react";
import { useCharacterStore } from "../../store/character.store";
import "./AuctionHouseWindow.scss";

const API = import.meta.env.VITE_API_URL as string;
const DURATIONS = [24, 48, 72] as const;

type ListingDto = {
  id: string;
  itemId: string;
  itemName: string;
  itemImage: string;
  buyoutPriceBronze: string;
  status: string;
  sellerCharacterId: string;
  buyerCharacterId: string | null;
  endsAt: string;
  createdAt: string;
};

type Tab = "browse" | "mine" | "sell";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function formatPrice(bronze: string): string {
  const n = Number(bronze);
  if (n >= 10000) return `${Math.floor(n / 10000)}g ${Math.floor((n % 10000) / 100)}a ${n % 100}b`;
  if (n >= 100) return `${Math.floor(n / 100)}a ${n % 100}b`;
  return `${n}b`;
}

function formatTimeLeft(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Expiré";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}j ${h % 24}h`;
  return `${h}h ${m}m`;
}

type Props = {
  buildingId: string;
  onClose: () => void;
};

export default function AuctionHouseWindow({ buildingId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("browse");
  const [listings, setListings] = useState<ListingDto[]>([]);
  const [mine, setMine] = useState<ListingDto[]>([]);
  const [purchases, setPurchases] = useState<ListingDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);

  // Sell form state
  const inventory = useCharacterStore((s) => s.inventory) as any[];
  const character = useCharacterStore((s) => s.character) as any;
  const [sellInstanceId, setSellInstanceId] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellDuration, setSellDuration] = useState<24 | 48 | 72>(24);

  const instanceItems = inventory.filter((inv) => inv.instanceId);

  const notify = (msg: string, ok = true) => {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 3500);
  };

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/auction/listings?buildingId=${buildingId}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setListings(Array.isArray(data) ? data : []);
    } catch (e: any) {
      notify(e.message, false);
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      const [resMine, resBuyer] = await Promise.all([
        fetch(`${API}/auction/listings/mine`, { headers: authHeaders() }),
        fetch(`${API}/auction/listings/pending-as-buyer`, { headers: authHeaders() }),
      ]);
      if (resMine.ok) setMine(await resMine.json().then((d) => (Array.isArray(d) ? d : [])));
      if (resBuyer.ok) setPurchases(await resBuyer.json().then((d) => (Array.isArray(d) ? d : [])));
    } catch (e: any) {
      notify(e.message, false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "browse") loadListings();
    if (tab === "mine") loadMine();
  }, [tab, loadListings, loadMine]);

  async function buyListing(listingId: string) {
    const res = await fetch(`${API}/auction/listings/${listingId}/buy`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ buildingId }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setListings((prev) => prev.filter((l) => l.id !== listingId));
      notify("Achat effectué.");
    } else {
      notify((body as any).message ?? `Erreur ${res.status}`, false);
    }
  }

  async function cancelListing(listingId: string) {
    const res = await fetch(`${API}/auction/listings/${listingId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      loadMine();
      notify("Annonce annulée.");
    } else {
      const body = await res.json().catch(() => ({}));
      notify((body as any).message ?? `Erreur ${res.status}`, false);
    }
  }

  async function claimBuyer(listingId: string) {
    const res = await fetch(`${API}/auction/listings/${listingId}/claim-buyer`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (res.ok) {
      setPurchases((prev) => prev.filter((p) => p.id !== listingId));
      notify("Objet récupéré dans l'inventaire.");
    } else {
      const body = await res.json().catch(() => ({}));
      notify((body as any).message ?? `Erreur ${res.status}`, false);
    }
  }

  async function claimSeller(listingId: string) {
    const res = await fetch(`${API}/auction/listings/${listingId}/claim-seller`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (res.ok) {
      loadMine();
      notify("Récupéré.");
    } else {
      const body = await res.json().catch(() => ({}));
      notify((body as any).message ?? `Erreur ${res.status}`, false);
    }
  }

  async function createListing() {
    if (!sellInstanceId || !sellPrice) return;
    const price = parseInt(sellPrice, 10);
    if (isNaN(price) || price <= 0) { notify("Prix invalide.", false); return; }
    const res = await fetch(`${API}/auction/listings`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        buildingId,
        itemInstanceId: sellInstanceId,
        buyoutPriceBronze: price,
        durationHours: sellDuration,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setSellInstanceId("");
      setSellPrice("");
      notify("Annonce publiée.");
    } else {
      notify((body as any).message ?? `Erreur ${res.status}`, false);
    }
  }

  const mineActive = mine.filter((m) => m.status === "LISTED");
  const minePending = mine.filter((m) =>
    ["SOLD_PENDING_CLAIM", "EXPIRED_PENDING_CLAIM", "CANCELLED_PENDING_CLAIM"].includes(m.status),
  );
  const charId = character?.id ?? "";

  return (
    <div className="ah-window">
      <div className="ah-window__header">
        <span className="ah-window__title">Hôtel des Ventes</span>
        <button className="ah-window__close" onClick={onClose}>✕</button>
      </div>

      <div className="ah-window__tabs">
        <button
          className={`ah-window__tab${tab === "browse" ? " ah-window__tab--active" : ""}`}
          onClick={() => setTab("browse")}
        >
          Parcourir
        </button>
        <button
          className={`ah-window__tab${tab === "mine" ? " ah-window__tab--active" : ""}`}
          onClick={() => setTab("mine")}
        >
          Mes annonces
          {(minePending.length + purchases.length) > 0 && (
            <span className="ah-window__badge">{minePending.length + purchases.length}</span>
          )}
        </button>
        <button
          className={`ah-window__tab${tab === "sell" ? " ah-window__tab--active" : ""}`}
          onClick={() => setTab("sell")}
        >
          Vendre
        </button>
      </div>

      {flash && (
        <div className={`ah-window__flash${flash.ok ? "" : " ah-window__flash--error"}`}>
          {flash.msg}
        </div>
      )}

      <div className="ah-window__body">
        {/* ── Parcourir ──────────────────────────────────────── */}
        {tab === "browse" && (
          <>
            {loading && <p className="ah-window__hint">Chargement…</p>}
            {!loading && listings.length === 0 && (
              <p className="ah-window__hint">Aucune offre disponible.</p>
            )}
            {!loading && listings.length > 0 && (
              <table className="ah-window__table">
                <thead>
                  <tr>
                    <th>Objet</th>
                    <th>Prix</th>
                    <th>Expire</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr key={l.id} className={l.sellerCharacterId === charId ? "ah-window__row--own" : ""}>
                      <td className="ah-window__cell--name">{l.itemName}</td>
                      <td className="ah-window__cell--price">{formatPrice(l.buyoutPriceBronze)}</td>
                      <td className="ah-window__cell--time">{formatTimeLeft(l.endsAt)}</td>
                      <td>
                        {l.sellerCharacterId !== charId && (
                          <button className="ah-window__btn" onClick={() => buyListing(l.id)}>
                            Acheter
                          </button>
                        )}
                        {l.sellerCharacterId === charId && (
                          <span className="ah-window__label--own">Ma mise</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ── Mes annonces ───────────────────────────────────── */}
        {tab === "mine" && (
          <>
            {loading && <p className="ah-window__hint">Chargement…</p>}
            {!loading && mine.length === 0 && (
              <p className="ah-window__hint">Aucune annonce.</p>
            )}

            {mineActive.length > 0 && (
              <section className="ah-window__section">
                <h4 className="ah-window__section-title">En cours</h4>
                <table className="ah-window__table">
                  <thead>
                    <tr><th>Objet</th><th>Prix</th><th>Expire</th><th></th></tr>
                  </thead>
                  <tbody>
                    {mineActive.map((l) => (
                      <tr key={l.id}>
                        <td className="ah-window__cell--name">{l.itemName}</td>
                        <td className="ah-window__cell--price">{formatPrice(l.buyoutPriceBronze)}</td>
                        <td className="ah-window__cell--time">{formatTimeLeft(l.endsAt)}</td>
                        <td>
                          <button className="ah-window__btn ah-window__btn--cancel" onClick={() => cancelListing(l.id)}>
                            Annuler
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {purchases.length > 0 && (
              <section className="ah-window__section">
                <h4 className="ah-window__section-title">Achats à récupérer</h4>
                <table className="ah-window__table">
                  <thead>
                    <tr><th>Objet</th><th>Prix payé</th><th></th></tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr key={p.id}>
                        <td className="ah-window__cell--name">{p.itemName}</td>
                        <td className="ah-window__cell--price">{formatPrice(p.buyoutPriceBronze)}</td>
                        <td>
                          <button className="ah-window__btn" onClick={() => claimBuyer(p.id)}>
                            Récupérer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {minePending.length > 0 && (
              <section className="ah-window__section">
                <h4 className="ah-window__section-title">Revenus à récupérer</h4>
                <table className="ah-window__table">
                  <thead>
                    <tr><th>Objet</th><th>Statut</th><th></th></tr>
                  </thead>
                  <tbody>
                    {minePending.map((l) => (
                      <tr key={l.id}>
                        <td className="ah-window__cell--name">{l.itemName}</td>
                        <td className="ah-window__cell--status">
                          {l.status === "SOLD_PENDING_CLAIM" && "Vendu"}
                          {l.status === "EXPIRED_PENDING_CLAIM" && "Expiré"}
                          {l.status === "CANCELLED_PENDING_CLAIM" && "Annulé"}
                        </td>
                        <td>
                          <button className="ah-window__btn" onClick={() => claimSeller(l.id)}>
                            Récupérer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}

        {/* ── Vendre ─────────────────────────────────────────── */}
        {tab === "sell" && (
          <div className="ah-window__sell-form">
            {instanceItems.length === 0 ? (
              <p className="ah-window__hint">Aucun objet vendable dans l'inventaire.<br />Seuls les objets uniques (instance) peuvent être mis en vente.</p>
            ) : (
              <>
                <label className="ah-window__label">Objet</label>
                <select
                  className="ah-window__select"
                  value={sellInstanceId}
                  onChange={(e) => setSellInstanceId(e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {instanceItems.map((inv) => (
                    <option key={inv.instanceId} value={inv.instanceId}>
                      {inv.item?.name ?? inv.instanceId}
                    </option>
                  ))}
                </select>

                <label className="ah-window__label">Prix (bronze)</label>
                <input
                  className="ah-window__input"
                  type="number"
                  min={1}
                  placeholder="ex: 500"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                />
                {sellPrice && !isNaN(parseInt(sellPrice)) && (
                  <span className="ah-window__price-preview">{formatPrice(sellPrice)}</span>
                )}

                <label className="ah-window__label">Durée</label>
                <div className="ah-window__duration-row">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      className={`ah-window__duration-btn${sellDuration === d ? " ah-window__duration-btn--active" : ""}`}
                      onClick={() => setSellDuration(d)}
                    >
                      {d}h
                    </button>
                  ))}
                </div>

                <button
                  className="ah-window__btn ah-window__btn--primary"
                  disabled={!sellInstanceId || !sellPrice}
                  onClick={createListing}
                >
                  Publier l'annonce
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
