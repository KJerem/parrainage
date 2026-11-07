import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  type ModerationDecision,
  type ModerationDecisionResult,
  moderationDecisionSchema,
  type ModerationDetail,
  type ModerationFlag,
  type ModerationFlagResult,
  moderationFlagSchema,
  type ModerationQueue,
  type ModerationQueueQuery,
  moderationQueueQuerySchema,
  type ModerationSummary,
} from "@parrainage/contracts";
import { Roles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { loadActor } from "../auth/actor.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ModerationService } from "./moderation.service.js";

/**
 * File de modération du bureau. Message inconnu ou hors du champ de la modération : 404 ; message
 * déjà traité (décision concurrente) : 409.
 */
@Controller("moderation")
@Roles(["bureau"])
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get("summary")
  @Header("Cache-Control", "private, no-store")
  summary(): Promise<ModerationSummary> {
    return this.moderation.summary();
  }

  @Get("queue")
  @Header("Cache-Control", "private, no-store")
  queue(
    @Query({ schema: moderationQueueQuerySchema }) query: ModerationQueueQuery,
  ): Promise<ModerationQueue> {
    return this.moderation.queue(query.filtre);
  }

  @Get("messages/:id")
  @Header("Cache-Control", "private, no-store")
  detail(@Param("id") id: string): Promise<ModerationDetail> {
    return this.moderation.detail(id);
  }

  @Post("messages/:id/decision")
  @HttpCode(200)
  decide(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body({ schema: moderationDecisionSchema }) input: ModerationDecision,
  ): Promise<ModerationDecisionResult> {
    return this.moderation.decide(session.user.id, id, input);
  }

  @Post("messages/:id/flag")
  @HttpCode(200)
  flag(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body({ schema: moderationFlagSchema }) input: ModerationFlag,
  ): Promise<ModerationFlagResult> {
    return this.moderation.flag(session.user.id, id, input);
  }
}

/** Signalement par le relais, depuis la conversation d'un de ses enfants (onglet « Enfants »). */
@Controller("relais/messages")
@Roles(["relais"])
export class RelaisModerationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
  ) {}

  @Post(":id/flag")
  @HttpCode(200)
  async flag(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body({ schema: moderationFlagSchema }) input: ModerationFlag,
  ): Promise<ModerationFlagResult> {
    const actor = await loadActor(this.prisma, session.user);
    if (!actor?.relaisId) {
      throw new ForbiddenException();
    }
    return this.moderation.flagAsRelais(
      { userId: actor.userId, relaisId: actor.relaisId },
      id,
      input,
    );
  }
}
