import { useEffect, useMemo, useState } from "react";
import AssetPicker from "../../AssetPicker";
import ItemMaintenancePanel from "./ItemMaintenancePanel";
import { createItem, fetchItems, fetchItemUsageStats, updateItem } from "./itemEditorApi";
import {
  ALL_FILTER,
  buildItemCreateInput,
  buildItemPatch,
  describeRange,
  draftFromItem,
  filterItems,
  isRangeInvalid,
  isValidItemDraft,
  meleeRangeWarning,
  uniqueSorted,
} from "./itemEditorFilters";
import type {
  ItemCatalogEntry,
  ItemEditorDraft,
  ItemUsageRef,
  ItemUsageStats,
} from "./itemEditor.types";
import { EQUIPMENT_SLOTS, ITEM_CATEGORIES_BY_TYPE, ITEM_TYPES, OBJECT_MODES, WEAPON_TYPES } from "./itemEditor.types";
import { EQUIPMENT_STAT_FIELDS, emptyStatBonusesDraft } from "./equipmentItemEditor.helpers";
import { notifyItemDefinitionsChanged } from "./itemEvents";
import KeyValueRowsEditor from "../Skills/KeyValueRowsEditor";
import { fetchMasterySuggestions } from "../Skills/skillsApi";
import type { KeySuggestion } from "../Skills/skills.types";
import "./ItemsModule.scss";

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Champ "Range" d'arme : input entier >= 1 + aide de conversion px→WU→tuiles
 * + avertissement mêlée + blocage dur si invalide. Champ vide = portée par
 * défaut serveur (jamais transformé en 0).
 */
function RangeField({
  draft,
  onChange,
}: {
  draft: ItemEditorDraft;
  onChange: (value: string) => void;
}) {
  const desc = describeRange(draft.range);
  const invalid = isRangeInvalid(draft.range);
  const warning = meleeRangeWarning(draft);
  return (
    <label className="item-editor__field">
      <span className="item-editor__label">Range (px)</span>
      <input
        className="item-editor__input item-editor__input--num"
        type="number"
        min={1}
        step={1}
        value={draft.range}
        onChange={(e) => onChange(e.target.value)}
        placeholder="défaut serveur"
      />
      {desc && (
        <span className="item-editor__hint">
          {desc.px} px → {desc.wu} WU → {desc.tiles.toFixed(2)} tuile
        </span>
      )}
      {invalid && (
        <span className="item-editor__error">Range doit être un entier ≥ 1 (vide = défaut serveur).</span>
      )}
      {warning && <span className="item-editor__warning">{warning}</span>}
    </label>
  );
}

function emptyDraft(): ItemEditorDraft {
  return {
    name: "", type: "", category: "", image: "", objectMode: "STACKABLE", slot: "",
    attack: "", defense: "", range: "", weaponType: "",
    statBonuses: emptyStatBonusesDraft(), requiredLevel: "1", requiredClass: "",
    requiredMasteries: {},
  };
}

/**
 * Section « Équipement · Bonus · Prérequis » (Équipement V1-C-B). Édition des
 * données BRUTES uniquement : bonus de stats primaires (liste fixe), niveau,
 * classe (informatif) et maîtrises requises. Aucune stat dérivée calculée ici —
 * le serveur reste autoritaire et re-valide au save.
 */
function EquipmentFields({
  draft,
  onPatch,
  resetToken,
  masterySuggestions,
}: {
  draft: ItemEditorDraft;
  onPatch: (partial: Partial<ItemEditorDraft>) => void;
  resetToken: string;
  masterySuggestions: KeySuggestion[];
}) {
  return (
    <fieldset className="item-editor__equipment">
      <legend className="item-editor__equipment-legend">Équipement · Bonus · Prérequis</legend>

      <div className="item-editor__equipment-block">
        <span className="item-editor__equipment-title">Bonus de stats</span>
        <div className="item-editor__stat-grid">
          {EQUIPMENT_STAT_FIELDS.map((field) => (
            <label key={field.key} className="item-editor__stat-field">
              <span className="item-editor__stat-label">{field.label}</span>
              <input
                type="number"
                className="item-editor__input item-editor__stat-input"
                value={draft.statBonuses[field.key] ?? ""}
                onChange={(e) =>
                  onPatch({ statBonuses: { ...draft.statBonuses, [field.key]: e.target.value } })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="item-editor__equipment-block">
        <label className="item-editor__field">
          <span className="item-editor__label">Niveau requis</span>
          <input
            type="number"
            min={1}
            className="item-editor__input"
            value={draft.requiredLevel}
            onChange={(e) => onPatch({ requiredLevel: e.target.value })}
          />
        </label>

        <label className="item-editor__field">
          <span className="item-editor__label">Classe requise</span>
          <input
            type="text"
            className="item-editor__input"
            value={draft.requiredClass}
            onChange={(e) => onPatch({ requiredClass: e.target.value })}
          />
          <span className="item-editor__hint">
            Stockée mais non appliquée tant que le système de classe n&apos;existe pas.
          </span>
        </label>
      </div>

      <div className="item-editor__equipment-block">
        <span className="item-editor__equipment-title">Maîtrises requises</span>
        <KeyValueRowsEditor
          resetToken={resetToken}
          initial={draft.requiredMasteries}
          onChange={(record) => onPatch({ requiredMasteries: record })}
          suggestions={masterySuggestions}
          keyMode="select"
          integer
          keyPlaceholder="— maîtrise —"
          valuePlaceholder="niv."
        />
      </div>
    </fieldset>
  );
}

function hasGameplayUsage(stats: ItemUsageStats | null): boolean {
  if (!stats) return false;
  return (
    stats.totalQuantityServer > 0 ||
    stats.usedInResourceLootPools.length > 0 ||
    stats.usedInCreatureLootPools.length > 0 ||
    stats.usedInCraftRecipesOutput.length > 0 ||
    stats.usedInCraftRecipesIngredient.length > 0
  );
}

function usageLabel(ref: ItemUsageRef): string {
  if (ref.type) return ref.type;
  if (ref.key && ref.name) return `${ref.name} (${ref.key})`;
  if (ref.key) return ref.key;
  if (ref.name) return ref.name;
  return String(ref.id);
}

function UsageList({ items }: { items: ItemUsageRef[] }) {
  if (items.length === 0) {
    return <span className="item-editor__usage-empty">Aucun</span>;
  }
  return (
    <div className="item-editor__usage-list">
      {items.map((item) => (
        <span key={String(item.id)} className="item-editor__usage-chip">
          {usageLabel(item)}
        </span>
      ))}
    </div>
  );
}

export default function ItemsModule() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ItemCatalogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemEditorDraft>(emptyDraft);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<ItemEditorDraft>(emptyDraft);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER);
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTER);
  const [enabledFilter, setEnabledFilter] = useState<"all" | "active" | "disabled">("all");
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [usageStats, setUsageStats] = useState<ItemUsageStats | null>(null);
  const [usageStatus, setUsageStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  // Catalogue des maîtrises (select strict de requiredMasteries — V1-C-B fix).
  const [masterySuggestions, setMasterySuggestions] = useState<KeySuggestion[]>([]);

  useEffect(() => {
    void fetchMasterySuggestions().then(setMasterySuggestions).catch(() => {});
  }, []);

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
    setMaintenanceOpen(false);
  }, [selectedItem?.id]);

  useEffect(() => {
    if (!selectedItem) {
      setUsageStats(null);
      setUsageStatus("idle");
      return;
    }

    let mounted = true;
    setUsageStats(null);
    setUsageStatus("loading");
    fetchItemUsageStats(selectedItem.id)
      .then((stats) => {
        if (!mounted) return;
        setUsageStats(stats);
        setUsageStatus("loaded");
      })
      .catch(() => {
        if (!mounted) return;
        setUsageStatus("error");
      });

    return () => {
      mounted = false;
    };
  }, [selectedItem?.id]);

  const typeOptions = useMemo(
    () => uniqueSorted(items.map((item) => item.type)),
    [items],
  );
  const categoryOptions = useMemo(
    () => uniqueSorted(items.map((item) => item.category)),
    [items],
  );
  const filteredItems = useMemo(() => {
    const base = filterItems(items, query, typeFilter, categoryFilter);
    if (enabledFilter === "active") return base.filter((it) => it.enabled !== false);
    if (enabledFilter === "disabled") return base.filter((it) => it.enabled === false);
    return base;
  }, [items, query, typeFilter, categoryFilter, enabledFilter]);
  const patch = selectedItem ? buildItemPatch(selectedItem, draft) : {};
  const dirty = Object.keys(patch).length > 0;
  const valid = isValidItemDraft(draft) && !isRangeInvalid(draft.range);
  const createValid = isValidItemDraft(createDraft) && !isRangeInvalid(createDraft.range);
  const used = hasGameplayUsage(usageStats);

  function updateDraft(key: keyof ItemEditorDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateCreateDraft(key: keyof ItemEditorDraft, value: string) {
    setCreateDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleCreate() {
    if (!createValid) return;
    setCreating(true);
    setMessage(null);
    try {
      const created = await createItem(buildItemCreateInput(createDraft));
      const refreshed = await fetchItems();
      setItems(refreshed);
      setSelectedId(created.id);
      setCreateDraft(emptyDraft());
      setCreateOpen(false);
      setMessage("Item créé.");
      notifyItemDefinitionsChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur création.");
    } finally {
      setCreating(false);
    }
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
      notifyItemDefinitionsChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="item-editor" aria-label="Item Editor DevTools module">
      <div
        className="item-editor__header"
        onClick={() => setOpen((current) => !current)}
      >
        <h3 className="item-editor__title">
          <span aria-hidden="true">🎒</span>
          Item Editor
        </h3>
        <span className="item-editor__count">
          {items.length} item{items.length > 1 ? "s" : ""}
        </span>
        <span className="item-editor__chevron">{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <>
      <div className="item-editor__create-head">
        <button
          className="item-editor__create-toggle"
          type="button"
          onClick={() => setCreateOpen((current) => !current)}
        >
          <span className="item-editor__chevron">{createOpen ? "▼" : "▶"}</span>
          Créer item
        </button>
      </div>

      {createOpen && (
        <form
          className="item-editor__create-form"
          onSubmit={(e) => e.preventDefault()}
        >
          <label className="item-editor__field">
            <span className="item-editor__label">Name</span>
            <input
              className="item-editor__input"
              value={createDraft.name}
              onChange={(e) => updateCreateDraft("name", e.target.value)}
            />
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Type</span>
            <select
              className="item-editor__input"
              value={createDraft.type}
              onChange={(e) => updateCreateDraft("type", e.target.value)}
            >
              <option value="">— choisir —</option>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Category</span>
            <select
              className="item-editor__input"
              value={createDraft.category}
              onChange={(e) => updateCreateDraft("category", e.target.value)}
            >
              <option value="">— choisir —</option>
              {(ITEM_CATEGORIES_BY_TYPE[createDraft.type] ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Image</span>
            <AssetPicker
              value={createDraft.image}
              onChange={(path) => updateCreateDraft("image", path)}
              category="images"
            />
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">objectMode</span>
            <select
              className="item-editor__input"
              value={createDraft.objectMode}
              onChange={(e) => updateCreateDraft("objectMode", e.target.value)}
            >
              {OBJECT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Slot</span>
            <select
              className="item-editor__input"
              value={createDraft.slot}
              onChange={(e) => updateCreateDraft("slot", e.target.value)}
            >
              <option value="">— aucun —</option>
              {EQUIPMENT_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Attack</span>
            <input
              className="item-editor__input item-editor__input--num"
              type="number"
              value={createDraft.attack}
              onChange={(e) => updateCreateDraft("attack", e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Defense</span>
            <input
              className="item-editor__input item-editor__input--num"
              type="number"
              value={createDraft.defense}
              onChange={(e) => updateCreateDraft("defense", e.target.value)}
              placeholder="0"
            />
          </label>
          <RangeField draft={createDraft} onChange={(v) => updateCreateDraft("range", v)} />
          <label className="item-editor__field">
            <span className="item-editor__label">Type d&apos;arme</span>
            <select
              className="item-editor__input"
              value={createDraft.weaponType}
              onChange={(e) => updateCreateDraft("weaponType", e.target.value)}
            >
              <option value="">— aucun —</option>
              {WEAPON_TYPES.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </label>
          <EquipmentFields
            draft={createDraft}
            onPatch={(partial) => setCreateDraft((c) => ({ ...c, ...partial }))}
            resetToken="create"
            masterySuggestions={masterySuggestions}
          />
          <button
            className="item-editor__save"
            type="button"
            onClick={handleCreate}
            disabled={!createValid || creating}
          >
            {creating ? "…" : "Créer"}
          </button>
        </form>
      )}

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
        <select
          className="item-editor__filter"
          value={enabledFilter}
          onChange={(e) => setEnabledFilter(e.target.value as "all" | "active" | "disabled")}
          aria-label="Filtrer par état"
        >
          <option value="all">Tous états</option>
          <option value="active">Actifs</option>
          <option value="disabled">Désactivés</option>
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
                    <span className="item-editor__row-name">
                      {item.name}
                      {item.enabled === false && (
                        <span className="item-editor__row-badge">désactivé</span>
                      )}
                    </span>
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
                  <select
                    className="item-editor__input"
                    value={draft.type}
                    onChange={(e) => updateDraft("type", e.target.value)}
                  >
                    <option value="">— choisir —</option>
                    {ITEM_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Category</span>
                  <select
                    className="item-editor__input"
                    value={draft.category}
                    onChange={(e) => updateDraft("category", e.target.value)}
                  >
                    <option value="">— choisir —</option>
                    {(ITEM_CATEGORIES_BY_TYPE[draft.type] ?? []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Image</span>
                  <AssetPicker
                    value={draft.image}
                    onChange={(path) => updateDraft("image", path)}
                    category="images"
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">objectMode</span>
                  <select
                    className="item-editor__input"
                    value={draft.objectMode}
                    onChange={(e) => updateDraft("objectMode", e.target.value)}
                  >
                    {OBJECT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Slot</span>
                  <select
                    className="item-editor__input"
                    value={draft.slot}
                    onChange={(e) => updateDraft("slot", e.target.value)}
                  >
                    <option value="">— aucun —</option>
                    {EQUIPMENT_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Attack</span>
                  <input
                    className="item-editor__input item-editor__input--num"
                    type="number"
                    value={draft.attack}
                    onChange={(e) => updateDraft("attack", e.target.value)}
                    placeholder="0"
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Defense</span>
                  <input
                    className="item-editor__input item-editor__input--num"
                    type="number"
                    value={draft.defense}
                    onChange={(e) => updateDraft("defense", e.target.value)}
                    placeholder="0"
                  />
                </label>

                <RangeField draft={draft} onChange={(v) => updateDraft("range", v)} />

                <label className="item-editor__field">
                  <span className="item-editor__label">Type d&apos;arme</span>
                  <select
                    className="item-editor__input"
                    value={draft.weaponType}
                    onChange={(e) => updateDraft("weaponType", e.target.value)}
                  >
                    <option value="">— aucun —</option>
                    {WEAPON_TYPES.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </label>

                <EquipmentFields
                  draft={draft}
                  onPatch={(partial) => setDraft((c) => ({ ...c, ...partial }))}
                  resetToken={selectedId ?? "new"}
                  masterySuggestions={masterySuggestions}
                />

                <div className="item-editor__usage">
                  <div className="item-editor__usage-header">
                    <span className="item-editor__usage-title">
                      Utilisation
                    </span>
                    <span
                      className={
                        "item-editor__usage-badge" +
                        (used ? " item-editor__usage-badge--used" : "")
                      }
                    >
                      {used ? "Utilisé" : "Non utilisé"}
                    </span>
                  </div>

                  {usageStatus === "loading" && (
                    <p className="item-editor__status">Chargement usages…</p>
                  )}
                  {usageStatus === "error" && (
                    <p className="item-editor__status item-editor__status--error">
                      Impossible de charger les usages.
                    </p>
                  )}
                  {usageStatus === "loaded" && usageStats && (
                    <>
                      <div className="item-editor__usage-grid">
                        <div className="item-editor__usage-metric">
                          <span className="item-editor__usage-value">
                            {usageStats.totalQuantityServer}
                          </span>
                          <span className="item-editor__usage-label">
                            Quantité
                          </span>
                        </div>
                        <div className="item-editor__usage-metric">
                          <span className="item-editor__usage-value">
                            {usageStats.inventoryEntries}
                          </span>
                          <span className="item-editor__usage-label">
                            Piles
                          </span>
                        </div>
                        <div className="item-editor__usage-metric">
                          <span className="item-editor__usage-value">
                            {usageStats.uniqueCharacters}
                          </span>
                          <span className="item-editor__usage-label">
                            Joueurs
                          </span>
                        </div>
                      </div>

                      <div className="item-editor__usage-block">
                        <span className="item-editor__usage-label">
                          Ressources loot
                        </span>
                        <UsageList items={usageStats.usedInResourceLootPools} />
                      </div>
                      <div className="item-editor__usage-block">
                        <span className="item-editor__usage-label">
                          Créatures loot
                        </span>
                        <UsageList items={usageStats.usedInCreatureLootPools} />
                      </div>
                      <div className="item-editor__usage-block">
                        <span className="item-editor__usage-label">
                          Recettes output
                        </span>
                        <UsageList
                          items={usageStats.usedInCraftRecipesOutput}
                        />
                      </div>
                      <div className="item-editor__usage-block">
                        <span className="item-editor__usage-label">
                          Recettes ingrédient
                        </span>
                        <UsageList
                          items={usageStats.usedInCraftRecipesIngredient}
                        />
                      </div>
                    </>
                  )}
                </div>

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
                    className="item-editor__save item-editor__save--ghost"
                    type="button"
                    onClick={() => setMaintenanceOpen((v) => !v)}
                  >
                    {maintenanceOpen ? "Fermer maintenance" : "Usages / Maintenance"}
                  </button>
                  {dirty && (
                    <button
                      className="item-editor__save"
                      type="button"
                      onClick={handleSave}
                      disabled={!valid || saving}
                    >
                      {saving ? "…" : "Save"}
                    </button>
                  )}
                </div>

                {maintenanceOpen && (
                  <ItemMaintenancePanel
                    itemId={selectedItem.id}
                    itemName={selectedItem.name}
                    onChanged={async () => {
                      const refreshed = await fetchItems();
                      setItems(refreshed);
                      notifyItemDefinitionsChanged();
                    }}
                  />
                )}
              </>
            ) : (
              <p className="item-editor__status">Aucun item sélectionné.</p>
            )}
          </form>
        </div>
      )}
        </>
      )}
    </section>
  );
}
