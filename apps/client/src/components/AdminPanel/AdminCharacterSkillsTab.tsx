import { useCallback, useEffect, useState } from "react";
import { getSocket, ackPromise } from "./adminPanel.shared";

const API = import.meta.env.VITE_API_URL as string;

type SkillKind = "active" | "passive" | "aura";

interface AdminSkillUnlockView {
  key: string;
  name: string;
  skillKind: SkillKind;
  enabled: boolean;
  autoUnlock: boolean;
  explicitlyUnlocked: boolean;
  unlocked: boolean;
  source: string | null;
  unlockedAt: string | null;
}

const KIND_LABEL: Record<SkillKind, string> = {
  active: "Actif",
  passive: "Passif",
  aura: "Aura",
};

/**
 * AdminCharacterSkillsTab — gestion admin du déverrouillage des skills d'un
 * personnage (Skills V1-H-B). Lit GET /admin/characters/:id/skill-unlocks et
 * mute via les handlers socket admin:unlock_skill / admin:lock_skill. Le serveur
 * reste l'autorité ; on refetch après chaque mutation (le joueur ciblé reçoit
 * character:reload côté serveur).
 */
export default function AdminCharacterSkillsTab({ characterId }: { characterId: string }) {
  const [skills, setSkills] = useState<AdminSkillUnlockView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token") ?? "";
      const res = await fetch(`${API}/admin/characters/${characterId}/skill-unlocks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = (await res.json()) as { skills: AdminSkillUnlockView[] };
      setSkills(data.skills ?? []);
    } catch {
      setError("Chargement des skills impossible.");
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(
    async (event: string, skillKey: string, extra: Record<string, unknown> = {}) => {
      setActionError(null);
      setBusyKey(skillKey);
      const socket = getSocket();
      if (!socket) {
        setActionError("Socket admin indisponible.");
        setBusyKey(null);
        return;
      }
      const res = await ackPromise(socket, event, { characterId, skillKey, ...extra });
      if (!res.success) setActionError(res.message || "Action refusée.");
      await load();
      setBusyKey(null);
    },
    [characterId, load],
  );

  if (loading) return <div className="admin-character-skills__muted">Chargement…</div>;
  if (error) return <div className="admin-character-skills__error">{error}</div>;
  if (skills.length === 0) {
    return <div className="admin-character-skills__muted">Aucun skill dans le catalogue.</div>;
  }

  return (
    <div className="admin-character-skills">
      {actionError && <div className="admin-character-skills__error">{actionError}</div>}
      <ul className="admin-character-skills__list">
        {skills.map((s) => {
          const busy = busyKey === s.key;
          return (
            <li key={s.key} className="admin-character-skills__item">
              <div className="admin-character-skills__main">
                <span className="admin-character-skills__name">{s.name}</span>
                <code className="admin-character-skills__key">{s.key}</code>
                <span className="admin-character-skills__tags">
                  {KIND_LABEL[s.skillKind]}
                  {s.skillKind !== "active" && (
                    <span className="admin-character-skills__note"> · non lançable en V1</span>
                  )}
                  {!s.enabled && <span className="admin-character-skills__note"> · désactivé</span>}
                </span>
                <span className="admin-character-skills__state">
                  {s.unlocked ? "débloqué" : "verrouillé"}
                  {s.autoUnlock && " (auto)"}
                  {s.explicitlyUnlocked && s.source && ` · source: ${s.source}`}
                </span>
              </div>

              <span
                className={
                  "admin-character-skills__badge" +
                  (s.unlocked
                    ? " admin-character-skills__badge--on"
                    : " admin-character-skills__badge--off")
                }
              >
                {s.unlocked ? "✓" : "✕"}
              </span>

              <div className="admin-character-skills__actions">
                {s.explicitlyUnlocked ? (
                  <button
                    type="button"
                    className="admin-character-skills__btn admin-character-skills__btn--lock"
                    onClick={() => void mutate("admin:lock_skill", s.key)}
                    disabled={busy}
                    title="Retire uniquement le déverrouillage explicite de ce personnage"
                  >
                    Verrouiller
                  </button>
                ) : s.autoUnlock ? (
                  <span className="admin-character-skills__auto">disponible automatiquement</span>
                ) : (
                  <button
                    type="button"
                    className="admin-character-skills__btn admin-character-skills__btn--unlock"
                    onClick={() => void mutate("admin:unlock_skill", s.key, { source: "admin" })}
                    disabled={busy}
                  >
                    Débloquer
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
