import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the Python server runs on 8080; Vite forwards API calls to it.
// compose.dev.yaml points this at the server's container, and turns on polling
// because file events don't always reach a container on a Mac.
const backend = process.env.PEEK_BACKEND ?? "http://localhost:8080";
const poll = Boolean(process.env.PEEK_POLL);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../server/peek/static/app",
    emptyOutDir: true,
    // A home-network app; one bundle is fine.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    watch: poll ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      "/api": backend,
      "/images": backend,
      "/frame": backend,
      "/render": backend,
      "/samples": backend,
    },
  },
});
