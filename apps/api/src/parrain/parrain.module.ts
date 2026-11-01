import { Module } from "@nestjs/common";
import { ParrainController } from "./parrain.controller.js";
import { ParrainService } from "./parrain.service.js";

@Module({
  controllers: [ParrainController],
  providers: [ParrainService],
})
export class ParrainModule {}
