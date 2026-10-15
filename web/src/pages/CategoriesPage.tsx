import { Button, Card, Chip, Spinner } from "@heroui/react";
import { useEffect, useState } from "react";
import { api, imageUrl, type Category } from "../api";
import { Dialog, TextInput } from "../components/ui";
import { go } from "../router";
import { ORDERS } from "./category/SettingsTab";
import { refreshLabel } from "../timing";

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

      {categories?.some((c) => c.current) && (
        <CategoryGroup
          title="Currently active"
          subtitle={switchText(categories.find((c) => c.current))}
          categories={categories.filter((c) => c.current)}
        />
      )}
      {categories && categories.length > 0 && (
        <CategoryGroup
          title="In rotation"
          empty={
            categories.some((c) => c.enabled)
              ? undefined
              : "No collections in rotation. Turn on “Show this collection on the frame” in its Settings tab."
          }
          categories={categories.filter((c) => c.enabled && !c.current)}
        />
      )}
      {categories?.some((c) => !c.enabled && !c.current) && (
        <CategoryGroup title="Disabled" categories={categories.filter((c) => !c.enabled && !c.current)} />
      )}

      <NewCategoryDialog
        isOpen={creating}
        onOpenChange={setCreating}
        onCreated={(c) => go(`#/categories/${c.id}`)}
      />
    </div>
  );
}

// When and to what the frame moves on from the collection it shows, in words:
// "Switching to Birds in 7 hours", "Switching to the next collection (shuffled) after 3 more items".
function switchText(current: Category | undefined): string | undefined {
  const next = current?.next_switch;
  if (!next) return undefined;
  const to = next.shuffle
    ? "Switching to the next collection (shuffled)"
    : next.next && next.next !== current.name
      ? `Switching to ${next.next}`
      : "Starting this collection again"; // the only one in rotation
  if ("items_left" in next) {
    const n = next.items_left;
    return n === 0 ? `${to} on the next wake` : `${to} after ${n} more ${n === 1 ? "item" : "items"}`;
  }
  const minutes = Math.max(1, Math.round((new Date(next.at).getTime() - Date.now()) / 60000));
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    minutes < 60 ? [minutes, "minute"] : minutes < 48 * 60 ? [Math.round(minutes / 60), "hour"] : [Math.round(minutes / 1440), "day"];
  return `${to} ${new Intl.RelativeTimeFormat("en").format(amount, unit)}`;
}

// A heading and the categories under it, as cards.
function CategoryGroup(props: { title: string; subtitle?: string; categories: Category[]; empty?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.subtitle && <p className="text-sm text-muted">{props.subtitle}</p>}
      </div>
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
                <Chip size="sm">{refreshLabel(c.refresh).short}</Chip>
                {c.source && (
                  <Chip size="sm">
                    {/* A pulsing green dot: this collection is fed live. */}
                    <span className="relative mr-1 flex size-2">
                      <span className="absolute inline-flex size-full live-ping rounded-full bg-success opacity-75" />
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
