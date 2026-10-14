import { Button, Dropdown, ToggleButton, ToggleButtonGroup, Toolbar } from "@heroui/react";
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
// can go to the front or back and be attached below something else.
export function FieldToolbar(props: {
  layer: Layer;
  box: Box;
  attachable: Layer[]; // what it can be attached below without going round in a circle
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
            ["left", "Align left", <Lines key="l" lines={[[2, 14], [2, 10], [2, 14]]} />],
            ["center", "Align centre", <Lines key="c" lines={[[2, 14], [4, 12], [2, 14]]} />],
            ["right", "Align right", <Lines key="r" lines={[[2, 14], [6, 14], [2, 14]]} />],
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
        </>
      ) : (
        !layer.image && (
          <Segments
            label="Vertical alignment"
            value={box.valign ?? "middle"}
            options={[
              ["top", "Align top", <Bar key="t" y={5} />],
              ["middle", "Align middle", <Bar key="m" y={8} />],
              ["bottom", "Align bottom", <Bar key="b" y={11} />],
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
        <Layers front />
      </IconButton>
      <IconButton label="Send to back" onPress={props.onBack}>
        <Layers />
      </IconButton>
      <Dropdown>
        <Dropdown.Trigger
          aria-label="Attach below another field"
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm hover:bg-default"
        >
          <AttachIcon />
          {attached ? `Below ${attached.label}` : "Attach"}
        </Dropdown.Trigger>
        <Dropdown.Popover>
          <Dropdown.Menu
            aria-label="Attach below"
            selectionMode="single"
            selectedKeys={[box.below ?? ""]}
            onAction={(key) => props.onAttach(key === "" ? null : String(key))}
          >
            <Dropdown.Item id="" textValue="Not attached">
              Not attached
              <Dropdown.ItemIndicator />
            </Dropdown.Item>
            {props.attachable.map((f) => (
              <Dropdown.Item key={f.key} id={f.key} textValue={`Below ${f.label}`}>
                Below {f.label}
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {layer.image && (
        <IconButton label="Remove this image" onPress={props.onImageDelete}>
          <TrashIcon />
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

const svg = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" } as const;

// Three lines, like a text alignment icon.
function Lines(props: { lines: [number, number][] }) {
  return (
    <svg {...svg}>
      {props.lines.map(([x1, x2], i) => (
        <line key={i} x1={x1} x2={x2} y1={4 + i * 4} y2={4 + i * 4} />
      ))}
    </svg>
  );
}

// A bar at the top, middle or bottom of a frame.
function Bar(props: { y: number }) {
  return (
    <svg {...svg}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" strokeOpacity="0.4" />
      <line x1="5" x2="11" y1={props.y} y2={props.y} strokeWidth="2.5" />
    </svg>
  );
}

// Two overlapping squares, the filled one in front or behind.
function Layers(props: { front?: boolean }) {
  const behind = "M2 10V2h8v4"; // the part of the back square the front one doesn't cover
  return props.front ? (
    <svg {...svg}>
      <path d={behind} strokeLinejoin="round" />
      <rect x="6" y="6" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  ) : (
    <svg {...svg}>
      <path d="M2 10V2h8v4H6v4z" fill="currentColor" strokeLinejoin="round" />
      <rect x="6" y="6" width="8" height="8" rx="1" />
    </svg>
  );
}

function AttachIcon() {
  return (
    <svg {...svg}>
      <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...svg}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" strokeLinejoin="round" />
    </svg>
  );
}
