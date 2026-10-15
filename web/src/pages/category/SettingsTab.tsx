import { Button, toast } from "@heroui/react";
import { useState } from "react";
import { api, type Category, type ItemOrder, type Refresh } from "../../api";
import { Choice, Dialog, TextInput, Toggle } from "../../components/ui";
import { go } from "../../router";
import { useSettings } from "../../settings";
import { REFRESHES, refreshLabel } from "../../timing";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// Select can't hold an empty key, so the frame's own refresh uses this.
const DEFAULT = "default";

export const ORDERS: Array<{ id: ItemOrder; label: string; description: string }> = [
  { id: "in_order", label: "In order", description: "Top to bottom, then start again" },
  { id: "random", label: "Random", description: "Any item each time, repeats possible" },
  { id: "shuffle", label: "Shuffle", description: "Random, but every item once before repeating" },
];

export function SettingsTab({ category, onSaved }: { category: Category; onSaved: (c: Category) => void }) {
  const [name, setName] = useState(category.name);
  const [order, setOrder] = useState<ItemOrder>(category.item_order);
  const [enabled, setEnabled] = useState(category.enabled);
  const [refresh, setRefresh] = useState<Refresh | null>(category.refresh);
  const [confirming, setConfirming] = useState(false);
  const frame = useSettings();
  const dirty =
    name !== category.name ||
    order !== category.item_order ||
    enabled !== category.enabled ||
    refresh !== category.refresh;

  const save = async () => {
    try {
      onSaved(
        await api.updateCategory(category.id, { name: name.trim(), item_order: order, enabled, refresh }),
      );
      toast.success("Settings saved");
    } catch (e) {
      toast.danger((e as Error).message);
    }
  };

  const remove = async () => {
    await api.deleteCategory(category.id);
    toast.success(`Deleted ${category.name}`);
    go("#/");
  };

  return (
    <div className="flex max-w-lg flex-col gap-5">
      <TextInput label="Name" value={name} onChange={setName} />
      <Choice label="Order of items" value={order} onChange={setOrder} options={ORDERS} />
      <Choice
        label="Refresh"
        value={refresh ?? DEFAULT}
        onChange={(r) => setRefresh(r === DEFAULT ? null : (r as Refresh))}
        options={[
          {
            id: DEFAULT,
            label: `Default (${lowerFirst(refreshLabel(frame.refresh).label)})`,
            description: "The frame's refresh, from Settings",
          },
          ...REFRESHES.map((r, i) => ({ ...r, divider: i === 0 })),
        ]}
        description="How often the frame wakes for the next item while this collection is on it."
      />
      <Toggle label="Show this collection on the frame" isSelected={enabled} onChange={setEnabled} />
      <div className="flex gap-2">
        <Button isDisabled={!dirty || !name.trim()} onPress={save}>
          Save settings
        </Button>
      </div>

      <div className="mt-6 border-t border-separator pt-6">
        <Button variant="danger-soft" onPress={() => setConfirming(true)}>
          Delete collection
        </Button>
      </div>
      <Dialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${category.name}?`}
        size="sm"
        footer={
          <>
            <Button variant="tertiary" onPress={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" onPress={remove}>
              Delete
            </Button>
          </>
        }
      >
        <p>This deletes the collection and all {category.item_count} of its items, including uploaded images.</p>
      </Dialog>
    </div>
  );
}
