import { useEffect, useState } from "react";
import { api, type Battery } from "../api";

// Checked again now and then, since the frame reports on its own schedule.
const POLL_MS = 5 * 60 * 1000;

// "3 hours ago" and the like.
function ago(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "minute");
}

// The frame's battery level for the top bar: an icon filled to match, and the percentage.
export function BatteryLevel() {
  const [battery, setBattery] = useState<Battery | null | undefined>(undefined);

  useEffect(() => {
    const load = () => api.battery().then(setBattery, () => {});
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (battery === undefined) return null;
  const low = battery !== null && battery.percent <= 15;
  const description = battery
    ? `Frame battery ${battery.percent}% (${battery.voltage.toFixed(2)} V), reported ${ago(battery.at)}`
    : "The frame hasn't reported its battery yet";

  return (
    <span
      role="img"
      aria-label={description}
      title={description}
      className={`flex items-center gap-1.5 px-2 text-sm tabular-nums ${low ? "text-danger" : "text-muted"}`}
    >
      <BatteryIcon percent={battery?.percent ?? 0} />
      {battery ? `${battery.percent}%` : "–"}
    </span>
  );
}

function BatteryIcon({ percent }: { percent: number }) {
  const width = 15 * Math.min(Math.max(percent, 0), 100) / 100;
  return (
    <svg width="24" height="14" viewBox="0 0 24 14" fill="none" aria-hidden="true">
      <rect x="0.75" y="0.75" width="19.5" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="21.5" y="4.5" width="2" height="5" rx="1" fill="currentColor" />
      {width > 0 && <rect x="3" y="3" width={width} height="8" rx="1" fill="currentColor" />}
    </svg>
  );
}
