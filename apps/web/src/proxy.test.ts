// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("proxy", () => {
  it.each([
    ["/parrain", "/connexion?next=%2Fparrain"],
    ["/relais/enfants", "/connexion?next=%2Frelais%2Fenfants"],
    ["/bureau?onglet=file", "/connexion?next=%2Fbureau%3Fonglet%3Dfile"],
  ])("renvoie %s sans cookie vers la connexion", (path, location) => {
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost:3000${location}`);
  });

  it.each(["better-auth.session_token=abc.def", "__Secure-better-auth.session_token=abc.def"])(
    "laisse passer un espace avec le cookie %s",
    (cookie) => {
      const response = proxy(request("/parrain", cookie));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it.each(["/", "/connexion", "/decouvrir", "/parrainage"])("ne touche pas à %s", (path) => {
    expect(proxy(request(path)).headers.get("location")).toBeNull();
  });
});

describe("matcher du proxy", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each(["/", "/parrain", "/relais/enfants", "/connexion", "/apiculture"])(
    "couvre %s",
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );

  it.each([
    "/api",
    "/api/auth/get-session",
    "/_next/static/chunks/a.js",
    "/_next/image",
    "/favicon.ico",
    "/sw.js",
    "/relais.webmanifest",
    "/icons/192.png",
    "/dev/ui/parrain",
  ])("exclut %s", (path) => {
    expect(matcher.test(path)).toBe(false);
  });
});
