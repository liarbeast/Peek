import { Button } from "@heroui/react";
import { useEffect, useState } from "react";
import { api, type Battery, type Category } from "../api";
import { switchText } from "../pages/CategoriesPage";
import { PanelImage } from "./PanelImage";
import { Dialog } from "./ui";

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
// opens the frame's status: the picture on it now, what it shows and its battery.
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
    <>
      <Button
        variant="tertiary"
        size="sm"
        aria-label={`The frame, battery ${battery ? level : "unknown"}`}
        onPress={() => setOpen(true)}
      >
        Frame
        <span className="mx-0.5 h-4 w-px bg-current opacity-25" />
        <span className={`flex items-center gap-1.5 tabular-nums ${isLow(battery) ? "text-danger" : "text-muted"}`}>
          <BatteryIcon percent={battery?.percent ?? 0} />
          {level}
        </span>
      </Button>

      <Dialog isOpen={open} onOpenChange={setOpen} title="Frame" size="lg">
        {open && <PanelImage alt="The frame's current image" load={api.framePreview} deps={[frameVersion]} />}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">Showing</dt>
          <dd>
            {current ? current.name : "The welcome page"}
            {switching && <span className="block text-muted">{switching}</span>}
          </dd>
          <dt className="text-muted">Battery</dt>
          <dd className="flex flex-col">
            {battery ? (
              <>
                <span className={`flex items-center gap-1.5 ${isLow(battery) ? "text-danger" : ""}`}>
                  <BatteryIcon percent={battery.percent} />
                  {battery.percent}% ({battery.voltage.toFixed(2)} V){isLow(battery) && ", charge it soon"}
                </span>
                <span className="text-muted">Reported {ago(battery.at)}</span>
              </>
            ) : (
              <span className="text-muted">Not reported yet. The frame sends it each time it wakes.</span>
            )}
          </dd>
        </dl>
        <p className="text-sm text-muted">Changes show up on the frame on its next wake.</p>
      </Dialog>
    </>
  );
}

function BatteryIcon({ percent }: { percent: number }) {
  const width = (15 * Math.min(Math.max(percent, 0), 100)) / 100;
  return (
    <svg width="24" height="14" viewBox="0 0 24 14" fill="none" aria-hidden="true">
      <rect x="0.75" y="0.75" width="19.5" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="21.5" y="4.5" width="2" height="5" rx="1" fill="currentColor" />
      {width > 0 && <rect x="3" y="3" width={width} height="8" rx="1" fill="currentColor" />}
    </svg>
  );
}
