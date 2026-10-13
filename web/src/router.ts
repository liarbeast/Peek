import { useEffect, useState } from "react";

// A tiny hash router: "#/" is the category list, "#/categories/3" a category,
// "#/settings" the frame's settings.
export type Route = { page: "categories" } | { page: "category"; id: number } | { page: "settings" };

function parse(hash: string): Route {
  if (hash.startsWith("#/settings")) return { page: "settings" };
  const match = hash.match(/^#\/categories\/(\d+)/);
  return match ? { page: "category", id: Number(match[1]) } : { page: "categories" };
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
