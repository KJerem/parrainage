import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import {
  CHILD_COOKIE,
  ELEVE_HOME,
  isChildPath,
  isProtectedPath,
  loginPath,
} from "@/lib/auth-paths";

/**
 * Redirection optimiste : un espace adulte sans cookie de session renvoie vers la connexion.
 * La présence du cookie suffit ici ; les layouts vérifient la session et le rôle auprès de l'API.
 * De même, une page d'enfant sans cookie d'enfant renvoie vers l'écran de connexion du poste.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isChildPath(pathname)) {
    return request.cookies.has(CHILD_COOKIE)
      ? NextResponse.next()
      : NextResponse.redirect(new URL(ELEVE_HOME, request.url));
  }
  if (!isProtectedPath(pathname) || getSessionCookie(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL(loginPath(`${pathname}${search}`), request.url));
}

export const config = {
  // Ni l'API (réécrite vers NestJS), ni les fichiers statiques, ni le guide de style.
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon\\.ico|sw\\.js|relais\\.webmanifest|icons/|dev/ui).*)",
  ],
};
