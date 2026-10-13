import { css } from "@codemirror/lang-css";
import { Button, Chip, Spinner, Tabs, toast } from "@heroui/react";
import CodeMirror from "@uiw/react-codemirror";
import { Reorder, useDragControls } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, imageUrl, type Category, type Item, type ItemOrder, type Template } from "../api";
import { PanelImage } from "../components/PanelImage";
import { Choice, Dialog, TextInput, Toggle } from "../components/ui";
import { go } from "../router";

const ORDERS: Array<{ id: ItemOrder; label: string; description: string }> = [
  { id: "in_order", label: "In order", description: "Top to bottom, then start again" },
  { id: "random", label: "Random", description: "Any item each time, repeats possible" },
  { id: "shuffle", label: "Shuffle", description: "Random, but every item once before repeating" },
];

const COLOURS = ["black", "white", "yellow", "red", "blue", "green"];

export function CategoryPage({ id, templates }: { id: number; templates: Template[] }) {
  const [category, setCategory] = useState<Category | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([api.category(id), api.items(id)]).then(
      ([c, i]) => {
        setCategory(c);
        setItems(i);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);
  useEffect(reload, [reload]);

  if (error) return <p className="text-danger">{error}</p>;
  if (!category) return <Spinner />;
  const template = templates.find((t) => t.name === category.template) ?? templates[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <a href="#/" className="text-sm text-muted hover:underline">
          ← Categories
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{category.name}</h1>
          <Chip size="sm">{template.label}</Chip>
          {!category.enabled && (
            <Chip size="sm" color="warning">
              Off
            </Chip>
          )}
        </div>
      </div>

      <Tabs>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Category sections">
            <Tabs.Tab id="content">
              Content
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="style">
              Style
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="settings">
              Settings
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="content" className="pt-4">
          <ContentTab category={category} template={template} items={items} onChange={reload} />
        </Tabs.Panel>
        <Tabs.Panel id="style" className="pt-4">
          <StyleTab category={category} templates={templates} items={items} onSaved={setCategory} />
        </Tabs.Panel>
        <Tabs.Panel id="settings" className="pt-4">
          <SettingsTab category={category} onSaved={setCategory} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

/* Content ---------------------------------------------------------------- */

function ContentTab(props: { category: Category; template: Template; items: Item[]; onChange: () => void }) {
  const { category, template, items, onChange } = props;
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [previewing, setPreviewing] = useState<Item | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const usesImage = template.fields.includes("image");

  const uploadMany = async (files: FileList | null) => {
    if (!files?.length) return;
    const form = new FormData();
    for (const f of Array.from(files)) form.append("images", f);
    setUploading(true);
    try {
      const created = await api.createItems(category.id, form);
      toast.success(`Added ${created.length} ${created.length === 1 ? "item" : "items"}`);
      onChange();
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  // The list as shown, which runs ahead of the server while dragging.
  const [order, setOrder] = useState(items);
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => setOrder(items), [items]);

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

  const remove = async (item: Item) => {
    await api.deleteItem(item.id);
    toast.success("Item deleted");
    onChange();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onPress={() => setEditing("new")}>Add item</Button>
        {usesImage && (
          <>
            <Button variant="tertiary" isDisabled={uploading} onPress={() => fileInput.current?.click()}>
              {uploading ? "Uploading…" : "Upload several images"}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              hidden
              onChange={(e) => uploadMany(e.target.files)}
            />
          </>
        )}
      </div>

      {items.length === 0 && (
        <p className="text-muted">
          No items yet. {usesImage ? "Add one, or upload a batch of images at once." : "Add your first one."}
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
              item={item}
              number={index + 1}
              pixelated={template.name === "sprite"}
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
        key={editing === "new" ? "new" : editing?.id ?? "none"}
        category={category}
        template={template}
        item={editing === "new" ? null : editing}
        isOpen={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={onChange}
      />
      <ItemPreviewDialog item={previewing} onClose={() => setPreviewing(null)} />
    </div>
  );
}

function ItemDialog(props: {
  category: Category;
  template: Template;
  item: Item | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { item, template } = props;
  const [title, setTitle] = useState(item?.title ?? "");
  const [subtitle, setSubtitle] = useState(item?.subtitle ?? "");
  const [text, setText] = useState(item?.text ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const has = (f: Template["fields"][number]) => template.fields.includes(f);
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);
  const filePreview = fileUrl ?? (item?.image ? imageUrl(item.image) : null);

  const save = async () => {
    const form = new FormData();
    form.append("title", title);
    form.append("subtitle", subtitle);
    form.append("text", text);
    if (file) form.append(item ? "image" : "images", file);
    setBusy(true);
    try {
      if (item) await api.updateItem(item.id, form);
      else await api.createItems(props.category.id, form);
      props.onSaved();
      props.onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      isOpen={props.isOpen}
      onOpenChange={props.onOpenChange}
      title={item ? "Edit item" : "Add item"}
      footer={
        <>
          <Button variant="tertiary" onPress={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button isDisabled={busy} onPress={save}>
            {item ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      {has("image") && (
        <div className="flex items-center gap-3">
          <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-md bg-surface-secondary">
            {filePreview ? (
              <img src={filePreview} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-sm text-muted">No image</span>
            )}
          </div>
          <Button variant="tertiary" onPress={() => fileInput.current?.click()}>
            {filePreview ? "Change image" : "Choose image"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}
      {has("text") && <TextInput label="Text" value={text} onChange={setText} multiline />}
      {has("title") && (
        <TextInput
          label={template.name === "quote" ? "Source" : template.name === "photo" ? "Caption" : "Name"}
          value={title}
          onChange={setTitle}
        />
      )}
      {has("subtitle") && <TextInput label="Subtitle" value={subtitle} onChange={setSubtitle} placeholder="#025" />}
      {error && <p className="text-sm text-danger">{error}</p>}
    </Dialog>
  );
}

function ItemPreviewDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
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
      title={item?.title || "Preview"}
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

function ItemRow(props: {
  item: Item;
  number: number;
  pixelated: boolean;
  isFirst: boolean;
  isLast: boolean;
  onDragEnd: () => void;
  onMove: (delta: number) => void;
  onToggle: (on: boolean) => void;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { item } = props;
  const drag = useDragControls();

  return (
    <Reorder.Item
      as="li"
      value={item}
      dragListener={false}
      dragControls={drag}
      onDragEnd={props.onDragEnd}
      whileDrag={{ scale: 1.01, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 1 }}
      className="relative flex flex-wrap items-center gap-3 border-b border-separator bg-surface p-3 last:border-b-0"
    >
      <div className="flex flex-none items-center gap-1">
        <button
          type="button"
          aria-label="Drag to reorder"
          className="cursor-grab touch-none rounded p-1 text-muted hover:bg-surface-secondary active:cursor-grabbing"
          onPointerDown={(e) => drag.start(e)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            {[3, 8, 13].flatMap((y) => [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
          </svg>
        </button>
        <span className="w-7 text-right font-mono text-sm tabular-nums text-muted">{props.number}</span>
      </div>
      <div className={`flex min-w-0 flex-1 items-center gap-3 ${item.enabled ? "" : "opacity-50"}`}>
        {item.image ? (
          <img
            src={imageUrl(item.image)}
            alt=""
            draggable={false}
            className="h-14 w-24 flex-none rounded-md bg-surface-secondary object-contain"
            style={{ imageRendering: props.pixelated ? "pixelated" : "auto" }}
          />
        ) : (
          <div className="flex h-14 w-24 flex-none items-center justify-center rounded-md bg-surface-secondary text-2xl text-muted">
            “
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.title || item.text || "Untitled"}</p>
          <p className="truncate text-sm text-muted">
            {[item.subtitle, item.title ? item.text : ""].filter(Boolean).join(" · ") || " "}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Toggle label="Show" isSelected={item.enabled} onChange={props.onToggle} />
        <Button size="sm" variant="ghost" isIconOnly aria-label="Move up" isDisabled={props.isFirst} onPress={() => props.onMove(-1)}>
          ↑
        </Button>
        <Button size="sm" variant="ghost" isIconOnly aria-label="Move down" isDisabled={props.isLast} onPress={() => props.onMove(1)}>
          ↓
        </Button>
        <Button size="sm" variant="tertiary" onPress={props.onPreview}>
          Preview
        </Button>
        <Button size="sm" variant="tertiary" onPress={props.onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="danger-soft" onPress={props.onDelete}>
          Delete
        </Button>
      </div>
    </Reorder.Item>
  );
}

/* Style ------------------------------------------------------------------ */

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function StyleTab(props: {
  category: Category;
  templates: Template[];
  items: Item[];
  onSaved: (c: Category) => void;
}) {
  const { category, templates, items } = props;
  const [template, setTemplate] = useState(category.template);
  const [customCss, setCustomCss] = useState(category.custom_css);
  const [previewItem, setPreviewItem] = useState<string>(items[0] ? String(items[0].id) : "");
  const [busy, setBusy] = useState(false);
  const info = templates.find((t) => t.name === template) ?? templates[0];
  const dirty = template !== category.template || customCss !== category.custom_css;
  const debouncedCss = useDebounced(customCss, 700);

  const save = async () => {
    setBusy(true);
    try {
      props.onSaved(await api.updateCategory(category.id, { template, custom_css: customCss }));
      toast.success("Style saved");
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Choice
          label="Layout"
          value={template}
          onChange={setTemplate}
          options={templates.map((t) => ({ id: t.name, label: t.label, description: t.description }))}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Custom CSS</span>
          <div className="overflow-hidden rounded-lg border border-border text-sm">
            <CodeMirror
              value={customCss}
              onChange={setCustomCss}
              extensions={[css()]}
              height="260px"
              placeholder={`${info.classes[0]} {\n  border: 8px solid var(--red);\n}`}
              theme={window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"}
            />
          </div>
          <p className="text-sm text-muted">Elements in this layout:</p>
          <div className="flex flex-wrap gap-1">
            {["body", ...info.classes].map((c) => (
              <Chip key={c} size="sm" variant="soft">
                <code>{c}</code>
              </Chip>
            ))}
          </div>
          <p className="text-sm text-muted">Panel colours:</p>
          <div className="flex flex-wrap gap-1">
            {COLOURS.map((c) => (
              <Chip key={c} size="sm" variant="soft">
                <code>var(--{c})</code>
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button isDisabled={!dirty || busy} onPress={save}>
            Save style
          </Button>
          <Button
            variant="tertiary"
            isDisabled={!dirty}
            onPress={() => {
              setTemplate(category.template);
              setCustomCss(category.custom_css);
            }}
          >
            Undo changes
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {items.length > 0 && (
          <Choice
            label="Preview with"
            value={previewItem}
            onChange={setPreviewItem}
            options={items.map((i) => ({ id: String(i.id), label: i.title || i.text.slice(0, 40) || `Item ${i.id}` }))}
          />
        )}
        <PanelImage
          alt="Preview of this style on the panel"
          load={() =>
            api.previewCategory(category.id, {
              template,
              custom_css: debouncedCss,
              item_id: previewItem ? Number(previewItem) : undefined,
            })
          }
          deps={[template, debouncedCss, previewItem]}
        />
        <p className="text-sm text-muted">
          {items.length ? "" : "Showing placeholder content until you add items. "}
          This is how the panel shows it, in its own six colours.
        </p>
      </div>
    </div>
  );
}

/* Settings --------------------------------------------------------------- */

function SettingsTab({ category, onSaved }: { category: Category; onSaved: (c: Category) => void }) {
  const [name, setName] = useState(category.name);
  const [order, setOrder] = useState<ItemOrder>(category.item_order);
  const [weight, setWeight] = useState(String(category.weight));
  const [enabled, setEnabled] = useState(category.enabled);
  const [confirming, setConfirming] = useState(false);
  const dirty =
    name !== category.name || order !== category.item_order || weight !== String(category.weight) || enabled !== category.enabled;

  const save = async () => {
    try {
      onSaved(
        await api.updateCategory(category.id, { name: name.trim(), item_order: order, weight: Number(weight), enabled }),
      );
      toast.success("Settings saved");
    } catch (e) {
      toast.danger((e as Error).message);
    }
  };

  const remove = async () => {
    await api.deleteCategory(category.id);
    toast.success(`Deleted ${category.name}`);
    go("#/");
  };

  return (
    <div className="flex max-w-lg flex-col gap-5">
      <TextInput label="Name" value={name} onChange={setName} />
      <Choice label="Order of items" value={order} onChange={setOrder} options={ORDERS} />
      <Choice
        label="How often it comes up"
        value={weight}
        onChange={setWeight}
        description="Used when categories are picked at random."
        options={[
          { id: "1", label: "Normal" },
          { id: "2", label: "Twice as often" },
          { id: "3", label: "Three times as often" },
          { id: "5", label: "Five times as often" },
        ]}
      />
      <Toggle label="Show this category on the frame" isSelected={enabled} onChange={setEnabled} />
      <div className="flex gap-2">
        <Button isDisabled={!dirty || !name.trim()} onPress={save}>
          Save settings
        </Button>
      </div>

      <div className="mt-6 border-t border-separator pt-6">
        <Button variant="danger-soft" onPress={() => setConfirming(true)}>
          Delete category
        </Button>
      </div>
      <Dialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${category.name}?`}
        size="sm"
        footer={
          <>
            <Button variant="tertiary" onPress={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" onPress={remove}>
              Delete
            </Button>
          </>
        }
      >
        <p>This deletes the category and all {category.item_count} of its items, including uploaded images.</p>
      </Dialog>
    </div>
  );
}
