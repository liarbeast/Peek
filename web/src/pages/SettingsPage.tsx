import { toast } from "@heroui/react";
import { useState } from "react";
import { api, type Orientation, type Settings } from "../api";
import { PanelImage } from "../components/PanelImage";
import { Label, Radio, RadioGroup } from "react-aria-components";

const ORIENTATIONS: { id: Orientation; label: string; size: string; shape: string }[] = [
  { id: "landscape", label: "Landscape", size: "800 × 480", shape: "h-9 w-15" },
  { id: "portrait", label: "Portrait", size: "480 × 800", shape: "h-15 w-9" },
];

export function SettingsPage({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [busy, setBusy] = useState(false);

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
        <h1 className="text-2xl font-semibold">Settings</h1>
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
            <Label className="text-sm font-medium">How the frame hangs</Label>
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
            <p className="text-sm text-muted">Layouts are drawn upright for this, and the image is turned for the panel.</p>
          </RadioGroup>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">On the frame now</span>
          <PanelImage alt="The frame's current image" load={api.framePreview} deps={[settings.orientation]} />
        </div>
      </div>
    </div>
  );
}
