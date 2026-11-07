import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ClassSessionRights } from "@parrainage/contracts";
import type { Request, Response } from "express";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { FOLLOWED_STATUSES } from "../relais/relais-common.js";
import {
  CHILD_COOKIE,
  DEVICE_COOKIE,
  deviceTokenMatches,
  readChildToken,
  readDeviceToken,
  sessionCookieOptions,
  signChildToken,
  signDeviceToken,
} from "./child-session.js";

/** Poste reconnu : une session ouverte, à laquelle son cookie est bien lié. */
export interface DeviceContext {
  sessionId: string;
  /** Jeton du poste, repris dans le cookie de l'enfant. */
  dev: string;
  relaisId: string;
  relaisName: string;
  endsAt: Date;
  suspended: boolean;
  rights: ClassSessionRights;
}

/** Enfant connecté sur ce poste, pendant une session qui l'autorise. */
export interface ChildContext extends DeviceContext {
  childId: string;
  firstName: string;
  lastInitial: string;
  avatarTone: string;
  consentMedia: boolean;
}

const sessionSelect = {
  id: true,
  status: true,
  relaisId: true,
  endsAt: true,
  deviceTokenHash: true,
  suspendedAt: true,
  allowWriteSponsor: true,
  allowMedia: true,
  allowBulletin: true,
  allowWriteAssociation: true,
  relais: { select: { displayName: true } },
} as const satisfies Prisma.ClassSessionSelect;

const cookieOf = (request: Request, name: string): string | null => {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === "string" && value !== "" ? value : null;
};

/**
 * Vérifie les cookies élèves à chaque requête, en base : une session fermée, expirée ou suspendue
 * ne vaut plus rien, même avec un cookie encore valide. L'horloge est celle de l'application.
 */
@Injectable()
export class ChildSessionService {
  private readonly secret: string;
  private readonly secure: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get("CHILD_SESSION_SECRET", { infer: true });
    this.secure = config.get("NODE_ENV", { infer: true }) === "production";
  }

  async deviceOf(request: Request): Promise<DeviceContext | null> {
    const token = cookieOf(request, DEVICE_COOKIE);
    if (!token) {
      return null;
    }
    const at = now();
    const claims = await readDeviceToken(token, this.secret, at);
    if (!claims) {
      return null;
    }
    const session = await this.prisma.classSession.findUnique({
      where: { id: claims.sid },
      select: sessionSelect,
    });
    if (
      session?.status !== "OPEN" ||
      !session.endsAt ||
      session.endsAt <= at ||
      !session.deviceTokenHash ||
      !deviceTokenMatches(claims.dev, session.deviceTokenHash)
    ) {
      return null;
    }
    return {
      sessionId: session.id,
      dev: claims.dev,
      relaisId: session.relaisId,
      relaisName: session.relais.displayName,
      endsAt: session.endsAt,
      suspended: session.suspendedAt !== null,
      rights: {
        writeSponsor: session.allowWriteSponsor,
        media: session.allowMedia,
        bulletin: session.allowBulletin,
        writeAssociation: session.allowWriteAssociation,
      },
    };
  }

  async childOf(request: Request): Promise<ChildContext | null> {
    const token = cookieOf(request, CHILD_COOKIE);
    if (!token) {
      return null;
    }
    const device = await this.deviceOf(request);
    if (!device || device.suspended) {
      return null;
    }
    const claims = await readChildToken(token, this.secret, now());
    if (!claims || claims.sid !== device.sessionId || claims.dev !== device.dev) {
      return null;
    }
    const link = await this.prisma.classSessionChild.findUnique({
      where: { sessionId_childId: { sessionId: device.sessionId, childId: claims.sub } },
      select: {
        child: {
          select: {
            firstName: true,
            lastInitial: true,
            avatarTone: true,
            consentMedia: true,
            fileStatus: true,
          },
        },
      },
    });
    if (!link || !FOLLOWED_STATUSES.includes(link.child.fileStatus)) {
      return null;
    }
    const { fileStatus: _fileStatus, ...child } = link.child;
    return { ...device, childId: claims.sub, ...child };
  }

  async issueDevice(
    response: Response,
    session: { id: string; endsAt: Date },
    dev: string,
  ): Promise<void> {
    const at = now();
    const times = { at, expiresAt: session.endsAt };
    response.cookie(
      DEVICE_COOKIE,
      await signDeviceToken({ sid: session.id, dev }, times, this.secret),
      sessionCookieOptions(times, this.secure),
    );
    this.clearChild(response);
  }

  async issueChild(response: Response, device: DeviceContext, childId: string): Promise<void> {
    const at = now();
    const times = { at, expiresAt: device.endsAt };
    response.cookie(
      CHILD_COOKIE,
      await signChildToken(
        { sub: childId, sid: device.sessionId, dev: device.dev },
        times,
        this.secret,
      ),
      sessionCookieOptions(times, this.secure),
    );
  }

  /** « J'ai fini » : le poste reste ouvert pour l'enfant suivant. */
  clearChild(response: Response): void {
    response.clearCookie(CHILD_COOKIE, this.clearOptions());
  }

  clearAll(response: Response): void {
    this.clearChild(response);
    response.clearCookie(DEVICE_COOKIE, this.clearOptions());
  }

  private clearOptions() {
    return { httpOnly: true, sameSite: "strict", secure: this.secure, path: "/" } as const;
  }
}
