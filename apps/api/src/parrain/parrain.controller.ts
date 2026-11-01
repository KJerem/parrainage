import { Controller, Get, Header, Param, Query } from "@nestjs/common";
import {
  feedQuerySchema,
  type BulletinList,
  type FeedPage,
  type FeedQuery,
  type FilleulDashboard,
  type FilleulList,
} from "@parrainage/contracts";
import { Roles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { ParrainService } from "./parrain.service.js";

/** Espace parrain « Mes filleuls ». Un enfant hors de ses binômes actifs : 404. */
@Controller("parrain/filleuls")
@Roles(["parrain"])
export class ParrainController {
  constructor(private readonly parrain: ParrainService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@Session() session: UserSession): Promise<FilleulList> {
    return this.parrain.listFilleuls(session.user.id);
  }

  @Get(":childId")
  @Header("Cache-Control", "private, no-store")
  dashboard(
    @Session() session: UserSession,
    @Param("childId") childId: string,
  ): Promise<FilleulDashboard> {
    return this.parrain.dashboard(session.user.id, childId);
  }

  @Get(":childId/nouvelles")
  @Header("Cache-Control", "private, no-store")
  feed(
    @Session() session: UserSession,
    @Param("childId") childId: string,
    @Query({ schema: feedQuerySchema }) query: FeedQuery,
  ): Promise<FeedPage> {
    return this.parrain.feed(session.user.id, childId, query);
  }

  @Get(":childId/bulletins")
  @Header("Cache-Control", "private, no-store")
  bulletins(
    @Session() session: UserSession,
    @Param("childId") childId: string,
  ): Promise<BulletinList> {
    return this.parrain.bulletins(session.user.id, childId);
  }
}
