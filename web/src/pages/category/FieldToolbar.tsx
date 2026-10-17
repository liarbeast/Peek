import { Button, Dropdown, ToggleButton, ToggleButtonGroup, Toolbar } from "@heroui/react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  ArrowDownFromLine,
  ArrowUpFromLine,
  BringToFront,
  Link,
  SendToBack,
  Trash2,
  UnfoldVertical,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, PANEL_COLOURS, type Box, type CategoryImage, type PanelColour } from "../../api";
import type { Layer } from "./FieldBoxes";

// The Google Fonts on offer with their weights, fetched once, and loaded into
// the page so the menu can show each one in its own face.
let fontList: Promise<Record<string, number[]>> | null = null;
function useFonts() {
  const [fonts, setFonts] = useState<Record<string, number[]>>({});
  useEffect(() => {
    if (!fontList) {
      fontList = api.fonts();
      fontList.then((all) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        const families = Object.keys(all).map((n) => `family=${encodeURIComponent(n)}`);
        link.href = `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
        document.head.append(link);
      });
    }
    fontList.then(setFonts).catch(() => setFonts({}));
  }, []);
  return fonts;
}

const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};
const BUILT_IN_WEIGHTS = [400, 700];

// The weight closest to `weight` that `weights` has.
const nearest = (weight: number, weights: number[]) =>
  weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), weights[0] ?? 400);

// The selected field's options, shown next to its box. Text gets alignment,
// size, weight, colour and typeface; images get alignment both ways; style
// images also choose between crisp and photo, and can be removed. Everything
// can go to the front or back and be attached to something else, so it
// moves with it and keeps its distance.
export function FieldToolbar(props: {
  layer: Layer;
  box: Box;
  attachable: Layer[]; // what it can be attached to without going round in a circle
  onChange: (changes: Partial<Box>) => void;
  onAttach: (below: string | null) => void;
  onFront: () => void;
  onBack: () => void;
  onImageChange: (changes: Partial<CategoryImage>) => void;
  onImageDelete: () => void;
}) {
  const { box, layer } = props;
  const fonts = useFonts();
  const weights = box.font ? (fonts[box.font] ?? []) : BUILT_IN_WEIGHTS;
  const attached = props.attachable.find((f) => f.key === box.below);
  const isText = layer.type === "text";
  return (
    <Toolbar
      aria-label={`${layer.label} options`}
      className="flex items-center gap-1 whitespace-nowrap rounded-xl border border-border bg-overlay p-1 shadow-lg"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {!layer.image && (
        <Segments
          label="Horizontal alignment"
          value={box.align ?? "center"}
          options={[
            ["left", "Align left", <AlignLeft key="l" size={16} />],
            ["center", "Align centre", <AlignCenter key="c" size={16} />],
            ["right", "Align right", <AlignRight key="r" size={16} />],
          ]}
          onChange={(align) => props.onChange({ align: align as Box["align"] })}
        />
      )}
      {isText ? (
        <>
          <TextSize size={box.size} onChange={(size) => props.onChange({ size })} />
          <ColourMenu value={box.color ?? "black"} onChange={(color) => props.onChange({ color })} />
          <FontMenu
            fonts={fonts}
            value={box.font}
            onChange={(font) => {
              // Keep the weight if the new face has it, else take its closest one.
              const has = font ? (fonts[font] ?? []) : BUILT_IN_WEIGHTS;
              props.onChange({ font, weight: nearest(box.weight ?? 400, has) });
            }}
          />
          {weights.length > 1 && (
            <WeightMenu weights={weights} value={box.weight ?? 400} onChange={(weight) => props.onChange({ weight })} />
          )}
          {/* Attached text hangs from the field above, so it can only grow down. */}
          {!box.below && (
            <Segments
              label="Grow"
              value={box.grow ?? "down"}
              options={[
                ["down", "Grow down: the top edge stays put", <ArrowDownFromLine key="d" size={16} />],
                ["up", "Grow up: the bottom edge stays put", <ArrowUpFromLine key="u" size={16} />],
                ["middle", "Grow both ways: the centre stays put", <UnfoldVertical key="m" size={16} />],
              ]}
              onChange={(grow) => props.onChange({ grow: grow as Box["grow"] })}
            />
          )}
        </>
      ) : (
        !layer.image && (
          <Segments
            label="Vertical alignment"
            value={box.valign ?? "middle"}
            options={[
              ["top", "Align top", <AlignStartHorizontal key="t" size={16} />],
              ["middle", "Align middle", <AlignCenterHorizontal key="m" size={16} />],
              ["bottom", "Align bottom", <AlignEndHorizontal key="b" size={16} />],
            ]}
            onChange={(valign) => props.onChange({ valign: valign as Box["valign"] })}
          />
        )
      )}
      {layer.image && (
        <Segments
          label="How to draw it"
          value={layer.image.crisp ? "crisp" : "photo"}
          options={[
            ["crisp", "Crisp: solid colours, for graphics and pixel art", <span key="c" className="px-1 text-xs">Crisp</span>],
            ["photo", "Photo: dithered, for photos", <span key="p" className="px-1 text-xs">Photo</span>],
          ]}
          onChange={(how) => props.onImageChange({ crisp: how === "crisp" })}
          isIconOnly={false}
        />
      )}
      <IconButton label="Bring to front" onPress={props.onFront}>
        <BringToFront size={16} />
      </IconButton>
      <IconButton label="Send to back" onPress={props.onBack}>
        <SendToBack size={16} />
      </IconButton>
      <Dropdown>
        <Dropdown.Trigger
          aria-label="Attach to another field"
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm hover:bg-default"
        >
          <Link size={16} />
          {attached ? `Attached to ${attached.label}` : "Attach to"}
        </Dropdown.Trigger>
        <Dropdown.Popover>
          <Dropdown.Menu
            aria-label="Attach to"
            selectionMode="single"
            selectedKeys={[box.below ?? ""]}
            onAction={(key) => props.onAttach(key === "" ? null : String(key))}
          >
            <Dropdown.Item id="" textValue="Not attached">
              Not attached
              <Dropdown.ItemIndicator />
            </Dropdown.Item>
            {props.attachable.map((f) => (
              <Dropdown.Item key={f.key} id={f.key} textValue={f.label}>
                {f.label}
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {layer.image && (
        <IconButton label="Remove this image" onPress={props.onImageDelete}>
          <Trash2 size={16} />
        </IconButton>
      )}
    </Toolbar>
  );
}

function ColourMenu(props: { value: PanelColour; onChange: (colour: PanelColour) => void }) {
  return (
    <Dropdown>
      <Dropdown.Trigger aria-label="Text colour" className="flex h-8 items-center rounded-lg px-2 hover:bg-default">
        <span title="Text colour" className="flex flex-col items-center text-sm leading-none">
          A
          <span className="mt-0.5 h-1 w-4 rounded-sm border border-border" style={{ background: PANEL_COLOURS[props.value] }} />
        </span>
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label="Text colour"
          selectionMode="single"
          selectedKeys={[props.value]}
          onAction={(key) => props.onChange(key as PanelColour)}
        >
          {(Object.keys(PANEL_COLOURS) as PanelColour[]).map((c) => (
            <Dropdown.Item key={c} id={c} textValue={c}>
              <span className="flex items-center gap-2 capitalize">
                <span className="h-4 w-4 rounded-full border border-border" style={{ background: PANEL_COLOURS[c] }} />
                {c}
              </span>
              <Dropdown.ItemIndicator />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function FontMenu(props: {
  fonts: Record<string, number[]>;
  value?: string;
  onChange: (font: string | undefined) => void;
}) {
  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label="Typeface"
        className="flex h-8 max-w-36 items-center rounded-lg px-2 text-sm hover:bg-default"
      >
        <span title="Typeface" className="truncate" style={{ fontFamily: props.value ? `'${props.value}'` : undefined }}>
          {props.value ?? "Default"}
        </span>
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label="Typeface"
          className="max-h-80 overflow-auto"
          selectionMode="single"
          selectedKeys={[props.value ?? ""]}
          onAction={(key) => props.onChange(key === "" ? undefined : String(key))}
        >
          {["", ...Object.keys(props.fonts)].map((f) => (
            <Dropdown.Item key={f} id={f} textValue={f || "Default"}>
              <span style={{ fontFamily: f ? `'${f}'` : undefined }}>{f || "Default"}</span>
              <Dropdown.ItemIndicator />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function WeightMenu(props: { weights: number[]; value: number; onChange: (weight: number) => void }) {
  return (
    <Dropdown>
      <Dropdown.Trigger aria-label="Weight" className="flex h-8 items-center rounded-lg px-2 text-sm hover:bg-default">
        <span title="Weight" style={{ fontWeight: props.value }}>
          {WEIGHT_NAMES[props.value] ?? props.value}
        </span>
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label="Weight"
          selectionMode="single"
          selectedKeys={[String(props.value)]}
          onAction={(key) => props.onChange(Number(key))}
        >
          {props.weights.map((w) => (
            <Dropdown.Item key={w} id={String(w)} textValue={WEIGHT_NAMES[w] ?? String(w)}>
              <span style={{ fontWeight: w }}>{WEIGHT_NAMES[w] ?? w}</span>
              <Dropdown.ItemIndicator />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

// Text size in pixels; applied as you type once it is a size the panel can draw.
function TextSize(props: { size?: number; onChange: (size: number) => void }) {
  const [text, setText] = useState(props.size ? String(props.size) : "");
  return (
    <label className="flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-sm" title="Text size">
      <span className="sr-only">Text size</span>
      <input
        type="number"
        inputMode="numeric"
        min={6}
        max={400}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 6 && n <= 400) props.onChange(n);
        }}
        onBlur={() => setText(props.size ? String(props.size) : "")}
        className="w-8 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-muted">px</span>
    </label>
  );
}

function IconButton(props: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Button size="sm" variant="ghost" isIconOnly aria-label={props.label} onPress={props.onPress}>
      <span title={props.label}>{props.children}</span>
    </Button>
  );
}

function Segments(props: {
  label: string;
  value: string;
  options: [string, string, ReactNode][];
  onChange: (value: string) => void;
  isIconOnly?: boolean;
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
      {props.options.map(([id, label, icon]) => (
        <ToggleButton key={id} id={id} isIconOnly={props.isIconOnly ?? true} aria-label={label}>
          <span title={label}>{icon}</span>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
