import { childCodeImages } from "@parrainage/contracts";
import {
  canUploadKind,
  childRights,
  deviceTokenMatches,
  hashDeviceToken,
  newDeviceToken,
  readChildToken,
  readDeviceToken,
  sessionCookieOptions,
  shuffledImages,
  signChildToken,
  signDeviceToken,
} from "./child-session.js";

const SECRET = "x".repeat(40);
const at = new Date("2026-10-31T10:00:00Z");
const expiresAt = new Date("2026-10-31T10:45:00Z");
const times = { at, expiresAt };

describe("jetons de session élève", () => {
  it("relit un jeton de poste valide, puis le refuse à son expiration", async () => {
    const token = await signDeviceToken({ sid: "s1", dev: "d1" }, times, SECRET);
    expect(await readDeviceToken(token, SECRET, at)).toMatchObject({ sid: "s1", dev: "d1" });
    expect(await readDeviceToken(token, SECRET, new Date("2026-10-31T10:44:00Z"))).not.toBeNull();
    expect(await readDeviceToken(token, SECRET, new Date("2026-10-31T10:45:01Z"))).toBeNull();
  });

  it("suit l'horloge de l'application, pas celle de la machine", async () => {
    const past = {
      at: new Date("2020-01-01T10:00:00Z"),
      expiresAt: new Date("2020-01-01T10:30:00Z"),
    };
    const token = await signDeviceToken({ sid: "s1", dev: "d1" }, past, SECRET);
    expect(await readDeviceToken(token, SECRET, past.at)).not.toBeNull();
    expect(await readDeviceToken(token, SECRET, new Date())).toBeNull();
  });

  it("refuse un jeton signé avec un autre secret", async () => {
    const token = await signDeviceToken({ sid: "s1", dev: "d1" }, times, "y".repeat(40));
    expect(await readDeviceToken(token, SECRET, at)).toBeNull();
  });

  it("ne confond pas le cookie du poste et celui de l'enfant", async () => {
    const device = await signDeviceToken({ sid: "s1", dev: "d1" }, times, SECRET);
    const child = await signChildToken({ sub: "c1", sid: "s1", dev: "d1" }, times, SECRET);
    expect(await readChildToken(device, SECRET, at)).toBeNull();
    expect(await readDeviceToken(child, SECRET, at)).toBeNull();
    expect(await readChildToken(child, SECRET, at)).toMatchObject({ sub: "c1", sid: "s1" });
  });

  it("refuse un jeton mal formé", async () => {
    expect(await readChildToken("pas-un-jeton", SECRET, at)).toBeNull();
  });
});

describe("jeton du poste", () => {
  it("tire un jeton différent à chaque fois et n'en garde que l'empreinte", () => {
    const token = newDeviceToken();
    expect(token).not.toBe(newDeviceToken());
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    const hash = hashDeviceToken(token);
    expect(hash).not.toContain(token);
    expect(deviceTokenMatches(token, hash)).toBe(true);
    expect(deviceTokenMatches(newDeviceToken(), hash)).toBe(false);
  });
});

describe("cookies", () => {
  it("sont réservés au serveur, au site et à la durée de la session", () => {
    expect(sessionCookieOptions(times, true)).toEqual({
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 45 * 60_000,
    });
    expect(sessionCookieOptions(times, false).secure).toBe(false);
  });

  it("n'ont pas de durée négative", () => {
    expect(sessionCookieOptions({ at: expiresAt, expiresAt: at }, true).maxAge).toBe(0);
  });
});

describe("ordre des images", () => {
  it("contient toujours les 6 images", () => {
    expect([...shuffledImages()].sort()).toEqual([...childCodeImages].sort());
  });

  it("change à chaque essai", () => {
    let shown = shuffledImages();
    for (let tries = 0; tries < 200; tries += 1) {
      const next = shuffledImages(shown);
      expect(next).not.toEqual(shown);
      shown = next;
    }
  });
});

describe("droits d'un enfant", () => {
  const session = { writeSponsor: true, media: true, bulletin: true, writeAssociation: false };

  it("retire photo et vidéo sans consentement médias", () => {
    expect(childRights(session, { consentMedia: false }).media).toBe(false);
    expect(childRights(session, { consentMedia: false }).bulletin).toBe(true);
    expect(childRights(session, { consentMedia: true }).media).toBe(true);
  });

  it("n'accorde jamais ce que la session refuse", () => {
    expect(childRights({ ...session, media: false }, { consentMedia: true }).media).toBe(false);
  });

  it("borne les types de fichiers aux droits", () => {
    const none = { writeSponsor: true, media: false, bulletin: false, writeAssociation: true };
    expect(canUploadKind(none, "PHOTO")).toBe(false);
    expect(canUploadKind(none, "VIDEO")).toBe(false);
    expect(canUploadKind(none, "DOCUMENT")).toBe(false);
    const bulletin = { ...none, bulletin: true };
    expect(canUploadKind(bulletin, "PHOTO")).toBe(true);
    expect(canUploadKind(bulletin, "DOCUMENT")).toBe(true);
    expect(canUploadKind(bulletin, "VIDEO")).toBe(false);
    const media = { ...none, media: true };
    expect(canUploadKind(media, "VIDEO")).toBe(true);
    expect(canUploadKind(media, "DOCUMENT")).toBe(false);
  });
});
