import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import {
  CHILD_CODE_LENGTH,
  type ChildCode,
  childCodeImages,
  childCodeSchema,
} from "@parrainage/contracts";

// Code image d'un enfant (plan §8) : 3 images ordonnées parmi 6, tirées par le serveur, hachées en
// Argon2id avec un poivre. Il ne se relit jamais : le relais le voit une fois, sur la carte.

const HASH_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Une proposition de code reste utilisable ce temps-là (formulaire laissé ouvert). */
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;

/** Tirage sans remise, par le générateur cryptographique. */
export function randomChildCode(): ChildCode {
  const pool = [...childCodeImages];
  const images: ChildCode = [];
  for (let drawn = 0; drawn < CHILD_CODE_LENGTH; drawn += 1) {
    images.push(pool.splice(randomInt(pool.length), 1)[0]!);
  }
  return images;
}

const secretOf = (pepper: string) => Buffer.from(pepper, "utf8");

const signature = (payload: string, pepper: string) =>
  createHmac("sha256", pepper).update(payload).digest("base64url");

/** Jeton d'une proposition : le navigateur la renvoie sans pouvoir en choisir une autre. */
export function signChildCode(images: ChildCode, pepper: string, at: Date): string {
  const payload = `${images.join(".")}.${at.getTime() + PROPOSAL_TTL_MS}`;
  return `${payload}.${signature(payload, pepper)}`;
}

/** Le code d'un jeton valide et non expiré, sinon `null`. */
export function readChildCodeToken(token: string, pepper: string, at: Date): ChildCode | null {
  const separator = token.lastIndexOf(".");
  if (separator < 0) {
    return null;
  }
  const payload = token.slice(0, separator);
  const expected = Buffer.from(signature(payload, pepper));
  const received = Buffer.from(token.slice(separator + 1));
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }
  const parts = payload.split(".");
  const expiresAt = Number(parts.at(-1));
  if (!Number.isFinite(expiresAt) || expiresAt <= at.getTime()) {
    return null;
  }
  const code = childCodeSchema.safeParse(parts.slice(0, -1));
  return code.success ? code.data : null;
}

export function hashChildCode(images: ChildCode, pepper: string): Promise<string> {
  return hash(images.join("-"), { ...HASH_OPTIONS, secret: secretOf(pepper) });
}

export function verifyChildCode(
  storedHash: string,
  images: ChildCode,
  pepper: string,
): Promise<boolean> {
  return verify(storedHash, images.join("-"), { secret: secretOf(pepper) });
}
