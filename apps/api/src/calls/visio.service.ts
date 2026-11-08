import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  callWindow,
  type VisioAccess,
  visioAccessSchema,
  type VisioEvent,
  type VisioRoom,
  visioRoomSchema,
  type VisioState,
} from "@parrainage/contracts";
import { importPKCS8, SignJWT } from "jose";
import type { Actor } from "../auth/actor.js";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toVideoCall, videoCallSelect } from "./calls-common.js";

const NOT_FOUND = "Cet appel n'existe pas ou n'est pas le vôtre";

/** Fonctions de la salle coupées dans le jeton JaaS : ni enregistrement, ni diffusion, ni appel sortant. */
const DISABLED_FEATURES = {
  livestreaming: "false",
  recording: "false",
  transcription: "false",
  "outbound-call": "false",
  "sip-outbound-call": "false",
} as const;

export interface JaasConfig {
  appId: string;
  keyId: string;
  privateKey: string;
}

/**
 * Jeton JaaS (RS256) limité à une salle et à la fenêtre de l'appel. Seul le relais est
 * modérateur. `expiresAt` suit l'horloge réelle : c'est elle que vérifie 8x8.
 */
export async function jaasToken(
  config: JaasConfig,
  claims: { roomName: string; userId: string; name: string; moderator: boolean; expiresAt: Date },
): Promise<string> {
  const key = await importPKCS8(config.privateKey.replaceAll("\\n", "\n"), "RS256");
  return new SignJWT({
    room: claims.roomName,
    context: {
      user: {
        id: claims.userId,
        name: claims.name,
        moderator: claims.moderator ? "true" : "false",
      },
      features: DISABLED_FEATURES,
    },
  })
    .setProtectedHeader({ alg: "RS256", kid: config.keyId, typ: "JWT" })
    .setAudience("jitsi")
    .setIssuer("chat")
    .setSubject(config.appId)
    .setNotBefore(Math.floor(Date.now() / 1000) - 10)
    .setExpirationTime(claims.expiresAt)
    .sign(key);
}

/** État de la salle à l'instant `at`. */
export function visioState(
  call: {
    startsAt: Date;
    durationMinutes: number;
    status: string;
    joinedRelaisAt: Date | null;
  },
  role: "parrain" | "relais",
  at: Date,
  earlyMinutes: number,
): VisioState {
  const { opensAt, closesAt } = callWindow(call.startsAt, call.durationMinutes, earlyMinutes);
  if (call.status !== "SCHEDULED" || at >= closesAt) {
    return "closed";
  }
  if (at < opensAt) {
    return "early";
  }
  // Le parrain n'entre qu'après le relais : l'enfant n'est jamais seul avec un adulte.
  return role === "parrain" && !call.joinedRelaisAt ? "waiting" : "open";
}

const STATE_MESSAGES: Readonly<Record<Exclude<VisioState, "open">, string>> = {
  early: "La salle n'est pas encore ouverte",
  waiting: "Le relais n'est pas encore arrivé : la salle s'ouvre dès son arrivée",
  closed: "Cet appel est terminé",
};

/**
 * Salle d'un appel : réservée au parrain du binôme et au relais, pendant la fenêtre de l'appel.
 * VISIO_PROVIDER=jaas donne une salle 8x8.vc intégrée ; « link », un lien vers une salle publique
 * au nom imprévisible (tests et repli).
 */
@Injectable()
export class VisioService {
  private readonly provider: Env["VISIO_PROVIDER"];
  private readonly linkBase: string;
  private readonly jaas: JaasConfig;
  private readonly earlyMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.provider = config.get("VISIO_PROVIDER", { infer: true });
    this.linkBase = config.get("VISIO_LINK_BASE", { infer: true });
    this.jaas = {
      appId: config.get("JAAS_APP_ID", { infer: true }),
      keyId: config.get("JAAS_API_KEY_ID", { infer: true }),
      privateKey: config.get("JAAS_PRIVATE_KEY", { infer: true }),
    };
    this.earlyMinutes = config.get("VISIO_JOIN_EARLY_MINUTES", { infer: true });
  }

  private roleOf(actor: Actor): "parrain" | "relais" {
    if (actor.role === "parrain" && actor.parrainId) {
      return "parrain";
    }
    if (actor.role === "relais" && actor.relaisId) {
      return "relais";
    }
    throw new AppError(404, NOT_FOUND);
  }

  private async load(actor: Actor, callId: string) {
    const role = this.roleOf(actor);
    const call = await this.prisma.videoCall.findFirst({
      where: {
        id: callId,
        ...(role === "parrain"
          ? { sponsorship: { parrainId: actor.parrainId!, status: "ACTIVE" } }
          : { relaisId: actor.relaisId! }),
      },
      select: { ...videoCallSelect, roomName: true, joinedParrainAt: true },
    });
    if (!call) {
      throw new AppError(404, NOT_FOUND);
    }
    return { call, role };
  }

  async room(actor: Actor, callId: string): Promise<VisioRoom> {
    const at = now();
    const { call, role } = await this.load(actor, callId);
    return visioRoomSchema.parse({
      call: toVideoCall(call, this.earlyMinutes),
      role,
      state: visioState(call, role, at, this.earlyMinutes),
      now: at.toISOString(),
    });
  }

  /** De quoi entrer dans la salle ; l'arrivée du relais ouvre la salle au parrain. */
  async token(actor: Actor, callId: string): Promise<VisioAccess> {
    const at = now();
    const { call, role } = await this.load(actor, callId);
    const state = visioState(call, role, at, this.earlyMinutes);
    if (state !== "open") {
      throw new AppError(409, STATE_MESSAGES[state]);
    }
    await this.prisma.videoCall.updateMany({
      where: {
        id: call.id,
        ...(role === "relais" ? { joinedRelaisAt: null } : { joinedParrainAt: null }),
      },
      data: role === "relais" ? { joinedRelaisAt: at } : { joinedParrainAt: at },
    });
    if (this.provider === "link") {
      return visioAccessSchema.parse({
        provider: "link",
        url: `${this.linkBase.replace(/\/+$/, "")}/${call.roomName}`,
      });
    }
    const { closesAt } = callWindow(call.startsAt, call.durationMinutes, this.earlyMinutes);
    // Durée restante selon l'horloge de l'application, rapportée à l'horloge réelle.
    const expiresAt = new Date(Date.now() + Math.max(60_000, closesAt.getTime() - at.getTime()));
    return visioAccessSchema.parse({
      provider: "jaas",
      appId: this.jaas.appId,
      roomName: call.roomName,
      jwt: await jaasToken(this.jaas, {
        roomName: call.roomName,
        userId: actor.userId,
        name: role === "relais" ? call.relais.displayName : call.sponsorship.parrain.displayName,
        moderator: role === "relais",
        expiresAt,
      }),
    });
  }

  /** Arrivée ou départ, signalés par la salle intégrée : la durée réelle des appels passés. */
  async event(actor: Actor, callId: string, event: VisioEvent): Promise<void> {
    const at = now();
    const { call, role } = await this.load(actor, callId);
    if (event.type === "joined") {
      await this.prisma.videoCall.updateMany({
        where: {
          id: call.id,
          ...(role === "relais" ? { joinedRelaisAt: null } : { joinedParrainAt: null }),
        },
        data: role === "relais" ? { joinedRelaisAt: at } : { joinedParrainAt: at },
      });
      return;
    }
    if (role === "relais" && call.joinedRelaisAt) {
      await this.prisma.videoCall.update({ where: { id: call.id }, data: { endedAt: at } });
    }
  }
}
