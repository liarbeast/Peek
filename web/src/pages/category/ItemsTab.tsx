import { Button, toast } from "@heroui/react";
import { Reorder, useDragControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, describeItem, imageUrl, type Category, type Item } from "../../api";
import { PanelImage } from "../../components/PanelImage";
import { Dialog, Toggle } from "../../components/ui";
import { Label, Radio, RadioGroup } from "react-aria-components";
import { ImportDialog } from "./ImportDialog";
import { ItemDialog } from "./ItemDialog";
import { SourceSection } from "./SourceSection";

const MODES = [
  { id: "manual", label: "By hand", description: "Add, edit and order items yourself, or import a CSV" },
  { id: "source", label: "From a data source", description: "Read from a web address every day; not editable" },
] as const;

export function ItemsTab(props: {
  category: Category;
  items: Item[];
  onChange: () => void;
  onCategoryChange: (c: Category) => void;
}) {
  const { category, items, onChange } = props;
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [previewing, setPreviewing] = useState<Item | null>(null);
  const [uploading, setUploading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const hasImageField = category.fields.some((f) => f.type === "image");
  // Where items come from. Picking "From a data source" only shows its setup;
  // it takes over once saved. Going back to "By hand" keeps the fetched items.
  const [mode, setMode] = useState<"manual" | "source">(category.source ? "source" : "manual");
  const fromSource = mode === "source";

  const chooseMode = async (next: "manual" | "source") => {
    setMode(next);
    if (next === "manual" && category.source) {
      try {
        props.onCategoryChange(await api.updateCategory(category.id, { source: { url: "" } } as Partial<Category>));
        toast.success("Items are added by hand again. The fetched items stay, and you can edit them now.");
      } catch (e) {
        setMode("source");
        toast.danger((e as Error).message);
      }
    }
  };

  // The list as shown, which runs ahead of the server while dragging.
  const [order, setOrder] = useState(items);
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => setOrder(items), [items]);

  const uploadMany = async (files: FileList | null) => {
    if (!files?.length) return;
    const form = new FormData();
    for (const f of Array.from(files)) form.append("images", f);
    setUploading(true);
    try {
      const created = await api.createItemsFromImages(category.id, form);
      toast.success(`Added ${created.length} ${created.length === 1 ? "item" : "items"}`);
      onChange();
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  };

  const saveOrder = async (next: Item[]) => {
    if (next.every((item, i) => item.id === items[i]?.id)) return;
    try {
      await api.reorderItems(category.id, next.map((i) => i.id));
    } catch (e) {
      toast.danger((e as Error).message);
    }
    onChange();
  };

  const move = (index: number, delta: number) => {
    const next = [...order];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    setOrder(next);
    saveOrder(next);
  };

  const toggle = async (item: Item, enabled: boolean) => {
    const form = new FormData();
    form.append("enabled", String(enabled));
    await api.updateItem(item.id, form);
    onChange();
  };

  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);
  const removeAll = async () => {
    setConfirmingDeleteAll(false);
    try {
      await api.deleteAllItems(category.id);
      toast.success("All items deleted");
    } catch (e) {
      toast.danger((e as Error).message);
    }
    onChange();
  };

  const remove = async (item: Item) => {
    await api.deleteItem(item.id);
    toast.success("Item deleted");
    onChange();
  };

  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        value={mode}
        onChange={(m) => chooseMode(m as "manual" | "source")}
        orientation="horizontal"
        className="flex flex-col gap-2"
      >
        <Label className="text-sm font-medium">Where items come from</Label>
        <div className="grid max-w-lg grid-cols-2 gap-3">
          {MODES.map((m) => (
            <Radio
              key={m.id}
              value={m.id}
              className={({ isSelected, isFocusVisible }) =>
                `cursor-pointer rounded-xl border-2 bg-surface p-3 transition ${
                  isSelected ? "border-accent" : "border-border hover:border-default-foreground/30"
                } ${isFocusVisible ? "ring-2 ring-accent ring-offset-2" : ""}`
              }
            >
              <p className="font-medium">{m.label}</p>
              <p className="text-sm text-muted">{m.description}</p>
            </Radio>
          ))}
        </div>
      </RadioGroup>

      {fromSource && (
        <SourceSection
          category={category}
          itemCount={items.length}
          onSaved={(c) => {
            props.onCategoryChange(c);
            onChange();
          }}
        />
      )}

      {!fromSource && (
        <div className="flex flex-wrap gap-2">
          <Button onPress={() => setEditing("new")} isDisabled={category.fields.length === 0}>
            Add item
          </Button>
          {hasImageField && (
            <>
              <Button variant="tertiary" isDisabled={uploading} onPress={() => imageInput.current?.click()}>
                {uploading ? "Uploading…" : "Upload several images"}
              </Button>
              <input
                ref={imageInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                hidden
                onChange={(e) => uploadMany(e.target.files)}
              />
            </>
          )}
          <Button variant="tertiary" onPress={() => csvInput.current?.click()}>
            Import CSV
          </Button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              setCsvFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          {items.length > 0 && (
            <Button variant="danger-soft" className="ml-auto" onPress={() => setConfirmingDeleteAll(true)}>
              Delete all
            </Button>
          )}
        </div>
      )}
      <Dialog
        isOpen={confirmingDeleteAll}
        onOpenChange={setConfirmingDeleteAll}
        title={`Delete all ${items.length} items?`}
        size="sm"
        footer={
          <>
            <Button variant="tertiary" onPress={() => setConfirmingDeleteAll(false)}>
              Cancel
            </Button>
            <Button variant="danger" onPress={removeAll}>
              Delete all
            </Button>
          </>
        }
      >
        <p>Every item in {category.name} and its images will be deleted. This can't be undone.</p>
      </Dialog>

      {category.fields.length === 0 && (
        <p className="text-muted">This collection has no fields yet. Add some on the Fields tab, or import a CSV.</p>
      )}
      {!fromSource && category.fields.length > 0 && items.length === 0 && (
        <p className="text-muted">
          No items yet. Add one
          {hasImageField ? ", upload a batch of images" : ""}, or import a CSV.
        </p>
      )}

      {order.length > 0 && (
        <Reorder.Group
          as="ul"
          axis="y"
          values={order}
          onReorder={setOrder}
          className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
        >
          {order.map((item, index) => (
            <ItemRow
              key={item.id}
              category={category}
              item={item}
              number={index + 1}
              readOnly={!!category.source}
              isFirst={index === 0}
              isLast={index === order.length - 1}
              onDragEnd={() => saveOrder(orderRef.current)}
              onMove={(delta) => move(index, delta)}
              onToggle={(on) => toggle(item, on)}
              onPreview={() => setPreviewing(item)}
              onEdit={() => setEditing(item)}
              onDelete={() => remove(item)}
            />
          ))}
        </Reorder.Group>
      )}

      <ItemDialog
        key={editing === "new" ? "new" : (editing?.id ?? "none")}
        category={category}
        item={editing === "new" ? null : editing}
        isOpen={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={onChange}
      />
      <ItemPreviewDialog category={category} item={previewing} onClose={() => setPreviewing(null)} />
      <ImportDialog
        key={csvFile ? `${csvFile.name}-${csvFile.lastModified}` : "none"}
        category={category}
        file={csvFile}
        onClose={() => setCsvFile(null)}
        onImported={(c) => {
          props.onCategoryChange(c);
          onChange();
        }}
      />
    </div>
  );
}

function ItemRow(props: {
  category: Category;
  item: Item;
  number: number;
  // Filled from a data source: only previewing is left.
  readOnly: boolean;
  isFirst: boolean;
  isLast: boolean;
  onDragEnd: () => void;
  onMove: (delta: number) => void;
  onToggle: (on: boolean) => void;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { item, category } = props;
  const drag = useDragControls();
  const { title, detail, image } = describeItem(category.fields, item);

  return (
    <Reorder.Item
      as="li"
      value={item}
      dragListener={false}
      dragControls={drag}
      onDragEnd={props.onDragEnd}
      whileDrag={{
        scale: 1.01,
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        zIndex: 1,
      }}
      className="relative flex flex-wrap items-center gap-3 border-b border-separator bg-surface p-3 last:border-b-0"
    >
      <div className="flex flex-none items-center gap-1">
        {!props.readOnly && <DragHandle onPointerDown={(e) => drag.start(e)} />}
        <span className="w-7 text-right font-mono text-sm tabular-nums text-muted">{props.number}</span>
      </div>
      <div className={`flex min-w-0 flex-1 items-center gap-3 ${item.enabled ? "" : "opacity-50"}`}>
        {image ? (
          <img
            src={imageUrl(image)}
            alt=""
            draggable={false}
            className="h-14 w-24 flex-none rounded-md bg-surface-secondary object-contain"
            style={{ imageRendering: category.pixelate ? "pixelated" : "auto" }}
          />
        ) : (
          <div className="flex h-14 w-24 flex-none items-center justify-center rounded-md bg-surface-secondary text-2xl text-muted">
            “
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          <p className="truncate text-sm text-muted">{detail || " "}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {!props.readOnly && (
          <>
            <Toggle label="Show" isSelected={item.enabled} onChange={props.onToggle} />
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label="Move up"
              isDisabled={props.isFirst}
              onPress={() => props.onMove(-1)}
            >
              ↑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label="Move down"
              isDisabled={props.isLast}
              onPress={() => props.onMove(1)}
            >
              ↓
            </Button>
          </>
        )}
        <Button size="sm" variant="tertiary" onPress={props.onPreview}>
          Preview
        </Button>
        {!props.readOnly && (
          <>
            <Button size="sm" variant="tertiary" onPress={props.onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="danger-soft" onPress={props.onDelete}>
              Delete
            </Button>
          </>
        )}
      </div>
    </Reorder.Item>
  );
}

export function DragHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      className="cursor-grab touch-none rounded p-1 text-muted hover:bg-surface-secondary active:cursor-grabbing"
      onPointerDown={onPointerDown}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        {[3, 8, 13].flatMap((y) => [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
      </svg>
    </button>
  );
}

function ItemPreviewDialog({
  category,
  item,
  onClose,
}: {
  category: Category;
  item: Item | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const show = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await api.showItem(item.id);
      toast.success("The frame shows this on its next wake");
      window.dispatchEvent(new Event("peek:frame-changed"));
      onClose();
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      isOpen={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title={item ? describeItem(category.fields, item).title : "Preview"}
      size="lg"
      footer={
        <Button isDisabled={busy} onPress={show}>
          Show on frame
        </Button>
      }
    >
      {item && <PanelImage alt="Preview" load={() => api.previewItem(item.id)} deps={[item.id]} />}
    </Dialog>
  );
}
