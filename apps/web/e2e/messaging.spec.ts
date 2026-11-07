import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Browser, Page, TestInfo } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { expect, test, withE2eKeys } from "./fixtures";
import { reseed } from "./global-setup";
import {
  AICHA,
  AICHA_CONVERSATION,
  CLAIRE_KOFFI_CONVERSATION,
  KOFFI_BUREAU_CONVERSATION,
} from "./routes";

// Messagerie (P-Messages, RW-Messages) : lecture, envoi, pièces jointes, message vidéo,
// encouragement, échange avec le relais, isolement entre parrains.

const projects = ["desktop-1440", "mobile-390"];

// Caméra et micro simulés par Chromium : aucune autorisation à donner, une mire animée.
test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
});

// Les tests s'enchaînent (non-lus, messages envoyés) : une base remise à l'état du seed pour
// chaque projet, puis les tests dans l'ordre.
test.describe.configure({ mode: "serial" });

test.beforeAll(({}, testInfo) => {
  if (!projects.includes(testInfo.project.name)) return;
  test.setTimeout(120_000);
  reseed();
});

test.beforeEach(({}, testInfo) => {
  test.skip(!projects.includes(testInfo.project.name), "desktop-1440 et mobile-390 seulement");
});

const isMobile = () => test.info().project.name === "mobile-390";

/** Nouvelle fenêtre avec la session donnée, aux dimensions du projet courant. */
async function openAs(browser: Browser, testInfo: TestInfo, storageState: string) {
  const { baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } =
    testInfo.project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    userAgent,
    storageState,
  });
  const page = await context.newPage();
  await withE2eKeys(page);
  return { context, page };
}

/** JPEG 64×48 avec EXIF : appareil, auteur et coordonnées GPS. */
function jpegWithGps(): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 92, b: 78 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: "Appareil-Test", Model: "Modele-Secret", Artist: "Claire Martin" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "45/1 45/1 3230/100",
        GPSLongitudeRef: "E",
        GPSLongitude: "4/1 50/1 1200/100",
      },
    })
    .toBuffer();
}

/** Vidéo mp4 de 2 s, bruitée pour peser environ 9 Mo : deux parts d'envoi multipart. */
function largeVideo(testInfo: TestInfo): Buffer {
  if (!ffmpegPath) throw new Error("ffmpeg-static n'a pas de binaire pour cette plateforme");
  const file = testInfo.outputPath("video-9-mo.mp4");
  execFileSync(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=640x360:rate=25,noise=alls=80:allf=t",
    "-t",
    "2",
    "-c:v",
    "mpeg4",
    "-q:v",
    "2",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
  return readFileSync(file);
}

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Navigation principale" });

function relaisNav(page: Page) {
  return isMobile()
    ? page.getByRole("navigation", { name: "Navigation", exact: true })
    : page.getByRole("navigation", { name: "Menu relais" });
}

function thread(page: Page, name: string) {
  const region = page.getByRole("region", { name: `Conversation avec ${name}` });
  return {
    region,
    log: region.getByRole("log", { name: "Messages" }),
    send: region.getByRole("button", { name: "Envoyer", exact: true }),
  };
}

test.describe("Messagerie", () => {
  test("Claire ouvre ses messages : pastille 2, puis le fil d'Aïcha", async ({ page }) => {
    await page.goto("/parrain");
    const nav = mainNav(page);
    await expect(nav.getByRole("link", { name: "Messages 2 non lus" })).toBeVisible();
    await nav.getByRole("link", { name: /^Messages/ }).click();
    await expect(page).toHaveURL("/parrain/messages");
    await expect(page).toHaveTitle("Messages · Parrainage LRT");

    // Conversations, de la plus récente à la plus ancienne ; M. Koffi attend une lecture.
    const list = page.getByRole("navigation", { name: "Conversations" });
    const links = list.getByRole("link");
    await expect(links).toHaveCount(4);
    for (const [index, name] of [
      // ≥ md, la conversation la plus récente s'affiche à côté de la liste, donc lue.
      isMobile()
        ? /^Aïcha\s*Bonjour tata Claire !.*\s*1 non lu$/
        : /^Aïcha\s*Bonjour tata Claire !.*\s*hier$/,
      /^M\. Koffi · relais\s*Créneau proposé pour l'appel.*\s*1 non lu$/,
      /^Bureau de l'association\s*Lettre d'information.*\s*il y a 6 j$/,
      /^Kofi\s*Merci pour le ballon !\s*2 sept\.$/,
    ].entries()) {
      await expect(links.nth(index)).toHaveAccessibleName(name);
    }

    if (isMobile()) {
      // Sous md, la liste seule ; la conversation s'ouvre en plein écran.
      await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Conversation avec Aïcha" })).toBeHidden();
      await list.getByRole("link", { name: /^Aïcha/ }).click();
      await expect(page).toHaveURL(`/parrain/messages/${AICHA_CONVERSATION}`);
      await expect(page.getByRole("link", { name: "Retour aux conversations" })).toBeVisible();
    }

    const { region, log } = thread(page, "Aïcha");
    await expect(region.getByRole("heading", { name: "Aïcha S." })).toBeVisible();
    await expect(region.getByText("Écrit depuis l'école, avec son relais M. Koffi")).toBeVisible();
    await expect(log.getByRole("article")).toHaveCount(2);
    await expect(log.getByText("14 octobre", { exact: true })).toBeVisible();
    await expect(log.getByText("Hier", { exact: true })).toBeVisible();
    await expect(log.getByText(/^Bravo pour ta rentrée Aïcha !/)).toBeVisible();
    await expect(log.getByText(/^Bonjour tata Claire !/)).toBeVisible();
    await expect(log.getByText("Photo de la classe")).toBeVisible();
    await expect(log.getByRole("link", { name: /^Bulletin T1 — 2026-27 \(PDF\)/ })).toHaveAttribute(
      "href",
      "/api/media/seed-media-aicha-bulletin-t1?download=1",
    );
    await expect(
      region.getByText(
        "Les messages sont relus par l'association avant d'être remis à Aïcha. Pour sa sécurité, n'échangez ni adresse, ni téléphone, ni réseau social.",
      ),
    ).toBeVisible();
    for (const idea of ["Quelle est ta matière préférée ?", "Que fais-tu après l'école ?"]) {
      await expect(region.getByRole("button", { name: idea })).toBeVisible();
    }

    // Ouvert, donc lu : il ne reste que le créneau de M. Koffi.
    await expect(nav.getByRole("link", { name: "Messages 1 non lu" })).toBeVisible();
  });

  test("Claire écrit à Aïcha : numéro signalé, photo et message vidéo en relecture", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await withE2eKeys(page);
    await page.goto(`/parrain/messages/${AICHA_CONVERSATION}`);
    await expect(page).toHaveTitle("Conversation avec Aïcha · Parrainage LRT");
    const { region, log, send } = thread(page, "Aïcha");
    const field = region.getByLabel("Votre réponse");

    // Une idée s'ajoute au champ.
    await region.getByRole("button", { name: "Quelle est ta matière préférée ?" }).click();
    await expect(field).toHaveValue("Quelle est ta matière préférée ?");
    await expect(field).toBeFocused();

    // Un numéro : avertissement avant l'envoi, le message part quand même… en relecture.
    const text = "Voici mon numéro : 06 39 98 12 34";
    await field.fill(text);
    const hint = region.getByRole("status");
    await expect(hint).toContainText("Votre message semble contenir : numéro de téléphone.");
    await send.click();
    const phone = log.getByRole("article").filter({ hasText: text });
    await expect(phone).toBeVisible();
    await expect(phone.getByText("En relecture")).toBeVisible();
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    await expect(region.getByText(/semble contenir/)).toHaveCount(0);

    // Une photo avec des coordonnées GPS : compressée, déposée, nettoyée, puis envoyée.
    await region.locator('input[type="file"]').setInputFiles({
      name: "IMG_20261030_GPS.jpg",
      mimeType: "image/jpeg",
      buffer: await jpegWithGps(),
    });
    const drafts = region.getByRole("list", { name: "Pièces jointes" });
    await expect(drafts.getByRole("listitem")).toHaveCount(1);
    await expect(drafts.getByText("Prête")).toBeVisible({ timeout: 30_000 });
    await send.click();
    await expect(drafts).toBeHidden();
    const photo = log
      .getByRole("article")
      .filter({ has: page.getByRole("img", { name: "Photo" }) });
    await expect(photo.getByText("En relecture")).toBeVisible();
    const src = await photo.getByRole("img", { name: "Photo" }).getAttribute("src");
    expect(src).toMatch(/^\/api\/media\/[\w-]+$/);
    const served = await page.request.get(src!);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toBe("image/jpeg");
    const bytes = await served.body();
    expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    for (const secret of ["Exif", "GPS", "Modele-Secret", "Appareil-Test", "Claire Martin"]) {
      expect(bytes.includes(secret), `« ${secret} » retiré de la photo`).toBe(false);
    }

    // Message vidéo : la caméra s'allume après un appui, aperçu, enregistrement, relecture.
    await region.getByRole("button", { name: "Message vidéo" }).click();
    const dialog = page.getByRole("dialog", { name: "Message vidéo" });
    await expect(dialog.getByText(/2 minutes au plus pour Aïcha/)).toBeVisible();
    await dialog.getByRole("button", { name: "Allumer la caméra" }).click();
    await expect(dialog.getByLabel("Aperçu de la caméra")).toBeVisible();
    await dialog.getByRole("button", { name: "Commencer l'enregistrement" }).click();
    await expect(dialog.getByText(/Enregistrement · 0:02 \/ 2:00/)).toBeVisible({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Arrêter l'enregistrement" }).click();
    await expect(dialog.getByLabel("Relecture de votre message vidéo")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Recommencer" })).toBeVisible();
    await dialog.getByRole("button", { name: "Envoyer la vidéo" }).click();
    await expect(dialog).toBeHidden();
    const video = log.getByRole("article").filter({ has: page.getByLabel(/^Vidéo/) });
    await expect(video.getByText("En relecture")).toBeVisible({ timeout: 60_000 });
    await expect(log.getByRole("article")).toHaveCount(5);
  });

  test("l'encouragement part depuis Mes filleuls, remis aussitôt", async ({ page }) => {
    await withE2eKeys(page);
    await page.goto(`/parrain?filleul=${AICHA}`);
    const card = page
      .getByRole("region", { name: "Dernières nouvelles" })
      .getByRole("article")
      .filter({ hasText: "Aïcha vous a écrit" });
    await card.getByRole("button", { name: "Envoyer un encouragement" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Encouragement envoyé" }),
    ).toBeVisible();
    await expect(card.getByRole("button", { name: "Encouragement envoyé" })).toBeDisabled();

    await card.getByRole("link", { name: "Répondre" }).click();
    await expect(page).toHaveURL(`/parrain/messages/${AICHA_CONVERSATION}`);
    const last = thread(page, "Aïcha").log.getByRole("article").last();
    await expect(last).toContainText("Bravo, continue comme ça ! Je pense bien à toi.");
    await expect(last.getByText("Remis à Aïcha")).toBeVisible();
  });

  test("M. Koffi lit le message de Claire et lui répond", async ({
    page,
    browser,
    koffiState,
  }, testInfo) => {
    test.setTimeout(90_000);
    await withE2eKeys(page);

    // Claire écrit au relais : un échange entre adultes, remis aussitôt, sans relecture.
    await page.goto(`/parrain/messages/${CLAIRE_KOFFI_CONVERSATION}`);
    const claire = thread(page, "M. Koffi");
    await expect(claire.region.getByRole("heading", { name: "M. Koffi" })).toBeVisible();
    await expect(claire.region.getByText("Demande d'appel vidéo avec Aïcha S.")).toBeVisible();
    await expect(claire.region.getByText(/Pour sa sécurité/)).toHaveCount(0);
    const request = "Le samedi 14 novembre à 11 h me convient très bien. Merci !";
    await claire.region.getByLabel("Votre réponse").fill(request);
    await claire.send.click();
    const sent = claire.log.getByRole("article").filter({ hasText: request });
    await expect(sent.getByText("Remis à M. Koffi")).toBeVisible();
    // Tout est lu chez Claire.
    await expect(mainNav(page).getByRole("link", { name: "Messages", exact: true })).toBeVisible();

    // M. Koffi : 2 non lus (la demande d'appel et ce message), qui disparaissent à la lecture.
    const koffi = await openAs(browser, testInfo, koffiState);
    await koffi.page.goto("/relais");
    await expect(
      relaisNav(koffi.page).getByRole("link", { name: /^Messages\s*,?\s*2 non lus$/ }),
    ).toBeVisible();
    await relaisNav(koffi.page)
      .getByRole("link", { name: /^Messages/ })
      .click();
    await expect(koffi.page).toHaveURL("/relais/messages");
    const tabs = koffi.page.getByRole("tablist", { name: "Filtrer les conversations" });
    await expect(tabs.getByRole("tab")).toHaveText(["Parrains", "Bureau"]);
    await expect(tabs.getByRole("tab", { name: "Parrains" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const list = koffi.page.getByRole("navigation", { name: "Conversations" });
    await list.getByRole("link", { name: /^Claire M\./ }).click();
    await expect(koffi.page).toHaveURL(`/relais/messages/${CLAIRE_KOFFI_CONVERSATION}`);
    const relais = thread(koffi.page, "Claire M.");
    await expect(relais.region.getByRole("heading", { name: "Claire M." })).toBeVisible();
    await expect(relais.log.getByText(request)).toBeVisible();
    await expect(
      relaisNav(koffi.page).getByRole("link", { name: "Messages", exact: true }),
    ).toBeVisible();

    const reply = "Parfait, je confirme samedi 14 novembre à 11 h, avec Aïcha à l'école.";
    const field = relais.region.getByLabel("Votre message");
    await expect(field).toHaveAttribute("placeholder", "Écrire à Claire…");
    await field.fill(reply);
    await relais.send.click();
    await expect(
      relais.log.getByRole("article").filter({ hasText: reply }).getByText("Remis à Claire"),
    ).toBeVisible();
    await koffi.context.close();

    // Claire voit la réponse : pastille, puis le fil.
    await page.goto("/parrain");
    await expect(mainNav(page).getByRole("link", { name: "Messages 1 non lu" })).toBeVisible();
    await page.goto(`/parrain/messages/${CLAIRE_KOFFI_CONVERSATION}`);
    await expect(claire.log.getByRole("article").last()).toContainText(reply);
    await expect(mainNav(page).getByRole("link", { name: "Messages", exact: true })).toBeVisible();
  });

  test("M. Koffi passe d'un onglet à l'autre et retrouve une conversation", async ({
    browser,
    koffiState,
  }, testInfo) => {
    const { context, page } = await openAs(browser, testInfo, koffiState);
    await page.goto("/relais/messages");
    const tabs = page.getByRole("tablist", { name: "Filtrer les conversations" });
    await tabs.getByRole("tab", { name: "Bureau" }).click();
    await expect(page).toHaveURL("/relais/messages?onglet=bureau");
    await expect(tabs.getByRole("tab", { name: "Bureau" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const list = page.getByRole("navigation", { name: "Conversations" });
    await expect(list.getByRole("link")).toHaveCount(1);
    await expect(list.getByRole("link")).toContainText("Bureau · trésorerie");

    // « Nouveau message » vers une personne déjà contactée : la conversation existante s'ouvre.
    await page.getByRole("button", { name: "Nouveau message" }).click();
    const dialog = page.getByRole("dialog", { name: "Nouveau message" });
    await dialog.getByRole("radio", { name: /Bureau de l'association/ }).check();
    await dialog.getByRole("button", { name: "Écrire" }).click();
    await expect(page).toHaveURL(`/relais/messages/${KOFFI_BUREAU_CONVERSATION}`);
    const { region } = thread(page, "Bureau · trésorerie");
    await expect(region.getByRole("heading", { name: "Bureau · trésorerie" })).toBeVisible();
    await expect(region.getByText(/^Reçus d'octobre/)).toBeVisible();
    await context.close();
  });

  test("une vidéo de plus de 5 Mo reprend après une coupure, sans renvoyer ce qui est reçu", async ({
    browser,
    koffiState,
  }, testInfo) => {
    test.setTimeout(120_000);
    const video = largeVideo(testInfo);
    expect(video.length).toBeGreaterThan(5 * 1024 * 1024);
    const { context, page } = await openAs(browser, testInfo, koffiState);

    // Coupure réseau : les trois essais de la 2e part échouent, puis le réseau revient.
    const received: number[] = [];
    let cuts = 0;
    await page.route(/[?&]partNumber=\d+/, async (route) => {
      const request = route.request();
      if (request.method() !== "PUT") return route.continue();
      const part = Number(new URL(request.url()).searchParams.get("partNumber"));
      if (part === 2 && cuts < 3) {
        cuts += 1;
        return route.abort("internetdisconnected");
      }
      received.push(part);
      return route.continue();
    });

    await page.goto(`/relais/messages/${CLAIRE_KOFFI_CONVERSATION}`);
    const { region, log, send } = thread(page, "Claire M.");
    await region.locator('input[type="file"]').setInputFiles({
      name: "visite-ecole.mp4",
      mimeType: "video/mp4",
      buffer: video,
    });
    const drafts = region.getByRole("list", { name: "Pièces jointes" });
    await expect(drafts.getByText(/L'envoi a été interrompu/)).toBeVisible({ timeout: 30_000 });
    expect(received).toEqual([1]);

    await drafts.getByRole("button", { name: "Réessayer" }).click();
    await expect(drafts.getByText("Prête")).toBeVisible({ timeout: 60_000 });
    // Seule la part manquante est repartie.
    expect(received).toEqual([1, 2]);

    await region.getByLabel("Votre message").fill("La vidéo de la visite à l'école.");
    await send.click();
    const message = log
      .getByRole("article")
      .filter({ hasText: "La vidéo de la visite à l'école." });
    await expect(message.getByLabel(/^Vidéo · 0:02$/)).toBeVisible();
    await expect(message.getByText("Remis à Claire")).toBeVisible();
    await context.close();
  });

  test("une conversation d'un autre parrain renvoie une page introuvable", async ({
    browser,
    paulState,
    koffiState,
  }, testInfo) => {
    // Paul D., co-parrain de Kofi, n'a accès à aucun échange de Claire.
    const paul = await openAs(browser, testInfo, paulState);
    for (const id of [AICHA_CONVERSATION, CLAIRE_KOFFI_CONVERSATION, "inconnue"]) {
      const response = await paul.page.goto(`/parrain/messages/${id}`);
      expect(response?.status(), id).toBe(404);
      await expect(
        paul.page.getByRole("heading", { level: 1, name: "Page introuvable" }),
      ).toBeVisible();
      await expect(paul.page).toHaveTitle("Page introuvable · Parrainage LRT");
    }
    await paul.context.close();

    // Le relais ne lit pas encore les conversations des enfants (onglet « Enfants », phase 8).
    const koffi = await openAs(browser, testInfo, koffiState);
    const response = await koffi.page.goto(`/relais/messages/${AICHA_CONVERSATION}`);
    expect(response?.status()).toBe(404);
    await koffi.context.close();
  });
});
