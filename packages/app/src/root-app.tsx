import { RenderProfile } from "@/utils/render-profiler";
import { useCallback, useMemo, useState, type ComponentProps } from "react";
import { ExpoRoot } from "expo-router";
import Head from "expo-router/head";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform, useWindowDimensions } from "react-native";
import { queryClient } from "@/data/query-client";
import { I18nProvider } from "@/i18n/provider";
import { RootErrorBoundary } from "@/components/root-error-boundary";

// Keep Expo's platform filtering, route root, and lazy import configuration.
const { ctx: context } = require("expo-router/_ctx") as {
  ctx: ComponentProps<typeof ExpoRoot>["context"];
};

export function RootApp() {
  return (
    <RenderProfile id="App">
      <RootRouter context={context} />
    </RenderProfile>
  );
}

export function RootRouter({ context: routes }: Pick<ComponentProps<typeof ExpoRoot>, "context">) {
  const { width, height } = useWindowDimensions();
  const safeAreaStyle = useMemo(
    () => (Platform.OS === "android" ? { flex: 0, width, height } : undefined),
    [width, height],
  );
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((value) => value + 1), []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <SafeAreaProvider
          // Android Fabric can retain the flex root's old rotation constraints.
          // Follow window dimensions without remounting the router or workspace.
          style={safeAreaStyle}
        >
          <RootErrorBoundary key={generation} onReload={reload}>
            <Head.Provider>
              {/* Recreate the router at a safe destination before a failed route can mount. */}
              <ExpoRoot
                context={routes}
                location={generation === 0 ? undefined : "/open-project"}
              />
            </Head.Provider>
          </RootErrorBoundary>
        </SafeAreaProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
