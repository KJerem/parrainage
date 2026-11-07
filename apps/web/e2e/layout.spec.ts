import { test } from "@playwright/test";
import { bureauTest, test as parrainTest, relaisTest } from "./fixtures";
import { expectNoOverflowAt, overflowWidths } from "./overflow";
import { bureauRoutes, e2eRoutes, parrainRoutes, relaisRoutes } from "./routes";

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

relaisTest.describe("Pas de débordement horizontal (espace relais, connecté)", () => {
  relaisTest.beforeEach(({}, testInfo) => {
    relaisTest.skip(
      testInfo.project.name !== "desktop-1440",
      "Largeurs pilotées depuis desktop-1440",
    );
  });

  for (const route of relaisRoutes) {
    for (const width of overflowWidths) {
      relaisTest(`${route.path} à ${width} px`, async ({ page }) => {
        await expectNoOverflowAt(page, route.path, width);
      });
    }
  }
});

bureauTest.describe("Pas de débordement horizontal (espace bureau, connecté)", () => {
  bureauTest.beforeEach(({}, testInfo) => {
    bureauTest.skip(
      testInfo.project.name !== "desktop-1440",
      "Largeurs pilotées depuis desktop-1440",
    );
  });

  for (const route of bureauRoutes) {
    for (const width of overflowWidths) {
      bureauTest(`${route.path} à ${width} px`, async ({ page }) => {
        await expectNoOverflowAt(page, route.path, width);
      });
    }
  }
});
