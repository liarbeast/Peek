import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { Button, Chip, toast } from "@heroui/react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { useEffect, useState } from "react";
import { api, describeItem, type Category, type Item, type Template } from "../../api";
import { PanelImage } from "../../components/PanelImage";
import { Choice, Toggle } from "../../components/ui";
import { ImagesSection } from "./ImagesSection";

const COLOURS = ["black", "white", "yellow", "red", "blue", "green"];

const PLACEHOLDER_HTML = `<div class="flex h-full flex-col items-center justify-center gap-4">
  <img src="{{ image }}" class="h-1/2">
  <h1 class="text-5xl font-bold text-red">{{ title }}</h1>
</div>`;

const PLACEHOLDER_CSS = `.field-title {
  color: var(--red);
}
.field-image {
  width: 384px;
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
  const [customHtml, setCustomHtml] = useState(category.custom_html);
  const [imagesVersion, setImagesVersion] = useState(0);
  const [mono, setMono] = useState(category.mono);
  const [pixelate, setPixelate] = useState(category.pixelate);
  const [previewItem, setPreviewItem] = useState<string>(items[0] ? String(items[0].id) : "");
  const [busy, setBusy] = useState(false);
  const info = templates.find((t) => t.name === category.template) ?? templates[0];
  const dirty =
    customCss !== category.custom_css ||
    customHtml !== category.custom_html ||
    mono !== category.mono ||
    pixelate !== category.pixelate;
  const debouncedCss = useDebounced(customCss, 700);
  const debouncedHtml = useDebounced(customHtml, 700);
  const ownHtml = customHtml.trim() !== "";
  const theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  const save = async () => {
    setBusy(true);
    try {
      props.onSaved(await api.updateCategory(category.id, { custom_css: customCss, custom_html: customHtml, mono, pixelate }));
      toast.success("Style saved");
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    setCustomCss(category.custom_css);
    setCustomHtml(category.custom_html);
    setMono(category.mono);
    setPixelate(category.pixelate);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Filters</span>
          <Filter
            label="Black and white"
            description="Draws everything in black and white; shades become dither patterns."
            isSelected={mono}
            onChange={setMono}
          />
          <Filter
            label="Crisp images"
            description="Images are resized without smoothing and drawn in solid panel colours instead of photo dithering. For pixel art, icons, logos and QR codes."
            isSelected={pixelate}
            onChange={setPixelate}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">HTML</span>
          <div className="overflow-hidden rounded-lg border border-border text-sm">
            <CodeMirror
              value={customHtml}
              onChange={setCustomHtml}
              extensions={[html(), EditorView.lineWrapping]}
              height="220px"
              placeholder={PLACEHOLDER_HTML}
              theme={theme}
            />
          </div>
          <p className="text-sm text-muted">
            Optional. Leave it empty to stack the fields in order, or write your own page, with Tailwind classes if you
            like. Put a field in with:
          </p>
          <ChipList items={category.fields.map((f) => `{{ ${f.key} }}`)} />
          <p className="text-sm text-muted">
            Parts that only show when a field has a value: <code>{"{% if title %}…{% endif %}"}</code>. Tailwind colours
            are the panel's: <code>bg-red</code>, <code>text-blue</code> and so on.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">CSS</span>
          <div className="overflow-hidden rounded-lg border border-border text-sm">
            <CodeMirror
              value={customCss}
              onChange={setCustomCss}
              extensions={[css(), EditorView.lineWrapping]}
              height="220px"
              placeholder={ownHtml ? "" : PLACEHOLDER_CSS}
              theme={theme}
            />
          </div>
          {!ownHtml && (
            <>
              <p className="text-sm text-muted">
                Fields are drawn in order inside <code>.stack</code>. Each has its own class:
              </p>
              <ChipList items={["body", ...info.classes, ...category.fields.map((f) => `.field-${f.key}`)]} />
            </>
          )}
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

        <ImagesSection category={category} onChange={() => setImagesVersion((v) => v + 1)} />
      </div>

      <div className="flex flex-col gap-3 self-start lg:sticky lg:top-4">
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
              custom_html: debouncedHtml,
              mono,
              pixelate,
              item_id: previewItem ? Number(previewItem) : undefined,
            })
          }
          deps={[debouncedCss, debouncedHtml, mono, pixelate, previewItem, imagesVersion]}
        />
        <p className="text-sm text-muted">
          {items.length ? "" : "Showing placeholder content until you add items. "}
          This is how the panel shows it, in its own {mono ? "black and white" : "six colours"}.
        </p>
      </div>
    </div>
  );
}

function Filter(props: { label: string; description: string; isSelected: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Toggle label={props.label} isSelected={props.isSelected} onChange={props.onChange} />
      <p className="pl-12 text-sm text-muted">{props.description}</p>
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
