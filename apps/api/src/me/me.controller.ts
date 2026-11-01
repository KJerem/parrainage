import { Controller, Get, Header } from "@nestjs/common";
import type { Me } from "@parrainage/contracts";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { MeService } from "./me.service.js";

/** Utilisateur connecté (tout rôle) : identité et profil métier pour les coquilles du web. */
@Controller("me")
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  get(@Session() session: UserSession): Promise<Me> {
    return this.me.get(session.user.id);
  }
}
