import { useEffect, useRef, useState } from "react";
import type { Box, Field, Preview } from "../../api";

const GRID = 4;
const MIN_SIZE = 16;

const snap = (n: number) => Math.round(n / GRID) * GRID;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

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
  const { canvas, placed } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setScale(el.clientWidth / canvas.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvas.width]);

  const boxOf = (key: string): Box | null => {
    if (placed[key]) return placed[key];
    const m = props.measured[key];
    return m ? { x: m[0], y: m[1], w: m[2], h: m[3] } : null;
  };

  const place = (key: string, box: Box) => props.onChange({ ...placed, [key]: box });

  const startDrag = (e: React.PointerEvent, key: string, mode: "move" | "resize") => {
    const start = boxOf(key);
    if (!start || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    props.onSelect(key);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const [x0, y0] = [e.clientX, e.clientY];

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / scale;
      const dy = (ev.clientY - y0) / scale;
      if (mode === "move") {
        place(key, {
          ...start,
          x: clamp(snap(start.x + dx), 0, canvas.width - start.w),
          y: clamp(snap(start.y + dy), 0, canvas.height - start.h),
        });
      } else {
        place(key, {
          ...start,
          w: clamp(snap(start.w + dx), MIN_SIZE, canvas.width - start.x),
          h: clamp(snap(start.h + dy), MIN_SIZE, canvas.height - start.y),
        });
      }
    };
    const end = () => {
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
    const box = boxOf(key);
    if (!delta || !box) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    place(key, {
      ...box,
      x: clamp(box.x + delta[0] * step, 0, canvas.width - box.w),
      y: clamp(box.y + delta[1] * step, 0, canvas.height - box.h),
    });
  };

  return (
    <div ref={ref} className="absolute inset-0 touch-none" onPointerDown={() => props.onSelect(null)}>
      {props.fields.map((field) => {
        const box = boxOf(field.key);
        if (!box) return null;
        const selected = props.selected === field.key;
        return (
          <div
            key={field.key}
            role="button"
            tabIndex={0}
            aria-label={`${field.label}: drag to move`}
            onPointerDown={(e) => startDrag(e, field.key, "move")}
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
              <span
                aria-hidden="true"
                onPointerDown={(e) => startDrag(e, field.key, "resize")}
                className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm"
                style={{ background: "var(--accent)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
