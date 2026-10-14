import { Button, toast } from "@heroui/react";
import { useState } from "react";
import { api, type Category } from "../../api";
import { TextInput } from "../../components/ui";

// A collection's data source: a JSON address whose entries become its items,
// read again every day.
export function SourceSection({ category, onSaved }: { category: Category; onSaved: (c: Category) => void }) {
  const [url, setUrl] = useState(category.source?.url ?? "");
  const [items, setItems] = useState(category.source?.items ?? "");
  const [paths, setPaths] = useState<Record<string, string>>(category.source?.fields ?? {});
  const [busy, setBusy] = useState(false);
  const fields = category.fields.filter((f) => !f.hidden);

  const save = async (remove = false) => {
    setBusy(true);
    try {
      const source = remove ? { url: "" } : { url: url.trim(), items: items.trim(), fields: paths };
      const saved = await api.updateCategory(category.id, { source } as Partial<Category>);
      if (remove || !saved.source) {
        onSaved(saved);
        toast.success("Data source removed. The items stay until you delete them.");
        return;
      }
      const { created, category: synced } = await api.syncCategory(category.id);
      onSaved(synced);
      toast.success(`Fetched ${created} ${created === 1 ? "item" : "items"}`);
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t border-separator pt-6">
      <div>
        <h2 className="text-lg font-semibold">Data source</h2>
        <p className="text-sm text-muted">
          Fill this collection from a web address that returns JSON. Every day its entries replace the items.
          {category.synced && ` Last fetched on ${category.synced}.`}
        </p>
      </div>
      <TextInput
        label="Address"
        value={url}
        onChange={setUrl}
        placeholder="https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/{MM}/{DD}"
        description="{YYYY}, {MM} and {DD} are filled in with today's date."
      />
      <TextInput
        label="List of entries"
        value={items}
        onChange={setItems}
        placeholder="selected"
        description="Where the entries are in the response. Leave empty if the response is the list (or one entry)."
      />
      {fields.map((f) => (
        <TextInput
          key={f.key}
          label={`${f.label} comes from`}
          value={paths[f.key] ?? ""}
          onChange={(v) => setPaths({ ...paths, [f.key]: v })}
          placeholder={f.type === "image" ? "pages.0.thumbnail.source" : "text"}
          description={f.type === "image" ? "An image address; Peek downloads it." : undefined}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={busy || !url.trim()} onPress={() => save()}>
          {busy ? "Fetching…" : "Save and fetch now"}
        </Button>
        {category.source && (
          <Button variant="tertiary" isDisabled={busy} onPress={() => save(true)}>
            Remove source
          </Button>
        )}
      </div>
    </div>
  );
}
