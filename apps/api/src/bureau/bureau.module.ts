import { Module } from "@nestjs/common";
import { BureauController } from "./bureau.controller.js";
import { BureauChildrenService } from "./children.service.js";
import { BureauParrainsService } from "./parrains.service.js";
import { BureauSponsorshipsService } from "./sponsorships.service.js";

@Module({
  controllers: [BureauController],
  providers: [BureauSponsorshipsService, BureauParrainsService, BureauChildrenService],
})
export class BureauModule {}
