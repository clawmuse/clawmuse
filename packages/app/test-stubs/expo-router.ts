import { vi } from "vitest";
import type React from "react";

const RouterPassthrough = ({ children }: { children?: React.ReactNode }) => children;

const runtime = {
  Redirect: () => null,
  Stack: Object.assign(RouterPassthrough, {
    Screen: () => null,
    Protected: RouterPassthrough,
  }),
  router: {
    back: vi.fn(),
    canGoBack: vi.fn(() => false),
    navigate: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    setParams: vi.fn(),
  },
  useGlobalSearchParams: vi.fn(() => ({})),
  useLocalSearchParams: vi.fn(() => ({})),
  usePathname: vi.fn(() => "/"),
  useRootNavigationState: vi.fn(() => ({ key: "root" })),
  useRouter: vi.fn(() => ({
    back: vi.fn(),
    canGoBack: vi.fn(() => false),
    navigate: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    setParams: vi.fn(),
  })),
};

export const {
  Redirect,
  Stack,
  router,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
} = runtime;
