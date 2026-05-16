import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deploys to a custom domain (blackdealing.mcdic.net) at the root path.
// Forks without a custom domain should set VITE_BASE_PATH to the project
// subpath, e.g. "/poker_logic_demo/" for github.io/<user>/<repo>/ URLs.
const base = process.env.VITE_BASE_PATH ?? "/";

// Resolve a short commit SHA at build time so the footer can show which
// version is live. In CI, GITHUB_SHA is provided by GitHub Actions. Locally,
// fall back to `git rev-parse`. If neither works (e.g. shallow tarball
// without git history), we surface "dev" so the footer never breaks the build.
function resolveCommit(): string {
  const ci = process.env.GITHUB_SHA;
  if (ci) return ci.slice(0, 7);
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
      .slice(0, 7);
  } catch {
    return "dev";
  }
}

export default defineConfig({
  base,
  plugins: [react()],
  worker: {
    format: "es",
  },
  define: {
    __COMMIT__: JSON.stringify(resolveCommit()),
  },
  server: {
    fs: {
      strict: false,
    },
  },
});
