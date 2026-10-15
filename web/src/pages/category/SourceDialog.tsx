import { Button, toast } from "@heroui/react";
import { useEffect, useState } from "react";
import {
  api,
  FIELD_TYPES,
  type Category,
  type FieldType,
  type SourceColumn,
  type SourceInspection,
} from "../../api";
import { Choice, Dialog, TextInput } from "../../components/ui";

// What an address may hold, filled in on every fetch (see server/peek/sources.py).
const PLACEHOLDERS = ["{YYYY}", "{MM}", "{DD}", "{RANDOM:min-max}"];

// Select can't hold an empty key, so "the whole response" uses this.
const WHOLE = "-";

// What the person picked for one value of the entries, like a CSV column.
interface Plan {
  target: string; // "skip", "new" or "field:<key>"
  label: string;
  type: FieldType;
}

// Connects a collection to a data source: a JSON address whose entries become
// its items, read again every day. "Look at response" lists the values in an
// entry, and each one used becomes a field (or fills an existing one), much
// like importing a CSV.
export function SourceDialog(props: {
  category: Category;
  itemCount: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (c: Category) => void;
}) {
  const { category, onSaved } = props;
  const [url, setUrl] = useState(category.source?.url ?? "");
  const [inspection, setInspection] = useState<SourceInspection | null>(null);
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);

  const look = async (list?: string) => {
    setLooking(true);
    try {
      const found = await api.inspectSource(url.trim(), list);
      setInspection(found);
      // A value the connected source already uses keeps its field; the rest start skipped.
      const fieldFor = Object.fromEntries(Object.entries(category.source?.fields ?? {}).map(([k, p]) => [p, k]));
      setPlans(
        Object.fromEntries(
          found.values.map((v) => [
            v.path,
            { target: fieldFor[v.path] ? `field:${fieldFor[v.path]}` : "skip", label: v.label, type: v.type },
          ]),
        ),
      );
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

  const update = (path: string, change: Partial<Plan>) => setPlans((old) => ({ ...old, [path]: { ...old[path], ...change } }));

  const columns: SourceColumn[] = Object.entries(plans).flatMap(([path, p]): SourceColumn[] =>
    p.target === "skip"
      ? []
      : p.target === "new"
        ? [{ path, new: { label: p.label.trim(), type: p.type } }]
        : [{ path, field: p.target.slice("field:".length) }],
  );
  const used = columns.flatMap((c) => ("field" in c ? [c.field] : []));
  const duplicate = used.find((f, i) => used.indexOf(f) !== i);
  const missingName = columns.some((c) => "new" in c && !c.new.label);
  const dropped = category.fields.filter((f) => !used.includes(f.key));

  const connect = async () => {
    if (!inspection) return;
    setBusy(true);
    try {
      const { created, category: saved } = await api.connectSource(category.id, {
        url: url.trim(),
        items: inspection.items,
        columns,
      });
      onSaved(saved);
      props.onOpenChange(false);
      toast.success(`Fetched ${created} ${created === 1 ? "item" : "items"}`);
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const targets = [
    { id: "skip", label: "Skip" },
    { id: "new", label: "New field" },
    ...category.fields.map((f) => ({ id: `field:${f.key}`, label: f.label, description: "Existing field" })),
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
          <Button
            isDisabled={busy || !inspection || columns.length === 0 || !!duplicate || missingName}
            onPress={connect}
          >
            {busy ? "Fetching…" : "Save and fetch now"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        A web address that returns JSON. On every wake that shows this collection (see Refresh on its Settings tab), Peek reads
        it again: new entries are added and gone ones removed, so the items can't be edited by hand.
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
      <p className="-mt-2 text-xs text-muted">
        Available placeholders: {PLACEHOLDERS.map((p, i) => (
          <span key={p}>
            {i > 0 && ", "}
            <code className="font-mono text-foreground">{p}</code>
          </span>
        ))}
      </p>

      {!inspection && (
        <p className="text-sm text-muted">
          Enter the address and press “Look at response”. Peek then lists the values in it, and you pick which ones to
          use.
        </p>
      )}

      {inspection && (
        <>
          <Choice
            label="List of entries"
            value={inspection.items || WHOLE}
            onChange={(v) => look(v === WHOLE ? "" : v)}
            options={[
              ...inspection.lists.map((l) => ({ id: l.path, label: l.path, description: `${l.count} entries` })),
              { id: WHOLE, label: "The whole response", description: "One item, e.g. today's weather" },
            ]}
            description="Each entry becomes an item."
          />
          <div>
            <p className="text-sm font-medium">Values in each entry</p>
            <p className="text-sm text-muted">
              Pick the ones to use. Each becomes a field you can place on the Style tab.
              {dropped.length > 0 &&
                ` Fields not used here (${dropped.map((f) => f.label).join(", ")}) are removed, since they'd stay empty.`}
            </p>
          </div>
          <div className="flex flex-col divide-y divide-separator">
            {inspection.values.map((v) => {
              const plan = plans[v.path];
              if (!plan) return null;
              return (
                <div key={v.path} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_1.3fr]">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{v.path}</p>
                    <p className="truncate text-xs text-muted">{v.example}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Choice
                      label={`Where ${v.path} goes`}
                      hideLabel
                      value={plan.target}
                      onChange={(target) => update(v.path, { target })}
                      options={targets}
                    />
                    {plan.target === "new" && (
                      <div className="grid grid-cols-2 gap-2">
                        <TextInput
                          label="Field name"
                          hideLabel
                          value={plan.label}
                          onChange={(label) => update(v.path, { label })}
                          placeholder="Field name"
                        />
                        <Choice
                          label="Field type"
                          hideLabel
                          value={plan.type}
                          onChange={(type) => update(v.path, { type })}
                          options={FIELD_TYPES}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {duplicate && (
            <p className="text-sm text-danger">
              Two values go to {category.fields.find((f) => f.key === duplicate)?.label}. Pick one, or skip the other.
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
