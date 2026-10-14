import { createContext, useContext } from "react";
import type { Settings } from "./api";

// Frame-wide settings, loaded once by App and shared with every page.
export const SettingsContext = createContext<Settings>({ orientation: "landscape", refresh: "1h" });

export const useSettings = () => useContext(SettingsContext);
