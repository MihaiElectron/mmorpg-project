import { useState, useCallback } from "react";

const API = import.meta.env.VITE_API_URL as string;

type LotEntry = {
  id: string;
  itemName: string;
  quantity: number | null;
  instanceType: string;
  objectMode: string;
  buyoutPriceBronze: string;
  sellerCharacterId: string;
  status: string;
  endsAt: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token") ?? "";
  return { Authorization: `Bearer ${token}` };
}

export default function LotsInspector() {
  const [isOpen, setIsOpen] = useState(false);
  const [lots, setLots] = useState<LotEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/auction/listings`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      const all: LotEntry[] = Array.isArray(data) ? data : [];
      setLots(all.filter((l) => l.instanceType === "LOT"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && lots.length === 0) load();
  };

  return (
    <section className="devtools-world__inspector" aria-label="Market Lots Inspector">
      <h3
        className="devtools-world__title devtools-world__title--clickable"
        onClick={handleToggle}
      >
        <span className="devtools-world__title-label">
          <span aria-hidden="true">🏷️</span>
          Market Lots (LISTED)
        </span>
        {isOpen && (
          <button
            className="devtools-world__refresh-btn"
            onClick={(e) => { e.stopPropagation(); load(); }}
            title="Rafraîchir"
            type="button"
          >
            ↺
          </button>
        )}
        <span className="devtools-world__chevron">{isOpen ? "▾" : "▸"}</span>
      </h3>

      {isOpen && (
        <div className="devtools-world__coordinate-list">
          {loading && <div className="devtools-world__coordinate-row">Chargement…</div>}
          {error && <div className="devtools-world__error">{error}</div>}
          {!loading && !error && lots.length === 0 && (
            <div className="devtools-world__coordinate-row">Aucun Market Lot actif.</div>
          )}
          {lots.map((l) => (
            <div key={l.id} className="devtools-world__coordinate-row">
              <span
                style={{
                  background: "#4a3a1a",
                  color: "#d4a843",
                  borderRadius: "3px",
                  padding: "0 4px",
                  fontSize: "9px",
                  fontWeight: "bold",
                  marginRight: "6px",
                }}
              >
                LOT
              </span>
              <strong>{l.itemName}</strong>
              {l.quantity != null && <span style={{ color: "#aaa", marginLeft: "4px" }}>×{l.quantity}</span>}
              <span style={{ color: "#666", marginLeft: "6px", fontSize: "10px" }}>
                {l.objectMode} — {l.status} — {l.buyoutPriceBronze}b
              </span>
              <span
                style={{ color: "#555", marginLeft: "6px", fontSize: "9px", display: "block" }}
                title={l.id}
              >
                seller: {l.sellerCharacterId.slice(0, 8)}…
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
