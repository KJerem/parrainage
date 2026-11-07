import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  type OpenClassSession,
  openClassSessionSchema,
  type OpenedClassSession,
  type PlanClassSession,
  planClassSessionSchema,
  type PlannedClassSession,
  type RelaisSessions,
} from "@parrainage/contracts";
import { Roles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import { loadActor } from "../auth/actor.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { RelaisActor } from "../relais/relais-common.js";
import { ChildSessionService } from "./child-session.service.js";
import { ClassSessionsService } from "./class-sessions.service.js";

/** Cookies de la session d'adulte, avec leur préfixe en HTTPS. */
const AUTH_COOKIE = /^(__Secure-|__Host-)?better-auth\./;

/** RW-Session : planifier, ouvrir, suivre et fermer une session élève. */
@Controller("relais/sessions")
@Roles(["relais"])
export class ClassSessionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: ClassSessionsService,
    private readonly childSessions: ChildSessionService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(@Session() session: UserSession): Promise<RelaisSessions> {
    return this.sessions.list(await this.actor(session));
  }

  @Post()
  async plan(
    @Session() session: UserSession,
    @Body({ schema: planClassSessionSchema }) input: PlanClassSession,
  ): Promise<PlannedClassSession> {
    return this.sessions.plan(await this.actor(session), input);
  }

  @Delete(":id")
  @HttpCode(204)
  async removePlanned(@Session() session: UserSession, @Param("id") id: string): Promise<void> {
    await this.sessions.removePlanned(await this.actor(session), id);
  }

  /**
   * Le poste reçoit son cookie et le relais en est déconnecté, côté serveur et dans le navigateur :
   * un enfant ne doit jamais se retrouver sur un poste où un adulte est encore connecté.
   */
  @Post("open")
  @Header("Cache-Control", "no-store")
  async open(
    @Session() session: UserSession,
    @Body({ schema: openClassSessionSchema }) input: OpenClassSession,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OpenedClassSession> {
    const opened = await this.sessions.open(await this.actor(session), input);
    await this.childSessions.issueDevice(response, opened, opened.dev);
    await this.sessions.signOutAdult(session.session.id);
    for (const name of Object.keys((request.cookies ?? {}) as Record<string, unknown>)) {
      if (AUTH_COOKIE.test(name)) {
        response.clearCookie(name, { path: "/", secure: name.startsWith("__") });
      }
    }
    return { id: opened.id, endsAt: opened.endsAt.toISOString() };
  }

  /** Fermée ici ou depuis un autre appareil : les enfants sortent dès leur prochaine requête. */
  @Post(":id/close")
  @HttpCode(204)
  async close(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.close(await this.actor(session), id);
    this.childSessions.clearAll(response);
  }

  @Post(":id/children/:childId/unlock")
  @HttpCode(204)
  async unlock(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Param("childId") childId: string,
  ): Promise<void> {
    await this.sessions.unlock(await this.actor(session), id, childId);
  }

  @Post(":id/resume")
  @HttpCode(204)
  async resume(@Session() session: UserSession, @Param("id") id: string): Promise<void> {
    await this.sessions.resume(await this.actor(session), id);
  }

  private async actor(session: UserSession): Promise<RelaisActor> {
    const actor = await loadActor(this.prisma, session.user);
    if (!actor?.relaisId) {
      throw new ForbiddenException();
    }
    return { userId: actor.userId, relaisId: actor.relaisId };
  }
}
