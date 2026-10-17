import { Button, Spinner, Toast } from "@heroui/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, type Settings } from "./api";
import { FrameStatus } from "./components/FrameStatus";
import { Logo } from "./components/Logo";
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
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.settings().then(setSettings);
  }, []);

  return (
    <SettingsContext value={settings ?? { orientation: "landscape", switch: "1d", collection_order: "in_order" }}>
      <div className="min-h-screen bg-background text-foreground">
        <Toast.Provider placement="bottom" />
        <header className="border-b border-separator">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <a href="#/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Logo />
              Peek
            </a>
            <nav className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onPress={() => go("#/settings")}>
                Settings
              </Button>
              <FrameStatus />
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">
          {/* Page transitions: the old page fades out, then the new one fades
              in while rising a little. A collection's tabs change inside its
              page, so they don't count as a new page. Off for people who asked
              their system for less motion. */}
          <MotionConfig reducedMotion="user">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={route.page === "category" ? `category-${route.id}` : route.page}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] } }}
                exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeIn" } }}
              >
                {!settings ? (
                  <Spinner />
                ) : route.page === "settings" ? (
                  <SettingsPage tab={route.tab} settings={settings} onChange={setSettings} />
                ) : route.page === "category" ? (
                  <CategoryPage id={route.id} tab={route.tab} />
                ) : (
                  <CategoriesPage />
                )}
              </motion.div>
            </AnimatePresence>
          </MotionConfig>
        </main>
      </div>
    </SettingsContext>
  );
}
