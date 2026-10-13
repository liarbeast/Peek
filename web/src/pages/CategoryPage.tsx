import { Chip, Spinner, Tabs } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import { api, type Category, type Item, type Template } from "../api";
import { ContentTab } from "./category/ContentTab";
import { FieldsTab } from "./category/FieldsTab";
import { SettingsTab } from "./category/SettingsTab";
import { StyleTab } from "./category/StyleTab";

export function CategoryPage({ id, templates }: { id: number; templates: Template[] }) {
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
  const template = templates.find((t) => t.name === category.template) ?? templates[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <a href="#/" className="text-sm text-muted hover:underline">
          ← Categories
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{category.name}</h1>
          <Chip size="sm">{template.label}</Chip>
          {!category.enabled && (
            <Chip size="sm" color="warning">
              Off
            </Chip>
          )}
        </div>
      </div>

      <Tabs>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Category sections">
            <Tabs.Tab id="content">
              Content
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
        <Tabs.Panel id="content" className="pt-4">
          <ContentTab category={category} items={items} onChange={reload} onCategoryChange={setCategory} />
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
