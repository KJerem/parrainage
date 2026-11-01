import { Controller, Get, Header } from "@nestjs/common";
import { Roles } from "@thallesp/nestjs-better-auth";

/**
 * Sonde réservée au bureau. Elle documente la garde de rôle (`@Roles`, champ `user.role`) :
 * 401 sans session, 403 pour un autre rôle.
 */
@Controller("admin")
@Roles(["bureau"])
export class AdminController {
  @Get("ping")
  @Header("Cache-Control", "no-store")
  ping() {
    return { ok: true };
  }
}
