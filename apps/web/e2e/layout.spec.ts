import { test } from "@playwright/test";
import { test as parrainTest } from "./fixtures";
import { expectNoOverflowAt, overflowWidths } from "./overflow";
import { e2eRoutes, parrainRoutes } from "./routes";

test.describe("Pas de débordement horizontal", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "Largeurs pilotées depuis desktop-1440");
  });

  for (const route of e2eRoutes) {
    for (const width of overflowWidths) {
      test(`${route.path} à ${width} px`, async ({ page }) => {
        await expectNoOverflowAt(page, route.path, width);
      });
    }
  }
});

parrainTest.describe("Pas de débordement horizontal (espace parrain, connecté)", () => {
  parrainTest.beforeEach(({}, testInfo) => {
    parrainTest.skip(
      testInfo.project.name !== "desktop-1440",
      "Largeurs pilotées depuis desktop-1440",
    );
  });

  for (const route of parrainRoutes) {
    for (const width of overflowWidths) {
      parrainTest(`${route.path} à ${width} px`, async ({ page }) => {
        await expectNoOverflowAt(page, route.path, width);
      });
    }
  }
});
