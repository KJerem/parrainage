import type { BrowserContext, Page } from "@playwright/test";
import sharp from "sharp";
import { expect, KOFFI, relaisTest as test, saveSession, withE2eKeys } from "./fixtures";
import { reseed } from "./global-setup";
import { AICHA } from "./routes";

// Hors ligne du relais (plan §8) : vrai service worker, vraie file d'attente, réseau réellement
// coupé. Les autres suites bloquent le service worker : celle-ci l'autorise.

const projects = ["desktop-1440", "mobile-390"];

test.use({ serviceWorkers: "allow" });
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
  test.setTimeout(60_000);
});

const isMobile = () => test.info().project.name === "mobile-390";

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true });

/** Le service worker est actif et les deux pages hors ligne sont en cache. */
async function offlineReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const cache = await caches.open("relais-pages");
          return (await cache.keys()).length;
        }),
      { timeout: 30_000 },
    )
    .toBe(2);
}

async function goOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

async function goOnline(context: BrowserContext) {
  await context.setOffline(false);
}

const photo = async () => ({
  name: "kits.png",
  mimeType: "image/png",
  buffer: await sharp({ create: { width: 64, height: 48, channels: 3, background: "#1E5C4E" } })
    .png()
    .toBuffer(),
});

/** Ce qui attend dans IndexedDB, dans l'ordre : le titre d'une publication, l'enfant d'une saisie. */
const outboxContent = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("parrainage-outbox");
        open.onerror = () => reject(new Error("IndexedDB indisponible"));
        open.onsuccess = () => {
          const all = open.result.transaction("items").objectStore("items").getAll();
          all.onerror = () => reject(new Error("Lecture impossible"));
          all.onsuccess = () => {
            type Item = {
              type: string;
              childId?: string;
              payload: { title?: string; averageX100?: number | null };
            };
            resolve(
              (all.result as Item[]).map((item) =>
                item.type === "news"
                  ? `news:${item.payload.title}`
                  : `result:${item.childId}=${item.payload.averageX100}`,
              ),
            );
            open.result.close();
          };
        };
      }),
  );

test("l'appli s'installe : manifest du relais seul, icônes et service worker", async ({ page }) => {
  const manifest = await page.request.get("/relais.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
  const body = (await manifest.json()) as {
    name: string;
    start_url: string;
    scope: string;
    display: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(body).toMatchObject({ start_url: "/relais", scope: "/relais", display: "standalone" });
  expect(body.icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  expect(body.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  for (const icon of body.icons) {
    const image = await page.request.get(icon.src);
    expect(image.status(), icon.src).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
  }
  const worker = await page.request.get("/sw.js");
  expect(worker.status()).toBe(200);
  expect(worker.headers()["cache-control"]).toContain("no-cache");

  await page.goto("/relais");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/relais.webmanifest");
  await offlineReady(page);
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return new URL(registration.scope).pathname;
  });
  expect(scope).toBe("/relais");
  // Seules les pages hors ligne sont en cache, et rien d'autre que le précache.
  const cached = await page.evaluate(async () => {
    const cache = await caches.open("relais-pages");
    return (await cache.keys()).map((request) => new URL(request.url).pathname).sort();
  });
  expect(cached).toEqual(["/relais", "/relais/publier"]);

  // Les autres espaces n'annoncent pas d'appli à installer.
  const other = await page
    .context()
    .browser()!
    .newContext({ storageState: { cookies: [], origins: [] } });
  const visitor = await other.newPage();
  await visitor.goto(`${test.info().project.use.baseURL}/connexion`);
  await expect(visitor.locator('link[rel="manifest"]')).toHaveCount(0);
  await other.close();
});

test("hors ligne, l'accueil et la publication s'ouvrent ; le reste non", async ({
  page,
  context,
}) => {
  await page.goto("/relais");
  await offlineReady(page);
  await goOffline(context, page);

  await page.goto("/relais");
  await expect(visible(page, /^Hors ligne · vos saisies partiront/)).toBeVisible();
  const publishLink = page
    .getByRole("link", { name: "Publier une nouvelle" })
    .filter({ visible: true })
    .first();
  await expect(publishLink).toBeVisible();

  // Navigation dans l'appli : la page gardée prend le relais.
  await publishLink.click();
  await expect(page).toHaveURL("/relais/publier");
  await expect(
    page
      .getByRole("form", { name: isMobile() ? "Nouvelle publication" : "Publier une nouvelle" })
      .filter({ visible: true }),
  ).toBeVisible();

  // Une autre page du relais : la page d'attente, sans aucune donnée.
  await page.goto("/relais/enfants");
  await expect(page.getByRole("heading", { level: 1, name: "Vous êtes hors ligne" })).toBeVisible();
  await expect(page.getByText("Aïcha")).toHaveCount(0);

  // Hors de la portée du service worker : rien ne sort d'un cache.
  for (const path of ["/parrain", "/bureau", "/eleve"]) {
    await expect(page.goto(path), path).rejects.toThrow();
  }
  await goOnline(context);
});

test("une publication hors ligne attend, puis part une seule fois", async ({
  page,
  context,
  browser,
  claireState,
}, testInfo) => {
  await withE2eKeys(page);
  await page.goto("/relais");
  await offlineReady(page);
  await goOffline(context, page);

  const title = `Hors ligne ${testInfo.project.name}`;
  await page.goto(`/relais/publier?enfant=${AICHA}`);
  if (isMobile()) {
    await expect(page.getByRole("button", { name: "Aïcha S.", pressed: true })).toBeVisible();
    await expect(visible(page, "Hors ligne : la publication partira")).toBeVisible();
    await page.getByTestId("prendre-photo").setInputFiles(await photo());
    await page.getByLabel("Quelques mots").fill(`Remise des cahiers. ${title}`);
    await page.getByRole("button", { name: "Publier pour Claire M." }).click();
  } else {
    await expect(page.getByRole("radio", { name: "Un enfant" })).toBeChecked();
    await page.getByLabel("Titre").fill(title);
    await page.getByLabel("Message aux parrains").fill(`Remise des cahiers. ${title}`);
    await page.getByTestId("medias-nouvelle").setInputFiles(await photo());
    await expect(page.getByRole("button", { name: "Retirer ce fichier" }).first()).toBeAttached();
    await page.getByRole("button", { name: "Publier", exact: true }).click();
  }

  // De retour sur l'accueil gardé : la publication est listée et annoncée.
  await expect(page).toHaveURL("/relais");
  await expect(
    visible(page, /Hors ligne · 1 publication sera envoyée au retour du réseau/),
  ).toBeVisible();
  const pending = page
    .getByRole("region", { name: "En attente d'envoi" })
    .filter({ visible: true });
  await expect(pending).toContainText("Pour 1 parrain · enregistré à");
  await expect(pending).toContainText("Photo");
  expect(await outboxContent(page)).toHaveLength(1);

  // Une fermeture d'onglet ne perd rien : la file est dans IndexedDB.
  await page.reload();
  await expect(pending).toBeVisible();

  // Deux onglets au retour du réseau : un seul envoi part.
  const second = await context.newPage();
  await withE2eKeys(second);
  await second.goto("/relais").catch(() => {});
  await goOnline(context);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => outboxContent(page), { timeout: 20_000 }).toEqual([]);
  await expect(pending).toHaveCount(0);
  await second.close();

  const claire = await browser.newContext({
    storageState: claireState,
    baseURL: testInfo.project.use.baseURL,
    serviceWorkers: "block",
  });
  const claireTab = await claire.newPage();
  await claireTab.goto(`/parrain?filleul=${AICHA}`);
  const cards = claireTab.getByRole("article").filter({ hasText: `Remise des cahiers. ${title}` });
  await expect(cards).toHaveCount(1);
  await expect(cards.locator("img")).toHaveCount(1);
  await claire.close();
});

test("les saisies de résultats hors ligne partent dans l'ordre, la dernière de chaque ligne", async ({
  page,
  context,
}) => {
  await page.goto("/relais");
  await offlineReady(page);
  await page.goto("/relais/resultats");
  await expect(page.getByLabel(/Moyenne Esther/).filter({ visible: true })).toBeVisible();
  await goOffline(context, page);

  const field = (label: RegExp) => page.getByLabel(label).filter({ visible: true });
  await field(/Moyenne Esther/).fill("11");
  await expect.poll(() => outboxContent(page)).toEqual([expect.stringMatching(/esther=1100$/)]);
  await field(/Moyenne Kofi/).fill("10");
  await expect
    .poll(() => outboxContent(page))
    .toEqual([expect.stringMatching(/esther=1100$/), expect.stringMatching(/kofi=1000$/)]);
  // Une seconde saisie sur Esther remplace la première et passe après celle de Kofi.
  await field(/Moyenne Esther/).fill("12,5");
  await expect
    .poll(() => outboxContent(page))
    .toEqual([expect.stringMatching(/kofi=1000$/), expect.stringMatching(/esther=1250$/)]);
  await expect(
    page.getByRole("status").filter({ hasText: "hors ligne, saisies gardées sur ce poste" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer aux parrains" })).toBeDisabled();

  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes("/api/relais/results/")) {
      sent.push(request.url().split("/").at(-1)!);
    }
  });
  await goOnline(context);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => outboxContent(page), { timeout: 20_000 }).toEqual([]);
  await expect(
    page.getByRole("status").filter({ hasText: "enregistrement automatique, même hors ligne" }),
  ).toBeVisible();
  expect(sent).toEqual(["seed-child-kofi", "seed-child-esther"]);

  await page.reload();
  await expect(field(/Moyenne Esther/)).toHaveValue("12,5");
  await expect(field(/Moyenne Kofi/)).toHaveValue("10");
});

test("après déconnexion, rien ne reste sur le poste, même hors ligne", async ({
  browser,
}, testInfo) => {
  // Une session à part : se déconnecter révoque la session, que les autres tests partagent.
  const baseURL = testInfo.project.use.baseURL!;
  const storageState = await saveSession(baseURL, KOFFI, testInfo.outputPath("koffi-a-part.json"));
  const context = await browser.newContext({
    storageState,
    baseURL,
    viewport: testInfo.project.use.viewport ?? undefined,
    serviceWorkers: "allow",
  });
  const page = await context.newPage();
  await page.goto("/relais");
  await offlineReady(page);
  // La file a été ouverte : la base existe avant la déconnexion.
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some((db) => db.name === "parrainage-outbox"),
      ),
    )
    .toBe(true);

  if (isMobile()) {
    await page.goto("/relais/profil");
    await page.getByRole("button", { name: "Se déconnecter" }).click();
  } else {
    await page
      .getByRole("button", { name: /M\. Koffi/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
  }
  await expect(page).toHaveURL(/\/connexion/);

  const left = await page.evaluate(async () => ({
    caches: await caches.keys(),
    workers: (await navigator.serviceWorker.getRegistrations()).length,
    databases: (await indexedDB.databases()).map((db) => db.name),
  }));
  expect(left.caches).toEqual([]);
  expect(left.workers).toBe(0);
  expect(left.databases).not.toContain("parrainage-outbox");

  await context.setOffline(true);
  for (const path of ["/relais", "/relais/publier", "/parrain", "/bureau", "/eleve"]) {
    await expect(page.goto(path), path).rejects.toThrow();
  }
  await context.close();
});
