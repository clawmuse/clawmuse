import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { ClawMuseStatusCreateMobileEnrollmentResponseSchema } from "@getpaseo/protocol/messages";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { connectToDaemon } from "../../utils/client.js";
import type { CommandOptions } from "../../output/index.js";

export type TaskRequest = (path: string, method?: string, body?: unknown) => Promise<unknown>;

/** An invocation borrows an enrolled client session; no host session is replaced. */
export async function withTaskApi<T>(
  options: CommandOptions,
  operation: (request: TaskRequest, client: DaemonClient) => Promise<T>,
): Promise<T> {
  const client = await connectToDaemon({ target: options.daemonTarget });
  let request: TaskRequest | null = null;
  try {
    const enrollment = ClawMuseStatusCreateMobileEnrollmentResponseSchema.shape.payload.parse(
      await client.createClawMuseStatusEnrollment(),
    );
    const base = new URL(enrollment.statusBaseUrl);
    if (
      base.protocol !== "https:" &&
      !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))
    ) {
      throw new Error("Task service requires HTTPS or loopback HTTP");
    }
    const send = async (
      path: string,
      method: string,
      body: unknown,
      token?: string,
    ): Promise<unknown> => {
      const response = await fetch(new URL(path, base), {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        const failure = z
          .object({ error: z.string(), message: z.string().optional() })
          .safeParse(value);
        if (!failure.success) {
          throw new Error(`Task service HTTP ${response.status}`);
        }
        throw new Error(failure.data.message ?? failure.data.error);
      }
      return value;
    };
    const session = z.object({ accessToken: z.string() }).parse(
      await send("/v1/mobile/enrollments", "POST", {
        enrollmentCode: enrollment.enrollmentCode,
        idempotencyKey: randomUUID(),
        platform: "browser",
        locale: "zh-Hans",
      }),
    );
    request = (path, method = "GET", body) =>
      send(`/v1/mobile${path}`, method, body, session.accessToken);
    return await operation(request, client);
  } finally {
    if (request) {
      await request("/installation", "DELETE").catch(() => {
        process.stderr.write(
          "Task session cleanup failed; the short-lived access token will expire.\n",
        );
      });
    }
    await client.close();
  }
}
