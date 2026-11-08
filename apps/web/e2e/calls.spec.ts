import type { Browser, TestInfo } from "@playwright/test";
import { expectNoBlockingViolations } from "./axe";
import { expect, relaisTest as test } from "./fixtures";
import { reseed } from "./global-setup";
import { AICHA, CLAIRE_KOFFI_CONVERSATION, KOFI } from "./routes";

// Appels vidéo (plan, phase 9) : demande, réponse du relais dans la conversation, choix du parrain
// dans le message, salle ouverte au parrain après l'arrivée du relais. VISIO_PROVIDER=link : la
// salle est un lien, jamais chargé ici (meet.jit.si est remplacé par une page vide).

const projects = ["desktop-1440", "mobile-390"];

test.use({
  permissions: ["camera", "microphone"],
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});
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

/** Page de substitution : la vraie salle Jitsi n'est jamais chargée par les tests. */
const STAND_IN_ROOM = {
  status: 200,
  contentType: "text/html",
  body: "<!doctype html><title>Salle</title>",
};

const isMobile = () => test.info().project.name === "mobile-390";

async function openAs(browser: Browser, testInfo: TestInfo, storageState: string) {
  const context = await browser.newContext({
    storageState,
    baseURL: testInfo.project.use.baseURL!,
    viewport: testInfo.project.use.viewport ?? undefined,
    permissions: ["camera", "microphone"],
  });
  await context.route("https://meet.jit.si/**", (route) => route.fulfill(STAND_IN_ROOM));
  return { context, page: await context.newPage() };
}

test("l'accueil du relais annonce la demande d'appel de Claire", async ({ page }) => {
  await page.goto("/relais");
  const todo = isMobile()
    ? page.getByRole("link", { name: /Appel vidéo demandé/ }).filter({ visible: true })
    : page.getByRole("link", { name: /Proposer des créneaux d'appel/ });
  await expect(todo).toContainText("Claire M. ↔ Aïcha S.");
  await todo.click();
  await expect(page).toHaveURL(`/relais/messages/${CLAIRE_KOFFI_CONVERSATION}`);
  await expect(page.getByText("Demande d'appel · samedi 14 nov., 11 h (Paris)")).toBeVisible();
  await expect(page.getByText("Réponse rapide :")).toBeVisible();
});

test("P-Video : la demande en cours, l'appel confirmé et les appels passés", async ({
  browser,
  claireState,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, claireState);
  await page.goto("/parrain/appels");
  await expect(page.getByRole("heading", { level: 1, name: "Appels vidéo" })).toBeVisible();
  const request = page.getByRole("region", { name: "Votre demande d'appel avec Aïcha" });
  await expect(request).toContainText("Sam. 14 nov.");
  await expect(request).toContainText("11 h Paris · 10 h Lomé · 15 minutes");
  await expect(request.getByRole("button", { name: "Annuler la demande" })).toBeVisible();

  const confirmed = page.getByRole("region", { name: "Appel confirmé" });
  await expect(confirmed).toContainText("Kofi · jeudi 5 nov., 18 h");
  await expect(
    confirmed.getByRole("link", { name: "Rejoindre (ouvre 10 min avant)" }),
  ).toHaveAttribute("href", "/parrain/appels/seed-video-call-kofi");

  // Test de la caméra : rien avant l'appui.
  await expect(confirmed.getByLabel("Aperçu de votre caméra")).toBeHidden();
  await confirmed.getByRole("button", { name: "Tester micro et caméra" }).click();
  await expect(confirmed.getByLabel("Aperçu de votre caméra")).toBeVisible();
  await confirmed.getByRole("button", { name: "Arrêter le test" }).click();

  const past = page.getByRole("region", { name: "Appels passés" });
  await expect(past.getByRole("listitem")).toHaveText([
    /Aïcha · 20 juin\s*22 min/,
    /Kofi · 3 mai\s*15 min/,
  ]);
  await expectNoBlockingViolations(page);

  // Kofi : l'appel du 5 est prévu, pas de nouvelle demande.
  await page.goto(`/parrain/appels?filleul=${KOFI}`);
  await expect(page.getByRole("heading", { name: "Un appel avec Kofi est prévu" })).toBeVisible();

  // Main de Kofi : la carte de la maquette, et son fichier agenda.
  await page.goto(`/parrain?filleul=${KOFI}`);
  const card = page.getByRole("region", { name: "Prochain appel vidéo" }).filter({ visible: true });
  await expect(card).toContainText("Jeudi 5 novembre · 18 h");
  await expect(card).toContainText("Depuis la salle du relais, avec M. Koffi");
  const ics = card.getByRole("link", { name: "Ajouter à mon agenda" });
  await expect(ics).toHaveAttribute("href", "/api/calls/seed-video-call-kofi/ics");
  const file = await page.request.get("/api/calls/seed-video-call-kofi/ics");
  expect(file.headers()["content-type"]).toMatch(/^text\/calendar/);
  expect(await file.text()).toContain("DTSTART:20261105T170000Z");
  await context.close();
});

test("la salle d'un appel à venir n'est pas encore ouverte", async ({
  browser,
  claireState,
}, testInfo) => {
  const { context, page } = await openAs(browser, testInfo, claireState);
  await page.goto("/parrain/appels/seed-video-call-kofi");
  await expect(
    page.getByRole("heading", { level: 1, name: "Appel vidéo avec Kofi" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "La salle n'est pas encore ouverte" }),
  ).toBeVisible();
  await expect(page.getByText(/Elle ouvre à 17 h 50/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Rejoindre l'appel" })).toHaveCount(0);
  await expectNoBlockingViolations(page);
  await context.close();
});

test("le relais propose d'autres créneaux, Claire en choisit un dans le message", async ({
  browser,
  page,
  claireState,
}, testInfo) => {
  test.skip(isMobile(), "Parcours à deux : une seule largeur");
  await page.goto(`/relais/messages/${CLAIRE_KOFFI_CONVERSATION}`);
  await page.getByRole("button", { name: "Proposer d'autres créneaux" }).click();
  const dialog = page.getByRole("dialog", { name: "Proposer d'autres créneaux" });
  await dialog.getByText("Mer. 18 nov.").click();
  await dialog.getByText("Sam. 21 nov.").click();
  await dialog.getByRole("button", { name: "Envoyer ces 2 créneaux" }).click();
  await expect(page.getByText("Créneaux envoyés à Claire M.")).toBeVisible();
  await expect(page.getByText("Réponse rapide :")).toHaveCount(0);

  const claire = await openAs(browser, testInfo, claireState);
  await claire.page.goto(`/parrain/messages/${CLAIRE_KOFFI_CONVERSATION}`);
  await expect(
    claire.page.getByText("Choisissez un créneau : l'appel est confirmé aussitôt."),
  ).toBeVisible();
  await claire.page
    .getByRole("button", { name: "Choisir le Sam. 21 nov., 10 h Paris · 9 h Lomé" })
    .click();
  await expect(
    claire.page.getByText("Appel confirmé : vous recevez l'invitation pour votre agenda"),
  ).toBeVisible();
  const confirmed = claire.page.getByText("Appel vidéo confirmé avec Aïcha");
  await expect(confirmed).toBeVisible();

  await claire.page.goto(`/parrain?filleul=${AICHA}`);
  await expect(
    claire.page.getByRole("region", { name: "Prochain appel vidéo" }).filter({ visible: true }),
  ).toContainText("Samedi 21 novembre · 10 h");
  await claire.context.close();

  await page.goto("/relais/appels");
  await expect(page.getByRole("region", { name: "Appels à venir" })).toContainText(
    "Claire M. ↔ Aïcha",
  );
  await expectNoBlockingViolations(page);
});

test("salle : le parrain attend le relais, puis entre à son tour", async ({
  browser,
  page,
  paulState,
}, testInfo) => {
  test.skip(isMobile(), "Parcours à deux : une seule largeur");
  // Un créneau dans 5 minutes (horloge de démonstration : 31 octobre, 10 h à Lomé).
  await page.goto("/relais/appels");
  const slots = page.getByRole("region", { name: "Mes créneaux" });
  await slots.getByLabel("Date").fill("2026-10-31");
  await slots.getByLabel("Heure à Lomé").fill("10:05");
  await slots.getByRole("button", { name: "Ajouter le créneau" }).click();
  await expect(slots).toContainText("Sam. 31 oct. · 11 h 05 Paris · 10 h 05 Lomé");

  const paul = await openAs(browser, testInfo, paulState);
  await paul.page.goto(`/parrain/appels?filleul=${KOFI}`);
  await paul.page.getByText("Sam. 31 oct.").click();
  await paul.page.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(
    paul.page.getByRole("heading", { name: "Votre demande d'appel avec Kofi" }),
  ).toBeVisible();

  await page.reload();
  const request = page
    .getByRole("region", { name: "Demandes d'appel" })
    .getByRole("listitem")
    .filter({ hasText: "Paul D. ↔ Kofi A." });
  await request.getByRole("button", { name: "Confirmer le créneau" }).click();
  await expect(page.getByText(/Appel confirmé : le parrain reçoit/)).toBeVisible();
  const join = page
    .getByRole("region", { name: "Appels à venir" })
    .getByRole("listitem")
    .filter({ hasText: "Paul D. ↔ Kofi" })
    .getByRole("link", { name: "Rejoindre" });
  const roomPath = await join.getAttribute("href");
  const callId = roomPath!.split("/").at(-1)!;

  // Le parrain arrive avant le relais : il attend.
  await paul.page.goto(`/parrain/appels/${callId}`);
  await expect(paul.page.getByRole("heading", { name: /En attente de M\. Koffi/ })).toBeVisible();
  await expect(paul.page.getByRole("button", { name: "Rejoindre l'appel" })).toHaveCount(0);

  // Le relais entre : la salle s'ouvre (un nouvel onglet, en mode lien).
  await page.context().route("https://meet.jit.si/**", (route) => route.fulfill(STAND_IN_ROOM));
  await join.click();
  await expect(page.getByRole("heading", { name: "La salle est ouverte" })).toBeVisible();
  const [tab] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("button", { name: "Rejoindre l'appel" }).click(),
  ]);
  expect(tab.url()).toMatch(/^https:\/\/meet\.jit\.si\/lrt-[0-9a-f]{32}$/);
  await tab.close();
  await expect(
    page.getByRole("heading", { name: "La salle est ouverte dans un nouvel onglet" }),
  ).toBeVisible();

  // Côté parrain, la page se met à jour d'elle-même.
  await expect(paul.page.getByRole("button", { name: "Rejoindre l'appel" })).toBeVisible({
    timeout: 15_000,
  });
  await expectNoBlockingViolations(paul.page);
  await paul.context.close();
});
