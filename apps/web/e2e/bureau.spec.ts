import type { Page } from "@playwright/test";
import { expectNoBlockingViolations } from "./axe";
import { bureauTest as test, expect, saveSession } from "./fixtures";
import { reseed } from "./global-setup";
import { knownMessages, waitForMessage } from "./mailpit";

// Bureau (plan, phase 11) avec l'horloge de démonstration (31 octobre 2026) : vue d'ensemble,
// B-Binomes (Esther et Sophie L.), Parrains et dossier d'un enfant.

const projects = ["desktop-1440", "mobile-390"];
const ESTHER = "seed-child-esther";
const SOPHIE = "sophie.l@exemple.fr";
const KOFFI = "koffi@relais.exemple.tg";

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
  test.setTimeout(90_000);
});

const isMobile = () => test.info().project.name === "mobile-390";

/** Lignes de « Tous les binômes » : tableau à partir de md, liste en dessous. */
const sponsorshipEntries = (page: Page) => {
  const section = page.getByRole("region", { name: "Tous les binômes" });
  return isMobile()
    ? section.getByRole("list", { name: "Binômes" }).getByRole("listitem")
    : section.getByRole("row").filter({ has: page.getByRole("cell") });
};

test("vue d'ensemble : indicateurs et binômes à surveiller", async ({ page }) => {
  await page.goto("/bureau");
  const tiles = page.getByRole("region", { name: "Indicateurs" });
  await expect(tiles).toContainText("Binômes actifs");
  await expect(tiles).toContainText("36");
  await expect(tiles).toContainText("dans 2 pays · 3 relais");
  await expect(tiles).toContainText("Sans nouvelle > 60 j");
  await expect(tiles).toContainText("enfants parrainés");
  await expect(tiles).toContainText("Collecté ce mois");
  await expect(tiles).toContainText(/875\s€/);
  await expect(tiles).toContainText("2 versements en retard");

  const watch = page.getByRole("region", { name: "Binômes à surveiller" });
  const items = watch.getByRole("listitem");
  await expect(items).toHaveCount(6);
  await expect(items.first()).toContainText("Ibrahim K. · Sophie L.");
  await expect(items.first()).toContainText("Relais : Mme Diallo, Kara");
  await expect(items.first()).toContainText("Parrain inactif");
  await expect(items.nth(1)).toContainText(/\d+ j sans nouvelle/);
  await expect(watch.getByRole("link", { name: "Esther N. · en attente" })).toHaveAttribute(
    "href",
    `/bureau/binomes?enfant=${ESTHER}`,
  );
  await expect(watch).toContainText("À parrainer");
  await expect(page.getByRole("link", { name: "Créer un binôme" })).toHaveAttribute(
    "href",
    "/bureau/binomes",
  );
  await expectNoBlockingViolations(page);
});

test("B-Binomes : l'enfant en attente, les parrains proposés et les filtres", async ({ page }) => {
  await page.goto("/bureau/binomes");
  const panel = page.getByRole("region", { name: "Créer un binôme" });
  await expect(panel.getByRole("link", { name: "Esther N." })).toBeVisible();
  await expect(panel).toContainText("8 ans · CE1 · EPP Bè, Lomé");
  await expect(panel).toContainText("Dossier complet · ajouté par M. Koffi");
  await expect(panel).toContainText("2 autres enfants attendent un parrain.");

  const parrains = panel.getByRole("radiogroup", { name: "Parrains disponibles" });
  const sophie = parrains.getByRole("radio", { name: /^Sophie L\. · Nantes/ });
  await expect(sophie).toBeChecked();
  await expect(parrains.getByRole("radio").first()).toHaveAccessibleName(
    "Sophie L. · Nantes Nouvelle marraine · souhaite parrainer une fille en primaire",
  );
  await panel.getByRole("searchbox", { name: "Choisir un parrain" }).fill("marc.p@");
  await expect(parrains.getByRole("radio")).toHaveCount(1);
  await expect(
    parrains.getByRole("radio", { name: /Marc P\. · Paris\s*Parraine déjà Yao D\./ }),
  ).toBeChecked();
  await panel.getByRole("searchbox", { name: "Choisir un parrain" }).fill("");
  await expect(sophie).toBeVisible();
  await expect(panel.getByLabel("Mensualité (€)")).toHaveValue("25");
  await expect(panel.getByLabel("Début")).toHaveValue("2026-11-01");

  // Tous les binômes, puis seulement ceux à relancer.
  await expect(sponsorshipEntries(page)).toHaveCount(36);
  await page.getByLabel("État").selectOption({ label: "À relancer" });
  await expect(page).toHaveURL("/bureau/binomes?etat=a-relancer");
  const toFollow = sponsorshipEntries(page);
  await expect(toFollow.first()).toContainText("À relancer");
  const count = await toFollow.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await expect(toFollow.nth(index)).toContainText("À relancer");
  }
  await expect(
    toFollow.filter({ hasText: "Kofi A." }).filter({ hasText: "Paul D." }),
  ).toContainText("64 j");
  await expectNoBlockingViolations(page);
});

test("le dossier d'Esther est validé, puis Esther et Sophie L. forment un binôme", async ({
  page,
  browser,
  baseURL,
  koffiState,
}, testInfo) => {
  test.skip(isMobile(), "Création : une seule largeur");
  await page.goto(`/bureau/enfants/${ESTHER}`);
  await expect(page.getByRole("heading", { level: 1, name: "Dossier d'Esther N." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Responsable légal" })).toContainText(
    "Mme N. (mère)",
  );
  await expect(page.getByRole("region", { name: "Consentements" })).toContainText(
    "Photos et vidéosNon",
  );
  const knownKoffi = await knownMessages(KOFFI);
  await page.getByRole("button", { name: "Valider le dossier" }).click();
  await expect(page.getByText("Dossier validé : M. Koffi est prévenu")).toBeVisible();
  await expect(page.getByText("Validé", { exact: true })).toBeVisible();
  expect((await waitForMessage(KOFFI, knownKoffi)).subject).toBe("Dossier validé par le bureau");

  await page.getByRole("link", { name: "Choisir un parrain" }).click();
  await expect(page).toHaveURL(`/bureau/binomes?enfant=${ESTHER}`);
  const panel = page.getByRole("region", { name: "Créer un binôme" });
  await expect(panel).toContainText("Dossier validé · ajouté par M. Koffi");
  await expect(panel.getByRole("radio", { name: /^Sophie L\. · Nantes/ })).toBeChecked();

  const knownSophie = await knownMessages(SOPHIE);
  const knownRelais = await knownMessages(KOFFI);
  await panel.getByRole("button", { name: "Créer et prévenir parrain et relais" }).click();
  await expect(
    page.getByText(
      "Binôme créé pour Esther N. avec Sophie L. : le parrain et le relais sont prévenus",
    ),
  ).toBeVisible();
  // Le panneau passe à l'enfant suivant ; le binôme rejoint le tableau.
  await expect(panel).toContainText("1 autre enfant attend un parrain.");
  const esther = sponsorshipEntries(page).filter({ hasText: "Esther N." });
  await expect(esther).toContainText("Sophie L.");
  await expect(esther).toContainText("Actif");
  expect((await waitForMessage(SOPHIE, knownSophie)).subject).toBe("Un enfant vous a été présenté");
  expect((await waitForMessage(KOFFI, knownRelais)).subject).toBe(
    "Un parrain pour un de vos enfants",
  );

  // Sophie voit Esther ; M. Koffi voit Sophie.
  const sophieState = await saveSession(baseURL!, SOPHIE, testInfo.outputPath("sophie.json"));
  const sophie = await browser.newContext({ baseURL, storageState: sophieState });
  const sophiePage = await sophie.newPage();
  await sophiePage.goto("/parrain");
  await expect(sophiePage.getByRole("region", { name: "Profil d'Esther" })).toBeVisible();
  await sophie.close();
  const koffi = await browser.newContext({ baseURL, storageState: koffiState });
  const koffiPage = await koffi.newPage();
  await koffiPage.goto("/relais/enfants");
  await expect(
    koffiPage.getByRole("row").filter({ hasText: "Esther N." }).filter({ visible: true }),
  ).toContainText("Sophie L.");
  await koffi.close();
});

test("Parrains : recherche et invitation d'une marraine", async ({ page }) => {
  test.skip(isMobile(), "Invitation : une seule largeur");
  await page.goto("/bureau/parrains");
  await expect(page.getByRole("heading", { level: 1, name: "Parrains" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "31 parrains" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Rechercher un parrain" });
  await search.fill("lille");
  await search.press("Enter");
  await expect(page).toHaveURL("/bureau/parrains?q=lille");
  await expect(page.getByRole("heading", { name: "1 parrain pour « lille »" })).toBeVisible();
  const homonym = page.getByRole("row").filter({ hasText: "sophie.l2@exemple.fr" });
  await expect(homonym).toContainText("Inactive");
  await expect(homonym).toContainText("2 en retard");

  await page.getByRole("button", { name: "Inviter un parrain" }).click();
  const dialog = page.getByRole("dialog", { name: "Inviter un parrain" });
  await dialog.getByRole("button", { name: "Envoyer l'invitation" }).click();
  await expect(dialog.getByText("Indiquez le prénom")).toBeVisible();
  await dialog.getByLabel("Prénom").fill("Léa");
  await dialog.getByLabel("Nom", { exact: true }).fill("Bernard");
  await dialog.getByLabel("Adresse e-mail").fill("lea.bernard@e2e.exemple.fr");
  await dialog.getByLabel("Ville").fill("Rennes");
  const known = await knownMessages("lea.bernard@e2e.exemple.fr");
  await dialog.getByRole("button", { name: "Envoyer l'invitation" }).click();
  await expect(page.getByText("Invitation envoyée à lea.bernard@e2e.exemple.fr")).toBeVisible();
  expect((await waitForMessage("lea.bernard@e2e.exemple.fr", known)).subject).toBe(
    "Invitation à la plateforme de parrainage LRT",
  );
  await page.goto("/bureau/parrains?q=bernard");
  const lea = page.getByRole("row").filter({ hasText: "Léa B." });
  await expect(lea).toContainText("Invitée");
  await expect(lea).toContainText("Jamais connectée");
  await expectNoBlockingViolations(page);
});
