import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import {
  type ChildCodeImage,
  childCodeImages,
  type ClassSessionRights,
} from "@parrainage/contracts";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

// Session élève (plan §4.4), hors Better Auth : deux cookies httpOnly signés, liés au même poste
// et qui expirent avec la session. Le cookie du poste seul ne connecte aucun enfant, celui d'un
// enfant ne sert à rien sans le cookie du poste : le copier sur un autre appareil ne suffit pas.

export const DEVICE_COOKIE = "kd_device";
export const CHILD_COOKIE = "kd_child";

const ALGORITHM = "HS256";
const DEVICE_AUDIENCE = "poste";
const CHILD_AUDIENCE = "eleve";

const keyOf = (secret: string) => new TextEncoder().encode(secret);

/** Jeton du poste : 32 octets aléatoires ; la base n'en garde que l'empreinte. */
export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function deviceTokenMatches(token: string, storedHash: string): boolean {
  const received = Buffer.from(hashDeviceToken(token));
  const expected = Buffer.from(storedHash);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const sign = (
  claims: Record<string, string>,
  audience: string,
  times: { at: Date; expiresAt: Date },
  secret: string,
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM })
    .setAudience(audience)
    .setIssuedAt(times.at)
    .setExpirationTime(times.expiresAt)
    .sign(keyOf(secret));

/** Contenu vérifié (signature, public, expiration à l'heure de l'application), sinon `null`. */
async function read<T>(
  token: string,
  audience: string,
  schema: z.ZodType<T>,
  secret: string,
  at: Date,
): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), {
      audience,
      algorithms: [ALGORITHM],
      currentDate: at,
    });
    const parsed = schema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const deviceClaims = z.object({ sid: z.string().min(1), dev: z.string().min(1) });

export type DeviceClaims = z.infer<typeof deviceClaims>;

export function signDeviceToken(
  claims: DeviceClaims,
  times: { at: Date; expiresAt: Date },
  secret: string,
): Promise<string> {
  return sign(claims, DEVICE_AUDIENCE, times, secret);
}

export function readDeviceToken(
  token: string,
  secret: string,
  at: Date,
): Promise<DeviceClaims | null> {
  return read(token, DEVICE_AUDIENCE, deviceClaims, secret, at);
}

const childClaims = deviceClaims.extend({ sub: z.string().min(1) });

export type ChildClaims = z.infer<typeof childClaims>;

export function signChildToken(
  claims: ChildClaims,
  times: { at: Date; expiresAt: Date },
  secret: string,
): Promise<string> {
  return sign(claims, CHILD_AUDIENCE, times, secret);
}

export function readChildToken(
  token: string,
  secret: string,
  at: Date,
): Promise<ChildClaims | null> {
  return read(token, CHILD_AUDIENCE, childClaims, secret, at);
}

/**
 * Attributs des deux cookies. `Max-Age` plutôt qu'une date : le navigateur suit sa propre horloge,
 * alors que `endsAt` suit celle de l'application (figée en démonstration et dans les tests).
 */
export function sessionCookieOptions(
  times: { at: Date; expiresAt: Date },
  secure: boolean,
): {
  httpOnly: true;
  sameSite: "strict";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: Math.max(0, times.expiresAt.getTime() - times.at.getTime()),
  };
}

const sameOrder = (a: readonly ChildCodeImage[], b: readonly ChildCodeImage[]) =>
  a.length === b.length && a.every((image, index) => image === b[index]);

/**
 * Les 6 images dans un ordre tiré par le générateur cryptographique (Fisher-Yates), différent de
 * `shown` : un enfant qui se trompe ne retrouve pas ses images au même endroit.
 */
export function shuffledImages(shown?: readonly ChildCodeImage[]): ChildCodeImage[] {
  for (;;) {
    const images = [...childCodeImages] as ChildCodeImage[];
    for (let index = images.length - 1; index > 0; index -= 1) {
      const swap = randomInt(index + 1);
      [images[index], images[swap]] = [images[swap]!, images[index]!];
    }
    if (!shown || !sameOrder(images, shown)) {
      return images;
    }
  }
}

/** Sans consentement médias, ni photo ni vidéo, quels que soient les droits de la session. */
export function childRights(
  session: ClassSessionRights,
  child: { consentMedia: boolean },
): ClassSessionRights {
  return { ...session, media: session.media && child.consentMedia };
}

/** Droit d'envoyer ce type de fichier pendant la session. */
export function canUploadKind(rights: ClassSessionRights, kind: string): boolean {
  switch (kind) {
    case "PHOTO":
      return rights.media || rights.bulletin;
    case "VIDEO":
      return rights.media;
    case "DOCUMENT":
      return rights.bulletin;
    default:
      return false;
  }
}
