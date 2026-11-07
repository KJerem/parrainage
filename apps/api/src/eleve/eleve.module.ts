import { Module } from "@nestjs/common";
import { UploadsModule } from "../uploads/uploads.module.js";
import { ChildSessionService } from "./child-session.service.js";
import { ClassSessionsController } from "./class-sessions.controller.js";
import { ClassSessionsService } from "./class-sessions.service.js";
import { EleveController } from "./eleve.controller.js";
import { EleveService } from "./eleve.service.js";
import { ChildGuard, DeviceGuard } from "./guards.js";

@Module({
  imports: [UploadsModule],
  controllers: [ClassSessionsController, EleveController],
  providers: [ChildSessionService, ClassSessionsService, EleveService, ChildGuard, DeviceGuard],
})
export class EleveModule {}
