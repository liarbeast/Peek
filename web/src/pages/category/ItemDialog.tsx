import { Button } from "@heroui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, imageUrl, type Category, type Field, type Item } from "../../api";
import { Dialog, TextInput } from "../../components/ui";

// Adds or edits an item, with one input per field of its category.
export function ItemDialog(props: {
  category: Category;
  item: Item | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { item, category } = props;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(category.fields.filter((f) => f.type !== "image").map((f) => [f.key, item?.data[f.key] ?? ""])),
  );
  const [files, setFiles] = useState<Record<string, File>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const form = new FormData();
    form.append("data", JSON.stringify(values));
    for (const [key, file] of Object.entries(files)) form.append(`image:${key}`, file);
    for (const key of removed) form.append(`remove:${key}`, "true");
    setBusy(true);
    try {
      if (item) await api.updateItem(item.id, form);
      else await api.createItem(category.id, form);
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
      {category.fields.map((field) =>
        field.type === "image" ? (
          <ImageInput
            key={field.key}
            field={field}
            current={removed.has(field.key) ? null : (item?.data[field.key] ?? null)}
            file={files[field.key] ?? null}
            onFile={(file) => {
              setFiles((f) => ({ ...f, [field.key]: file }));
              setRemoved((r) => new Set([...r].filter((k) => k !== field.key)));
            }}
            onRemove={() => {
              setFiles(({ [field.key]: _, ...rest }) => rest);
              setRemoved((r) => new Set(r).add(field.key));
            }}
          />
        ) : (
          <TextInput
            key={field.key}
            label={field.label}
            value={values[field.key] ?? ""}
            onChange={(v) => setValues((old) => ({ ...old, [field.key]: v }))}
            multiline
          />
        ),
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </Dialog>
  );
}

function ImageInput(props: {
  field: Field;
  current: string | null;
  file: File | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const fileUrl = useMemo(() => (props.file ? URL.createObjectURL(props.file) : null), [props.file]);
  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);
  const shown = fileUrl ?? (props.current ? imageUrl(props.current) : null);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{props.field.label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-md bg-surface-secondary">
          {shown ? (
            <img src={shown} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-muted">No image</span>
          )}
        </div>
        <Button variant="tertiary" onPress={() => input.current?.click()}>
          {shown ? "Change image" : "Choose image"}
        </Button>
        {shown && (
          <Button variant="ghost" onPress={props.onRemove}>
            Remove
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) props.onFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
