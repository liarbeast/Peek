import { Button, Popover, Separator } from "@heroui/react";
import { Battery as BatteryEmpty, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, Image } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Battery, type Category } from "../api";
import { switchText } from "../pages/CategoriesPage";
import { PanelImage } from "./PanelImage";

// Checked again now and then, since the frame reports on its own schedule.
const POLL_MS = 5 * 60 * 1000;

// "3 hours ago" and the like.
function ago(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

const isLow = (battery: Battery | null | undefined) => !!battery && battery.percent <= 15;

// The frame's button in the top bar, with its battery level always in view. It
// drops down the frame's status, like a menu bar item: the picture on it now,
// what it shows and its battery.
export function FrameStatus() {
  const [battery, setBattery] = useState<Battery | null | undefined>(undefined);
  const [current, setCurrent] = useState<Category | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);

  useEffect(() => {
    const load = () => api.battery().then(setBattery, () => {});
    load();
    const timer = window.setInterval(load, POLL_MS);
    const bump = () => setFrameVersion((v) => v + 1);
    window.addEventListener("peek:frame-changed", bump);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("peek:frame-changed", bump);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    api.battery().then(setBattery, () => {});
    api.categories().then((all) => setCurrent(all.find((c) => c.current)), () => {});
  }, [open, frameVersion]);

  const level = battery ? `${battery.percent}%` : "–";
  const switching = switchText(current);

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" className="gap-2 px-3" aria-label={`The frame, battery ${battery ? level : "unknown"}`}>
        <Image size={18} />
        <span className={`flex items-center gap-1.5 tabular-nums ${isLow(battery) ? "text-danger" : ""}`}>
          <BatteryIcon percent={battery?.percent ?? null} />
          {level}
        </span>
      </Button>
      <Popover.Content placement="bottom end">
        <Popover.Dialog aria-label="The frame" className="flex w-64 flex-col gap-4 p-5 text-sm">
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Now showing</h3>
            {open && <PanelImage alt="The frame's current image" load={api.framePreview} deps={[frameVersion]} />}
            <div className="flex flex-col">
              <span>{current ? current.name : "Welcome page"}</span>
              {switching && <span className="text-xs text-muted">{switching}</span>}
            </div>
          </section>
          <Separator className="bg-default-foreground/25" />
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Battery</h3>
            {battery ? (
              <div className="flex flex-col gap-0.5">
                <span className={`flex items-center gap-1.5 font-medium ${isLow(battery) ? "text-danger" : ""}`}>
                  <BatteryIcon percent={battery.percent} />
                  {battery.percent}%{isLow(battery) && ", charge it soon"}
                </span>
                <span className="text-xs text-muted">
                  {battery.voltage.toFixed(2)} V, reported {ago(battery.at)}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted">No report yet. The frame sends one each time it wakes.</span>
            )}
          </section>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

// Lucide's battery in steps, like a phone's: a warning when low, empty while unknown.
function BatteryIcon({ percent }: { percent: number | null }) {
  const Icon =
    percent === null
      ? BatteryEmpty
      : percent <= 15
        ? BatteryWarning
        : percent < 40
          ? BatteryLow
          : percent < 75
            ? BatteryMedium
            : BatteryFull;
  return <Icon size={20} aria-hidden="true" />;
}
