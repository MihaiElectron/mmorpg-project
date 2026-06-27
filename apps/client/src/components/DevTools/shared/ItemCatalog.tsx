import type { ItemCatalogEntry } from "../modules/Items/itemEditor.types";
import "./ItemCatalog.scss";

type SearchInputHandlers = {
  onFocus?: () => void;
  onBlur?: () => void;
};

type ItemCatalogProps = {
  items: ItemCatalogEntry[];
  query: string;
  onQueryChange: (query: string) => void;
  onAdd: (item: ItemCatalogEntry) => void;
  disabledItemIds?: Set<string>;
  addLabel?: string;
  searchInputHandlers?: SearchInputHandlers;
};

export function itemMatchesQuery(item: ItemCatalogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.type, item.category, item.id]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(q));
}

export function ItemIcon({
  item,
  className = "",
}: {
  item: Pick<ItemCatalogEntry, "name" | "image"> | null;
  className?: string;
}) {
  return (
    <span className={`item-catalog__icon ${className}`.trim()}>
      {item?.image ? (
        <img src={item.image} alt={item.name} className="item-catalog__img" />
      ) : (
        <span className="item-catalog__empty" aria-hidden="true" />
      )}
    </span>
  );
}

export function ItemCatalog({
  items,
  query,
  onQueryChange,
  onAdd,
  disabledItemIds = new Set(),
  addLabel = "Ajouter",
  searchInputHandlers,
}: ItemCatalogProps) {
  const filteredItems = items.filter((item) => itemMatchesQuery(item, query));

  return (
    <div className="item-catalog">
      <input
        className="item-catalog__search"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Recherche item"
        aria-label="Rechercher un item"
        {...searchInputHandlers}
      />
      <div className="item-catalog__list">
        {filteredItems.length === 0 ? (
          <p className="item-catalog__empty-text">Aucun item.</p>
        ) : (
          filteredItems.map((item) => {
            const disabled = disabledItemIds.has(item.id);
            return (
              <div key={item.id} className="item-catalog__row">
                <ItemIcon item={item} />
                <span className="item-catalog__copy">
                  <span className="item-catalog__name">{item.name}</span>
                  <span className="item-catalog__meta">
                    {item.type} / {item.category}
                  </span>
                </span>
                <button
                  className="item-catalog__add"
                  type="button"
                  disabled={disabled}
                  onClick={() => onAdd(item)}
                >
                  {disabled ? "Ajouté" : addLabel}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
