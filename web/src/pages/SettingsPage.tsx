import { toast } from "@heroui/react";
import { useState } from "react";
import { api, type Orientation, type Refresh, type Settings, type Switch } from "../api";
import { PanelImage } from "../components/PanelImage";
import { Choice } from "../components/ui";
import { Label, Radio, RadioGroup } from "react-aria-components";

const ORIENTATIONS: { id: Orientation; label: string; size: string; shape: string }[] = [
  { id: "landscape", label: "Landscape", size: "800 × 480", shape: "h-9 w-15" },
  { id: "portrait", label: "Portrait", size: "480 × 800", shape: "h-15 w-9" },
];

// Each with its length in minutes, so Switch collection can leave out choices
// shorter than Refresh (the server does the same).
const REFRESHES: { id: Refresh; label: string; minutes: number }[] = [
  { id: "15m", label: "Every 15 minutes", minutes: 15 },
  { id: "30m", label: "Every 30 minutes", minutes: 30 },
  { id: "1h", label: "Every hour", minutes: 60 },
  { id: "3h", label: "Every 3 hours", minutes: 180 },
  { id: "6h", label: "Every 6 hours", minutes: 360 },
  { id: "12h", label: "Every 12 hours", minutes: 720 },
  { id: "1d", label: "Every day, at midnight", minutes: 1440 },
  { id: "1w", label: "Every week, on Monday at midnight", minutes: 10080 },
];

const SWITCHES: { id: Switch; label: string; description?: string; divider?: boolean; minutes: number }[] = [
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

export function SettingsPage({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [busy, setBusy] = useState(false);
  const refresh = REFRESHES.find((r) => r.id === settings.refresh) ?? REFRESHES[0];

  const update = async (patch: Partial<Settings>) => {
    setBusy(true);
    try {
      onChange(await api.updateSettings(patch));
      window.dispatchEvent(new Event("peek:frame-changed"));
      toast.success("Saved. The frame turns on its next wake.");
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <a href="#/" className="text-sm text-muted hover:underline">
          ← Collections
        </a>
        <h1 className="mt-1 text-2xl font-semibold">Settings</h1>
        <p className="text-muted">These apply to the whole frame.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <RadioGroup
            value={settings.orientation}
            onChange={(o) => update({ orientation: o as Orientation })}
            isDisabled={busy}
            orientation="horizontal"
            className="flex flex-col gap-2"
          >
            <Label className="text-sm font-medium">Orientation</Label>
            <div className="grid grid-cols-2 gap-3">
              {ORIENTATIONS.map((o) => (
                <Radio
                  key={o.id}
                  value={o.id}
                  className={({ isSelected, isFocusVisible }) =>
                    `flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 bg-surface p-4 transition ${
                      isSelected ? "border-accent" : "border-border hover:border-default-foreground/30"
                    } ${isFocusVisible ? "ring-2 ring-accent ring-offset-2" : ""}`
                  }
                >
                  {({ isSelected }) => (
                    <>
                      <div className="flex h-16 items-center">
                        <div
                          className={`${o.shape} rounded-sm border-2 ${
                            isSelected ? "border-accent bg-accent/15" : "border-muted bg-surface-secondary"
                          }`}
                        />
                      </div>
                      <div className="text-center">
                        <p className="font-medium">{o.label}</p>
                        <p className="text-sm text-muted">{o.size}</p>
                      </div>
                    </>
                  )}
                </Radio>
              ))}
            </div>
          </RadioGroup>
          <div className="flex flex-col gap-1">
            <Choice
              label="Refresh"
              value={settings.refresh}
              onChange={(refresh) => update({ refresh })}
              options={REFRESHES}
            />
            <p className="text-sm text-muted">
              How often the frame wakes for a new image: the next item of the current collection. Wakes fall on the
              round time, so it stays on schedule. More often uses more battery.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Choice
              label="Switch collection"
              value={settings.switch}
              onChange={(s) => update({ switch: s })}
              options={SWITCHES.map((s) => ({
                ...s,
                disabled:
                  s.minutes < refresh.minutes
                    ? `Refresh is ${refresh.label.charAt(0).toLowerCase()}${refresh.label.slice(1)}`
                    : undefined,
              }))}
            />
            <p className="text-sm text-muted">
              How often the frame moves on to the next active collection, on its first wake after this time.
              “Finished” moves on once every item of the collection has been shown. Choices shorter than Refresh
              are greyed out; pick the same as Refresh to change collection on every wake.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">On the frame now</span>
          <PanelImage alt="The frame's current image" load={api.framePreview} deps={[settings.orientation]} />
        </div>
      </div>
    </div>
  );
}
