import { describe, expect, test } from "vitest";
import {
  classifyRelaySelection,
  recommendRelayNode,
  resolveHostedRelayPresets,
  validateCustomRelayDraft,
  type HostedRelayBrandConfig,
} from "./relay-endpoint-model";

const CLAWMUSE_BRAND: HostedRelayBrandConfig = {
  relayEndpoint: "agent-relay.clawmuse.com:443",
  relayEndpoints: [
    "agent-relay.clawmuse.com:443",
    "agent-relay-cn.clawmuse.com:443",
    "agent-relay.ppb.cn:443",
    "agent-relay-cn.ppb.cn:443",
  ],
  regionalRelayEndpoints: ["agent-relay.clawmuse.com:443", "agent-relay-cn.ppb.cn:443"],
  relayPublicEndpoints: {
    "agent-relay.clawmuse.com:443": "agent-relay.ppb.cn:443",
    "agent-relay-cn.clawmuse.com:443": "agent-relay-cn.ppb.cn:443",
  },
};

describe("relay-endpoint-model", () => {
  test("resolves hosted presets with Guangzhou first and groups all aliases", () => {
    const presets = resolveHostedRelayPresets(CLAWMUSE_BRAND);
    expect(presets.map((p) => p.id)).toEqual(["guangzhou", "singapore"]);
    expect(presets[0]).toMatchObject({
      id: "guangzhou",
      endpoint: "agent-relay-cn.ppb.cn:443",
      publicEndpoint: "agent-relay-cn.ppb.cn:443",
    });
    expect(presets[0]!.aliases).toContain("agent-relay-cn.clawmuse.com:443");
    expect(presets[1]).toMatchObject({
      id: "singapore",
      endpoint: "agent-relay.clawmuse.com:443",
      publicEndpoint: "agent-relay.ppb.cn:443",
    });
    expect(presets[1]!.aliases).toContain("agent-relay.ppb.cn:443");
  });

  test("classifies legacy aliases, current endpoints, and custom overrides accurately", () => {
    const presets = resolveHostedRelayPresets(CLAWMUSE_BRAND);
    expect(
      classifyRelaySelection(
        {
          endpoint: "agent-relay.ppb.cn:443",
          publicEndpoint: "agent-relay.ppb.cn:443",
          useTls: true,
        },
        presets,
      ),
    ).toBe("singapore");
    expect(
      classifyRelaySelection(
        {
          endpoint: "agent-relay-cn.ppb.cn:443",
          publicEndpoint: "agent-relay-cn.ppb.cn:443",
          useTls: true,
        },
        presets,
      ),
    ).toBe("guangzhou");
    expect(
      classifyRelaySelection(
        {
          endpoint: "agent-relay-cn.clawmuse.com:443",
          publicEndpoint: "agent-relay-cn.ppb.cn:443",
          useTls: true,
        },
        presets,
      ),
    ).toBe("guangzhou");
    expect(
      classifyRelaySelection(
        {
          endpoint: "agent-relay.clawmuse.com:443",
          publicEndpoint: "custom-public.example:443",
          useTls: true,
        },
        presets,
      ),
    ).toBe("custom");
    expect(
      classifyRelaySelection({ endpoint: "relay.selfhosted.example:443", useTls: true }, presets),
    ).toBe("custom");
    expect(
      classifyRelaySelection({ endpoint: "agent-relay-cn.ppb.cn:443", useTls: false }, presets),
    ).toBe("custom");
  });

  test("recommends Guangzhou when current Singapore relay is at least 20ms slower", () => {
    const presets = resolveHostedRelayPresets(CLAWMUSE_BRAND);
    const recommendation = recommendRelayNode({
      currentMode: "singapore",
      presets,
      probes: [
        {
          endpoint: "agent-relay.clawmuse.com:443",
          publicEndpoint: "agent-relay.ppb.cn:443",
          ok: true,
          ms: 52,
        },
        {
          endpoint: "agent-relay-cn.ppb.cn:443",
          publicEndpoint: "agent-relay-cn.ppb.cn:443",
          ok: true,
          ms: 11,
        },
      ],
    });
    expect(recommendation).toEqual({
      targetNode: "guangzhou",
      targetEndpoint: "agent-relay-cn.ppb.cn:443",
      targetPublicEndpoint: "agent-relay-cn.ppb.cn:443",
      targetMs: 11,
      currentMs: 52,
    });
  });

  test("does not recommend switching for small latency differences or custom endpoints", () => {
    const presets = resolveHostedRelayPresets(CLAWMUSE_BRAND);
    expect(
      recommendRelayNode({
        currentMode: "singapore",
        presets,
        probes: [
          {
            endpoint: "agent-relay.clawmuse.com:443",
            publicEndpoint: "agent-relay.ppb.cn:443",
            ok: true,
            ms: 25,
          },
          {
            endpoint: "agent-relay-cn.ppb.cn:443",
            publicEndpoint: "agent-relay-cn.ppb.cn:443",
            ok: true,
            ms: 15,
          },
        ],
      }),
    ).toBeNull();
    expect(
      recommendRelayNode({
        currentMode: "custom",
        presets,
        probes: [
          {
            endpoint: "agent-relay-cn.ppb.cn:443",
            publicEndpoint: "agent-relay-cn.ppb.cn:443",
            ok: true,
            ms: 10,
          },
        ],
      }),
    ).toBeNull();
  });

  test("recommends a reachable node when the current node probe failed", () => {
    const presets = resolveHostedRelayPresets(CLAWMUSE_BRAND);
    expect(
      recommendRelayNode({
        currentMode: "singapore",
        presets,
        probes: [
          {
            endpoint: "agent-relay.clawmuse.com:443",
            publicEndpoint: "agent-relay.ppb.cn:443",
            ok: false,
            ms: null,
          },
          {
            endpoint: "agent-relay-cn.ppb.cn:443",
            publicEndpoint: "agent-relay-cn.ppb.cn:443",
            ok: true,
            ms: 14,
          },
        ],
      }),
    ).toEqual({
      targetNode: "guangzhou",
      targetEndpoint: "agent-relay-cn.ppb.cn:443",
      targetPublicEndpoint: "agent-relay-cn.ppb.cn:443",
      targetMs: 14,
      currentMs: null,
    });
  });

  test("validates custom relay host:port drafts", () => {
    expect(
      validateCustomRelayDraft({
        endpoint: " relay.example.com:443 ",
        publicEndpoint: "",
        useTls: true,
      }),
    ).toEqual({
      ok: true,
      endpoint: "relay.example.com:443",
      publicEndpoint: "",
      useTls: true,
    });
    expect(
      validateCustomRelayDraft({
        endpoint: "https://relay.example.com",
        publicEndpoint: "",
        useTls: true,
      }),
    ).toMatchObject({ ok: false, field: "endpoint" });
    expect(
      validateCustomRelayDraft({
        endpoint: "relay.example.com:443",
        publicEndpoint: "not-a-host-port",
        useTls: true,
      }),
    ).toMatchObject({ ok: false, field: "publicEndpoint" });
  });
});
