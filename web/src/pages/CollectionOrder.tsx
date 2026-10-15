import { Button, toast } from "@heroui/react";
import { Reorder, useDragControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, imageUrl, type Category, type CollectionOrder as Order, type Refresh } from "../api";
import { Choice } from "../components/ui";
import { useSettings } from "../settings";
import { DEFAULT_REFRESH, refreshOptions } from "../timing";
import { DragHandle } from "./category/ItemsTab";

const ORDERS: { id: Order; label: string; description: string }[] = [
  { id: "in_order", label: "In order", description: "Top to bottom as listed below, then from the top again" },
  { id: "shuffle", label: "Shuffle", description: "A random order, every collection once before any comes back" },
];

// Which collection the frame moves on to: in the order set here, or shuffled.
// The list holds the collections in rotation, each with its refresh, so they
// can be set here without visiting every collection; with "In order" they
// can also be sorted, and the order is also the home screen's.
export function CollectionOrder(props: { value: Order; onChange: (order: Order) => void }) {
  const [order, setOrder] = useState<Category[] | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    api.categories().then((all) => setOrder(all.filter((c) => c.enabled)), () => setOrder([]));
  }, []);

  const save = async (next: Category[]) => {
    try {
      await api.reorderCategories(next.map((c) => c.id));
    } catch (e) {
      toast.danger((e as Error).message);
    }
  };

  const setRefresh = async (category: Category, refresh: Refresh | null) => {
    setOrder((old) => old && old.map((c) => (c.id === category.id ? { ...c, refresh } : c)));
    try {
      await api.updateCategory(category.id, { refresh });
    } catch (e) {
      toast.danger((e as Error).message);
    }
  };

  const move = (index: number, delta: number) => {
    if (!order) return;
    const next = [...order];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    setOrder(next);
    save(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <Choice label="Collection order" value={props.value} onChange={props.onChange} options={ORDERS} />
      {order && order.length > 0 && (
        <Reorder.Group
          as="ul"
          axis="y"
          values={order}
          onReorder={setOrder}
          className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
        >
          {order.map((c, index) => (
            <Row
              key={c.id}
              category={c}
              number={index + 1}
              isFirst={index === 0}
              isLast={index === order.length - 1}
              sortable={props.value === "in_order" && order.length > 1}
              onDragEnd={() => orderRef.current && save(orderRef.current)}
              onMove={(delta) => move(index, delta)}
              onRefresh={(refresh) => setRefresh(c, refresh)}
            />
          ))}
        </Reorder.Group>
      )}
    </div>
  );
}

function Row(props: {
  category: Category;
  number: number;
  isFirst: boolean;
  isLast: boolean;
  sortable: boolean; // "In order": a drag handle, a number and arrows
  onDragEnd: () => void;
  onMove: (delta: number) => void;
  onRefresh: (refresh: Refresh | null) => void;
}) {
  const { category } = props;
  const drag = useDragControls();
  const frame = useSettings();
  return (
    <Reorder.Item
      as="li"
      value={category}
      dragListener={false}
      dragControls={drag}
      onDragEnd={props.onDragEnd}
      whileDrag={{ scale: 1.01, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 1 }}
      className="relative flex items-center gap-2 border-b border-separator bg-surface p-2 last:border-b-0"
    >
      {props.sortable && (
        <>
          <DragHandle onPointerDown={(e) => drag.start(e)} />
          <span className="w-5 text-right font-mono text-sm tabular-nums text-muted">{props.number}</span>
        </>
      )}
      {category.cover ? (
        <img
          src={imageUrl(category.cover)}
          alt=""
          draggable={false}
          className="h-8 w-10 flex-none rounded bg-surface-secondary object-contain"
          style={{ imageRendering: category.pixelate ? "pixelated" : "auto" }}
        />
      ) : (
        <div className="h-8 w-10 flex-none rounded bg-surface-secondary" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
      <div className="w-44 flex-none">
        <Choice
          label={`${category.name} refresh`}
          hideLabel
          value={category.refresh ?? DEFAULT_REFRESH}
          onChange={(r) => props.onRefresh(r === DEFAULT_REFRESH ? null : (r as Refresh))}
          options={refreshOptions(frame.refresh, true)}
        />
      </div>
      {props.sortable && (
        <>
          <Button size="sm" variant="ghost" isIconOnly aria-label="Move up" isDisabled={props.isFirst} onPress={() => props.onMove(-1)}>
            ↑
          </Button>
          <Button size="sm" variant="ghost" isIconOnly aria-label="Move down" isDisabled={props.isLast} onPress={() => props.onMove(1)}>
            ↓
          </Button>
        </>
      )}
    </Reorder.Item>
  );
}
