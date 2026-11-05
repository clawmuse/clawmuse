import { expect } from "playwright/test";

// These suites exercise a real, isolated daemon. Seed its direct connection so
// account onboarding is independent of the lifecycle and browser assertions.
export async function connectDesktopTestHost(page) {
  // firstWindow can expose the preload before main finishes its initial loadURL.
  // Wait for the app before persisting a host or reloading that document.
  await expect(
    page.getByTestId("welcome-screen").or(page.getByTestId("sidebar-settings")).first(),
  ).toBeVisible({ timeout: 90_000 });
  let status;
  await expect
    .poll(
      async () => {
        try {
          status = await page.evaluate(() => window.paseoDesktop?.invoke("desktop_daemon_status"));
          return Boolean(status?.serverId && status?.listen);
        } catch {
          return false;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.evaluate(({ serverId, listen }) => {
    const connection = { id: `direct:${listen}`, type: "directTcp", endpoint: listen };
    const now = new Date().toISOString();
    // Assertions use English labels regardless of the developer machine locale.
    const settings = JSON.parse(localStorage.getItem("@paseo:app-settings") ?? "{}");
    localStorage.setItem("@paseo:app-settings", JSON.stringify({ ...settings, language: "en" }));
    localStorage.setItem(
      "@paseo:daemon-registry",
      JSON.stringify([
        {
          serverId,
          label: "localhost",
          connections: [connection],
          preferredConnectionId: connection.id,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    );
  }, status);
  await page.reload();
  return status;
}
