import { Button, toast } from "@heroui/react";
import { useEffect, useState } from "react";
import { api, type Category, type SourceInspection } from "../../api";
import { Choice, Dialog, TextInput } from "../../components/ui";

// Select can't hold an empty key, so "nothing" and "the whole response" use this.
const NONE = "-";

// Connects a collection to a data source: a JSON address whose entries become
// its items, read again every day. "Look at response" fetches the address so
// the list and each field's value can be picked instead of typed.
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
  const [inspection, setInspection] = useState<SourceInspection | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const fields = category.fields.filter((f) => !f.hidden);

  const look = async (list?: string) => {
    setLooking(true);
    try {
      const found = await api.inspectSource(url.trim(), list);
      setInspection(found);
      setItems(found.items);
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setLooking(false);
    }
  };

  // Editing a connected source: show what it returns straight away.
  useEffect(() => {
    if (props.isOpen && category.source && !inspection) look(category.source.items);
  }, [props.isOpen]);

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

  const listOptions = [
    ...(inspection?.lists ?? []).map((l) => ({ id: l.path, label: l.path, description: `${l.count} entries` })),
    { id: NONE, label: "The whole response", description: "One item, e.g. today's weather" },
  ];
  const valueOptions = (current: string) => [
    { id: NONE, label: "Nothing" },
    ...(inspection?.values ?? []).map((v) => ({ id: v.path, label: v.path, description: v.example })),
    // A path typed earlier that this response doesn't have, so it isn't lost.
    ...(current && !inspection?.values.some((v) => v.path === current) ? [{ id: current, label: current }] : []),
  ];

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
      <div className="flex items-end gap-2">
        <TextInput
          label="Address"
          value={url}
          onChange={(v) => {
            setUrl(v);
            setInspection(null);
          }}
          placeholder="https://example.com/api/items.json"
        />
        <Button variant="secondary" isDisabled={looking || !url.trim()} onPress={() => look()}>
          {looking ? "Looking…" : "Look at response"}
        </Button>
      </div>
      <p className="-mt-2 text-xs text-muted">{"{YYYY}, {MM} and {DD} are filled in with today's date."}</p>

      {!inspection && (
        <p className="text-sm text-muted">
          Enter the address and press “Look at response”. Peek then shows what the address returns, and you pick which
          value goes in each field.
        </p>
      )}

      {inspection && (
        <>
          <Choice
            label="List of entries"
            value={items || NONE}
            onChange={(v) => look(v === NONE ? "" : v)}
            options={listOptions}
            description="Each entry becomes an item."
          />
          {fields.map((f) => (
            <Choice
              key={f.key}
              label={f.label}
              value={paths[f.key] || NONE}
              onChange={(v) => setPaths({ ...paths, [f.key]: v === NONE ? "" : v })}
              options={valueOptions(paths[f.key] ?? "")}
              description={f.type === "image" ? "Pick an image address; Peek downloads the image." : undefined}
            />
          ))}
        </>
      )}
    </Dialog>
  );
}
