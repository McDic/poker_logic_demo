import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deploys to a custom domain (blackdealing.mcdic.net) at the root path.
// Forks without a custom domain should set VITE_BASE_PATH to the project
// subpath, e.g. "/poker_logic_demo/" for github.io/<user>/<repo>/ URLs.
const base = process.env.VITE_BASE_PATH ?? "/";

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
