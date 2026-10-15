import { useEffect, useRef, useState } from "react";
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

// Page transitions to pick from (temporary, on the Settings page; see
// index.css for how each looks). The choice is kept in this browser.
export const TRANSITIONS = [
  { id: "rise", label: "Fade and rise" },
  { id: "slide", label: "Slide" },
  { id: "zoom", label: "Zoom" },
  { id: "fade", label: "Crossfade" },
  { id: "none", label: "None" },
] as const;
export type Transition = (typeof TRANSITIONS)[number]["id"];

export function getTransition(): Transition {
  try {
    const saved = localStorage.getItem("peek:transition");
    return TRANSITIONS.find((t) => t.id === saved)?.id ?? "rise";
  } catch {
    return "rise";
  }
}

export function setTransition(transition: Transition) {
  document.documentElement.dataset.transition = transition;
  try {
    localStorage.setItem("peek:transition", transition);
  } catch {
    // Not kept, but still used until the page reloads.
  }
}
document.documentElement.dataset.transition = getTransition();

// How deep a page is, so a slide goes forward into a collection and its later
// tabs, and back out of them.
const depth = (r: Route) =>
  r.page === "categories" ? 0 : r.page === "settings" ? 1 : 1 + (CATEGORY_TABS.indexOf(r.tab) + 1) / 10;

// Waits (briefly) for the new page to load its data, so a transition goes
// from one finished page to the next instead of to a spinner.
const loaded = async () => {
  for (let waited = 0; waited < 400 && document.querySelector("main [data-slot=spinner]"); waited += 20) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  const current = useRef(route);
  useEffect(() => {
    // The browser's view transition animates from the old page to the new
    // one (see index.css); without it, the page just changes.
    const onChange = () => {
      const next = parse(window.location.hash);
      document.documentElement.dataset.direction = depth(next) < depth(current.current) ? "back" : "forward";
      current.current = next;
      const update = () => flushSync(() => setRoute(next));
      if (!document.startViewTransition || document.documentElement.dataset.transition === "none") return update();
      // A transition cut short by the next page change is skipped; that's fine.
      document.startViewTransition(async () => {
        update();
        await loaded();
      }).ready.catch(() => {});
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const go = (hash: string) => {
  window.location.hash = hash;
};
