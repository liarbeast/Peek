// Typed calls to the Peek server.

export type ItemOrder = "in_order" | "random" | "shuffle";

export type Orientation = "landscape" | "portrait";

export interface Settings {
  orientation: Orientation;
}

export const isPortrait = (o: Orientation) => o === "portrait";

export type FieldType = "text" | "image";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
}

// A field being edited: new fields get their key from the server.
export type FieldDraft = Omit<Field, "key"> & { key?: string };

export interface Template {
  name: string;
  label: string;
  description: string;
  fields: Field[];
  classes: string[];
}

export interface Category {
  id: number;
  name: string;
  template: string;
  custom_css: string;
  item_order: ItemOrder;
  weight: number;
  enabled: boolean;
  mono: boolean;
  pixelate: boolean;
  fields: Field[];
  item_count: number;
  cover: string | null;
}

export interface Item {
  id: number;
  category_id: number;
  position: number;
  data: Record<string, string>;
  enabled: boolean;
  times_shown: number;
}

export interface ImportColumn {
  name: string;
  field: string | null;
  type: FieldType;
  samples: string[];
}

// What to do with each CSV column: fill a field, add one, or skip it.
export type ImportTarget = { field: string } | { new: { label: string; type: FieldType } } | null;

export interface StyleChanges {
  template?: string;
  custom_css?: string;
  mono?: boolean;
  pixelate?: boolean;
  item_id?: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join(", ");
    } catch {
      // not JSON; keep the status text
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? res.json() : res.blob()) as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const imageUrl = (name: string) => `/images/${name}`;

export const FIELD_TYPES: Array<{ id: FieldType; label: string }> = [
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
];

// A one-line name and summary of an item, from its first fields.
export function describeItem(fields: Field[], item: Item): { title: string; detail: string; image: string | null } {
  const texts = fields.filter((f) => f.type !== "image").map((f) => item.data[f.key]).filter(Boolean);
  const imageField = fields.find((f) => f.type === "image" && item.data[f.key]);
  return {
    title: texts[0] ?? "Untitled",
    detail: texts.slice(1).join(" · "),
    image: imageField ? item.data[imageField.key] : null,
  };
}

export const api = {
  templates: () => request<Template[]>("/api/templates"),
  settings: () => request<Settings>("/api/settings"),
  updateSettings: (body: Partial<Settings>) => request<Settings>("/api/settings", json("PATCH", body)),

  categories: () => request<Category[]>("/api/categories"),
  category: (id: number) => request<Category>(`/api/categories/${id}`),
  createCategory: (body: Partial<Category> & { copy_from?: number }) =>
    request<Category>("/api/categories", json("POST", body)),
  updateCategory: (id: number, body: Partial<Omit<Category, "fields">> & { fields?: FieldDraft[] }) =>
    request<Category>(`/api/categories/${id}`, json("PATCH", body)),
  deleteCategory: (id: number) => request<void>(`/api/categories/${id}`, { method: "DELETE" }),

  previewCategory: (id: number, body: StyleChanges) =>
    request<Blob>(`/api/categories/${id}/preview.png`, json("POST", body)),

  items: (categoryId: number) => request<Item[]>(`/api/categories/${categoryId}/items`),
  // Form fields: "data" (JSON of text values), "image:<key>" files.
  createItem: (categoryId: number, form: FormData) =>
    request<Item>(`/api/categories/${categoryId}/items`, { method: "POST", body: form }),
  createItemsFromImages: (categoryId: number, form: FormData) =>
    request<Item[]>(`/api/categories/${categoryId}/items/images`, { method: "POST", body: form }),
  // Also "remove:<key>" to clear an image, and "enabled".
  updateItem: (id: number, form: FormData) => request<Item>(`/api/items/${id}`, { method: "PATCH", body: form }),
  deleteItem: (id: number) => request<void>(`/api/items/${id}`, { method: "DELETE" }),
  reorderItems: (categoryId: number, itemIds: number[]) =>
    request<void>(`/api/categories/${categoryId}/items/order`, json("PUT", { item_ids: itemIds })),

  previewItem: (id: number) => request<Blob>(`/api/items/${id}/preview.png`),
  showItem: (id: number) => request<Blob>(`/api/items/${id}/show`, { method: "POST" }),
  previewImport: (categoryId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ columns: ImportColumn[]; rows: number }>(`/api/categories/${categoryId}/import/preview`, {
      method: "POST",
      body: form,
    });
  },
  runImport: (categoryId: number, file: File, mapping: ImportTarget[]) => {
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    return request<{ created: number; images_failed: number; category: Category }>(
      `/api/categories/${categoryId}/import`,
      { method: "POST", body: form },
    );
  },

  framePreview: () => request<Blob>(`/frame/preview.png?t=${Date.now()}`),
};
