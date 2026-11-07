import { Module } from "@nestjs/common";
import { UploadsCleanupService } from "./cleanup.js";
import { UploadsController } from "./uploads.controller.js";
import { UploadsService } from "./uploads.service.js";

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, UploadsCleanupService],
  exports: [UploadsCleanupService, UploadsService],
})
export class UploadsModule {}
