import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the Python server runs on 8080; Vite forwards API calls to it.
const backend = "http://localhost:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../server/peek/static/app",
    emptyOutDir: true,
    // A home-network app; one bundle is fine.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    proxy: {
      "/api": backend,
      "/images": backend,
      "/frame": backend,
      "/render": backend,
      "/samples": backend,
    },
  },
});
