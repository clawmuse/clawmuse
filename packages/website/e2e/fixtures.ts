import { test as base } from "playwright/test";

export const test = base.extend({
  context: async ({ context }, runTest) => {
    // Analytics is outside these UI flows; an unreachable script delays the load event.
    await context.route("https://plausible.io/js/**", (route) =>
      route.fulfill({ contentType: "application/javascript", body: "" }),
    );
    await runTest(context);
  },
});
