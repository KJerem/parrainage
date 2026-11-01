import { Controller, Get, Header, NotFoundException, Param, Query, Redirect } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { z } from "zod";
import { loadActor } from "../auth/actor.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { MediaService } from "./media.service.js";

const mediaQuerySchema = z
  .object({ download: z.literal("1").optional() })
  .transform((query) => ({ download: query.download === "1" }));

/**
 * Lecture d'un média, pour tout adulte connecté : redirection 302 vers une URL présignée de
 * 120 s si `canViewMedia` l'autorise, sinon 404 (inconnu ou interdit, même réponse).
 */
@Controller("media")
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @Redirect()
  async get(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Query({ schema: mediaQuerySchema }) query: z.output<typeof mediaQuerySchema>,
  ): Promise<{ url: string; statusCode: number }> {
    const actor = await loadActor(this.prisma, session.user);
    if (!actor) {
      throw new NotFoundException();
    }
    return { url: await this.media.signedUrl(actor, id, query), statusCode: 302 };
  }
}
