import type { Browser, Locator, Page, TestInfo } from "@playwright/test";
import sharp from "sharp";
import { expect, relaisTest as test, withE2eKeys } from "./fixtures";
import { reseed } from "./global-setup";
import { knownMessages, waitForMessage } from "./mailpit";
import { AICHA, KOFI } from "./routes";

// Espace relais web (RW-Accueil, RW-AjoutEnfant, RW-Publier, RW-Resultats) : ces tests écrivent,
// donc une base remise à l'état du seed pour chaque projet, avant et après. Enfants et écoles de
// test s'appellent « E2e… », les nouvelles ont une clé « e2e-… » : le seed les retire.

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

const visible = (locator: Locator) => locator.filter({ visible: true });

/** Ligne du tableau (≥ md) ou carte (< md) d'un enfant. */
const childRow = (page: Page, name: string) =>
  visible(page.getByRole("row", { name }).or(page.getByRole("listitem").filter({ hasText: name })));

async function openAs(browser: Browser, testInfo: TestInfo, storageState: string) {
  const context = await browser.newContext({
    storageState,
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport ?? undefined,
  });
  return { context, page: await context.newPage() };
}

const photo = async (name: string, background: string) => ({
  name,
  mimeType: "image/png",
  buffer: await sharp({ create: { width: 64, height: 48, channels: 3, background } })
    .png()
    .toBuffer(),
});

test("l'accueil reprend RW-Accueil, avec des valeurs calculées", async ({ page }) => {
  await page.goto("/relais");
  if (!isMobile()) {
    await expect(page.getByRole("heading", { level: 1, name: "Bonjour M. Koffi" })).toBeVisible();
    await expect(page.getByText("Samedi 31 octobre")).toBeVisible();
  }
  const tiles = page.getByRole("region", { name: "Indicateurs" });
  await expect(tiles).toContainText("Enfants suivis18");
  await expect(tiles).toContainText("Nouvelles ce mois11");
  await expect(tiles).toContainText("Messages non lus1");
  await expect(tiles).toContainText("Bulletins à saisir7");

  const aicha = childRow(page, "Aïcha S.");
  await expect(aicha).toContainText("12 ans");
  await expect(aicha).toContainText("CM2 · EPP Bè");
  await expect(aicha).toContainText("Claire M.");
  await expect(aicha).toContainText("il y a 2 j");
  const kofi = childRow(page, "Kofi A.");
  await expect(kofi).toContainText("Claire M. +1");
  await expect(kofi).toContainText("64 jours");
  const esther = childRow(page, "Esther N.");
  await expect(esther).toContainText("En attente");
  await expect(esther).toContainText("Nouveau dossier");
  await expect(esther.getByRole("link", { name: "Compléter : Esther N." })).toBeVisible();
  await expect(childRow(page, "Yao D.")).toContainText("35 jours");
  await expect(childRow(page, "Mariam T.")).toContainText("il y a 6 j");

  await expect(page.getByRole("link", { name: /Saisir 7 bulletins du T1/ })).toContainText(
    "Avant le 15 novembre",
  );
  await page.getByRole("searchbox", { name: "Rechercher un enfant" }).fill("aicha");
  await expect(childRow(page, "Aïcha S.")).toBeVisible();
  await expect(childRow(page, "Kofi A.")).toHaveCount(0);
});

test("un enfant d'un autre relais répond par une page introuvable", async ({ page }) => {
  const response = await page.goto("/relais/enfants/seed-child-ibrahim");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
});

test("un dossier se crée, part au bureau et donne sa carte de code une seule fois", async ({
  page,
}) => {
  await page.goto("/relais/enfants/nouveau");
  await expect(page.getByRole("heading", { level: 1, name: "Ajouter un enfant" })).toBeVisible();
  await expect(page.getByText("En attente de parrain")).toBeVisible();
  const code = page.getByRole("list", { name: "Code image, dans l'ordre" });
  await expect(code.getByRole("listitem")).toHaveCount(3);

  // Un dossier vide ne part pas : chaque champ manquant le dit.
  await page.getByLabel("Prénom").fill("E2e Awa");
  await page.getByLabel("Nom (initiale)").fill("b");
  await page.getByLabel("Fille ou garçon").selectOption("F");
  await page.getByLabel("Date de naissance").fill("2018-03-12");
  await page.getByRole("button", { name: "Créer le compte et envoyer au bureau" }).click();
  await expect(page.getByText("Complétez le dossier avant de l'envoyer au bureau")).toBeVisible();
  await expect(page.getByText("Choisissez l'école")).toBeVisible();
  await expect(page.getByText("L'accord du responsable est indispensable")).toBeVisible();

  // Aperçu en direct.
  const preview = page.getByRole("region", { name: "Aperçu" });
  await expect(preview).toContainText("E2e Awa B.");
  await page.getByLabel("Quartier / village").fill("Bè, Lomé");
  await page.getByLabel("École").selectOption({ label: "EPP Bè" });
  await page.getByLabel("Classe").selectOption("CE1");
  await expect(preview).toContainText("8 ans · CE1 · EPP Bè");
  await page.getByLabel("Nom du responsable").fill("Mme B.");
  await page.getByLabel("Téléphone").fill("+228 90 11 22 33");
  await page.getByLabel(/Le responsable accepte le parrainage/).check();
  await page.getByLabel(/Photos et vidéos de l'enfant autorisées/).check();

  // Une photo réelle : envoyée, vérifiée, et affichée dans l'aperçu.
  await page.getByTestId("photo-enfant").setInputFiles(await photo("awa.png", "#1E5C4E"));
  await expect(preview.locator("img")).toBeVisible();

  const known = await knownMessages("bureau@exemple.fr");
  const proposed = await code.getByRole("listitem").allInnerTexts();
  await page.getByRole("button", { name: "Créer le compte et envoyer au bureau" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Dossier envoyé au bureau" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Carte de E2e Awa B." })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Code image, dans l'ordre" }).getByRole("listitem"),
  ).toHaveText(proposed);
  await expect(page.getByRole("button", { name: "Imprimer la carte" })).toBeVisible();

  const mail = await waitForMessage("bureau@exemple.fr", known);
  expect(mail.subject).toBe("Un dossier d'enfant à vérifier");
  expect(mail.text).not.toContain("Awa");

  // Retrouvé dans la liste, en « Nouveau dossier », sans parrain ; le code ne se relit plus.
  await page.getByRole("link", { name: "Retour à mes enfants" }).click();
  const row = childRow(page, "E2e Awa B.");
  await expect(row).toContainText("Nouveau dossier");
  await row.getByRole("link", { name: "E2e Awa B.", exact: true }).click();
  await expect(page.getByText("Un code est attribué : il ne s'affiche plus.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Code image, dans l'ordre" })).toHaveCount(0);
});

test("un brouillon se reprend plus tard, et une école s'ajoute au passage", async ({ page }) => {
  await page.goto("/relais/enfants/nouveau");
  await page.getByLabel("Prénom").fill("E2e Brouillon");
  await page.getByLabel("Nom (initiale)").fill("C");
  await page.getByLabel("Fille ou garçon").selectOption("M");
  await page.getByLabel("Date de naissance").fill("2016-01-20");
  await page.getByLabel("École").selectOption({ label: "+ Ajouter une école" });
  const dialog = page.getByRole("dialog", { name: "Ajouter une école" });
  await dialog.getByLabel("Nom de l'école").fill(`E2e École ${test.info().project.name}`);
  await dialog.getByRole("button", { name: "Ajouter" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("École")).not.toHaveValue("");

  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(page).toHaveURL("/relais/enfants");
  await expect(childRow(page, "E2e Brouillon C.")).toContainText("Brouillon");

  await childRow(page, "E2e Brouillon C.")
    .getByRole("link", { name: "E2e Brouillon C.", exact: true })
    .click();
  await expect(page.getByLabel("Prénom")).toHaveValue("E2e Brouillon");
  await expect(page.getByRole("list", { name: "Code image, dans l'ordre" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Créer le compte et envoyer au bureau" }),
  ).toBeVisible();
});

test("le code d'un enfant se remplace, et le nouveau s'affiche une fois", async ({ page }) => {
  await page.goto(`/relais/enfants/${AICHA}`);
  await expect(page.getByText("Un code est attribué : il ne s'affiche plus.")).toBeVisible();
  await page.getByRole("button", { name: "Générer un nouveau code" }).click();
  const dialog = page.getByRole("dialog", { name: "Remplacer le code de l'enfant ?" });
  await dialog.getByRole("button", { name: "Générer" }).click();
  await expect(page.getByRole("heading", { name: /^Carte de Aïcha S/ })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Code image, dans l'ordre" }).getByRole("listitem"),
  ).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole("list", { name: "Code image, dans l'ordre" })).toHaveCount(0);
});

test("une nouvelle pour 6 enfants avec 2 photos atteint les parrains", async ({
  page,
  browser,
  claireState,
}, testInfo) => {
  await withE2eKeys(page);
  await page.goto("/relais/publier");
  await expect(page.getByRole("radio", { name: "Plusieurs enfants" })).toBeChecked();

  await page.getByRole("button", { name: "+ Ajouter", exact: true }).first().click();
  const picker = page.getByRole("dialog", { name: "Choisir les enfants" });
  for (const name of ["Aïcha S.", "Kofi A.", "Yao D.", "Mariam T.", "Dzifa", "Edem"]) {
    await picker.getByRole("checkbox", { name: new RegExp(name) }).check();
  }
  await picker.getByRole("button", { name: "Valider (6)" }).click();
  await expect(page.getByText("Enfants concernés · 6")).toBeVisible();
  // 4 enfants nommés, puis « + 2 », comme sur la maquette.
  await expect(page.getByText("+ 2", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Les \d+ parrains concernés/)).toBeChecked();

  await page.getByLabel("Titre").fill("Remise des kits scolaires");
  await page
    .getByLabel("Message aux parrains")
    .fill("Ce samedi, les enfants ont reçu leurs cahiers, uniformes et sandales.");
  await page
    .getByTestId("medias-nouvelle")
    .setInputFiles([await photo("un.png", "#1E5C4E"), await photo("deux.png", "#E9A23B")]);
  await expect(page.getByRole("button", { name: "Retirer ce fichier" })).toHaveCount(2);

  const preview = page.getByRole("complementary", { name: "Aperçu côté parrain" });
  await expect(preview).toContainText("M. Koffi, relais à Lomé");
  await expect(preview).toContainText("Remise des kits scolaires");
  await expect(preview.locator("img")).toHaveCount(2);

  const known = {
    claire: await knownMessages("claire.m@exemple.fr"),
    marc: await knownMessages("marc.p@exemple.fr"),
    helene: await knownMessages("helene.r@exemple.fr"),
    paul: await knownMessages("paul.d@exemple.fr"),
  };
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(page).toHaveURL("/relais");
  await expect(page.getByRole("status").filter({ hasText: "Nouvelle publiée" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Indicateurs" })).toContainText(
    "Nouvelles ce mois12",
  );

  for (const [email, seen] of [
    ["claire.m@exemple.fr", known.claire],
    ["marc.p@exemple.fr", known.marc],
    ["helene.r@exemple.fr", known.helene],
    ["paul.d@exemple.fr", known.paul],
  ] as const) {
    const mail = await waitForMessage(email, seen);
    expect(mail.subject).toBe("Une nouvelle de votre relais sur Parrainage LRT");
    expect(mail.text).not.toContain("cahiers");
  }

  const { context, page: claire } = await openAs(browser, testInfo, claireState);
  await claire.goto(`/parrain?filleul=${AICHA}`);
  const card = claire.getByRole("article").filter({ hasText: "Remise des kits scolaires" });
  await expect(card).toBeVisible();
  await expect(card.locator("img")).toHaveCount(2);
  await context.close();
});

test("publier pour un enfant sans consentement avertit le relais", async ({ page }) => {
  await page.goto("/relais/publier?enfant=seed-child-koffi-2");
  await expect(page.getByRole("radio", { name: "Un enfant" })).toBeChecked();
  await expect(page.getByText("Sans autorisation pour les photos et vidéos")).toBeVisible();
  await expect(page.getByText(/leurs parrains liront le texte/)).toBeVisible();

  // Un enfant avec consentement : plus d'avertissement.
  await page.goto(`/relais/publier?enfant=${AICHA}`);
  await expect(page.getByText("Sans autorisation pour les photos et vidéos")).toHaveCount(0);
  await expect(page.getByLabel("Le parrain concerné")).toBeChecked();
});

test("une nouvelle se programme, s'affiche à venir et s'annule", async ({ page }) => {
  await withE2eKeys(page);
  await page.goto(`/relais/publier?enfant=${AICHA}`);
  await page.getByLabel("Titre").fill("Sortie au musée");
  await page.getByLabel("Message aux parrains").fill("La classe visitera le musée de Lomé.");
  await page.getByRole("button", { name: "Programmer", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Programmer la nouvelle" });
  // Dans le passé par rapport à l'horloge figée : refusé, le formulaire reste ouvert.
  await dialog.getByLabel("Date et heure de parution").fill("2026-10-01T09:00");
  await dialog.getByRole("button", { name: "Programmer" }).click();
  await expect(dialog.getByText("Choisissez une date à venir")).toBeVisible();
  await dialog.getByLabel("Date et heure de parution").fill("2026-11-20T09:00");
  await dialog.getByRole("button", { name: "Programmer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nouvelle programmée" })).toBeVisible();

  const list = page.getByRole("region", { name: "Nouvelles programmées" });
  await expect(list).toContainText("Sortie au musée");
  await list.getByRole("button", { name: "Annuler : Sortie au musée" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nouvelle annulée" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Nouvelles programmées" })).toHaveCount(0);
});

test("les résultats s'enregistrent seuls, et Claire les voit une fois envoyés", async ({
  page,
  browser,
  claireState,
}, testInfo) => {
  await page.goto("/relais/resultats");
  await expect(page.getByRole("heading", { level: 1, name: "Saisir des résultats" })).toBeVisible();
  await expect(page.getByLabel("Période")).toContainText("1er trimestre 2026-27");
  // 12 enfants au seed, plus celui créé par le test du dossier.
  await expect(page.getByLabel("École")).toContainText(/EPP Bè \(1[23] enfants\)/);

  const aicha = childRow(page, "Aïcha S.");
  await expect(aicha).toContainText("Envoyé");
  await expect(aicha).toContainText("Photo jointe");
  await expect(visible(page.getByLabel(/Moyenne Aïcha/))).toHaveValue("13,4");
  await expect(visible(page.getByLabel(/Rang Aïcha/))).toHaveValue("5 / 48");

  // Une valeur impossible est signalée et n'est pas enregistrée.
  const average = visible(page.getByLabel(/Moyenne Esther/));
  await average.fill("25");
  await expect(visible(page.getByText("Moyenne attendue entre 0 et 20"))).toBeVisible();
  // Tant qu'une ligne est fausse, rien ne part : l'ancienne valeur serait envoyée à sa place.
  await page.getByRole("button", { name: "Envoyer aux parrains" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Corrigez d'abord les lignes signalées" }),
  ).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "n'est pas enregistrée" })).toBeVisible();

  await average.fill("12,5");
  await visible(page.getByLabel(/Rang Esther/)).fill("3 / 40");
  await visible(page.getByLabel(/Appréciation Esther/)).fill("Bon début d'année.");
  await expect(childRow(page, "Esther N.")).toContainText("Brouillon");
  await page.reload();
  await expect(visible(page.getByLabel(/Moyenne Esther/))).toHaveValue("12,5");
  await expect(visible(page.getByLabel(/Rang Esther/))).toHaveValue("3 / 40");

  // Kofi est en brouillon : Claire ne voit rien avant l'envoi.
  const { context, page: claire } = await openAs(browser, testInfo, claireState);
  await claire.goto(`/parrain?filleul=${KOFI}`);
  await expect(claire.getByText("10,9 / 20")).toHaveCount(0);

  const known = await knownMessages("claire.m@exemple.fr");
  await page.getByRole("button", { name: "Envoyer aux parrains" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /résultats? envoyés? aux parrains/ }),
  ).toBeVisible();
  await expect(childRow(page, "Kofi A.")).toContainText("Envoyé");
  const mail = await waitForMessage("claire.m@exemple.fr", known);
  expect(mail.subject).toBe("De nouveaux résultats scolaires sur Parrainage LRT");
  expect(mail.text).not.toContain("10,9");

  await claire.reload();
  await expect(claire.getByText("10,9 / 20")).toBeVisible();
  await context.close();
});

test("un bulletin se photographie et se retire ; l'enfant peut être autorisé", async ({ page }) => {
  await page.goto("/relais/resultats");
  const mariamSchool = page.getByLabel("École");
  await expect(mariamSchool).toContainText("EPP Bè");
  const esther = childRow(page, "Esther N.");
  await page
    .getByTestId("bulletin-seed-child-esther")
    .first()
    .setInputFiles(await photo("bulletin.png", "#FAFBFA"));
  await expect(esther).toContainText("Photo jointe");
  await esther.getByRole("button", { name: "Retirer une page du bulletin : Esther N." }).click();
  await expect(esther).not.toContainText("Photo jointe");

  await page.getByRole("button", { name: "Laisser l'enfant envoyer son bulletin" }).click();
  await expect(childRow(page, "Esther N.")).toContainText("L'enfant peut l'envoyer");
  await page.getByRole("button", { name: "Ne plus laisser l'enfant envoyer son bulletin" }).click();
  await expect(childRow(page, "Esther N.")).not.toContainText("L'enfant peut l'envoyer");
});

test("la saisie passe d'un tableau défilant à des cartes selon la largeur", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/relais/resultats");
  await expect(page.getByRole("region", { name: "Résultats par enfant" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  const scroll = await page
    .getByRole("region", { name: "Résultats par enfant" })
    .evaluate((node) => node.scrollWidth > node.clientWidth);
  expect(scroll).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("table")).toBeHidden();
  await expect(visible(page.getByLabel(/Moyenne Aïcha/))).toBeVisible();
});

test("les rubriques encore à venir gardent leur page d'attente", async ({ page }) => {
  const response = await page.goto("/relais/sessions");
  expect(response?.status()).toBe(200);
  await expect(page.getByText("Cette rubrique arrive bientôt")).toBeVisible();
  const unknown = await page.goto("/relais/nimporte");
  expect(unknown?.status()).toBe(404);
});
