import { Chip, Spinner, Tabs } from "@heroui/react";
import { ArrowLeft } from "@gravity-ui/icons";
import { useCallback, useEffect, useState } from "react";
import { api, type Category, type Item, type Template } from "../api";
import { ItemsTab } from "./category/ItemsTab";
import { FieldsTab } from "./category/FieldsTab";
import { SettingsTab } from "./category/SettingsTab";
import { StyleTab } from "./category/StyleTab";
import { go, type CategoryTab } from "../router";

export function CategoryPage({ id, tab, templates }: { id: number; tab: CategoryTab; templates: Template[] }) {
  const [category, setCategory] = useState<Category | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([api.category(id), api.items(id)]).then(
      ([c, i]) => {
        setCategory(c);
        setItems(i);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);
  useEffect(reload, [reload]);

  if (error) return <p className="text-danger">{error}</p>;
  if (!category) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <a href="#/" className="inline-flex items-center gap-1 text-sm text-muted hover:underline">
          <ArrowLeft width={14} height={14} />
          Collections
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{category.name}</h1>
          {!category.enabled && (
            <Chip size="sm" color="warning">
              Off
            </Chip>
          )}
        </div>
      </div>

      <Tabs selectedKey={tab} onSelectionChange={(key) => go(`#/categories/${id}/${key}`)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Collection sections">
            <Tabs.Tab id="items">
              Items
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="fields">
              Fields
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="style">
              Style
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="settings">
              Settings
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="items" className="pt-4">
          <ItemsTab category={category} items={items} onChange={reload} onCategoryChange={setCategory} />
        </Tabs.Panel>
        <Tabs.Panel id="fields" className="pt-4">
          <FieldsTab key={JSON.stringify(category.fields)} category={category} onSaved={setCategory} />
        </Tabs.Panel>
        <Tabs.Panel id="style" className="pt-4">
          <StyleTab
            key={JSON.stringify(category.fields)}
            category={category}
            templates={templates}
            items={items}
            onSaved={setCategory}
          />
        </Tabs.Panel>
        <Tabs.Panel id="settings" className="pt-4">
          <SettingsTab category={category} onSaved={setCategory} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
