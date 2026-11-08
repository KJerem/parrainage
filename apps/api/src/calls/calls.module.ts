import { Module } from "@nestjs/common";
import { MessagingModule } from "../messaging/messaging.module.js";
import {
  ParrainCallsController,
  RelaisCallsController,
  VisioController,
} from "./calls.controller.js";
import { CallsService } from "./calls.service.js";
import { VisioService } from "./visio.service.js";

@Module({
  imports: [MessagingModule],
  controllers: [ParrainCallsController, RelaisCallsController, VisioController],
  providers: [CallsService, VisioService],
})
export class CallsModule {}
