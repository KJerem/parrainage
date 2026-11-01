import { adminClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Client Better Auth du navigateur. Il appelle /api/auth/* sur l'origine du web : la réécriture
 * Next transmet la requête à l'API et rend ses `Set-Cookie` au navigateur. Toutes les mutations
 * d'authentification passent donc par lui (un cookie reçu de serveur à serveur serait perdu).
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [adminClient(), magicLinkClient()],
});
