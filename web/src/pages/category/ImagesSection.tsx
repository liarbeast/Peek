import { Button, Chip, toast } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { api, imageUrl, type Category, type CategoryImage } from "../../api";
import { TextInput, Toggle } from "../../components/ui";

// The category's decoration images: a frame, a background, an icon. They
// belong to the category rather than to any item, and are used from its
// HTML as {{ images.<name> }} or from CSS as var(--image-<name>).
export function ImagesSection({ category, onChange }: { category: Category; onChange: () => void }) {
  const [images, setImages] = useState<CategoryImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reload = () => api.categoryImages(category.id).then(setImages);
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  const changed = () => {
    reload();
    onChange();
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) await api.addCategoryImage(category.id, file);
      changed();
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Images</span>
      <p className="text-sm text-muted">
        Decoration for every item in this category, such as a frame or a background.
      </p>
      {images.length > 0 && (
        <ul className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
          {images.map((image) => (
            <ImageRow key={`${image.id}-${image.name}`} image={image} onChange={changed} />
          ))}
        </ul>
      )}
      <div>
        <Button variant="tertiary" isDisabled={uploading} onPress={() => input.current?.click()}>
          {uploading ? "Uploading…" : "Add image"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => upload(e.target.files)}
        />
      </div>
    </div>
  );
}

function ImageRow({ image, onChange }: { image: CategoryImage; onChange: () => void }) {
  const [name, setName] = useState(image.name);

  const update = async (body: Partial<Pick<CategoryImage, "name" | "crisp">>) => {
    try {
      await api.updateCategoryImage(image.id, body);
      onChange();
    } catch (e) {
      toast.danger((e as Error).message);
      setName(image.name);
    }
  };

  const remove = async () => {
    await api.deleteCategoryImage(image.id);
    onChange();
  };

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-separator p-3 last:border-b-0">
      <img
        src={imageUrl(image.file)}
        alt=""
        className="h-14 w-20 flex-none rounded-md bg-surface-secondary object-contain"
        style={{ imageRendering: image.crisp ? "pixelated" : "auto" }}
      />
      <div className="flex min-w-60 flex-1 flex-col gap-1">
        <TextInput
          label="Name"
          hideLabel
          value={name}
          onChange={setName}
          onCommit={() => name !== image.name && update({ name })}
        />
        <div className="flex flex-wrap gap-1">
          <Chip size="sm" variant="soft">
            <code className="whitespace-nowrap">{`{{ images.${image.name} }}`}</code>
          </Chip>
          <Chip size="sm" variant="soft">
            <code className="whitespace-nowrap">{`var(--image-${image.name})`}</code>
          </Chip>
        </div>
      </div>
      <Toggle label="Crisp" isSelected={image.crisp} onChange={(crisp) => update({ crisp })} />
      <Button size="sm" variant="danger-soft" onPress={remove}>
        Delete
      </Button>
    </li>
  );
}
