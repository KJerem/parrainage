import type { Browser, Page, TestInfo } from "@playwright/test";
import sharp from "sharp";
import { expectNoBlockingViolations } from "./axe";
import { expect, KOFFI, PASSWORD, relaisTest as test, saveSession, withE2eKeys } from "./fixtures";
import { reseed } from "./global-setup";
import { expectNoOverflowAt, overflowWidths } from "./overflow";

// Parcours complet d'une session élève (plan, phase 8). Le relais ouvre la session sur son poste
// avec une session d'adulte à lui : l'ouverture la révoque, les autres tests partagent l'autre.

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

const isMobile = () => test.info().project.name === "mobile-390";

const AICHA_CODE = ["Soleil", "Arbre", "Poisson"];
const WRONG_CODE = ["Arbre", "Soleil", "Poisson"];

const contextOptions = (testInfo: TestInfo) => ({
  baseURL: testInfo.project.use.baseURL!,
  viewport: testInfo.project.use.viewport ?? undefined,
  permissions: ["camera", "microphone"],
  serviceWorkers: "block" as const,
});

/** Un poste d'école vierge, où le relais vient de se connecter. */
async function schoolPoste(browser: Browser, testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL!;
  const storageState = await saveSession(
    baseURL,
    KOFFI,
    testInfo.outputPath(`poste-${Date.now()}.json`),
  );
  const context = await browser.newContext({ ...contextOptions(testInfo), storageState });
  const page = await context.newPage();
  await withE2eKeys(page);
  return { context, page };
}

/** Ouvre la session depuis RW-Session (avec la confirmation demandée sur téléphone). */
async function openFromForm(page: Page) {
  await page.getByRole("button", { name: "Ouvrir la session sur ce poste" }).click();
  if (isMobile()) {
    const dialog = page.getByRole("dialog", { name: "Ce téléphone devient le poste élève" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Ouvrir la session" }).click();
  }
  await expect(page).toHaveURL("/eleve");
}

const imagesRegion = (page: Page) => page.getByRole("region", { name: /Touche tes 3 images/ });

async function shownImages(page: Page): Promise<string[]> {
  const names = await imagesRegion(page).getByRole("button").allTextContents();
  return names.filter((name) => name !== "Effacer");
}

async function typeCode(page: Page, images: readonly string[]) {
  for (const image of images) {
    await imagesRegion(page).getByRole("button", { name: image }).click();
  }
}

const chooseChild = (page: Page, name: string) =>
  page.getByRole("region", { name: "1. Qui es-tu ?" }).getByRole("button", { name }).click();

async function photoFile(name: string, background: string) {
  return {
    name,
    mimeType: "image/png",
    buffer: await sharp({ create: { width: 64, height: 64, channels: 3, background } })
      .png()
      .toBuffer(),
  };
}

test("sans session, le poste l'annonce, et les pages d'enfant renvoient à la connexion", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    ...contextOptions(testInfo),
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto("/eleve");
  await expect(
    page.getByRole("heading", { level: 1, name: "Aucune session ouverte sur ce poste" }),
  ).toBeVisible();
  for (const path of ["/eleve/messages", "/eleve/envoyer", "/eleve/envoye?m=x"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/eleve");
  }
  await context.close();
});

test("RW-Session prépare la session planifiée et annonce les récentes", async ({ page }) => {
  await page.goto("/relais/sessions");
  await expect(
    page.getByRole("group", { name: /Enfants autorisés · 6 sélectionnés/ }),
  ).toBeVisible();
  await expect(page.getByLabel(/Esther N\..*sans parrain/)).toBeChecked();
  await expect(page.getByRole("radio", { name: "45 min" })).toBeChecked();
  await expect(page.getByLabel("Écrire à leur parrain")).toBeChecked();
  await expect(page.getByLabel("Écrire à l'association")).not.toBeChecked();
  // 10 h 00 à Lomé, plus 45 minutes.
  await expect(page.getByText(/Fermeture automatique à 10 h 45/)).toBeVisible();
  await page.getByRole("radio", { name: "1 h" }).click();
  await expect(page.getByText(/Fermeture automatique à 11 h 00/)).toBeVisible();
  const recent = page.getByRole("region", { name: "Sessions récentes" });
  await expect(recent).toContainText("Mardi 27 oct.");
  await expect(recent).toContainText("5 enfants · 7 envois");
  await expect(recent).toContainText("Mardi 20 oct.");
  await expect(recent).toContainText("6 enfants · 9 envois");
  await expect(page.getByRole("region", { name: "Sessions planifiées" })).toContainText(
    "Mardi 3 nov.",
  );
});

test("l'accueil du relais annonce la session d'écriture", async ({ page }) => {
  await page.goto("/relais");
  const tile = page
    .getByRole("link", { name: /Session d'écriture mardi/ })
    .filter({ visible: true });
  await expect(tile).toContainText("6 enfants inscrits");
  await tile.click();
  await expect(page).toHaveURL(/\/relais\/sessions\?planifiee=seed-session-koffi-planned$/);
});

test("planifier ajoute une session, et on peut la retirer", async ({ page }) => {
  test.skip(isMobile(), "Le formulaire est le même : une seule largeur");
  await page.goto("/relais/sessions");
  await page.getByRole("button", { name: "Planifier", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Planifier la session" });
  await dialog.getByLabel("Date").fill("2026-11-10");
  await dialog.getByLabel("Heure à Lomé").fill("09:30");
  await dialog.getByRole("button", { name: "Planifier" }).click();
  const planned = page.getByRole("region", { name: "Sessions planifiées" });
  await expect(planned).toContainText("Mardi 10 nov. · 9 h 30");
  await expect(page.getByText("Enfants de la session planifiée.")).toBeVisible();
  await planned.getByRole("button", { name: "Retirer" }).first().click();
  await expect(planned).not.toContainText("Mardi 3 nov.");
});

test("refuse d'ouvrir une session tant que des envois attendent", async ({ page }) => {
  test.skip(isMobile(), "La file est la même : une seule largeur");
  await page.route("**/api/relais/results/**", (route) => route.abort());
  await page.goto("/relais/resultats");
  await page
    .getByLabel(/Moyenne Aïcha/)
    .filter({ visible: true })
    .fill("15");
  // La saisie part dans la file, et y reste tant que le réseau ne répond pas.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const request = indexedDB.open("parrainage-outbox");
              request.onsuccess = () => {
                const db = request.result;
                const names = [...db.objectStoreNames];
                if (names.length === 0) {
                  db.close();
                  resolve(0);
                  return;
                }
                const count = db.transaction(names).objectStore(names[0]!).count();
                count.onsuccess = () => {
                  db.close();
                  resolve(count.result);
                };
              };
            }),
        ),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  await page.goto("/relais/sessions");
  const open = page.getByRole("button", { name: "Ouvrir la session sur ce poste" });
  await expect(
    page.getByRole("alert").filter({ hasText: "attendent encore le réseau" }),
  ).toBeVisible();
  await expect(open).toBeDisabled();
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase("parrainage-outbox");
        request.onsuccess = request.onerror = request.onblocked = () => resolve(null);
      }),
  );
});

test("parcours complet d'un enfant, de l'ouverture à « J'ai fini »", async ({
  browser,
  page: relaisPage,
}, testInfo) => {
  test.setTimeout(240_000);
  const { context, page } = await schoolPoste(browser, testInfo);

  // ── Ouverture : le relais quitte le poste, plus rien de lui n'y reste. ─────────────
  await page.goto("/relais/sessions");
  for (const name of [/Aïcha S\./, /Kofi A\./]) {
    await page.getByLabel(name).check();
  }
  await page.getByLabel(/Mariam T\./).uncheck();
  await openFromForm(page);
  await expect(page.getByText(/Session ouverte par M\. Koffi · jusqu'à 10 h 45/)).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name.includes("better-auth"))).toBe(false);
  const device = cookies.find((cookie) => cookie.name === "kd_device");
  expect(device).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("kd_");
  const redirected = await context.newPage();
  await redirected.goto("/relais");
  await expect(redirected).toHaveURL(/\/connexion/);
  await redirected.close();
  const child = page.getByRole("region", { name: "1. Qui es-tu ?" });
  await expect(child.getByRole("button", { name: "Mariam" })).toHaveCount(0);

  // ── Connexion : l'ordre des images change après un essai raté. ─────────────────────
  await chooseChild(page, "Aïcha");
  const before = await shownImages(page);
  expect(before).toHaveLength(6);
  await typeCode(page, WRONG_CODE);
  await expect(page.getByRole("status", { name: "3 images touchées sur 3" })).toBeVisible();
  await page.getByRole("button", { name: "C'est moi, j'entre" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Ce ne sont pas les bonnes images. Il te reste 2 essais.",
  );
  expect(await shownImages(page)).not.toEqual(before);
  await expect(page.getByRole("status", { name: "0 image touchée sur 3" })).toBeVisible();

  // « Effacer » retire ce qui vient d'être touché.
  await typeCode(page, ["Maison"]);
  await page.getByRole("button", { name: "Effacer" }).click();
  await expect(page.getByRole("status", { name: "0 image touchée sur 3" })).toBeVisible();

  await typeCode(page, AICHA_CODE);
  await page.getByRole("button", { name: "C'est moi, j'entre" }).click();
  await expect(page).toHaveURL("/eleve/messages");

  // ── Enfant : son parrain, son fil, rien de plus. ───────────────────────────────────
  await expect(page.getByText("Bonjour Aïcha !")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Mes messages avec Claire" }),
  ).toBeVisible();
  await expect(page.getByText("Elle habite à Lyon, en France.")).toBeVisible();
  await expect(page.getByText("Claire M.")).toHaveCount(0);
  const response = await page.goto("/eleve/messages");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(await response?.text()).not.toContain("claire.m@");

  // Le relais suit l'enfant qui vient d'arriver.
  await relaisPage.goto("/relais/sessions");
  const current = relaisPage.getByRole("region", { name: "Session en cours" });
  await expect(current.getByRole("listitem").filter({ hasText: "Aïcha S." })).toContainText(
    "Connexion à",
  );
  await expect(current.getByRole("listitem").filter({ hasText: "Kofi A." })).toContainText(
    "Pas encore connecté",
  );

  // ── Écrire : en relecture, avec l'écran « Bravo ». ─────────────────────────────────
  await page.getByLabel("Écris ton message").fill("Bonjour Claire, j'ai gagné au calcul mental !");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page).toHaveURL(/\/eleve\/envoye\?m=/);
  await expect(page.getByRole("heading", { level: 1, name: "Bravo Aïcha !" })).toBeVisible();
  await expect(
    page.getByText(
      "Ton message part chez Claire. L'association le lit d'abord, puis Claire le reçoit.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Reçu par Claire" })).toBeVisible();
  await page.getByRole("link", { name: "Écrire autre chose" }).click();
  await expect(
    page.getByRole("article").filter({ hasText: "gagné au calcul mental" }),
  ).toContainText("L'association le lit");

  // ── Photo : la caméra ne s'allume qu'après un appui. ───────────────────────────────
  await page.evaluate(() => {
    sessionStorage.setItem("camera-calls", "0");
  });
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    const original = devices.getUserMedia.bind(devices);
    devices.getUserMedia = (constraints) => {
      sessionStorage.setItem(
        "camera-calls",
        String(Number(sessionStorage.getItem("camera-calls") ?? 0) + 1),
      );
      return original(constraints);
    };
  });
  await page.getByRole("link", { name: "Ajouter une photo" }).click();
  await expect(page).toHaveURL(/\/eleve\/envoyer\?type=photo/);
  await page.reload();
  await expect(page.getByText("Envoyer quelque chose à Claire")).toBeVisible();
  const cameraCalls = () => page.evaluate(() => Number(sessionStorage.getItem("camera-calls")));
  expect(await cameraCalls()).toBe(0);
  await expect(page.getByText("Caméra allumée")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Prendre la photo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Allumer la caméra" }).click();
  await expect(page.getByText("Caméra allumée")).toBeVisible();
  expect(await cameraCalls()).toBe(1);
  await expect
    .poll(() => page.evaluate(() => document.querySelector("video")?.videoWidth ?? 0))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Prendre la photo" }).click();
  await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();
  await page.getByRole("button", { name: "Éteindre la caméra" }).click();
  await expect(page.getByText("Caméra allumée")).toHaveCount(0);
  await page.getByRole("button", { name: "Envoyer à Claire" }).click();
  await expect(page).toHaveURL(/\/eleve\/envoye\?m=/);
  await expect(page.getByText(/^Ta photo part chez Claire\./)).toBeVisible();

  // ── Bulletin : des pages déposées en fichier, et un petit mot. ─────────────────────
  await page.getByRole("link", { name: "Écrire autre chose" }).click();
  await page.getByRole("link", { name: "Envoyer mon bulletin" }).click();
  await expect(page.getByText("Pose ton bulletin")).toBeVisible();
  const file = page.getByTestId("eleve-file");
  await file.setInputFiles(await photoFile("page-1.png", "#1E5C4E"));
  await expect(page.getByRole("img", { name: "Page 1" })).toBeVisible();
  await expect(page.getByText("Page 2 ?")).toBeVisible();
  await file.setInputFiles(await photoFile("page-2.png", "#E9A23B"));
  await expect(page.getByRole("img", { name: "Page 2" })).toBeVisible();
  await page.getByRole("button", { name: "Retirer : Page 2" }).click();
  await expect(page.getByRole("img", { name: "Page 2" })).toHaveCount(0);
  await page.getByLabel("Un petit mot (si tu veux)").fill("Voici mon bulletin");
  await page.getByRole("button", { name: "Envoyer à Claire" }).click();
  await expect(page).toHaveURL(/\/eleve\/envoye\?m=/);
  await expect(
    page.getByText(
      "Ton bulletin part chez Claire. L'association le regarde d'abord, puis Claire le reçoit.",
    ),
  ).toBeVisible();
  const sentUrl = new URL(page.url());

  // ── Aucun défaut d'accessibilité ni de débordement sur ces écrans. ─────────────────
  for (const path of [
    `${sentUrl.pathname}${sentUrl.search}`,
    "/eleve/messages",
    "/eleve/envoyer?type=bulletin",
    "/eleve/envoyer?type=video",
  ]) {
    await page.goto(path);
    await expectNoBlockingViolations(page);
    if (!isMobile()) {
      for (const width of overflowWidths) {
        await expectNoOverflowAt(page, path, width);
      }
      await page.setViewportSize(contextOptions(testInfo).viewport!);
    }
  }

  // ── « J'ai fini » : l'enfant part, le poste reste ouvert, et rien ne reste hors ligne. ──
  await page.goto("/eleve/messages");
  await page.getByRole("button", { name: "J'ai fini" }).click();
  await expect(page).toHaveURL("/eleve");
  await expectNoBlockingViolations(page);
  if (!isMobile()) {
    for (const width of overflowWidths) {
      await expectNoOverflowAt(page, "/eleve", width);
    }
    await page.setViewportSize(contextOptions(testInfo).viewport!);
  }
  expect((await context.cookies()).some((cookie) => cookie.name === "kd_child")).toBe(false);
  await page.goBack().catch(() => null);
  await expect(page.getByText("Bonjour Aïcha !")).toHaveCount(0);

  await context.setOffline(true);
  await page.goto("/eleve/messages").catch(() => null);
  await expect(page.getByText("Bonjour Aïcha !")).toHaveCount(0);
  await expect(page.getByText("Mes messages avec Claire")).toHaveCount(0);
  await context.setOffline(false);
  await page.goto("/eleve/messages");
  await expect(page).toHaveURL("/eleve");

  // ── Verrou : au 3e échec, le bon code ne passe plus, jusqu'au déblocage. ───────────
  await chooseChild(page, "Aïcha");
  await typeCode(page, WRONG_CODE);
  await page.getByRole("button", { name: "C'est moi, j'entre" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Il te reste 2 essais");
  await typeCode(page, WRONG_CODE);
  await page.getByRole("button", { name: "C'est moi, j'entre" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Il te reste 1 essai");
  await typeCode(page, WRONG_CODE);
  await page.getByRole("button", { name: "C'est moi, j'entre" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Tes images sont bloquées. Demande à M. Koffi de les débloquer.",
  );
  await expect(imagesRegion(page).getByRole("button", { name: "Soleil" })).toBeDisabled();

  await relaisPage.reload();
  const row = current.getByRole("listitem").filter({ hasText: "Aïcha S." });
  await expect(row).toContainText("Bloqué");
  await expect(relaisPage.getByRole("button", { name: "Rendre le poste aux élèves" })).toHaveCount(
    0,
  );
  await row.getByRole("button", { name: "Débloquer" }).click();
  await expect(row).not.toContainText("Bloqué");

  await page.reload();
  await chooseChild(page, "Aïcha");
  await typeCode(page, AICHA_CODE);
  await page.getByRole("button", { name: "C'est moi, j'entre" }).click();
  await expect(page).toHaveURL("/eleve/messages");

  // ── Fermeture : l'enfant est renvoyé dès la requête suivante. ──────────────────────
  await relaisPage.reload();
  await current.getByRole("button", { name: "Fermer la session" }).click();
  await relaisPage
    .getByRole("dialog", { name: "Fermer la session ?" })
    .getByRole("button", { name: "Fermer la session" })
    .click();
  await expect(
    relaisPage.getByRole("button", { name: "Ouvrir la session sur ce poste" }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL("/eleve");
  await expect(
    page.getByRole("heading", { level: 1, name: "Aucune session ouverte sur ce poste" }),
  ).toBeVisible();
  await context.close();
});

test("le relais suit la conversation d'un enfant dans l'onglet « Enfants »", async ({ page }) => {
  await page.goto("/relais/messages?onglet=enfants");
  const tabs = page.getByRole("tablist", { name: "Filtrer les conversations" });
  await expect(tabs.getByRole("tab", { name: "Enfants" })).toHaveAttribute("aria-selected", "true");
  const list = page.getByRole("navigation", { name: "Conversations" });
  await expect(list.getByRole("link", { name: /^Kofi Avec son parrain Paul D\./ })).toBeVisible();
  // Un enfant sans aucun message n'encombre pas la liste.
  await expect(list.getByRole("link", { name: /Aucun message/ })).toHaveCount(0);
  await list.getByRole("link", { name: /^Aïcha Avec sa marraine Claire M\./ }).click();
  await expect(page).toHaveURL("/relais/messages/seed-conversation-aicha-claire");
  // Encore en relecture : il n'en voit que l'existence, et peut le signaler au bureau.
  const pending = page.getByRole("article").filter({ hasText: "Message en relecture" }).last();
  await expect(pending).toBeVisible();
  await expect(page.getByText("gagné au calcul mental")).toHaveCount(0);
  await pending.getByRole("button", { name: "Signaler au bureau" }).click();
  const dialog = page.getByRole("dialog", { name: "Signaler ce message au bureau" });
  await dialog.getByRole("radio", { name: "Visage d'un autre enfant" }).check();
  await dialog.getByRole("button", { name: "Signaler" }).click();
  await expect(pending.getByText("Signalé au bureau")).toBeVisible();
});

test("une session ouverte sur le poste se reprend et se rend aux élèves", async ({
  browser,
}, testInfo) => {
  test.skip(isMobile(), "Même écran sur téléphone : une seule largeur");
  const { context, page } = await schoolPoste(browser, testInfo);
  await page.goto("/relais/sessions");
  await page.getByLabel(/Aïcha S\./).check();
  await openFromForm(page);

  // Le relais revient sur le poste, puis le rend aux enfants sans y rester connecté.
  await page.goto("/connexion?next=/relais/sessions");
  // Formulaire hydraté : sinon l'envoi partirait sans JavaScript.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const form = document.querySelector("form");
        return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
      }),
    )
    .toBe(true);
  await page.getByLabel("Adresse e-mail").fill(KOFFI);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Accéder à mon espace" }).click();
  await expect(page).toHaveURL("/relais/sessions");
  await expectNoBlockingViolations(page);
  for (const width of overflowWidths) {
    await expectNoOverflowAt(page, "/relais/sessions", width);
  }
  await page.setViewportSize(contextOptions(testInfo).viewport!);
  await page.getByRole("button", { name: "Rendre le poste aux élèves" }).click();
  await expect(page).toHaveURL("/eleve");
  await expect(page.getByRole("region", { name: "1. Qui es-tu ?" })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name.includes("better-auth"))).toBe(false);
  expect(cookies.some((cookie) => cookie.name === "kd_device")).toBe(true);
  await context.close();
});
