import { Module } from "@nestjs/common";
import { ModerationController, RelaisModerationController } from "./moderation.controller.js";
import { ModerationService } from "./moderation.service.js";

@Module({
  controllers: [ModerationController, RelaisModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
