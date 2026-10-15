import type { Variants } from "motion/react";
import { CATEGORY_TABS, type Route } from "./router";

// Page transitions to pick from (temporary, on the Settings page): how the
// old page leaves and the new one comes in, as motion variants. `custom` is
// the direction: 1 going deeper (into a collection, or the Settings page),
// -1 going back out.
export const TRANSITIONS: { id: string; label: string; variants: Variants }[] = [
  {
    id: "rise",
    label: "Fade and rise",
    variants: {
      enter: { opacity: 0, y: 8 },
      shown: { opacity: 1, y: 0 },
      exit: { opacity: 0 },
    },
  },
  {
    id: "slide",
    label: "Slide",
    variants: {
      enter: (dir: number) => ({ opacity: 0, x: 40 * dir }),
      shown: { opacity: 1, x: 0 },
      exit: (dir: number) => ({ opacity: 0, x: -40 * dir }),
    },
  },
  {
    id: "zoom",
    label: "Zoom",
    variants: {
      enter: { opacity: 0, scale: 0.97 },
      shown: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 1.01 },
    },
  },
  {
    id: "fade",
    label: "Fade",
    variants: { enter: { opacity: 0 }, shown: { opacity: 1 }, exit: { opacity: 0 } },
  },
  { id: "none", label: "None", variants: {} },
];

const KEY = "peek:transition";

export function getTransition(): string {
  try {
    const saved = localStorage.getItem(KEY);
    return TRANSITIONS.some((t) => t.id === saved) ? saved! : "rise";
  } catch {
    return "rise";
  }
}

// Keeps the choice in this browser and tells the app it changed.
export function setTransition(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Not kept, but used until the page reloads.
  }
  window.dispatchEvent(new CustomEvent("peek:transition", { detail: id }));
}

// How deep a page is, so a slide goes one way into a collection and its later
// tabs and the other way back out.
export const depth = (r: Route) =>
  r.page === "categories" ? 0 : r.page === "settings" ? 1 : 1 + (CATEGORY_TABS.indexOf(r.tab) + 1) / 10;
