// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useToastHost } from "./toast-host";

describe("useToastHost", () => {
  it("brands error toasts while preserving ordinary user content", () => {
    const { result } = renderHook(() => useToastHost());
    act(() =>
      result.current.api.error("Error invoking remote method 'paseo:invoke': Error: PASEO failed"),
    );
    expect(result.current.toast?.content).toBe("ClawMuse failed");
    expect(result.current.toast?.nativeMessage).toBe("ClawMuse failed");
    act(() => result.current.api.show("Paseo user project uploaded"));
    expect(result.current.toast?.content).toBe("Paseo user project uploaded");
  });

  it("preserves filesystem paths, URLs and identifiers in error messages", () => {
    const { result } = renderHook(() => useToastHost());
    const detail =
      "Paseo failed: /tmp/paseo-plugin, C:\\Paseo\\config.json, https://paseo.sh, paseo://app, @getpaseo/client";
    act(() => result.current.api.error(detail));
    expect(result.current.toast?.content).toBe(detail.replace("Paseo failed", "ClawMuse failed"));
  });

  it("dismisses the toast that show returned the dismiss for", () => {
    const { result } = renderHook(() => useToastHost());

    let dismiss = () => {};
    act(() => {
      dismiss = result.current.api.show("Uploading image…", { durationMs: null });
    });
    expect(result.current.toast?.content).toBe("Uploading image…");

    act(() => dismiss());
    expect(result.current.toast).toBeNull();
  });

  it("leaves a newer toast in place when an older one is dismissed", () => {
    const { result } = renderHook(() => useToastHost());

    let dismissUploading = () => {};
    act(() => {
      dismissUploading = result.current.api.show("Uploading image…", { durationMs: null });
    });
    act(() => {
      result.current.api.show("Image uploaded", { variant: "success" });
    });

    act(() => dismissUploading());
    expect(result.current.toast?.content).toBe("Image uploaded");
  });
});
