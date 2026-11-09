import type { Browser, Page, TestInfo } from "@playwright/test";
import { bureauTest as test, expect } from "./fixtures";
import { reseed } from "./global-setup";
import { knownMessages, waitForMessage } from "./mailpit";
import { AICHA_CONVERSATION } from "./routes";

// Modération par le bureau (Bureau, B-Moderation) : les décisions changent la base, donc une base
// remise à l'état du seed pour chaque projet, puis les tests dans l'ordre, et remise à la fin
// pour les suites suivantes (non-lus de Claire).

const projects = ["desktop-1440", "mobile-390"];
const PAUL_EMAIL = "paul.d@exemple.fr";

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

const messagePath = (slug: string) => `/bureau/moderation/seed-message-attente-${slug}`;

const reviewCard = (page: Page) => page.getByRole("region", { name: /→/ });

async function openAs(browser: Browser, testInfo: TestInfo, storageState: string) {
  const context = await browser.newContext({
    storageState,
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport ?? undefined,
  });
  return { context, page: await context.newPage() };
}

test("la vue d'ensemble montre la tuile et les premiers messages de la file", async ({ page }) => {
  await page.goto("/bureau");
  await expect(page.getByRole("heading", { level: 1, name: "Vue d'ensemble" })).toBeVisible();
  await expect(page.getByText("Octobre 2026")).toBeVisible();
  const tiles = page.getByRole("region", { name: "Indicateurs" });
  await expect(tiles).toContainText("Messages à relire");
  await expect(tiles).toContainText("12");
  await expect(tiles).toContainText("dont 3 contenant des photos");

  const table = page.getByRole("table");
  const paul = table.getByRole("row", { name: /Paul D\. → Kofi A\./ });
  await expect(paul).toContainText("Texte");
  await expect(paul).toContainText("Coordonnées personnelles");
  await expect(paul).toContainText("il y a 5 h");
  const mariam = table.getByRole("row", { name: /Mariam T\. → Hélène R\./ });
  await expect(mariam).toContainText("Vidéo 0:35");
  await expect(mariam).toContainText("Visage d'un autre enfant");
  await expect(mariam).toContainText("hier");
  const aicha = table.getByRole("row", { name: /Aïcha S\. → Claire M\./ });
  await expect(aicha).toContainText("Texte + bulletin T1");
  await expect(aicha).toContainText("Aucune");
  await expect(aicha).toContainText("il y a 2 h");
  await expect(page.getByRole("link", { name: "Voir toute la file (12)" })).toBeVisible();
});

test("les filtres passent par l'URL", async ({ page }) => {
  await page.goto("/bureau");
  const filters = page.getByRole("navigation", { name: "Filtrer la file" });
  await filters.getByRole("link", { name: "Signalés" }).click();
  await expect(page).toHaveURL("/bureau?filtre=signales");
  await expect(filters.getByRole("link", { name: "Signalés" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("table")).toContainText("Mariam T. → Hélène R.");

  await filters.getByRole("link", { name: "Parrain → enfant" }).click();
  await expect(page).toHaveURL("/bureau?filtre=parrain");
  await expect(page.getByRole("table")).toContainText("Paul D. → Kofi A.");
  await expect(page.getByRole("table")).not.toContainText("Aïcha S.");
});

test("le message de Paul reprend B-Moderation, numéro surligné", async ({ page }) => {
  await page.goto("/bureau/moderation");
  await expect(page.getByRole("heading", { level: 1, name: "Modération" })).toBeVisible();
  const queue = page.getByRole("complementary", { name: "File d'attente" });
  await expect(queue).toContainText("12 en attente · plus ancien : 12 h");
  await expect(queue.getByRole("listitem").first()).toContainText("Paul D. → Kofi A.");
  await expect(queue.getByRole("listitem").first()).toContainText("Coordonnées");
  await expect(queue.getByRole("listitem").nth(2)).toContainText("Texte + bulletin T1");

  if (isMobile()) {
    // Sous md : la file seule, le message sur sa propre page.
    await expect(reviewCard(page)).toBeHidden();
    await queue.getByRole("link", { name: /Paul D\./ }).click();
    await expect(page).toHaveURL(/seed-message-attente-paul$/);
    await expect(page.getByRole("link", { name: "Retour à la file" })).toBeVisible();
    await expect(queue).toBeHidden();
  } else {
    await expect(queue.getByRole("link", { name: /Paul D\./ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }

  const card = reviewCard(page);
  await expect(card.getByRole("heading", { level: 2 })).toHaveText("Paul D. → Kofi A.");
  await expect(card).toContainText("Parrain depuis 2024 · relais M. Koffi · reçu il y a 5 h");
  await expect(card).toContainText("Alerte automatique : numéro de téléphone");
  await expect(card.locator("mark")).toHaveText(["WhatsApp", "06 39 98 12 34"]);
  await expect(card.getByLabel("Motif (envoyé au parrain si retenu)")).toHaveValue(
    "OFF_PLATFORM_CONTACT",
  );
  await expect(page.getByText("23 messages · 1 retenu (mars 2025)")).toBeVisible();
  await expect(page.getByText("Dernière nouvelle du relais : il y a 64 jours")).toBeVisible();
  await expect(page.getByText("Aucun échange direct hors plateforme")).toBeVisible();
});

test("un message d'enfant nomme le relais et montre ses pièces jointes", async ({ page }) => {
  await page.goto(messagePath("mariam"));
  const card = reviewCard(page);
  await expect(card).toContainText("Marraine depuis");
  await expect(card).toContainText("Ce message ne contient que des pièces jointes.");
  await expect(card).toContainText("Vidéo · 0:35");
  await expect(card).toContainText("Visage d'un autre enfant");
  await expect(card.getByLabel("Motif (envoyé au relais si retenu)")).toHaveValue(
    "THIRD_PARTY_PHOTO",
  );
  await expect(card.getByRole("button", { name: "Retenir et prévenir le relais" })).toBeVisible();
});

test("masquer transmet la version corrigée, prévient Paul et passe au suivant", async ({
  page,
  browser,
  paulState,
}, testInfo) => {
  await page.goto(messagePath("paul"));
  const known = await knownMessages(PAUL_EMAIL);
  await reviewCard(page).getByRole("button", { name: "Masquer le passage et transmettre" }).click();

  const dialog = page.getByRole("dialog", { name: "Vérifier la version transmise" });
  const text = dialog.getByLabel("Texte transmis");
  await expect(text).toHaveValue(
    /sur \[masqué par l'association\] au \[masqué par l'association\]/,
  );
  // Un numéro retapé est signalé en direct.
  await text.fill("Appelle le 06 39 98 12 34");
  await expect(dialog).toContainText("Ce texte semble encore contenir");
  await text.fill("Salut Kofi ! Bravo pour ton match de foot. À bientôt !");
  await expect(dialog).not.toContainText("Ce texte semble encore contenir");
  await dialog.getByRole("button", { name: "Transmettre cette version" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Version masquée transmise" }),
  ).toBeVisible();
  // Paul était le seul avec une alerte : le suivant est le plus ancien, Mariam.
  await expect(page).toHaveURL(/seed-message-attente-mariam$/);
  if (!isMobile()) {
    await expect(page.getByRole("complementary", { name: "File d'attente" })).toContainText(
      "11 en attente",
    );
  }

  const mail = await waitForMessage(PAUL_EMAIL, known);
  expect(mail.subject).toBe("Votre message a été transmis en partie");
  expect(mail.text).toContain("Motif : Contact direct hors plateforme.");
  expect(mail.text).not.toContain("06 39 98");

  // Paul ne lit plus que la version masquée, avec le motif (relais : voir l'e2e de l'API).
  const { context, page: paul } = await openAs(browser, testInfo, paulState);
  await paul.goto("/parrain/messages/seed-conversation-kofi-paul");
  const bubble = paul
    .getByRole("article")
    .filter({ hasText: "Salut Kofi ! Bravo pour ton match de foot. À bientôt !" });
  await expect(bubble).toBeVisible();
  await expect(bubble).toContainText(
    "Un passage a été masqué par l'association : Contact direct hors plateforme.",
  );
  await expect(paul.getByText("06 39 98")).toHaveCount(0);
  await context.close();
});

test("retenir un message d'enfant le garde hors du fil du parrain", async ({
  page,
  browser,
  claireState,
}, testInfo) => {
  await page.goto(messagePath("yao"));
  await reviewCard(page).getByLabel("Motif (envoyé au relais si retenu)").selectOption("OTHER");
  await reviewCard(page).getByRole("button", { name: "Retenir et prévenir le relais" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Message retenu" })).toBeVisible();
  await expect(page).not.toHaveURL(/seed-message-attente-yao$/);

  // Un lien ancien montre l'issue, sans bouton de décision.
  await page.goto(messagePath("yao"));
  await expect(page.getByText("Ce message a été retenu : il n'a pas été transmis.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Approuver tel quel/ })).toHaveCount(0);

  // Claire reste étrangère à ce binôme.
  const { context, page: claire } = await openAs(browser, testInfo, claireState);
  const response = await claire.goto("/parrain/messages/seed-conversation-yao-marc");
  expect(response?.status()).toBe(404);
  await context.close();
});

test("approuver le message d'Aïcha le fait apparaître chez Claire", async ({
  page,
  browser,
  claireState,
}, testInfo) => {
  const { context, page: claire } = await openAs(browser, testInfo, claireState);
  await claire.goto(`/parrain/messages/${AICHA_CONVERSATION}`);
  await expect(claire.getByText("Voici la deuxième page de mon bulletin")).toHaveCount(0);

  // Sur place, depuis la vue d'ensemble : sans alerte, pas de confirmation.
  await page.goto("/bureau");
  await page
    .getByRole("table")
    .getByRole("button", { name: "Approuver : Aïcha S. → Claire M." })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Message approuvé : Aïcha S. → Claire M." }),
  ).toBeVisible();
  await expect(page.getByRole("table")).not.toContainText("Aïcha S. → Claire M.");

  await claire.reload();
  await expect(
    claire.getByRole("article").filter({ hasText: "Voici la deuxième page de mon bulletin" }),
  ).toBeVisible();
  await context.close();
});

test("approuver un message signalé demande confirmation", async ({ page }) => {
  await page.goto("/bureau?filtre=signales");
  await page.getByRole("button", { name: "Approuver : Mariam T. → Hélène R." }).click();
  const dialog = page.getByRole("dialog", { name: "Approuver malgré l'alerte ?" });
  await expect(dialog).toContainText("Visage d'un autre enfant");
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("table")).toContainText("Mariam T. → Hélène R.");
});

test("un signalement se pose et se retire", async ({ page }) => {
  await page.goto(messagePath("relais-1"));
  const card = reviewCard(page);
  await card.getByLabel("Signalement").selectOption("INAPPROPRIATE_CONTENT");
  await card.getByRole("button", { name: "Signaler" }).click();
  const remove = card.getByRole("button", { name: "Retirer le signalement : Contenu inadapté" });
  await expect(remove).toBeVisible();
  await page.reload();
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);
});

test("un message inconnu ouvre la page introuvable du bureau", async ({ page }) => {
  const response = await page.goto("/bureau/moderation/inconnu");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Retour à la vue d'ensemble" })).toBeVisible();
});

test("les rubriques à venir répondent sans 404, les autres non", async ({ page }) => {
  for (const path of ["/bureau/reseau", "/bureau/parametres"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.getByText("Cette rubrique arrive bientôt")).toBeVisible();
  }
  const unknown = await page.goto("/bureau/nimporte");
  expect(unknown?.status()).toBe(404);
});
