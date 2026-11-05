import { describe, expect, it, vi } from "vitest";
import { enrollAccountDevice } from "./account.js";
import { brand } from "../brand.generated.js";

const testOffer = {
  v: 2 as const,
  serverId: "test-server",
  daemonPublicKeyB64: "test-key",
  relay: { endpoint: brand.relayEndpoint, useTls: true },
};
const input = {
  email: " person@example.com ",
  password: "test-only-password",
  label: "Linux",
  bindAccount: async (_accountId: string) => ({
    offer: { ...testOffer, requiresAuthorization: true, minimumSecurityMode: "protected" as const },
    accountKey: "k".repeat(43),
  }),
  offer: testOffer,
};
describe("headless account enrollment", () => {
  it.each(brand.relayEndpoints)(
    "enrolls %s and revokes its temporary session",
    async (endpoint) => {
      const regionalInput = {
        ...input,
        offer: { ...input.offer, relay: { endpoint, useTls: true } },
      };
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ user: { id: "alice" } }), {
            headers: { "set-auth-token": "signed-test-session" },
          }),
        )
        .mockResolvedValueOnce(new Response("{}"))
        .mockResolvedValueOnce(new Response("{}"))
        .mockResolvedValueOnce(new Response("{}"));
      expect(await enrollAccountDevice(regionalInput, request)).toEqual({ sessionRevoked: true });
      const publication = request.mock.calls[1]!;
      expect(JSON.parse(String(publication[1]?.body))).toEqual({
        label: input.label,
        offer: regionalInput.offer,
      });
      expect(publication[1]?.headers).toMatchObject({
        Authorization: "Bearer signed-test-session",
        Origin: brand.hubOrigin,
      });
      expect(JSON.parse(String(request.mock.calls[2]![1]?.body)).accountKey).toBe("k".repeat(43));
      expect(request.mock.calls[3]![0]).toBe(`${brand.hubOrigin}/api/auth/sign-out`);
    },
  );
  it("revokes the session even when another account owns the device", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: { id: "alice" } }), {
          headers: { "set-auth-token": "signed-test-session" },
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
      .mockResolvedValueOnce(new Response("{}"));
    await expect(enrollAccountDevice(input, request)).rejects.toThrow("409");
    expect(request.mock.calls[2]![0]).toBe(`${brand.hubOrigin}/api/auth/sign-out`);
  });
  it.each([
    "relay.paseo.sh:443",
    "agent-relay.clawmuse.com.evil.test:443",
    "agent-relay-cn.clawmuse.com:80",
  ])("rejects %s before sending credentials", async (endpoint) => {
    const request = vi.fn<typeof fetch>();
    await expect(
      enrollAccountDevice(
        {
          ...input,
          offer: { ...input.offer, relay: { endpoint, useTls: true } },
        },
        request,
      ),
    ).rejects.toThrow("ClawMuse relay");
    expect(request).not.toHaveBeenCalled();
  });
});
