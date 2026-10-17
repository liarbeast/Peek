import { useEffect, useState } from "react";

// A tiny hash router: "#/" is the category list, "#/categories/3" a category
// (with its tab after it, as in "#/categories/3/style"), "#/settings" the
// frame's settings (with its tab after it, as in "#/settings/firmware").
export const CATEGORY_TABS = ["items", "fields", "style", "settings"] as const;
export type CategoryTab = (typeof CATEGORY_TABS)[number];
export const SETTINGS_TABS = ["general", "firmware"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export type Route =
  | { page: "categories" }
  | { page: "category"; id: number; tab: CategoryTab }
  | { page: "settings"; tab: SettingsTab };

function parse(hash: string): Route {
  const settings = hash.match(/^#\/settings(?:\/(\w+))?/);
  if (settings) return { page: "settings", tab: SETTINGS_TABS.find((t) => t === settings[1]) ?? "general" };
  const match = hash.match(/^#\/categories\/(\d+)(?:\/(\w+))?/);
  if (!match) return { page: "categories" };
  const tab = CATEGORY_TABS.find((t) => t === match[2]) ?? "items";
  return { page: "category", id: Number(match[1]), tab };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const go = (hash: string) => {
  window.location.hash = hash;
};
