import { Button, toast } from "@heroui/react";
import { useState } from "react";
import { api, type Category } from "../../api";
import { Dialog, TextInput } from "../../components/ui";

// Connects a collection to a data source: a JSON address whose entries become
// its items, read again every day.
export function SourceDialog(props: {
  category: Category;
  itemCount: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (c: Category) => void;
}) {
  const { category, onSaved } = props;
  const [url, setUrl] = useState(category.source?.url ?? "");
  const [items, setItems] = useState(category.source?.items ?? "");
  const [paths, setPaths] = useState<Record<string, string>>(category.source?.fields ?? {});
  const [busy, setBusy] = useState(false);
  const fields = category.fields.filter((f) => !f.hidden);

  const save = async () => {
    setBusy(true);
    try {
      const source = { url: url.trim(), items: items.trim(), fields: paths };
      await api.updateCategory(category.id, { source } as Partial<Category>);
      const { created, category: synced } = await api.syncCategory(category.id);
      onSaved(synced);
      props.onOpenChange(false);
      toast.success(`Fetched ${created} ${created === 1 ? "item" : "items"}`);
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      isOpen={props.isOpen}
      onOpenChange={props.onOpenChange}
      title={category.source ? "Data source" : "Connect data source"}
      size="lg"
      footer={
        <>
          <Button variant="tertiary" onPress={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button isDisabled={busy || !url.trim()} onPress={save}>
            {busy ? "Fetching…" : "Save and fetch now"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        A web address that returns JSON. Every day its entries replace the items, which can't be edited by hand while
        the source is connected.
        {!category.source &&
          props.itemCount > 0 &&
          ` Fetching replaces the ${props.itemCount} items this collection has now.`}
      </p>
      <TextInput
        label="Address"
        value={url}
        onChange={setUrl}
        placeholder="https://example.com/api/items.json"
        description="{YYYY}, {MM} and {DD} are filled in with today's date."
      />
      <TextInput
        label="List of entries"
        value={items}
        onChange={setItems}
        placeholder="results"
        description="Where the entries are in the response, e.g. results or data.items. Leave empty if the response is the list itself, or one entry (like today's weather)."
      />
      {fields.map((f) => (
        <TextInput
          key={f.key}
          label={`${f.label} comes from`}
          description={
            f.type === "image"
              ? "The name of a value in each entry; dots go deeper (image.url) and numbers pick from a list (photos.0). It must be an image address; Peek downloads it."
              : "The name of a value in each entry; dots go deeper (author.name) and numbers pick from a list (tags.0)."
          }
          value={paths[f.key] ?? ""}
          onChange={(v) => setPaths({ ...paths, [f.key]: v })}
          placeholder={f.type === "image" ? "image.url" : "name"}
        />
      ))}
    </Dialog>
  );
}
