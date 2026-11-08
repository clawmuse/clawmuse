import { syncBrandAssets } from "./sync-branding-assets.mjs";
import { writeBrandModules } from "./brand-modules.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const brand = JSON.parse(readFileSync(new URL("../branding/brand.json", import.meta.url), "utf8"));
const check = process.argv.includes("--check");
await writeBrandModules({ root: fileURLToPath(new URL("../", import.meta.url)), brand, check });
await syncBrandAssets({ check, brand });
