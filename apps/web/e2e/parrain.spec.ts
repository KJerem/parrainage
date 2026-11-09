import type { Locator, Page } from "@playwright/test";
import { expect, saveSession, test } from "./fixtures";
import { AICHA, AICHA_CONVERSATION, KOFI, YAO } from "./routes";

const projects = ["desktop-1440", "mobile-390"];

/** Haut et gauche d'un bloc, pour vérifier l'ordre d'empilement. */
async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect, "bloc affiché").not.toBeNull();
  return rect!;
}

function switcher(page: Page) {
  return page.getByRole("navigation", { name: "Choisir un filleul" });
}

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Navigation principale" });
}

test.describe("Espace parrain : Mes filleuls", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!projects.includes(testInfo.project.name), "desktop-1440 et mobile-390 seulement");
  });

  test("Main affiche Aïcha avec les données de l'API", async ({ page }) => {
    await page.goto("/parrain");
    await expect(page.getByRole("heading", { level: 1, name: "Vos filleuls" })).toBeVisible();
    await expect(page.getByText("Bonjour Claire")).toBeVisible();

    // Sélecteur : Aïcha (premier binôme) puis Kofi.
    const links = switcher(page).getByRole("link");
    await expect(links).toHaveCount(2);
    await expect(links.first()).toHaveAccessibleName("Aïcha");
    await expect(links.first()).toHaveAttribute("aria-current", "page");
    await expect(links.last()).toHaveAccessibleName("Kofi");
    await expect(links.last()).not.toHaveAttribute("aria-current");

    const profile = page.getByRole("region", { name: "Profil d'Aïcha" });
    await expect(profile.getByRole("heading", { level: 2, name: "Aïcha S." })).toBeVisible();
    await expect(profile.getByText("Parrainée depuis mars 2023")).toBeVisible();
    await expect(profile.getByText("12 ans · CM2")).toBeVisible();
    await expect(profile.getByText("École primaire publique de Bè, Lomé (Togo)")).toBeVisible();
    await expect(profile.getByText("Suivie par M. Koffi, relais")).toBeVisible();
    await expect(profile).toContainText(/Photo\s*d'Aïcha/);

    // Fil : le message d'Aïcha (bulletin joint) puis la nouvelle de rentrée. Dates relatives à
    // l'horloge de l'API, figée sur le jour du design (e2e/clock.ts).
    const feed = page.getByRole("region", { name: "Dernières nouvelles" });
    const message = feed.getByRole("article").filter({ hasText: "Aïcha vous a écrit" });
    await expect(message.getByText("Hier · envoyé depuis l'école")).toBeVisible();
    await expect(message.getByText("Bulletin joint")).toBeVisible();
    await expect(message.getByText(/^Bonjour tata Claire !/)).toBeVisible();
    await expect(message.getByText("Photo de la classe")).toBeVisible();
    await expect(
      message.getByRole("link", { name: "Bulletin T1 — 2026-27 (télécharger)" }),
    ).toHaveAttribute("href", "/api/media/seed-media-aicha-bulletin-t1?download=1");
    const news = feed.getByRole("article").filter({ hasText: "M. Koffi, relais à Lomé" });
    await expect(news.getByText("12 octobre · Nouvelle de rentrée")).toBeVisible();
    await expect(news.getByText("Vidéo · 0:42")).toBeVisible();

    // Résultats : moyenne annuelle de CM1 puis 1er trimestre de CM2.
    const results = page.getByRole("region", { name: "Résultats scolaires" });
    await expect(
      results.getByRole("progressbar", { name: "CM1 · moyenne annuelle" }),
    ).toHaveAttribute("aria-valuetext", "11,8 / 20");
    await expect(results.getByRole("progressbar", { name: "CM2 · 1er trimestre" })).toHaveAttribute(
      "aria-valuetext",
      "13,4 / 20",
    );
    await expect(results.getByText("11,8 / 20")).toBeVisible();
    await expect(results.getByText("13,4 / 20")).toBeVisible();
    await expect(
      results.getByText("Appréciation : « Élève sérieuse, en net progrès en mathématiques. »"),
    ).toBeVisible();

    // Versements : mensualité, total de l'année (10 mensualités de 25 € et un don de 40 €) et
    // trois mensualités reçues.
    const payments = page.getByRole("region", { name: "Mes versements" });
    await expect(payments.getByText("Mensualité")).toBeVisible();
    await expect(payments.getByText("25 €", { exact: true })).toBeVisible();
    await expect(payments.getByText("Versé en 2026", { exact: true })).toBeVisible();
    await expect(payments.getByText("290 €", { exact: true })).toBeVisible();
    await expect(
      payments.getByRole("list", { name: "Dernières mensualités" }).getByRole("listitem"),
    ).toHaveText([/^Octobre 2026\s*Reçu$/, /^Septembre 2026\s*Reçu$/, /^Août 2026\s*Reçu$/]);

    // Messagerie (phase 4) : écrire, répondre et encourager depuis l'écran principal.
    const conversation = `/parrain/messages/${AICHA_CONVERSATION}`;
    await expect(profile.getByRole("link", { name: "Écrire à Aïcha" })).toHaveAttribute(
      "href",
      conversation,
    );
    await expect(message.getByRole("link", { name: "Répondre" })).toHaveAttribute(
      "href",
      conversation,
    );
    await expect(message.getByRole("button", { name: "Envoyer un encouragement" })).toBeVisible();

    // Appels vidéo : la demande en cours pour Aïcha (le 14, à confirmer par M. Koffi).
    await expect(page.getByRole("link", { name: "Demander un appel vidéo" })).toHaveAttribute(
      "href",
      `/parrain/appels?filleul=${AICHA}`,
    );
    const call = page
      .getByRole("region", { name: "Appel vidéo demandé" })
      .filter({ visible: true });
    await expect(call).toContainText("En attente de la confirmation de M. Koffi");
    await expect(call.getByRole("link", { name: "Voir ma demande" })).toBeVisible();

    // Reçus fiscaux (phase 10) sur P-Versements ; « À quoi a servi votre don » viendra avec
    // les justificatifs (phase 12).
    await expect(
      payments.getByRole("link", { name: "Télécharger mon reçu fiscal" }),
    ).toHaveAttribute("href", "/parrain/versements#recus");
    await expect(page.getByText(/À quoi a servi votre don/)).toHaveCount(0);

    // Ordre : profil, appel, nouvelles, résultats, versements (empilés sous lg) ; au-delà,
    // l'aside à droite commence par l'appel, puis les résultats.
    const [profileBox, callBox, feedBox, resultsBox, paymentsBox] = await Promise.all(
      [profile, call, feed, results, payments].map(box),
    );
    if (test.info().project.name === "mobile-390") {
      expect(profileBox.y).toBeLessThan(callBox.y);
      expect(callBox.y).toBeLessThan(feedBox.y);
      expect(feedBox.y).toBeLessThan(resultsBox.y);
      expect(resultsBox.y).toBeLessThan(paymentsBox.y);
    } else {
      expect(resultsBox.x).toBeGreaterThan(profileBox.x + profileBox.width);
      expect(callBox.x).toBe(resultsBox.x);
      expect(callBox.y).toBeLessThan(feedBox.y);
      expect(callBox.y).toBeLessThan(resultsBox.y);
      expect(resultsBox.y).toBeLessThan(paymentsBox.y);
    }
  });

  test("le sélecteur met le filleul dans l'adresse", async ({ page }) => {
    await page.goto("/parrain");
    await switcher(page).getByRole("link", { name: "Kofi" }).click();
    await expect(page).toHaveURL(`/parrain?filleul=${KOFI}`);
    await expect(switcher(page).getByRole("link", { name: "Kofi" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const profile = page.getByRole("region", { name: "Profil de Kofi" });
    await expect(profile.getByRole("heading", { level: 2, name: "Kofi A." })).toBeVisible();
    await expect(profile.getByText(/^Parrainé depuis \S+ \d{4}$/)).toBeVisible();
    await expect(profile.getByText("Suivi par M. Koffi, relais")).toBeVisible();
    await expect(page.getByText("Kofi vous a écrit")).toBeVisible();
    await expect(page.getByText("Merci pour le ballon !")).toBeVisible();
    await expect(page.getByText(/Les résultats de Kofi s'afficheront ici/)).toBeVisible();

    await switcher(page).getByRole("link", { name: "Aïcha" }).click();
    await expect(page).toHaveURL(`/parrain?filleul=${AICHA}`);
    await expect(page.getByRole("heading", { level: 2, name: "Aïcha S." })).toBeVisible();
  });

  test("le bulletin se télécharge en PDF", async ({ page }) => {
    await page.goto("/parrain");
    await page.getByRole("link", { name: "Voir tous les bulletins" }).click();
    await expect(page).toHaveURL(`/parrain/filleuls/${AICHA}/bulletins`);
    await expect(page.getByRole("heading", { level: 1, name: "Bulletins d'Aïcha" })).toBeVisible();
    await expect(page).toHaveTitle("Bulletins d'Aïcha · Parrainage LRT");
    await expect(mainNav(page).getByRole("link", { name: "Mes filleuls" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const t1 = page.getByRole("article", { name: "CM2 · 1er trimestre" });
    await expect(t1.getByText("13,4 / 20")).toBeVisible();
    await expect(t1.getByText("5 / 48")).toBeVisible();
    const annual = page.getByRole("article", { name: "CM1 · moyenne annuelle" });
    await expect(annual.getByText("11,8 / 20")).toBeVisible();
    await expect(annual.getByText(/aperçu non disponible/)).toBeVisible();

    const link = t1.getByRole("link", { name: "Télécharger le bulletin : Bulletin T1 — 2026-27" });
    const href = await link.getAttribute("href");
    expect(href).toBe("/api/media/seed-media-aicha-bulletin-t1?download=1");

    // /api/media/:id vérifie les droits puis redirige vers une URL présignée du stockage.
    const redirect = await page.request.get(href!, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()["location"]).toContain("X-Amz-Signature=");

    const pdf = await page.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect(pdf.headers()["content-disposition"]).toMatch(/^attachment;/);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("l'enfant d'un autre parrain renvoie une page introuvable", async ({ page }) => {
    for (const path of [
      `/parrain/filleuls/${YAO}/bulletins`,
      `/parrain?filleul=${YAO}`,
      `/parrain/nouvelles?filleul=${YAO}`,
      "/parrain/filleuls/inconnu/bulletins",
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
      // Le titre de l'onglet aussi, pas celui de la page demandée.
      await expect(page).toHaveTitle("Page introuvable · Parrainage LRT");
    }
    await page.getByRole("link", { name: "Retour à mes filleuls" }).click();
    await expect(page).toHaveURL("/parrain");
  });

  test("Tout le fil se charge page par page", async ({ page }) => {
    await page.goto("/parrain");
    await page.getByRole("link", { name: "Tout le fil" }).click();
    await expect(page).toHaveURL(`/parrain/nouvelles?filleul=${AICHA}`);
    await expect(page.getByRole("heading", { level: 1, name: "Tout le fil" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Mes filleuls" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // FEED_PAGE_SIZE=1 (playwright.config.ts) : une carte par page.
    const articles = page.getByRole("article");
    await expect(articles).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: "Aïcha vous a écrit" })).toBeVisible();

    await page.getByRole("button", { name: "Charger plus" }).click();
    await expect(articles).toHaveCount(2);
    const news = articles.filter({ hasText: "Nouvelle de rentrée" });
    await expect(news).toBeFocused();
    await expect(page.getByRole("button", { name: "Charger plus" })).toHaveCount(0);
    await expect(page.getByText("Vous êtes au début du fil.")).toBeVisible();

    // Le sélecteur garde la page : Kofi a lui aussi un message puis une nouvelle.
    await switcher(page).getByRole("link", { name: "Kofi" }).click();
    await expect(page).toHaveURL(`/parrain/nouvelles?filleul=${KOFI}`);
    await expect(articles).toHaveCount(1);
    await expect(page.getByText("Kofi vous a écrit")).toBeVisible();
    await page.getByRole("button", { name: "Charger plus" }).click();
    await expect(articles.filter({ hasText: "Fin des vacances" })).toBeVisible();
  });

  test("sans filleul, l'écran principal l'explique", async ({ browser, baseURL }, testInfo) => {
    // Sophie L. (Nantes) attend son premier binôme.
    const state = await saveSession(
      baseURL!,
      "sophie.l@exemple.fr",
      testInfo.outputPath("sophie.json"),
    );
    const context = await browser.newContext({ baseURL, storageState: state });
    const page = await context.newPage();
    await page.goto("/parrain");
    await expect(page.getByRole("heading", { level: 1, name: "Vos filleuls" })).toBeVisible();
    await expect(page.getByText("Vous n'avez pas encore de filleul")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Choisir un filleul" })).toHaveCount(0);
    await page.goto("/parrain/nouvelles");
    await expect(page).toHaveURL("/parrain");
    await page.goto("/parrain/versements");
    await expect(page.getByText("Aucun versement pour l'instant")).toBeVisible();
    await expect(page.getByRole("button", { name: "Modifier ma mensualité" })).toHaveCount(0);
    await context.close();
  });
});
