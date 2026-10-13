import { css } from "@codemirror/lang-css";
import { Button, Chip, toast } from "@heroui/react";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState } from "react";
import { api, describeItem, type Category, type Item, type Template } from "../../api";
import { PanelImage } from "../../components/PanelImage";
import { Choice, Toggle } from "../../components/ui";

const COLOURS = ["black", "white", "yellow", "red", "blue", "green"];

const PLACEHOLDER_CSS = `.field-title {
  color: var(--red);
}
.field-image {
  width: 384px;
  image-rendering: pixelated;
}`;

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
  const [customCss, setCustomCss] = useState(category.custom_css);
  const [mono, setMono] = useState(category.mono);
  const [previewItem, setPreviewItem] = useState<string>(items[0] ? String(items[0].id) : "");
  const [busy, setBusy] = useState(false);
  const info = templates.find((t) => t.name === category.template) ?? templates[0];
  const dirty = customCss !== category.custom_css || mono !== category.mono;
  const debouncedCss = useDebounced(customCss, 700);

  const save = async () => {
    setBusy(true);
    try {
      props.onSaved(await api.updateCategory(category.id, { custom_css: customCss, mono }));
      toast.success("Style saved");
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    setCustomCss(category.custom_css);
    setMono(category.mono);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Toggle label="Black and white only" isSelected={mono} onChange={setMono} />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Custom CSS</span>
          <div className="overflow-hidden rounded-lg border border-border text-sm">
            <CodeMirror
              value={customCss}
              onChange={setCustomCss}
              extensions={[css()]}
              height="260px"
              placeholder={PLACEHOLDER_CSS}
              theme={window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"}
            />
          </div>
          <p className="text-sm text-muted">
            Fields are drawn in order inside <code>.stack</code>. Each has its own class:
          </p>
          <ChipList items={["body", ...info.classes, ...category.fields.map((f) => `.field-${f.key}`)]} />
          <p className="text-sm text-muted">
            For pixel art, add <code>image-rendering: pixelated</code> to an image field: it stays sharp and isn't dithered.
          </p>
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
              custom_css: debouncedCss,
              mono,
              item_id: previewItem ? Number(previewItem) : undefined,
            })
          }
          deps={[debouncedCss, mono, previewItem]}
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
