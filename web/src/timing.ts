import type { Refresh, Switch } from "./api";

// A collection's Refresh and the frame's Switch collection choices.
// `short` is for tags, such as on the home screen's cards.
export const REFRESHES: { id: Refresh; label: string; short: string }[] = [
  { id: "15m", label: "Every 15 minutes", short: "Every 15 min" },
  { id: "30m", label: "Every 30 minutes", short: "Every 30 min" },
  { id: "1h", label: "Every hour", short: "Every hour" },
  { id: "3h", label: "Every 3 hours", short: "Every 3 hours" },
  { id: "6h", label: "Every 6 hours", short: "Every 6 hours" },
  { id: "12h", label: "Every 12 hours", short: "Every 12 hours" },
  { id: "1d", label: "Every day, at midnight", short: "Daily" },
  { id: "1w", label: "Every week, on Monday at midnight", short: "Weekly" },
];

export const refreshLabel = (refresh: Refresh) => REFRESHES.find((r) => r.id === refresh) ?? REFRESHES[2];

export const SWITCHES: { id: Switch; label: string; description?: string; divider?: boolean }[] = [
  { id: "30m", label: "Every 30 minutes" },
  { id: "1h", label: "Every hour" },
  { id: "8h", label: "Every 8 hours" },
  { id: "1d", label: "Every day, at midnight" },
  { id: "1w", label: "Every week, on Monday at midnight" },
  { id: "1mo", label: "Every month, on the 1st at midnight" },
  {
    id: "finished",
    label: "Once a collection is finished",
    divider: true,
  },
];

// Refresh choices; `compact` uses the short labels, for a dropdown inside a list.
export const refreshOptions = (compact = false) => REFRESHES.map((r) => ({ id: r.id, label: compact ? r.short : r.label }));
