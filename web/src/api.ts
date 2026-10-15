// Typed calls to the Peek server.

export type ItemOrder = "in_order" | "random" | "shuffle";

export type Orientation = "landscape" | "portrait";

export type Refresh = "15m" | "30m" | "1h" | "3h" | "6h" | "12h" | "1d" | "1w";
export type CollectionOrder = "in_order" | "shuffle";
export type Switch = "30m" | "1h" | "8h" | "1d" | "1w" | "finished" | "1mo";

export interface Settings {
  orientation: Orientation;
  // How often the frame wakes for a new image.
  refresh: Refresh;
  switch: Switch; // how often the frame moves on to the next category
  collection_order: CollectionOrder; // which one it moves on to
}

export const isPortrait = (o: Orientation) => o === "portrait";

export type FieldType = "text" | "image";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  // Kept, with its values, but not drawn.
  hidden?: boolean;
}

// A field being edited: new fields get their key from the server.
export type FieldDraft = Omit<Field, "key"> & { key?: string };

export interface Template {
  name: string;
  label: string;
  description: string;
  fields: Field[];
}

// The six colours the panel can show.
export const PANEL_COLOURS = {
  black: "#000000",
  white: "#ffffff",
  yellow: "#ffff00",
  red: "#ff0000",
  blue: "#0000ff",
  green: "#00ff00",
} as const;
export type PanelColour = keyof typeof PANEL_COLOURS;

// Where a field or style image sits, in pixels of the upright page, and how it looks.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  size?: number; // text size in pixels; text is as tall as its lines, so `h` is for images
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  // Which way text grows with more lines: down from its top edge (the default),
  // up from its bottom edge, or both ways from its centre. y and h are the box
  // as last placed, so that edge stays put.
  grow?: "down" | "up" | "middle";
  z?: number; // higher is drawn in front
  weight?: number; // 100 (thin) to 900 (black); 400 is regular
  color?: PanelColour;
  font?: string; // one of api.fonts(); none is the built-in face (400 and 700)
  // Attached to another field (named `below` for history): drawn `gap` pixels
  // under where that field ends, or, on side "above", `gap` pixels over where it starts.
  below?: string;
  gap?: number;
  side?: "below" | "above";
}

// Per orientation, every field's box (and the style images that were moved).
export type Positions = Partial<Record<Orientation, Record<string, Box>>>;

// A render, and where each field was drawn on it: [x, y, width, height, font size].
export interface Preview {
  image: Blob;
  boxes: Record<string, [number, number, number, number, number]>;
}

export interface Category {
  id: number;
  name: string;
  template: string;
  item_order: ItemOrder;
  weight: number;
  enabled: boolean;
  mono: boolean;
  pixelate: boolean;
  positions: Positions;
  default_positions: Positions; // where fields go before anyone moves them
  fields: Field[];
  item_count: number;
  cover: string | null;
  source: Source | null;
  current?: boolean; // the collection the frame shows now (in the list of collections only)
  // On the current one: when the frame moves on, or how many items it shows first.
  next_switch?: { at: string } | { items_left: number };
  synced: string | null; // the day the source was last read, YYYY-MM-DD
}

// One value of a source's entries, going to an existing field or a new one.
export type SourceColumn = { path: string; field: string } | { path: string; new: { label: string; type: FieldType } };

export interface SourceInspection {
  lists: { path: string; count: number }[];
  items: string; // the list looked into
  // label and type are suggestions for when a value becomes a new field.
  values: { path: string; example: string; label: string; type: FieldType }[];
}

// Where a collection's items come from: a JSON address, read once a day.
// `items` and each field's entry are dotted paths into the response.
export interface Source {
  url: string;
  items: string;
  fields: Record<string, string>;
}

// An image drawn the same for every item of a category, such as a frame.
export interface CategoryImage {
  id: number;
  key: string; // its key in positions
  name: string;
  file: string;
  crisp: boolean; // drawn in solid colours like pixel art, instead of dithered like a photo
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
  mono?: boolean;
  pixelate?: boolean;
  positions?: Positions;
  item_id?: number;
}

// The server's explanation of a failed request, as an Error.
async function failure(res: Response): Promise<Error> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join(", ");
  } catch {
    // not JSON; keep the status text
  }
  return new Error(message);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw await failure(res);
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
  // What an address returns: its lists of entries, and the values in one entry.
  inspectSource: (url: string, items?: string) =>
    request<SourceInspection>("/api/sources/inspect", json("POST", { url, items })),
  // Connect a source and fetch it; the collection's fields become the ones the columns go to.
  connectSource: (id: number, body: { url: string; items: string; columns: SourceColumn[] }) =>
    request<{ created: number; category: Category }>(`/api/categories/${id}/source`, json("PUT", body)),
  deleteCategory: (id: number) => request<void>(`/api/categories/${id}`, { method: "DELETE" }),

  previewCategory: async (id: number, body: StyleChanges): Promise<Preview> => {
    const res = await fetch(`/api/categories/${id}/preview.png`, json("POST", body));
    if (!res.ok) throw await failure(res);
    return { image: await res.blob(), boxes: JSON.parse(res.headers.get("X-Peek-Boxes") ?? "{}") };
  },

  // Each Google Font on offer, with the weights it comes in.
  fonts: () => request<Record<string, number[]>>("/api/fonts"),
  categoryImages: (categoryId: number) => request<CategoryImage[]>(`/api/categories/${categoryId}/images`),
  addCategoryImage: (categoryId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<CategoryImage>(`/api/categories/${categoryId}/images`, { method: "POST", body: form });
  },
  updateCategoryImage: (id: number, body: { crisp: boolean }) =>
    request<CategoryImage>(`/api/category-images/${id}`, json("PATCH", body)),
  deleteCategoryImage: (id: number) => request<void>(`/api/category-images/${id}`, { method: "DELETE" }),

  items: (categoryId: number) => request<Item[]>(`/api/categories/${categoryId}/items`),
  // Form fields: "data" (JSON of text values), "image:<key>" files.
  createItem: (categoryId: number, form: FormData) =>
    request<Item>(`/api/categories/${categoryId}/items`, { method: "POST", body: form }),
  createItemsFromImages: (categoryId: number, form: FormData) =>
    request<Item[]>(`/api/categories/${categoryId}/items/images`, { method: "POST", body: form }),
  // Also "remove:<key>" to clear an image, and "enabled".
  updateItem: (id: number, form: FormData) => request<Item>(`/api/items/${id}`, { method: "PATCH", body: form }),
  deleteItem: (id: number) => request<void>(`/api/items/${id}`, { method: "DELETE" }),
  deleteAllItems: (categoryId: number) => request<void>(`/api/categories/${categoryId}/items`, { method: "DELETE" }),
  // The order the frame goes through collections in (and the home screen lists them).
  reorderCategories: (categoryIds: number[]) =>
    request<void>("/api/categories/reorder", json("POST", { category_ids: categoryIds })),
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
