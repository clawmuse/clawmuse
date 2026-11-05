import { build as bundle } from "esbuild";
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Keep the temporary module beside the source so workspace imports resolve normally.
const file = fileURLToPath(new URL(".prerender.mjs", import.meta.url));
try {
  await bundle({
    entryPoints: [fileURLToPath(new URL("prerender.tsx", import.meta.url))],
    outfile: file,
    bundle: true,
    platform: "node",
    mainFields: ["module", "main"],
    format: "esm",
    external: ["react", "react-dom/*", "react/jsx-runtime", "i18next", "node:*"],
    // Bundled CommonJS hooks must resolve this workspace's React, like the renderer.
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
    jsx: "automatic",
  });
  const result = spawnSync(process.execPath, [file], { stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(file, { force: true });
}
