import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// CLAUDE.md rule 3: src/core is pure TypeScript. Keep in sync with docs/ARCHITECTURE.md "Layers".
const coreRestrictions = {
  patterns: [
    { group: ["discord.js", "discord.js/*", "@discordjs/*"], message: "src/core is pure TypeScript: no discord.js." },
    { group: ["node:*"], message: "src/core is pure TypeScript: no Node APIs." },
    {
      group: ["**/adapters", "**/adapters/*", "**/app", "**/app/*"],
      message: "src/core imports nothing from the other layers.",
    },
  ],
};

const nodeBuiltins = [
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "dns",
  "events",
  "fs",
  "fs/promises",
  "http",
  "https",
  "net",
  "os",
  "path",
  "process",
  "stream",
  "timers",
  "tls",
  "url",
  "util",
  "worker_threads",
  "zlib",
].map((name) => ({ name, message: "src/core is pure TypeScript: no Node APIs." }));

export default defineConfig([
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { ...coreRestrictions, paths: nodeBuiltins }],
      // No clock and no environment in core either: time and config come in as arguments.
      "no-restricted-globals": [
        "error",
        { name: "process", message: "src/core gets its input as arguments, not from process." },
        { name: "setTimeout", message: "src/core has no clock: the scheduler lives in src/adapters." },
        { name: "setInterval", message: "src/core has no clock: the scheduler lives in src/adapters." },
        { name: "fetch", message: "src/core has no network: the site client lives in src/adapters." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "src/core has no clock: pass the time in." },
      ],
    },
  },
  globalIgnores(["dist/**", "coverage/**", "design/**", ".claude/**"]),
]);
