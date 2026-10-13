import { Button, Spinner, toast } from "@heroui/react";
import { useEffect, useState } from "react";
import {
  api,
  FIELD_TYPES,
  type Category,
  type FieldType,
  type ImportColumn,
  type ImportTarget,
} from "../../api";
import { Choice, Dialog, TextInput } from "../../components/ui";

// What the person picked for one CSV column.
interface Plan {
  target: string; // "skip", "new" or "field:<key>"
  label: string;
  type: FieldType;
}

// Matches a CSV's columns to the category's fields, then imports its rows.
export function ImportDialog(props: {
  category: Category;
  file: File | null;
  onClose: () => void;
  onImported: (c: Category) => void;
}) {
  const { category, file } = props;
  const [columns, setColumns] = useState<ImportColumn[] | null>(null);
  const [rows, setRows] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    api.previewImport(category.id, file).then(
      (res) => {
        setColumns(res.columns);
        setRows(res.rows);
        setPlans(
          res.columns.map((c) => ({
            target: c.field ? `field:${c.field}` : "new",
            label: c.name,
            type: c.type,
          })),
        );
      },
      (e: Error) => setError(e.message),
    );
  }, [file, category.id]);

  const update = (i: number, change: Partial<Plan>) =>
    setPlans((old) => old.map((p, j) => (j === i ? { ...p, ...change } : p)));

  const mapping: ImportTarget[] = plans.map((p) =>
    p.target === "skip"
      ? null
      : p.target === "new"
        ? { new: { label: p.label.trim(), type: p.type } }
        : { field: p.target.slice("field:".length) },
  );
  const used = plans.filter((p) => p.target.startsWith("field:")).map((p) => p.target);
  const duplicate = used.find((t, i) => used.indexOf(t) !== i);
  const missingName = plans.some((p) => p.target === "new" && !p.label.trim());
  const nothing = plans.every((p) => p.target === "skip");
  const hasImages = plans.some(
    (p) =>
      (p.target === "new" && p.type === "image") ||
      category.fields.some((f) => `field:${f.key}` === p.target && f.type === "image"),
  );

  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.runImport(category.id, file, mapping);
      const failed = res.images_failed ? ` ${res.images_failed} images could not be downloaded.` : "";
      toast.success(`Imported ${res.created} ${res.created === 1 ? "item" : "items"}.${failed}`);
      props.onImported(res.category);
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const options = [
    ...category.fields.map((f) => ({ id: `field:${f.key}`, label: f.label, description: "Existing field" })),
    { id: "new", label: "New field", description: "Add this column as a field" },
    { id: "skip", label: "Skip", description: "Leave this column out" },
  ];

  return (
    <Dialog
      isOpen={file !== null}
      onOpenChange={(open) => !open && props.onClose()}
      title={`Import ${file?.name ?? "CSV"}`}
      size="lg"
      footer={
        <>
          <Button variant="tertiary" onPress={props.onClose}>
            Cancel
          </Button>
          <Button isDisabled={!columns || busy || !!duplicate || missingName || nothing} onPress={run}>
            {busy ? (hasImages ? "Importing and downloading images…" : "Importing…") : `Import ${rows} ${rows === 1 ? "row" : "rows"}`}
          </Button>
        </>
      }
    >
      {!columns && !error && <Spinner />}
      {columns && (
        <>
          <p className="text-sm text-muted">
            Each row becomes an item. Pick where each column goes; columns with the same name as a field are matched
            already. Image columns should hold image URLs.
          </p>
          <div className="flex flex-col divide-y divide-separator">
            {columns.map((column, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_1.3fr]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{column.name}</p>
                  <p className="truncate text-xs text-muted">{column.samples.join(" · ") || "Empty"}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Choice
                    label={`Where ${column.name} goes`}
                    hideLabel
                    value={plans[i].target}
                    onChange={(target) => update(i, { target })}
                    options={options}
                  />
                  {plans[i].target === "new" && (
                    <div className="grid grid-cols-2 gap-2">
                      <TextInput
                        label="Field name"
                        hideLabel
                        value={plans[i].label}
                        onChange={(label) => update(i, { label })}
                        placeholder="Field name"
                      />
                      <Choice
                        label="Field type"
                        hideLabel
                        value={plans[i].type}
                        onChange={(type) => update(i, { type })}
                        options={FIELD_TYPES}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {duplicate && (
            <p className="text-sm text-danger">
              Two columns go to {options.find((o) => o.id === duplicate)?.label}. Pick one, or skip the other.
            </p>
          )}
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </Dialog>
  );
}
