import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { e2eRoutes } from "./routes";

const projects = ["desktop-1440", "mobile-390"];
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const blockingImpacts = ["serious", "critical"];

test.describe("Accessibilité (axe)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      !projects.includes(testInfo.project.name),
      "axe tourne en desktop-1440 et mobile-390",
    );
  });

  for (const route of e2eRoutes) {
    test(`${route.path} sans violation sérieuse ni critique`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} doit répondre 200`).toBe(200);
      await page.evaluate(() => document.fonts.ready);

      const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze();
      const blocking = violations
        .filter((violation) => blockingImpacts.includes(violation.impact ?? ""))
        .map(
          (violation) =>
            `[${violation.impact}] ${violation.id} : ${violation.help}\n  ${violation.nodes
              .map((node) => node.target.join(" "))
              .join("\n  ")}`,
        );
      expect(blocking, blocking.join("\n")).toEqual([]);
    });
  }
});
