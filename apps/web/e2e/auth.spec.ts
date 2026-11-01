import { expect, test, type Page } from "@playwright/test";
import { expectNoBlockingViolations } from "./axe";
import { extractLink, knownMessages, waitForMessage } from "./mailpit";

// Comptes du seed (apps/api/prisma/seed/data.ts), mot de passe commun « motdepasse ».
const PASSWORD = "motdepasse";
const projects = ["desktop-1440", "mobile-390"];

// Une adresse par projet quand un test consomme une limite par e-mail (5 connexions par
// minute, 3 liens par 5 minutes) : deux passages rapprochés restent sous les seuils.
function perProject(desktop: string, mobile: string) {
  return test.info().project.name === "desktop-1440" ? desktop : mobile;
}

/** Ouvre la page et attend que React ait pris la main sur le formulaire. */
async function gotoForm(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => {
    const form = document.querySelector("main form");
    return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
  });
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await gotoForm(page, "/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Accéder à mon espace" }).click();
}

async function expectNoOverflow(page: Page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits, "la page ne doit pas défiler horizontalement").toBe(true);
}

test.describe("Authentification", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!projects.includes(testInfo.project.name), "desktop-1440 et mobile-390 seulement");
  });

  test("un visiteur est renvoyé vers la connexion avec sa destination", async ({ page }) => {
    for (const space of ["/parrain", "/relais", "/bureau"]) {
      await page.goto(space);
      await expect(page).toHaveURL(`/connexion?next=${encodeURIComponent(space)}`);
    }
    await page.goto("/parrain/compte");
    await expect(page).toHaveURL("/connexion?next=%2Fparrain%2Fcompte");

    await page.goto("/");
    await expect(page).toHaveURL("/connexion");
    await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByLabel("Adresse e-mail")).toHaveValue("");
    await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveValue("");

    await page.goto("/connexion?espace=relais");
    await expect(page.getByText("Espace réservé aux relais de l'association.")).toBeVisible();
  });

  test("Claire arrive dans l'espace parrain", async ({ page }) => {
    await signIn(page, "claire.m@exemple.fr");
    await expect(page).toHaveURL("/parrain");
    await expect(page.getByRole("heading", { level: 1, name: "Vos filleuls" })).toBeVisible();
    await expect(page.getByRole("button", { name: "CM, mon compte" })).toBeVisible();
    await expect(page.getByText("Bonjour Claire")).toBeVisible();
    await expectNoBlockingViolations(page);
    await expectNoOverflow(page);

    // Connectée, la page de connexion renvoie vers son espace.
    await page.goto("/connexion");
    await expect(page).toHaveURL("/parrain");

    await page.goto("/parrain/compte");
    await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
    await expect(page.getByText("claire.m@exemple.fr")).toBeVisible();
    await expect(page.getByText("Parrain ou marraine")).toBeVisible();
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
    await expectNoBlockingViolations(page);
    await expectNoOverflow(page);
  });

  test("M. Koffi arrive dans l'espace relais", async ({ page }) => {
    await signIn(page, "koffi@relais.exemple.tg");
    await expect(page).toHaveURL("/relais");
    if (test.info().project.name === "mobile-390") {
      // En-tête vert de l'appli relais : il porte le titre de la page.
      await expect(page.getByRole("heading", { level: 1, name: "Bonjour M. Koffi" })).toBeVisible();
      await expect(page.getByText("Relais · Lomé, quartier Bè")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Navigation" })).toBeVisible();
    } else {
      // Barre latérale (le même panneau existe, masqué, dans le tiroir).
      const visible = { visible: true } as const;
      await expect(page.getByText("Espace relais", { exact: true }).filter(visible)).toBeVisible();
      await expect(page.getByText("M. Koffi · Lomé, Bè").filter(visible)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Bonjour M. Koffi" })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expectNoBlockingViolations(page);
    await expectNoOverflow(page);
  });

  test("le bureau arrive sur sa vue d'ensemble", async ({ page }) => {
    await signIn(page, "bureau@exemple.fr");
    await expect(page).toHaveURL("/bureau");
    await expect(page.getByRole("heading", { level: 1, name: "Vue d'ensemble" })).toBeVisible();
    await expectNoBlockingViolations(page);
    await expectNoOverflow(page);
  });

  test("un parrain qui ouvre l'espace bureau reçoit « Accès refusé »", async ({ page }) => {
    await signIn(page, "paul.d@exemple.fr");
    await expect(page).toHaveURL("/parrain");
    await page.goto("/bureau");
    await expect(page).toHaveURL("/interdit");
    await expect(page.getByRole("heading", { level: 1, name: "Accès refusé" })).toBeVisible();
    await page.goto("/relais");
    await expect(page).toHaveURL("/interdit");
    await page.getByRole("link", { name: "Retour à mon espace" }).click();
    await expect(page).toHaveURL("/parrain");
  });

  test("un mauvais mot de passe affiche une erreur dans la page", async ({ page }) => {
    await signIn(page, "marc.p@exemple.fr", "mauvais-mot-de-passe");
    await expect(
      page.getByRole("alert").filter({ hasText: "Adresse e-mail ou mot de passe incorrect." }),
    ).toBeVisible();
    await expect(page).toHaveURL("/connexion");
    await expect(page.getByLabel("Mot de passe", { exact: true })).toBeFocused();
  });

  test("au-delà de 5 essais par minute, la connexion est suspendue", async ({ page }) => {
    const email = perProject("parrain20@exemple.fr", "parrain21@exemple.fr");
    await gotoForm(page, "/connexion");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("mauvais-mot-de-passe");
    const limited = page
      .getByRole("alert")
      .filter({ hasText: "Trop de tentatives. Réessayez dans quelques minutes." });
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const answered = page.waitForResponse((r) => r.url().endsWith("/api/auth/sign-in/email"));
      await page.getByRole("button", { name: "Accéder à mon espace" }).click();
      if ((await answered).status() === 429) {
        break;
      }
    }
    await expect(limited).toBeVisible();
  });

  test("le lien magique reçu par e-mail ouvre la session, une seule fois", async ({
    page,
    browser,
  }) => {
    const email = perProject("claire.m@exemple.fr", "sophie.l@exemple.fr");
    const known = await knownMessages(email);
    await gotoForm(page, "/connexion");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByRole("button", { name: "Recevoir un lien par e-mail" }).click();
    await expect(page.getByRole("heading", { name: "Recevoir un lien par e-mail" })).toBeFocused();
    await page.getByRole("button", { name: "Recevoir le lien" }).click();
    await expect(
      page.getByText(`Un lien de connexion vient d'être envoyé à ${email}.`),
    ).toBeVisible();

    const mail = await waitForMessage(email, known);
    expect(mail.subject).toBe("Votre lien de connexion");
    const link = extractLink(mail.text, "/api/auth/magic-link/verify");
    await page.goto(link);
    await expect(page).toHaveURL("/parrain");
    await expect(page.getByRole("heading", { level: 1, name: "Vos filleuls" })).toBeVisible();

    // Déjà utilisé : un autre navigateur revient sur la connexion avec un message.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(link);
    await expect(otherPage).toHaveURL(/\/connexion\?error=INVALID_TOKEN$/);
    await expect(
      otherPage.getByRole("alert").filter({ hasText: "Ce lien de connexion n'est plus valable" }),
    ).toBeVisible();
    await other.close();
  });

  test("le mot de passe oublié se réinitialise via le lien reçu", async ({ page }) => {
    const email = perProject("parrain22@exemple.fr", "parrain23@exemple.fr");
    const unknown = perProject("inconnu-1440@exemple.fr", "inconnu-390@exemple.fr");
    const newPassword = "nouveau-mot-de-passe";

    // Adresse inconnue : même confirmation, aucun e-mail.
    const knownUnknown = await knownMessages(unknown);
    await gotoForm(page, "/mot-de-passe-oublie");
    await page.getByLabel("Adresse e-mail").fill(unknown);
    await page.getByRole("button", { name: "Recevoir le lien" }).click();
    await expect(page.getByText(`Si un compte correspond à ${unknown}`)).toBeVisible();

    const known = await knownMessages(email);
    await gotoForm(page, "/connexion");
    await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
    await expect(page).toHaveURL("/mot-de-passe-oublie");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByRole("button", { name: "Recevoir le lien" }).click();
    await expect(page.getByText(`Si un compte correspond à ${email}`)).toBeVisible();

    const mail = await waitForMessage(email, known);
    expect(mail.subject).toBe("Réinitialisation de votre mot de passe");
    await page.goto(extractLink(mail.text, "/api/auth/reset-password/"));
    await expect(page).toHaveURL(/\/reinitialiser-mot-de-passe\?token=/);
    await page.waitForFunction(() =>
      Object.keys(document.querySelector("main form") ?? {}).some((key) =>
        key.startsWith("__reactProps"),
      ),
    );
    await page.getByLabel("Nouveau mot de passe").fill(newPassword);
    await page.getByLabel("Confirmer le mot de passe").fill("autre-chose");
    await page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
    await expect(page.getByText("Les deux mots de passe ne correspondent pas.")).toBeVisible();
    await page.getByLabel("Confirmer le mot de passe").fill(newPassword);
    await page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
    await expect(page.getByRole("heading", { name: "Mot de passe modifié" })).toBeVisible();

    await signIn(page, email, newPassword);
    await expect(page).toHaveURL("/parrain");
    expect((await knownMessages(unknown)).size).toBe(knownUnknown.size);
  });

  test("la déconnexion du menu de compte ferme la session", async ({ page, context }) => {
    await signIn(page, "helene.r@exemple.fr");
    await expect(page).toHaveURL("/parrain");
    const sessionCookies = (await context.cookies())
      .filter((cookie) => cookie.name.includes("better-auth"))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    expect(sessionCookies).toContain("better-auth.session_token=");

    await page.getByRole("button", { name: "HR, mon compte" }).click();
    await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL("/connexion");
    expect((await context.cookies()).some((c) => c.name.includes("session_token"))).toBe(false);

    await page.goto("/parrain");
    await expect(page).toHaveURL("/connexion?next=%2Fparrain");

    // La session est révoquée côté API, pas seulement oubliée par le navigateur.
    const me = await page.request.get("/api/me", { headers: { cookie: sessionCookies } });
    expect(me.status()).toBe(401);
  });
});
