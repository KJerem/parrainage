import { expect, test } from "@playwright/test";
import { expectNoBlockingViolations } from "./axe";
import { bureauTest, test as parrainTest, relaisTest } from "./fixtures";
import { bureauRoutes, e2eRoutes, parrainRoutes, relaisRoutes } from "./routes";

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

relaisTest.describe("Accessibilité (axe) de l'espace relais, connecté", () => {
  relaisTest.beforeEach(({}, testInfo) => {
    relaisTest.skip(
      !projects.includes(testInfo.project.name),
      "axe tourne en desktop-1440 et mobile-390",
    );
  });

  for (const route of relaisRoutes) {
    relaisTest(`${route.path} sans violation sérieuse ni critique`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} doit répondre 200`).toBe(200);
      await expectNoBlockingViolations(page);
    });
  }
});

bureauTest.describe("Accessibilité (axe) de l'espace bureau, connecté", () => {
  bureauTest.beforeEach(({}, testInfo) => {
    bureauTest.skip(
      !projects.includes(testInfo.project.name),
      "axe tourne en desktop-1440 et mobile-390",
    );
  });

  for (const route of bureauRoutes) {
    bureauTest(`${route.path} sans violation sérieuse ni critique`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} doit répondre 200`).toBe(200);
      await expectNoBlockingViolations(page);
    });
  }
});
