export interface ItemCatalogEntry {
  id: string;
  name: string;
  type: string;
  category: string;
  image: string | null;
}

export interface ItemEditorDraft {
  name: string;
  type: string;
  category: string;
  image: string;
}

export type ItemEditorPatch = Partial<ItemEditorDraft>;
