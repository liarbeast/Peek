import { Button, Chip, toast } from "@heroui/react";
import { Reorder, useDragControls } from "motion/react";
import { useState } from "react";
import { api, FIELD_TYPES, type Category, type FieldDraft, type FieldType } from "../../api";
import { Choice, Dialog, TextInput } from "../../components/ui";
import { DragHandle } from "./ItemsTab";

// A field in the editor, with a local id so rows keep their identity while
// they are dragged or renamed.
type Row = FieldDraft & { id: number };

let nextId = 1;
const toRows = (category: Category): Row[] => category.fields.map((f) => ({ ...f, id: nextId++ }));

export function FieldsTab(props: { category: Category; onSaved: (c: Category) => void }) {
  const { category } = props;
  const [rows, setRows] = useState<Row[]>(() => toRows(category));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const saved = JSON.stringify(category.fields.map(({ key, label, type }) => ({ key, label, type })));
  const draft = rows.map(({ key, label, type }) => ({ key, label: label.trim(), type }));
  const dirty = JSON.stringify(draft) !== saved;
  const invalid = draft.some((f) => !f.label);

  // Fields whose values go away on save: removed ones, and ones that became
  // or stopped being images.
  const losing = category.fields.filter((f) => {
    const row = rows.find((r) => r.key === f.key);
    return !row || (row.type === "image") !== (f.type === "image");
  });

  const update = (id: number, change: Partial<Row>) => setRows((old) => old.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const save = async () => {
    setConfirming(false);
    setBusy(true);
    try {
      const updated = await api.updateCategory(category.id, { fields: draft.map(({ key, ...f }) => (key ? { key, ...f } : f)) });
      props.onSaved(updated);
      setRows(toRows(updated));
      toast.success("Fields saved");
    } catch (e) {
      toast.danger((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-muted">
        Every item in this category has these fields. Each one gets its own CSS class, shown next to it, which you can
        use on the Style tab. Renaming a field keeps its class.
      </p>

      {rows.length > 0 && (
        <Reorder.Group
          as="ul"
          axis="y"
          values={rows}
          onReorder={setRows}
          className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
        >
          {rows.map((row) => (
            <FieldRow
              key={row.id}
              row={row}
              onChange={(change) => update(row.id, change)}
              onRemove={() => setRows((old) => old.filter((r) => r.id !== row.id))}
            />
          ))}
        </Reorder.Group>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="tertiary"
          onPress={() => setRows((old) => [...old, { id: nextId++, label: "", type: "text" }])}
        >
          Add field
        </Button>
        <div className="flex-1" />
        <Button variant="tertiary" isDisabled={!dirty} onPress={() => setRows(toRows(category))}>
          Undo changes
        </Button>
        <Button
          isDisabled={!dirty || invalid || busy}
          onPress={() => (losing.length && category.item_count ? setConfirming(true) : save())}
        >
          Save fields
        </Button>
      </div>
      {invalid && <p className="text-sm text-danger">Every field needs a name.</p>}

      <Dialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title="Clear values from items?"
        size="sm"
        footer={
          <>
            <Button variant="tertiary" onPress={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" onPress={save}>
              Save and clear
            </Button>
          </>
        }
      >
        <p>
          Saving clears what items hold in {losing.map((f) => f.label).join(", ")}, because{" "}
          {losing.length === 1 ? "that field is" : "those fields are"} removed or changed between image and text.
        </p>
      </Dialog>
    </div>
  );
}

function FieldRow(props: { row: Row; onChange: (change: Partial<Row>) => void; onRemove: () => void }) {
  const { row } = props;
  const drag = useDragControls();
  return (
    <Reorder.Item
      as="li"
      value={row}
      dragListener={false}
      dragControls={drag}
      whileDrag={{ scale: 1.01, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 1 }}
      className="relative flex flex-wrap items-center gap-3 border-b border-separator bg-surface p-3 last:border-b-0"
    >
      <DragHandle onPointerDown={(e) => drag.start(e)} />
      <div className="min-w-40 flex-1">
        <TextInput label="Field name" hideLabel value={row.label} onChange={(label) => props.onChange({ label })} placeholder="Field name" />
      </div>
      <div className="w-40">
        <Choice
          label="Type"
          hideLabel
          value={row.type}
          onChange={(type: FieldType) => props.onChange({ type })}
          options={FIELD_TYPES}
        />
      </div>
      <Chip size="sm" variant="soft" className="w-36 justify-center">
        <code className="truncate">{row.key ? `.field-${row.key}` : "new"}</code>
      </Chip>
      <Button size="sm" variant="danger-soft" onPress={props.onRemove}>
        Remove
      </Button>
    </Reorder.Item>
  );
}
