import { Module } from "@nestjs/common";
import { MessagingModule } from "../messaging/messaging.module.js";
import { ChildrenService } from "./children.service.js";
import { NewsService } from "./news.service.js";
import { RelaisController } from "./relais.controller.js";
import { ResultsService } from "./results.service.js";

@Module({
  imports: [MessagingModule],
  controllers: [RelaisController],
  providers: [ChildrenService, NewsService, ResultsService],
  exports: [NewsService],
})
export class RelaisModule {}
