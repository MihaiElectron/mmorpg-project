import { useState, useEffect } from "react";
import "./Window.scss";

const API = import.meta.env.VITE_API_URL as string;

type AttachmentSummary = {
  item: { name: string };
  quantity: number;
  instanceId: string | null;
};

type MailEntry = {
  id: string;
  subject?: string;
  senderName?: string;
  hasAttachment: boolean;
  claimed: boolean;
  createdAt?: string;
  attachedAmountBronze?: string | null;
  attachment?: AttachmentSummary | null;
};

function formatBronze(bronze: string): string {
  const n = Number(bronze);
  if (n >= 10000) return `${Math.floor(n / 10000)}g ${Math.floor((n % 10000) / 100)}a ${n % 100}b`;
  if (n >= 100) return `${Math.floor(n / 100)}a ${n % 100}b`;
  return `${n}b`;
}

type Props = {
  buildingId: string;
  onClose: () => void;
};

export default function MailboxWindow({ buildingId, onClose }: Props) {
  const [inbox, setInbox] = useState<MailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("token") ?? "";
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/mail/inbox?buildingId=${buildingId}`, {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setInbox(Array.isArray(data) ? data : data.mails ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [buildingId]);

  async function claimAttachment(mailId: string) {
    setResult(null);
    const res = await fetch(`${API}/mail/${mailId}/claim`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ buildingId }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setInbox((prev) =>
        prev.map((m) => (m.id === mailId ? { ...m, claimed: true } : m)),
      );
      setResult("Pièce jointe récupérée.");
      (window as any).__GLOBAL_CHARACTER_STORE__?.getState?.().loadCharacter?.();
    } else {
      setResult((body as any).message ?? `Erreur ${res.status}`);
    }
  }

  return (
    <div className="game-window game-window--mailbox">
      <div className="game-window__header">
        <span className="game-window__title">Boîte aux lettres</span>
        <button className="game-window__close" onClick={onClose}>✕</button>
      </div>
      <div className="game-window__body">
        {result && <p className="game-window__result">{result}</p>}
        {loading && <p className="game-window__loading">Chargement…</p>}
        {error && <p className="game-window__error">{error}</p>}
        {!loading && !error && inbox.length === 0 && (
          <p className="game-window__empty">Aucun courrier.</p>
        )}
        {!loading && inbox.length > 0 && (
          <ul className="game-window__list">
            {inbox.map((m) => (
              <li key={m.id} className="game-window__list-item">
                <span className="game-window__mail-sender">{m.senderName ?? "Inconnu"}</span>
                <span className="game-window__mail-subject">{m.subject ?? "(sans objet)"}</span>
                {m.hasAttachment && !m.claimed && (
                  <>
                    {m.attachedAmountBronze && (
                      <span className="game-window__mail-amount">{formatBronze(m.attachedAmountBronze)}</span>
                    )}
                    {m.attachment && (
                      <span className="game-window__mail-item">
                        {m.attachment.item.name}
                        {m.attachment.instanceId === null && m.attachment.quantity > 1
                          ? ` ×${m.attachment.quantity}`
                          : ""}
                      </span>
                    )}
                    <button className="game-window__action-btn" onClick={() => claimAttachment(m.id)}>
                      Récupérer
                    </button>
                  </>
                )}
                {m.claimed && <span className="game-window__badge">Récupéré</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
