import { Button, Spinner, Toast } from "@heroui/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, type Settings, type Template } from "./api";
import { PanelImage } from "./components/PanelImage";
import { Dialog } from "./components/ui";
import { CategoriesPage } from "./pages/CategoriesPage";
import { CategoryPage } from "./pages/CategoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { go, useRoute } from "./router";
import { SettingsContext } from "./settings";
import { depth, getTransition, TRANSITIONS } from "./transitions";

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
  const [transition, setTransition] = useState(getTransition);

  // Which way the last page change went, for transitions that care: 1 deeper, -1 back.
  const last = useRef(route);
  const direction = useRef(1);
  if (last.current !== route) {
    direction.current = depth(route) < depth(last.current) ? -1 : 1;
    last.current = route;
  }

  useEffect(() => {
    const changed = (e: Event) => setTransition((e as CustomEvent<string>).detail);
    window.addEventListener("peek:transition", changed);
    return () => window.removeEventListener("peek:transition", changed);
  }, []);

  useEffect(() => {
    api.templates().then(setTemplates);
    api.settings().then(setSettings);
    const bump = () => setFrameVersion((v) => v + 1);
    window.addEventListener("peek:frame-changed", bump);
    return () => window.removeEventListener("peek:frame-changed", bump);
  }, []);

  return (
    <SettingsContext value={settings ?? { orientation: "landscape", refresh: "1h", switch: "1d" }}>
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

        <main className="mx-auto max-w-5xl overflow-x-clip px-4 py-6">
          {/* Page transitions (see transitions.ts): the old page leaves, then
              the new one comes in. A collection's tabs change inside its page,
              so they don't count as a new page. Off for people who asked their
              system for less motion. */}
          <MotionConfig reducedMotion="user">
            <AnimatePresence mode="wait" initial={false} custom={direction.current}>
              <motion.div
                key={route.page === "category" ? `category-${route.id}` : route.page}
                custom={direction.current}
                variants={TRANSITIONS.find((t) => t.id === transition)?.variants}
                initial="enter"
                animate="shown"
                exit="exit"
                transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1], opacity: { duration: 0.15 } }}
              >
                {!templates || !settings ? (
                  <Spinner />
                ) : route.page === "settings" ? (
                  <SettingsPage settings={settings} onChange={setSettings} />
                ) : route.page === "category" ? (
                  <CategoryPage id={route.id} tab={route.tab} templates={templates} />
                ) : (
                  <CategoriesPage />
                )}
              </motion.div>
            </AnimatePresence>
          </MotionConfig>
        </main>

        <Dialog isOpen={showFrame} onOpenChange={setShowFrame} title="On the frame now" size="lg">
          {showFrame && <PanelImage alt="The frame's current image" load={api.framePreview} deps={[frameVersion]} />}
          <p className="text-sm text-muted">The frame picks this up on its next wake.</p>
        </Dialog>
      </div>
    </SettingsContext>
  );
}
