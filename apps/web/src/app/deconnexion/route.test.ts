// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn<(path: string, init?: RequestInit) => Promise<Response>>());

vi.mock("@/lib/api.server", () => ({ api, appOrigin: "http://localhost:3000" }));

const { POST } = await import("./route");

function logout(headers: Record<string, string> = {}) {
  return POST(new NextRequest("http://localhost:3000/deconnexion", { method: "POST", headers }));
}

function clearedCookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split("=")[0])
    .sort();
}

describe("POST /deconnexion", () => {
  it("demande au navigateur d'effacer ce qu'il garde, même sans JavaScript", async () => {
    const response = await logout({ origin: "http://localhost:3000" });
    expect(response.headers.get("clear-site-data")).toBe('"storage"');
  });

  beforeEach(() => {
    api.mockReset();
    api.mockResolvedValue(new Response('{"success":true}', { status: 200 }));
  });

  it("révoque la session, efface les cookies et renvoie vers la connexion (303)", async () => {
    const response = await logout({
      origin: "http://localhost:3000",
      cookie: "better-auth.session_token=abc.def; better-auth.session_data=xyz; autre=1",
    });

    expect(api).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST" }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/connexion");
    expect(clearedCookies(response)).toEqual([
      "__Secure-better-auth.session_token",
      "better-auth.session_data",
      "better-auth.session_token",
    ]);
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toMatch(/Max-Age=0/);
    }
  });

  it("n'appelle pas l'API sans cookie de session", async () => {
    const response = await logout({ origin: "http://localhost:3000" });
    expect(api).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(clearedCookies(response)).toContain("better-auth.session_token");
  });

  it("efface les cookies même si l'API est injoignable", async () => {
    api.mockRejectedValue(new TypeError("fetch failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await logout({ cookie: "better-auth.session_token=abc.def" });
    expect(response.status).toBe(303);
    expect(clearedCookies(response)).toContain("better-auth.session_token");
    consoleError.mockRestore();
  });

  it("refuse un formulaire venu d'un autre site", async () => {
    const response = await logout({
      origin: "https://exemple.com",
      cookie: "better-auth.session_token=abc.def",
    });
    expect(response.status).toBe(403);
    expect(api).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
