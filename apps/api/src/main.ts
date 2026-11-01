import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { appOptions, configureApp } from "./app.setup.js";

async function bootstrap() {
  // `bodyParser: false` est requis par Better Auth (voir appOptions).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, appOptions);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(app.get(ConfigService).get<number>("PORT", 4000));
}

await bootstrap();
