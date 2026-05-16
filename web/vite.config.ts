import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages: project page lives at /poker_logic_demo/.
// Override with VITE_BASE_PATH for local dev or custom domains.
const base = process.env.VITE_BASE_PATH ?? "/poker_logic_demo/";

export default defineConfig({
  base,
  plugins: [react()],
  worker: {
    format: "es",
  },
  server: {
    fs: {
      // Allow Vite to serve files from web/src/wasm (which is one level above project root).
      strict: false,
    },
  },
});
