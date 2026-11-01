import { expect, test } from "@playwright/test";
import { expectNoBlockingViolations } from "./axe";
import { test as parrainTest } from "./fixtures";
import { e2eRoutes, parrainRoutes } from "./routes";

const projects = ["desktop-1440", "mobile-390"];

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
      await expectNoBlockingViolations(page);
    });
  }
});

parrainTest.describe("Accessibilité (axe) de l'espace parrain, connecté", () => {
  parrainTest.beforeEach(({}, testInfo) => {
    parrainTest.skip(
      !projects.includes(testInfo.project.name),
      "axe tourne en desktop-1440 et mobile-390",
    );
  });

  for (const route of parrainRoutes) {
    parrainTest(`${route.path} sans violation sérieuse ni critique`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} doit répondre 200`).toBe(200);
      await expectNoBlockingViolations(page);
    });
  }
});
