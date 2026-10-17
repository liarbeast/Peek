import { Button, Tabs, toast } from "@heroui/react";
import { ArrowLeft } from "@gravity-ui/icons";
import { useState } from "react";
import { api, type Orientation, type Settings } from "../api";
import { go, type SettingsTab } from "../router";
import { SWITCHES } from "../timing";
import { PanelImage } from "../components/PanelImage";
import { Choice } from "../components/ui";
import { CollectionOrder } from "./CollectionOrder";
import { Label, Radio, RadioGroup } from "react-aria-components";

const ORIENTATIONS: { id: Orientation; label: string; size: string; shape: string }[] = [
  { id: "landscape", label: "Landscape", size: "800 × 480", shape: "h-9 w-15" },
  { id: "portrait", label: "Portrait", size: "480 × 800", shape: "h-15 w-9" },
];

const INSTALL_PAGE = "https://liarbeast.github.io/Peek/";

/** Peek's address as a frame on the network would use it; not when it's only
 * reachable on this computer (localhost). */
function peekAddress(): string | null {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  return local ? null : window.location.origin;
}

export function SettingsPage({
  tab,
  settings,
  onChange,
}: {
  tab: SettingsTab;
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
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
        <a href="#/" className="inline-flex items-center gap-1 text-sm text-muted hover:underline">
          <ArrowLeft width={14} height={14} />
          Collections
        </a>
        <h1 className="mt-1 text-2xl font-semibold">Settings</h1>
        <p className="text-muted">These apply to the whole frame.</p>
      </div>
      <Tabs variant="secondary" selectedKey={tab} onSelectionChange={(key) => go(`#/settings/${key}`)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Settings sections">
            <Tabs.Tab id="general">
              General
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="firmware">
              Firmware
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="general" className="pt-4">
          {/* The left column is the wider one, for the collections table. */}
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
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
                  label="Switch collection"
                  value={settings.switch}
                  onChange={(s) => update({ switch: s })}
                  options={SWITCHES}
                />
                <p className="text-sm text-muted">
                  How often the frame moves on to the next active collection, on its first wake after this time.
                </p>
              </div>
              <CollectionOrder
                value={settings.collection_order}
                onChange={(collection_order) => update({ collection_order })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">On the frame now</span>
              <PanelImage alt="The frame's current image" load={api.framePreview} deps={[settings.orientation]} />
            </div>
          </div>
        </Tabs.Panel>
        <Tabs.Panel id="firmware" className="pt-4">
          <InstallFirmware />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

function InstallFirmware() {
  const address = peekAddress();
  const url = address ? `${INSTALL_PAGE}?peek=${encodeURIComponent(address)}` : INSTALL_PAGE;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-sm font-medium">Frame software</span>
      <p className="text-sm text-muted">
        Put Peek on a new frame, or update one. The install page opens in a new tab and walks you through it.
      </p>
      {address && (
        <p className="text-sm text-muted">
          Peek's address, if a frame asks for it: <code className="select-all text-foreground">{address}</code>
        </p>
      )}
      <Button className="mt-1" variant="tertiary" onPress={() => window.open(url, "_blank", "noopener")}>
        Install firmware
      </Button>
    </div>
  );
}
