import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import { brandResources } from "./brand-resources";

describe("public branding", () => {
  it("brands bundled copy without modifying interpolation or the original resources", async () => {
    const source = { title: "Paseo: {{name}}", nested: { label: "Paseo Hub" } };
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      resources: { en: { translation: brandResources(source) } },
      interpolation: { escapeValue: false },
    });
    expect(i18n.t("title", { name: "Paseo user project" })).toBe("ClawMuse: Paseo user project");
    expect(i18n.t("nested.label")).toBe("ClawMuse Hub");
    expect(source.title).toBe("Paseo: {{name}}");
  });
});
