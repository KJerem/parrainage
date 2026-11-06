import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
} from "@nestjs/common";
import {
  type CreateUpload,
  createUploadSchema,
  type UploadedMedia,
  type UploadParts,
  type UploadTicket,
} from "@parrainage/contracts";
import { Roles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { type Actor, loadActor } from "../auth/actor.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UploadsService } from "./uploads.service.js";

/**
 * Envoi d'un fichier joint à un message : POST /api/uploads (URL présignées), dépôt direct
 * dans le stockage par le navigateur, puis POST /api/uploads/:id/complete.
 */
@Controller("uploads")
@Roles(["parrain", "relais"])
export class UploadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  @Post()
  @Header("Cache-Control", "no-store")
  async create(
    @Session() session: UserSession,
    @Body({ schema: createUploadSchema }) body: CreateUpload,
  ): Promise<UploadTicket> {
    return this.uploads.create(await this.actor(session), body);
  }

  @Get(":id/parts")
  @Header("Cache-Control", "no-store")
  async parts(@Session() session: UserSession, @Param("id") id: string): Promise<UploadParts> {
    return this.uploads.parts(await this.actor(session), id);
  }

  @Post(":id/complete")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async complete(@Session() session: UserSession, @Param("id") id: string): Promise<UploadedMedia> {
    return this.uploads.complete(await this.actor(session), id);
  }

  private async actor(session: UserSession): Promise<Actor> {
    const actor = await loadActor(this.prisma, session.user);
    if (!actor) {
      throw new ForbiddenException();
    }
    return actor;
  }
}
