import fs from "node:fs";
import path from "node:path";
import { test as base, expect, request, type WorkerInfo } from "@playwright/test";

// Comptes du seed (apps/api/prisma/seed/data.ts), mot de passe commun « motdepasse ».
export const PASSWORD = "motdepasse";
export const CLAIRE = "claire.m@exemple.fr";
export const KOFFI = "koffi@relais.exemple.tg";
export const PAUL = "paul.d@exemple.fr";
export const BUREAU = "bureau@exemple.fr";

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
 * Session d'un compte du seed, ouverte une fois par projet et par exécution (le dossier
 * test-results est vidé au lancement), loin de la limite de 5 essais par minute : les workers
 * suivants et chaque test la réutilisent.
 */
async function workerSession(email: string, slug: string, workerInfo: WorkerInfo) {
  const { baseURL } = workerInfo.project.use;
  if (!baseURL) {
    throw new Error("baseURL manquante dans playwright.config.ts");
  }
  const file = path.join(
    workerInfo.project.outputDir,
    ".auth",
    `${slug}-${workerInfo.project.name}.json`,
  );
  return fs.existsSync(file) ? file : saveSession(baseURL, email, file);
}

type Sessions = {
  claireState: string;
  koffiState: string;
  paulState: string;
  bureauState: string;
};

// Second argument nommé `provide` (et non `use`) : la règle des hooks React le confondrait.
const sessions = base.extend<object, Sessions>({
  claireState: [
    async ({}, provide, workerInfo) => provide(await workerSession(CLAIRE, "claire", workerInfo)),
    { scope: "worker" },
  ],
  koffiState: [
    async ({}, provide, workerInfo) => provide(await workerSession(KOFFI, "koffi", workerInfo)),
    { scope: "worker" },
  ],
  paulState: [
    async ({}, provide, workerInfo) => provide(await workerSession(PAUL, "paul", workerInfo)),
    { scope: "worker" },
  ],
  bureauState: [
    async ({}, provide, workerInfo) => provide(await workerSession(BUREAU, "bureau", workerInfo)),
    { scope: "worker" },
  ],
});

/** Tests de l'espace parrain : la page est ouverte avec la session de Claire. */
export const test = sessions.extend({
  storageState: ({ claireState }, provide) => provide(claireState),
});

/** Tests de l'espace relais : la page est ouverte avec la session de M. Koffi. */
export const relaisTest = sessions.extend({
  storageState: ({ koffiState }, provide) => provide(koffiState),
});

/** Tests de l'espace bureau : la page est ouverte avec la session du bureau. */
export const bureauTest = sessions.extend({
  storageState: ({ bureauState }, provide) => provide(bureauState),
});

export { expect };
