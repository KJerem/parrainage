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
  Put,
  Query,
  Res,
} from "@nestjs/common";
import {
  type AllowChildUpload,
  type AllowChildUploadResult,
  allowChildUploadSchema,
  type AttachBulletin,
  attachBulletinSchema,
  type ChildCodeProposal,
  type ChildCodeReset,
  type CreatedNews,
  type CreateNews,
  createNewsSchema,
  type CreateSchool,
  createSchoolSchema,
  type RelaisChildDetail,
  type RelaisChildList,
  type RelaisHome,
  type RelaisResults,
  type RelaisResultsQuery,
  relaisResultsQuerySchema,
  type ResultRow,
  type SaveChild,
  type SaveChildResult,
  saveChildSchema,
  type SaveResult,
  saveResultSchema,
  type ScheduledNewsList,
  type School,
  type SchoolList,
  type SendResults,
  type SendResultsResult,
  sendResultsSchema,
} from "@parrainage/contracts";
import { Roles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import { type Actor, loadActor } from "../auth/actor.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ChildrenService } from "./children.service.js";
import { NewsService } from "./news.service.js";
import type { RelaisActor } from "./relais-common.js";
import { ResultsService } from "./results.service.js";

/** Espace relais : chaque route est bornée aux enfants de ce relais (les autres répondent 404). */
@Controller("relais")
@Roles(["relais"])
export class RelaisController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly children: ChildrenService,
    private readonly news: NewsService,
    private readonly results: ResultsService,
  ) {}

  // ─── Accueil et enfants ────────────────────────────────────────────────────

  @Get("home")
  @Header("Cache-Control", "private, no-store")
  async home(@Session() session: UserSession): Promise<RelaisHome> {
    const actor = await this.fullActor(session);
    return this.children.home(this.relaisOf(actor), actor);
  }

  @Get("children")
  @Header("Cache-Control", "private, no-store")
  async listChildren(@Session() session: UserSession): Promise<RelaisChildList> {
    return this.children.list(await this.actor(session));
  }

  @Get("child-code")
  @Header("Cache-Control", "private, no-store")
  proposeCode(): ChildCodeProposal {
    return this.children.proposeCode();
  }

  @Post("children")
  async createChild(
    @Session() session: UserSession,
    @Body({ schema: saveChildSchema }) input: SaveChild,
  ): Promise<SaveChildResult> {
    return this.children.create(await this.actor(session), input);
  }

  @Get("children/:id")
  @Header("Cache-Control", "private, no-store")
  async childDetail(
    @Session() session: UserSession,
    @Param("id") id: string,
  ): Promise<RelaisChildDetail> {
    return this.children.detail(await this.actor(session), id);
  }

  @Post("children/:id")
  @HttpCode(200)
  async updateChild(
    @Session() session: UserSession,
    @Param("id") id: string,
    @Body({ schema: saveChildSchema }) input: SaveChild,
  ): Promise<SaveChildResult> {
    return this.children.update(await this.actor(session), id, input);
  }

  @Post("children/:id/code")
  @HttpCode(200)
  async resetCode(
    @Session() session: UserSession,
    @Param("id") id: string,
  ): Promise<ChildCodeReset> {
    return this.children.resetCode(await this.actor(session), id);
  }

  @Get("schools")
  @Header("Cache-Control", "private, no-store")
  async schools(@Session() session: UserSession): Promise<SchoolList> {
    return this.children.schools(await this.actor(session));
  }

  @Post("schools")
  async createSchool(
    @Session() session: UserSession,
    @Body({ schema: createSchoolSchema }) input: CreateSchool,
  ): Promise<School> {
    return this.children.createSchool(await this.actor(session), input);
  }

  // ─── Nouvelles ─────────────────────────────────────────────────────────────

  @Post("news")
  async createNews(
    @Session() session: UserSession,
    @Body({ schema: createNewsSchema }) input: CreateNews,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreatedNews> {
    const { news, replayed } = await this.news.create(await this.actor(session), input);
    if (replayed) {
      res.status(200);
    }
    return news;
  }

  @Get("news/scheduled")
  @Header("Cache-Control", "private, no-store")
  async scheduledNews(@Session() session: UserSession): Promise<ScheduledNewsList> {
    return this.news.scheduled(await this.actor(session));
  }

  @Delete("news/:id")
  @HttpCode(204)
  async cancelNews(@Session() session: UserSession, @Param("id") id: string): Promise<void> {
    await this.news.cancel(await this.actor(session), id);
  }

  // ─── Résultats ─────────────────────────────────────────────────────────────

  @Get("results")
  @Header("Cache-Control", "private, no-store")
  async resultSheet(
    @Session() session: UserSession,
    @Query({ schema: relaisResultsQuerySchema }) query: RelaisResultsQuery,
  ): Promise<RelaisResults> {
    return this.results.sheet(await this.actor(session), query);
  }

  @Put("results/:periodId/:childId")
  async saveResult(
    @Session() session: UserSession,
    @Param("periodId") periodId: string,
    @Param("childId") childId: string,
    @Body({ schema: saveResultSchema }) input: SaveResult,
  ): Promise<ResultRow> {
    return this.results.save(await this.actor(session), periodId, childId, input);
  }

  @Post("results/:periodId/:childId/bulletin")
  @HttpCode(200)
  async attachBulletin(
    @Session() session: UserSession,
    @Param("periodId") periodId: string,
    @Param("childId") childId: string,
    @Body({ schema: attachBulletinSchema }) input: AttachBulletin,
  ): Promise<ResultRow> {
    return this.results.attachBulletin(await this.actor(session), periodId, childId, input.mediaId);
  }

  @Delete("results/:periodId/:childId/bulletin/:mediaId")
  async removeBulletin(
    @Session() session: UserSession,
    @Param("periodId") periodId: string,
    @Param("childId") childId: string,
    @Param("mediaId") mediaId: string,
  ): Promise<ResultRow> {
    return this.results.removeBulletin(await this.actor(session), periodId, childId, mediaId);
  }

  @Post("results/:periodId/send")
  @HttpCode(200)
  async sendResults(
    @Session() session: UserSession,
    @Param("periodId") periodId: string,
    @Body({ schema: sendResultsSchema }) input: SendResults,
  ): Promise<SendResultsResult> {
    return this.results.send(await this.actor(session), periodId, input.schoolId);
  }

  @Post("results/:periodId/child-upload")
  @HttpCode(200)
  async allowChildUpload(
    @Session() session: UserSession,
    @Param("periodId") periodId: string,
    @Body({ schema: allowChildUploadSchema }) input: AllowChildUpload,
  ): Promise<AllowChildUploadResult> {
    return this.results.allowChildUpload(await this.actor(session), periodId, input);
  }

  private async fullActor(session: UserSession): Promise<Actor> {
    const actor = await loadActor(this.prisma, session.user);
    if (!actor) {
      throw new ForbiddenException();
    }
    return actor;
  }

  private relaisOf(actor: Actor): RelaisActor {
    if (actor.relaisId === null) {
      throw new ForbiddenException();
    }
    return { userId: actor.userId, relaisId: actor.relaisId };
  }

  private async actor(session: UserSession): Promise<RelaisActor> {
    return this.relaisOf(await this.fullActor(session));
  }
}
