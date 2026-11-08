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
  Query,
  Res,
} from "@nestjs/common";
import {
  type CallCard,
  type ChooseCallSlot,
  chooseCallSlotSchema,
  type CreateCallRequest,
  createCallRequestSchema,
  type CreateCallSlots,
  createCallSlotsSchema,
  type ParrainCalls,
  type ProposeCallSlots,
  proposeCallSlotsSchema,
  type RelaisCalls,
  type VisioAccess,
  type VisioEvent,
  visioEventSchema,
  type VisioRoom,
} from "@parrainage/contracts";
import { Roles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { z } from "zod";
import { type Actor, loadActor } from "../auth/actor.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { type ParrainCallActor, type RelaisCallActor, CallsService } from "./calls.service.js";
import { VisioService } from "./visio.service.js";

const parrainCallsQuerySchema = z.object({ filleul: z.string().min(1).max(64) });

async function actorOf(prisma: PrismaService, session: UserSession): Promise<Actor> {
  const actor = await loadActor(prisma, session.user);
  if (!actor) {
    throw new ForbiddenException();
  }
  return actor;
}

/** P-Video : créneaux du relais, demande en cours, appels du parrain. */
@Controller("parrain/calls")
@Roles(["parrain"])
export class ParrainCallsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calls: CallsService,
  ) {}

  private async actor(session: UserSession): Promise<ParrainCallActor> {
    const actor = await actorOf(this.prisma, session);
    if (!actor.parrainId) {
      throw new ForbiddenException();
    }
    return { userId: actor.userId, parrainId: actor.parrainId };
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  async overview(
    @Session() session: UserSession,
    @Query({ schema: parrainCallsQuerySchema }) query: z.infer<typeof parrainCallsQuerySchema>,
  ): Promise<ParrainCalls> {
    return this.calls.parrainOverview(await this.actor(session), query.filleul);
  }

  @Post("requests")
  async request(
    @Session() session: UserSession,
    @Body({ schema: createCallRequestSchema }) input: CreateCallRequest,
  ): Promise<CallCard> {
    return this.calls.request(await this.actor(session), input);
  }

  @Post("requests/:id/choose")
  @HttpCode(200)
  async choose(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body({ schema: chooseCallSlotSchema }) input: ChooseCallSlot,
  ): Promise<CallCard> {
    return this.calls.choose(await this.actor(session), id, input);
  }

  @Post("requests/:id/cancel")
  @HttpCode(200)
  async cancel(@Session() session: UserSession, @Param("id") id: string): Promise<CallCard> {
    return this.calls.cancel(await this.actor(session), id);
  }
}

/** Créneaux et demandes d'appel du relais. */
@Controller("relais/calls")
@Roles(["relais"])
export class RelaisCallsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calls: CallsService,
  ) {}

  private async actor(session: UserSession): Promise<RelaisCallActor> {
    const actor = await actorOf(this.prisma, session);
    if (!actor.relaisId) {
      throw new ForbiddenException();
    }
    return { userId: actor.userId, relaisId: actor.relaisId };
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  async overview(@Session() session: UserSession): Promise<RelaisCalls> {
    return this.calls.relaisOverview(await this.actor(session));
  }

  @Post("slots")
  async addSlots(
    @Session() session: UserSession,
    @Body({ schema: createCallSlotsSchema }) input: CreateCallSlots,
  ) {
    return this.calls.addSlots(await this.actor(session), input);
  }

  @Delete("slots/:id")
  @HttpCode(204)
  async removeSlot(@Session() session: UserSession, @Param("id") id: string): Promise<void> {
    await this.calls.removeSlot(await this.actor(session), id);
  }

  @Post("requests/:id/confirm")
  @HttpCode(200)
  async confirm(@Session() session: UserSession, @Param("id") id: string): Promise<CallCard> {
    return this.calls.confirm(await this.actor(session), id);
  }

  @Post("requests/:id/propose")
  @HttpCode(200)
  async propose(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body({ schema: proposeCallSlotsSchema }) input: ProposeCallSlots,
  ): Promise<CallCard> {
    return this.calls.propose(await this.actor(session), id, input);
  }
}

/** Fichier agenda et salle d'un appel : le parrain du binôme et le relais seulement. */
@Controller()
@Roles(["parrain", "relais"])
export class VisioController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calls: CallsService,
    private readonly visio: VisioService,
  ) {}

  @Get("calls/:id/ics")
  @Header("Cache-Control", "private, no-store")
  async ics(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const content = await this.calls.ics(await actorOf(this.prisma, session), id);
    response.setHeader("Content-Type", "text/calendar; charset=utf-8");
    response.setHeader("Content-Disposition", 'attachment; filename="appel-video.ics"');
    return content;
  }

  @Get("visio/:id")
  @Header("Cache-Control", "private, no-store")
  async room(@Session() session: UserSession, @Param("id") id: string): Promise<VisioRoom> {
    return this.visio.room(await actorOf(this.prisma, session), id);
  }

  @Post("visio/:id/token")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async token(@Session() session: UserSession, @Param("id") id: string): Promise<VisioAccess> {
    return this.visio.token(await actorOf(this.prisma, session), id);
  }

  @Post("visio/:id/events")
  @HttpCode(204)
  async event(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body({ schema: visioEventSchema }) input: VisioEvent,
  ): Promise<void> {
    await this.visio.event(await actorOf(this.prisma, session), id, input);
  }
}
