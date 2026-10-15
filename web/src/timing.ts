import type { Refresh, Switch } from "./api";

// A collection's Refresh and Switch collection choices, each with its length
// in minutes, so switch choices shorter than the refresh can be greyed out
// (the server moves a too-short switch up the same way).
// `short` is for tags, such as on the home screen's cards.
export const REFRESHES: { id: Refresh; label: string; short: string; minutes: number }[] = [
  { id: "15m", label: "Every 15 minutes", short: "Every 15 min", minutes: 15 },
  { id: "30m", label: "Every 30 minutes", short: "Every 30 min", minutes: 30 },
  { id: "1h", label: "Every hour", short: "Every hour", minutes: 60 },
  { id: "3h", label: "Every 3 hours", short: "Every 3 hours", minutes: 180 },
  { id: "6h", label: "Every 6 hours", short: "Every 6 hours", minutes: 360 },
  { id: "12h", label: "Every 12 hours", short: "Every 12 hours", minutes: 720 },
  { id: "1d", label: "Every day, at midnight", short: "Daily", minutes: 1440 },
  { id: "1w", label: "Every week, on Monday at midnight", short: "Weekly", minutes: 10080 },
];

export const refreshLabel = (refresh: Refresh) => REFRESHES.find((r) => r.id === refresh) ?? REFRESHES[2];

export const SWITCHES: { id: Switch; label: string; description?: string; divider?: boolean; minutes: number }[] = [
  { id: "30m", label: "Every 30 minutes", minutes: 30 },
  { id: "1h", label: "Every hour", minutes: 60 },
  { id: "8h", label: "Every 8 hours", minutes: 480 },
  { id: "1d", label: "Every day, at midnight", minutes: 1440 },
  { id: "1w", label: "Every week, on Monday at midnight", minutes: 10080 },
  { id: "1mo", label: "Every month, on the 1st at midnight", minutes: Infinity },
  {
    id: "finished",
    label: "Once a collection is finished",
    divider: true,
    minutes: Infinity,
  },
];

// The switch choices for a refresh: shorter ones disabled, saying why.
export const switchOptions = (refresh: Refresh) => {
  const r = REFRESHES.find((o) => o.id === refresh) ?? REFRESHES[0];
  return SWITCHES.map((s) => ({
    ...s,
    disabled: s.minutes < r.minutes ? `Refresh is ${r.label.charAt(0).toLowerCase()}${r.label.slice(1)}` : undefined,
  }));
};

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// Select can't hold an empty key, so a collection on the frame's own refresh uses this.
export const DEFAULT_REFRESH = "default";

// A collection's refresh choices: the frame's (from Settings), then its own.
// `compact` uses the short labels, for a dropdown inside a list.
export const refreshOptions = (frameRefresh: Refresh, compact = false) => [
  compact
    ? { id: DEFAULT_REFRESH, label: `Default (${lowerFirst(refreshLabel(frameRefresh).short.replace(/^Every (hour)?/, (_, h) => (h ? "1 hour" : "")))})` }
    : {
        id: DEFAULT_REFRESH,
        label: `Default (${lowerFirst(refreshLabel(frameRefresh).label)})`,
        description: "The frame's refresh, from Settings",
      },
  ...REFRESHES.map((r, i) => ({ id: r.id as string, label: compact ? r.short : r.label, divider: i === 0 })),
];
