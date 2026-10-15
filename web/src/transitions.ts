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
  {
    id: "slide-up",
    label: "Slide up",
    variants: {
      enter: (dir: number) => ({ opacity: 0, y: 32 * dir }),
      shown: { opacity: 1, y: 0 },
      exit: (dir: number) => ({ opacity: 0, y: -32 * dir }),
    },
  },
  {
    id: "push",
    label: "Push (full width)",
    variants: {
      enter: (dir: number) => ({ x: `${100 * dir}%` }),
      shown: { x: 0, transition: { duration: 0.3, ease: [0.3, 0.7, 0.2, 1] } },
      exit: (dir: number) => ({ x: `${-100 * dir}%`, transition: { duration: 0.2, ease: "easeIn" } }),
    },
  },
  {
    id: "spring",
    label: "Springy slide",
    variants: {
      enter: (dir: number) => ({ opacity: 0, x: 60 * dir }),
      shown: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 420, damping: 26 } },
      exit: (dir: number) => ({ opacity: 0, x: -30 * dir, transition: { duration: 0.12 } }),
    },
  },
  {
    id: "blur",
    label: "Blur",
    variants: {
      enter: { opacity: 0, filter: "blur(8px)" },
      shown: { opacity: 1, filter: "blur(0px)" },
      exit: { opacity: 0, filter: "blur(8px)" },
    },
  },
  {
    id: "zoom-out",
    label: "Zoom out",
    variants: {
      enter: { opacity: 0, scale: 1.04 },
      shown: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.96 },
    },
  },
  {
    id: "drop",
    label: "Drop in",
    variants: {
      enter: { opacity: 0, y: -24 },
      shown: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 22 } },
      exit: { opacity: 0, y: 12, transition: { duration: 0.12 } },
    },
  },
  {
    id: "flip",
    label: "Flip",
    variants: {
      enter: (dir: number) => ({ opacity: 0, rotateY: 70 * dir, transformPerspective: 1200 }),
      shown: { opacity: 1, rotateY: 0, transformPerspective: 1200, transition: { duration: 0.35 } },
      exit: (dir: number) => ({ opacity: 0, rotateY: -70 * dir, transformPerspective: 1200 }),
    },
  },
  {
    id: "tilt",
    label: "Tilt",
    variants: {
      enter: { opacity: 0, rotateX: -12, y: -12, transformPerspective: 900, originY: 0 },
      shown: { opacity: 1, rotateX: 0, y: 0, transformPerspective: 900, originY: 0 },
      exit: { opacity: 0, rotateX: 8, transformPerspective: 900, originY: 0 },
    },
  },
  {
    id: "skew",
    label: "Skew",
    variants: {
      enter: (dir: number) => ({ opacity: 0, x: 30 * dir, skewX: -6 * dir }),
      shown: { opacity: 1, x: 0, skewX: 0 },
      exit: (dir: number) => ({ opacity: 0, x: -30 * dir, skewX: 6 * dir }),
    },
  },
  {
    id: "wipe",
    label: "Wipe",
    variants: {
      enter: (dir: number) => ({ clipPath: dir > 0 ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)" }),
      shown: { clipPath: "inset(0 0% 0 0%)", transition: { duration: 0.35, ease: [0.6, 0, 0.2, 1] } },
      exit: { opacity: 0, transition: { duration: 0.1 } },
    },
  },
  {
    id: "circle",
    label: "Circle reveal",
    variants: {
      enter: { clipPath: "circle(0% at 50% 30%)" },
      shown: { clipPath: "circle(150% at 50% 30%)", transition: { duration: 0.45, ease: [0.6, 0, 0.2, 1] } },
      exit: { opacity: 0, transition: { duration: 0.1 } },
    },
  },
  {
    id: "curtain",
    label: "Curtain",
    variants: {
      enter: { clipPath: "inset(0 0 100% 0)", y: -8 },
      shown: { clipPath: "inset(0 0 0% 0)", y: 0, transition: { duration: 0.35, ease: [0.6, 0, 0.2, 1] } },
      exit: { clipPath: "inset(100% 0 0 0)", transition: { duration: 0.2, ease: "easeIn" } },
    },
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
