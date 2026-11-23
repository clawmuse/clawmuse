import { vi } from "vitest";
import type React from "react";

const RouterPassthrough = ({ children }: { children?: React.ReactNode }) => children;

const navigation = { addListener: vi.fn(() => () => {}) };

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
  useNavigation: vi.fn(() => navigation),
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
  useNavigation,
  usePathname,
  useRootNavigationState,
  useRouter,
} = runtime;
