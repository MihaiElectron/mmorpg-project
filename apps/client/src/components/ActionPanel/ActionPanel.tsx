import { useEffect, useRef, useState } from "react";
import { useActionPanelStore } from "../../store/actionPanel.store";
import { useCharacterStore } from "../../store/character.store";
import { getAdminStore } from "../../store/admin.store";
import { parseCommand } from "../../phaser/admin/commandParser";
import { commandRegistry, autocompleteCommand } from "../../phaser/admin/commandRegistry";
import HealthBar from "../HealthBar/HealthBar";
import { getDevToolsSocket, getWorldScene } from "../DevTools/devtoolsBridge";

type ConsoleLine = { text: string; ok: boolean };

function decodeJwtRole(token: string): string | null {
  try { return JSON.parse(atob(token.split(".")[1]))?.role ?? null; }
  catch { return null; }
}

function getTemplateKeys(): string[] {
  try {
    const store = (window as any).__GLOBAL_ADMIN_STORE__;
    return store?.getState?.()?.templates?.map((t: any) => t.key) ?? [];
  } catch { return []; }
}

export default function ActionPanel() {
  const isOpen            = useActionPanelStore((s) => s.isOpen);
  const target            = useActionPanelStore((s) => s.target);
  const actions           = useActionPanelStore((s) => s.actions);
  const overlappingTargets = useActionPanelStore((s) => s.overlappingTargets);
  const closePanel        = useActionPanelStore((s) => s.closePanel);
  const selectOverlapTarget = useActionPanelStore((s) => s.selectOverlapTarget);
  const character         = useCharacterStore((s) => s.character);

  const panelRef       = useRef<HTMLDivElement>(null);
  const consoleInputRef = useRef<HTMLInputElement>(null);

  const [command, setCommand]   = useState("");
  const [results, setResults]   = useState<ConsoleLine[]>([]);

  const token   = localStorage.getItem("token") ?? "";
  const isAdmin = decodeJwtRole(token) === "admin";
  const hasOverlap = overlappingTargets.length > 1;

  // ── Fermeture au clic extérieur (sauf canvas Phaser) ─────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "CANVAS") return;
      if (panelRef.current && !panelRef.current.contains(t)) closePanel();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [closePanel]);

  // ── Focus + pré-remplissage console ──────────────────────────────────────
  useEffect(() => {
    if (isOpen && isAdmin) setTimeout(() => consoleInputRef.current?.focus(), 0);
  }, [isOpen, isAdmin]);

  useEffect(() => {
    if (isAdmin && hasOverlap) {
      setCommand("/select ");
      setTimeout(() => consoleInputRef.current?.focus(), 0);
    } else {
      setCommand("");
    }
  }, [isAdmin, hasOverlap, target?.id]);

  // ── Gestion du focus → store admin + désactivation capture clavier Phaser ─
  function getPhaserKeyboard() {
    return getWorldScene()?.input?.keyboard;
  }

  function onFocus() {
    getAdminStore().getState().setConsoleActive(true);
    getPhaserKeyboard()?.disableGlobalCapture();
  }

  function onBlur() {
    getAdminStore().getState().setConsoleActive(false);
    getPhaserKeyboard()?.enableGlobalCapture();
  }

  // ── Exécution de commande ─────────────────────────────────────────────────
  async function runCommand(raw: string) {
    const parsed = parseCommand(raw.trim());
    if (!parsed) {
      pushResult("Syntaxe invalide — commencez par '/'.", false);
      return;
    }

    const def = commandRegistry[parsed.name];
    if (!def) {
      const matches = autocompleteCommand(parsed.name);
      const hint = matches.length ? ` Vouliez-vous dire : ${matches.join(", ")} ?` : "";
      pushResult(`Commande "${parsed.name}" inconnue.${hint}`, false);
      return;
    }

    if (def.destructive && parsed.flags["confirm"] !== "true") {
      pushResult(`Commande destructive — ajoutez --confirm pour l'exécuter.`, false);
      return;
    }

    const socket = getDevToolsSocket();
    if (!socket?.connected) {
      pushResult("Erreur : socket non connecté.", false);
      return;
    }

    const ctx = {
      socket,
      token,
      getTarget: () => target,
      getCharacterPos: () =>
        character ? { x: character.positionX ?? 400, y: character.positionY ?? 300 } : null,
      getLastClickedPos: () => getAdminStore().getState().lastClickedPos,
      getTemplateKeys,
    };

    const result = await def.handler(parsed.args, parsed.flags, ctx);
    pushResult(result.message, result.success);
    getAdminStore().getState().addToHistory(raw.trim());
  }

  function pushResult(text: string, ok: boolean) {
    setResults((prev) => [{ text, ok }, ...prev].slice(0, 5));
  }

  // ── Gestion clavier console ───────────────────────────────────────────────
  async function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = command.trim();
      if (!cmd) return;
      setCommand("");
      await runCommand(cmd);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = getAdminStore().getState().navigateHistory("up", command);
      setCommand(prev);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = getAdminStore().getState().navigateHistory("down", command);
      setCommand(next);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const parts = command.split(/\s+/);
      if (parts.length === 1 && parts[0].startsWith("/")) {
        const suggestions = autocompleteCommand(parts[0].slice(1));
        if (suggestions.length === 1) {
          setCommand(suggestions[0] + " ");
        } else if (suggestions.length > 1) {
          pushResult(`Suggestions : ${suggestions.join("  ")}`, true);
        }
      }
      return;
    }

    if (e.key === "Escape") {
      closePanel();
    }
  }

  // ── Suppression admin ─────────────────────────────────────────────────────
  function handleAdminDelete() {
    const socket = getDevToolsSocket();
    if (!socket?.connected || !target) return;

    const event = target.kind === "animal" ? "admin:delete_animal" : "admin:delete_resource";
    socket.emit(event, { id: target.id }, (res: any) => {
      if (!res?.success) console.warn("[admin delete]", res?.message);
    });
    closePanel();
  }

  // ── Actions gameplay ──────────────────────────────────────────────────────
  function handleAction(action: string) {
    const socket = getDevToolsSocket();
    if (!socket?.connected || !character?.id) { closePanel(); return; }

    if (target?.kind === "animal") {
      const scene = getWorldScene();
      if (scene?.startAutoAttack) scene.startAutoAttack(target.id);
    } else {
      socket.emit("interact_resource", { targetId: target!.id, characterId: character.id });
    }
    closePanel();
  }

  if (!isOpen || !target) return null;

  return (
    <div className="action-panel" ref={panelRef}>
      <div className="action-panel__title">
        {target.type.replace(/_/g, " ").toUpperCase()}
      </div>

      {target.kind === "animal" &&
        target.health != null &&
        target.maxHealth != null && (
          <HealthBar health={target.health} maxHealth={target.maxHealth} />
        )}

      {isAdmin && (
        <div className="action-panel__console">
          {hasOverlap && (
            <div className="action-panel__overlap">
              <span className="action-panel__overlap-label">Superposés :</span>
              <select
                className="action-panel__overlap-select"
                value={target.id}
                onChange={(e) => { selectOverlapTarget(e.target.value); setCommand(""); }}
              >
                {overlappingTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.type.replace(/_/g, " ")} ({t.kind})
                  </option>
                ))}
              </select>
            </div>
          )}

          {results.length > 0 && (
            <div className="action-panel__console-results">
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`action-panel__console-result action-panel__console-result--${r.ok ? "ok" : "err"}`}
                >
                  {r.text}
                </div>
              ))}
            </div>
          )}

          <div className="action-panel__console-input">
            <span className="action-panel__console-prefix">&gt;</span>
            <input
              ref={consoleInputRef}
              className="action-panel__console-field"
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
              onBlur={onBlur}
              placeholder={hasOverlap ? "/select <index>" : "/spawn goblin  /tp x y  /help"}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      )}

      {target.kind !== "player" && (
        <div className="action-panel__actions">
          {actions.map((action) => (
            <button
              key={action}
              className="action-panel__button"
              onClick={() => handleAction(action)}
            >
              {action}
            </button>
          ))}
          {isAdmin && (
            <button
              className="action-panel__button action-panel__button--danger"
              onClick={() => handleAdminDelete()}
            >
              supprimer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
