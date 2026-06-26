import { useEffect, useMemo, useState } from "react";
import { fetchItems, updateItem } from "./itemEditorApi";
import {
  ALL_FILTER,
  buildItemPatch,
  draftFromItem,
  filterItems,
  isValidItemDraft,
  uniqueSorted,
} from "./itemEditorFilters";
import type { ItemCatalogEntry, ItemEditorDraft } from "./itemEditor.types";
import "./ItemsModule.scss";

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function emptyDraft(): ItemEditorDraft {
  return { name: "", type: "", category: "", image: "" };
}

export default function ItemsModule() {
  const [items, setItems] = useState<ItemCatalogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemEditorDraft>(emptyDraft);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER);
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTER);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    fetchItems()
      .then((data) => {
        if (!mounted) return;
        setItems(data);
        setSelectedId((current) => current ?? data[0]?.id ?? null);
        setStatus("loaded");
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setMessage(err.message);
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    setDraft(selectedItem ? draftFromItem(selectedItem) : emptyDraft());
    setMessage(null);
  }, [selectedItem?.id]);

  const typeOptions = useMemo(
    () => uniqueSorted(items.map((item) => item.type)),
    [items],
  );
  const categoryOptions = useMemo(
    () => uniqueSorted(items.map((item) => item.category)),
    [items],
  );
  const filteredItems = useMemo(
    () => filterItems(items, query, typeFilter, categoryFilter),
    [items, query, typeFilter, categoryFilter],
  );
  const patch = selectedItem ? buildItemPatch(selectedItem, draft) : {};
  const dirty = Object.keys(patch).length > 0;
  const valid = isValidItemDraft(draft);

  function updateDraft(key: keyof ItemEditorDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!selectedItem || !dirty || !valid) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateItem(selectedItem.id, patch);
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedId(updated.id);
      setDraft(draftFromItem(updated));
      setMessage("Item sauvegardé.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="item-editor" aria-label="Item Editor DevTools module">
      <div className="item-editor__header">
        <h3 className="item-editor__title">Item Editor</h3>
        <span className="item-editor__count">
          {items.length} item{items.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="item-editor__toolbar">
        <input
          className="item-editor__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Recherche"
          aria-label="Rechercher un item"
        />
        <select
          className="item-editor__filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filtrer par type"
        >
          <option value={ALL_FILTER}>Tous types</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select
          className="item-editor__filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filtrer par category"
        >
          <option value={ALL_FILTER}>Toutes catégories</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {status === "error" && (
        <p className="item-editor__status item-editor__status--error">
          {message ?? "Impossible de charger les items."}
        </p>
      )}

      {status === "loading" && (
        <p className="item-editor__status">Chargement…</p>
      )}

      {status === "loaded" && (
        <div className="item-editor__body">
          <div className="item-editor__list" aria-label="Items">
            {filteredItems.length === 0 ? (
              <p className="item-editor__status">Aucun résultat.</p>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    "item-editor__row" +
                    (item.id === selectedId
                      ? " item-editor__row--selected"
                      : "")
                  }
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="item-editor__row-icon">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="item-editor__row-img"
                      />
                    ) : (
                      <span
                        className="item-editor__row-empty"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="item-editor__row-main">
                    <span className="item-editor__row-name">{item.name}</span>
                    <span className="item-editor__row-meta">
                      {item.type} / {item.category}
                    </span>
                  </span>
                  <span className="item-editor__row-id">
                    {shortId(item.id)}
                  </span>
                </button>
              ))
            )}
          </div>

          <form
            className="item-editor__form"
            onSubmit={(e) => e.preventDefault()}
          >
            {selectedItem ? (
              <>
                <div className="item-editor__preview">
                  <div className="item-editor__preview-icon">
                    {draft.image.trim() ? (
                      <img
                        src={draft.image.trim()}
                        alt={draft.name || selectedItem.name}
                        className="item-editor__preview-img"
                      />
                    ) : (
                      <span className="item-editor__preview-empty">∅</span>
                    )}
                  </div>
                  <div className="item-editor__preview-copy">
                    <span className="item-editor__preview-name">
                      {selectedItem.name}
                    </span>
                    <span className="item-editor__preview-id">
                      {selectedItem.id}
                    </span>
                  </div>
                </div>

                <label className="item-editor__field">
                  <span className="item-editor__label">Name</span>
                  <input
                    className="item-editor__input"
                    value={draft.name}
                    onChange={(e) => updateDraft("name", e.target.value)}
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Type</span>
                  <input
                    className="item-editor__input"
                    value={draft.type}
                    onChange={(e) => updateDraft("type", e.target.value)}
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Category</span>
                  <input
                    className="item-editor__input"
                    value={draft.category}
                    onChange={(e) => updateDraft("category", e.target.value)}
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Image</span>
                  <input
                    className="item-editor__input"
                    value={draft.image}
                    onChange={(e) => updateDraft("image", e.target.value)}
                    placeholder="/assets/images/items/wooden_stick.png"
                  />
                </label>

                <div className="item-editor__actions">
                  {message && (
                    <span
                      className={
                        "item-editor__message" +
                        (message.includes("Erreur")
                          ? " item-editor__message--error"
                          : "")
                      }
                    >
                      {message}
                    </span>
                  )}
                  <button
                    className="item-editor__save"
                    type="button"
                    onClick={handleSave}
                    disabled={!dirty || !valid || saving}
                  >
                    {saving ? "…" : "Sauver"}
                  </button>
                </div>
              </>
            ) : (
              <p className="item-editor__status">Aucun item sélectionné.</p>
            )}
          </form>
        </div>
      )}
    </section>
  );
}
