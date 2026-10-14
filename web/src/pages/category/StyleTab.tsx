import { Button, toast } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import {
  api,
  describeItem,
  type Box,
  type Category,
  type CategoryImage,
  type Item,
  type Positions,
  type Preview,
  type Template,
} from "../../api";
import { PanelImage } from "../../components/PanelImage";
import { Choice, Toggle } from "../../components/ui";
import { useSettings } from "../../settings";
import { FieldBoxes, type Layer } from "./FieldBoxes";

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
  const { category, items } = props;
  const [mono, setMono] = useState(category.mono);
  const [pixelate, setPixelate] = useState(category.pixelate);
  const [positions, setPositions] = useState<Positions>(category.positions);
  const [images, setImages] = useState<CategoryImage[]>([]);
  const [measured, setMeasured] = useState<Preview["boxes"]>({});
  const [selected, setSelected] = useState<string | null>(null);
  const { orientation } = useSettings();
  const placed = positions[orientation] ?? {};
  const setPlaced = (next: Record<string, Box>) => setPositions((p) => ({ ...p, [orientation]: next }));
  const canvas = orientation === "portrait" ? { width: 480, height: 800 } : { width: 800, height: 480 };
  const [previewItem, setPreviewItem] = useState<string>(items[0] ? String(items[0].id) : "");
  const [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const dirty =
    mono !== category.mono ||
    pixelate !== category.pixelate ||
    JSON.stringify(positions) !== JSON.stringify(category.positions);
  const debouncedPositions = useDebounced(positions, 400);

  useEffect(() => {
    api.categoryImages(category.id).then(setImages).catch((e: Error) => toast.danger(e.message));
  }, [category.id]);

  const layers: Layer[] = [
    ...images.map((image) => ({ key: image.key, label: image.name, type: "image" as const, image })),
    ...category.fields,
  ];

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.updateCategory(category.id, { mono, pixelate, positions });
      setPositions(saved.positions);
      props.onSaved(saved);
      toast.success("Style saved");
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    setMono(category.mono);
    setPixelate(category.pixelate);
    setPositions(category.positions);
  };

  // Style images are saved as soon as they are added, changed or removed.
  const addImage = async (file: File) => {
    try {
      const image = await api.addCategoryImage(category.id, file);
      setImages((all) => [...all, image]);
      setSelected(image.key);
    } catch (e) {
      toast.danger((e as Error).message);
    }
  };
  const changeImage = async (image: CategoryImage, changes: Partial<CategoryImage>) => {
    try {
      const updated = await api.updateCategoryImage(image.id, { crisp: changes.crisp ?? image.crisp });
      setImages((all) => all.map((i) => (i.id === image.id ? updated : i)));
    } catch (e) {
      toast.danger((e as Error).message);
    }
  };
  const deleteImage = async (image: CategoryImage) => {
    try {
      await api.deleteCategoryImage(image.id);
      setImages((all) => all.filter((i) => i.id !== image.id));
      setSelected(null);
    } catch (e) {
      toast.danger((e as Error).message);
    }
  };

  return (
    <div className="mb-8 flex flex-wrap items-center justify-center gap-x-16 gap-y-12">
      <div
        className={`relative min-w-0 ${
          orientation === "portrait" ? "w-[min(100%,calc(70vh*0.6))] flex-none" : "flex-[999_1_560px]"
        }`}
      >
        <PanelImage
          alt="Preview of this style on the panel"
          load={() =>
            api.previewCategory(category.id, {
              mono,
              pixelate,
              positions: debouncedPositions,
              item_id: previewItem ? Number(previewItem) : undefined,
            })
          }
          deps={[mono, pixelate, previewItem, JSON.stringify(debouncedPositions), JSON.stringify(images)]}
          onBoxes={setMeasured}
        >
          <FieldBoxes
            canvas={canvas}
            fields={layers}
            measured={measured}
            placed={placed}
            onChange={setPlaced}
            selected={selected}
            onSelect={setSelected}
            onImageChange={changeImage}
            onImageDelete={deleteImage}
          />
        </PanelImage>
        <p className="absolute inset-x-0 top-full mt-2 text-center text-sm text-muted">Drag to move, click to style.</p>
      </div>

      <aside className="flex flex-[1_1_260px] flex-col gap-6 sm:max-w-72">
        {items.length > 0 && (
          <Choice
            label="Preview with"
            value={previewItem}
            onChange={setPreviewItem}
            options={items.map((i) => ({ id: String(i.id), label: describeItem(category.fields, i).title }))}
          />
        )}
        <div className="flex flex-col gap-4">
          <Filter
            label="Black and white"
            description="Shades become dither patterns."
            isSelected={mono}
            onChange={setMono}
          />
          <Filter
            label="Crisp images"
            description="Solid colours, no smoothing: for pixel art, icons and QR codes."
            isSelected={pixelate}
            onChange={setPixelate}
          />
        </div>
        <div className="-ml-4 flex flex-col items-start">
          <input
            ref={upload}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addImage(file);
              e.target.value = "";
            }}
          />
          <Button variant="ghost" onPress={() => upload.current?.click()}>
            Add image
          </Button>
          <Button variant="ghost" onPress={() => setPlaced(category.default_positions[orientation] ?? {})}>
            Reset layout
          </Button>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" isDisabled={!dirty || busy} onPress={save}>
            Save style
          </Button>
          <Button variant="tertiary" isDisabled={!dirty} onPress={undo}>
            Undo
          </Button>
        </div>
      </aside>
    </div>
  );
}

function Filter(props: { label: string; description: string; isSelected: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Toggle label={props.label} isSelected={props.isSelected} onChange={props.onChange} />
      <p className="pl-13 text-sm text-muted">{props.description}</p>
    </div>
  );
}
