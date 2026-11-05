/* Test controls deliberately bind callbacks to each simulated pairing. */
/* eslint-disable react-perf/jsx-no-new-function-as-prop */
import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ConnectionLinkImport, PasswordRequiredPairing } from "@/runtime/host-runtime";
import { i18n } from "@/i18n/i18next";
import { OfferLinkListener } from "./offer-link-listener";

const links = vi.hoisted(() => ({
  initial: "https://app.clawmuse.com/#offer=invitation",
  event: null as ((event: { url: string }) => void) | null,
  import: vi.fn(),
  replace: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("expo-linking", () => ({
  getInitialURL: async () => links.initial,
  addEventListener: (_name: string, callback: typeof links.event) => {
    links.event = callback;
    return { remove: links.remove };
  },
}));
vi.mock("expo-router", () => {
  const router = { replace: links.replace };
  return { useRouter: () => router };
});
vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({ importConnectionLink: links.import }),
}));
vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({
    children,
    header,
  }: {
    children: ReactNode;
    header: { title: string };
  }) => (
    <div role="dialog" aria-label={header.title}>
      {children}
    </div>
  ),
}));
vi.mock("@/components/pair-link-modal", () => ({
  PairLinkModal: ({
    passwordRequired,
    onSaved,
  }: {
    passwordRequired: PasswordRequiredPairing;
    onSaved: () => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        void passwordRequired.pairing.submit(passwordRequired.link, "secret").then(onSaved)
      }
    >
      Enter host password
    </button>
  ),
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  links.event = null;
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = () => act(() => root.render(<OfferLinkListener />));

it("shows anonymous invitation approval and its fingerprint before navigating", async () => {
  let finish!: (result: ConnectionLinkImport) => void;
  links.import.mockImplementation((_link, _target, pending) => {
    pending({ fingerprint: "123456abcdef", expiresAt: "2026-11-04T12:00:00Z" });
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  render();
  await vi.waitFor(() => expect(container.textContent).toContain("123456abcdef"));
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(links.replace).not.toHaveBeenCalled();
  await act(async () => finish({ status: "connected", serverId: "srv_invited" }));
  expect(container.textContent).toBe("");
  expect(links.replace).toHaveBeenCalledOnce();
});

it("continues a password-protected link through its existing confirmed pairing", async () => {
  const pairing = { submit: vi.fn().mockResolvedValue({ status: "connected" }) };
  links.import.mockResolvedValue({ status: "password_required", link: links.initial, pairing });
  render();
  await vi.waitFor(() => expect(container.querySelector("button")).not.toBeNull());
  await act(async () => container.querySelector("button")!.click());
  expect(pairing.submit).toHaveBeenCalledWith(links.initial, "secret");
  expect(links.replace).toHaveBeenCalledOnce();
});

it("shows a rejected invitation instead of silently leaving the login page", async () => {
  links.import.mockRejectedValue(new Error("Invitation expired"));
  render();
  await vi.waitFor(() => expect(container.textContent).toContain("Invitation expired"));
  expect(links.replace).not.toHaveBeenCalled();
});

it("does not replace feedback with an older link's late result", async () => {
  let fail!: (error: Error) => void;
  links.import.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  links.import.mockImplementationOnce((_link, _target, pending) => {
    pending({ fingerprint: "newfingerprint", expiresAt: "2026-11-04T12:00:00Z" });
    return new Promise(() => {});
  });
  render();
  await vi.waitFor(() => expect(links.import).toHaveBeenCalledOnce());
  await act(async () => links.event!({ url: "https://app.clawmuse.com/#offer=new" }));
  await act(async () => fail(new Error("Old invitation expired")));
  expect(container.textContent).toContain("newfingerprint");
  expect(container.textContent).not.toContain("Old invitation");
});
