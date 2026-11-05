// Ported from agent/mobile/src/status-saas/status-saas-http.ts.
const REQUEST_TIMEOUT_MS = 10_000;

export type ClawMuseStatusFetch = typeof fetch;

export interface ClawMuseStatusRequestInput {
  method: "DELETE" | "GET" | "PATCH" | "POST";
  bearer: string | null;
  body?: unknown;
}

export class ClawMuseStatusHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Status service request failed (${status}: ${code})`);
    this.name = "ClawMuseStatusHttpError";
  }
}

async function parseErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      typeof (body as { error?: unknown }).error === "string"
    ) {
      return (body as { error: string }).error;
    }
  } catch {
    // The status code alone is enough to classify transport recovery.
  }
  return "request_failed";
}

export async function requestClawMuseStatusJson(
  fetchImplementation: ClawMuseStatusFetch,
  baseUrl: string,
  path: string,
  input: ClawMuseStatusRequestInput,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImplementation(`${baseUrl}${path}`, {
      method: input.method,
      headers: {
        accept: "application/json",
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        ...(input.bearer ? { authorization: `Bearer ${input.bearer}` } : {}),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ClawMuseStatusHttpError(response.status, await parseErrorCode(response));
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}
