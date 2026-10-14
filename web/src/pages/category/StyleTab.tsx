import { css } from "@codemirror/lang-css";
import { Button, Chip, ToggleButton, ToggleButtonGroup, toast } from "@heroui/react";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState } from "react";
import { api, describeItem, type Box, type Category, type Item, type Positions, type Preview, type Template } from "../../api";
import { PanelImage } from "../../components/PanelImage";
import { Choice, Toggle } from "../../components/ui";
import { useSettings } from "../../settings";
import { boxOf, FieldBoxes } from "./FieldBoxes";

const COLOURS = ["black", "white", "yellow", "red", "blue", "green"];

const PLACEHOLDER_CSS = `.field-title {
  color: var(--red);
}
.field-image {
  width: 384px;
}`;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function StyleTab(props: {
  category: Category;
  templates: Template[];
  items: Item[];
  onSaved: (c: Category) => void;
}) {
  const { category, templates, items } = props;
  const [customCss, setCustomCss] = useState(category.custom_css);
  const [mono, setMono] = useState(category.mono);
  const [pixelate, setPixelate] = useState(category.pixelate);
  const [positions, setPositions] = useState<Positions>(category.positions);
  const [measured, setMeasured] = useState<Preview["boxes"]>({});
  const [selected, setSelected] = useState<string | null>(null);
  const { orientation } = useSettings();
  const placed = positions[orientation] ?? {};
  const setPlaced = (next: Record<string, Box>) => setPositions((p) => ({ ...p, [orientation]: next }));
  const canvas = orientation === "portrait" ? { width: 480, height: 800 } : { width: 800, height: 480 };
  const [previewItem, setPreviewItem] = useState<string>(items[0] ? String(items[0].id) : "");
  const [busy, setBusy] = useState(false);
  const info = templates.find((t) => t.name === category.template) ?? templates[0];
  const dirty =
    customCss !== category.custom_css ||
    mono !== category.mono ||
    pixelate !== category.pixelate ||
    JSON.stringify(positions) !== JSON.stringify(category.positions);
  const debouncedCss = useDebounced(customCss, 700);
  const debouncedPositions = useDebounced(positions, 400);

  const save = async () => {
    setBusy(true);
    try {
      props.onSaved(await api.updateCategory(category.id, { custom_css: customCss, mono, pixelate, positions }));
      toast.success("Style saved");
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    setCustomCss(category.custom_css);
    setMono(category.mono);
    setPixelate(category.pixelate);
    setPositions(category.positions);
  };

  const unplace = (key: string) => {
    const { [key]: _, ...rest } = placed;
    setPlaced(rest);
  };

  // Changes a field's box, placing it where it is now if it was still in the stack.
  const restyle = (key: string, changes: Partial<Box>) => {
    const box = boxOf(key, placed, measured);
    if (box) setPlaced({ ...placed, [key]: { ...box, ...changes } });
  };

  const zs = Object.values(placed).map((b) => b.z ?? 0);
  const selectedBox = selected ? boxOf(selected, placed, measured) : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Filters</span>
          <Filter
            label="Black and white"
            description="Draws everything in black and white; shades become dither patterns."
            isSelected={mono}
            onChange={setMono}
          />
          <Filter
            label="Crisp images"
            description="Images are resized without smoothing and drawn in solid panel colours instead of photo dithering. For pixel art, icons, logos and QR codes."
            isSelected={pixelate}
            onChange={setPixelate}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Custom CSS</span>
          <div className="overflow-hidden rounded-lg border border-border text-sm">
            <CodeMirror
              value={customCss}
              onChange={setCustomCss}
              extensions={[css()]}
              height="260px"
              placeholder={PLACEHOLDER_CSS}
              theme={window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"}
            />
          </div>
          <p className="text-sm text-muted">
            Fields are drawn in order inside <code>.stack</code>. Each has its own class:
          </p>
          <ChipList items={["body", ...info.classes, ...category.fields.map((f) => `.field-${f.key}`)]} />
          <p className="text-sm text-muted">Panel colours:</p>
          <ChipList items={COLOURS.map((c) => `var(--${c})`)} />
        </div>
        <div className="flex gap-2">
          <Button isDisabled={!dirty || busy} onPress={save}>
            Save style
          </Button>
          <Button variant="tertiary" isDisabled={!dirty} onPress={undo}>
            Undo changes
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 self-start lg:sticky lg:top-4">
        {items.length > 0 && (
          <Choice
            label="Preview with"
            value={previewItem}
            onChange={setPreviewItem}
            options={items.map((i) => ({ id: String(i.id), label: describeItem(category.fields, i).title }))}
          />
        )}
        <PanelImage
          alt="Preview of this style on the panel"
          load={() =>
            api.previewCategory(category.id, {
              custom_css: debouncedCss,
              mono,
              pixelate,
              positions: debouncedPositions,
              item_id: previewItem ? Number(previewItem) : undefined,
            })
          }
          deps={[debouncedCss, mono, pixelate, previewItem, JSON.stringify(debouncedPositions)]}
          onBoxes={setMeasured}
        >
          <FieldBoxes
            canvas={canvas}
            fields={category.fields}
            measured={measured}
            placed={placed}
            onChange={setPlaced}
            selected={selected}
            onSelect={setSelected}
          />
        </PanelImage>
        {selected && selectedBox ? (
          <div className="flex flex-wrap items-center gap-2">
            <Segments
              label="Horizontal alignment"
              value={selectedBox.align ?? "center"}
              options={[
                ["left", <AlignIcon key="l" lines={[[2, 14], [2, 10], [2, 14]]} />],
                ["center", <AlignIcon key="c" lines={[[2, 14], [4, 12], [2, 14]]} />],
                ["right", <AlignIcon key="r" lines={[[2, 14], [6, 14], [2, 14]]} />],
              ]}
              onChange={(align) => restyle(selected, { align: align as Box["align"] })}
            />
            <Segments
              label="Vertical alignment"
              value={selectedBox.valign ?? "middle"}
              options={[
                ["top", <AlignIcon key="t" vertical="top" />],
                ["middle", <AlignIcon key="m" vertical="middle" />],
                ["bottom", <AlignIcon key="b" vertical="bottom" />],
              ]}
              onChange={(valign) => restyle(selected, { valign: valign as Box["valign"] })}
            />
            <Button size="sm" variant="tertiary" onPress={() => restyle(selected, { z: Math.max(0, ...zs) + 1 })}>
              To front
            </Button>
            <Button size="sm" variant="tertiary" onPress={() => restyle(selected, { z: Math.min(0, ...zs) - 1 })}>
              To back
            </Button>
            {placed[selected] && (
              <Button size="sm" variant="tertiary" onPress={() => unplace(selected)}>
                Back in the stack
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Drag a field to place it. Its corner scales it; for text, the side handles change the box without
            scaling. Arrow keys nudge it, and holding Alt while dragging turns snapping off. Long text shrinks to fit
            its box.
          </p>
        )}
        {Object.keys(placed).length > 0 && (
          <div>
            <Button size="sm" variant="tertiary" onPress={() => setPlaced({})}>
              Put all fields back in the stack
            </Button>
          </div>
        )}
        <p className="text-sm text-muted">
          {items.length ? "" : "Showing placeholder content until you add items. "}
          This is how the panel shows it, in its own {mono ? "black and white" : "six colours"}.
        </p>
      </div>
    </div>
  );
}

function Filter(props: { label: string; description: string; isSelected: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Toggle label={props.label} isSelected={props.isSelected} onChange={props.onChange} />
      <p className="pl-12 text-sm text-muted">{props.description}</p>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((c) => (
        <Chip key={c} size="sm" variant="soft">
          <code>{c}</code>
        </Chip>
      ))}
    </div>
  );
}

function Segments(props: {
  label: string;
  value: string;
  options: [string, React.ReactNode][];
  onChange: (value: string) => void;
}) {
  return (
    <ToggleButtonGroup
      aria-label={props.label}
      size="sm"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[props.value]}
      onSelectionChange={(keys) => {
        const [key] = keys;
        if (key) props.onChange(String(key));
      }}
    >
      {props.options.map(([id, icon]) => (
        <ToggleButton key={id} id={id} isIconOnly aria-label={id}>
          {icon}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

// Three lines, like a text alignment icon; or, for vertical alignment, a bar
// at the top, middle or bottom of a frame.
function AlignIcon(props: { lines?: [number, number][]; vertical?: "top" | "middle" | "bottom" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {props.lines?.map(([x1, x2], i) => <line key={i} x1={x1} x2={x2} y1={4 + i * 4} y2={4 + i * 4} />)}
      {props.vertical && (
        <>
          <rect x="2" y="2" width="12" height="12" rx="1.5" strokeOpacity="0.4" />
          <line x1="5" x2="11" y1={{ top: 5, middle: 8, bottom: 11 }[props.vertical]} y2={{ top: 5, middle: 8, bottom: 11 }[props.vertical]} strokeWidth="2.5" />
        </>
      )}
    </svg>
  );
}
