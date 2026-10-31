import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.js";
import { HealthModule } from "./health/health.module.js";
import { MailModule } from "./mail/mail.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { StorageModule } from "./storage/storage.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    PrismaModule,
    StorageModule,
    MailModule,
    HealthModule,
  ],
})
export class AppModule {}
