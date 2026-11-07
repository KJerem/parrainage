import { NextResponse, type NextRequest } from "next/server";
import { api, appOrigin } from "@/lib/api.server";
import { LOGIN_PATH } from "@/lib/auth-paths";

const AUTH_COOKIE = /^(__Secure-)?better-auth\./;
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

/**
 * Déconnexion sans JavaScript : formulaire POST du menu de compte. La session est révoquée
 * auprès de l'API, puis les cookies de Better Auth sont effacés et le visiteur renvoyé (303)
 * vers la connexion.
 */
export async function POST(request: NextRequest) {
  // Un formulaire d'un autre site ne doit pas pouvoir déconnecter le visiteur.
  const origin = request.headers.get("origin");
  if (origin && origin !== appOrigin && origin !== request.nextUrl.origin) {
    return new NextResponse("Requête refusée.", { status: 403 });
  }

  const authCookies = request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) => AUTH_COOKIE.test(name));

  if (authCookies.length > 0) {
    try {
      const response = await api("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        console.error(`Déconnexion : l'API a répondu ${response.status}`);
      }
    } catch (error) {
      // API injoignable : la session expirera d'elle-même, les cookies sont effacés quand même.
      console.error("Déconnexion : API injoignable", error);
    }
  }

  // Location relative : valable derrière un tunnel ou un proxy inverse.
  // « storage » : caches, IndexedDB et service worker (https ou localhost) ; rien n'est gardé sur
  // le poste, même si le JavaScript de la page n'a pas pu faire la purge.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: LOGIN_PATH, "Clear-Site-Data": '"storage"' },
  });
  for (const name of new Set([...SESSION_COOKIES, ...authCookies])) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
    });
  }
  return response;
}
