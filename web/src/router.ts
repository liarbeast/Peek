import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

// A tiny hash router: "#/" is the category list, "#/categories/3" a category
// (with its tab after it, as in "#/categories/3/style"), "#/settings" the
// frame's settings.
export const CATEGORY_TABS = ["items", "fields", "style", "settings"] as const;
export type CategoryTab = (typeof CATEGORY_TABS)[number];

export type Route =
  | { page: "categories" }
  | { page: "category"; id: number; tab: CategoryTab }
  | { page: "settings" };

function parse(hash: string): Route {
  if (hash.startsWith("#/settings")) return { page: "settings" };
  const match = hash.match(/^#\/categories\/(\d+)(?:\/(\w+))?/);
  if (!match) return { page: "categories" };
  const tab = CATEGORY_TABS.find((t) => t === match[2]) ?? "items";
  return { page: "category", id: Number(match[1]), tab };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    // The browser's view transition fades from the old page to the new one
    // (see index.css); without it, the page just changes.
    const onChange = () => {
      const update = () => flushSync(() => setRoute(parse(window.location.hash)));
      if (document.startViewTransition) document.startViewTransition(update);
      else update();
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const go = (hash: string) => {
  window.location.hash = hash;
};
