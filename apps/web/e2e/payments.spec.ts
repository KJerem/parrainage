import type { Locator, Page } from "@playwright/test";
import { expectNoBlockingViolations } from "./axe";
import { expect, test, withE2eKeys } from "./fixtures";
import { reseed } from "./global-setup";

// P-Versements (plan, phase 10) avec l'horloge de démonstration (31 octobre 2026) : Claire verse
// 25 € par mois pour Aïcha et pour Kofi, plus un don de rentrée de 40 € pour Aïcha.

const projects = ["desktop-1440", "mobile-390"];

test.describe.configure({ mode: "serial" });

test.beforeAll(({}, testInfo) => {
  if (!projects.includes(testInfo.project.name)) return;
  test.setTimeout(120_000);
  reseed();
});

test.afterAll(({}, testInfo) => {
  if (!projects.includes(testInfo.project.name)) return;
  test.setTimeout(120_000);
  reseed();
});

test.beforeEach(({}, testInfo) => {
  test.skip(!projects.includes(testInfo.project.name), "desktop-1440 et mobile-390 seulement");
});

const isMobile = () => test.info().project.name === "mobile-390";

const summary = (page: Page) => page.getByRole("region", { name: "Résumé" });
/** Versements de l'historique : lignes du tableau (≥ md) ou de la liste (téléphone). */
const historyEntries = (page: Page) => {
  const history = page.getByRole("region", { name: "Historique" });
  return isMobile()
    ? history.getByRole("list", { name: /^Versements / }).getByRole("listitem")
    : history.getByRole("row").filter({ has: page.getByRole("cell") });
};

/** Un versement contient chacun de ces fragments, quelle que soit la mise en page. */
async function expectEntry(entry: Locator, parts: readonly (string | RegExp)[]) {
  for (const part of parts) {
    await expect(entry).toContainText(part);
  }
}

test("P-Versements reprend la maquette, avec les valeurs calculées", async ({ page }) => {
  await page.goto("/parrain");
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Mes versements" })
    .click();
  await expect(page).toHaveURL("/parrain/versements");
  await expect(page.getByRole("heading", { level: 1, name: "Mes versements" })).toBeVisible();

  await expect(summary(page)).toContainText("Mensualité · 2 filleuls");
  await expect(summary(page)).toContainText(/50\s€/);
  await expect(summary(page)).toContainText("Prélèvement le 5 du mois");
  await expect(summary(page)).toContainText("Versé en 2026");
  await expect(summary(page)).toContainText(/540\s€/);
  await expect(summary(page)).toContainText("10 versements, aucun incident");
  await expect(summary(page)).toContainText("Réduction d'impôt estimée");
  await expect(summary(page)).toContainText(/356,40\s€/);
  await expect(summary(page)).toContainText("Selon le statut fiscal de l'association");

  // Historique de 2026 : les lignes de la maquette, puis tout le reste de l'année.
  const entries = historyEntries(page);
  await expect(entries).toHaveCount(21);
  await expectEntry(entries.nth(0), ["5 oct. 2026", "Aïcha S.", /25\s€/, "Prélèvement", "Reçu"]);
  await expectEntry(entries.nth(1), ["5 oct. 2026", "Kofi A.", /25\s€/, "Prélèvement", "Reçu"]);
  await expectEntry(entries.nth(2), [
    "15 sept. 2026",
    "Aïcha S.",
    /40\s€/,
    "Don ponctuel · rentrée",
    "Reçu",
  ]);
  await expectEntry(entries.nth(3), ["5 sept. 2026", "Aïcha S."]);

  const receipts = page.getByRole("region", { name: "Reçus fiscaux" });
  await expect(receipts.getByRole("link")).toHaveText([
    /^Reçu 2025\s*Télécharger$/,
    /^Reçu 2024\s*Télécharger$/,
  ]);
  await expect(receipts.getByRole("link", { name: /Reçu 2025/ })).toHaveAttribute(
    "href",
    "/api/parrain/receipts/2025",
  );
  await expect(receipts).toContainText("Le reçu 2026 sera disponible en janvier.");
  await expect(receipts).toContainText(
    "Établis au nom de Claire Martin, 12 rue des Tilleuls, 69003 Lyon.",
  );
  await expectNoBlockingViolations(page);

  // Une autre année : l'historique de 2025.
  const years = page.getByRole("navigation", { name: "Année de l'historique" });
  await expect(years.getByRole("link", { name: "2026" })).toHaveAttribute("aria-current", "true");
  await years.getByRole("link", { name: "2025" }).click();
  await expect(page).toHaveURL("/parrain/versements?annee=2025");
  await expect(entries).toHaveCount(16);
  await expectEntry(entries.nth(0), ["5 déc. 2025", "Aïcha S."]);
  await expect(summary(page)).toContainText("Versé en 2026");
});

test("le reçu 2025 se télécharge en PDF, et Main y mène", async ({ page }) => {
  await page.goto("/parrain");
  const fromMain = page
    .getByRole("link", { name: "Télécharger mon reçu fiscal" })
    .filter({ visible: true });
  await expect(fromMain).toHaveAttribute("href", "/parrain/versements#recus");
  await fromMain.click();
  await expect(page).toHaveURL("/parrain/versements#recus");
  await expect(page.getByRole("heading", { name: "Reçus fiscaux" })).toBeInViewport();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Reçu 2025/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("recu-fiscal-2025.pdf");
  const file = await page.request.get("/api/parrain/receipts/2025");
  expect(file.headers()["content-type"]).toBe("application/pdf");
  expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("modifier la mensualité d'Aïcha, puis le moyen de paiement", async ({ page }) => {
  test.skip(isMobile(), "Modifications : une seule largeur");
  await page.goto("/parrain/versements");
  await page.getByRole("button", { name: "Modifier ma mensualité" }).click();
  const dialog = page.getByRole("dialog", { name: "Modifier ma mensualité" });
  await expect(dialog).toContainText(
    "Le nouveau montant s'applique dès le prochain prélèvement, le 5 novembre.",
  );
  await expect(dialog.getByRole("radio", { name: /Aïcha S\./ })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: /^25\s€$/ })).toBeChecked();

  // Le même montant n'est pas un changement.
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "C'est déjà la mensualité pour Aïcha : choisissez un autre montant",
  );
  await dialog.getByRole("radio", { name: /^30\s€$/ }).check();
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(
    page.getByText(/^Nouvelle mensualité pour Aïcha : 30\s€ à partir de novembre 2026$/),
  ).toBeVisible();
  await expect(summary(page)).toContainText(/55\s€/);

  await page.getByRole("button", { name: "Moyen de paiement" }).click();
  const method = page.getByRole("dialog", { name: "Moyen de paiement" });
  await expect(method).toContainText("aucune coordonnée bancaire n'est demandée");
  await method.getByRole("radio", { name: /Carte bancaire/ }).check();
  await method.getByLabel("Jour du prélèvement").selectOption({ label: "Le 10 du mois" });
  await method.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Enregistré : carte bancaire, le 10 du mois")).toBeVisible();
  await expect(summary(page)).toContainText("Carte bancaire, le 10 du mois");
  await expectNoBlockingViolations(page);
});

test("faire un don ponctuel pour Kofi", async ({ page }) => {
  test.skip(isMobile(), "Modifications : une seule largeur");
  await withE2eKeys(page);
  await page.goto("/parrain/versements");
  await page.getByRole("button", { name: "Faire un don" }).click();
  const dialog = page.getByRole("dialog", { name: "Faire un don" });
  await dialog.getByRole("radio", { name: "Kofi A." }).check();
  await dialog.getByRole("radio", { name: "Autre" }).check();
  const other = dialog.getByLabel("Autre montant, en euros");
  await other.fill("2");
  await dialog.getByRole("button", { name: /^Donner 2\s€$/ }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Le don va de 5 € à 1000 €");
  await other.fill("15");
  await dialog.getByLabel("Occasion (facultatif)").fill("goûter");
  await dialog.getByRole("button", { name: /^Donner 15\s€$/ }).click();
  await expect(
    page.getByText(/^Merci ! Votre don de 15\s€ pour Kofi est enregistré$/),
  ).toBeVisible();
  await expectEntry(historyEntries(page).nth(0), [
    "31 oct. 2026",
    "Kofi A.",
    /15\s€/,
    "Don ponctuel · goûter",
    "Reçu",
  ]);
  await expect(summary(page)).toContainText(/555\s€/);
  await expect(summary(page)).toContainText(/366,30\s€/);
});
