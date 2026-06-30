import { useCallback, useEffect, useRef, useState } from "react";
const API = (import.meta as any).env?.VITE_API_URL as string ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssetNode {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  mime?: string;
  children?: AssetNode[];
}

const IMAGE_MIMES = new Set(["image/png", "image/webp", "image/jpeg", "image/gif"]);

function isImage(node: AssetNode): boolean {
  return node.type === "file" && !!node.mime && IMAGE_MIMES.has(node.mime);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

function flattenFiles(nodes: AssetNode[]): AssetNode[] {
  const result: AssetNode[] = [];
  for (const n of nodes) {
    if (n.type === "file") result.push(n);
    else if (n.children) result.push(...flattenFiles(n.children));
  }
  return result;
}

// ── ImageDimensions ───────────────────────────────────────────────────────────

function useImageDimensions(src: string | null): { w: number; h: number } | null {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!src) { setDims(null); return; }
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setDims(null);
    img.src = src;
  }, [src]);
  return dims;
}

// ── AssetNode list item ───────────────────────────────────────────────────────

function NodeRow({
  node,
  onNavigate,
  onSelect,
  selected,
}: {
  node: AssetNode;
  onNavigate?: (node: AssetNode) => void;
  onSelect?: (node: AssetNode) => void;
  selected: boolean;
}) {
  if (node.type === "directory") {
    return (
      <button
        className="asset-picker__entry asset-picker__entry--dir"
        onClick={() => onNavigate?.(node)}
        type="button"
      >
        <span className="asset-picker__entry-icon">📁</span>
        <span className="asset-picker__entry-name">{node.name}</span>
      </button>
    );
  }

  return (
    <button
      className={`asset-picker__entry asset-picker__entry--file${selected ? " asset-picker__entry--selected" : ""}`}
      onClick={() => onSelect?.(node)}
      type="button"
    >
      {isImage(node) ? (
        <img className="asset-picker__entry-thumb" src={node.path} alt={node.name} loading="lazy" />
      ) : (
        <span className="asset-picker__entry-icon">📄</span>
      )}
      <span className="asset-picker__entry-name">{node.name}</span>
      {node.size != null && (
        <span className="asset-picker__entry-meta">{formatBytes(node.size)}</span>
      )}
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function AssetPickerModal({
  tree,
  category,
  value,
  onSelect,
  onClose,
}: {
  tree: AssetNode[];
  category?: string;
  value: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [stack, setStack] = useState<AssetNode[]>([]);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<AssetNode | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-navigate to category folder on open
  useEffect(() => {
    if (!category) return;
    const target = findFolder(tree, category);
    if (target) setStack([target]);
  }, [tree, category]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const dims = useImageDimensions(preview && isImage(preview) ? preview.path : null);

  const currentNodes: AssetNode[] = stack.length > 0
    ? (stack[stack.length - 1].children ?? [])
    : tree;

  const allFiles = flattenFiles(tree);
  const displayNodes = search.trim()
    ? allFiles.filter((n) => n.name.toLowerCase().includes(search.toLowerCase()))
    : currentNodes;

  function navigateUp() {
    setStack((s) => s.slice(0, -1));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="asset-picker__overlay" onKeyDown={handleKeyDown}>
      <div className="asset-picker__modal" role="dialog" aria-label="Sélecteur d'asset">

        {/* Header */}
        <div className="asset-picker__header">
          <span className="asset-picker__title">Parcourir les assets</span>
          <button className="asset-picker__close" onClick={onClose} type="button">✕</button>
        </div>

        {/* Search */}
        <div className="asset-picker__search-row">
          <input
            ref={searchRef}
            className="asset-picker__search"
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Breadcrumb */}
        {!search && (
          <div className="asset-picker__breadcrumb">
            <button
              className="asset-picker__crumb"
              onClick={() => setStack([])}
              disabled={stack.length === 0}
              type="button"
            >
              assets
            </button>
            {stack.map((node, i) => (
              <span key={node.path}>
                <span className="asset-picker__crumb-sep">/</span>
                <button
                  className="asset-picker__crumb"
                  onClick={() => setStack((s) => s.slice(0, i + 1))}
                  disabled={i === stack.length - 1}
                  type="button"
                >
                  {node.name}
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="asset-picker__body">
          {/* File list */}
          <div className="asset-picker__list">
            {!search && stack.length > 0 && (
              <button
                className="asset-picker__entry asset-picker__entry--up"
                onClick={navigateUp}
                type="button"
              >
                <span className="asset-picker__entry-icon">↩</span>
                <span className="asset-picker__entry-name">..</span>
              </button>
            )}

            {displayNodes.length === 0 && (
              <p className="asset-picker__empty">Aucun fichier trouvé.</p>
            )}

            {displayNodes.map((node) => (
              <NodeRow
                key={node.path}
                node={node}
                selected={node.path === value}
                onNavigate={(n) => { setStack((s) => [...s, n]); setSearch(""); }}
                onSelect={(n) => { setPreview(n); }}
              />
            ))}
          </div>

          {/* Preview panel */}
          <div className="asset-picker__preview">
            {preview ? (
              <>
                {isImage(preview) && (
                  <img
                    className="asset-picker__preview-img"
                    src={preview.path}
                    alt={preview.name}
                  />
                )}
                <div className="asset-picker__preview-info">
                  <span className="asset-picker__preview-name">{preview.name}</span>
                  <span className="asset-picker__preview-path">{preview.path}</span>
                  {preview.size != null && (
                    <span className="asset-picker__preview-meta">{formatBytes(preview.size)}</span>
                  )}
                  {dims && (
                    <span className="asset-picker__preview-meta">{dims.w} × {dims.h} px</span>
                  )}
                </div>
                <button
                  className="asset-picker__select-btn"
                  onClick={() => { onSelect(preview.path); onClose(); }}
                  type="button"
                >
                  Sélectionner
                </button>
              </>
            ) : (
              <p className="asset-picker__preview-hint">
                Cliquez sur un fichier pour le prévisualiser.
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function findFolder(nodes: AssetNode[], name: string): AssetNode | null {
  for (const n of nodes) {
    if (n.type === "directory") {
      if (n.name === name) return n;
      if (n.children) {
        const found = findFolder(n.children, name);
        if (found) return found;
      }
    }
  }
  return null;
}

// ── AssetPicker (bouton + modal) ──────────────────────────────────────────────

interface AssetPickerProps {
  /** Valeur actuelle — toujours un chemin public /assets/... */
  value: string;
  onChange: (path: string) => void;
  /** Dossier cible à pré-ouvrir (ex: "items", "sprites", "bestiary") */
  category?: string;
  /** Désactiver le picker */
  disabled?: boolean;
  className?: string;
}

export default function AssetPicker({ value, onChange, category, disabled = false, className = "" }: AssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState<AssetNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    if (tree) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token") ?? "";
      const url = `${API}/admin/assets/tree`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        let detail = "";
        try { const body = await r.json(); detail = body?.message ?? ""; } catch { /* ignore */ }
        throw new Error(`HTTP ${r.status}${detail ? ` — ${detail}` : ""}`);
      }
      setTree(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [tree]);

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    loadTree();
  }

  const name = value ? value.split("/").pop() : null;

  return (
    <div className={`asset-picker ${className}`.trim()}>
      <div className="asset-picker__field">
        {name && value && (
          isImage({ type: "file", name: name, path: value, mime: `image/${name.split(".").pop()}` } as AssetNode)
            ? <img className="asset-picker__inline-thumb" src={value} alt={name} />
            : <span className="asset-picker__inline-icon">📄</span>
        )}
        <span className="asset-picker__inline-path">{value || <em>Aucun asset</em>}</span>
        <button
          className="asset-picker__browse-btn"
          onClick={handleOpen}
          disabled={disabled}
          type="button"
        >
          Parcourir
        </button>
        {value && (
          <button
            className="asset-picker__clear-btn"
            onClick={() => onChange("")}
            disabled={disabled}
            type="button"
            title="Effacer"
          >
            ✕
          </button>
        )}
      </div>

      {error && <span className="asset-picker__error">{error}</span>}

      {open && (
        loading || !tree
          ? <div className="asset-picker__overlay"><div className="asset-picker__modal asset-picker__modal--loading">Chargement…</div></div>
          : (
            <AssetPickerModal
              tree={tree}
              category={category}
              value={value}
              onSelect={onChange}
              onClose={() => setOpen(false)}
            />
          )
      )}
    </div>
  );
}
