import {
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importSPKI,
  jwtVerify,
  decodeProtectedHeader,
} from "jose";
import { callIcs } from "./ics.js";
import { jaasToken, visioState } from "./visio.service.js";

const startsAt = new Date("2026-11-05T17:00:00Z");
const call = (overrides: Partial<Parameters<typeof visioState>[0]> = {}) => ({
  startsAt,
  durationMinutes: 30,
  status: "SCHEDULED",
  joinedRelaisAt: null,
  ...overrides,
});
const at = (iso: string) => new Date(iso);

describe("visioState", () => {
  it("n'ouvre la salle que 10 minutes avant", () => {
    expect(visioState(call(), "relais", at("2026-11-05T16:49:59Z"), 10)).toBe("early");
    expect(visioState(call(), "relais", at("2026-11-05T16:50:00Z"), 10)).toBe("open");
  });

  it("fait attendre le parrain jusqu'à l'arrivée du relais", () => {
    expect(visioState(call(), "parrain", at("2026-11-05T16:55:00Z"), 10)).toBe("waiting");
    expect(
      visioState(
        call({ joinedRelaisAt: at("2026-11-05T16:56:00Z") }),
        "parrain",
        at("2026-11-05T16:57:00Z"),
        10,
      ),
    ).toBe("open");
  });

  it("ferme la salle 15 minutes après la fin prévue, ou quand l'appel n'a plus lieu", () => {
    expect(visioState(call(), "relais", at("2026-11-05T17:44:59Z"), 10)).toBe("open");
    expect(visioState(call(), "relais", at("2026-11-05T17:45:00Z"), 10)).toBe("closed");
    expect(
      visioState(call({ status: "CANCELLED" }), "relais", at("2026-11-05T17:00:00Z"), 10),
    ).toBe("closed");
  });
});

describe("jeton JaaS", () => {
  it("est signé en RS256, limité à la salle, et ne fait modérateur que le relais", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const config = {
      appId: "vpaas-magic-cookie-test",
      keyId: "vpaas-magic-cookie-test/4f4910",
      // Comme dans un fichier .env : la clé sur une ligne, retours à la ligne écrits « \n ».
      privateKey: pem.replaceAll("\n", "\\n"),
    };
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const token = await jaasToken(config, {
      roomName: "lrt-abc",
      userId: "u1",
      name: "M. Koffi",
      moderator: true,
      expiresAt,
    });
    expect(decodeProtectedHeader(token)).toEqual({
      alg: "RS256",
      kid: "vpaas-magic-cookie-test/4f4910",
      typ: "JWT",
    });
    const { payload } = await jwtVerify(
      token,
      await importSPKI(await exportSPKI(publicKey), "RS256"),
      {
        audience: "jitsi",
        issuer: "chat",
        subject: "vpaas-magic-cookie-test",
      },
    );
    expect(payload.room).toBe("lrt-abc");
    expect(payload.exp).toBe(Math.floor(expiresAt.getTime() / 1000));
    expect(payload.context).toEqual({
      user: { id: "u1", name: "M. Koffi", moderator: "true" },
      features: {
        livestreaming: "false",
        recording: "false",
        transcription: "false",
        "outbound-call": "false",
        "sip-outbound-call": "false",
      },
    });

    const parrain = await jaasToken(config, {
      roomName: "lrt-abc",
      userId: "u2",
      name: "Claire M.",
      moderator: false,
      expiresAt,
    });
    const { payload: parrainPayload } = await jwtVerify(
      parrain,
      await importSPKI(await exportSPKI(publicKey), "RS256"),
    );
    expect((parrainPayload.context as { user: { moderator: string } }).user.moderator).toBe(
      "false",
    );
  });
});

describe("fichier agenda", () => {
  it("donne l'heure UTC, la durée et le lien, sans rien dire de l'enfant", () => {
    const ics = callIcs({
      id: "call-1",
      startsAt,
      durationMinutes: 30,
      url: "http://localhost:3000/parrain/appels/call-1",
      earlyMinutes: 10,
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:call-1@parrainage-lrt");
    expect(ics).toContain("DTSTART:20261105T170000Z");
    expect(ics).toContain("DURATION:PT30M");
    expect(ics).toContain("SUMMARY:Appel vidéo · Parrainage LRT");
    expect(ics.replace(/\r\n /g, "")).toContain("http://localhost:3000/parrain/appels/call-1");
  });
});
