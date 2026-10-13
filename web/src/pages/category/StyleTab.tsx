import { css } from "@codemirror/lang-css";
import { Button, Chip, toast } from "@heroui/react";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState } from "react";
import { api, describeItem, type Category, type Item, type Template } from "../../api";
import { PanelImage } from "../../components/PanelImage";
import { Choice, Toggle } from "../../components/ui";

const COLOURS = ["black", "white", "yellow", "red", "blue", "green"];
const NOTHING = "__nothing__";

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
  const [template, setTemplate] = useState(category.template);
  const [customCss, setCustomCss] = useState(category.custom_css);
  const [mono, setMono] = useState(category.mono);
  const [slots, setSlots] = useState(category.slots);
  const [previewItem, setPreviewItem] = useState<string>(items[0] ? String(items[0].id) : "");
  const [busy, setBusy] = useState(false);
  const info = templates.find((t) => t.name === template) ?? templates[0];
  const dirty =
    template !== category.template ||
    customCss !== category.custom_css ||
    mono !== category.mono ||
    JSON.stringify(slots) !== JSON.stringify(category.slots);
  const debouncedCss = useDebounced(customCss, 700);
  const slotsKey = JSON.stringify(slots);

  const save = async () => {
    setBusy(true);
    try {
      props.onSaved(await api.updateCategory(category.id, { template, custom_css: customCss, mono, slots }));
      toast.success("Style saved");
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    setTemplate(category.template);
    setCustomCss(category.custom_css);
    setMono(category.mono);
    setSlots(category.slots);
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

        {info.slots.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">What goes where</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {info.slots.map((slot) => {
                const fitting = category.fields.filter((f) => (f.type === "image") === (slot.kind === "image"));
                const value = slot.name in slots ? (slots[slot.name] ?? NOTHING) : autoSlot(category, info, slots, slot.name);
                return (
                  <Choice
                    key={slot.name}
                    label={slot.label}
                    value={value}
                    onChange={(key) => setSlots((s) => ({ ...s, [slot.name]: key === NOTHING ? null : key }))}
                    options={[
                      ...fitting.map((f) => ({ id: f.key, label: f.label })),
                      { id: NOTHING, label: "Nothing" },
                    ]}
                  />
                );
              })}
            </div>
            <p className="text-sm text-muted">Fields without a place are listed below the rest, as label and value.</p>
          </div>
        )}

        <Toggle label="Black and white only" isSelected={mono} onChange={setMono} />

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
          <ChipList items={["body", ...info.classes]} />
          <p className="text-sm text-muted">This category's fields:</p>
          <ChipList items={category.fields.map((f) => `.field-${f.key}`)} />
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

      <div className="flex flex-col gap-3">
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
              template,
              custom_css: debouncedCss,
              mono,
              slots,
              item_id: previewItem ? Number(previewItem) : undefined,
            })
          }
          deps={[template, debouncedCss, mono, slotsKey, previewItem]}
        />
        <p className="text-sm text-muted">
          {items.length ? "" : "Showing placeholder content until you add items. "}
          This is how the panel shows it, in its own {mono ? "black and white" : "six colours"}.
        </p>
      </div>
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

// Which field fills a place the category hasn't chosen for, mirroring the
// server: the field with the place's name, else the first fitting free one.
function autoSlot(category: Category, info: Template, chosen: Category["slots"], name: string): string {
  const used = new Set(Object.values(chosen).filter(Boolean));
  for (const slot of info.slots) {
    const fits = (key: string) => {
      const f = category.fields.find((x) => x.key === key);
      return !!f && (f.type === "image") === (slot.kind === "image") && !used.has(key);
    };
    if (slot.name in chosen) continue;
    const pick = fits(slot.name) ? slot.name : category.fields.map((f) => f.key).find((k) => k !== slot.name && fits(k));
    if (slot.name === name) return pick ?? NOTHING;
    if (pick) used.add(pick);
  }
  return NOTHING;
}
