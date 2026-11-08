import { defineConfig, devices } from "playwright/test";

const baseURL = process.env.WEBSITE_TEST_URL ?? "http://127.0.0.1:8187";
const clawmuseURL = process.env.CLAWMUSE_TEST_URL ?? "http://127.0.0.1:8189";
const clawmuseSpec = "**/clawmuse-i18n.spec.ts";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL, screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", testIgnore: clawmuseSpec, use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", testIgnore: clawmuseSpec, use: { ...devices["Desktop Safari"] } },
    {
      name: "clawmuse-chromium",
      testMatch: clawmuseSpec,
      use: { ...devices["Desktop Chrome"], baseURL: clawmuseURL },
    },
    {
      name: "clawmuse-webkit",
      testMatch: clawmuseSpec,
      use: { ...devices["Desktop Safari"], baseURL: clawmuseURL },
    },
  ],
  webServer: process.env.WEBSITE_TEST_URL
    ? undefined
    : [
        {
          command: "node e2e/registry-server.mjs",
          url: "http://127.0.0.1:8188/index.json",
        },
        {
          command: "npm run build && npm run preview -- --host 127.0.0.1 --port 8187 --strictPort",
          // Probe the server without running the homepage loader's live GitHub requests.
          url: new URL("/logo.svg", baseURL).href,
          stdout: "pipe",
          env: {
            CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
            PLUGINS_REGISTRY_URL: "http://127.0.0.1:8188",
          },
        },
        {
          command:
            "npm run build:clawmuse && npm run preview -- --config clawmuse/vite.config.ts --host 127.0.0.1 --port 8189 --strictPort",
          url: clawmuseURL,
        },
      ],
});
