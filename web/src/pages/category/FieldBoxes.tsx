import { useEffect, useRef, useState } from "react";
import type { Box, Field, Preview } from "../../api";
import { FieldToolbar } from "./FieldToolbar";

const GRID = 4;
const MIN_SIZE = 16;
// How close (in screen pixels) an edge or centre must come to a guide to snap to it.
const SNAP_DISTANCE = 6;

const snap = (n: number) => Math.round(n / GRID) * GRID;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

// A field's box: where it was placed, or else where the stack drew it on the
// last render (with the text size it was drawn at).
export function boxOf(key: string, placed: Record<string, Box>, measured: Preview["boxes"]): Box | null {
  const m = measured[key];
  if (placed[key]) return { size: m?.[4], ...placed[key] };
  return m ? { x: m[0], y: m[1], w: m[2], h: m[3], size: m[4] } : null;
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

// Boxes over the preview, one per field, to drag into place and resize.
// Dragging a field gives it a fixed box; until then it sits where the stack
// put it (as measured on the last render).
export function FieldBoxes(props: {
  canvas: { width: number; height: number };
  fields: Field[];
  measured: Preview["boxes"];
  placed: Record<string, Box>;
  onChange: (placed: Record<string, Box>) => void;
  selected: string | null;
  onSelect: (key: string | null) => void;
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

  // Where a field's content ends, measured from its top on the last render
  // (for text, where its last line ends rather than the bottom of its box).
  const contentHeight = (key: string) => {
    const m = measured[key];
    return m ? m[5] - m[1] : null;
  };

  // A field's box as it is drawn now: a field linked below another sits
  // `gap` under where that field's content ends, wherever that field is.
  const shown = (key: string, seen = new Set<string>()): Box | null => {
    const box = boxOf(key, placed, measured);
    if (!box?.below || seen.has(key)) return box;
    seen.add(key);
    const above = shown(box.below, seen);
    const height = contentHeight(box.below);
    return above && height !== null ? { ...box, y: above.y + height + (box.gap ?? 0) } : box;
  };

  // Saves a box; for a linked field, its new position becomes its new gap.
  const place = (key: string, box: Box) => {
    if (box.below) {
      const above = shown(box.below);
      const height = contentHeight(box.below);
      if (above && height !== null) box = { ...box, gap: Math.round(box.y - (above.y + height)) };
    }
    props.onChange({ ...placed, [key]: box });
  };

  // The fields `key` can be linked below: any other field that isn't (by way
  // of others) linked below `key` itself.
  const linkable = (key: string) =>
    props.fields.filter((f) => {
      for (let k: string | undefined = f.key, n = 0; k && n <= props.fields.length; k = placed[k]?.below, n++) {
        if (k === key) return false;
      }
      return measured[f.key] !== undefined;
    });

  const link = (key: string, below: string | null) => {
    const box = shown(key);
    if (!box) return;
    const { below: _, gap: __, ...rest } = box;
    place(key, below ? { ...rest, below } : rest);
  };

  const unplace = (key: string) => {
    const { [key]: _, ...rest } = placed;
    props.onChange(rest);
  };

  const [dragging, setDragging] = useState(false);

  type Mode = "move" | "scale" | "width" | "height";

  const startDrag = (e: React.PointerEvent, field: Field, mode: Mode) => {
    const key = field.key;
    const start = shown(key);
    if (!start || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // preventDefault keeps the browser from focusing the box, which the arrow keys need.
    (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-box]")?.focus({ preventScroll: true });
    props.onSelect(key);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const [x0, y0] = [e.clientX, e.clientY];
    setDragging(true);

    // Guide lines: the canvas edges and centre, and the edges and centres of the other fields.
    const others = props.fields.filter((f) => f.key !== key).flatMap((f) => shown(f.key) ?? []);
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
        place(key, {
          ...start,
          x: clamp(sx.pos, 0, canvas.width - start.w),
          y: clamp(sy.pos, 0, canvas.height - start.h),
        });
      } else if (mode === "scale") {
        // The corner scales the whole field, so images keep their shape and text grows with its box.
        const most = Math.min((canvas.width - start.x) / start.w, (canvas.height - start.y) / start.h);
        const least = MIN_SIZE / Math.min(start.w, start.h);
        const f = clamp(Math.max((start.w + dx) / start.w, (start.h + dy) / start.h), least, most);
        place(key, {
          ...start,
          w: Math.round(start.w * f),
          h: Math.round(start.h * f),
          ...(field.type === "text" && start.size ? { size: clamp(Math.round(start.size * f), 6, 400) } : {}),
        });
      } else {
        // The side handles change only the box, so text rewraps at the same size.
        place(key, {
          ...start,
          w: mode === "width" ? clamp(snap(start.w + dx), MIN_SIZE, canvas.width - start.x) : start.w,
          h: mode === "height" ? clamp(snap(start.h + dy), MIN_SIZE, canvas.height - start.y) : start.h,
        });
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

  // Arrow keys nudge the selected field by a pixel, or ten with Shift.
  const nudge = (e: React.KeyboardEvent, key: string) => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const box = shown(key);
    if (!delta || !box) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    place(key, {
      ...box,
      x: clamp(box.x + delta[0] * step, 0, canvas.width - box.w),
      y: clamp(box.y + delta[1] * step, 0, canvas.height - box.h),
    });
  };

  // The selected field's options, under its box (or above it, near the bottom),
  // lined up with whichever side of the canvas it is on.
  const toolbar = (key: string) => {
    const box = shown(key);
    if (!box) return null;
    const zs = Object.values(placed).map((b) => b.z ?? 0);
    const restyle = (changes: Partial<Box>) => place(key, { ...box, ...changes });
    const right = box.x + box.w / 2 > canvas.width / 2;
    const low = box.y + box.h > canvas.height - 40;
    return (
      <div
        className="absolute z-20"
        style={{
          ...(right ? { right: (canvas.width - box.x - box.w) * scale } : { left: box.x * scale }),
          ...(low ? { bottom: (canvas.height - box.y) * scale + 26 } : { top: (box.y + box.h) * scale + 8 }),
        }}
      >
        <FieldToolbar
          box={box}
          isPlaced={!!placed[key]}
          linkable={linkable(key)}
          onChange={restyle}
          onLink={(below) => link(key, below)}
          onFront={() => restyle({ z: Math.max(0, ...zs) + 1 })}
          onBack={() => restyle({ z: Math.min(0, ...zs) - 1 })}
          onUnplace={() => unplace(key)}
        />
      </div>
    );
  };

  // Front-most last, so it is also on top here.
  const order = props.fields
    .map((field, i) => ({ field, i, z: placed[field.key]?.z ?? 0 }))
    .sort((a, b) => a.z - b.z || a.i - b.i);

  const handle = "absolute rounded-sm";
  return (
    <div ref={ref} className="absolute inset-0 touch-none" onPointerDown={() => props.onSelect(null)}>
      {order.map(({ field }) => {
        const box = shown(field.key);
        if (!box) return null;
        const selected = props.selected === field.key;
        return (
          <div
            key={field.key}
            data-box
            role="button"
            tabIndex={0}
            aria-label={`${field.label}: drag to move`}
            onPointerDown={(e) => startDrag(e, field, "move")}
            onKeyDown={(e) => nudge(e, field.key)}
            onFocus={() => props.onSelect(field.key)}
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
              {placed[field.key] ? "" : " · in stack"}
            </span>
            {selected && (
              <>
                <span
                  aria-hidden="true"
                  title="Drag to resize"
                  onPointerDown={(e) => startDrag(e, field, "scale")}
                  className={`${handle} -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize`}
                  style={{ background: "var(--accent)" }}
                />
                {field.type === "text" && (
                  <>
                    <span
                      aria-hidden="true"
                      title="Drag to change the width"
                      onPointerDown={(e) => startDrag(e, field, "width")}
                      className={`${handle} -right-1 top-1/2 h-4 w-1.5 -translate-y-1/2 cursor-ew-resize`}
                      style={{ background: "var(--accent)" }}
                    />
                    <span
                      aria-hidden="true"
                      title="Drag to change the height"
                      onPointerDown={(e) => startDrag(e, field, "height")}
                      className={`${handle} -bottom-1 left-1/2 h-1.5 w-4 -translate-x-1/2 cursor-ns-resize`}
                      style={{ background: "var(--accent)" }}
                    />
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
      {props.selected && !dragging && toolbar(props.selected)}
      {guides.x !== null && (
        <div className="pointer-events-none absolute inset-y-0 w-px" style={{ left: guides.x * scale, background: "var(--danger)" }} />
      )}
      {guides.y !== null && (
        <div className="pointer-events-none absolute inset-x-0 h-px" style={{ top: guides.y * scale, background: "var(--danger)" }} />
      )}
    </div>
  );
}
