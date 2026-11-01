import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { AdminModule } from "./admin/admin.module.js";
import { auth } from "./auth/auth.js";
import { validateEnv } from "./config/env.js";
import { HealthModule } from "./health/health.module.js";
import { MailModule } from "./mail/mail.module.js";
import { MediaModule } from "./media/media.module.js";
import { MeModule } from "./me/me.module.js";
import { ParrainModule } from "./parrain/parrain.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { StorageModule } from "./storage/storage.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    // Monte Better Auth sur /api/auth et enregistre une garde globale : toute route exige une
    // session, sauf @AllowAnonymous() / @OptionalAuth(). Rôles : @Roles(["bureau"]).
    AuthModule.forRoot({
      auth,
      bodyParser: {
        json: { limit: "2mb" },
        urlencoded: { limit: "2mb", extended: true },
      },
    }),
    PrismaModule,
    StorageModule,
    MailModule,
    HealthModule,
    MeModule,
    AdminModule,
    MediaModule,
    ParrainModule,
  ],
})
export class AppModule {}
