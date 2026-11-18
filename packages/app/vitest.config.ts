import { defineConfig, configDefaults } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import path from "path";
import fs from "fs";
import { transformSync } from "@babel/core";
import { build } from "esbuild";

// Set this before Vite resolves dependencies and Vitest starts its workers.
Object.assign(process.env, { NODE_ENV: "test" });

const appNodeModules = path.resolve(__dirname, "node_modules");
const rootNodeModules = path.resolve(__dirname, "../../node_modules");
const webExtensions = [
  ".web.mjs",
  ".web.js",
  ".web.mts",
  ".web.ts",
  ".web.jsx",
  ".web.tsx",
  ".mjs",
  ".js",
  ".mts",
  ".ts",
  ".jsx",
  ".tsx",
  ".json",
];
const resolvePackageEntry = (packageName: string) => {
  const appPackagePath = path.resolve(appNodeModules, packageName);
  return fs.existsSync(appPackagePath)
    ? appPackagePath
    : path.resolve(rootNodeModules, packageName);
};

export default defineConfig({
  plugins: [
    {
      name: "bundle-markdown-wasm-loader",
      enforce: "pre",
      async transform(source, id) {
        if (!/\/react-native-enriched-markdown\/.*\/web\/wasm\/md4c\.js$/.test(id.split("?")[0]))
          return;
        // The package puts this CommonJS loader inside a type:module directory.
        // Keep its real WASM implementation and convert its export for Vite.
        const result = await build({
          stdin: { contents: source, sourcefile: "md4c.cjs" },
          bundle: true,
          format: "esm",
          platform: "browser",
          write: false,
        });
        return { code: result.outputFiles[0].text, map: null };
      },
    },
    {
      name: "exclude-metro-bootstrap",
      enforce: "pre",
      transform(_source, id) {
        // Vite owns module loading in tests. Expo's entry also installs Metro's
        // require/import.meta runtime, which cannot execute in a Node worker.
        if (/\/expo\/src\/Expo\.fx(?:\.web)?\.tsx$/.test(id)) return "export {};";
      },
    },
    {
      name: "reanimated-web-style-helpers",
      transform(_source, id) {
        // Reanimated writes animated styles to the DOM through react-native-web helpers it loads
        // with `require` inside try/catch. Vite serves ESM, so the require throws, the helpers stay
        // undefined, and the first animated style update after mount crashes the component.
        if (
          !id.split("?")[0].endsWith("/lib/module/ReanimatedModule/js-reanimated/webUtils.web.js")
        ) {
          return;
        }
        return {
          code: [
            'export { default as createReactDOMStyle } from "react-native-web/dist/exports/StyleSheet/compiler/createReactDOMStyle";',
            'export { createTransformValue, createTextShadowValue } from "react-native-web/dist/exports/StyleSheet/preprocess";',
          ].join("\n"),
          map: null,
        };
      },
    },
    {
      name: "compile-react-components",
      enforce: "pre",
      transform(source, id) {
        // Exercise compiler-sensitive labels, overlay lifetime and timeline row revisions in the same
        // form as Expo.
        const usageComponent = id.includes("/src/usage/") && id.endsWith(".tsx");
        const overlayLayer = id.endsWith("/src/lib/overlay-root.ts");
        const streamRow = id.endsWith("/src/agent-stream/stream-row.tsx");
        if ((!usageComponent && !overlayLayer && !streamRow) || id.includes(".test.")) return;
        const result = transformSync(source, {
          filename: id,
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ["typescript", "jsx"] },
          plugins: [["babel-plugin-react-compiler", { target: "19" }]],
          sourceMaps: true,
        });
        if (result?.code) return { code: result.code, map: result.map };
      },
    },
    {
      name: "bundle-i18n-resources",
      // Metro resolves literal requires lazily. Vite's TS transform leaves them
      // to Node, which cannot resolve the resource modules. Bundle this boundary
      // so unit and browser consumers exercise the same deferred module loading.
      async transform(_source, id) {
        if (path.resolve(id) !== path.resolve(__dirname, "src/i18n/i18next.ts")) return;
        const result = await build({
          entryPoints: [id],
          bundle: true,
          format: "esm",
          platform: "neutral",
          external: ["i18next", "react-i18next"],
          write: false,
        });
        return { code: result.outputFiles[0].text, map: null };
      },
    },
  ],
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "e2e/**"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "src/**/*.{test,spec}.{ts,tsx}",
            "plugins/**/*.{test,spec}.ts",
            "scripts/**/*.{test,spec}.ts",
            "modules/**/*.{test,spec}.{ts,tsx}",
            "native-release-version.test.ts",
            "app.config.test.ts",
            "vitest-environment.test.ts",
          ],
          setupFiles: [path.resolve(__dirname, "vitest.setup.ts")],
          exclude: [...configDefaults.exclude, "e2e/**", "src/**/*.browser.{test,spec}.{ts,tsx}"],
        },
      },
      {
        extends: true,
        resolve: {
          alias: [
            // The app renders LegendList on native only, from the patched native build. Browser
            // tests render that build too, instead of the package's separate web build. Unit tests
            // load it outside Vite, where its react-native import would miss the web alias.
            {
              find: /^@legendapp\/list\/react-native$/,
              replacement: path.resolve(rootNodeModules, "@legendapp/list/react-native.mjs"),
            },
          ],
        },
        test: {
          name: "browser",
          fileParallelism: false,
          include: ["src/**/*.browser.{test,spec}.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: playwright({
              // Exercise real WebGL glyph rendering on GPU-less CI runners.
              launchOptions: { args: ["--enable-unsafe-swiftshader"] },
            }),
            headless: true,
            connectTimeout: 180_000,
            instances: [{ browser: "chromium" }],
            screenshotDirectory: ".vitest-screenshots",
          },
          globalSetup: path.resolve(__dirname, "src/runtime/websocket-test-global-setup.ts"),
        },
      },
    ],
    /**
     * Expo pulls in native tooling (xcode, etc.) that executes files relying on `process.send`.
     * Vitest's default worker pool uses worker_threads, which intentionally stub that API and
     * immediately throw `Unexpected call to process.send`. Running the suite in forked processes
     * keeps `process.send` intact so the app tests can boot before hitting the intentional failures.
     */
    pool: "forks",
    maxWorkers: 2,
    server: {
      deps: {
        fallbackCJS: true,
        inline: [
          "react-native-enriched-markdown",
          "zustand",
          "@tanstack/react-query",
          "react-native-web",
          "react-native-reanimated",
          "react-native-worklets",
          "react-native-gesture-handler",
          "react-native-keyboard-controller",
        ],
      },
    },
  },
  // Match Metro's web-first resolution in the optimizer as well as Vite.
  // Packages with explicit native imports or runtime transforms stay unbundled.
  optimizeDeps: {
    esbuildOptions: { resolveExtensions: webExtensions },
    entries: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
    // Bundle the CJS dependencies of the excluded gesture-handler package for the browser.
    include: [
      "uuid",
      "react",
      "expo-keep-awake",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react/compiler-runtime",
      "expo-router/react-navigation",
      "@testing-library/react",
      "@tanstack/react-query",
      "@tanstack/react-virtual",
      "@legendapp/list/react-native",
      "react-i18next",
      "i18next",
      "@marijn/find-cluster-break",
      "tiny-invariant",
      "react/jsx-dev-runtime",
      "react-native-gesture-handler > hoist-non-react-statics",
      "react-native-gesture-handler > invariant",
      // Loaded by the reanimated-web-style-helpers plugin, which the dependency scan does not see.
      "react-native-web/dist/exports/StyleSheet/compiler/createReactDOMStyle",
      "react-native-web/dist/exports/StyleSheet/preprocess",
    ],
    exclude: [
      // Plugin UI exports are host-supplied declarations. Surface tests bind the real host UI.
      "@getpaseo/plugin/client/ui",
      "react-native-enriched-markdown",
      "expo",
      "expo-blur",
      "expo-crypto",
      "expo-modules-core",
      "react-native-screens",
      "react-native-reanimated",
      "react-native-gesture-handler",
      "react-native-keyboard-controller",
    ],
  },
  // babel-preset-expo compiles JSX with the automatic runtime, so app modules don't import React.
  esbuild: { jsx: "automatic" },
  // The globals a React Native bundler defines, which esbuild is no longer there to supply for
  // the package excluded above.
  define: {
    "process.env.JEST_WORKER_ID": "undefined",
    __DEV__: "false",
    global: "globalThis",
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    extensions: webExtensions,
    alias: [
      // CommonJS require bypasses the React Native web alias in Node tests.
      {
        find: /^@floating-ui\/react-native$/,
        replacement: path.resolve(
          rootNodeModules,
          "@floating-ui/react-native/dist/floating-ui.react-native.esm.js",
        ),
      },
      {
        find: /^@getpaseo\/relay\/e2ee$/,
        replacement: path.resolve(__dirname, "../relay/src/e2ee.ts"),
      },
      {
        find: /^@getpaseo\/relay$/,
        replacement: path.resolve(__dirname, "../relay/src/index.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "src") },
      {
        find: /^expo-router$/,
        replacement: path.resolve(__dirname, "test-stubs/expo-router.ts"),
      },
      // Keep keyboard-controller's imports in Vite so native aliases and platform extensions apply.
      {
        find: /^react-native-keyboard-controller$/,
        replacement: path.resolve(
          resolvePackageEntry("react-native-keyboard-controller"),
          "lib/module/index.js",
        ),
      },
      // The CJS entry bypasses Vite's React Native alias and web-extension resolution.
      {
        find: /^react-native-gesture-handler$/,
        replacement: path.resolve(
          rootNodeModules,
          "react-native-gesture-handler/lib/module/index.js",
        ),
      },
      // Must precede the `react-native` alias: a string `find` matches by prefix, so this subpath
      // would otherwise resolve inside a react-native-web *file* and break the dependency scan.
      // Reanimated only imports it on the native path, which no test takes.
      {
        find: /^react-native\/Libraries\/Renderer\/shims\/ReactFabric$/,
        replacement: path.resolve(__dirname, "test-stubs/react-native-fabric-shim.ts"),
      },
      // The CJS entry requires the real react-native, whose Flow sources do not parse.
      {
        find: /^@floating-ui\/react-native$/,
        replacement: path.resolve(
          rootNodeModules,
          "@floating-ui/react-native/dist/floating-ui.react-native.esm.js",
        ),
      },
      // Point to react-native-web's ESM build so Vite can transform its imports and apply the
      // react alias below (the CJS build uses require('react') which bypasses
      // Vite alias resolution). The stub re-exports it and adds what web lacks.
      {
        find: "react-native",
        replacement: path.resolve(__dirname, "test-stubs/react-native.mjs"),
      },
      { find: "react", replacement: resolvePackageEntry("react") },
      {
        find: "react-dom",
        replacement: resolvePackageEntry("react-dom"),
      },
      {
        find: /^@xterm\/addon-ligatures\/lib\/addon-ligatures\.mjs$/,
        replacement: path.resolve(__dirname, "test-stubs/xterm-addon-ligatures.ts"),
      },
      {
        find: /^@xterm\/addon-ligatures$/,
        replacement: path.resolve(__dirname, "test-stubs/xterm-addon-ligatures.ts"),
      },
      {
        find: /^react-native-unistyles$/,
        replacement: path.resolve(__dirname, "test-stubs/react-native-unistyles.ts"),
      },
      {
        find: /^react-native-svg$/,
        replacement: path.resolve(__dirname, "test-stubs/react-native-svg.ts"),
      },
      // Both ship untranspiled Flow and fail to parse on import, which takes out any test that
      // mounts a menu surface.
      {
        find: /^react-native-safe-area-context$/,
        replacement: path.resolve(__dirname, "test-stubs/react-native-safe-area-context.ts"),
      },
      {
        find: /^@gorhom\/bottom-sheet$/,
        replacement: path.resolve(__dirname, "test-stubs/gorhom-bottom-sheet.ts"),
      },
      {
        find: /^react-native-reanimated\/scripts\/validate-worklets-version$/,
        replacement: path.resolve(__dirname, "test-stubs/reanimated-validate-worklets-version.ts"),
      },
      {
        find: /^expo-clipboard$/,
        replacement: path.resolve(__dirname, "test-stubs/expo-clipboard.ts"),
      },
      {
        find: /^expo-linking$/,
        replacement: path.resolve(__dirname, "test-stubs/expo-linking.ts"),
      },
      // No Node implementation: every call on the real module rejects, so a test
      // touching a persisted store drowns in unhandled rejections.
      {
        find: /^@react-native-async-storage\/async-storage$/,
        replacement: path.resolve(__dirname, "test-stubs/async-storage.ts"),
      },
      {
        find: /^lucide-react-native$/,
        replacement: path.resolve(__dirname, "test-stubs/lucide-react-native.ts"),
      },
    ],
  },
});
