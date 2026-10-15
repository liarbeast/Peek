import { Button, toast } from "@heroui/react";
import { useState } from "react";
import { api, type Category, type ItemOrder, type Refresh } from "../../api";
import { Choice, Dialog, TextInput, Toggle } from "../../components/ui";
import { go } from "../../router";
import { refreshOptions } from "../../timing";

export const ORDERS: Array<{ id: ItemOrder; label: string; description: string }> = [
  { id: "in_order", label: "In order", description: "Top to bottom, then start again" },
  { id: "shuffle", label: "Shuffle", description: "Every item once in a shuffled order, then again" },
];

export function SettingsTab({ category, onSaved }: { category: Category; onSaved: (c: Category) => void }) {
  const [name, setName] = useState(category.name);
  const [order, setOrder] = useState<ItemOrder>(category.item_order);
  const [enabled, setEnabled] = useState(category.enabled);
  const [refresh, setRefresh] = useState<Refresh>(category.refresh);
  const [confirming, setConfirming] = useState(false);
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
        value={refresh}
        onChange={setRefresh}
        options={refreshOptions()}
        description="How often the frame wakes for the next item while this collection is on it. More often uses more battery."
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
