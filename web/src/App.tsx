import { Button, Spinner, Toast } from "@heroui/react";
import { useEffect, useState } from "react";
import { api, type Settings, type Template } from "./api";
import { PanelImage } from "./components/PanelImage";
import { Dialog } from "./components/ui";
import { CategoriesPage } from "./pages/CategoriesPage";
import { CategoryPage } from "./pages/CategoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { go, useRoute } from "./router";
import { SettingsContext } from "./settings";

// Follow the system's light or dark setting.
function useSystemTheme() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
}

export function App() {
  useSystemTheme();
  const route = useRoute();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showFrame, setShowFrame] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);

  useEffect(() => {
    api.templates().then(setTemplates);
    api.settings().then(setSettings);
    const bump = () => setFrameVersion((v) => v + 1);
    window.addEventListener("peek:frame-changed", bump);
    return () => window.removeEventListener("peek:frame-changed", bump);
  }, []);

  return (
    <SettingsContext value={settings ?? { orientation: "landscape" }}>
      <div className="min-h-screen bg-background text-foreground">
        <Toast.Provider placement="bottom" />
        <header className="border-b border-separator">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <a href="#/" className="text-lg font-semibold tracking-tight">
              Peek
            </a>
            <nav className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onPress={() => go("#/settings")}>
                Settings
              </Button>
              <Button variant="tertiary" size="sm" onPress={() => setShowFrame(true)}>
                On the frame now
              </Button>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">
          {!templates || !settings ? (
            <Spinner />
          ) : route.page === "settings" ? (
            <SettingsPage settings={settings} onChange={setSettings} />
          ) : route.page === "category" ? (
            <CategoryPage key={route.id} id={route.id} templates={templates} />
          ) : (
            <CategoriesPage />
          )}
        </main>

        <Dialog isOpen={showFrame} onOpenChange={setShowFrame} title="On the frame now" size="lg">
          {showFrame && <PanelImage alt="The frame's current image" load={api.framePreview} deps={[frameVersion]} />}
          <p className="text-sm text-muted">The frame picks this up on its next wake.</p>
        </Dialog>
      </div>
    </SettingsContext>
  );
}
