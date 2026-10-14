import { Button, Dropdown, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useState, type ReactNode } from "react";
import type { Box, Field } from "../../api";

// The selected field's options, shown next to its box: alignment, text size,
// front to back order, linking it below another field, and putting it back
// in the stack.
export function FieldToolbar(props: {
  box: Box;
  isText: boolean;
  isPlaced: boolean;
  linkable: Field[]; // fields it can be linked below without going round in a circle
  onChange: (changes: Partial<Box>) => void;
  onLink: (below: string | null) => void;
  onFront: () => void;
  onBack: () => void;
  onUnplace: () => void;
}) {
  const { box } = props;
  const linked = props.linkable.find((f) => f.key === box.below);
  return (
    <div
      className="flex items-center gap-1 whitespace-nowrap rounded-xl border border-border bg-overlay p-1 shadow-lg"
      onPointerDown={(e) => e.stopPropagation()}
    >
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
      {props.isText ? (
        <TextSize size={box.size} onChange={(size) => props.onChange({ size })} />
      ) : (
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
      )}
      <IconButton label="Bring to front" onPress={props.onFront}>
        <Layers front />
      </IconButton>
      <IconButton label="Send to back" onPress={props.onBack}>
        <Layers />
      </IconButton>
      <Dropdown>
        <Dropdown.Trigger
          aria-label="Link below another field"
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm hover:bg-default"
        >
          <LinkIcon />
          {linked ? `Below ${linked.label}` : "Link"}
        </Dropdown.Trigger>
        <Dropdown.Popover>
          <Dropdown.Menu
            aria-label="Link below"
            selectionMode="single"
            selectedKeys={[box.below ?? ""]}
            onAction={(key) => props.onLink(key === "" ? null : String(key))}
          >
            <Dropdown.Item id="" textValue="Not linked">
              Not linked
              <Dropdown.ItemIndicator />
            </Dropdown.Item>
            {props.linkable.map((f) => (
              <Dropdown.Item key={f.key} id={f.key} textValue={`Below ${f.label}`}>
                Below {f.label}
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {props.isPlaced && (
        <IconButton label="Back in the stack" onPress={props.onUnplace}>
          <Unplace />
        </IconButton>
      )}
    </div>
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
        className="w-10 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
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
        <ToggleButton key={id} id={id} isIconOnly aria-label={label}>
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

function LinkIcon() {
  return (
    <svg {...svg}>
      <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" />
    </svg>
  );
}

// An arrow back into a column of lines: the stack.
function Unplace() {
  return (
    <svg {...svg}>
      <line x1="9" x2="14" y1="4" y2="4" />
      <line x1="9" x2="14" y1="8" y2="8" />
      <line x1="9" x2="14" y1="12" y2="12" />
      <path d="M2 8h4M4.5 6L6.5 8l-2 2" />
    </svg>
  );
}
