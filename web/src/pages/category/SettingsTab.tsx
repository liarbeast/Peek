import { Button, toast } from "@heroui/react";
import { useState } from "react";
import { api, type Category, type ItemOrder } from "../../api";
import { Choice, Dialog, TextInput, Toggle } from "../../components/ui";
import { go } from "../../router";

export const ORDERS: Array<{ id: ItemOrder; label: string; description: string }> = [
  { id: "in_order", label: "In order", description: "Top to bottom, then start again" },
  { id: "random", label: "Random", description: "Any item each time, repeats possible" },
  { id: "shuffle", label: "Shuffle", description: "Random, but every item once before repeating" },
];

export function SettingsTab({ category, onSaved }: { category: Category; onSaved: (c: Category) => void }) {
  const [name, setName] = useState(category.name);
  const [order, setOrder] = useState<ItemOrder>(category.item_order);
  const [weight, setWeight] = useState(String(category.weight));
  const [enabled, setEnabled] = useState(category.enabled);
  const [confirming, setConfirming] = useState(false);
  const dirty =
    name !== category.name || order !== category.item_order || weight !== String(category.weight) || enabled !== category.enabled;

  const save = async () => {
    try {
      onSaved(
        await api.updateCategory(category.id, { name: name.trim(), item_order: order, weight: Number(weight), enabled }),
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
        label="How often it comes up"
        value={weight}
        onChange={setWeight}
        description="Used when collections are picked at random."
        options={[
          { id: "1", label: "Normal" },
          { id: "2", label: "Twice as often" },
          { id: "3", label: "Three times as often" },
          { id: "5", label: "Five times as often" },
        ]}
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
