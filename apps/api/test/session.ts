import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { emailAttemptKey } from "../src/auth/attempt-limit.js";
import { prisma } from "../src/prisma/client.js";
import { sessionCookie, WEB_ORIGIN } from "./app.js";

// Comptes du seed (base seedée requise : `npm run db:seed`).
export const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "motdepasse";

export const ACCOUNTS = {
  claire: "claire.m@exemple.fr",
  paul: "paul.d@exemple.fr",
  helene: "helene.r@exemple.fr",
  marc: "marc.p@exemple.fr",
  sophie: "sophie.l@exemple.fr",
  koffi: "koffi@relais.exemple.tg",
  diallo: "diallo@relais.exemple.tg",
  bureau: "bureau@exemple.fr",
} as const;

export type Account = keyof typeof ACCOUNTS;

/** Cookies de session de chaque compte (compteurs de connexion remis à zéro avant). */
export async function signInAll(
  app: INestApplication,
  accounts: readonly Account[],
): Promise<Record<Account, string>> {
  await prisma.rateLimit.deleteMany({
    where: {
      key: { in: accounts.map((a) => emailAttemptKey("/sign-in/email", ACCOUNTS[a])) },
    },
  });
  const cookies = {} as Record<Account, string>;
  for (const account of accounts) {
    const res = await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .set("Origin", WEB_ORIGIN)
      .send({ email: ACCOUNTS[account], password: PASSWORD })
      .expect(200);
    const cookie = sessionCookie(res.headers["set-cookie"]);
    if (!cookie) {
      throw new Error(`Pas de cookie de session pour ${ACCOUNTS[account]}`);
    }
    cookies[account] = cookie;
  }
  return cookies;
}

/** Identifiant de l'utilisateur d'un compte du seed. */
export async function userIdOf(account: Account): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: ACCOUNTS[account] },
    select: { id: true },
  });
  return user.id;
}
