import fs from "node:fs";
import path from "node:path";
import { test as base, expect, request } from "@playwright/test";

// Comptes du seed (apps/api/prisma/seed/data.ts), mot de passe commun « motdepasse ».
export const PASSWORD = "motdepasse";
export const CLAIRE = "claire.m@exemple.fr";

/**
 * Ouvre une session comme le formulaire de connexion (POST /api/auth/sign-in/email, avec
 * l'`Origin` du web) et enregistre les cookies obtenus dans `file` (storageState).
 */
export async function saveSession(baseURL: string, email: string, file: string): Promise<string> {
  const context = await request.newContext({ baseURL });
  try {
    const response = await context.post("/api/auth/sign-in/email", {
      data: { email, password: PASSWORD },
      headers: { origin: new URL(baseURL).origin },
    });
    expect(response.status(), `connexion de ${email}`).toBe(200);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await context.storageState({ path: file });
    return file;
  } finally {
    await context.dispose();
  }
}

/**
 * Tests de l'espace parrain : Claire se connecte une fois par projet et par exécution (le
 * dossier test-results est vidé au lancement), loin de la limite de 5 essais par minute ;
 * les workers suivants et chaque test réutilisent sa session.
 */
export const test = base.extend<object, { claireState: string }>({
  claireState: [
    // Second argument nommé `provide` (et non `use`) : la règle des hooks React le confondrait.
    async ({}, provide, workerInfo) => {
      const { baseURL } = workerInfo.project.use;
      if (!baseURL) {
        throw new Error("baseURL manquante dans playwright.config.ts");
      }
      const file = path.join(
        workerInfo.project.outputDir,
        ".auth",
        `claire-${workerInfo.project.name}.json`,
      );
      await provide(fs.existsSync(file) ? file : await saveSession(baseURL, CLAIRE, file));
    },
    { scope: "worker" },
  ],
  storageState: ({ claireState }, provide) => provide(claireState),
});

export { expect };
