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
  Res,
} from "@nestjs/common";
import {
  type ContactList,
  type ConversationDetail,
  type ConversationList,
  type ConversationListQuery,
  conversationListQuerySchema,
  type ConversationMessage,
  type ConversationSummary,
  type MessagePage,
  type MessagePageQuery,
  messagePageQuerySchema,
  type SendEncouragement,
  sendEncouragementSchema,
  type SendMessage,
  sendMessageSchema,
  type StartConversation,
  startConversationSchema,
  type UnreadCount,
} from "@parrainage/contracts";
import { Roles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { type Actor, loadActor } from "../auth/actor.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { MessagingService } from "./messaging.service.js";

/**
 * Messagerie des parrains et des relais. Conversation inaccessible : 404. Un rejeu (même clé
 * d'idempotence) ou une conversation retrouvée répondent 200 au lieu de 201.
 */
@Controller("conversations")
@Roles(["parrain", "relais"])
export class MessagingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(
    @Session() session: UserSession,
    @Query({ schema: conversationListQuerySchema }) query: ConversationListQuery,
  ): Promise<ConversationList> {
    return this.messaging.list(await this.actor(session), query);
  }

  @Get("unread-count")
  @Header("Cache-Control", "private, no-store")
  async unreadCount(@Session() session: UserSession): Promise<UnreadCount> {
    return this.messaging.unreadTotal(await this.actor(session));
  }

  @Get("contacts")
  @Header("Cache-Control", "private, no-store")
  async contacts(@Session() session: UserSession): Promise<ContactList> {
    return this.messaging.contacts(await this.actor(session));
  }

  @Post()
  @Header("Cache-Control", "no-store")
  async start(
    @Session() session: UserSession,
    @Body({ schema: startConversationSchema }) body: StartConversation,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConversationSummary> {
    const { conversation, created } = await this.messaging.start(await this.actor(session), body);
    res.status(created ? 201 : 200);
    return conversation;
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  async detail(
    @Session() session: UserSession,
    @Param("id") id: string,
  ): Promise<ConversationDetail> {
    return this.messaging.detail(await this.actor(session), id);
  }

  @Get(":id/messages")
  @Header("Cache-Control", "private, no-store")
  async messages(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Query({ schema: messagePageQuerySchema }) query: MessagePageQuery,
  ): Promise<MessagePage> {
    return this.messaging.messages(await this.actor(session), id, query);
  }

  @Post(":id/messages")
  @Header("Cache-Control", "no-store")
  async send(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body({ schema: sendMessageSchema }) body: SendMessage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConversationMessage> {
    const { message, replayed } = await this.messaging.send(await this.actor(session), id, body);
    res.status(replayed ? 200 : 201);
    return message;
  }

  @Post(":id/encouragement")
  @Header("Cache-Control", "no-store")
  async encourage(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body({ schema: sendEncouragementSchema }) body: SendEncouragement,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConversationMessage> {
    const { message, replayed } = await this.messaging.encourage(
      await this.actor(session),
      id,
      body,
    );
    res.status(replayed ? 200 : 201);
    return message;
  }

  @Post(":id/read")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async read(@Session() session: UserSession, @Param("id") id: string): Promise<UnreadCount> {
    return this.messaging.markRead(await this.actor(session), id);
  }

  private async actor(session: UserSession): Promise<Actor> {
    const actor = await loadActor(this.prisma, session.user);
    if (!actor) {
      throw new ForbiddenException();
    }
    return actor;
  }
}
