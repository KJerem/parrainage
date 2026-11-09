import { Body, Controller, Get, Header, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type BureauChild,
  type BureauOverview,
  type BureauParrain,
  type BureauParrains,
  bureauParrainsQuerySchema,
  type BureauSponsorships,
  type BureauSponsorshipsQuery,
  bureauSponsorshipsQuerySchema,
  type CreatedSponsorship,
  type CreateSponsorship,
  createSponsorshipSchema,
  type InviteParrain,
  inviteParrainSchema,
  type NewSponsorship,
  newSponsorshipQuerySchema,
  type ParrainCandidates,
  type ParrainCandidatesQuery,
  parrainCandidatesQuerySchema,
} from "@parrainage/contracts";
import { Roles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { z } from "zod";
import { BureauChildrenService } from "./children.service.js";
import { BureauParrainsService } from "./parrains.service.js";
import { BureauSponsorshipsService } from "./sponsorships.service.js";

/** Espace bureau : vue d'ensemble, binômes (B-Binomes), parrains, dossiers d'enfants. */
@Controller("bureau")
@Roles(["bureau"])
export class BureauController {
  constructor(
    private readonly sponsorships: BureauSponsorshipsService,
    private readonly parrains: BureauParrainsService,
    private readonly children: BureauChildrenService,
  ) {}

  @Get("overview")
  @Header("Cache-Control", "private, no-store")
  overview(): Promise<BureauOverview> {
    return this.sponsorships.overview();
  }

  @Get("sponsorships")
  @Header("Cache-Control", "private, no-store")
  list(
    @Query({ schema: bureauSponsorshipsQuerySchema }) query: BureauSponsorshipsQuery,
  ): Promise<BureauSponsorships> {
    return this.sponsorships.list(query);
  }

  @Get("sponsorships/new")
  @Header("Cache-Control", "private, no-store")
  newSponsorship(
    @Query({ schema: newSponsorshipQuerySchema })
    query: z.infer<typeof newSponsorshipQuerySchema>,
  ): Promise<NewSponsorship> {
    return this.sponsorships.newSponsorship(query.enfant);
  }

  @Post("sponsorships")
  create(
    @Session() session: UserSession,
    @Body({ schema: createSponsorshipSchema }) input: CreateSponsorship,
  ): Promise<CreatedSponsorship> {
    return this.sponsorships.create({ userId: session.user.id }, input);
  }

  @Get("parrains")
  @Header("Cache-Control", "private, no-store")
  parrainList(
    @Query({ schema: bureauParrainsQuerySchema })
    query: z.output<typeof bureauParrainsQuerySchema>,
  ): Promise<BureauParrains> {
    return this.parrains.list(query.q);
  }

  @Get("parrains/candidates")
  @Header("Cache-Control", "private, no-store")
  candidates(
    @Query({ schema: parrainCandidatesQuerySchema }) query: ParrainCandidatesQuery,
  ): Promise<ParrainCandidates> {
    return this.sponsorships.candidates(query);
  }

  @Post("parrains")
  invite(
    @Session() session: UserSession,
    @Body({ schema: inviteParrainSchema }) input: InviteParrain,
  ): Promise<BureauParrain> {
    return this.parrains.invite({ userId: session.user.id }, input);
  }

  @Get("children/:id")
  @Header("Cache-Control", "private, no-store")
  child(@Param("id") id: string): Promise<BureauChild> {
    return this.children.dossier(id);
  }

  @Post("children/:id/validate")
  @HttpCode(200)
  validate(@Session() session: UserSession, @Param("id") id: string): Promise<BureauChild> {
    return this.children.validate({ userId: session.user.id }, id);
  }
}
