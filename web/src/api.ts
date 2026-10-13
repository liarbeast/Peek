// Typed calls to the Peek server.

export type ItemOrder = "in_order" | "random" | "shuffle";

export type Orientation = "landscape" | "portrait";

export interface Settings {
  orientation: Orientation;
}

export const isPortrait = (o: Orientation) => o === "portrait";

export interface Template {
  name: string;
  label: string;
  description: string;
  fields: Array<"image" | "title" | "subtitle" | "text">;
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
  item_count: number;
  cover: string | null;
}

export interface Item {
  id: number;
  category_id: number;
  position: number;
  title: string;
  subtitle: string;
  text: string;
  image: string | null;
  enabled: boolean;
  times_shown: number;
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

export const api = {
  templates: () => request<Template[]>("/api/templates"),
  settings: () => request<Settings>("/api/settings"),
  updateSettings: (body: Partial<Settings>) => request<Settings>("/api/settings", json("PATCH", body)),

  categories: () => request<Category[]>("/api/categories"),
  category: (id: number) => request<Category>(`/api/categories/${id}`),
  createCategory: (body: Partial<Category>) => request<Category>("/api/categories", json("POST", body)),
  updateCategory: (id: number, body: Partial<Category>) =>
    request<Category>(`/api/categories/${id}`, json("PATCH", body)),
  deleteCategory: (id: number) => request<void>(`/api/categories/${id}`, { method: "DELETE" }),

  previewCategory: (id: number, body: { template?: string; custom_css?: string; item_id?: number }) =>
    request<Blob>(`/api/categories/${id}/preview.png`, json("POST", body)),

  items: (categoryId: number) => request<Item[]>(`/api/categories/${categoryId}/items`),
  createItems: (categoryId: number, form: FormData) =>
    request<Item[]>(`/api/categories/${categoryId}/items`, { method: "POST", body: form }),
  updateItem: (id: number, form: FormData) => request<Item>(`/api/items/${id}`, { method: "PATCH", body: form }),
  deleteItem: (id: number) => request<void>(`/api/items/${id}`, { method: "DELETE" }),
  reorderItems: (categoryId: number, itemIds: number[]) =>
    request<void>(`/api/categories/${categoryId}/items/order`, json("PUT", { item_ids: itemIds })),

  previewItem: (id: number) => request<Blob>(`/api/items/${id}/preview.png`),
  showItem: (id: number) => request<Blob>(`/api/items/${id}/show`, { method: "POST" }),
  framePreview: () => request<Blob>(`/frame/preview.png?t=${Date.now()}`),
};
