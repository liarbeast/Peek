import { useEffect, useRef, useState } from "react";
import type { Box, CategoryImage, Preview } from "../../api";
import { FieldToolbar } from "./FieldToolbar";

const GRID = 4;
const MIN_SIZE = 16;
// How close (in screen pixels) an edge or centre must come to a guide to snap to it.
const SNAP_DISTANCE = 6;

const snap = (n: number) => Math.round(n / GRID) * GRID;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

// Something on the canvas: one of the category's fields, or one of its style
// images (drawn the same for every item; their keys start with @).
export interface Layer {
  key: string;
  label: string;
  type: "text" | "image";
  image?: CategoryImage;
}

// A layer's box: its saved one, or else where the last render drew it (a
// style image that was never moved sits behind everything). Text is as tall
// as its lines, so its height always comes from the last render; text that
// grows up or from the middle moves its top to keep its bottom or centre.
function boxOf(key: string, placed: Record<string, Box>, measured: Preview["boxes"], text: boolean): Box | null {
  const m = measured[key];
  if (placed[key] && text && m) {
    const box = { size: m[4], ...placed[key] };
    const extra = box.h - m[3]; // how much shorter the text came out than the box as placed
    const y = box.y + (box.grow === "up" ? extra : box.grow === "middle" ? Math.round(extra / 2) : 0);
    return { ...box, y, h: m[3] };
  }
  if (placed[key]) return { size: m?.[4], ...placed[key] };
  if (!m) return null;
  return { x: m[0], y: m[1], w: m[2], h: m[3], ...(key.startsWith("@") ? { z: -1 } : { size: m[4] }) };
}

// Moves `start` (a box edge) so that its start, centre or end lands on the
// nearest guide line within `reach`; otherwise onto the grid.
function snapAxis(start: number, size: number, lines: number[], reach: number) {
  let best: { pos: number; guide: number } | null = null;
  for (const line of lines) {
    for (const offset of [0, size / 2, size]) {
      const d = line - (start + offset);
      if (Math.abs(d) <= reach && (!best || Math.abs(d) < Math.abs(best.pos - start))) {
        best = { pos: Math.round(start + d), guide: line };
      }
    }
  }
  return best ?? { pos: snap(start), guide: null };
}

type Guides = { x: number | null; y: number | null };

// Boxes over the preview, one per field and style image, to drag into place
// and resize; clicking one shows its options next to it.
export function FieldBoxes(props: {
  canvas: { width: number; height: number };
  fields: Layer[];
  measured: Preview["boxes"];
  placed: Record<string, Box>;
  onChange: (placed: Record<string, Box>) => void;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onImageChange: (image: CategoryImage, changes: Partial<CategoryImage>) => void;
  onImageDelete: (image: CategoryImage) => void;
}) {
  const { canvas, placed, measured } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [guides, setGuides] = useState<Guides>({ x: null, y: null });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setScale(el.clientWidth / canvas.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvas.width]);

  // How tall a field was on the last render.
  const contentHeight = (key: string) => measured[key]?.[3] ?? null;
  const isText = (key: string) => props.fields.find((f) => f.key === key)?.type === "text";

  // A field's box as it is drawn now: a field attached below another sits
  // `gap` under where that field's content ends, wherever that field is.
  // Attached fields can point at fields this overlay doesn't list (hidden
  // ones), which still have a saved box.
  const shown = (key: string, seen = new Set<string>()): Box | null => {
    const box = boxOf(key, placed, measured, isText(key));
    if (!box?.below || seen.has(key)) return box;
    seen.add(key);
    const above = shown(box.below, seen);
    if (!above) return box;
    const height = contentHeight(box.below);
    // An empty or hidden field isn't drawn and passes its place on.
    return { ...box, y: height === null ? above.y : above.y + height + (box.gap ?? 0) };
  };

  // Saves boxes; for an attached field, its new position becomes its new gap.
  const placeAll = (boxes: Record<string, Box>) => {
    const next = { ...placed };
    for (let [key, box] of Object.entries(boxes)) {
      if (box.below) {
        const above = shown(box.below);
        const height = contentHeight(box.below);
        if (above && height !== null) box = { ...box, gap: Math.round(box.y - (above.y + height)) };
      }
      next[key] = box;
    }
    props.onChange(next);
  };
  const place = (key: string, box: Box) => placeAll({ [key]: box });

  // Shift-click picks several fields, to move together; the toolbar is for one at a time.
  const [group, setGroup] = useState<string[]>([]);
  const chosen = group.length > 1 ? group : props.selected ? [props.selected] : [];
  const clear = () => {
    setGroup([]);
    props.onSelect(null);
  };

  // Moves the chosen fields by (dx, dy), kept on the canvas as one block.
  // A field attached to another that moves too just follows it.
  const shift = (starts: Record<string, Box>, dx: number, dy: number) => {
    const boxes = Object.values(starts);
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    dx = clamp(dx, -left, canvas.width - right);
    dy = clamp(dy, -top, canvas.height - bottom);
    const moved: Record<string, Box> = {};
    for (const [key, box] of Object.entries(starts)) {
      if (box.below && starts[box.below]) moved[key] = { ...box, x: box.x + dx };
      else moved[key] = { ...box, x: box.x + dx, y: box.y + dy };
    }
    placeAll(moved);
  };

  // What `key` can be attached below: anything else that isn't (by way of
  // others) attached below `key` itself.
  const attachable = (key: string) =>
    props.fields.filter((f) => {
      for (let k: string | undefined = f.key, n = 0; k && n <= props.fields.length; k = placed[k]?.below, n++) {
        if (k === key) return false;
      }
      return measured[f.key] !== undefined;
    });

  const attach = (key: string, below: string | null) => {
    const box = shown(key);
    if (!box) return;
    const { below: _, gap: __, ...rest } = box;
    place(key, below ? { ...rest, below } : rest);
  };

  const [dragging, setDragging] = useState(false);

  type Mode = "move" | "scale" | "width";

  const startDrag = (e: React.PointerEvent, field: Layer, mode: Mode) => {
    const key = field.key;
    const start = shown(key);
    if (!start || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // preventDefault keeps the browser from focusing the box, which the arrow keys need.
    (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-box]")?.focus({ preventScroll: true });
    let members = [key];
    if (mode === "move" && e.shiftKey) {
      members = chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key];
      setGroup(members.length > 1 ? members : []);
      props.onSelect(members.at(-1) ?? null);
      if (!members.includes(key)) return;
    } else if (mode === "move" && group.length > 1 && group.includes(key)) {
      members = group;
    } else {
      setGroup([]);
      props.onSelect(key);
    }
    const starts = Object.fromEntries(members.flatMap((k) => (shown(k) ? [[k, shown(k)!]] : [])));
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const [x0, y0] = [e.clientX, e.clientY];
    setDragging(true);

    // Guide lines: the canvas edges and centre, and the edges and centres of the other fields.
    const others = props.fields.filter((f) => !members.includes(f.key)).flatMap((f) => shown(f.key) ?? []);
    const xs = [0, canvas.width / 2, canvas.width, ...others.flatMap((b) => [b.x, b.x + b.w / 2, b.x + b.w])];
    const ys = [0, canvas.height / 2, canvas.height, ...others.flatMap((b) => [b.y, b.y + b.h / 2, b.y + b.h])];

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / scale;
      const dy = (ev.clientY - y0) / scale;
      const reach = ev.altKey ? -1 : SNAP_DISTANCE / scale; // Alt turns snapping off
      if (mode === "move") {
        const sx = snapAxis(start.x + dx, start.w, xs, reach);
        const sy = snapAxis(start.y + dy, start.h, ys, reach);
        setGuides({ x: sx.guide, y: sy.guide });
        shift(starts, sx.pos - start.x, sy.pos - start.y);
      } else if (mode === "scale") {
        // The corner scales an image, keeping its shape.
        const most = Math.min((canvas.width - start.x) / start.w, (canvas.height - start.y) / start.h);
        const least = MIN_SIZE / Math.min(start.w, start.h);
        const f = clamp(Math.max((start.w + dx) / start.w, (start.h + dy) / start.h), least, most);
        place(key, {
          ...start,
          w: Math.round(start.w * f),
          h: Math.round(start.h * f),
        });
      } else {
        // Text only gets wider or narrower; it rewraps, and its lines set its height.
        place(key, { ...start, w: clamp(snap(start.w + dx), MIN_SIZE, canvas.width - start.x) });
      }
    };
    const end = () => {
      setGuides({ x: null, y: null });
      setDragging(false);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  // Arrow keys nudge the selected fields by a pixel, or ten with Shift; Escape lets go of them.
  const nudge = (e: React.KeyboardEvent, key: string) => {
    if (e.key === "Escape") {
      (e.currentTarget as HTMLElement).blur();
      clear();
      return;
    }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const members = chosen.includes(key) ? chosen : [key];
    const starts = Object.fromEntries(members.flatMap((k) => (shown(k) ? [[k, shown(k)!]] : [])));
    if (!delta || !starts[key]) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    shift(starts, delta[0] * step, delta[1] * step);
  };

  // The selected field's options, under its box (or above it, near the bottom),
  // lined up with whichever side of the canvas it is on.
  const toolbar = (key: string) => {
    const box = shown(key);
    if (!box) return null;
    const layer = props.fields.find((f) => f.key === key);
    if (!layer) return null;
    const zs = props.fields.map((f) => shown(f.key)?.z ?? 0);
    const restyle = (changes: Partial<Box>) => place(key, { ...box, ...changes });
    const right = box.x + box.w / 2 > canvas.width / 2;
    const low = box.y + box.h > canvas.height - 40;
    return (
      <div
        key={key}
        className="absolute z-20"
        style={{
          ...(right ? { right: (canvas.width - box.x - box.w) * scale } : { left: box.x * scale }),
          ...(low ? { bottom: (canvas.height - box.y) * scale + 26 } : { top: (box.y + box.h) * scale + 8 }),
        }}
      >
        <FieldToolbar
          layer={layer}
          box={box}
          attachable={attachable(key)}
          onChange={restyle}
          onAttach={(below) => attach(key, below)}
          onFront={() => restyle({ z: Math.max(0, ...zs) + 1 })}
          onBack={() => restyle({ z: Math.min(0, ...zs) - 1 })}
          onImageChange={(changes) => layer.image && props.onImageChange(layer.image, changes)}
          onImageDelete={() => layer.image && props.onImageDelete(layer.image)}
        />
      </div>
    );
  };

  // Front-most last, so it is also on top here.
  const order = props.fields
    .map((field, i) => ({ field, i, z: shown(field.key)?.z ?? 0 }))
    .sort((a, b) => a.z - b.z || a.i - b.i);

  const handle = "absolute rounded-sm";
  return (
    <div ref={ref} className="absolute inset-0 touch-none" onPointerDown={clear}>
      {order.map(({ field }) => {
        const box = shown(field.key);
        if (!box) return null;
        const selected = chosen.includes(field.key);
        return (
          <div
            key={field.key}
            data-box
            role="button"
            tabIndex={0}
            aria-label={`${field.label}: drag to move`}
            onPointerDown={(e) => startDrag(e, field, "move")}
            onKeyDown={(e) => nudge(e, field.key)}
            onFocus={() => {
              if (chosen.includes(field.key)) return;
              setGroup([]);
              props.onSelect(field.key);
            }}
            className={`group absolute cursor-move outline-none ${selected ? "z-10" : ""}`}
            style={{
              left: box.x * scale,
              top: box.y * scale,
              width: box.w * scale,
              height: box.h * scale,
              border: `2px ${selected ? "solid" : "dashed"} var(--accent)`,
              background: selected ? "color-mix(in oklab, var(--accent) 12%, transparent)" : undefined,
              opacity: selected ? 1 : 0.75,
            }}
          >
            {/* The name sits outside the box (above it, or below near the top edge) so it never hides the field,
                and only shows while the field is selected or hovered. */}
            <span
              className={`pointer-events-none absolute -left-0.5 whitespace-nowrap rounded px-1.5 text-[11px] leading-5 ${
                box.y * scale < 22 ? "top-full mt-0.5" : "bottom-full mb-0.5"
              } ${selected ? "" : "hidden group-hover:block"}`}
              style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              {field.label}
            </span>
            {selected && group.length < 2 && (
              <>
                {field.type === "text" ? (
                  <span
                    aria-hidden="true"
                    title="Drag to change the width"
                    onPointerDown={(e) => startDrag(e, field, "width")}
                    className={`${handle} -right-1 top-1/2 h-5 w-2 -translate-y-1/2 cursor-ew-resize`}
                    style={{ background: "var(--accent)" }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    title="Drag to resize"
                    onPointerDown={(e) => startDrag(e, field, "scale")}
                    className={`${handle} -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize`}
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
      {props.selected && group.length < 2 && !dragging && toolbar(props.selected)}
      {guides.x !== null && (
        <div className="pointer-events-none absolute inset-y-0 w-px" style={{ left: guides.x * scale, background: "var(--danger)" }} />
      )}
      {guides.y !== null && (
        <div className="pointer-events-none absolute inset-x-0 h-px" style={{ top: guides.y * scale, background: "var(--danger)" }} />
      )}
    </div>
  );
}
