import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { RelaisModule } from "../relais/relais.module.js";
import { UploadsModule } from "../uploads/uploads.module.js";
import { SchedulerService } from "./scheduler.service.js";

@Module({
  // forRoot une seule fois dans l'application : chaque appel réenregistrerait les tâches.
  imports: [ScheduleModule.forRoot(), RelaisModule, UploadsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
