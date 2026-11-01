import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, magicLink } from "better-auth/plugins";
import { getEnv } from "../config/env.js";
import { magicLinkEmail, resetPasswordEmail } from "../mail/templates.js";
import { sendMailInBackground } from "../mail/transport.js";
import { prisma } from "../prisma/client.js";
import { emailRateLimit } from "./email-rate-limit.js";
import { ac, roles } from "./permissions.js";

const env = getEnv();

/** Chemin des routes Better Auth, servies par l'API derrière la réécriture /api/* du web. */
export const AUTH_BASE_PATH = "/api/auth";

export const auth = betterAuth({
  appName: "Parrainage LRT",
  // Origine du web (jamais celle de l'API) : liens magiques et redirections en partent,
  // et les cookies restent sans « Secure » en http local.
  baseURL: env.APP_URL,
  basePath: AUTH_BASE_PATH,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Fermé au navigateur : chacun pourrait y changer son nom ou mettre n'importe quelle adresse
  // en photo. Le profil se modifie via l'API métier ; l'appel serveur (auth.api) reste possible.
  disabledPaths: ["/update-user"],
  emailAndPassword: {
    enabled: true,
    // Pas d'inscription libre : les comptes sont créés par le bureau (ou le seed).
    disableSignUp: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    // Envois non attendus (voir sendMailInBackground) : même délai de réponse pour tous.
    sendResetPassword: async ({ user, url }) => {
      sendMailInBackground({ to: user.email, ...resetPasswordEmail(url) });
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    // La réécriture du web n'ajoute pas X-Forwarded-For : ces compteurs par IP sont partagés
    // par tous les visiteurs (et un en-tête envoyé par le navigateur les contourne). Ils ne
    // servent que de filet global ; les limites par adresse e-mail (5 connexions par minute…)
    // sont appliquées par `emailRateLimit`.
    window: 60,
    max: 600,
    customRules: {
      "/sign-in/email": { window: 60, max: 100 },
      "/sign-in/magic-link": { window: 300, max: 100 },
      "/magic-link/verify": { window: 60, max: 100 },
      "/request-password-reset": { window: 300, max: 100 },
    },
  },
  hooks: {
    before: emailRateLimit,
  },
  advanced: {
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    // Better Auth saute le contrôle d'Origin quand NODE_ENV=test : on le garde actif partout
    // pour que les tests e2e vérifient la protection CSRF réelle.
    disableOriginCheck: false,
  },
  plugins: [
    admin({
      ac,
      roles,
      defaultRole: "parrain",
      adminRoles: ["bureau"],
    }),
    magicLink({
      disableSignUp: true,
      expiresIn: 600,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        // Adresse inconnue ou compte suspendu : aucun e-mail, mais la même réponse dans le même
        // délai, l'envoi n'étant pas attendu (pas d'énumération).
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          select: { banned: true, banExpires: true },
        });
        // Une suspension échue ne compte plus (le plugin admin la lève à la connexion).
        const suspended = user?.banned && (!user.banExpires || user.banExpires > new Date());
        if (!user || suspended) {
          return;
        }
        sendMailInBackground({ to: email, ...magicLinkEmail(url) });
      },
    }),
  ],
});

export type Auth = typeof auth;
