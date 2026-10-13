import { toast } from "@heroui/react";
import { useState } from "react";
import { api, type Orientation, type Settings } from "../api";
import { PanelImage } from "../components/PanelImage";
import { Choice } from "../components/ui";

const ORIENTATIONS: { id: Orientation; label: string; description: string }[] = [
  { id: "landscape", label: "Landscape", description: "Wide, 800 × 480" },
  { id: "portrait", label: "Portrait", description: "Tall, 480 × 800" },
  { id: "landscape_flipped", label: "Landscape, upside down", description: "Wide, with the board's edge on top" },
  { id: "portrait_flipped", label: "Portrait, other way round", description: "Tall, turned the other way" },
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
          <Choice
            label="How the frame hangs"
            value={settings.orientation}
            onChange={(o) => !busy && update({ orientation: o as Orientation })}
            options={ORIENTATIONS}
            description="Layouts are drawn upright for this, and the image is turned for the panel. If the picture shows upside down, pick the other version of the same orientation."
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">On the frame now</span>
          <PanelImage alt="The frame's current image" load={api.framePreview} deps={[settings.orientation]} />
        </div>
      </div>
    </div>
  );
}
