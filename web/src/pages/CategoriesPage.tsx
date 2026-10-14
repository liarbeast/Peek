import { Button, Card, Chip, Spinner } from "@heroui/react";
import { useEffect, useState } from "react";
import { api, imageUrl, type Category } from "../api";
import { Dialog, TextInput } from "../components/ui";
import { go } from "../router";
import { ORDERS } from "./category/SettingsTab";

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.categories().then(setCategories, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Collections</h1>
          <p className="text-muted">Each collection has its own content and its own style.</p>
        </div>
        <Button onPress={() => setCreating(true)}>New collection</Button>
      </div>

      {error && <p className="text-danger">{error}</p>}
      {!categories && !error && <Spinner />}

      {categories?.length === 0 && (
        <Card>
          <Card.Header>
            <Card.Title>No collections yet</Card.Title>
            <Card.Description>
              Start with one, for example "Bird of the day" with the Photo layout, or "Movie quotes" with the Quote
              layout.
            </Card.Description>
          </Card.Header>
          <Card.Footer>
            <Button onPress={() => setCreating(true)}>Create your first collection</Button>
          </Card.Footer>
        </Card>
      )}

      {categories && categories.length > 0 && (
        <CategoryGroup
          title="Active"
          empty="No active collections. Turn on “Show this collection on the frame” in its Settings tab."
          categories={categories.filter((c) => c.enabled)}
        />
      )}
      {categories?.some((c) => !c.enabled) && (
        <CategoryGroup title="Inactive" categories={categories.filter((c) => !c.enabled)} />
      )}

      <NewCategoryDialog
        isOpen={creating}
        onOpenChange={setCreating}
        onCreated={(c) => go(`#/categories/${c.id}`)}
      />
    </div>
  );
}

// A heading and the categories under it, as cards.
function CategoryGroup(props: { title: string; categories: Category[]; empty?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{props.title}</h2>
      {props.categories.length === 0 && props.empty && <p className="text-muted">{props.empty}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {props.categories.map((c) => (
          <Card key={c.id} className="cursor-pointer transition hover:shadow-md" onClick={() => go(`#/categories/${c.id}`)}>
            <div className="aspect-[5/3] overflow-hidden rounded-lg bg-surface-secondary">
              {c.cover ? (
                <img
                  src={imageUrl(c.cover)}
                  alt=""
                  className="h-full w-full object-contain"
                  style={{ imageRendering: c.pixelate ? "pixelated" : "auto" }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted">No image yet</div>
              )}
            </div>
            <Card.Header className="flex flex-col gap-1.5">
              <Card.Title>{c.name}</Card.Title>
              <div className="flex flex-wrap gap-1">
                <Chip size="sm">
                  {c.item_count} {c.item_count === 1 ? "item" : "items"}
                </Chip>
                <Chip size="sm">{ORDERS.find((o) => o.id === c.item_order)?.label}</Chip>
                {c.source && (
                  <Chip size="sm">
                    {/* A pulsing green dot: this collection is fed live. */}
                    <span className="relative mr-1 flex size-2">
                      <span className="absolute inline-flex size-full animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex size-2 rounded-full bg-success" />
                    </span>
                    Data source
                  </Chip>
                )}
              </div>
            </Card.Header>
          </Card>
        ))}
      </div>
    </section>
  );
}

function NewCategoryDialog(props: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (c: Category) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      props.onCreated(await api.createCategory({ name: name.trim() }));
      props.onOpenChange(false);
      setName("");
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
      title="New collection"
      footer={
        <>
          <Button variant="tertiary" onPress={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button isDisabled={!name.trim() || busy} onPress={create}>
            Create
          </Button>
        </>
      }
    >
      <TextInput label="Name" value={name} onChange={setName} placeholder="Bird of the day" autoFocus />
      {error && <p className="text-sm text-danger">{error}</p>}
    </Dialog>
  );
}
