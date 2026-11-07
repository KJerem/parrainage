import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Redirect,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  type CreateUpload,
  createUploadSchema,
  type EleveHome,
  type EleveLogin,
  type EleveLoginResult,
  eleveLoginSchema,
  type EleveMessages,
  type EleveSendMessage,
  eleveSendMessageSchema,
  type EleveSentMessage,
  type EleveSentSummary,
  type EleveSession,
  type UploadedMedia,
  type UploadParts,
  type UploadTicket,
} from "@parrainage/contracts";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import { CHILD_COOKIE } from "./child-session.js";
import {
  type ChildContext,
  ChildSessionService,
  type DeviceContext,
} from "./child-session.service.js";
import { EleveService } from "./eleve.service.js";
import { ChildGuard, CurrentChild, CurrentDevice, DeviceGuard } from "./guards.js";

/**
 * Espace enfant : hors Better Auth, ses propres gardes vérifient les cookies du poste et de
 * l'enfant à chaque requête (401 sinon). Rien n'y est mis en cache.
 */
@Controller("eleve")
@AllowAnonymous()
export class EleveController {
  constructor(
    private readonly eleve: EleveService,
    private readonly sessions: ChildSessionService,
  ) {}

  // ─── Poste ──────────────────────────────────────────────────────────────────

  @Get("session")
  @UseGuards(DeviceGuard)
  @Header("Cache-Control", "private, no-store")
  session(@CurrentDevice() device: DeviceContext): Promise<EleveSession> {
    return this.eleve.session(device);
  }

  @Post("login")
  @HttpCode(200)
  @UseGuards(DeviceGuard)
  @Header("Cache-Control", "private, no-store")
  login(
    @CurrentDevice() device: DeviceContext,
    @Body({ schema: eleveLoginSchema }) input: EleveLogin,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EleveLoginResult> {
    return this.eleve.login(device, input, response);
  }

  /** « J'ai fini » : l'enfant part, le poste reste ouvert pour le suivant. */
  @Post("logout")
  @HttpCode(204)
  @Header("Cache-Control", "private, no-store")
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): void {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    if (!cookies?.[CHILD_COOKIE]) {
      throw new UnauthorizedException();
    }
    this.sessions.clearChild(response);
  }

  @Get("avatars/:childId")
  @UseGuards(DeviceGuard)
  @Header("Cache-Control", "private, no-store")
  @Redirect()
  async avatar(
    @CurrentDevice() device: DeviceContext,
    @Param("childId") childId: string,
  ): Promise<{ url: string; statusCode: number }> {
    return { url: await this.eleve.avatarUrl(device, childId), statusCode: 302 };
  }

  // ─── Enfant connecté ────────────────────────────────────────────────────────

  @Get("me")
  @UseGuards(ChildGuard)
  @Header("Cache-Control", "private, no-store")
  me(@CurrentChild() child: ChildContext): Promise<EleveHome> {
    return this.eleve.home(child);
  }

  @Get("conversations/:id/messages")
  @UseGuards(ChildGuard)
  @Header("Cache-Control", "private, no-store")
  messages(@CurrentChild() child: ChildContext, @Param("id") id: string): Promise<EleveMessages> {
    return this.eleve.messages(child, id);
  }

  @Post("conversations/:id/messages")
  @UseGuards(ChildGuard)
  @Header("Cache-Control", "private, no-store")
  send(
    @CurrentChild() child: ChildContext,
    @Param("id") id: string,
    @Body({ schema: eleveSendMessageSchema }) input: EleveSendMessage,
  ): Promise<EleveSentMessage> {
    return this.eleve.send(child, id, input);
  }

  @Post("conversations/:id/read")
  @HttpCode(204)
  @UseGuards(ChildGuard)
  @Header("Cache-Control", "private, no-store")
  read(@CurrentChild() child: ChildContext, @Param("id") id: string): Promise<void> {
    return this.eleve.markRead(child, id);
  }

  @Get("messages/:id")
  @UseGuards(ChildGuard)
  @Header("Cache-Control", "private, no-store")
  sent(@CurrentChild() child: ChildContext, @Param("id") id: string): Promise<EleveSentSummary> {
    return this.eleve.sent(child, id);
  }

  @Get("media/:id")
  @UseGuards(ChildGuard)
  @Header("Cache-Control", "private, no-store")
  @Redirect()
  async media(
    @CurrentChild() child: ChildContext,
    @Param("id") id: string,
  ): Promise<{ url: string; statusCode: number }> {
    return { url: await this.eleve.mediaUrl(child, id), statusCode: 302 };
  }

  @Post("uploads")
  @UseGuards(ChildGuard)
  @Header("Cache-Control", "no-store")
  createUpload(
    @CurrentChild() child: ChildContext,
    @Body({ schema: createUploadSchema }) input: CreateUpload,
  ): Promise<UploadTicket> {
    return this.eleve.createUpload(child, input);
  }

  @Get("uploads/:id/parts")
  @UseGuards(ChildGuard)
  @Header("Cache-Control", "no-store")
  uploadParts(@CurrentChild() child: ChildContext, @Param("id") id: string): Promise<UploadParts> {
    return this.eleve.uploadParts(child, id);
  }

  @Post("uploads/:id/complete")
  @HttpCode(200)
  @UseGuards(ChildGuard)
  @Header("Cache-Control", "no-store")
  completeUpload(
    @CurrentChild() child: ChildContext,
    @Param("id") id: string,
  ): Promise<UploadedMedia> {
    return this.eleve.completeUpload(child, id);
  }
}
