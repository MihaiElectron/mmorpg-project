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
  objectMode: string;
  instanceType: string;
  quantity: number | null;
  buyoutPriceBronze: string;
  status: string;
  sellerCharacterId: string;
  buyerCharacterId: string | null;
  endsAt: string;
  createdAt: string;
};

type Tab = "browse" | "mine" | "sell";
type SellMode = "instance" | "stackable";

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

function formatItemName(name: string, quantity: number | null): string {
  return quantity != null ? `${name} ×${quantity}` : name;
}

type Props = {
  buildingId: string;
  onClose: () => void;
};

export default function AuctionHouseWindow({ buildingId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("browse");
  const [listings, setListings] = useState<ListingDto[]>([]);
  const [mine, setMine] = useState<ListingDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);

  // Sell — mode
  const [sellMode, setSellMode] = useState<SellMode>("instance");

  // Sell — INSTANCE
  const [sellInstanceId, setSellInstanceId] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellDuration, setSellDuration] = useState<24 | 48 | 72>(24);

  // Sell — STACKABLE
  const [sellStackItemId, setSellStackItemId] = useState("");
  const [sellStackQty, setSellStackQty] = useState("");
  const [sellStackPrice, setSellStackPrice] = useState("");
  const [sellStackDuration, setSellStackDuration] = useState<24 | 48 | 72>(24);

  const inventory = useCharacterStore((s) => s.inventory) as any[];
  const character = useCharacterStore((s) => s.character) as any;

  const instanceItems = inventory.filter((inv: any) => inv.instanceId);
  const stackItems = inventory.filter(
    (inv: any) => !inv.instanceId && inv.item?.objectMode === "STACKABLE" && inv.quantity > 0,
  );

  const selectedStack = stackItems.find((inv: any) => inv.item?.id === sellStackItemId);
  const maxStackQty = selectedStack?.quantity ?? 0;
  const parsedStackQty = parseInt(sellStackQty, 10);
  const stackQtyValid = !isNaN(parsedStackQty) && parsedStackQty > 0 && parsedStackQty <= maxStackQty;

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
      const res = await fetch(`${API}/auction/listings/mine`, { headers: authHeaders() });
      if (res.ok) setMine(await res.json().then((d: unknown) => (Array.isArray(d) ? d : [])));
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

  async function createInstanceListing() {
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

  async function createStackableListing() {
    if (!sellStackItemId || !stackQtyValid) return;
    const price = parseInt(sellStackPrice, 10);
    if (isNaN(price) || price <= 0) { notify("Prix invalide.", false); return; }
    const res = await fetch(`${API}/auction/listings`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        buildingId,
        itemId: sellStackItemId,
        quantity: parsedStackQty,
        buyoutPriceBronze: price,
        durationHours: sellStackDuration,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setSellStackItemId("");
      setSellStackQty("");
      setSellStackPrice("");
      notify("Annonce publiée.");
    } else {
      notify((body as any).message ?? `Erreur ${res.status}`, false);
    }
  }

  const mineActive = mine.filter((m) => m.status === "LISTED");
  const charId = character?.id ?? "";
  const hasInstance = instanceItems.length > 0;
  const hasStack = stackItems.length > 0;

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
                      <td className="ah-window__cell--name">
                        {formatItemName(l.itemName, l.quantity)}
                        {l.instanceType === "LOT" && (
                          <span className="ah-window__badge--lot">LOT</span>
                        )}
                      </td>
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
                        <td className="ah-window__cell--name">
                          {formatItemName(l.itemName, l.quantity)}
                          {l.instanceType === "LOT" && (
                            <span className="ah-window__badge--lot">LOT</span>
                          )}
                        </td>
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

            <p className="ah-window__hint">Vos achats et revenus sont livrés par courrier. Consultez votre boîte aux lettres.</p>
          </>
        )}

        {/* ── Vendre ─────────────────────────────────────────── */}
        {tab === "sell" && (
          <div className="ah-window__sell-form">
            {!hasInstance && !hasStack ? (
              <p className="ah-window__hint">Aucun objet vendable dans l'inventaire.</p>
            ) : (
              <>
                {/* Sélecteur de mode si les deux types sont disponibles */}
                {hasInstance && hasStack && (
                  <div className="ah-window__mode-row">
                    <button
                      className={`ah-window__mode-btn${sellMode === "instance" ? " ah-window__mode-btn--active" : ""}`}
                      onClick={() => setSellMode("instance")}
                    >
                      Objet unique
                    </button>
                    <button
                      className={`ah-window__mode-btn${sellMode === "stackable" ? " ah-window__mode-btn--active" : ""}`}
                      onClick={() => setSellMode("stackable")}
                    >
                      Ressource
                    </button>
                  </div>
                )}

                {/* ── Branche INSTANCE ── */}
                {(sellMode === "instance" || !hasStack) && hasInstance && (
                  <>
                    <label className="ah-window__label">Objet</label>
                    <select
                      className="ah-window__select"
                      value={sellInstanceId}
                      onChange={(e) => setSellInstanceId(e.target.value)}
                    >
                      <option value="">— Choisir —</option>
                      {instanceItems.map((inv: any) => (
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
                      onClick={createInstanceListing}
                    >
                      Publier l'annonce
                    </button>
                  </>
                )}

                {/* ── Branche STACKABLE ── */}
                {(sellMode === "stackable" || !hasInstance) && hasStack && (
                  <>
                    <label className="ah-window__label">Ressource</label>
                    <select
                      className="ah-window__select"
                      value={sellStackItemId}
                      onChange={(e) => { setSellStackItemId(e.target.value); setSellStackQty(""); }}
                    >
                      <option value="">— Choisir —</option>
                      {stackItems.map((inv: any) => (
                        <option key={inv.item.id} value={inv.item.id}>
                          {inv.item?.name ?? inv.item.id} (disponible : {inv.quantity})
                        </option>
                      ))}
                    </select>

                    <label className="ah-window__label">
                      Quantité à vendre
                      {selectedStack && (
                        <span className="ah-window__label--hint"> — max {maxStackQty}</span>
                      )}
                    </label>
                    <input
                      className="ah-window__input"
                      type="number"
                      min={1}
                      max={maxStackQty || undefined}
                      placeholder="ex: 100"
                      value={sellStackQty}
                      onChange={(e) => setSellStackQty(e.target.value)}
                      disabled={!sellStackItemId}
                    />
                    {sellStackQty && !stackQtyValid && sellStackItemId && (
                      <span className="ah-window__error-hint">
                        {parsedStackQty > maxStackQty
                          ? `Maximum ${maxStackQty}`
                          : "Quantité invalide"}
                      </span>
                    )}

                    <label className="ah-window__label">Prix total (bronze)</label>
                    <input
                      className="ah-window__input"
                      type="number"
                      min={1}
                      placeholder="ex: 500"
                      value={sellStackPrice}
                      onChange={(e) => setSellStackPrice(e.target.value)}
                    />
                    {sellStackPrice && !isNaN(parseInt(sellStackPrice)) && (
                      <span className="ah-window__price-preview">{formatPrice(sellStackPrice)}</span>
                    )}

                    <label className="ah-window__label">Durée</label>
                    <div className="ah-window__duration-row">
                      {DURATIONS.map((d) => (
                        <button
                          key={d}
                          className={`ah-window__duration-btn${sellStackDuration === d ? " ah-window__duration-btn--active" : ""}`}
                          onClick={() => setSellStackDuration(d)}
                        >
                          {d}h
                        </button>
                      ))}
                    </div>

                    <button
                      className="ah-window__btn ah-window__btn--primary"
                      disabled={!sellStackItemId || !stackQtyValid || !sellStackPrice}
                      onClick={createStackableListing}
                    >
                      Publier l'annonce
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
